import React, { useState, useMemo } from 'react';
import { Dataset, DatasetColumn } from '../../types';
import { useApp } from '../../context/AppContext';
import * as XLSX from 'xlsx';
import {
  Table,
  Search,
  Download,
  Eye,
  BarChart2,
  Maximize2,
  Minimize2,
  Filter,
  Check,
  Hash,
  Type,
  Calendar,
  Tag,
  ToggleLeft,
  Binary,
  Layers,
  ArrowUpDown,
  Sparkles,
  Info,
  ChevronDown,
  X,
  FileSpreadsheet,
} from 'lucide-react';

interface DataPreviewProps {
  dataset: Dataset;
  onClose?: () => void;
}

export const DataPreview: React.FC<DataPreviewProps> = ({ dataset, onClose }) => {
  const { setActiveDatasetId, setActiveTab, toast, language } = useApp();
  const isAr = language === 'ar';

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [density, setDensity] = useState<'compact' | 'comfortable'>('compact');

  // Limit to first 50 rows as per specification
  const previewRows = useMemo(() => {
    const rawData = dataset.data || [];
    return rawData.slice(0, 50);
  }, [dataset.data]);

  // Filter columns based on selected type filter
  const visibleColumns = useMemo(() => {
    if (selectedTypeFilter === 'all') return dataset.columns;
    if (selectedTypeFilter === 'numeric') {
      return dataset.columns.filter(c => c.type === 'integer' || c.type === 'float');
    }
    if (selectedTypeFilter === 'text') {
      return dataset.columns.filter(c => c.type === 'string');
    }
    if (selectedTypeFilter === 'date') {
      return dataset.columns.filter(c => c.type === 'date');
    }
    if (selectedTypeFilter === 'category') {
      return dataset.columns.filter(c => c.type === 'category' || c.type === 'boolean');
    }
    return dataset.columns;
  }, [dataset.columns, selectedTypeFilter]);

  // Filter & Sort preview rows
  const filteredAndSortedRows = useMemo(() => {
    let result = [...previewRows];

    // Filter by search query across visible columns
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(row =>
        visibleColumns.some(col => {
          const val = row[col.name];
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(q);
        })
      );
    }

    // Sort
    if (sortColumn) {
      const colObj = dataset.columns.find(c => c.name === sortColumn);
      const isNum = colObj?.type === 'integer' || colObj?.type === 'float';

      result.sort((a, b) => {
        const valA = a[sortColumn];
        const valB = b[sortColumn];

        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;

        if (isNum) {
          const numA = Number(valA) || 0;
          const numB = Number(valB) || 0;
          return sortDirection === 'asc' ? numA - numB : numB - numA;
        }

        const strA = String(valA).toLowerCase();
        const strB = String(valB).toLowerCase();
        return sortDirection === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
      });
    }

    return result;
  }, [previewRows, searchQuery, sortColumn, sortDirection, visibleColumns, dataset.columns]);

  const handleSort = (colName: string) => {
    if (sortColumn === colName) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortColumn(null);
        setSortDirection('asc');
      }
    } else {
      setSortColumn(colName);
      setSortDirection('asc');
    }
  };

  const getTypeBadge = (type: DatasetColumn['type']) => {
    switch (type) {
      case 'integer':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#0f62fe]/15 text-[#4589ff] border border-[#0f62fe]/40 text-[9px] font-mono font-bold uppercase tracking-wider">
            <Hash className="w-2.5 h-2.5" />
            <span>INT</span>
          </span>
        );
      case 'float':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#1192e8]/15 text-[#33b1ff] border border-[#1192e8]/40 text-[9px] font-mono font-bold uppercase tracking-wider">
            <Hash className="w-2.5 h-2.5" />
            <span>FLOAT</span>
          </span>
        );
      case 'string':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#8a3ffc]/15 text-[#be95ff] border border-[#8a3ffc]/40 text-[9px] font-mono font-bold uppercase tracking-wider">
            <Type className="w-2.5 h-2.5" />
            <span>STR</span>
          </span>
        );
      case 'date':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#007d79]/15 text-[#08bdba] border border-[#007d79]/40 text-[9px] font-mono font-bold uppercase tracking-wider">
            <Calendar className="w-2.5 h-2.5" />
            <span>DATE</span>
          </span>
        );
      case 'category':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#b28600]/15 text-[#f1c21b] border border-[#b28600]/40 text-[9px] font-mono font-bold uppercase tracking-wider">
            <Tag className="w-2.5 h-2.5" />
            <span>CAT</span>
          </span>
        );
      case 'boolean':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[#9f1853]/15 text-[#ee5385] border border-[#9f1853]/40 text-[9px] font-mono font-bold uppercase tracking-wider">
            <ToggleLeft className="w-2.5 h-2.5" />
            <span>BOOL</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-[var(--cds-layer-03)] text-[var(--cds-text-02)] text-[9px] font-mono uppercase">
            {String(type)}
          </span>
        );
    }
  };

  const exportFullDatasetCsv = () => {
    const rawData = dataset.data && dataset.data.length > 0 ? dataset.data : previewRows;
    if (rawData.length === 0) {
      toast.warning(isAr ? 'لا توجد بيانات للتصدير' : 'No Data to Export');
      return;
    }

    const headers = dataset.columns.map(c => `"${c.name.replace(/"/g, '""')}"`).join(',');
    const rows = rawData.map(row =>
      dataset.columns
        .map(col => {
          const val = row[col.name];
          if (val === null || val === undefined) return '""';
          const str = String(val).replace(/"/g, '""');
          return `"${str}"`;
        })
        .join(',')
    );

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${dataset.name.toLowerCase().replace(/\s+/g, '_')}_full_${rawData.length}_records.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(
      isAr ? 'تم تصدير سجلات البيانات بالكامل (CSV)' : 'Complete Dataset Exported (CSV)',
      isAr
        ? `تم تصدير ${rawData.length.toLocaleString()} سجلاً كاملاً في ملف CSV.`
        : `Successfully exported all ${rawData.length.toLocaleString()} records to CSV.`
    );
  };

  const exportFullDatasetExcel = () => {
    const rawData = dataset.data && dataset.data.length > 0 ? dataset.data : previewRows;
    if (rawData.length === 0) {
      toast.warning(isAr ? 'لا توجد بيانات للتصدير' : 'No Data to Export');
      return;
    }

    const cleanRows = rawData.map(row => {
      const cleanObj: Record<string, any> = {};
      dataset.columns.forEach(col => {
        cleanObj[col.name] = row[col.name] ?? '';
      });
      return cleanObj;
    });

    const worksheet = XLSX.utils.json_to_sheet(cleanRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, dataset.name.slice(0, 31));

    XLSX.writeFile(workbook, `${dataset.name.toLowerCase().replace(/\s+/g, '_')}_full_${rawData.length}_records.xlsx`);

    toast.success(
      isAr ? 'تم تصدير ملف Excel الشامل' : 'Complete Excel File Exported',
      isAr
        ? `تم تصدير ${rawData.length.toLocaleString()} سجلاً بحقولها الكاملة في ملف Excel.`
        : `Exported full ${rawData.length.toLocaleString()} records to Excel (.xlsx).`
    );
  };

  const renderCellContent = (value: any, col: DatasetColumn) => {
    if (value === null || value === undefined || value === '') {
      return (
        <span className="text-[var(--cds-text-03)] italic text-[10px] bg-[var(--cds-layer-02)] px-1 py-0.5 border border-[var(--cds-border-subtle)]">
          NULL
        </span>
      );
    }

    if (col.type === 'integer' || col.type === 'float') {
      const num = Number(value);
      if (isNaN(num)) return <span className="font-mono text-[var(--cds-text-01)]">{String(value)}</span>;
      
      const isNegative = num < 0;
      const formatted = col.type === 'float' ? num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : num.toLocaleString();

      return (
        <span className={`font-mono font-medium ${isNegative ? 'text-[#ff8389]' : 'text-[var(--cds-text-01)]'}`}>
          {formatted}
        </span>
      );
    }

    if (col.type === 'date') {
      return <span className="font-mono text-[#08bdba] text-[11px]">{String(value)}</span>;
    }

    if (col.type === 'category' || col.type === 'boolean') {
      const strVal = String(value);
      if (strVal === 'Yes' || strVal === 'true' || strVal === 'ACTIVE') {
        return (
          <span className="px-1.5 py-0.5 bg-[#24a148]/20 text-[#42be65] border border-[#24a148]/40 text-[10px] font-mono">
            {strVal}
          </span>
        );
      }
      if (strVal === 'No' || strVal === 'false' || strVal === 'INACTIVE') {
        return (
          <span className="px-1.5 py-0.5 bg-[#da1e28]/20 text-[#ff8389] border border-[#da1e28]/40 text-[10px] font-mono">
            {strVal}
          </span>
        );
      }
      return <span className="text-[var(--cds-text-02)]">{strVal}</span>;
    }

    return <span className="text-[var(--cds-text-01)] truncate max-w-xs">{String(value)}</span>;
  };

  const containerClasses = isFullscreen
    ? 'fixed inset-0 z-50 bg-[var(--cds-layer-01)] p-6 flex flex-col overflow-hidden animate-in fade-in duration-150'
    : 'carbon-tile overflow-hidden shadow-none border border-[var(--cds-border-subtle)] transition-all';

  return (
    <div className={containerClasses} id={`data-preview-${dataset.id}`}>
      {/* Header Toolbar */}
      <div className="bg-[var(--cds-layer-02)] p-4 border-b border-[var(--cds-border-subtle)] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#0f62fe]/20 border border-[#0f62fe] flex items-center justify-center text-[#4589ff]">
            <Table className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-[var(--cds-text-01)] tracking-tight">
                {isAr ? 'معاينة البيانات الحية' : 'Data Preview'} — {dataset.name}
              </h3>
              <span className="carbon-tag-blue text-[10px] uppercase font-mono">
                {dataset.format}
              </span>
              <span className="bg-[var(--cds-layer-03)] text-[#4589ff] px-2 py-0.5 text-[10px] font-mono font-bold">
                {isAr ? `عرض أول ${previewRows.length} صف` : `First ${previewRows.length} Rows`}
              </span>
            </div>
            <p className="text-[11px] text-[var(--cds-text-03)] mt-0.5">
              {isAr
                ? `إجمالي السجلات: ${dataset.rowCount.toLocaleString()} صف | ${dataset.columns.length} عمود مع مؤشرات الأنواع والتنسيق التلقائي`
                : `Total: ${dataset.rowCount.toLocaleString()} records across ${dataset.columns.length} columns with type indicators and live sample grid`}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Real-time In-Preview Search */}
          <div className="relative min-w-[180px] sm:min-w-[220px]">
            <Search className="w-3.5 h-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-[var(--cds-text-03)]" />
            <input
              type="text"
              placeholder={isAr ? 'بحث في الـ 50 صفاً...' : 'Search preview sample...'}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] text-[var(--cds-text-01)] text-xs ps-8 pe-6 py-1.5 focus:border-[#0f62fe] focus:outline-none font-mono placeholder:text-[var(--cds-text-03)]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute end-2 top-1/2 -translate-y-1/2 text-[var(--cds-text-03)] hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Type Filter */}
          <div className="flex items-center border border-[var(--cds-border-strong)] bg-[var(--cds-layer-01)] px-1 py-0.5">
            <Filter className="w-3 h-3 text-[var(--cds-text-03)] ms-1 me-1.5" />
            <select
              value={selectedTypeFilter}
              onChange={e => setSelectedTypeFilter(e.target.value)}
              className="bg-transparent text-xs text-[var(--cds-text-02)] font-mono focus:outline-none cursor-pointer py-1"
            >
              <option value="all" className="bg-[var(--cds-layer-02)]">{isAr ? 'جميع الحقول' : 'All Types'}</option>
              <option value="numeric" className="bg-[var(--cds-layer-02)]">{isAr ? 'أرقام (#)' : 'Numeric'}</option>
              <option value="text" className="bg-[var(--cds-layer-02)]">{isAr ? 'نصوص (Aa)' : 'Text/String'}</option>
              <option value="date" className="bg-[var(--cds-layer-02)]">{isAr ? 'تواريخ (📅)' : 'Dates'}</option>
              <option value="category" className="bg-[var(--cds-layer-02)]">{isAr ? 'فئات وقيم منطقية' : 'Categories'}</option>
            </select>
          </div>

          {/* Export Full Dataset CSV */}
          <button
            onClick={exportFullDatasetCsv}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--cds-layer-03)] hover:bg-[var(--cds-border-strong)] text-[var(--cds-text-01)] text-xs font-mono transition-colors cursor-pointer"
            title={isAr ? 'تصدير مجموعة البيانات الكاملة بصيغة CSV' : 'Export full dataset object to CSV'}
          >
            <Download className="w-3.5 h-3.5 text-[#4589ff]" />
            <span className="hidden sm:inline">{isAr ? 'تصدير CSV الكامل' : 'Export Full CSV'}</span>
          </button>

          {/* Export Full Dataset Excel */}
          <button
            onClick={exportFullDatasetExcel}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#24a148] hover:bg-[#198038] text-white text-xs font-mono font-bold transition-colors cursor-pointer"
            title={isAr ? 'تصدير مجموعة البيانات الكاملة بصيغة Excel' : 'Export full dataset object to Excel (.xlsx)'}
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-white" />
            <span className="hidden sm:inline">{isAr ? 'تصدير Excel الشامل' : 'Export Excel (.xlsx)'}</span>
          </button>

          {/* Jump to Explorer */}
          <button
            onClick={() => {
              setActiveDatasetId(dataset.id);
              setActiveTab('explorer');
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--cds-layer-03)] hover:bg-[var(--cds-border-strong)] text-[var(--cds-text-01)] text-xs font-mono transition-colors"
            title={isAr ? 'فتح في مستكشف الاستعلامات الكامل' : 'Open in SQL Explorer'}
          >
            <Eye className="w-3.5 h-3.5 text-[#08bdba]" />
            <span className="hidden md:inline">{isAr ? 'مستكشف SQL' : 'Explorer'}</span>
          </button>

          {/* Jump to Profiler */}
          <button
            onClick={() => {
              setActiveDatasetId(dataset.id);
              setActiveTab('profiling');
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--cds-layer-03)] hover:bg-[var(--cds-border-strong)] text-[var(--cds-text-01)] text-xs font-mono transition-colors"
            title={isAr ? 'فتح التوصيف الإحصائي الشامل' : 'Open statistical profiling'}
          >
            <BarChart2 className="w-3.5 h-3.5 text-[#f1c21b]" />
            <span className="hidden md:inline">{isAr ? 'التوصيف' : 'Profiling'}</span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 bg-[var(--cds-layer-03)] hover:bg-[var(--cds-border-strong)] text-[var(--cds-text-02)] hover:text-white transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Grid'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Close preview if handler provided */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 bg-[var(--cds-layer-03)] hover:bg-[#da1e28] text-[var(--cds-text-03)] hover:text-white transition-colors"
              title="Close Preview"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Grid Meta Information Bar */}
      <div className="bg-[var(--cds-layer-01)] px-4 py-2 border-b border-[var(--cds-border-subtle)] flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-[var(--cds-text-03)]">
        <div className="flex items-center gap-4 flex-wrap">
          <span>
            {isAr ? 'الصفوف المعروضة:' : 'Visible Rows:'}{' '}
            <strong className="text-[var(--cds-text-01)]">{filteredAndSortedRows.length}</strong> / {previewRows.length}
          </span>
          <span>
            {isAr ? 'الأعمدة المعروضة:' : 'Columns:'}{' '}
            <strong className="text-[var(--cds-text-01)]">{visibleColumns.length}</strong> / {dataset.columns.length}
          </span>
          {sortColumn && (
            <span className="text-[#4589ff] flex items-center gap-1">
              <span>{isAr ? 'ترتيب حسب:' : 'Sorted by:'}</span>
              <strong>{sortColumn}</strong>
              <span>({sortDirection.toUpperCase()})</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[var(--cds-text-03)] hidden sm:inline">
            {isAr ? 'انقر على رأس العمود للترتيب • مرر أفقياً لتصفح بقية الحقول' : 'Click header to sort • Scroll horizontally for more columns'}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
              className="text-[10px] px-2 py-0.5 bg-[var(--cds-layer-03)] hover:bg-[var(--cds-border-strong)] text-[var(--cds-text-02)] uppercase"
            >
              {density === 'compact' ? 'Compact' : 'Comfortable'}
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable Data Grid Container */}
      <div className={`overflow-x-auto overflow-y-auto ${isFullscreen ? 'flex-1 max-h-none' : 'max-h-[480px]'} bg-[var(--cds-layer-01)]`}>
        <table className="w-full text-start text-xs border-collapse font-sans min-w-[700px]">
          <thead className="bg-[var(--cds-layer-01)] sticky top-0 z-20 shadow-xs border-b border-[var(--cds-border-subtle)]">
            <tr>
              {/* Row Index Header (Sticky Left) */}
              <th className="sticky start-0 z-30 bg-[var(--cds-layer-01)] text-[var(--cds-text-03)] font-mono text-[10px] px-3 py-3 text-center border-e border-b border-[var(--cds-border-subtle)] w-12 select-none">
                #
              </th>

              {/* Column Headers with Type Indicators */}
              {visibleColumns.map(col => {
                const isSorted = sortColumn === col.name;
                return (
                  <th
                    key={col.name}
                    onClick={() => handleSort(col.name)}
                    className={`px-4 py-2.5 text-start font-mono text-xs border-e border-b border-[var(--cds-border-subtle)] cursor-pointer select-none transition-colors group ${
                      isSorted ? 'bg-[var(--cds-layer-02)] text-[#4589ff]' : 'hover:bg-[var(--cds-layer-02)] text-[var(--cds-text-01)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold tracking-tight truncate max-w-[180px]">{col.name}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {getTypeBadge(col.type)}
                        <ArrowUpDown
                          className={`w-3 h-3 transition-opacity ${
                            isSorted ? 'opacity-100 text-[#0f62fe]' : 'opacity-0 group-hover:opacity-40 text-[var(--cds-text-03)]'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Column meta snippet */}
                    <div className="flex items-center justify-between text-[9px] font-normal text-[var(--cds-text-03)] mt-1">
                      <span>{col.nullable ? (isAr ? 'يقبل NULL' : 'Nullable') : (isAr ? 'إلزامي' : 'Not Null')}</span>
                      {col.sampleValues && col.sampleValues.length > 0 && (
                        <span className="truncate max-w-[90px] text-[var(--cds-text-03)] hidden xl:inline">
                          e.g. {String(col.sampleValues[0])}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--cds-border-subtle)] font-mono text-[11px]">
            {filteredAndSortedRows.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + 1} className="py-12 text-center text-[var(--cds-text-03)] font-mono">
                  <div className="max-w-xs mx-auto space-y-2">
                    <Table className="w-8 h-8 text-[var(--cds-text-03)] mx-auto" />
                    <p className="font-bold text-[var(--cds-text-01)]">
                      {isAr ? 'لم يتم العثور على سجلات مطابقة' : 'No records match search'}
                    </p>
                    <p className="text-xs text-[var(--cds-text-03)]">
                      {isAr ? 'جرّب تغيير عبارة البحث أو إزالة المرشحات.' : 'Try adjusting the search query or reset type filter.'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filteredAndSortedRows.map((row, rowIdx) => {
                const isEven = rowIdx % 2 === 0;
                return (
                  <tr
                    key={rowIdx}
                    className={`transition-colors hover:bg-[#2c2c2c] ${isEven ? 'bg-[var(--cds-layer-01)]' : 'bg-[var(--cds-layer-01)]'}`}
                  >
                    {/* Row Index (Sticky Left) */}
                    <td className={`sticky start-0 z-10 font-mono text-[10px] text-[var(--cds-text-03)] px-3 ${density === 'compact' ? 'py-1.5' : 'py-3'} text-center border-e border-[var(--cds-border-subtle)] select-none ${isEven ? 'bg-[var(--cds-layer-02)]' : 'bg-[var(--cds-layer-02)]'}`}>
                      {rowIdx + 1}
                    </td>

                    {/* Column Cells */}
                    {visibleColumns.map(col => {
                      const val = row[col.name];
                      const isNumeric = col.type === 'integer' || col.type === 'float';
                      return (
                        <td
                          key={col.name}
                          className={`px-4 ${density === 'compact' ? 'py-1.5' : 'py-2.5'} border-e border-[var(--cds-border-subtle)] whitespace-nowrap ${
                            isNumeric ? 'text-end' : 'text-start'
                          }`}
                        >
                          {renderCellContent(val, col)}
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

      {/* Footer Summary Ribbon */}
      <div className="bg-[var(--cds-layer-02)] px-4 py-2.5 border-t border-[var(--cds-border-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-3 text-[var(--cds-text-02)] text-[11px]">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#0f62fe]" />
            <span>{isAr ? 'عينة المعاينة المباشرة (50 صف)' : 'Live 50-Row Active Preview'}</span>
          </span>
          <span className="text-[var(--cds-text-03)]">|</span>
          <span>
            {isAr ? `إجمالي البيانات: ${dataset.rowCount.toLocaleString()} صف` : `Dataset Total: ${dataset.rowCount.toLocaleString()} records`}
          </span>
        </div>

        <div className="flex items-center gap-4 text-[11px] text-[var(--cds-text-03)]">
          <span>
            {isAr ? 'الحجم التقديري:' : 'Size:'}{' '}
            <strong className="text-[var(--cds-text-01)]">{Math.round(dataset.sizeBytes / 1024)} KB</strong>
          </span>
          <span>
            {isAr ? 'جودة البيانات:' : 'Health:'}{' '}
            <strong className="text-[#24a148]">{dataset.profile?.quality.overallScore || 96}%</strong>
          </span>
        </div>
      </div>
    </div>
  );
};
