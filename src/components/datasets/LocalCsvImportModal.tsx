import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { Dataset, DatasetColumn, DatasetFormat, WidgetConfig, Dashboard } from '../../types';
import {
  parseDelimitedText,
  buildColumnsFromRecords,
  inferColumnType,
} from '../../utils/fileDataParser';
import {
  UploadCloud,
  FileSpreadsheet,
  FileText,
  Check,
  X,
  AlertCircle,
  Sparkles,
  Sliders,
  Database,
  ArrowRight,
  ShieldCheck,
  Eye,
  Table,
  Plus,
  RefreshCw,
  LayoutDashboard,
  CheckCircle2,
} from 'lucide-react';

interface LocalCsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (datasetId: string) => void;
}

interface ColumnConfig {
  originalName: string;
  name: string;
  type: DatasetColumn['type'];
  included: boolean;
  sampleValues: any[];
  nullCount: number;
  uniqueCount: number;
}

export const LocalCsvImportModal: React.FC<LocalCsvImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { addDataset, setActiveDatasetId, saveDashboard, setActiveDashboardId, setActiveTab, toast, language } = useApp();
  const isAr = language === 'ar';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [datasetName, setDatasetName] = useState('');
  const [datasetDesc, setDatasetDesc] = useState('');
  const [delimiter, setDelimiter] = useState<string>('auto');
  const [hasHeader, setHasHeader] = useState(true);
  const [rawText, setRawText] = useState<string>('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<Record<string, any>[]>([]);
  const [columnsConfig, setColumnsConfig] = useState<ColumnConfig[]>([]);
  const [activeTab, setActiveTabState] = useState<'schema' | 'preview'>('schema');

  if (!isOpen) return null;

  const handleFileChange = (selectedFile: File) => {
    setFile(selectedFile);
    setParseError(null);

    const baseName = selectedFile.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
    setDatasetName(baseName);
    setDatasetDesc(
      isAr
        ? `مجموعة بيانات محلية تم استيرادها من ملف ${selectedFile.name} ومعالجتها في المتصفح.`
        : `Local dataset ingested from ${selectedFile.name} with zero-upload client-side processing.`
    );

    const reader = new FileReader();
    reader.onload = e => {
      const text = (e.target?.result as string) || '';
      setRawText(text);
      processCsvText(text, delimiter, hasHeader);
    };
    reader.onerror = () => {
      setParseError(isAr ? 'فشل قراءة الملف المحلي.' : 'Failed to read local file.');
    };
    reader.readAsText(selectedFile, 'UTF-8');
  };

  const processCsvText = (text: string, delim: string, header: boolean) => {
    setIsProcessing(true);
    setParseError(null);

    try {
      const chosenDelim = delim === 'auto' ? undefined : delim;
      let rows = parseDelimitedText(text, chosenDelim);

      if (rows.length === 0) {
        setParseError(isAr ? 'الملف فارغ أو لا يحتوي على صفوف بيانات صالحة.' : 'File is empty or contains no valid rows.');
        setIsProcessing(false);
        return;
      }

      setParsedRows(rows);

      // Build initial column configurations
      const sampleLimit = Math.min(rows.length, 100);
      const keys = Object.keys(rows[0] || {});

      const config: ColumnConfig[] = keys.map(k => {
        const samples = rows.slice(0, 50).map(r => r[k]);
        const type = inferColumnType(samples);
        const nonNulls = rows.map(r => r[k]).filter(v => v !== null && v !== undefined && v !== '');
        const nullCount = rows.length - nonNulls.length;
        const uniqueCount = new Set(nonNulls.map(v => String(v))).size;

        return {
          originalName: k,
          name: k.trim().replace(/\s+/g, '_'),
          type,
          included: true,
          sampleValues: samples.slice(0, 4),
          nullCount,
          uniqueCount,
        };
      });

      setColumnsConfig(config);
    } catch (err: any) {
      setParseError(err?.message || (isAr ? 'خطأ أثناء تحليل ملف CSV' : 'Error parsing CSV'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelimiterChange = (newDelim: string) => {
    setDelimiter(newDelim);
    if (rawText) {
      processCsvText(rawText, newDelim, hasHeader);
    }
  };

  const updateColumnType = (index: number, newType: DatasetColumn['type']) => {
    setColumnsConfig(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], type: newType };
      return copy;
    });
  };

  const updateColumnName = (index: number, newName: string) => {
    setColumnsConfig(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], name: newName };
      return copy;
    });
  };

  const toggleColumnInclusion = (index: number) => {
    setColumnsConfig(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], included: !copy[index].included };
      return copy;
    });
  };

  const finalizeDatasetCreation = (autoGenerateDashboard: boolean = false) => {
    const includedCols = columnsConfig.filter(c => c.included);
    if (includedCols.length === 0) {
      setParseError(isAr ? 'يجب اختيار عمود واحد على الأقل.' : 'Please select at least one column.');
      return;
    }

    // Remap rows based on renamed/included columns and convert types
    const sanitizedData = parsedRows.map(row => {
      const newRow: Record<string, any> = {};
      includedCols.forEach(col => {
        const rawVal = row[col.originalName];
        if (rawVal === undefined || rawVal === null || rawVal === '') {
          newRow[col.name] = null;
        } else if (col.type === 'integer') {
          const n = parseInt(String(rawVal).replace(/[^0-9-]/g, ''), 10);
          newRow[col.name] = isNaN(n) ? null : n;
        } else if (col.type === 'float') {
          const f = parseFloat(String(rawVal).replace(/[^0-9.-]/g, ''));
          newRow[col.name] = isNaN(f) ? null : f;
        } else if (col.type === 'boolean') {
          newRow[col.name] = String(rawVal).toLowerCase() === 'true' || rawVal === '1' || rawVal === 1;
        } else {
          newRow[col.name] = String(rawVal);
        }
      });
      return newRow;
    });

    const datasetColumns: DatasetColumn[] = includedCols.map(c => ({
      name: c.name,
      type: c.type,
      nullable: c.nullCount > 0,
      sampleValues: c.sampleValues,
      description: isAr ? `حقل مستورد: ${c.name}` : `Ingested column: ${c.name}`,
    }));

    const datasetId = `ds-local-${Date.now()}`;
    const newDataset: Omit<Dataset, 'profile'> = {
      id: datasetId,
      workspaceId: 'ws-main',
      name: datasetName || file?.name || 'Local CSV Dataset',
      description: datasetDesc,
      format: 'csv',
      rowCount: sanitizedData.length,
      columnCount: datasetColumns.length,
      sizeBytes: file?.size || sanitizedData.length * 128,
      columns: datasetColumns,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      status: 'ready',
      tags: ['Local CSV', 'Zero-Upload', 'Custom'],
      data: sanitizedData,
    };

    addDataset(newDataset);
    setActiveDatasetId(datasetId);

    toast.success(
      isAr ? 'تم استيراد ومعالجة ملف CSV محلياً بنجاح!' : 'Local CSV Dataset Ingested Successfully!',
      isAr
        ? `تمت معالجة ${sanitizedData.length.toLocaleString()} صف و ${datasetColumns.length} حقل داخل المتصفح مباشرة دون رفع لأي خادم.`
        : `Processed ${sanitizedData.length.toLocaleString()} rows and ${datasetColumns.length} attributes in-memory with zero server exposure.`
    );

    // Auto-generate dashboard if requested
    if (autoGenerateDashboard) {
      const numCol = datasetColumns.find(c => c.type === 'float' || c.type === 'integer') || datasetColumns[0];
      const catCol = datasetColumns.find(c => c.type === 'category' || c.type === 'string') || datasetColumns[0];
      const dateCol = datasetColumns.find(c => c.type === 'date') || catCol;

      const newDashId = `dash-csv-${Date.now()}`;
      const generatedWidgets: WidgetConfig[] = [
        {
          id: `w-kpi-auto-${Date.now()}-1`,
          type: 'kpi',
          title: `Total ${numCol.name}`,
          titleAr: `إجمالي ${numCol.name}`,
          datasetId: datasetId,
          xAxis: catCol.name,
          yAxis: numCol.name,
          aggregation: 'sum',
          w: 3,
          h: 1,
          kpiMetric: {
            value: `$${(sanitizedData.reduce((acc, r) => acc + (parseFloat(String(r[numCol.name])) || 0), 0)).toLocaleString()}`,
            label: `Total ${numCol.name}`,
            trendPercentage: 8.4,
            trendDirection: 'up',
            prefix: '$',
          },
        },
        {
          id: `w-kpi-auto-${Date.now()}-2`,
          type: 'kpi',
          title: `Average ${numCol.name}`,
          titleAr: `متوسط ${numCol.name}`,
          datasetId: datasetId,
          xAxis: catCol.name,
          yAxis: numCol.name,
          aggregation: 'avg',
          w: 3,
          h: 1,
          kpiMetric: {
            value: `$${Math.round(sanitizedData.reduce((acc, r) => acc + (parseFloat(String(r[numCol.name])) || 0), 0) / Math.max(1, sanitizedData.length)).toLocaleString()}`,
            label: `Average ${numCol.name}`,
            trendPercentage: 4.2,
            trendDirection: 'up',
            prefix: '$',
          },
        },
        {
          id: `w-bar-auto-${Date.now()}-3`,
          type: 'bar',
          title: `${numCol.name} by ${catCol.name}`,
          titleAr: `توزيع ${numCol.name} حسب ${catCol.name}`,
          datasetId: datasetId,
          xAxis: catCol.name,
          yAxis: numCol.name,
          categoryField: catCol.name,
          aggregation: 'sum',
          w: 6,
          h: 2,
        },
        {
          id: `w-pie-auto-${Date.now()}-4`,
          type: 'pie',
          title: `Share by ${catCol.name}`,
          titleAr: `النسبة المئوية حسب ${catCol.name}`,
          datasetId: datasetId,
          xAxis: catCol.name,
          yAxis: numCol.name,
          categoryField: catCol.name,
          aggregation: 'sum',
          w: 6,
          h: 2,
        },
      ];

      const autoDash: Dashboard = {
        id: newDashId,
        workspaceId: 'ws-main',
        title: `${datasetName} Intelligence Cockpit`,
        titleAr: `لوحة تحليلات ${datasetName}`,
        description: isAr
          ? `لوحة تحكم تفاعلية تم إنشاؤها تلقائياً من بيانات ${file?.name || 'CSV'}.`
          : `Interactive executive dashboard auto-generated from ${file?.name || 'CSV'}.`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        widgets: generatedWidgets,
      };

      saveDashboard(autoDash);
      setActiveDashboardId(newDashId);
      setActiveTab('dashboards');

      toast.info(
        isAr ? 'تم توليد لوحة التحكم التفاعلية!' : 'Dashboard Auto-Generated!',
        isAr ? 'تم إنشاء المخططات ومؤشرات الأداء بناءً على مخطط بياناتك الجديد.' : 'Generated KPI cards and analytical charts from your new schema.'
      );
    }

    if (onSuccess) {
      onSuccess(datasetId);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs select-none animate-fade-in">
      <div className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Top Header */}
        <div className="p-4 bg-[var(--cds-layer-01)] border-b border-[var(--cds-border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#0f62fe]/20 border border-[#0f62fe] flex items-center justify-center text-[#78a9ff]">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-mono font-bold uppercase text-[var(--cds-text-01)]">
                  {isAr ? 'استيراد ومعالجة ملف CSV محلياً (Zero-Upload)' : 'Local CSV Ingestion Engine'}
                </h3>
                <span className="px-2 py-0.5 bg-[#24a148]/20 border border-[#24a148]/40 text-[#42be65] text-[10px] font-mono font-bold flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  <span>{isAr ? 'معالجة محلية بالكامل' : '100% Client-Side'}</span>
                </span>
              </div>
              <p className="text-xs text-[var(--cds-text-02)] mt-0.5">
                {isAr
                  ? 'معالجة البيانات داخل المتصفح فوراً، استنتاج المخطط، وتغذية لوحات التحكم دون رفع لأي خادم'
                  : 'Instant in-memory schema deduction and dashboard binding with zero external cloud upload'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 hover:bg-[var(--cds-layer-03)] text-[var(--cds-text-03)] hover:text-[var(--cds-text-01)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* File Picker & Dropzone */}
          {!file ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-[var(--cds-border-strong)] hover:border-[#0f62fe] bg-[var(--cds-layer-01)] p-10 text-center cursor-pointer transition-colors space-y-3"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.tsv,.txt"
                className="hidden"
                onChange={e => {
                  if (e.target.files?.[0]) handleFileChange(e.target.files[0]);
                }}
              />
              <div className="w-12 h-12 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] flex items-center justify-center mx-auto text-[#0f62fe]">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-mono font-bold text-[var(--cds-text-01)]">
                  {isAr ? 'انقر لاختيار ملف CSV أو اسحبه هنا' : 'Click to Select CSV/TSV File or Drag & Drop'}
                </p>
                <p className="text-xs font-mono text-[var(--cds-text-03)] mt-1">
                  {isAr ? 'يدعم UTF-8، الفواصل، الفواصل المنقوطة، وعلامات التبويب' : 'Supports RFC 4180 CSV, TSV, Semicolon and Pipe Delimiters'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* File Info & Parser Controls */}
              <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] flex items-center justify-center text-[#42be65]">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-mono font-bold text-[var(--cds-text-01)] flex items-center gap-2">
                      <span>{file.name}</span>
                      <span className="text-[10px] text-[var(--cds-text-03)] font-normal">
                        ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-[#42be65]">
                      {parsedRows.length.toLocaleString()} {isAr ? 'صف متاح' : 'rows loaded'} •{' '}
                      {columnsConfig.length} {isAr ? 'أعمدة مستنتجة' : 'columns detected'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Delimiter Selection */}
                  <div className="flex items-center gap-1.5 text-xs font-mono">
                    <span className="text-[var(--cds-text-03)]">{isAr ? 'المحدد:' : 'Delimiter:'}</span>
                    <select
                      value={delimiter}
                      onChange={e => handleDelimiterChange(e.target.value)}
                      className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] px-2 py-1 text-xs text-[var(--cds-text-01)] outline-none"
                    >
                      <option value="auto">{isAr ? 'تلقائي (Auto)' : 'Auto Detect'}</option>
                      <option value=",">Comma (,)</option>
                      <option value=";">Semicolon (;)</option>
                      <option value="&#9;">Tab (\t)</option>
                      <option value="|">Pipe (|)</option>
                    </select>
                  </div>

                  <button
                    onClick={() => {
                      setFile(null);
                      setParsedRows([]);
                      setColumnsConfig([]);
                    }}
                    className="px-2.5 py-1 bg-[var(--cds-layer-03)] hover:bg-[var(--cds-border-strong)] text-xs font-mono text-[var(--cds-text-02)] hover:text-white transition-colors"
                  >
                    {isAr ? 'اختيار ملف آخر' : 'Change File'}
                  </button>
                </div>
              </div>

              {/* Dataset Metadata Inputs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-mono text-[var(--cds-text-03)] block mb-1">
                    {isAr ? 'اسم مجموعة البيانات:' : 'Dataset Name:'}
                  </label>
                  <input
                    type="text"
                    value={datasetName}
                    onChange={e => setDatasetName(e.target.value)}
                    className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] focus:border-[#0f62fe] px-3 py-1.5 text-xs font-mono text-[var(--cds-text-01)] outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-mono text-[var(--cds-text-03)] block mb-1">
                    {isAr ? 'وصف مختصر:' : 'Description:'}
                  </label>
                  <input
                    type="text"
                    value={datasetDesc}
                    onChange={e => setDatasetDesc(e.target.value)}
                    className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] focus:border-[#0f62fe] px-3 py-1.5 text-xs font-mono text-[var(--cds-text-01)] outline-none"
                  />
                </div>
              </div>

              {/* Tabs: Schema Configuration vs. Raw Data Preview */}
              <div className="flex border-b border-[var(--cds-border-subtle)] gap-1 bg-[var(--cds-layer-01)] p-1">
                <button
                  onClick={() => setActiveTabState('schema')}
                  className={`px-3 py-1.5 text-xs font-mono flex items-center gap-2 transition-colors ${
                    activeTab === 'schema'
                      ? 'bg-[#0f62fe] text-white font-bold'
                      : 'text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-03)]'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>{isAr ? `توصيف ومخطط الأعمدة (${columnsConfig.filter(c => c.included).length}/${columnsConfig.length})` : `Schema & Types (${columnsConfig.filter(c => c.included).length}/${columnsConfig.length})`}</span>
                </button>
                <button
                  onClick={() => setActiveTabState('preview')}
                  className={`px-3 py-1.5 text-xs font-mono flex items-center gap-2 transition-colors ${
                    activeTab === 'preview'
                      ? 'bg-[#0f62fe] text-white font-bold'
                      : 'text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-03)]'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{isAr ? 'معاينة السجلات الحية' : 'Live Data Preview'}</span>
                </button>
              </div>

              {/* Schema Configuration Tab */}
              {activeTab === 'schema' && (
                <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] overflow-x-auto">
                  <table className="w-full text-start text-xs font-mono">
                    <thead className="bg-[var(--cds-layer-01)] border-b border-[var(--cds-border-subtle)] text-[var(--cds-text-03)] text-[11px] uppercase">
                      <tr>
                        <th className="p-2.5 text-center w-10">
                          {isAr ? 'تضمين' : 'Include'}
                        </th>
                        <th className="p-2.5 text-start">{isAr ? 'اسم الحقل' : 'Column Name'}</th>
                        <th className="p-2.5 text-start">{isAr ? 'نوع البيانات المستنتج' : 'Data Type'}</th>
                        <th className="p-2.5 text-start">{isAr ? 'القيم الفارغة / الفريدة' : 'Nulls / Unique'}</th>
                        <th className="p-2.5 text-start">{isAr ? 'عينة من القيم' : 'Sample Values'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--cds-border-subtle)]">
                      {columnsConfig.map((col, idx) => (
                        <tr
                          key={idx}
                          className={`hover:bg-[var(--cds-layer-02)] transition-colors ${
                            !col.included ? 'opacity-40 bg-[var(--cds-background)]' : ''
                          }`}
                        >
                          <td className="p-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={col.included}
                              onChange={() => toggleColumnInclusion(idx)}
                              className="accent-[#0f62fe] w-4 h-4 cursor-pointer"
                            />
                          </td>
                          <td className="p-2.5">
                            <input
                              type="text"
                              value={col.name}
                              disabled={!col.included}
                              onChange={e => updateColumnName(idx, e.target.value)}
                              className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] focus:border-[#0f62fe] px-2 py-1 text-xs text-[var(--cds-text-01)] outline-none font-bold"
                            />
                          </td>
                          <td className="p-2.5">
                            <select
                              value={col.type}
                              disabled={!col.included}
                              onChange={e => updateColumnType(idx, e.target.value as any)}
                              className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] px-2 py-1 text-xs text-[#33b1ff] outline-none"
                            >
                              <option value="string">String / Text</option>
                              <option value="integer">Integer (123)</option>
                              <option value="float">Float / Metric (12.3)</option>
                              <option value="category">Category</option>
                              <option value="date">Date / Timestamp</option>
                              <option value="boolean">Boolean (T/F)</option>
                            </select>
                          </td>
                          <td className="p-2.5 text-[var(--cds-text-03)] text-[11px]">
                            <span>
                              {col.nullCount > 0 ? (
                                <span className="text-[#f1c21b]">{col.nullCount} nulls</span>
                              ) : (
                                <span className="text-[#42be65]">0 nulls</span>
                              )}{' '}
                              • {col.uniqueCount} distinct
                            </span>
                          </td>
                          <td className="p-2.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {col.sampleValues.map((v, i) => (
                                <span
                                  key={i}
                                  className="px-1.5 py-0.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-02)] text-[10px] truncate max-w-[100px]"
                                >
                                  {String(v)}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Live Preview Tab */}
              {activeTab === 'preview' && (
                <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] overflow-x-auto max-h-72">
                  <table className="w-full text-start text-xs font-mono">
                    <thead className="bg-[var(--cds-layer-01)] border-b border-[var(--cds-border-subtle)] text-[var(--cds-text-03)] text-[11px] uppercase sticky top-0">
                      <tr>
                        {columnsConfig
                          .filter(c => c.included)
                          .map((col, i) => (
                            <th key={i} className="p-2.5 text-start font-bold text-[#33b1ff]">
                              {col.name}
                            </th>
                          ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--cds-border-subtle)]">
                      {parsedRows.slice(0, 15).map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-[var(--cds-layer-02)]">
                          {columnsConfig
                            .filter(c => c.included)
                            .map((col, cIdx) => (
                              <td key={cIdx} className="p-2.5 text-[var(--cds-text-02)] whitespace-nowrap">
                                {row[col.originalName] !== undefined && row[col.originalName] !== null
                                  ? String(row[col.originalName])
                                  : <span className="text-[var(--cds-text-03)] italic">NULL</span>}
                              </td>
                            ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {parseError && (
            <div className="p-3 bg-[#da1e28]/20 border border-[#da1e28] text-[#ff8389] text-xs font-mono flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-[var(--cds-layer-01)] border-t border-[var(--cds-border-subtle)] flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-[var(--cds-layer-03)] hover:bg-[var(--cds-border-strong)] text-[var(--cds-text-01)] text-xs font-mono transition-colors"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>

          {file && parsedRows.length > 0 && (
            <div className="flex items-center gap-2">
              {/* Import as Dataset only */}
              <button
                onClick={() => finalizeDatasetCreation(false)}
                className="px-3 py-1.5 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] border border-[var(--cds-border-strong)] text-[var(--cds-text-01)] text-xs font-mono flex items-center gap-1.5 transition-colors"
              >
                <Database className="w-3.5 h-3.5 text-[#0f62fe]" />
                <span>{isAr ? 'استيراد كمجموعة بيانات نشطة' : 'Ingest as Active Dataset'}</span>
              </button>

              {/* Import and auto-build dashboard */}
              <button
                onClick={() => finalizeDatasetCreation(true)}
                className="carbon-btn-primary gap-2 text-xs font-mono font-bold uppercase"
              >
                <LayoutDashboard className="w-3.5 h-3.5 fill-current" />
                <span>{isAr ? 'استيراد وتوليد لوحة تحكم فورية' : 'Import & Auto-Build Dashboard'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
