import React, { useState, useMemo } from 'react';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  Download,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  SlidersHorizontal,
  Table as TableIcon,
  EyeOff,
  Database,
  Info,
  Hash,
  Calendar,
  ToggleLeft,
  Type,
  FileSpreadsheet,
} from 'lucide-react';
import { DatasetColumn } from '../../types';
import { ExportModal } from './ExportModal';

export interface CarbonDataTableColumn<T = any> {
  key: string;
  header: string;
  headerAr?: string;
  type?: string;
  align?: 'start' | 'center' | 'end';
  sortable?: boolean;
  width?: string | number;
  description?: string;
  descriptionAr?: string;
  render?: (value: any, row: T, rowIndex: number) => React.ReactNode;
}

export interface CarbonDataTableProps<T = Record<string, any>> {
  data: T[];
  columns?: CarbonDataTableColumn<T>[];
  columnMeta?: DatasetColumn[];
  title?: string;
  description?: string;
  isLoading?: boolean;
  searchable?: boolean;
  searchPlaceholder?: string;
  initialSortColumn?: string;
  initialSortDirection?: 'asc' | 'desc';
  onSortChange?: (column: string, direction: 'asc' | 'desc') => void;
  pageSizeOptions?: number[];
  initialPageSize?: number;
  showZebraToggle?: boolean;
  initialZebra?: boolean;
  showDensityToggle?: boolean;
  initialDensity?: 'compact' | 'normal' | 'tall';
  onExportCsv?: () => void;
  onExportJson?: () => void;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  maxHeight?: string | number;
  selectable?: boolean;
  selectedRows?: Set<number>;
  onSelectionChange?: (selectedIndices: Set<number>) => void;
  toolbarActions?: React.ReactNode;
  language?: 'en' | 'ar';
  id?: string;
}

