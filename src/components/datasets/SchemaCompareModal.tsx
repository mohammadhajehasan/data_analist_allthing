import React, { useState, useMemo } from 'react';
import { Dataset, DatasetColumn } from '../../types';
import { useApp } from '../../context/AppContext';
import {
  Layers,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Download,
  X,
  Search,
  Filter,
  ArrowRightLeft,
  Database,
  ShieldCheck,
  FileCode,
  Sparkles,
  Info,
  Check,
} from 'lucide-react';

interface SchemaCompareModalProps {
  datasets: Dataset[];
  isOpen: boolean;
  onClose: () => void;
}

interface ColumnComparisonRow {
  name: string;
  typesByDataset: Record<string, DatasetColumn['type'] | undefined>;
  status: 'EXACT_MATCH' | 'TYPE_MISMATCH' | 'PARTIAL_PRESENCE';
  presentInCount: number;
  sampleValuesByDataset: Record<string, any[]>;
}

export const SchemaCompareModal: React.FC<SchemaCompareModalProps> = ({ datasets, isOpen, onClose }) => {
  const { language, toast } = useApp();
  const isAr = language === 'ar';

  const [activeTab, setActiveTab] = useState<'all' | 'match' | 'conflict' | 'unique'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  if (!isOpen || datasets.length < 2) return null;

  // Compute union of all column names and comparison rows
  const comparisonData = useMemo(() => {
    const allColNamesMap = new Map<string, ColumnComparisonRow>();

    datasets.forEach(ds => {
      ds.columns.forEach(col => {
        const lowerName = col.name.toLowerCase();
        if (!allColNamesMap.has(lowerName)) {
          allColNamesMap.set(lowerName, {
            name: col.name,
            typesByDataset: {},
            status: 'EXACT_MATCH',
            presentInCount: 0,
            sampleValuesByDataset: {},
          });
        }

        const entry = allColNamesMap.get(lowerName)!;
        entry.typesByDataset[ds.id] = col.type;
        entry.sampleValuesByDataset[ds.id] = col.sampleValues || [];
        entry.presentInCount += 1;
      });
    });

    const rows: ColumnComparisonRow[] = Array.from(allColNamesMap.values()).map(entry => {
      const types = Object.values(entry.typesByDataset).filter(Boolean);
      const isPresentInAll = entry.presentInCount === datasets.length;
      const allTypesSame = types.every(t => t === types[0]);

      let status: ColumnComparisonRow['status'] = 'EXACT_MATCH';
      if (isPresentInAll && allTypesSame) {
        status = 'EXACT_MATCH';
      } else if (types.length > 1 && !allTypesSame) {
        status = 'TYPE_MISMATCH';
      } else {
        status = 'PARTIAL_PRESENCE';
      }

      return {
        ...entry,
        status,
      };
    });

    // Statistical compatibility scoring
    const totalUniqueCols = rows.length;
    const exactMatches = rows.filter(r => r.status === 'EXACT_MATCH').length;
    const typeConflicts = rows.filter(r => r.status === 'TYPE_MISMATCH').length;
    const partialPresence = rows.filter(r => r.status === 'PARTIAL_PRESENCE').length;

    const overlapPct = totalUniqueCols > 0 ? Math.round((exactMatches / totalUniqueCols) * 100) : 0;

    return {
      rows,
      totalUniqueCols,
      exactMatches,
      typeConflicts,
      partialPresence,
      overlapPct,
    };
  }, [datasets]);

  // Filter comparison rows by tab & search query
  const filteredRows = useMemo(() => {
    return comparisonData.rows.filter(row => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        if (!row.name.toLowerCase().includes(q)) return false;
      }

      if (activeTab === 'match') return row.status === 'EXACT_MATCH';
      if (activeTab === 'conflict') return row.status === 'TYPE_MISMATCH';
      if (activeTab === 'unique') return row.status === 'PARTIAL_PRESENCE';
      return true;
    });
  }, [comparisonData.rows, activeTab, searchQuery]);

  const exportComparisonReport = () => {
    const report = {
      title: 'Dataset Schema Diff Analysis Report',
      comparedAt: new Date().toISOString(),
      datasetsCompared: datasets.map(d => ({
        id: d.id,
        name: d.name,
        format: d.format,
        rowCount: d.rowCount,
        columnCount: d.columns.length,
      })),
      metrics: {
        totalUniqueColumns: comparisonData.totalUniqueCols,
        exactMatchingColumns: comparisonData.exactMatches,
        typeConflicts: comparisonData.typeConflicts,
        partiallyPresentColumns: comparisonData.partialPresence,
        schemaCompatibilityScore: `${comparisonData.overlapPct}%`,
      },
      columnMatrix: comparisonData.rows.map(r => ({
        columnName: r.name,
        status: r.status,
        presenceAcrossDatasets: r.presentInCount,
        types: r.typesByDataset,
      })),
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `schema_comparison_${datasets.map(d => d.id).join('_vs_')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(
      isAr ? 'تم تصدير تقرير مقارنة المخططات' : 'Schema Report Exported',
      isAr ? 'تم حفظ التقرير المقارن بصيغة JSON.' : 'Saved schema diff report to JSON.'
    );
  };

  const getStatusBadge = (status: ColumnComparisonRow['status']) => {
    switch (status) {
      case 'EXACT_MATCH':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#24a148]/20 text-[#42be65] border border-[#24a148]/40 text-[10px] font-mono font-bold">
            <CheckCircle2 className="w-3 h-3" />
            <span>{isAr ? 'تطابق تام' : 'Exact Match'}</span>
          </span>
        );
      case 'TYPE_MISMATCH':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#da1e28]/20 text-[#ff8389] border border-[#da1e28]/40 text-[10px] font-mono font-bold">
            <AlertTriangle className="w-3 h-3" />
            <span>{isAr ? 'تعارض في النوع' : 'Type Conflict'}</span>
          </span>
        );
      case 'PARTIAL_PRESENCE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#0f62fe]/20 text-[#4589ff] border border-[#0f62fe]/40 text-[10px] font-mono font-bold">
            <Info className="w-3 h-3" />
            <span>{isAr ? 'غير متوفر في الكل' : 'Partial / Unique'}</span>
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-strong)] w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl">
        {/* Modal Header */}
        <div className="bg-[var(--cds-layer-01)] px-6 py-4 border-b border-[var(--cds-border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#0f62fe]/20 border border-[#0f62fe] flex items-center justify-center text-[#4589ff]">
              <ArrowRightLeft className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#0f62fe]">
                  SCHEMA COMPARISON ENGINE
                </span>
                <span className="bg-[var(--cds-layer-03)] text-[var(--cds-text-02)] px-2 py-0.5 text-[10px] font-mono">
                  {datasets.length} {isAr ? 'مجموعات بيانات' : 'Datasets'}
                </span>
              </div>
              <h3 className="text-base font-bold text-[var(--cds-text-01)] tracking-tight mt-0.5">
                {isAr ? 'مقارنة وتحليل تطابق المخططات (Schema Diff)' : 'Multi-Dataset Schema Matrix & Diff'}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={exportComparisonReport}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--cds-layer-03)] hover:bg-[var(--cds-border-strong)] text-[var(--cds-text-01)] text-xs font-mono transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-[#4589ff]" />
              <span>{isAr ? 'تصدير التقرير (JSON)' : 'Export Diff (JSON)'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-[var(--cds-text-03)] hover:text-white hover:bg-[var(--cds-layer-03)] transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Selected Datasets Header Cards */}
        <div className="p-5 bg-[var(--cds-layer-01)] border-b border-[var(--cds-border-subtle)] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {datasets.map(ds => (
            <div key={ds.id} className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="carbon-tag-blue text-[9px] uppercase font-mono">{ds.format}</span>
                <span className="text-[10px] font-mono text-[#24a148] font-bold">
                  {ds.profile?.quality.overallScore || 95}% Health
                </span>
              </div>
              <h4 className="text-xs font-bold text-[var(--cds-text-01)] truncate" title={ds.name}>
                {ds.name}
              </h4>
              <div className="flex items-center justify-between text-[10px] font-mono text-[var(--cds-text-03)]">
                <span>{ds.rowCount.toLocaleString()} rows</span>
                <span>{ds.columns.length} columns</span>
              </div>
            </div>
          ))}

          {/* Compatibility Score Summary Card */}
          <div className="p-3 bg-[#0f62fe]/10 border border-[#0f62fe]/50 space-y-1">
            <div className="text-[10px] font-mono uppercase tracking-wider text-[#4589ff] font-bold flex items-center justify-between">
              <span>{isAr ? 'مؤشر التطابق' : 'Compatibility'}</span>
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div className="text-xl font-bold font-mono text-[var(--cds-text-01)]">
              {comparisonData.overlapPct}%
            </div>
            <p className="text-[10px] text-[var(--cds-text-02)]">
              {comparisonData.exactMatches} {isAr ? 'حقول متطابقة تماماً' : 'matching attributes'}
            </p>
          </div>
        </div>

        {/* Tab & Search Filter Bar */}
        <div className="bg-[var(--cds-layer-01)] px-5 py-2.5 border-b border-[var(--cds-border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 text-xs font-mono transition-colors ${
                activeTab === 'all'
                  ? 'bg-[#0f62fe] text-white font-bold'
                  : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-03)]'
              }`}
            >
              {isAr ? 'جميع الحقول' : 'All Attributes'} ({comparisonData.totalUniqueCols})
            </button>
            <button
              onClick={() => setActiveTab('match')}
              className={`px-3 py-1 text-xs font-mono transition-colors ${
                activeTab === 'match'
                  ? 'bg-[#24a148] text-white font-bold'
                  : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-03)]'
              }`}
            >
              {isAr ? 'متطابقة' : 'Exact Matches'} ({comparisonData.exactMatches})
            </button>
            {comparisonData.typeConflicts > 0 && (
              <button
                onClick={() => setActiveTab('conflict')}
                className={`px-3 py-1 text-xs font-mono transition-colors ${
                  activeTab === 'conflict'
                    ? 'bg-[#da1e28] text-white font-bold'
                    : 'bg-[var(--cds-layer-02)] text-[#ff8389] hover:bg-[var(--cds-layer-03)]'
                }`}
              >
                {isAr ? 'تعارضات الأنواع' : 'Type Conflicts'} ({comparisonData.typeConflicts})
              </button>
            )}
            <button
              onClick={() => setActiveTab('unique')}
              className={`px-3 py-1 text-xs font-mono transition-colors ${
                activeTab === 'unique'
                  ? 'bg-[#0f62fe] text-white font-bold'
                  : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-03)]'
              }`}
            >
              {isAr ? 'حقول منفردة' : 'Partial Presence'} ({comparisonData.partialPresence})
            </button>
          </div>

          {/* Search column name */}
          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-[var(--cds-text-03)]" />
            <input
              type="text"
              placeholder={isAr ? 'تصفية أسماء الأعمدة...' : 'Filter column names...'}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] text-[var(--cds-text-01)] text-xs ps-8 pe-3 py-1 focus:border-[#0f62fe] focus:outline-none font-mono"
            />
          </div>
        </div>

        {/* Matrix Comparison Table */}
        <div className="flex-1 overflow-auto bg-[var(--cds-layer-01)]">
          <table className="w-full text-start text-xs font-sans border-collapse">
            <thead className="bg-[var(--cds-layer-01)] sticky top-0 z-20 border-b border-[var(--cds-border-subtle)] text-[var(--cds-text-02)] font-mono text-[11px]">
              <tr>
                <th className="px-4 py-3 text-start font-bold uppercase">{isAr ? 'اسم العمود' : 'Column Name'}</th>
                <th className="px-4 py-3 text-start font-bold uppercase">{isAr ? 'حالة التطابق' : 'Diff Status'}</th>
                {datasets.map(ds => (
                  <th key={ds.id} className="px-4 py-3 text-start font-bold uppercase">
                    <div className="truncate max-w-[160px] text-[var(--cds-text-01)]">{ds.name}</div>
                    <span className="text-[9px] text-[var(--cds-text-03)] font-normal">{ds.format.toUpperCase()}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--cds-border-subtle)] font-mono text-[11px]">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={datasets.length + 2} className="py-12 text-center text-[var(--cds-text-03)]">
                    {isAr ? 'لا توجد حقول مطابقة للتصفية الحالية' : 'No attributes match the selected filter'}
                  </td>
                </tr>
              ) : (
                filteredRows.map((row, idx) => {
                  return (
                    <tr key={idx} className="hover:bg-[var(--cds-layer-02)] transition-colors">
                      <td className="px-4 py-2.5 font-bold text-[var(--cds-text-01)] border-e border-[var(--cds-border-subtle)]">
                        {row.name}
                      </td>
                      <td className="px-4 py-2.5 border-e border-[var(--cds-border-subtle)] whitespace-nowrap">
                        {getStatusBadge(row.status)}
                      </td>
                      {datasets.map(ds => {
                        const colType = row.typesByDataset[ds.id];
                        const samples = row.sampleValuesByDataset[ds.id];
                        return (
                          <td key={ds.id} className="px-4 py-2.5 border-e border-[var(--cds-border-subtle)]">
                            {colType ? (
                              <div className="space-y-0.5">
                                <span className="inline-block px-1.5 py-0.5 bg-[var(--cds-layer-03)] text-[var(--cds-text-01)] text-[10px] uppercase font-bold">
                                  {colType}
                                </span>
                                {samples && samples.length > 0 && (
                                  <div className="text-[10px] text-[var(--cds-text-03)] truncate max-w-[140px]">
                                    e.g. {String(samples[0])}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-[var(--cds-text-03)] italic text-[10px]">
                                {isAr ? 'غير موجود' : 'Missing'}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] flex items-center justify-between text-xs font-mono text-[var(--cds-text-03)]">
          <span>
            {isAr
              ? `تمت مطابقة ${comparisonData.rows.length} حقل مختلف عبر ${datasets.length} مجموعات بيانات.`
              : `Evaluated ${comparisonData.rows.length} unique attributes across ${datasets.length} datasets.`}
          </span>
          <button onClick={onClose} className="carbon-btn-secondary text-xs uppercase tracking-wider py-1.5 px-4">
            {isAr ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
