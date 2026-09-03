import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { AggregationFunction, FilterCondition, QueryRequest, QueryResult, WidgetType } from '../../types';
import { executeAnalyticalQuery, executeSqlOnDataset } from '../../utils/analyticsEngine';
import { ChartFactory, AGGREGATION_OPTIONS } from '../../components/charts/ChartFactory';
import { CarbonDataTable } from '../../components/common/CarbonDataTable';
import {
  Table as TableIcon,
  BarChart3,
  Filter,
  Search,
  Play,
  RotateCcw,
  Plus,
  Trash2,
  Clock,
  Terminal,
  Database,
  Code2,
  Activity,
  Layers,
  Sparkles,
  Calculator,
  Sigma,
  TrendingUp,
  Sliders,
  BarChart2,
  PieChart as PieIcon,
  LineChart as LineIcon,
} from 'lucide-react';

export const ExplorerPage: React.FC = () => {
  const { activeDataset, datasets, setActiveDatasetId, language, t } = useApp();

  // Primary interactive views: Table | Chart Analytics | Interactive SQL
  const [activeView, setActiveView] = useState<'table' | 'chart' | 'sql'>('table');
  const [selectedChartType, setSelectedChartType] = useState<WidgetType>('bar');
  const [selectedAggregation, setSelectedAggregation] = useState<AggregationFunction>('sum');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [rawSqlQuery, setRawSqlQuery] = useState('');
  const [executedSql, setExecutedSql] = useState('');
  const [selectedXAxis, setSelectedXAxis] = useState<string>('');
  const [selectedYAxis, setSelectedYAxis] = useState<string>('');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showProfiling, setShowProfiling] = useState(false);

  // Automatic state reset and re-synchronization on dataset change
  useEffect(() => {
    if (activeDataset && activeDataset.columns && activeDataset.columns.length > 0) {
      // Pick best default categorical column for X-Axis
      const catCol =
        activeDataset.columns.find(c => c.type === 'string' || c.type === 'date') ||
        activeDataset.columns[0];

      // Pick best numeric metric column for Y-Axis
      const numCol = activeDataset.columns.find(c => c.type === 'float' || c.type === 'integer');

      setSelectedXAxis(catCol.name);
      setSelectedYAxis(numCol ? numCol.name : activeDataset.columns[1]?.name || activeDataset.columns[0].name);

      const cleanTableName = activeDataset.name.replace(/\s+/g, '_').toLowerCase();
      const defaultSql = `SELECT * FROM ${cleanTableName} LIMIT 50;`;
      setRawSqlQuery(defaultSql);
      setExecutedSql('');
      setFilters([]);
      setSearchKeyword('');
      setSortColumn(null);
    }
  }, [activeDataset.id]);

  // Reactive Analytical OLAP Query Execution
  const queryResult: QueryResult = useMemo(() => {
    if (!activeDataset || !activeDataset.data) {
      return { columns: [], columnTypes: {}, rows: [], totalCount: 0, executionTimeMs: 0 };
    }

    // 1. If in SQL mode and a custom query was run
    if (activeView === 'sql' && executedSql.trim().length > 0) {
      return executeSqlOnDataset(activeDataset, executedSql, performance.now());
    }

    // 2. Structured OLAP in-memory query evaluation
    const req: QueryRequest = {
      datasetId: activeDataset.id,
      filters: filters.length > 0 ? filters : undefined,
      orderBy: sortColumn ? [{ column: sortColumn, direction: sortDirection }] : undefined,
      limit: 5000,
    };

    let res = executeAnalyticalQuery(activeDataset, req);

    // 3. Reactive Search Filter across all fields
    if (searchKeyword.trim().length > 0) {
      const kw = searchKeyword.toLowerCase().trim();
      const filtered = res.rows.filter(r =>
        Object.values(r).some(val => val !== null && val !== undefined && String(val).toLowerCase().includes(kw))
      );
      res = {
        ...res,
        rows: filtered,
        totalCount: filtered.length,
      };
    }

    return res;
  }, [activeDataset, filters, searchKeyword, sortColumn, sortDirection, activeView, executedSql]);

  // Comprehensive Statistical Engine calculating all requested metrics
  // (Average, Range, Mode, StdDev, Count, Sum, Max, Min, Median)
  const statsMetrics = useMemo(() => {
    const totalRecords = queryResult.totalCount;
    if (!selectedYAxis || totalRecords === 0) {
      return {
        count: 0,
        sum: 0,
        avg: 0,
        min: 0,
        max: 0,
        range: 0,
        mode: 0,
        stddev: 0,
        median: 0,
        distinctCategories: 0,
      };
    }

    const values = queryResult.rows
      .map(r => {
        const val = r[selectedYAxis];
        if (typeof val === 'number') return val;
        const cleaned = parseFloat(String(val).replace(/[\$,\s%]/g, ''));
        return isNaN(cleaned) ? null : cleaned;
      })
      .filter((v): v is number => v !== null);

    const count = values.length;
    if (count === 0) {
      return {
        count: 0,
        sum: 0,
        avg: 0,
        min: 0,
        max: 0,
        range: 0,
        mode: 0,
        stddev: 0,
        median: 0,
        distinctCategories: 0,
      };
    }

    // 1. Sum & Average
    const sum = values.reduce((acc, v) => acc + v, 0);
    const avg = sum / count;

    // 2. Min, Max, and Range (المدى)
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    // 3. Median (الوسيط)
    const sortedVals = [...values].sort((a, b) => a - b);
    const mid = Math.floor(count / 2);
    const median = count % 2 !== 0 ? sortedVals[mid] : (sortedVals[mid - 1] + sortedVals[mid]) / 2;

    // 4. Mode (المنوال)
    const freqMap: Record<number, number> = {};
    let maxFreq = 0;
    let modeVal = values[0];
    values.forEach(v => {
      freqMap[v] = (freqMap[v] || 0) + 1;
      if (freqMap[v] > maxFreq) {
        maxFreq = freqMap[v];
        modeVal = v;
      }
    });

    // 5. Standard Deviation (الانحراف المعياري)
    const variance = values.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / count;
    const stddev = Math.sqrt(variance);

    const categories = new Set(queryResult.rows.map(r => String(r[selectedXAxis] ?? ''))).size;

    return {
      count,
      sum: Number(sum.toFixed(2)),
      avg: Number(avg.toFixed(2)),
      min: Number(min.toFixed(2)),
      max: Number(max.toFixed(2)),
      range: Number(range.toFixed(2)),
      mode: Number(modeVal.toFixed(2)),
      stddev: Number(stddev.toFixed(2)),
      median: Number(median.toFixed(2)),
      distinctCategories: categories,
    };
  }, [queryResult.rows, queryResult.totalCount, selectedYAxis, selectedXAxis]);

  // Data Profiling metrics calculation
  const profilingMetrics = useMemo(() => {
    if (!activeDataset || !activeDataset.columns || !activeDataset.data) return [];
    
    return activeDataset.columns.map(col => {
      const values = activeDataset.data.map(r => r[col.name]);
      const totalCount = values.length;
      const missingCount = values.filter(v => v === null || v === undefined || v === '').length;
      const missingPercentage = totalCount > 0 ? (missingCount / totalCount) * 100 : 0;
      
      let outliersCount = 0;
      let min = 0, max = 0, mean = 0, stdDev = 0;
      
      if (col.type === 'integer' || col.type === 'float') {
        const numValues = values.filter(v => typeof v === 'number' && !isNaN(v)) as number[];
        if (numValues.length > 0) {
          min = Math.min(...numValues);
          max = Math.max(...numValues);
          mean = numValues.reduce((a, b) => a + b, 0) / numValues.length;
          
          // Z-score based outlier detection (threshold = 3)
          stdDev = Math.sqrt(numValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / numValues.length);
          outliersCount = stdDev > 0 ? numValues.filter(v => Math.abs((v - mean) / stdDev) > 3).length : 0;
        }
      }
      
      return {
        name: col.name,
        type: col.type,
        totalCount,
        missingCount,
        missingPercentage,
        outliersCount,
        min,
        max,
        mean,
        stdDev
      };
    });
  }, [activeDataset]);

  // Filter Management Handlers
  const handleAddFilter = useCallback(() => {
    if (!activeDataset || !activeDataset.columns.length) return;
    setFilters(prev => [
      ...prev,
      {
        column: activeDataset.columns[0].name,
        operator: 'eq',
        value: '',
      },
    ]);
  }, [activeDataset]);

  const handleRemoveFilter = useCallback((index: number) => {
    setFilters(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleFilterChange = useCallback((index: number, field: keyof FilterCondition, val: any) => {
    setFilters(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  }, []);

  const handleResetFilters = useCallback(() => {
    setFilters([]);
    setSearchKeyword('');
    setSortColumn(null);
    setExecutedSql('');
  }, []);

  const handleRunSql = useCallback(() => {
    setExecutedSql(rawSqlQuery);
  }, [rawSqlQuery]);

  const handleSetSqlPreset = useCallback((sqlPreset: string) => {
    setRawSqlQuery(sqlPreset);
    setExecutedSql(sqlPreset);
  }, []);

  const handleExportCsv = useCallback(() => {
    if (queryResult.rows.length === 0) return;
    const headers = queryResult.columns.join(',');
    const rows = queryResult.rows.map(r =>
      queryResult.columns.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(',')
    );
    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeDataset.name.replace(/\s+/g, '_')}_export.csv`;
    link.click();
  }, [queryResult, activeDataset.name]);

  const handleExportJson = useCallback(() => {
    if (queryResult.rows.length === 0) return;
    const jsonStr = JSON.stringify(queryResult.rows, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeDataset.name.replace(/\s+/g, '_')}_export.json`;
    link.click();
  }, [queryResult, activeDataset.name]);

  if (!activeDataset) {
    return (
      <div className="carbon-tile p-12 text-center text-[#c6c6c6]">
        <Database className="w-12 h-12 text-[#0f62fe] mx-auto mb-3" />
        <p className="text-sm font-mono font-bold">No active dataset selected</p>
      </div>
    );
  }

  const tableName = activeDataset.name.replace(/\s+/g, '_').toLowerCase();

  return (
    <div className="space-y-4">
      {/* Top IBM Carbon Header Control Bar */}
      <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-blue-500 uppercase tracking-wider">
            <Layers className="w-3.5 h-3.5 text-blue-500" />
            <span className="font-semibold">DATA EXPLORER & STATISTICAL OLAP ENGINE</span>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1.5">
            <h2 className="text-lg sm:text-xl font-bold text-[var(--cds-text-01)] tracking-tight">{t.explorer.title}</h2>
            {/* Dataset Selector Dropdown */}
            <select
              value={activeDataset.id}
              onChange={e => setActiveDatasetId(e.target.value)}
              className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] px-3 h-9 rounded-lg text-xs font-semibold outline-none focus:border-blue-500 transition-colors shadow-xs"
            >
              {datasets.map(ds => (
                <option key={ds.id} value={ds.id}>
                  {ds.name} ({ds.format.toUpperCase()} • {ds.rowCount.toLocaleString()} rows)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] p-1 rounded-xl flex items-center gap-1 shadow-xs">
            <button
              onClick={() => {
                setActiveView('table');
                setExecutedSql('');
              }}
              className={`h-8 px-3 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
                activeView === 'table' ? 'bg-blue-600 text-white shadow-xs' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] hover:bg-[var(--cds-layer-03)]'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>{t.explorer.viewTable}</span>
            </button>
            <button
              onClick={() => {
                setActiveView('chart');
                setExecutedSql('');
              }}
              className={`h-8 px-3 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
                activeView === 'chart' ? 'bg-blue-600 text-white shadow-xs' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] hover:bg-[var(--cds-layer-03)]'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>{t.explorer.viewCharts}</span>
            </button>
            <button
              onClick={() => setActiveView('sql')}
              className={`h-8 px-3 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
                activeView === 'sql' ? 'bg-blue-600 text-white shadow-xs' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] hover:bg-[var(--cds-layer-03)]'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>SQL Query</span>
            </button>
            <div className="w-[1px] h-4 bg-[var(--cds-border-subtle)] mx-1"></div>
            <button
              onClick={() => setShowProfiling(!showProfiling)}
              className={`h-8 px-3 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
                showProfiling ? 'bg-amber-500 text-white shadow-xs' : 'text-[var(--cds-text-02)] hover:text-amber-500 hover:bg-[var(--cds-layer-03)]'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>{language === 'ar' ? 'ملف الجودة' : 'Profiling'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Comprehensive Statistical KPI Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* 1. Count */}
        <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-xl p-3.5 hover:border-[var(--cds-border-strong)] transition-all shadow-xs">
          <span className="text-xs font-medium text-[var(--cds-text-03)] block truncate">
            {language === 'ar' ? 'العدد (Count)' : 'Count'}
          </span>
          <div className="text-xl font-bold font-mono text-[var(--cds-text-01)] mt-1">
            {statsMetrics.count.toLocaleString()}
          </div>
        </div>

        {/* 2. Total Sum */}
        <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-xl p-3.5 hover:border-[var(--cds-border-strong)] transition-all shadow-xs">
          <span className="text-xs font-medium text-[var(--cds-text-03)] block truncate">
            {language === 'ar' ? 'الإجمالي (Sum)' : 'Sum'}
          </span>
          <div className="text-xl font-bold font-mono text-blue-500 mt-1 truncate">
            {statsMetrics.sum.toLocaleString()}
          </div>
        </div>

        {/* 3. Average / Mean */}
        <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-xl p-3.5 hover:border-[var(--cds-border-strong)] transition-all shadow-xs">
          <span className="text-xs font-medium text-[var(--cds-text-03)] block truncate">
            {language === 'ar' ? 'المتوسط (Avg)' : 'Average'}
          </span>
          <div className="text-xl font-bold font-mono text-emerald-500 mt-1 truncate">
            {statsMetrics.avg.toLocaleString()}
          </div>
        </div>

        {/* 4. Range */}
        <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-xl p-3.5 hover:border-[var(--cds-border-strong)] transition-all shadow-xs">
          <span className="text-xs font-medium text-[var(--cds-text-03)] block truncate">
            {language === 'ar' ? 'المدى (Range)' : 'Range (Max-Min)'}
          </span>
          <div className="text-xl font-bold font-mono text-amber-500 mt-1 truncate">
            {statsMetrics.range.toLocaleString()}
          </div>
        </div>

        {/* 5. Standard Deviation */}
        <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-xl p-3.5 hover:border-[var(--cds-border-strong)] transition-all shadow-xs">
          <span className="text-xs font-medium text-[var(--cds-text-03)] block truncate">
            {language === 'ar' ? 'الانحراف (StdDev)' : 'Std Deviation'}
          </span>
          <div className="text-xl font-bold font-mono text-purple-500 mt-1 truncate">
            {statsMetrics.stddev.toLocaleString()}
          </div>
        </div>

        {/* 6. Mode & Min/Max */}
        <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-xl p-3.5 hover:border-[var(--cds-border-strong)] transition-all shadow-xs">
          <span className="text-xs font-medium text-[var(--cds-text-03)] block truncate">
            {language === 'ar' ? 'المنوال / الأصغر / الأكبر' : 'Mode / Min / Max'}
          </span>
          <div className="text-xs font-bold font-mono text-[var(--cds-text-01)] mt-1 space-y-0.5 truncate">
            <div>Mode: <strong className="text-blue-500">{statsMetrics.mode}</strong></div>
            <div className="text-[11px] text-[var(--cds-text-03)]">[{statsMetrics.min} ↔ {statsMetrics.max}]</div>
          </div>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-4 items-start">
        <div className={`flex-1 space-y-4 w-full ${showProfiling ? 'xl:max-w-[calc(100%-350px)]' : ''}`}>
          {/* SQL Interactive Console View */}
          {activeView === 'sql' && (
        <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-xl p-4 space-y-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-blue-500" />
              <span className="text-xs font-semibold text-[var(--cds-text-01)] uppercase tracking-wide">
                Interactive OLAP SQL Console
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[var(--cds-text-03)]">Presets:</span>
              <button
                onClick={() => handleSetSqlPreset(`SELECT * FROM ${tableName} LIMIT 25;`)}
                className="px-2.5 py-1 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] rounded-md text-[11px] font-medium transition-colors"
              >
                Select 25
              </button>
              <button
                onClick={() => handleSetSqlPreset(`SELECT ${selectedXAxis}, SUM(${selectedYAxis}) AS total_${selectedYAxis} FROM ${tableName} GROUP BY ${selectedXAxis} ORDER BY total_${selectedYAxis} DESC LIMIT 10;`)}
                className="px-2.5 py-1 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] rounded-md text-[11px] font-medium transition-colors"
              >
                Top 10 GroupBy
              </button>
              <button
                onClick={() => handleSetSqlPreset(`SELECT * FROM ${tableName} WHERE ${selectedYAxis} > 0 ORDER BY ${selectedYAxis} DESC LIMIT 50;`)}
                className="px-2.5 py-1 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] rounded-md text-[11px] font-medium transition-colors"
              >
                Sort Desc
              </button>
            </div>
          </div>

          <div className="relative">
            <textarea
              value={rawSqlQuery}
              onChange={e => setRawSqlQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  handleRunSql();
                }
              }}
              rows={3}
              className="w-full bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] focus:border-blue-500 rounded-lg p-3 text-xs font-mono text-[var(--cds-text-01)] outline-none transition-all"
              placeholder={`SELECT * FROM ${tableName} WHERE ...`}
            />
          </div>

          <div className="flex flex-wrap justify-between items-center text-xs gap-2">
            <span className="text-[var(--cds-text-03)] text-[11px]">
              Press <kbd className="px-1.5 py-0.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] rounded font-mono">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] rounded font-mono">Enter</kbd> to execute
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setRawSqlQuery(`SELECT * FROM ${tableName} LIMIT 50;`);
                  setExecutedSql('');
                }}
                className="h-9 px-3.5 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] text-xs font-semibold rounded-lg transition-colors"
              >
                {t.explorer.resetFilters}
              </button>
              <button
                onClick={handleRunSql}
                className="h-9 bg-blue-600 hover:bg-blue-500 active:scale-98 text-white px-4 text-xs font-semibold rounded-lg flex items-center gap-2 shadow-sm transition-all"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{t.explorer.runQuery}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter Parameters and Real-time Search Box */}
      <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-xl p-4 space-y-3 shadow-sm">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-[var(--cds-text-03)] absolute top-1/2 -translate-y-1/2 start-3" />
            <input
              type="text"
              value={searchKeyword}
              onChange={e => setSearchKeyword(e.target.value)}
              placeholder={language === 'ar' ? 'بحث فوري وفلترة نصية عبر كافة السجلات والحقول...' : 'Instant filter by keyword across all fields...'}
              className="w-full bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] focus:border-blue-500 rounded-lg ps-9 pe-4 h-9 text-xs text-[var(--cds-text-01)] placeholder-[var(--cds-text-03)] outline-none transition-all"
            />
          </div>

          <button
            onClick={handleAddFilter}
            className="h-9 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] hover:bg-[var(--cds-layer-03)] text-[var(--cds-text-01)] px-3.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shrink-0 transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 text-blue-500" />
            <span>{t.explorer.addFilter}</span>
          </button>
        </div>

        {/* Dynamic Filter Conditions list */}
        {filters.length > 0 && (
          <div className="p-3 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg space-y-2.5">
            <div className="flex items-center justify-between text-xs font-semibold text-[var(--cds-text-01)]">
              <span className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-blue-500" />
                <span>{language === 'ar' ? 'شروط التصفية النشطة' : 'Active Filter Conditions'}</span>
                <span className="text-[10px] bg-blue-500/15 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-mono font-bold">
                  {filters.length}
                </span>
              </span>
              <button
                onClick={handleResetFilters}
                className="text-[11px] text-rose-500 hover:underline flex items-center gap-1 font-medium"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{t.explorer.resetFilters}</span>
              </button>
            </div>

            <div className="space-y-2">
              {filters.map((f, idx) => (
                <div key={idx} className="flex flex-wrap items-center gap-2">
                  <select
                    value={f.column}
                    onChange={e => handleFilterChange(idx, 'column', e.target.value)}
                    className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] px-3 h-8 rounded-md text-xs font-medium text-[var(--cds-text-01)] outline-none focus:border-blue-500"
                  >
                    {activeDataset.columns.map(c => (
                      <option key={c.name} value={c.name}>
                        {c.name} ({c.type})
                      </option>
                    ))}
                  </select>

                  <select
                    value={f.operator}
                    onChange={e => handleFilterChange(idx, 'operator', e.target.value as any)}
                    className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] px-3 h-8 rounded-md text-xs font-medium text-[var(--cds-text-01)] outline-none focus:border-blue-500"
                  >
                    <option value="eq">= ({language === 'ar' ? 'يساوي' : 'Equal'})</option>
                    <option value="neq">!= ({language === 'ar' ? 'لا يساوي' : 'Not Equal'})</option>
                    <option value="contains">{language === 'ar' ? 'يحتوي على' : 'contains'}</option>
                    <option value="gt">&gt; ({language === 'ar' ? 'أكبر من' : 'Greater'})</option>
                    <option value="gte">&gt;= ({language === 'ar' ? 'أكبر أو يساوي' : 'Greater or Eq'})</option>
                    <option value="lt">&lt; ({language === 'ar' ? 'أصغر من' : 'Less'})</option>
                    <option value="lte">&lt;= ({language === 'ar' ? 'أصغر أو يساوي' : 'Less or Eq'})</option>
                    <option value="is_null">IS NULL ({language === 'ar' ? 'قيمة فارغة' : 'Empty'})</option>
                    <option value="is_not_null">IS NOT NULL ({language === 'ar' ? 'غير فارغ' : 'Not Empty'})</option>
                  </select>

                  {f.operator !== 'is_null' && f.operator !== 'is_not_null' && (
                    <input
                      type="text"
                      value={f.value}
                      onChange={e => handleFilterChange(idx, 'value', e.target.value)}
                      placeholder={t.explorer.filterValue}
                      className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] px-3 h-8 rounded-md text-xs font-medium text-[var(--cds-text-01)] flex-1 min-w-[140px] outline-none focus:border-blue-500"
                    />
                  )}

                  <button
                    onClick={() => handleRemoveFilter(idx)}
                    className="w-8 h-8 rounded-md bg-[var(--cds-layer-03)] hover:bg-rose-500 hover:text-white text-[var(--cds-text-03)] flex items-center justify-center transition-colors"
                    title="Remove filter condition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Telemetry Status Bar */}
        <div className="flex flex-wrap items-center justify-between text-xs font-mono text-[var(--cds-text-03)] pt-2 border-t border-[var(--cds-border-subtle)] gap-2">
          <div className="flex flex-wrap items-center gap-4">
            <span>
              <strong className="text-[var(--cds-text-01)]">{queryResult.totalCount.toLocaleString()}</strong> {t.explorer.totalRecords}
            </span>
            <span className="flex items-center gap-1 text-blue-500">
              <Clock className="w-3.5 h-3.5" />
              <span>{queryResult.executionTimeMs}ms execution</span>
            </span>
            {sortColumn && (
              <span className="text-[var(--cds-text-01)]">
                Sorted by: <code className="text-blue-500">{sortColumn}</code> ({sortDirection.toUpperCase()})
              </span>
            )}
          </div>
          <span className="text-[11px] text-[var(--cds-text-03)]">
            In-Memory Columnar Engine • Realtime Synchronized
          </span>
        </div>
      </div>

      {/* Main Reactive Data Display: Unified CarbonDataTable vs Chart Visualizations */}
      {activeView === 'table' || activeView === 'sql' ? (
        <CarbonDataTable
          id="explorer-carbon-table"
          data={queryResult.rows}
          columnMeta={activeDataset.columns}
          title={`${activeDataset.name}`}
          description={
            activeView === 'sql' && executedSql
              ? executedSql
              : `${queryResult.totalCount.toLocaleString()} ${language === 'ar' ? 'سجل مطابق' : 'matched rows'}`
          }
          language={language}
          onExportCsv={handleExportCsv}
          onExportJson={handleExportJson}
          onSortChange={(col, dir) => {
            setSortColumn(col);
            setSortDirection(dir);
          }}
          initialSortColumn={sortColumn || undefined}
          initialSortDirection={sortDirection}
        />
      ) : (
        /* Visual Recharts Explorer View with Math Aggregations */
        <div className="space-y-4">
          <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-xl p-4 flex flex-wrap items-center gap-3.5 text-xs shadow-sm">
            {/* Chart Type Selector */}
            <div className="flex items-center gap-2">
              <span className="text-[var(--cds-text-02)] font-semibold">{language === 'ar' ? 'نوع المخطط:' : 'Chart Type:'}</span>
              <select
                value={selectedChartType}
                onChange={e => setSelectedChartType(e.target.value as WidgetType)}
                className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] font-medium px-3 h-8 rounded-lg outline-none focus:border-blue-500"
              >
                <option value="bar">Bar Chart (أعمدة بيانية)</option>
                <option value="line">Line Trend (مسار خطي)</option>
                <option value="area">Area Chart (مخطط مساحة)</option>
                <option value="pie">Pie Chart (توزيع دائري)</option>
                <option value="scatter">Scatter Plot (مخطط مبعثر)</option>
                <option value="radar">Radar Chart (مخطط راداري/عنكبوتي)</option>
              </select>
            </div>

            {/* X-Axis Dimension */}
            <div className="flex items-center gap-2">
              <span className="text-[var(--cds-text-02)] font-semibold">{language === 'ar' ? 'محور X (التصنيف):' : 'X-Axis:'}</span>
              <select
                value={selectedXAxis}
                onChange={e => setSelectedXAxis(e.target.value)}
                className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] font-medium px-3 h-8 rounded-lg outline-none focus:border-blue-500"
              >
                {activeDataset.columns.map(c => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
            </div>

            {/* Y-Axis Metric */}
            <div className="flex items-center gap-2">
              <span className="text-[var(--cds-text-02)] font-semibold">{language === 'ar' ? 'محور Y (المقياس):' : 'Y-Axis:'}</span>
              <select
                value={selectedYAxis}
                onChange={e => setSelectedYAxis(e.target.value)}
                className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] font-medium px-3 h-8 rounded-lg outline-none focus:border-blue-500"
              >
                {activeDataset.columns.map(c => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
            </div>

            {/* Statistical & Mathematical Function Selector (User Request) */}
            <div className="flex items-center gap-2 bg-[var(--cds-layer-02)] border border-blue-500/30 rounded-lg px-2.5 h-8">
              <Calculator className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-blue-500 font-semibold">
                {language === 'ar' ? 'الدالة الرياضية / الإحصائية:' : 'Math Aggregation:'}
              </span>
              <select
                value={selectedAggregation}
                onChange={e => setSelectedAggregation(e.target.value as AggregationFunction)}
                className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] font-semibold px-2.5 py-1 text-xs rounded-md outline-none focus:border-blue-500"
              >
                <optgroup label={language === 'ar' ? 'مقاييس النزعة المركزية' : 'Central Tendency'}>
                  {AGGREGATION_OPTIONS.filter(o => o.category === 'central').map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.symbol} {language === 'ar' ? opt.labelAr : opt.labelEn}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={language === 'ar' ? 'مقاييس التشتت والتباين' : 'Dispersion & Spread'}>
                  {AGGREGATION_OPTIONS.filter(o => o.category === 'dispersion').map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.symbol} {language === 'ar' ? opt.labelAr : opt.labelEn}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={language === 'ar' ? 'المقاييس المئوية والاحتمالية' : 'Percentiles & Probabilistic'}>
                  {AGGREGATION_OPTIONS.filter(o => o.category === 'percentile').map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.symbol} {language === 'ar' ? opt.labelAr : opt.labelEn}
                    </option>
                  ))}
                </optgroup>
                <optgroup label={language === 'ar' ? 'الإجماليات والتكرارات' : 'Totals & Aggregates'}>
                  {AGGREGATION_OPTIONS.filter(o => o.category === 'aggregate').map(opt => (
                    <option key={opt.value} value={opt.value}>
                      {opt.symbol} {language === 'ar' ? opt.labelAr : opt.labelEn}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div className="text-[11px] text-blue-500 ms-auto flex items-center gap-1.5 font-medium">
              <Activity className="w-3.5 h-3.5" />
              <span>{statsMetrics.distinctCategories} distinct categories</span>
            </div>
          </div>

          {/* Interactive Recharts Canvas */}
          <div className="h-[500px] bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-xl p-4 shadow-sm">
            <ChartFactory
              dataset={activeDataset}
              customData={queryResult.rows}
              widget={{
                id: 'exp-chart',
                title: `${selectedAggregation.toUpperCase()}(${selectedYAxis}) by ${selectedXAxis}`,
                titleAr: `تحليل ${selectedAggregation} (${selectedYAxis}) حسب ${selectedXAxis}`,
                type: selectedChartType,
                datasetId: activeDataset.id,
                xAxis: selectedXAxis,
                yAxis: selectedYAxis,
                aggregation: selectedAggregation,
                w: 12,
                h: 2,
              }}
            />
          </div>
        </div>
      )}
        </div>

        {showProfiling && (
          <div className="w-full xl:w-[360px] bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-xl shadow-lg shrink-0 flex flex-col h-[calc(100vh-250px)] overflow-hidden">
            <div className="p-4 border-b border-[var(--cds-border-subtle)] flex items-center justify-between sticky top-0 bg-[var(--cds-layer-01)] z-10 shrink-0">
              <h3 className="text-sm font-bold text-[var(--cds-text-01)] flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-500" />
                {language === 'ar' ? 'ملف جودة البيانات (Data Profiling)' : 'Data Profiling'}
              </h3>
              <button
                onClick={() => setShowProfiling(false)}
                className="w-7 h-7 rounded-lg hover:bg-[var(--cds-layer-02)] text-[var(--cds-text-03)] hover:text-[var(--cds-text-01)] flex items-center justify-center transition-colors text-sm font-semibold"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              {profilingMetrics.map(col => (
                <div key={col.name} className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-blue-500 truncate" title={col.name}>{col.name}</span>
                    <span className="text-[10px] bg-[var(--cds-layer-03)] text-[var(--cds-text-02)] px-1.5 py-0.5 rounded uppercase font-mono">{col.type}</span>
                  </div>
                  
                  <div className="space-y-1.5 mt-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[var(--cds-text-03)]">Missing Values</span>
                      <span className={`font-mono font-semibold ${col.missingCount > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                        {col.missingCount} ({col.missingPercentage.toFixed(1)}%)
                      </span>
                    </div>
                    
                    {col.type === 'integer' || col.type === 'float' ? (
                      <>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-[var(--cds-text-03)]">Outliers (Z{'>'}3)</span>
                          <span className={`font-mono font-semibold ${col.outliersCount > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                            {col.outliersCount}
                          </span>
                        </div>
                        <div className="pt-2 mt-2 border-t border-[var(--cds-border-subtle)] grid grid-cols-2 gap-2 text-[10px] font-mono">
                          <div>
                            <span className="text-[var(--cds-text-03)] block">Min</span>
                            <span className="text-[var(--cds-text-01)] font-semibold">{col.min.toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="text-[var(--cds-text-03)] block">Max</span>
                            <span className="text-[var(--cds-text-01)] font-semibold">{col.max.toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="text-[var(--cds-text-03)] block">Mean</span>
                            <span className="text-[var(--cds-text-01)] font-semibold">{col.mean.toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="text-[var(--cds-text-03)] block">StdDev</span>
                            <span className="text-[var(--cds-text-01)] font-semibold">{col.stdDev.toFixed(2)}</span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="pt-2 mt-1 border-t border-[var(--cds-border-subtle)] text-[10px] text-[var(--cds-text-03)] font-mono">
                        Categorical distribution not detailed.
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
