import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { DataModelTable, DataModelRelationship, RelationshipType, DatasetColumn } from '../../types';
import { InteractiveErdCanvas } from '../../components/datamodeling/InteractiveErdCanvas';
import { MergedDataPreviewTable } from '../../components/datamodeling/MergedDataPreviewTable';
import { ExportModelModal } from '../../components/datamodeling/ExportModelModal';
import { SavedModelsDrawer, SavedModelItem } from '../../components/datamodeling/SavedModelsDrawer';
import { ModelingStudio } from '../../components/ModelingStudio';
import { ModelPerformanceComparison } from '../../components/datamodeling/ModelPerformanceComparison';
import {
  Workflow,
  Table,
  Code2,
  Save,
  FolderOpen,
  Sparkles,
  Play,
  CheckCircle2,
  Sliders,
  Database,
  Layers,
  FileSpreadsheet,
  Plus,
  Check,
  BarChart3
} from 'lucide-react';

const TABLE_ACCENTS = [
  '#0f62fe', '#8a3ffc', '#1192e8', '#007d79',
  '#fa4d56', '#673ab7', '#009688', '#3f51b5'
];

export const AdvancedModelingPage: React.FC = () => {
  const { language, datasets, addDataset, updateDataset, setActiveTab: setAppTab, workspace } = useApp();
  const isAr = language === 'ar';

  const modelingRef = useRef<any>(null);
  const [activeTab, setActiveTab] = useState<'relational' | 'statistical' | 'benchmark' | 'saved'>('relational');
  const [status, setStatus] = useState<string | null>(null);

  // Core Data Modeling State
  const [tables, setTables] = useState<DataModelTable[]>([]);
  const [relationships, setRelationships] = useState<DataModelRelationship[]>([]);

  // Modal & Drawer State
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isSavedDrawerOpen, setIsSavedDrawerOpen] = useState<boolean>(false);

  // Validation Summary & Joined Dataset State computation
  const validationSummary = useMemo(() => {
    if (relationships.length === 0 || tables.length === 0) return null;

    const rel = relationships[0]; // Active/Primary relationship
    const srcTbl = tables.find(t => t.name === rel.sourceTable);
    const tgtTbl = tables.find(t => t.name === rel.targetTable);

    if (!srcTbl || !tgtTbl) return null;

    const srcData = srcTbl.fullData && srcTbl.fullData.length > 0 ? srcTbl.fullData : (srcTbl.dataSample || []);
    const tgtData = tgtTbl.fullData && tgtTbl.fullData.length > 0 ? tgtTbl.fullData : (tgtTbl.dataSample || []);

    const tgtMap = new Map();
    tgtData.forEach(row => {
      const k = String(row[rel.targetColumn] ?? '');
      if (k) tgtMap.set(k, row);
    });

    let matchedCount = 0;
    const joinedRows = srcData.map(sRow => {
      const fk = String(sRow[rel.sourceColumn] ?? '');
      const tRow = tgtMap.get(fk);
      if (tRow) matchedCount++;

      const combined: Record<string, any> = {};
      Object.entries(sRow).forEach(([k, v]) => {
        combined[`${rel.sourceTable}.${k}`] = v;
      });
      Object.entries(tRow || {}).forEach(([k, v]) => {
        combined[`${rel.targetTable}.${k}`] = v;
      });
      return combined;
    });

    const matchRate = srcData.length > 0 ? Math.round((matchedCount / srcData.length) * 100) : 100;
    const allHeaders = joinedRows.length > 0 ? Object.keys(joinedRows[0]) : [];

    return {
      relationship: rel,
      sourceTable: rel.sourceTable,
      targetTable: rel.targetTable,
      sourceColumn: rel.sourceColumn,
      targetColumn: rel.targetColumn,
      joinType: rel.joinType || 'LEFT',
      rowCount: joinedRows.length,
      columnCount: allHeaders.length,
      columnsSample: allHeaders.slice(0, 10),
      matchRate,
      joinedRows,
    };
  }, [tables, relationships]);

  // Auto-persist joined dataset to AppContext so DatasetsPage can fetch and display it
  useEffect(() => {
    if (!validationSummary) return;

    const joinedDsName = `Joined_${validationSummary.sourceTable}_${validationSummary.targetTable}`;
    const joinedDsId = `ds-joined-auto`;

    const cols: DatasetColumn[] = validationSummary.columnsSample.map(colName => {
      return {
        name: colName,
        type: 'string',
        nullable: true,
        sampleValues: validationSummary.joinedRows.slice(0, 3).map(r => r[colName]),
      };
    });

    const existing = datasets.find(d => d.id === joinedDsId || d.name === joinedDsName);
    if (existing) {
      updateDataset({
        ...existing,
        name: joinedDsName,
        rowCount: validationSummary.rowCount,
        columnCount: validationSummary.columnCount,
        data: validationSummary.joinedRows,
        updatedAt: new Date().toISOString(),
      });
    } else {
      addDataset({
        id: joinedDsId,
        name: joinedDsName,
        description: `Persisted relational join dataset (${validationSummary.sourceTable} ⋈ ${validationSummary.targetTable})`,
        format: 'csv',
        rowCount: validationSummary.rowCount,
        columnCount: validationSummary.columnCount,
        sizeBytes: validationSummary.rowCount * 250,
        columns: cols,
        workspaceId: workspace.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        status: 'ready',
        tags: ['Joined', 'Model', 'Relational'],
        data: validationSummary.joinedRows,
      });
    }
  }, [validationSummary]);

  // Auto-Populate Tables & Default Relationships from workspace datasets
  useEffect(() => {
    if (tables.length === 0 && datasets && datasets.length > 0) {
      const initialTables: DataModelTable[] = datasets.slice(0, 5).map((d, idx) => {
        const pkCol = d.columns.find(c => /id|code|key/i.test(c.name))?.name || d.columns[0]?.name;
        return {
          id: d.id,
          name: d.name.replace(/\s+/g, '_'),
          rowCount: d.rowCount,
          columns: d.columns,
          primaryKey: pkCol ? [pkCol] : [],
          fullData: d.data || [],
          dataSample: d.data && d.data.length > 0 ? d.data.slice(0, 20) : [],
          color: TABLE_ACCENTS[idx % TABLE_ACCENTS.length],
        };
      });

      setTables(initialTables);

      // Auto-Detect standard relationships (e.g. matching column names like customer_id -> id)
      const detectedRels: DataModelRelationship[] = [];
      for (let i = 0; i < initialTables.length; i++) {
        for (let j = 0; j < initialTables.length; j++) {
          if (i === j) continue;
          const t1 = initialTables[i];
          const t2 = initialTables[j];

          t1.columns.forEach(col1 => {
            t2.columns.forEach(col2 => {
              if (
                col1.name !== col2.name &&
                col1.name.toLowerCase().includes(col2.name.toLowerCase()) &&
                /id|code|key/i.test(col2.name)
              ) {
                const relId = `rel-auto-${t1.name}-${t2.name}`;
                if (!detectedRels.some(r => r.id === relId)) {
                  detectedRels.push({
                    id: relId,
                    sourceTable: t1.name,
                    sourceColumn: col1.name,
                    targetTable: t2.name,
                    targetColumn: col2.name,
                    relationshipType: '1:M',
                    joinType: 'LEFT',
                    confidence: 95,
                    description: `Auto-linked ${t1.name}.${col1.name} -> ${t2.name}.${col2.name}`,
                    isAiGenerated: true,
                  });
                }
              }
            });
          });
        }
      }

      if (detectedRels.length > 0) {
        setRelationships(detectedRels);
      }
    }
  }, [datasets]);

  // Handle Loading Saved Model
  const handleLoadSavedModel = (savedModel: SavedModelItem) => {
    setTables(savedModel.tables);
    setRelationships(savedModel.relationships);
    setStatus(
      isAr
        ? `تم تحميل النموذج "${savedModel.name}" بنجاح!`
        : `Model "${savedModel.name}" loaded successfully!`
    );
    setTimeout(() => setStatus(null), 3000);
  };

  // Trigger Calculation on Statistical Tab
  const handleBridgeCalculation = () => {
    if (modelingRef.current) {
      modelingRef.current.calculateModel();
      const options = modelingRef.current.getSelectedOptions();
      setStatus(
        isAr
          ? `جارٍ معالجة ${options.selectedType} (X=${options.xAxisCol}, Y=${options.yAxisCol})...`
          : `Processing ${options.selectedType} (X=${options.xAxisCol}, Y=${options.yAxisCol})...`
      );

      setTimeout(() => {
        setStatus(
          isAr
            ? 'تم اكتمال تدريب وحساب النموذج بنجاح!'
            : 'Model calculated and trained successfully!'
        );
      }, 800);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in pb-10">
      {/* Top Banner with Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-4 md:p-5 rounded-xl shadow-lg">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--cds-interactive-01)] shadow-xs animate-pulse" />
            <h1 className="text-lg font-bold text-[var(--cds-text-01)]">
              {isAr ? 'استوديو النمذجة المتقدمة والعلاقات' : 'Advanced Relational Data Modeling Studio'}
            </h1>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-[var(--cds-layer-02)] text-[var(--cds-interactive-01)] border border-[var(--cds-border-subtle)]">
              Enterprise v3.5
            </span>
          </div>
          <p className="text-xs text-[var(--cds-text-03)]">
            {isAr
              ? 'بناء وصياغة شبكة العلاقات بين جداول البيانات، معاينة الجدول المدمج لحظياً، وتصدير هيكل النموذج بـ JSON أو SQL.'
              : 'Construct relational ERD diagrams, preview dynamically merged joined tables, and export SQL DDL scripts.'}
          </p>
        </div>

        {/* Global Action Header Buttons */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {status && (
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg animate-in fade-in">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{status}</span>
            </div>
          )}

          {/* Export Model Button */}
          <button
            onClick={() => setIsExportModalOpen(true)}
            className="px-3.5 py-2 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-hover-ui)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] text-xs font-mono font-bold flex items-center gap-2 rounded-lg transition-colors cursor-pointer shadow-sm"
          >
            <Code2 className="w-4 h-4 text-[#78a9ff]" />
            <span>{isAr ? 'تصدير النموذج (Export Model)' : 'Export Model'}</span>
          </button>

          {/* Save Button */}
          <button
            onClick={() => setIsSavedDrawerOpen(true)}
            className="px-3.5 py-2 bg-[var(--cds-interactive-01)] hover:bg-[var(--cds-interactive-01)]/80 text-white text-xs font-mono font-bold flex items-center gap-2 rounded-lg transition-colors cursor-pointer shadow-md"
          >
            <Save className="w-4 h-4" />
            <span>{isAr ? 'حفظ (Save)' : 'Save'}</span>
          </button>
        </div>
      </div>

      {/* Main Studio Navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] p-1 rounded-xl">
        <button
          onClick={() => setActiveTab('relational')}
          className={`px-4 py-2 text-xs font-mono font-bold rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${
            activeTab === 'relational'
              ? 'bg-[var(--cds-interactive-01)] text-white shadow-md'
              : 'text-[var(--cds-text-02)] hover:bg-[var(--cds-hover-ui)]'
          }`}
        >
          <Workflow className="w-4 h-4" />
          <span>{isAr ? 'مخطط العلاقات والربط التفاعلي' : 'Relational Diagram & Data Preview'}</span>
          <span className="text-[10px] bg-black/20 px-1.5 rounded font-mono">
            {relationships.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('statistical')}
          className={`px-4 py-2 text-xs font-mono font-bold rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${
            activeTab === 'statistical'
              ? 'bg-[var(--cds-interactive-01)] text-white shadow-md'
              : 'text-[var(--cds-text-02)] hover:bg-[var(--cds-hover-ui)]'
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>{isAr ? 'النمذجة الإحصائية والانحدار (Regression)' : 'Statistical & Regression Studio'}</span>
        </button>

        <button
          onClick={() => setActiveTab('benchmark')}
          className={`px-4 py-2 text-xs font-mono font-bold rounded-lg transition-colors flex items-center gap-2 cursor-pointer ${
            activeTab === 'benchmark'
              ? 'bg-[var(--cds-interactive-01)] text-white shadow-md'
              : 'text-[var(--cds-text-02)] hover:bg-[var(--cds-hover-ui)]'
          }`}
        >
          <BarChart3 className="w-4 h-4 text-emerald-400" />
          <span>{isAr ? 'مقارنة أداء النماذج (Benchmark Recharts)' : 'Model Performance Benchmark'}</span>
        </button>

        <button
          onClick={() => setIsSavedDrawerOpen(true)}
          className="px-4 py-2 text-xs font-mono font-bold rounded-lg text-[var(--cds-text-02)] hover:bg-[var(--cds-hover-ui)] transition-colors flex items-center gap-2 cursor-pointer ml-auto rtl:mr-auto rtl:ml-0"
        >
          <FolderOpen className="w-4 h-4 text-[#42be65]" />
          <span>{isAr ? 'المكتبة المحفوظة' : 'Saved Models'}</span>
        </button>
      </div>

      {/* Tab 1: Relational Diagram & Merged Data Preview */}
      {activeTab === 'relational' && (
        <div className="space-y-6">
          {/* Section 1: Interactive ERD Canvas */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[var(--cds-text-01)]">
                <Workflow className="w-4 h-4 text-[#0f62fe]" />
                <h2 className="text-sm font-mono font-bold uppercase">
                  {isAr ? 'مخطط تصور العلاقات بين الجداول (Relationship Visualization)' : 'Table Relationship Diagram'}
                </h2>
              </div>
              <span className="text-xs text-[var(--cds-text-03)] font-mono">
                {isAr ? `${tables.length} جداول مصدرية` : `${tables.length} source tables`}
              </span>
            </div>

            <InteractiveErdCanvas
              tables={tables}
              relationships={relationships}
              onUpdateTables={setTables}
              onUpdateRelationships={setRelationships}
              language={language as 'ar' | 'en'}
            />
          </div>

          {/* Section 2: Merged Data Preview Panel directly below the relationship diagram */}
          <div className="space-y-4">
            {/* Validation Summary Display after join creation */}
            {validationSummary && (
              <div className="bg-[#1f1f1f] border border-[#24a148] p-4 space-y-3 animate-in fade-in">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 text-[#42be65]">
                    <CheckCircle2 className="w-5 h-5 text-[#24a148]" />
                    <div>
                      <h3 className="text-xs font-mono font-bold uppercase text-[#f4f4f4]">
                        {isAr ? 'تم التحقق من عملية الدمج وحفظ الناتج المترابط' : 'Join Operation Validated & Persisted'}
                      </h3>
                      <p className="text-[11px] text-[#8d8d8d]">
                        {isAr
                          ? `تم ربط ${validationSummary.sourceTable} بـ ${validationSummary.targetTable} عبر المفتاح (${validationSummary.sourceColumn} = ${validationSummary.targetColumn}).`
                          : `Successfully connected ${validationSummary.sourceTable} to ${validationSummary.targetTable} via (${validationSummary.sourceColumn} = ${validationSummary.targetColumn}).`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="carbon-tag-green text-[10px] font-mono">
                      {validationSummary.matchRate}% {isAr ? 'نسبة تطابق المفاتيح' : 'Match Rate'}
                    </span>
                    <button
                      onClick={() => setAppTab('datasets')}
                      className="px-3 py-1.5 bg-[#24a148] hover:bg-[#198038] text-white text-xs font-mono font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Database className="w-3.5 h-3.5" />
                      <span>{isAr ? 'عرض في قائمة مجموعات البيانات' : 'View in Datasets Catalog'}</span>
                    </button>
                  </div>
                </div>

                {/* Summary Metrics & Schema Preview */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#161616] p-3 border border-[#393939] text-xs font-mono">
                  <div>
                    <span className="text-[#8d8d8d] text-[10px] uppercase block">{isAr ? 'إجمالي الصفوف المدمجة' : 'Joined Row Count'}</span>
                    <span className="text-[#f4f4f4] text-sm font-bold">{validationSummary.rowCount.toLocaleString()} rows</span>
                  </div>
                  <div>
                    <span className="text-[#8d8d8d] text-[10px] uppercase block">{isAr ? 'إجمالي حقول المخطط' : 'Total Schema Columns'}</span>
                    <span className="text-[#33b1ff] text-sm font-bold">{validationSummary.columnCount} cols</span>
                  </div>
                  <div>
                    <span className="text-[#8d8d8d] text-[10px] uppercase block">{isAr ? 'نوع شروط الربط' : 'Join Strategy'}</span>
                    <span className="text-[#be95ff] text-sm font-bold">{validationSummary.joinType} JOIN</span>
                  </div>
                  <div>
                    <span className="text-[#8d8d8d] text-[10px] uppercase block">{isAr ? 'حالة الحفظ بالمستودع' : 'Workspace Status'}</span>
                    <span className="text-[#42be65] text-xs font-bold flex items-center gap-1 mt-0.5">
                      <Check className="w-3 h-3" />
                      {isAr ? 'مستعد للعرض والتصدير' : 'Persisted & Ready'}
                    </span>
                  </div>
                </div>

                {/* Schema Columns Preview */}
                <div className="space-y-1">
                  <span className="text-[10px] font-mono uppercase text-[#8d8d8d] block">
                    {isAr ? 'معاينة حقول المخطط المدمج (Schema Preview):' : 'Joined Schema Preview:'}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {validationSummary.columnsSample.map((col, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-[#262626] border border-[#393939] text-[#c6c6c6] text-[10px] font-mono">
                        {col}
                      </span>
                    ))}
                    {validationSummary.columnCount > validationSummary.columnsSample.length && (
                      <span className="px-2 py-0.5 bg-[#393939] text-[#8d8d8d] text-[10px] font-mono">
                        +{validationSummary.columnCount - validationSummary.columnsSample.length} {isAr ? 'حقول أخرى' : 'more fields'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 text-[var(--cds-text-01)]">
              <Table className="w-4 h-4 text-[#42be65]" />
              <h2 className="text-sm font-mono font-bold uppercase">
                {isAr ? 'لوحة معاينة البيانات المدمجة وتصفيتها (Merged Data Preview Panel)' : 'Merged Data Preview & Filtering Panel'}
              </h2>
            </div>

            <MergedDataPreviewTable
              tables={tables}
              relationships={relationships}
              language={language as 'ar' | 'en'}
            />
          </div>
        </div>
      )}

      {/* Tab 2: Statistical & Multivariate Regression Studio */}
      {activeTab === 'statistical' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-[var(--cds-layer-01)] p-3 border border-[var(--cds-border-subtle)] rounded-xl">
            <span className="text-xs font-mono text-[var(--cds-text-02)]">
              {isAr ? 'أداة تحليل الانحدار الخطي ومتعدد الحدود ومقارنة المتغيرات الإحصائية' : 'Multivariate Linear & Polynomial Regression Analysis Engine'}
            </span>
            <button
              onClick={handleBridgeCalculation}
              className="btn-primary flex items-center gap-2 text-xs font-semibold cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isAr ? 'حساب وحفظ النموذج النشط' : 'Calculate Active Model'}</span>
            </button>
          </div>

          <ModelingStudio ref={modelingRef} />
        </div>
      )}

      {/* Tab 3: Model Performance Benchmark Comparison with Recharts */}
      {activeTab === 'benchmark' && (
        <div className="space-y-4">
          <ModelPerformanceComparison />
        </div>
      )}

      {/* Export Model Modal */}
      <ExportModelModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        tables={tables}
        relationships={relationships}
        language={language as 'ar' | 'en'}
      />

      {/* Saved Models Drawer */}
      <SavedModelsDrawer
        isOpen={isSavedDrawerOpen}
        onClose={() => setIsSavedDrawerOpen(false)}
        tables={tables}
        relationships={relationships}
        onLoadModel={handleLoadSavedModel}
        language={language as 'ar' | 'en'}
      />
    </div>
  );
};
