import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Dataset, DatasetColumn, DatasetFormat } from '../../types';
import { parseUploadedFile, parseAllTablesFromFile, ParsedTableResult } from '../../utils/fileDataParser';
import { LocalCsvImportModal } from '../../components/datasets/LocalCsvImportModal';
import { MultiTableModelingModal } from '../../components/datasets/MultiTableModelingModal';
import { DataPreview } from '../../components/datasets/DataPreview';
import { DataQualityReport } from '../../components/datasets/DataQualityReport';
import { SchemaCompareModal } from '../../components/datasets/SchemaCompareModal';
import { DataLineageView } from '../../components/datasets/DataLineageView';
import { DataCleansingPanel } from './DataCleansingPanel';
import { LiveConnectorsPanel } from './LiveConnectorsPanel';
import * as XLSX from 'xlsx';
import {
  UploadCloud,
  Database,
  Plus,
  Trash2,
  CheckCircle,
  Eye,
  FileSpreadsheet,
  FileCode,
  Layers,
  Sparkles,
  BarChart2,
  Table,
  Check,
  AlertCircle,
  ChevronRight,
  HardDrive,
  Calendar,
  FileText,
  Binary,
  ShieldCheck,
  ArrowRightLeft,
  Download,
  X,
  SlidersHorizontal,
  CheckSquare,
  Square,
  AlertTriangle,
  GitFork,
  Workflow,
  Sparkle,
  WorkflowIcon,
  Loader2,
} from 'lucide-react';