export const CarbonDataTable = <T extends Record<string, any>>({
  data,
  columns: customColumns,
  columnMeta,
  title,
  description,
  isLoading = false,
  searchable = true,
  searchPlaceholder,
  initialSortColumn,
  initialSortDirection = 'asc',
  onSortChange,
  pageSizeOptions = [10, 20, 50, 100],
  initialPageSize = 20,
  showZebraToggle = true,
  initialZebra = true,
  showDensityToggle = true,
  initialDensity = 'normal',
  onExportCsv,
  onExportJson,
  emptyMessage,
  emptyIcon,
  maxHeight = 620,
  selectable = false,
  selectedRows,
  onSelectionChange,
  toolbarActions,
  language = 'en',
  id = 'carbon-data-table',
}: CarbonDataTableProps<T>) => {
  const [internalSearch, setInternalSearch] = useState('');
  const [sortColumn, setSortColumn] = useState<string | null>(initialSortColumn || null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(initialSortDirection);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [isZebra, setIsZebra] = useState(initialZebra);
  const [density, setDensity] = useState<'compact' | 'normal' | 'tall'>(initialDensity);
  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [hoveredHeaderKey, setHoveredHeaderKey] = useState<string | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  // Generate resolved columns list from customColumns or dataset properties
  const resolvedColumns: CarbonDataTableColumn<T>[] = useMemo(() => {
    if (customColumns && customColumns.length > 0) {
      return customColumns.map(col => {
        const meta = columnMeta?.find(m => m.name === col.key);
        const isNumeric = meta?.type === 'float' || meta?.type === 'integer';
        return {
          ...col,
          type: col.type || meta?.type || 'string',
          align: col.align || (isNumeric ? 'end' : 'start'),
          sortable: col.sortable !== undefined ? col.sortable : true,
          description: col.description || meta?.description,
          descriptionAr: col.descriptionAr || meta?.descriptionAr,
        };
      });
    }

    if (data.length > 0) {
      const keys = Object.keys(data[0]);
      return keys.map(key => {
        const meta = columnMeta?.find(m => m.name === key);
        const sampleVal = data[0][key];
        const isNumeric =
          meta?.type === 'float' ||
          meta?.type === 'integer' ||
          typeof sampleVal === 'number' ||
          (!isNaN(Number(sampleVal)) && typeof sampleVal === 'string' && sampleVal.trim() !== '');

        return {
          key,
          header: key,
          type: meta?.type || (typeof sampleVal === 'number' ? 'float' : typeof sampleVal === 'boolean' ? 'boolean' : 'string'),
          align: isNumeric ? 'end' : 'start',
          sortable: true,
          description: meta?.description,
          descriptionAr: meta?.descriptionAr,
        };
      });
    }

    if (columnMeta && columnMeta.length > 0) {
      return columnMeta.map(m => ({
        key: m.name,
        header: m.name,
        type: m.type,
        align: m.type === 'float' || m.type === 'integer' ? 'end' : 'start',
        sortable: true,
        description: m.description,
        descriptionAr: m.descriptionAr,
      }));
    }

    return [];
  }, [customColumns, columnMeta, data]);

  // Visible columns filtered by hidden selection
  const visibleColumns = useMemo(() => {
    return resolvedColumns.filter(c => !hiddenColumns.has(c.key));
  }, [resolvedColumns, hiddenColumns]);

  // Client-side search and filtering
  const filteredData = useMemo(() => {
    if (!internalSearch.trim()) return data;
    const kw = internalSearch.toLowerCase().trim();
    return data.filter(row => {
      return Object.entries(row).some(([_, val]) => {
        if (val === null || val === undefined) return false;
        return String(val).toLowerCase().includes(kw);
      });
    });
  }, [data, internalSearch]);

  // Client-side sorting (if not delegated to external onSortChange)
  const sortedData = useMemo(() => {
    if (!sortColumn) return filteredData;
    const sorted = [...filteredData];
    const colConfig = resolvedColumns.find(c => c.key === sortColumn);
    const isNum = colConfig?.type === 'float' || colConfig?.type === 'integer' || colConfig?.align === 'end';

    sorted.sort((a, b) => {
      const valA = a[sortColumn];
      const valB = b[sortColumn];

      if (valA === valB) return 0;
      if (valA === null || valA === undefined || valA === '') return 1;
      if (valB === null || valB === undefined || valB === '') return -1;

      if (isNum) {
        const numA = typeof valA === 'number' ? valA : Number(String(valA).replace(/[\$,\s%]/g, ''));
        const numB = typeof valB === 'number' ? valB : Number(String(valB).replace(/[\$,\s%]/g, ''));
        if (!isNaN(numA) && !isNaN(numB)) {
          return sortDirection === 'asc' ? numA - numB : numB - numA;
        }
      }

      const comp = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
      return sortDirection === 'asc' ? comp : -comp;
    });

    return sorted;
  }, [filteredData, sortColumn, sortDirection, resolvedColumns]);

  // Quick statistics preview for header tooltips
  const columnStatsMap = useMemo(() => {
    const map: Record<string, { total: number; nulls: number; distinct: number; min?: number; max?: number }> = {};
    if (!data || data.length === 0) return map;

    resolvedColumns.forEach(col => {
      const vals = data.map(r => r[col.key]);
      const nulls = vals.filter(v => v === null || v === undefined || v === '').length;
      const validVals = vals.filter(v => v !== null && v !== undefined && v !== '');
      const distinctSet = new Set(validVals.map(v => String(v)));

      let min: number | undefined = undefined;
      let max: number | undefined = undefined;
      if (col.type === 'float' || col.type === 'integer' || col.type === 'number') {
        const numVals = validVals.map(v => Number(v)).filter(n => !isNaN(n));
        if (numVals.length > 0) {
          min = Math.min(...numVals);
          max = Math.max(...numVals);
        }
      }

      map[col.key] = {
        total: data.length,
        nulls,
        distinct: distinctSet.size,
        min,
        max,
      };
    });
    return map;
  }, [data, resolvedColumns]);

  // Pagination slicing
  const totalRecords = sortedData.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const currentPageSafe = Math.min(currentPage, totalPages);

  const paginatedData = useMemo(() => {
    const start = (currentPageSafe - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPageSafe, pageSize]);

  const handleSort = (columnKey: string) => {
    let nextDir: 'asc' | 'desc' = 'asc';
    let nextCol: string | null = columnKey;

    if (sortColumn === columnKey) {
      if (sortDirection === 'asc') {
        nextDir = 'desc';
      } else {
        nextCol = null;
      }
    }

    setSortColumn(nextCol);
    setSortDirection(nextDir);
    setCurrentPage(1);

    if (onSortChange && nextCol) {
      onSortChange(nextCol, nextDir);
    }
  };

  const handleCopyCell = (val: any, cellId: string) => {
    if (val === null || val === undefined) return;
    navigator.clipboard?.writeText(String(val));
    setCopiedCell(cellId);
    setTimeout(() => setCopiedCell(null), 1800);
  };

  const toggleSelectAll = () => {
    if (!onSelectionChange) return;
    if (selectedRows && selectedRows.size >= paginatedData.length) {
      onSelectionChange(new Set());
    } else {
      const allIndices = new Set<number>();
      paginatedData.forEach((_, i) => allIndices.add(i));
      onSelectionChange(allIndices);
    }
  };

  const toggleSelectRow = (index: number) => {
    if (!onSelectionChange) return;
    const next = new Set(selectedRows || []);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    onSelectionChange(next);
  };

  const toggleColumnVisibility = (key: string) => {
    setHiddenColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        if (visibleColumns.length > 1) {
          next.add(key);
        }
      }
      return next;
    });
  };

  // Density padding styles
  const densityStyles = {
    compact: 'py-2 px-3 text-xs leading-tight',
    normal: 'py-2.5 px-4 text-xs',
    tall: 'py-3.5 px-4 text-sm',
  };

  const headerDensityStyles = {
    compact: 'py-2 px-3 text-xs',
    normal: 'py-3 px-4 text-xs',
    tall: 'py-3.5 px-4 text-xs',
  };

  const getTypeDescription = (type?: string) => {
    if (language === 'ar') {
      switch (type) {
        case 'float':
        case 'integer':
        case 'number':
          return { label: 'رقم كمي (مقياس)', desc: 'قيم عددية تدعم العمليات الحسابية والإحصائية', icon: Hash, color: '#33b1ff' };
        case 'date':
          return { label: 'تاريخ زمني (بُعد)', desc: 'طوابع زمنية تدعم الترتيب والتحليل الزمني', icon: Calendar, color: '#42be65' };
        case 'boolean':
          return { label: 'قيمة منطقية', desc: 'حالة ثنائية (صواب/خطأ أو 1/0)', icon: ToggleLeft, color: '#f1c21b' };
        default:
          return { label: 'نص تصنيفي (بُعد)', desc: 'نصوص وصفية وفئات لتجميع وتصفية البيانات', icon: Type, color: '#be95ff' };
      }
    }
    switch (type) {
      case 'float':
      case 'integer':
      case 'number':
        return { label: 'Numeric Metric', desc: 'Quantitative values supporting mathematical aggregations', icon: Hash, color: '#33b1ff' };
      case 'date':
        return { label: 'Temporal Dimension', desc: 'Timestamps and dates supporting trend analysis', icon: Calendar, color: '#42be65' };
      case 'boolean':
        return { label: 'Boolean Flag', desc: 'Binary state condition (True/False)', icon: ToggleLeft, color: '#f1c21b' };
      default:
        return { label: 'Categorical Dimension', desc: 'Categorical labels for grouping and slicing', icon: Type, color: '#be95ff' };
    }
  };

  return (
    <div id={id} className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] flex flex-col w-full text-[var(--cds-text-01)] font-sans antialiased shadow-lg">
      {/* 1. Carbon Data Table Toolbar */}
      <div className="bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)] p-3 sm:p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          {title && (
            <div className="flex items-center gap-2">
              <TableIcon className="w-4 h-4 text-[#0f62fe]" />
              <h3 className="text-sm font-bold text-[#ffffff] tracking-tight">{title}</h3>
            </div>
          )}
          {description && (
            <span className="text-xs font-mono text-[var(--cds-text-02)] bg-[var(--cds-layer-01)] px-2 py-0.5 border border-[var(--cds-border-subtle)]">
              {description}
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Search */}
          {searchable && (
            <div className="relative flex-1 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-[var(--cds-text-02)]" />
              <input
                type="text"
                value={internalSearch}
                onChange={e => {
                  setInternalSearch(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder={searchPlaceholder || (language === 'ar' ? 'بحث في الجدول...' : 'Search table...')}
                className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] focus:border-[#0f62fe] text-[#ffffff] placeholder-[#8d8d8d] ps-8 pe-3 py-1.5 text-xs font-mono outline-none transition-colors"
              />
              {internalSearch && (
                <button
                  onClick={() => setInternalSearch('')}
                  className="absolute end-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--cds-text-02)] hover:text-[#ffffff] font-mono px-1"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Density Toggle */}
          {showDensityToggle && (
            <div className="flex items-center border border-[var(--cds-border-strong)] bg-[var(--cds-layer-01)]">
              {(['compact', 'normal', 'tall'] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setDensity(d)}
                  className={`px-2 py-1.5 text-[11px] font-mono capitalize transition-colors ${
                    density === d
                      ? 'bg-[#0f62fe] text-[#ffffff] font-bold'
                      : 'text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-03)] hover:text-[#ffffff]'
                  }`}
                  title={`Density: ${d}`}
                >
                  {d[0].toUpperCase()}
                </button>
              ))}
            </div>
          )}

          {/* Zebra Toggle */}
          {showZebraToggle && (
            <button
              onClick={() => setIsZebra(!isZebra)}
              className={`px-2.5 py-1.5 border text-xs font-mono flex items-center gap-1.5 transition-colors ${
                isZebra
                  ? 'bg-[#0f62fe]/20 border-[#0f62fe] text-[#33b1ff] font-bold'
                  : 'bg-[var(--cds-layer-01)] border-[var(--cds-border-strong)] text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-03)] hover:text-[#ffffff]'
              }`}
              title="Toggle Zebra striping"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{language === 'ar' ? 'تخطيط' : 'Zebra'}</span>
            </button>
          )}

          {/* Column Visibility Selector */}
          <div className="relative">
            <button
              onClick={() => setShowColumnPicker(!showColumnPicker)}
              className="px-2.5 py-1.5 bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] hover:bg-[var(--cds-layer-03)] text-[#ffffff] text-xs font-mono flex items-center gap-1.5 transition-colors"
              title="Column visibility"
            >
              <EyeOff className="w-3.5 h-3.5 text-[#33b1ff]" />
              <span>{language === 'ar' ? 'الأعمدة' : 'Columns'}</span>
              <span className="text-[10px] text-[#0f62fe] bg-[#0f62fe]/20 px-1 py-0.2 font-bold">
                {visibleColumns.length}
              </span>
            </button>

            {showColumnPicker && (
              <div className="absolute end-0 mt-1 w-52 bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] shadow-2xl p-2 z-50 text-xs font-mono space-y-1">
                <div className="flex items-center justify-between pb-1 mb-1 border-b border-[var(--cds-border-subtle)] text-[var(--cds-text-02)]">
                  <span className="font-bold">{language === 'ar' ? 'إظهار الأعمدة' : 'Toggle Columns'}</span>
                  <button
                    onClick={() => setHiddenColumns(new Set())}
                    className="text-[10px] text-[#0f62fe] hover:underline"
                  >
                    {language === 'ar' ? 'إظهار الكل' : 'Show All'}
                  </button>
                </div>
                {resolvedColumns.map(col => (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 p-1 hover:bg-[var(--cds-layer-03)] text-[var(--cds-text-01)] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={!hiddenColumns.has(col.key)}
                      onChange={() => toggleColumnVisibility(col.key)}
                      className="accent-[#0f62fe]"
                    />
                    <span className="truncate">{language === 'ar' && col.headerAr ? col.headerAr : col.header}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Centralized Export Action Button */}
          <button
            onClick={() => setShowExportModal(true)}
            className="px-3 py-1.5 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-xs font-mono font-bold flex items-center gap-1.5 transition-colors shadow-xs rounded cursor-pointer"
            title={language === 'ar' ? 'فتح خيارات التصدير المركزية (CSV, JSON, Excel, PDF)' : 'Open Centralized Export Hub (CSV, JSON, Excel, PDF)'}
          >
            <Download className="w-3.5 h-3.5" />
            <span>{language === 'ar' ? 'تصدير البيانات' : 'Export Data'}</span>
          </button>

          {toolbarActions}
        </div>
      </div>

      {/* 2. Main Carbon Table Body with High Contrast & Tooltip */}
      <div
        className="overflow-x-auto relative scrollbar-thin scrollbar-thumb-[#525252] scrollbar-track-[#161616]"
        style={{ maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight }}
      >
        <table className="w-full text-start border-collapse font-mono">
          {/* Carbon Column Headers with Enhanced Contrast & IBM Tooltips */}
          <thead className="bg-[var(--cds-layer-01)] border-b-2 border-[var(--cds-border-strong)] sticky top-0 z-20 select-none">
            <tr>
              {selectable && (
                <th className="px-3 py-3 w-10 text-center bg-[var(--cds-layer-01)] border-e border-[var(--cds-border-subtle)]">
                  <input
                    type="checkbox"
                    checked={paginatedData.length > 0 && selectedRows?.size === paginatedData.length}
                    onChange={toggleSelectAll}
                    className="accent-[#0f62fe] cursor-pointer"
                  />
                </th>
              )}

              <th className="px-3 py-3 w-12 text-center text-[var(--cds-text-02)] text-[11px] font-bold bg-[var(--cds-layer-01)] border-e border-[var(--cds-border-subtle)]">
                #
              </th>

              {visibleColumns.map(col => {
                const isSorted = sortColumn === col.key;
                const alignClass =
                  col.align === 'end'
                    ? 'text-end justify-end'
                    : col.align === 'center'
                    ? 'text-center justify-center'
                    : 'text-start justify-start';

                const typeInfo = getTypeDescription(col.type);
                const stats = columnStatsMap[col.key];
                const isHovered = hoveredHeaderKey === col.key;

                return (
                  <th
                    key={col.key}
                    onMouseEnter={() => setHoveredHeaderKey(col.key)}
                    onMouseLeave={() => setHoveredHeaderKey(null)}
                    onClick={() => col.sortable !== false && handleSort(col.key)}
                    style={{ width: col.width }}
                    className={`${headerDensityStyles[density]} font-bold text-[#ffffff] bg-[var(--cds-layer-01)] border-e border-[var(--cds-border-subtle)] whitespace-nowrap transition-colors relative group/th ${
                      col.sortable !== false ? 'cursor-pointer hover:bg-[var(--cds-layer-02)] hover:text-[#ffffff]' : ''
                    } ${isSorted ? 'bg-[var(--cds-layer-02)] border-b-2 border-b-[#0f62fe]' : ''}`}
                  >
                    <div className={`flex items-center gap-2 ${alignClass}`}>
                      <span className="tracking-tight text-sm text-[#ffffff] font-bold">
                        {language === 'ar' && col.headerAr ? col.headerAr : col.header}
                      </span>

                      {/* Header Info Tooltip Trigger Icon */}
                      <Info className="w-3 h-3 text-[var(--cds-text-03)] group-hover/th:text-[#33b1ff] transition-colors" />

                      {col.sortable !== false && (
                        <div className="shrink-0 flex items-center">
                          {isSorted ? (
                            sortDirection === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-[#0f62fe]" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-[#0f62fe]" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-[var(--cds-text-03)] group-hover/th:text-[#ffffff]" />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Data Type Indicator Badge */}
                    {col.type && (
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider block mt-0.5`}
                        style={{ color: typeInfo.color }}
                      >
                        {col.type}
                      </span>
                    )}

                    {/* IBM Carbon Compliant Tooltip */}
                    {isHovered && (
                      <div
                        role="tooltip"
                        className="absolute start-1/2 -translate-x-1/2 top-full mt-1.5 w-64 bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] p-3 text-xs font-mono shadow-2xl z-50 text-start pointer-events-none rounded-none"
                      >
                        {/* Carbon Accent Top Line */}
                        <div className="h-1 bg-[#0f62fe] -mx-3 -mt-3 mb-2" />

                        {/* Title & Type Badge */}
                        <div className="flex items-center justify-between border-b border-[var(--cds-border-subtle)] pb-1.5 mb-2">
                          <div>
                            <p className="font-bold text-[#ffffff] text-xs">
                              {language === 'ar' && col.headerAr ? `${col.headerAr} (${col.header})` : col.header}
                            </p>
                            <span className="text-[10px] text-[var(--cds-text-02)] block">{typeInfo.label}</span>
                          </div>
                          <span
                            className="text-[9px] font-bold uppercase px-1.5 py-0.5 border"
                            style={{ color: typeInfo.color, borderColor: `${typeInfo.color}40`, backgroundColor: `${typeInfo.color}15` }}
                          >
                            {col.type}
                          </span>
                        </div>

                        {/* Field Description */}
                        {(col.description || col.descriptionAr) ? (
                          <p className="text-[11px] text-[var(--cds-text-02)] mb-2 leading-relaxed">
                            {language === 'ar' && col.descriptionAr ? col.descriptionAr : col.description}
                          </p>
                        ) : (
                          <p className="text-[11px] text-[var(--cds-text-02)] mb-2 leading-relaxed">
                            {typeInfo.desc}
                          </p>
                        )}

                        {/* Live Statistical Profiling Preview */}
                        {stats && (
                          <div className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] p-2 mb-2 space-y-1 text-[10px]">
                            <div className="flex justify-between text-[var(--cds-text-02)]">
                              <span>{language === 'ar' ? 'القيم الصالحة:' : 'Valid records:'}</span>
                              <strong className="text-[#ffffff]">{(stats.total - stats.nulls).toLocaleString()} / {stats.total.toLocaleString()}</strong>
                            </div>
                            <div className="flex justify-between text-[var(--cds-text-02)]">
                              <span>{language === 'ar' ? 'القيم الفريدة:' : 'Distinct count:'}</span>
                              <strong className="text-[#33b1ff]">{stats.distinct.toLocaleString()}</strong>
                            </div>
                            {stats.min !== undefined && stats.max !== undefined && (
                              <div className="flex justify-between text-[var(--cds-text-02)] pt-1 border-t border-[var(--cds-border-subtle)]">
                                <span>{language === 'ar' ? 'الأدنى / الأقصى:' : 'Min / Max:'}</span>
                                <strong className="text-[#42be65]">{stats.min.toLocaleString()} ↔ {stats.max.toLocaleString()}</strong>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Sorting Interaction Prompt */}
                        <div className="text-[10px] text-[#33b1ff] flex items-center gap-1 pt-1 border-t border-[var(--cds-border-subtle)]">
                          <ArrowUpDown className="w-3 h-3 shrink-0" />
                          <span>
                            {language === 'ar'
                              ? 'انقر لفرز العمود تصاعدياً أو تنازلياً'
                              : 'Click header to toggle Asc/Desc sort'}
                          </span>
                        </div>
                      </div>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* Table Data Rows with Maximum Dark Contrast */}
          <tbody className="divide-y divide-[var(--cds-border-subtle)]">
            {isLoading ? (
              <tr>
                <td colSpan={visibleColumns.length + (selectable ? 2 : 1)} className="p-12 text-center">
                  <div className="inline-flex items-center gap-3 text-xs font-mono text-[#0f62fe]">
                    <div className="w-4 h-4 border-2 border-[#0f62fe] border-t-transparent animate-spin" />
                    <span>Processing & Streaming Table Data...</span>
                  </div>
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + (selectable ? 2 : 1)} className="p-12 text-center">
                  <div className="max-w-sm mx-auto space-y-2 text-[var(--cds-text-02)]">
                    {emptyIcon || <Database className="w-10 h-10 text-[var(--cds-text-03)] mx-auto mb-2" />}
                    <p className="text-xs font-mono font-medium text-[var(--cds-text-01)]">
                      {emptyMessage || (language === 'ar' ? 'لا توجد سجلات مطابقة لمعايير البحث أو التصفية الحالية.' : 'No records found matching query.')}
                    </p>
                    {internalSearch && (
                      <button
                        onClick={() => setInternalSearch('')}
                        className="text-xs text-[#0f62fe] hover:underline font-mono"
                      >
                        {language === 'ar' ? 'مسح عبارة البحث' : 'Clear search query'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rowIdx) => {
                const absoluteIndex = (currentPageSafe - 1) * pageSize + rowIdx;
                const isSelected = selectedRows?.has(rowIdx);
                const isRowEven = rowIdx % 2 === 0;
                const rowBg = isSelected
                  ? 'bg-[#002d9c]/30 border-s-4 border-s-[#0f62fe]'
                  : isZebra
                  ? isRowEven
                    ? 'bg-[var(--cds-layer-01)]'
                    : 'bg-[var(--cds-layer-02)]'
                  : 'bg-[var(--cds-layer-01)]';

                return (
                  <tr
                    key={rowIdx}
                    className={`${rowBg} hover:bg-[var(--cds-layer-03)] transition-colors group relative`}
                  >
                    {selectable && (
                      <td className="px-3 py-2 text-center border-e border-[var(--cds-border-subtle)]">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(rowIdx)}
                          className="accent-[#0f62fe] cursor-pointer"
                        />
                      </td>
                    )}

                    <td className="px-3 py-2 text-center text-[var(--cds-text-03)] text-[11px] font-bold border-e border-[var(--cds-border-subtle)] group-hover:text-[#ffffff]">
                      {absoluteIndex + 1}
                    </td>

                    {visibleColumns.map(col => {
                      const val = row[col.key];
                      const cellId = `${rowIdx}-${col.key}`;
                      const isCopied = copiedCell === cellId;
                      const isNull = val === null || val === undefined || val === '';

                      const alignClass =
                        col.align === 'end'
                          ? 'text-end'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-start';

                      return (
                        <td
                          key={col.key}
                          className={`${densityStyles[density]} ${alignClass} text-[var(--cds-text-01)] border-e border-[var(--cds-border-subtle)] whitespace-nowrap relative group/cell font-mono`}
                        >
                          {col.render ? (
                            col.render(val, row, rowIdx)
                          ) : isNull ? (
                            <span className="text-[10px] text-[var(--cds-text-03)] italic">NULL</span>
                          ) : typeof val === 'boolean' ? (
                            <span
                              className={`px-1.5 py-0.5 text-[10px] font-bold ${
                                val
                                  ? 'bg-[#24a148]/25 text-[#42be65] border border-[#24a148]/50'
                                  : 'bg-[#da1e28]/25 text-[#ff8389] border border-[#da1e28]/50'
                              }`}
                            >
                              {String(val).toUpperCase()}
                            </span>
                          ) : typeof val === 'number' ? (
                            <span className="tabular-nums font-mono text-[#ffffff] font-semibold">
                              {val.toLocaleString(undefined, { maximumFractionDigits: 3 })}
                            </span>
                          ) : (
                            <span className="font-mono text-[var(--cds-text-01)]">{String(val)}</span>
                          )}

                          {/* Quick Copy Cell Button on Cell Hover */}
                          {!isNull && (
                            <button
                              onClick={() => handleCopyCell(val, cellId)}
                              className="absolute top-1/2 -translate-y-1/2 end-1 p-1 bg-[var(--cds-layer-02)] border border-[var(--cds-border-strong)] text-[var(--cds-text-02)] hover:text-white opacity-0 group-hover/cell:opacity-100 transition-opacity shadow-md"
                              title="Copy cell value"
                            >
                              {isCopied ? (
                                <Check className="w-2.5 h-2.5 text-[#42be65]" />
                              ) : (
                                <Copy className="w-2.5 h-2.5" />
                              )}
                            </button>
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

      {/* 3. Carbon Pagination Bar with High Contrast */}
      <div className="bg-[var(--cds-layer-01)] border-t-2 border-[var(--cds-border-strong)] px-4 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-[#ffffff]">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[var(--cds-text-02)]">{language === 'ar' ? 'صفوف لكل صفحة:' : 'Items per page:'}</span>
          <select
            value={pageSize}
            onChange={e => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] text-[#ffffff] font-bold px-2 py-1 text-xs outline-none focus:border-[#0f62fe]"
          >
            {pageSizeOptions.map(opt => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>

          <span className="text-[var(--cds-text-02)]">
            {totalRecords > 0
              ? `${(currentPageSafe - 1) * pageSize + 1}–${Math.min(currentPageSafe * pageSize, totalRecords)} of ${totalRecords.toLocaleString()} items`
              : '0 items'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* First Page */}
          <button
            disabled={currentPageSafe <= 1}
            onClick={() => setCurrentPage(1)}
            className="p-1.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-strong)] text-[#ffffff] disabled:opacity-30 disabled:hover:bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] transition-colors"
            title="First Page"
          >
            <ChevronsLeft className="w-4 h-4 rtl:rotate-180" />
          </button>

          {/* Prev Page */}
          <button
            disabled={currentPageSafe <= 1}
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            className="p-1.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-strong)] text-[#ffffff] disabled:opacity-30 disabled:hover:bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] transition-colors"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
          </button>

          {/* Page Indicator */}
          <span className="px-3 py-1 bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] text-[#ffffff] font-bold">
            {currentPageSafe} / {totalPages}
          </span>

          {/* Next Page */}
          <button
            disabled={currentPageSafe >= totalPages}
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            className="p-1.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-strong)] text-[#ffffff] disabled:opacity-30 disabled:hover:bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] transition-colors"
            title="Next Page"
          >
            <ChevronRight className="w-4 h-4 rtl:rotate-180" />
          </button>

          {/* Last Page */}
          <button
            disabled={currentPageSafe >= totalPages}
            onClick={() => setCurrentPage(totalPages)}
            className="p-1.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-strong)] text-[#ffffff] disabled:opacity-30 disabled:hover:bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] transition-colors"
            title="Last Page"
          >
            <ChevronsRight className="w-4 h-4 rtl:rotate-180" />
          </button>
        </div>
      </div>

      {/* Centralized Export Options Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title={title ? `${title} - Export` : undefined}
        data={sortedData}
        columns={resolvedColumns.map(c => ({ key: c.key, header: c.header || c.key, type: c.type }))}
        selectedRowIndices={selectedRows}
        defaultFilename={title ? title.toLowerCase().replace(/[^a-z0-9_-]/g, '_') : 'table_export'}
        language={language}
      />
    </div>
  );
};