export const DatasetsPage: React.FC = () => {
  const {
    datasets,
    activeDataset,
    setActiveDatasetId,
    addDataset,
    deleteDataset,
    deleteDatasets,
    setActiveTab,
    toast,
    language,
    t,
  } = useApp();
  const isAr = language === 'ar';

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showLocalCsvModal, setShowLocalCsvModal] = useState(false);
  const [showMultiTableModelingModal, setShowMultiTableModelingModal] = useState(false);
  const [multiTableResults, setMultiTableResults] = useState<ParsedTableResult[]>([]);
  const [multiTableFileName, setMultiTableFileName] = useState<string>('');
  const [dragActive, setDragActive] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedResult, setParsedResult] = useState<ParsedTableResult | null>(null);
  const [selectedSheetOrTable, setSelectedSheetOrTable] = useState<string>('');
  const [currentFile, setCurrentFile] = useState<File | null>(null);

  // Data Preview & Processing Loading State
  const [previewDatasetId, setPreviewDatasetId] = useState<string | null>(activeDataset?.id || (datasets[0]?.id ?? null));
  const [isProcessingDataset, setIsProcessingDataset] = useState<boolean>(false);

  const handleSelectDatasetForPreview = (id: string) => {
    setPreviewDatasetId(id);
    setActiveDatasetId(id);
    setIsProcessingDataset(true);
    setTimeout(() => {
      setIsProcessingDataset(false);
    }, 450);
  };

  const handleExportFullDataset = (ds: Dataset, format: 'csv' | 'xlsx') => {
    const rawData = ds.data && ds.data.length > 0 ? ds.data : [];
    if (rawData.length === 0) {
      toast.warning(
        isAr ? 'مجموعة البيانات فارغة' : 'Empty Dataset',
        isAr ? 'لا توجد سجلات متوفرة للتصدير.' : 'No records found in dataset object.'
      );
      return;
    }

    if (format === 'csv') {
      const headers = ds.columns.map(c => `"${c.name.replace(/"/g, '""')}"`).join(',');
      const rows = rawData.map(row =>
        ds.columns
          .map(col => {
            const val = row[col.name];
            if (val === null || val === undefined) return '""';
            return `"${String(val).replace(/"/g, '""')}"`;
          })
          .join(',')
      );
      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers, ...rows].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `${ds.name.toLowerCase().replace(/\s+/g, '_')}_full_${rawData.length}_records.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(
        isAr ? 'تم تصدير مجموعة البيانات بالكامل (CSV)' : 'Exported Full Dataset (CSV)',
        isAr ? `تم تصدير ${rawData.length.toLocaleString()} سجلاً كاملاً.` : `Successfully exported ${rawData.length.toLocaleString()} records to CSV.`
      );
    } else {
      const cleanRows = rawData.map(row => {
        const cleanObj: Record<string, any> = {};
        ds.columns.forEach(col => {
          cleanObj[col.name] = row[col.name] ?? '';
        });
        return cleanObj;
      });

      const worksheet = XLSX.utils.json_to_sheet(cleanRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, ds.name.slice(0, 31));

      XLSX.writeFile(workbook, `${ds.name.toLowerCase().replace(/\s+/g, '_')}_full_${rawData.length}_records.xlsx`);

      toast.success(
        isAr ? 'تم تصدير ملف Excel الشامل' : 'Exported Full Excel (.xlsx)',
        isAr ? `تم تصدير ${rawData.length.toLocaleString()} سجلاً كاملاً.` : `Successfully exported ${rawData.length.toLocaleString()} records to Excel.`
      );
    }
  };

  // Multi-Selection State for Bulk Actions
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<string[]>([]);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);

  // View Mode: 'catalog', 'lineage', 'cleansing' or 'connectors'
  const [pageViewMode, setPageViewMode] = useState<'catalog' | 'lineage' | 'cleansing' | 'connectors'>('catalog');

  // Ensure preview dataset exists
  const currentPreviewDataset = useMemo(() => {
    if (!previewDatasetId) return datasets[0] || null;
    return datasets.find(d => d.id === previewDatasetId) || datasets[0] || null;
  }, [datasets, previewDatasetId]);

  // Selected datasets objects for comparison
  const selectedDatasetsForComparison = useMemo(() => {
    return datasets.filter(d => selectedDatasetIds.includes(d.id));
  }, [datasets, selectedDatasetIds]);

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedDatasetIds(datasets.map(d => d.id));
    } else {
      setSelectedDatasetIds([]);
    }
  };

  const handleToggleSelectOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedDatasetIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = () => {
    if (selectedDatasetIds.length === 0) return;
    const count = selectedDatasetIds.length;
    deleteDatasets(selectedDatasetIds);
    setSelectedDatasetIds([]);
    setShowDeleteConfirmModal(false);
    toast.success(
      isAr ? 'تم حذف مجموعات البيانات المحددة' : 'Bulk Delete Completed',
      isAr ? `تمت إزالة ${count} مجموعات بيانات بنجاح.` : `Successfully deleted ${count} selected datasets.`
    );
  };

  const handleExportSelectedSchemas = () => {
    if (selectedDatasetsForComparison.length === 0) return;
    const exportData = {
      exportedAt: new Date().toISOString(),
      datasetsCount: selectedDatasetsForComparison.length,
      datasets: selectedDatasetsForComparison.map(d => ({
        id: d.id,
        name: d.name,
        format: d.format,
        rowCount: d.rowCount,
        columnCount: d.columns.length,
        columns: d.columns,
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `selected_schemas_${selectedDatasetsForComparison.length}_datasets.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(
      isAr ? 'تم تصدير مخططات البيانات' : 'Schemas Exported',
      isAr ? `تم تصدير مخططات ${selectedDatasetsForComparison.length} مجموعات بيانات.` : `Exported schema JSON for ${selectedDatasetsForComparison.length} datasets.`
    );
  };

  // File parsing logic supporting Excel, CSV, JSON, SQL, DB/SQLite
  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement> | React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    setDragActive(false);
    setParseError(null);

    let file: File | null = null;
    if ('dataTransfer' in e && e.dataTransfer.files?.[0]) {
      file = e.dataTransfer.files[0];
    } else if ('target' in e && (e.target as HTMLInputElement).files?.[0]) {
      file = (e.target as HTMLInputElement).files![0];
    }

    if (!file) return;

    setCurrentFile(file);
    const defaultName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
    setUploadName(defaultName);

    setIsParsing(true);
    try {
      const [res, allTables] = await Promise.all([
        parseUploadedFile(file),
        parseAllTablesFromFile(file).catch(() => []),
      ]);
      setParsedResult(res);
      if (allTables && allTables.length > 0) {
        setMultiTableResults(allTables);
        setMultiTableFileName(file.name);
      } else {
        setMultiTableResults([res]);
        setMultiTableFileName(file.name);
      }
      if (res.availableSheetsOrTables && res.availableSheetsOrTables.length > 0) {
        setSelectedSheetOrTable(res.tableName);
      }
    } catch (err: any) {
      console.error('File parsing error:', err);
      setParseError(err?.message || (isAr ? 'فشل تحليل الملف. يرجى التأكد من صحة التنسيق.' : 'Failed to parse file. Please verify file format.'));
    } finally {
      setIsParsing(false);
    }
  };

  const handleSwitchSheetOrTable = async (name: string) => {
    if (!currentFile) return;
    setSelectedSheetOrTable(name);
    setIsParsing(true);
    setParseError(null);
    try {
      const res = await parseUploadedFile(currentFile, { selectedSheetOrTable: name });
      setParsedResult(res);
    } catch (err: any) {
      setParseError(err?.message || 'Failed to switch sheet or table');
    } finally {
      setIsParsing(false);
    }
  };

  const handleCreateDataset = () => {
    if (!parsedResult || parsedResult.data.length === 0) return;

    const newDs: Omit<Dataset, 'profile'> = {
      id: `ds-${Date.now()}`,
      workspaceId: 'ws-main',
      name: uploadName || parsedResult.tableName || 'Uploaded Dataset',
      description: uploadDescription || (isAr ? `مجموعة بيانات تم استيرادها بتنسيق ${parsedResult.format.toUpperCase()} مع توصيف تلقائي للمخطط.` : `Ingested ${parsedResult.format.toUpperCase()} dataset with automated schema profiling.`),
      format: parsedResult.format as DatasetFormat,
      rowCount: parsedResult.data.length,
      columnCount: parsedResult.columns.length,
      sizeBytes: parsedResult.sizeBytes || 24000,
      columns: parsedResult.columns,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      status: 'ready',
      tags: ['Custom', parsedResult.format.toUpperCase()],
      data: parsedResult.data,
    };

    addDataset(newDs);
    setPreviewDatasetId(newDs.id);
    toast.success(
      isAr ? 'تمت إضافة مجموعة البيانات بنجاح!' : 'Dataset Ingested Successfully!',
      isAr
        ? `تم استيراد ${newDs.name} (${newDs.rowCount.toLocaleString()} صف و ${newDs.columnCount} حقل).`
        : `Ingested ${newDs.name} (${newDs.rowCount.toLocaleString()} records, ${newDs.columnCount} columns).`
    );
    setShowUploadModal(false);
    setParsedResult(null);
    setCurrentFile(null);
    setUploadName('');
    setUploadDescription('');
    setParseError(null);
  };

  const getFormatBadge = (fmt: DatasetFormat) => {
    switch (fmt) {
      case 'excel':
        return <span className="carbon-tag-green">XLSX / Excel</span>;
      case 'csv':
        return <span className="carbon-tag-blue">CSV / Delimited</span>;
      case 'json':
        return <span className="carbon-tag-yellow">JSON / JSONL</span>;
      case 'sql':
        return <span className="carbon-tag-purple">SQL DDL / Dump</span>;
      case 'sqlite':
        return <span className="carbon-tag-cyan">SQLite DB (.db)</span>;
      default:
        return <span className="carbon-tag-blue">{String(fmt).toUpperCase()}</span>;
    }
  };

  const getFormatIcon = (fmt: DatasetFormat) => {
    switch (fmt) {
      case 'excel':
        return <FileSpreadsheet className="w-4 h-4 text-[#42be65]" />;
      case 'csv':
        return <FileText className="w-4 h-4 text-[#4589ff]" />;
      case 'json':
        return <FileCode className="w-4 h-4 text-[#f1c21b]" />;
      case 'sql':
        return <Database className="w-4 h-4 text-[#be95ff]" />;
      case 'sqlite':
        return <Binary className="w-4 h-4 text-[#33b1ff]" />;
      default:
        return <Database className="w-4 h-4 text-[#4589ff]" />;
    }
  };

  const isAllSelected = datasets.length > 0 && selectedDatasetIds.length === datasets.length;
  const isPartiallySelected = selectedDatasetIds.length > 0 && selectedDatasetIds.length < datasets.length;

  return (
    <div className="space-y-6">
      {/* Top Header - IBM Carbon Style */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#393939] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#0f62fe]">
              IBM CARBON / DATA REPOSITORY
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#f4f4f4] tracking-tight mt-1">{t.datasets.title}</h2>
          <p className="text-xs sm:text-sm text-[#c6c6c6] mt-0.5">{t.datasets.subtitle}</p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.xlsx, .xls, .xlsm, .ods, .csv, .db, .sqlite, .sql';
              input.onchange = async (e: any) => {
                const file = e.target?.files?.[0];
                if (!file) return;
                try {
                  const all = await parseAllTablesFromFile(file);
                  setMultiTableResults(all);
                  setMultiTableFileName(file.name);
                  setShowMultiTableModelingModal(true);
                } catch (err: any) {
                  toast.error(isAr ? 'خطأ في قراءة الملف' : 'File Parse Error', err.message);
                }
              };
              input.click();
            }}
            className="flex items-center gap-2 px-3 py-2 bg-[#8a3ffc]/20 hover:bg-[#8a3ffc]/30 border border-[#8a3ffc] text-[#be95ff] text-xs font-mono transition-colors shadow-xs cursor-pointer"
            title={isAr ? 'رفع ملف متعدد الشيتات أو الجداول ونمذجة العلاقات وحفظ الناتج أو تصديره' : 'Upload multi-sheet workbook to build joins (1:1, 1:M, M:M), save or export'}
          >
            <GitFork className="w-4 h-4 text-[#be95ff]" />
            <span className="font-bold">{isAr ? 'نمذجة شيتات Excel والعلاقات' : 'Model Excel Sheets (Joins)'}</span>
          </button>

          <button
            onClick={() => setActiveTab('datamodeling')}
            className="flex items-center gap-2 px-3 py-2 bg-[#262626] hover:bg-[#333333] border border-[#393939] text-[#c6c6c6] hover:text-white text-xs font-mono transition-colors shadow-xs"
            title={isAr ? 'استوديو نمذجة العلاقات والـ ERD الشامل' : 'Open ERD & Relational Modeling Studio'}
          >
            <Workflow className="w-4 h-4 text-[#78a9ff]" />
            <span>{isAr ? 'استوديو ERD' : 'ERD Studio'}</span>
          </button>

          <button
            onClick={() => setShowLocalCsvModal(true)}
            className="flex items-center gap-2 px-3 py-2 bg-[#262626] hover:bg-[#333333] border border-[#24a148] text-[#f4f4f4] text-xs font-mono transition-colors shadow-xs"
            title={isAr ? 'استيراد فوري بدون رفع لأي خادم خارجي' : 'Instant in-memory parsing (Zero Server Upload)'}
          >
            <ShieldCheck className="w-4 h-4 text-[#42be65]" />
            <span className="font-bold">{isAr ? 'استيراد CSV محلي (Zero-Upload)' : 'Import Local CSV (Zero-Upload)'}</span>
          </button>

          <button
            onClick={() => {
              setShowUploadModal(true);
              setParsedResult(null);
              setParseError(null);
              setCurrentFile(null);
            }}
            className="carbon-btn-primary gap-2 shadow-none"
          >
            <Plus className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">{t.datasets.uploadNew}</span>
          </button>
        </div>
      </div>

      {/* Main View Mode Selector Tabs (Catalog vs Lineage) */}
      <div className="flex items-center justify-between border-b border-[#393939] bg-[#1a1a1a] px-3 pt-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPageViewMode('catalog')}
            className={`px-4 py-2.5 text-xs font-mono font-bold flex items-center gap-2 border-b-2 transition-all ${
              pageViewMode === 'catalog'
                ? 'border-[#0f62fe] text-[#f4f4f4] bg-[#262626]'
                : 'border-transparent text-[#8d8d8d] hover:text-[#c6c6c6] hover:bg-[#222222]'
            }`}
          >
            <Table className="w-4 h-4 text-[#0f62fe]" />
            <span>{t.datasets.catalogView || (isAr ? 'كتالوج البيانات والمعاينة الحية' : 'Catalog & Live Preview')}</span>
            <span className="text-[10px] bg-[#393939] px-1.5 py-0.2 text-[#c6c6c6]">
              {datasets.length}
            </span>
          </button>

          <button
            onClick={() => setPageViewMode('lineage')}
            className={`px-4 py-2.5 text-xs font-mono font-bold flex items-center gap-2 border-b-2 transition-all ${
              pageViewMode === 'lineage'
                ? 'border-[#0f62fe] text-[#f4f4f4] bg-[#262626]'
                : 'border-transparent text-[#8d8d8d] hover:text-[#c6c6c6] hover:bg-[#222222]'
            }`}
          >
            <GitFork className="w-4 h-4 text-[#33b1ff] rotate-90" />
            <span>{t.datasets.lineageView || (isAr ? 'مسار تتبع البيانات' : 'Data Lineage')}</span>
            <span className="text-[10px] bg-[#0f62fe] text-white px-1.5 py-0.2 font-mono">
              NEW
            </span>
          </button>

          <button
            onClick={() => setPageViewMode('cleansing')}
            className={`px-4 py-2.5 text-xs font-mono font-bold flex items-center gap-2 border-b-2 transition-all ${
              pageViewMode === 'cleansing'
                ? 'border-[#0f62fe] text-[#f4f4f4] bg-[#262626]'
                : 'border-transparent text-[#8d8d8d] hover:text-[#c6c6c6] hover:bg-[#222222]'
            }`}
          >
            <Sparkle className="w-4 h-4 text-[#8a3ffc]" />
            <span>{isAr ? 'تنظيف ومعالجة البيانات' : 'Auto Data Healing'}</span>
            <span className="text-[10px] bg-[#8a3ffc] text-white px-1.5 py-0.2 font-mono">
              CLEAN
            </span>
          </button>

          <button
            onClick={() => setPageViewMode('connectors')}
            className={`px-4 py-2.5 text-xs font-mono font-bold flex items-center gap-2 border-b-2 transition-all ${
              pageViewMode === 'connectors'
                ? 'border-[#0f62fe] text-[#f4f4f4] bg-[#262626]'
                : 'border-transparent text-[#8d8d8d] hover:text-[#c6c6c6] hover:bg-[#222222]'
            }`}
          >
            <WorkflowIcon className="w-4 h-4 text-[#42be65]" />
            <span>{isAr ? 'المزامنة والربط السحابي' : 'Cloud Sync & Connectors'}</span>
            <span className="text-[10px] bg-[#24a148] text-white px-1.5 py-0.2 font-mono">
              LIVE
            </span>
          </button>
        </div>

        {pageViewMode === 'lineage' && currentPreviewDataset && (
          <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-[#8d8d8d] pb-2">
            <span>{isAr ? 'المجموعة المعروضة:' : 'Focus Dataset:'}</span>
            <span className="text-[#33b1ff] font-bold">{currentPreviewDataset.name}</span>
          </div>
        )}
      </div>

      {/* VIEW MODE 1: VISUAL DATA LINEAGE VIEW */}
      {pageViewMode === 'lineage' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <DataLineageView
            dataset={currentPreviewDataset || datasets[0]}
            onSelectDataset={id => {
              setPreviewDatasetId(id);
              setActiveDatasetId(id);
            }}
          />
        </div>
      )}

      {/* VIEW MODE 3: AUTO DATA HEALING & COMPLIANCE */}
      {pageViewMode === 'cleansing' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <DataCleansingPanel />
        </div>
      )}

      {/* VIEW MODE 4: CLOUD CONNECTORS & LIVE SYNCS */}
      {pageViewMode === 'connectors' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <LiveConnectorsPanel />
        </div>
      )}

      {/* VIEW MODE 2: CATALOG TABLE & DATA PREVIEW */}
      {pageViewMode === 'catalog' && (
        <>
          {/* Floating / Sticky Bulk Actions Toolbar */}
          {selectedDatasetIds.length > 0 && (
            <div className="bg-[#0f62fe] text-white p-3 shadow-lg flex flex-wrap items-center justify-between gap-3 animate-in slide-in-from-top-2 duration-150">
              <div className="flex items-center gap-3 font-mono text-xs">
                <span className="w-6 h-6 bg-white/20 flex items-center justify-center font-bold">
                  {selectedDatasetIds.length}
                </span>
                <span className="font-bold">
                  {isAr
                    ? `تم تحديد ${selectedDatasetIds.length} مجموعة بيانات`
                    : `${selectedDatasetIds.length} Dataset${selectedDatasetIds.length > 1 ? 's' : ''} Selected`}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Compare Schema Button */}
                <button
                  onClick={() => setShowCompareModal(true)}
                  disabled={selectedDatasetIds.length < 2}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold transition-all ${
                    selectedDatasetIds.length >= 2
                      ? 'bg-[#161616] text-white hover:bg-black shadow-xs'
                      : 'bg-white/20 text-white/50 cursor-not-allowed'
                  }`}
                  title={selectedDatasetIds.length < 2 ? (isAr ? 'اختر مجموعتين على الأقل للمقارنة' : 'Select at least 2 datasets to compare') : ''}
                >
                  <ArrowRightLeft className="w-3.5 h-3.5 text-[#33b1ff]" />
                  <span>{isAr ? 'مقارنة المخططات (Compare Schema)' : 'Compare Schema'}</span>
                </button>

                {/* Export Schemas */}
                <button
                  onClick={handleExportSelectedSchemas}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#161616] text-white hover:bg-black text-xs font-mono font-bold transition-all"
                >
                  <Download className="w-3.5 h-3.5 text-[#42be65]" />
                  <span>{isAr ? 'تصدير المخططات (JSON)' : 'Export Schemas'}</span>
                </button>

                {/* Delete Selected Button */}
                <button
                  onClick={() => setShowDeleteConfirmModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#da1e28] hover:bg-[#ba1b23] text-white text-xs font-mono font-bold transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isAr ? 'حذف المحدد' : 'Delete Selected'}</span>
                </button>

                {/* Clear Selection */}
                <button
                  onClick={() => setSelectedDatasetIds([])}
                  className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-mono transition-colors"
                >
                  {isAr ? 'إلغاء التحديد' : 'Deselect All'}
                </button>
              </div>
            </div>
          )}

          {/* Datasets Table - IBM Carbon Data Table Style */}
          <div className="carbon-tile overflow-hidden shadow-none">
            <div className="bg-[#262626] px-5 py-3.5 border-b border-[#393939] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Database className="w-4 h-4 text-[#0f62fe]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#f4f4f4]">
                  {isAr ? 'مستودع البيانات النشط' : 'Workspace Datasets Catalog'}
                </h3>
                <span className="bg-[#393939] text-[#c6c6c6] px-2 py-0.5 text-[11px] font-mono font-bold">
                  {datasets.length}
                </span>
              </div>

              <div className="flex items-center gap-3 text-[11px] font-mono text-[#8d8d8d]">
                <span className="hidden sm:inline">
                  {isAr ? 'انقر على أي صف لمعاينة أول 50 سجلاً أدناه' : 'Click any dataset row to preview top 50 records below'}
                </span>
                <span className="text-[#393939] hidden sm:inline">|</span>
                <span className="text-[#4589ff]">
                  Supports: Excel, CSV, JSON, SQL, SQLite (.db)
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-start text-xs font-sans">
                <thead className="bg-[#1f1f1f] border-b border-[#393939] text-[#c6c6c6] font-mono text-[11px] uppercase tracking-wider">
                  <tr>
                    {/* Select All Checkbox Header */}
                    <th className="px-4 py-3.5 text-center w-12 border-e border-[#393939]">
                      <input
                        type="checkbox"
                        checked={isAllSelected}
                        ref={input => {
                          if (input) input.indeterminate = isPartiallySelected;
                        }}
                        onChange={e => handleSelectAll(e.target.checked)}
                        className="w-4 h-4 rounded-none accent-[#0f62fe] bg-[#161616] border-[#525252] cursor-pointer"
                        title={isAr ? 'تحديد جميع مجموعات البيانات' : 'Select all datasets'}
                      />
                    </th>
                    <th className="px-5 py-3.5 text-start font-semibold">{t.datasets.tableHeaders.name}</th>
                    <th className="px-4 py-3.5 text-start font-semibold">{t.datasets.tableHeaders.records}</th>
                    <th className="px-4 py-3.5 text-start font-semibold">{t.datasets.tableHeaders.attributes}</th>
                    <th className="px-4 py-3.5 text-start font-semibold">{t.datasets.tableHeaders.quality}</th>
                    <th className="px-4 py-3.5 text-start font-semibold">{t.datasets.tableHeaders.format}</th>
                    <th className="px-4 py-3.5 text-start font-semibold">{t.datasets.tableHeaders.updated}</th>
                    <th className="px-5 py-3.5 text-end font-semibold">{t.datasets.tableHeaders.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#393939]">
                  {datasets.map(ds => {
                    const isActive = ds.id === activeDataset?.id;
                    const isPreviewed = ds.id === currentPreviewDataset?.id;
                    const isSelected = selectedDatasetIds.includes(ds.id);
                    const qualityScore = ds.profile?.quality.overallScore || 95;

                    return (
                      <tr
                        key={ds.id}
                        onClick={() => {
                          setActiveDatasetId(ds.id);
                          setPreviewDatasetId(ds.id);
                        }}
                        className={`cursor-pointer transition-colors ${
                          isPreviewed
                            ? 'bg-[#2a2a2a] border-s-4 border-s-[#0f62fe]'
                            : isSelected
                            ? 'bg-[#1f2937]'
                            : 'hover:bg-[#353535]'
                        }`}
                      >
                        {/* Row Multi-select Checkbox */}
                        <td
                          className="px-4 py-4 text-center border-e border-[#393939]"
                          onClick={e => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={e => handleToggleSelectOne(ds.id, e as any)}
                            className="w-4 h-4 rounded-none accent-[#0f62fe] bg-[#161616] border-[#525252] cursor-pointer"
                          />
                        </td>

                        {/* Dataset Name & Meta */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-[#161616] border border-[#393939] flex items-center justify-center shrink-0">
                              {getFormatIcon(ds.format)}
                            </div>
                            <div>
                              <div className="font-bold text-[#f4f4f4] flex items-center gap-2">
                                <span>{ds.name}</span>
                                {isActive && (
                                  <span className="carbon-tag-blue">
                                    {isAr ? 'نشطة' : 'Active'}
                                  </span>
                                )}
                                {isPreviewed && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.2 bg-[#0f62fe]/20 text-[#4589ff] border border-[#0f62fe]/40 text-[9px] font-mono">
                                    <Table className="w-2.5 h-2.5" />
                                    <span>{isAr ? 'معاينة حية' : 'Previewing'}</span>
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-[#8d8d8d] mt-0.5 line-clamp-1 max-w-sm">
                                {ds.description}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-4 font-mono text-[#f4f4f4] font-semibold">
                          {ds.rowCount.toLocaleString()}
                        </td>
                        <td className="px-4 py-4 font-mono text-[#c6c6c6]">
                          {ds.columnCount} {isAr ? 'حقل' : 'cols'}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-2 bg-[#161616] border border-[#393939] overflow-hidden">
                              <div
                                className={`h-full ${
                                  qualityScore > 85 ? 'bg-[#24a148]' : qualityScore > 70 ? 'bg-[#f1c21b]' : 'bg-[#da1e28]'
                                }`}
                                style={{ width: `${qualityScore}%` }}
                              />
                            </div>
                            <span className="font-mono text-[11px] font-bold text-[#f4f4f4]">{qualityScore}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          {getFormatBadge(ds.format)}
                        </td>
                        <td className="px-4 py-4 text-[#8d8d8d] font-mono text-[11px]">
                          {new Date(ds.updatedAt).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-4 text-end" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Visual Data Lineage Button */}
                            <button
                              onClick={() => {
                                setPreviewDatasetId(ds.id);
                                setActiveDatasetId(ds.id);
                                setPageViewMode('lineage');
                              }}
                              className="px-2.5 py-1.5 bg-[#262626] hover:bg-[#0f62fe] text-[#f4f4f4] text-[11px] font-semibold flex items-center gap-1 transition-colors border border-[#393939]"
                              title={isAr ? 'عرض مسار وتتبع البيانات الكامل' : 'View data lineage & provenance'}
                            >
                              <GitFork className="w-3.5 h-3.5 text-[#33b1ff] rotate-90" />
                              <span className="hidden xl:inline">{isAr ? 'مسار البيانات' : 'Lineage'}</span>
                            </button>

                             {/* Instant Preview Switch Button */}
                            <button
                              onClick={() => handleSelectDatasetForPreview(ds.id)}
                              className={`px-2.5 py-1.5 text-[11px] font-mono flex items-center gap-1 transition-colors cursor-pointer ${
                                isPreviewed
                                  ? 'bg-[#0f62fe] text-white font-bold'
                                  : 'bg-[#393939] hover:bg-[#4c4c4c] text-[#f4f4f4]'
                              }`}
                              title={isAr ? 'معاينة حية وتدقيق البيانات' : 'Preview dataset records'}
                            >
                              <Table className="w-3.5 h-3.5" />
                              <span className="hidden lg:inline">{isAr ? 'معاينة' : 'Preview'}</span>
                            </button>

                            {/* Export Full CSV */}
                            <button
                              onClick={() => handleExportFullDataset(ds, 'csv')}
                              className="px-2 py-1.5 bg-[#262626] hover:bg-[#393939] text-[#f4f4f4] text-[11px] font-mono flex items-center gap-1 transition-colors border border-[#393939] cursor-pointer"
                              title={isAr ? 'تصدير مجموعة البيانات الكاملة بصيغة CSV' : 'Export complete dataset to CSV'}
                            >
                              <Download className="w-3.5 h-3.5 text-[#4589ff]" />
                              <span className="hidden xl:inline">CSV</span>
                            </button>

                            {/* Export Full Excel */}
                            <button
                              onClick={() => handleExportFullDataset(ds, 'xlsx')}
                              className="px-2 py-1.5 bg-[#24a148] hover:bg-[#198038] text-white text-[11px] font-mono flex items-center gap-1 transition-colors cursor-pointer"
                              title={isAr ? 'تصدير مجموعة البيانات الكاملة بصيغة Excel' : 'Export complete dataset to Excel (.xlsx)'}
                            >
                              <FileSpreadsheet className="w-3.5 h-3.5 text-white" />
                              <span className="hidden xl:inline">XLSX</span>
                            </button>

                            <button
                              onClick={() => {
                                setActiveDatasetId(ds.id);
                                setActiveTab('explorer');
                              }}
                              className="px-2.5 py-1.5 bg-[#393939] hover:bg-[#4c4c4c] text-[#f4f4f4] text-[11px] font-semibold flex items-center gap-1 transition-colors"
                              title={isAr ? 'استعراض واستعلام' : 'Explore data'}
                            >
                              <Eye className="w-3.5 h-3.5 text-[#08bdba]" />
                              <span className="hidden xl:inline">{isAr ? 'استعراض' : 'Explore'}</span>
                            </button>
                            <button
                              onClick={() => {
                                setActiveDatasetId(ds.id);
                                setActiveTab('profiling');
                              }}
                              className="px-2.5 py-1.5 bg-[#393939] hover:bg-[#4c4c4c] text-[#f4f4f4] text-[11px] font-semibold flex items-center gap-1 transition-colors"
                              title={isAr ? 'التوصيف الإحصائي' : 'Profile schema'}
                            >
                              <BarChart2 className="w-3.5 h-3.5 text-[#f1c21b]" />
                              <span className="hidden xl:inline">{isAr ? 'توصيف' : 'Profile'}</span>
                            </button>

                            {datasets.length > 1 && (
                              <button
                                onClick={() => {
                                  deleteDataset(ds.id);
                                  if (previewDatasetId === ds.id) {
                                    const remaining = datasets.filter(d => d.id !== ds.id);
                                    if (remaining.length > 0) setPreviewDatasetId(remaining[0].id);
                                  }
                                  toast.info(
                                    isAr ? 'تم حذف مجموعة البيانات' : 'Dataset Removed',
                                    isAr ? `تمت إزالة ${ds.name} من المستودع.` : `Removed ${ds.name} from catalog.`
                                  );
                                }}
                                className="p-1.5 bg-[#393939] hover:bg-[#da1e28] text-[#8d8d8d] hover:text-white transition-colors"
                                title="Delete dataset"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Embedded High-Performance Data Preview Component (Top 50 Rows) */}
          {currentPreviewDataset && (
            <div className="space-y-2">
              <DataQualityReport
                dataset={currentPreviewDataset}
                allDatasets={datasets}
                onNavigateToHealing={() => setPageViewMode('cleansing')}
              />

              <div className="flex items-center justify-between px-1 pt-4">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#0f62fe]">
                    LIVE SAMPLE INSPECTOR
                  </span>
                  <span className="text-xs text-[#8d8d8d]">
                    ({isAr ? 'أول 50 سجلاً من مجموعة البيانات المختارة' : 'First 50 records of selected dataset'})
                  </span>
                </div>
                {datasets.length > 1 && (
                  <div className="flex items-center gap-1.5 text-xs font-mono">
                    <span className="text-[#8d8d8d] text-[11px] me-1">
                      {isAr ? 'تبديل المعاينة:' : 'Inspect:'}
                    </span>
                    {datasets.map(ds => (
                      <button
                        key={ds.id}
                        onClick={() => handleSelectDatasetForPreview(ds.id)}
                        className={`px-2.5 py-1 text-xs transition-colors cursor-pointer ${
                          currentPreviewDataset.id === ds.id
                            ? 'bg-[#0f62fe] text-white font-bold'
                            : 'bg-[#262626] text-[#c6c6c6] hover:bg-[#333333] border border-[#393939]'
                        }`}
                      >
                        {ds.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {isProcessingDataset ? (
                <div className="carbon-tile p-6 border border-[#0f62fe] bg-[#1a1a1a] space-y-4 animate-pulse my-2">
                  {/* Loading Header Indicator */}
                  <div className="flex items-center justify-between border-b border-[#393939] pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-[#0f62fe]/20 border border-[#0f62fe] flex items-center justify-center shrink-0">
                        <Workflow className="w-4 h-4 text-[#0f62fe] animate-spin" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-[#f4f4f4]">
                            {isAr ? 'جارٍ معالجة وتدقيق سجلات مجموعة البيانات المدمجة...' : 'Processing Joined Dataset Records & Schema Index...'}
                          </span>
                          <span className="bg-[#0f62fe] text-white text-[9px] font-mono px-2 py-0.5 animate-bounce">
                            EVALUATING JOINS
                          </span>
                        </div>
                        <p className="text-[11px] text-[#8d8d8d] mt-0.5 font-mono">
                          {isAr
                            ? `التحقق من الفهارس والربط بالمفاتيح للجدول: ${currentPreviewDataset?.name}`
                            : `Computing in-memory relational joins and profiling schema for: ${currentPreviewDataset?.name}`}
                        </p>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-48 bg-[#262626] border border-[#393939] h-2.5 overflow-hidden rounded-none hidden sm:block">
                      <div className="bg-[#0f62fe] h-full w-3/4 animate-pulse" />
                    </div>
                  </div>

                  {/* Table Skeleton Grid */}
                  <div className="space-y-2 font-mono text-xs">
                    {/* Table Header Skeleton */}
                    <div className="grid grid-cols-6 gap-2 bg-[#262626] p-2.5 border border-[#393939]">
                      {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="h-4 bg-[#393939] rounded-none w-full animate-pulse" />
                      ))}
                    </div>

                    {/* Rows Skeleton */}
                    {[1, 2, 3, 4, 5].map(rowIdx => (
                      <div key={rowIdx} className="grid grid-cols-6 gap-2 bg-[#161616] p-2.5 border border-[#262626]">
                        {[1, 2, 3, 4, 5, 6].map(colIdx => (
                          <div key={colIdx} className="h-3 bg-[#2a2a2a] rounded-none w-3/4 animate-pulse" />
                        ))}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono text-[#8d8d8d] pt-1">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-[#0f62fe] animate-ping" />
                      {isAr ? 'حساب تطابق المفاتيح وبناء شبكة العرض...' : 'Evaluating Hash Join Match & Building Schema Grid...'}
                    </span>
                    <span>{isAr ? 'يرجى الانتظار لحظات' : 'Please wait while records load'}</span>
                  </div>
                </div>
              ) : (
                <DataPreview dataset={currentPreviewDataset} />
              )}
            </div>
          )}
        </>
      )}

      {/* Multi-Dataset Schema Comparison Modal */}
      <SchemaCompareModal
        datasets={selectedDatasetsForComparison}
        isOpen={showCompareModal}
        onClose={() => setShowCompareModal(false)}
      />

      {/* Bulk Delete Confirmation Dialog */}
      {showDeleteConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-[#262626] border border-[#da1e28] max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-[#ff8389]">
              <AlertTriangle className="w-6 h-6 text-[#da1e28]" />
              <h3 className="text-base font-bold text-[#f4f4f4]">
                {isAr ? 'تأكيد الحذف الجماعي' : 'Confirm Bulk Deletion'}
              </h3>
            </div>
            <p className="text-xs text-[#c6c6c6] leading-relaxed">
              {isAr
                ? `هل أنت متأكد من رغبتك في حذف ${selectedDatasetIds.length} مجموعة بيانات محددة نهائياً من المستودع؟ لا يمكن التراجع عن هذا الإجراء.`
                : `Are you sure you want to permanently delete ${selectedDatasetIds.length} selected dataset(s) from the workspace? This action cannot be undone.`}
            </p>

            <div className="max-h-32 overflow-y-auto bg-[#161616] p-2 border border-[#393939] space-y-1 font-mono text-[11px]">
              {selectedDatasetsForComparison.map(d => (
                <div key={d.id} className="text-[#f4f4f4] flex items-center justify-between">
                  <span>• {d.name}</span>
                  <span className="text-[#8d8d8d]">{d.rowCount} rows</span>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#393939]">
              <button
                onClick={() => setShowDeleteConfirmModal(false)}
                className="carbon-btn-secondary text-xs uppercase tracking-wider py-1.5 px-4"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={handleBulkDelete}
                className="px-4 py-1.5 bg-[#da1e28] hover:bg-[#ba1b23] text-white text-xs font-mono font-bold uppercase tracking-wider transition-colors"
              >
                {isAr ? 'تأكيد الحذف' : 'Delete Selected'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload & Multi-Format Ingestion Modal - IBM Carbon Style */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-[#262626] border border-[#393939] max-w-2xl w-full p-6 shadow-2xl space-y-5 rounded-none">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#393939] pb-3">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#0f62fe]">
                  DATA INGESTION PIPELINE
                </span>
                <h3 className="text-base font-bold text-[#f4f4f4]">{t.datasets.uploadNew}</h3>
              </div>
              <button
                onClick={() => setShowUploadModal(false)}
                className="text-[#8d8d8d] hover:text-white text-lg font-mono px-2 py-1"
              >
                ✕
              </button>
            </div>

            {/* Drop Zone */}
            {!parsedResult ? (
              <div
                onDragOver={e => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleFileDrop}
                className={`border-2 border-dashed p-8 text-center transition-all ${
                  dragActive
                    ? 'border-[#0f62fe] bg-[#0f62fe]/10'
                    : 'border-[#525252] bg-[#161616] hover:border-[#8d8d8d]'
                }`}
              >
                {isParsing ? (
                  <div className="py-6 space-y-3">
                    <div className="w-8 h-8 border-2 border-[#0f62fe] border-t-transparent animate-spin mx-auto" />
                    <p className="text-xs font-mono text-[#4589ff]">
                      {isAr ? 'جارٍ تحليل هيكل الملف وقراءة الجداول والسجلات...' : 'Parsing file structure & extracting table records...'}
                    </p>
                  </div>
                ) : (
                  <>
                    <UploadCloud className="w-10 h-10 text-[#0f62fe] mx-auto mb-3" />
                    <p className="text-sm font-bold text-[#f4f4f4]">{t.datasets.dragDropText}</p>
                    <p className="text-xs text-[#8d8d8d] mt-1">
                      {isAr
                        ? 'يدعم ملفات: Excel (.xlsx, .xls), CSV (.csv, .tsv), JSON (.json, .jsonl), SQL (.sql), SQLite (.db, .sqlite)'
                        : 'Supports Excel (.xlsx, .xls), CSV (.csv, .tsv), JSON (.json, .jsonl), SQL Dump (.sql), SQLite (.db, .sqlite)'}
                    </p>

                    <label className="mt-4 inline-block px-4 py-2 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-xs font-semibold uppercase tracking-wider cursor-pointer transition-all">
                      <span>{t.datasets.browseFiles}</span>
                      <input
                        type="file"
                        accept=".csv,.tsv,.json,.jsonl,.xlsx,.xls,.xlsm,.sql,.db,.sqlite,.sqlite3"
                        onChange={handleFileDrop}
                        className="hidden"
                      />
                    </label>
                  </>
                )}

                {parseError && (
                  <div className="mt-4 p-3 bg-[#da1e28]/20 border border-[#da1e28] text-xs text-[#ff8389] flex items-center gap-2 text-start">
                    <AlertCircle className="w-4 h-4 shrink-0 text-[#da1e28]" />
                    <span>{parseError}</span>
                  </div>
                )}
              </div>
            ) : (
              /* Ingestion Preview & Config */
              <div className="space-y-4">
                <div className="p-3 bg-[#161616] border border-[#393939] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {getFormatBadge(parsedResult.format as DatasetFormat)}
                    <span className="font-mono text-xs font-bold text-[#f4f4f4]">{currentFile?.name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs font-mono text-[#c6c6c6]">
                    <span><strong>{parsedResult.totalRows.toLocaleString()}</strong> rows</span>
                    <span><strong>{parsedResult.columns.length}</strong> columns</span>
                    <button
                      onClick={() => {
                        setParsedResult(null);
                        setCurrentFile(null);
                      }}
                      className="text-xs text-[#0f62fe] hover:underline"
                    >
                      {isAr ? 'تغيير الملف' : 'Change file'}
                    </button>
                  </div>
                </div>

                {/* Multi-sheet or Multi-table Detector & Modeling Banner */}
                {multiTableResults && multiTableResults.length > 1 && (
                  <div className="p-4 bg-[#8a3ffc]/15 border border-[#8a3ffc] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-[#8a3ffc] text-white">
                        <GitFork className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-mono font-bold text-white flex items-center gap-2">
                          <span>
                            {isAr
                              ? `تم اكتشاف ${multiTableResults.length} ورقات عمل / شيتات في الملف`
                              : `${multiTableResults.length} Worksheets Detected in Workbook`}
                          </span>
                          <span className="px-1.5 py-0.5 bg-[#8a3ffc] text-white text-[9px] font-mono uppercase font-bold">
                            Multi-Sheet
                          </span>
                        </div>
                        <p className="text-[11px] text-[#c6c6c6] mt-0.5">
                          {isAr
                            ? 'يمكنك استيراد ورقة محددة، أو الانتقال لنمذجة العلاقات والربط (1:1، 1:M، M:M) وحفظ الناتج أو تصديره مباشرة.'
                            : 'Ingest a single sheet or launch Multi-Sheet Modeling to build joins (1:1, 1:M, M:M), save to datasets, or export.'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setShowUploadModal(false);
                        setShowMultiTableModelingModal(true);
                      }}
                      className="px-3.5 py-2 bg-[#8a3ffc] hover:bg-[#7828f7] text-white text-xs font-mono font-bold flex items-center gap-2 shrink-0 transition-colors shadow-lg cursor-pointer"
                    >
                      <Workflow className="w-4 h-4" />
                      <span>{isAr ? 'نمذجة وعلاقات الشيتات' : 'Model & Join Sheets'}</span>
                    </button>
                  </div>
                )}

                {/* Multi-sheet or Multi-table Selector */}
                {parsedResult.availableSheetsOrTables && parsedResult.availableSheetsOrTables.length > 1 && (
                  <div className="p-3 bg-[#1f1f1f] border border-[#393939] space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-[#c6c6c6]">
                        {parsedResult.format === 'excel'
                          ? (isAr ? 'اختر ورقة العمل (Worksheet) للاستيراد الفردي:' : 'Select Single Worksheet to Ingest:')
                          : (isAr ? 'اختر الجدول المطلوب استيراده:' : 'Select Target Table:')}
                      </label>
                      <button
                        onClick={() => {
                          setShowUploadModal(false);
                          setShowMultiTableModelingModal(true);
                        }}
                        className="text-xs text-[#be95ff] hover:underline font-mono"
                      >
                        {isAr ? '🔄 أو نمذجة كل الشيتات معاً' : '🔄 Or model all sheets together'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {parsedResult.availableSheetsOrTables.map(sheet => (
                        <button
                          key={sheet}
                          onClick={() => handleSwitchSheetOrTable(sheet)}
                          className={`px-3 py-1.5 text-xs font-mono transition-colors ${
                            selectedSheetOrTable === sheet
                              ? 'bg-[#0f62fe] text-white font-bold'
                              : 'bg-[#393939] text-[#c6c6c6] hover:bg-[#4c4c4c]'
                          }`}
                        >
                          {sheet}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#c6c6c6] mb-1">
                      {isAr ? 'اسم مجموعة البيانات' : 'Dataset Name'}
                    </label>
                    <input
                      type="text"
                      value={uploadName}
                      onChange={e => setUploadName(e.target.value)}
                      className="carbon-input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#c6c6c6] mb-1">
                      {isAr ? 'الوصف' : 'Description'}
                    </label>
                    <input
                      type="text"
                      value={uploadDescription}
                      onChange={e => setUploadDescription(e.target.value)}
                      placeholder="Optional notes or context..."
                      className="carbon-input w-full"
                    />
                  </div>
                </div>

                {/* Schema & Sample Preview Table */}
                <div className="border border-[#393939] bg-[#161616]">
                  <div className="p-2 border-b border-[#393939] text-[11px] font-mono text-[#8d8d8d] uppercase tracking-wider">
                    {isAr ? 'معاينة المخطط والبيانات المستخرجة' : 'Extracted Schema & Sample Records'}
                  </div>
                  <div className="max-h-48 overflow-auto">
                    <table className="w-full text-start text-[11px] font-mono">
                      <thead className="bg-[#1f1f1f] text-[#c6c6c6] border-b border-[#393939] sticky top-0">
                        <tr>
                          {parsedResult.columns.map(col => (
                            <th key={col.name} className="px-3 py-2 text-start whitespace-nowrap">
                              <div>{col.name}</div>
                              <span className="text-[9px] text-[#0f62fe] font-normal uppercase">{col.type}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#393939]">
                        {parsedResult.data.slice(0, 5).map((row, idx) => (
                          <tr key={idx} className="hover:bg-[#262626]">
                            {parsedResult.columns.map(col => (
                              <td key={col.name} className="px-3 py-1.5 text-[#c6c6c6] whitespace-nowrap">
                                {String(row[col.name] ?? 'NULL')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex justify-end gap-3 pt-3 border-t border-[#393939]">
              <button
                onClick={() => setShowUploadModal(false)}
                className="carbon-btn-secondary text-xs uppercase tracking-wider"
              >
                {t.common.cancel}
              </button>
              {parsedResult && (
                <button
                  onClick={handleCreateDataset}
                  className="carbon-btn-primary text-xs uppercase tracking-wider"
                >
                  <Check className="w-4 h-4 me-1.5" />
                  <span>{isAr ? 'تأكيد وحفظ مجموعة البيانات' : 'Ingest & Register Dataset'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Local Zero-Upload CSV Ingestion Modal */}
      <LocalCsvImportModal
        isOpen={showLocalCsvModal}
        onClose={() => setShowLocalCsvModal(false)}
      />

      {/* Multi-Table & Multi-Sheet Modeling & Joins Studio Modal */}
      <MultiTableModelingModal
        isOpen={showMultiTableModelingModal}
        onClose={() => setShowMultiTableModelingModal(false)}
        allTables={multiTableResults}
        initialTables={multiTableResults}
        fileName={multiTableFileName}
        onDatasetSaved={(newDataset) => {
          setPreviewDatasetId(newDataset.id);
        }}
      />
    </div>
  );
};
