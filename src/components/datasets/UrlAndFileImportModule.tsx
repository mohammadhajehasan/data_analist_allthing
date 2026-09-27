import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  UploadCloud,
  Link,
  FileSpreadsheet,
  FileCode,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Database,
  RefreshCw,
  Eye,
  Sliders,
  Check,
  X,
  FileText,
  Layers,
  HelpCircle,
  ExternalLink,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Dataset, DatasetColumn, DatasetFormat } from '../../types';

interface UrlAndFileImportModuleProps {
  onImportComplete?: (newDataset: Dataset) => void;
}

export const UrlAndFileImportModule: React.FC<UrlAndFileImportModuleProps> = ({
  onImportComplete,
}) => {
  const { language, addDataset, setActiveDatasetId, workspace, toast } = useApp();
  const isAr = language === 'ar';

  const [activeMode, setActiveMode] = useState<'url' | 'drag_drop'>('url');
  
  // URL Ingestion State
  const [urlInput, setUrlInput] = useState<string>('');
  const [urlHeaders, setUrlHeaders] = useState<string>('');
  const [isFetchingUrl, setIsFetchingUrl] = useState<boolean>(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  
  // File Drop State
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsingFile, setIsParsingFile] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Parsed Preview & Configuration State
  const [previewData, setPreviewData] = useState<any[] | null>(null);
  const [detectedColumns, setDetectedColumns] = useState<DatasetColumn[]>([]);
  const [datasetName, setDatasetName] = useState<string>('');
  const [datasetDesc, setDatasetDesc] = useState<string>('');
  const [datasetFormat, setDatasetFormat] = useState<DatasetFormat>('csv');
  const [sourceOrigin, setSourceOrigin] = useState<'url' | 'file'>('url');

  // Open Data Presets for Instant Testing
  const SAMPLE_PRESETS = [
    {
      nameAr: 'مؤشرات المبيعات والمنتجات (Sales Trends CSV)',
      nameEn: 'Global Sales Trends & Profit CSV',
      url: 'https://raw.githubusercontent.com/datasets/gdp/master/data/gdp.csv',
      format: 'csv' as DatasetFormat,
      descAr: 'بيانات اقتصادية ومؤشرات سنوية موثقة من مستودعات البيانات المفتوحة.',
      descEn: 'Public annual macroeconomic dataset for time-series and correlation analysis.',
    },
    {
      nameAr: 'مؤشرات التسويق وسلوك العملاء (Customer Churn CSV)',
      nameEn: 'Customer Demographics & Churn CSV',
      url: 'https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv',
      format: 'csv' as DatasetFormat,
      descAr: 'مجموعة بيانات شهيرة تتضمن قياسات متعددة مناسبة لتصنيف ونمذجة الانحدار.',
      descEn: 'Classic multivariate benchmark dataset for classification and regression.',
    },
    {
      nameAr: 'بيانات الرحلات ومسافات الطيران (Flights Data CSV)',
      nameEn: 'Airline Flights & Delays CSV',
      url: 'https://raw.githubusercontent.com/mwaskom/seaborn-data/master/flights.csv',
      format: 'csv' as DatasetFormat,
      descAr: 'مجموعة بيانات الركاب والشهور لتحليل الاتجاهات والموسمية.',
      descEn: 'Monthly airline passenger count time series dataset.',
    },
  ];

  // Helper to infer column types from sample data
  const inferColumns = (data: any[]): DatasetColumn[] => {
    if (!data || data.length === 0) return [];
    const firstRow = data[0];
    const keys = Object.keys(firstRow);

    return keys.map((key) => {
      // Examine values across top 20 rows
      const values = data.slice(0, 30).map((r) => r[key]).filter((v) => v !== null && v !== undefined && v !== '');
      let inferredType: DatasetColumn['type'] = 'string';

      if (values.length > 0) {
        const isAllInteger = values.every((v) => !isNaN(Number(v)) && Number.isInteger(Number(v)));
        const isAllNumeric = values.every((v) => !isNaN(Number(v)));
        const isAllBoolean = values.every((v) => typeof v === 'boolean' || v === 'true' || v === 'false' || v === 1 || v === 0);
        const isAllDate = values.every((v) => !isNaN(Date.parse(String(v))) && isNaN(Number(v)));

        if (isAllInteger) inferredType = 'integer';
        else if (isAllNumeric) inferredType = 'float';
        else if (isAllBoolean) inferredType = 'boolean';
        else if (isAllDate) inferredType = 'date';
      }

      return {
        name: key,
        type: inferredType,
        nullable: values.length < data.length,
        sampleValues: values.slice(0, 4),
      };
    });
  };

  // 1. Ingest Data via Direct URL
  const handleFetchFromUrl = async (targetUrl?: string) => {
    const url = targetUrl || urlInput.trim();
    if (!url) {
      setUrlError(isAr ? 'يرجى إدخال رابط URL صالح.' : 'Please provide a valid URL.');
      return;
    }

    setIsFetchingUrl(true);
    setUrlError(null);

    try {
      // Validate URL syntax
      new URL(url);

      // Fetch the remote payload
      let customHeaders: Record<string, string> = {};
      if (urlHeaders.trim()) {
        try {
          customHeaders = JSON.parse(urlHeaders);
        } catch {
          // Ignore invalid header JSON
        }
      }

      const response = await fetch(url, {
        headers: customHeaders,
      });

      if (!response.ok) {
        throw new Error(
          isAr
            ? `فشل جلب الرابط (رمز الاستجابة: ${response.status} ${response.statusText})`
            : `HTTP error ${response.status}: ${response.statusText}`
        );
      }

      const text = await response.text();
      let parsedRows: any[] = [];
      let format: DatasetFormat = 'csv';

      // Auto-detect JSON or CSV
      const trimmed = text.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const jsonObj = JSON.parse(trimmed);
          parsedRows = Array.isArray(jsonObj) ? jsonObj : [jsonObj];
          format = 'json';
        } catch {
          // Fallback to CSV
        }
      }

      if (parsedRows.length === 0) {
        const csvRes = Papa.parse(text, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
        });

        if (csvRes.errors.length > 0 && csvRes.data.length === 0) {
          throw new Error(csvRes.errors[0]?.message || 'CSV parse error');
        }
        parsedRows = csvRes.data as any[];
        format = 'csv';
      }

      if (parsedRows.length === 0) {
        throw new Error(isAr ? 'لم يتم العثور على سجلات صالحة في الرابط.' : 'No tabular rows found in payload.');
      }

      const inferred = inferColumns(parsedRows);
      setPreviewData(parsedRows);
      setDetectedColumns(inferred);
      setDatasetFormat(format);
      setSourceOrigin('url');

      // Generate suggested dataset name from URL path
      const urlObj = new URL(url);
      const pathname = urlObj.pathname.split('/').pop() || 'url_dataset';
      const cleanName = pathname.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ') || 'Remote Imported Dataset';
      setDatasetName(cleanName);
      setDatasetDesc(`Imported directly from URL: ${url}`);

      toast.success(
        isAr ? 'تم جلب البيانات ومعاينتها بنجاح!' : 'Data Fetched Successfully!',
        isAr
          ? `تم استخراج ${parsedRows.length} صفاً و ${inferred.length} عموداً من الرابط.`
          : `Extracted ${parsedRows.length} rows and ${inferred.length} columns from URL.`
      );
    } catch (err: any) {
      console.error('URL Ingestion Error:', err);
      const msg = err.message || (isAr ? 'تعذر جلب البيانات من الرابط المحدد.' : 'Failed to fetch data from provided URL.');
      setUrlError(msg);
      toast.error(isAr ? 'خطأ في جلب البيانات' : 'URL Ingestion Error', msg);
    } finally {
      setIsFetchingUrl(false);
    }
  };

  // 2. Parse File Dropped or Selected
  const handleProcessFile = async (file: File) => {
    setSelectedFile(file);
    setIsParsingFile(true);
    setUrlError(null);

    try {
      const fileName = file.name;
      const ext = fileName.split('.').pop()?.toLowerCase() || '';

      if (ext === 'csv' || ext === 'txt' || ext === 'tsv') {
        Papa.parse(file, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            const rows = results.data as any[];
            if (rows.length === 0) {
              toast.error(isAr ? 'الملف فارغ' : 'Empty File', isAr ? 'الملف لا يحتوي على صفوف بيانات.' : 'File has no rows.');
              setIsParsingFile(false);
              return;
            }

            const inferred = inferColumns(rows);
            setPreviewData(rows);
            setDetectedColumns(inferred);
            setDatasetFormat(ext === 'tsv' ? 'csv' : 'csv');
            setSourceOrigin('file');
            setDatasetName(fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '));
            setDatasetDesc(`Uploaded file (${(file.size / 1024).toFixed(1)} KB)`);
            setIsParsingFile(false);

            toast.success(
              isAr ? 'تم فحص ملف CSV بنجاح!' : 'CSV Parsed Successfully!',
              isAr ? `تم التعرف على ${rows.length} صفاً و ${inferred.length} عموداً.` : `Loaded ${rows.length} rows and ${inferred.length} columns.`
            );
          },
          error: (err) => {
            setIsParsingFile(false);
            toast.error(isAr ? 'خطأ في قراءة الملف' : 'File Read Error', err.message);
          },
        });
      } else if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: null });

        const inferred = inferColumns(rows);
        setPreviewData(rows);
        setDetectedColumns(inferred);
        setDatasetFormat('excel');
        setSourceOrigin('file');
        setDatasetName(fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '));
        setDatasetDesc(`Excel Sheet: ${firstSheetName} (${(file.size / 1024).toFixed(1)} KB)`);
        setIsParsingFile(false);

        toast.success(
          isAr ? 'تم استخراج ورقة العمل بنجاح!' : 'Excel Sheet Loaded!',
          isAr ? `تم التعرف على ${rows.length} صفاً.` : `Parsed ${rows.length} rows from ${firstSheetName}.`
        );
      } else if (ext === 'json') {
        const text = await file.text();
        const json = JSON.parse(text);
        const rows = Array.isArray(json) ? json : [json];
        const inferred = inferColumns(rows);

        setPreviewData(rows);
        setDetectedColumns(inferred);
        setDatasetFormat('json');
        setSourceOrigin('file');
        setDatasetName(fileName.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' '));
        setDatasetDesc(`JSON Document (${(file.size / 1024).toFixed(1)} KB)`);
        setIsParsingFile(false);

        toast.success(
          isAr ? 'تم تحميل ملف JSON بنجاح!' : 'JSON Document Loaded!',
          isAr ? `تم التعرف على ${rows.length} سجلاً.` : `Parsed ${rows.length} JSON records.`
        );
      } else {
        throw new Error(isAr ? 'صيغة الملف غير مدعومة. يرجى اختيار CSV أو JSON أو XLSX.' : 'Unsupported file format. Please upload CSV, JSON, or XLSX.');
      }
    } catch (err: any) {
      console.error('File parsing error:', err);
      setIsParsingFile(false);
      toast.error(isAr ? 'فشل معالجة الملف' : 'File Parsing Failed', err.message);
    }
  };

  // Drag & Drop Event Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleProcessFile(e.dataTransfer.files[0]);
    }
  };

  // 3. Confirm and Add to Workspace Datasets Catalog
  const handleSaveToWorkspace = () => {
    if (!previewData || previewData.length === 0) return;

    const newId = `ds-import-${Date.now()}`;
    const name = datasetName.trim() || `Imported_Dataset_${Date.now()}`;

    const newDataset: Dataset = {
      id: newId,
      workspaceId: workspace?.id || 'ws-default',
      name,
      description: datasetDesc || 'Imported via URL & Drag-Drop Module',
      format: datasetFormat,
      rowCount: previewData.length,
      columnCount: detectedColumns.length,
      sizeBytes: previewData.length * 180,
      columns: detectedColumns,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      status: 'ready',
      tags: ['Imported', sourceOrigin.toUpperCase(), datasetFormat.toUpperCase()],
      data: previewData,
    };

    addDataset(newDataset);
    setActiveDatasetId(newId);

    if (onImportComplete) {
      onImportComplete(newDataset);
    }

    toast.success(
      isAr ? 'تمت إضافة مجموعة البيانات بنجاح!' : 'Dataset Added to Catalog!',
      isAr
        ? `مجموعة البيانات "${name}" متاحة الآن في المستودع والاستكشاف والنمذجة.`
        : `"${name}" is now ready for SQL exploration, profiling, and ML modeling.`
    );

    // Reset module
    setPreviewData(null);
    setSelectedFile(null);
    setUrlInput('');
  };

  return (
    <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-xl p-5 space-y-6 shadow-md">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--cds-border-subtle)] pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[var(--cds-interactive-01)]/10 border border-[var(--cds-interactive-01)]/30 flex items-center justify-center text-[var(--cds-interactive-01)]">
              <UploadCloud className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-[var(--cds-text-01)]">
              {isAr ? 'وحدة جلب واستيراد البيانات (URL Ingestion & Drag-Drop Hub)' : 'URL Data Ingestion & Drag-Drop Hub'}
            </h3>
          </div>
          <p className="text-xs text-[var(--cds-text-03)]">
            {isAr
              ? 'جلب البيانات مباشرة من روابط URL عبر الإنترنت أو سحب ملفات CSV و XLSX و JSON مع المعاينة التلقائية والتحقق من المخطط.'
              : 'Streamline data ingestion directly from external Web URLs or drag-and-drop CSV, JSON, and XLSX files with live schema detection.'}
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="flex items-center bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] p-0.5 rounded-lg text-xs font-mono self-start sm:self-center">
          <button
            onClick={() => setActiveMode('url')}
            className={`px-3 py-1.5 rounded-md font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeMode === 'url' ? 'bg-[var(--cds-interactive-01)] text-white shadow-xs' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'
            }`}
          >
            <Link className="w-3.5 h-3.5" />
            <span>{isAr ? 'جلب عبر رابط URL' : 'Fetch by URL'}</span>
          </button>
          <button
            onClick={() => setActiveMode('drag_drop')}
            className={`px-3 py-1.5 rounded-md font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeMode === 'drag_drop' ? 'bg-[var(--cds-interactive-01)] text-white shadow-xs' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>{isAr ? 'سحب وإفلات ملف CSV' : 'Drag & Drop File'}</span>
          </button>
        </div>
      </div>

      {/* Mode 1: URL Ingestion */}
      {activeMode === 'url' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-mono font-bold text-[var(--cds-text-01)] flex items-center gap-1.5">
              <Link className="w-3.5 h-3.5 text-[var(--cds-interactive-01)]" />
              <span>{isAr ? 'رابط ملف البيانات (CSV / JSON / REST API URL):' : 'Data Resource URL (CSV / JSON / REST API):'}</span>
            </label>
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://raw.githubusercontent.com/.../dataset.csv"
                className="w-full bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] px-3.5 py-2.5 rounded-lg text-xs font-mono focus:border-[var(--cds-interactive-01)] outline-hidden transition-colors"
              />
              <button
                onClick={() => handleFetchFromUrl()}
                disabled={isFetchingUrl || !urlInput.trim()}
                className="w-full sm:w-auto px-5 py-2.5 bg-[var(--cds-interactive-01)] hover:bg-[var(--cds-interactive-01)]/90 disabled:opacity-50 text-white text-xs font-mono font-bold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm shrink-0"
              >
                {isFetchingUrl ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{isAr ? 'جارٍ الجلب...' : 'Fetching...'}</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    <span>{isAr ? 'جلب ومعاينة' : 'Fetch & Preview'}</span>
                  </>
                )}
              </button>
            </div>
            {urlError && (
              <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg text-xs font-mono text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{urlError}</span>
              </div>
            )}
          </div>

          {/* Quick Presets */}
          <div className="space-y-2">
            <span className="text-[11px] font-mono text-[var(--cds-text-03)] uppercase block font-semibold">
              {isAr ? 'أو جرّب أحد الروابط النموذجية المفتوحة (One-Click Presets):' : 'Or load sample open datasets:'}
            </span>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {SAMPLE_PRESETS.map((preset, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setUrlInput(preset.url);
                    handleFetchFromUrl(preset.url);
                  }}
                  className="bg-[var(--cds-layer-02)] hover:bg-[var(--cds-hover-ui)] border border-[var(--cds-border-subtle)] hover:border-[var(--cds-interactive-01)] p-3 rounded-lg cursor-pointer transition-all space-y-1 group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[var(--cds-text-01)] group-hover:text-[var(--cds-interactive-01)] transition-colors">
                      {isAr ? preset.nameAr : preset.nameEn}
                    </span>
                    <span className="text-[10px] font-mono uppercase bg-[var(--cds-layer-01)] px-1.5 py-0.5 rounded border border-[var(--cds-border-subtle)] text-[var(--cds-text-03)]">
                      {preset.format}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--cds-text-03)] line-clamp-2">
                    {isAr ? preset.descAr : preset.descEn}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mode 2: Drag & Drop Ingestion */}
      {activeMode === 'drag_drop' && (
        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.json,.xlsx,.xls,.txt"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleProcessFile(e.target.files[0]);
              }
            }}
          />
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
              dragActive
                ? 'border-[var(--cds-interactive-01)] bg-[var(--cds-interactive-01)]/10 scale-[1.01]'
                : 'border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] hover:bg-[var(--cds-hover-ui)] hover:border-[var(--cds-interactive-01)]/50'
            }`}
          >
            <div className="w-14 h-14 rounded-2xl bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] flex items-center justify-center text-[var(--cds-interactive-01)] shadow-sm">
              <FileSpreadsheet className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-[var(--cds-text-01)]">
                {isAr ? 'اسحب وأفلت ملف البيانات هنا، أو اضغط للاستعراض' : 'Drag and drop your data file here, or click to browse'}
              </h4>
              <p className="text-xs text-[var(--cds-text-03)]">
                {isAr ? 'يدعم ملفات CSV و TSV و Excel (XLSX) و JSON بترميز UTF-8' : 'Supports CSV, TSV, Excel (XLSX), and JSON formats with UTF-8 encoding'}
              </p>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--cds-text-03)]">
              <span className="px-2 py-0.5 bg-[var(--cds-layer-01)] rounded border border-[var(--cds-border-subtle)]">CSV</span>
              <span className="px-2 py-0.5 bg-[var(--cds-layer-01)] rounded border border-[var(--cds-border-subtle)]">XLSX</span>
              <span className="px-2 py-0.5 bg-[var(--cds-layer-01)] rounded border border-[var(--cds-border-subtle)]">JSON</span>
            </div>
          </div>
        </div>
      )}

      {/* Live Preview & Final Import Section */}
      {previewData && previewData.length > 0 && (
        <div className="space-y-4 pt-4 border-t border-[var(--cds-border-subtle)] animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--cds-layer-02)] p-4 rounded-xl border border-[var(--cds-border-subtle)]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-mono font-bold text-[var(--cds-text-01)] uppercase">
                  {isAr ? 'معاينة المخطط والبيانات المستخرجة' : 'Extracted Schema & Table Preview'}
                </h4>
                <div className="flex items-center gap-3 text-xs text-[var(--cds-text-03)] font-mono">
                  <span>{previewData.length.toLocaleString()} {isAr ? 'صف' : 'rows'}</span>
                  <span>•</span>
                  <span>{detectedColumns.length} {isAr ? 'عمود' : 'columns'}</span>
                  <span>•</span>
                  <span className="uppercase text-[var(--cds-interactive-01)] font-bold">{datasetFormat}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSaveToWorkspace}
                className="px-4 py-2 bg-[var(--cds-interactive-01)] hover:bg-[var(--cds-interactive-01)]/90 text-white text-xs font-mono font-bold rounded-lg transition-colors flex items-center gap-2 cursor-pointer shadow-md"
              >
                <Database className="w-4 h-4" />
                <span>{isAr ? 'حفظ وإضافة للمستودع' : 'Save to Datasets Catalog'}</span>
              </button>
            </div>
          </div>

          {/* Dataset Name & Description Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono text-xs">
            <div className="space-y-1">
              <label className="text-[var(--cds-text-03)] text-[11px] block">{isAr ? 'اسم مجموعة البيانات:' : 'Dataset Name:'}</label>
              <input
                type="text"
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                className="w-full bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] px-3 py-2 rounded-lg outline-hidden"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[var(--cds-text-03)] text-[11px] block">{isAr ? 'الوصف / الملاحظات:' : 'Description:'}</label>
              <input
                type="text"
                value={datasetDesc}
                onChange={(e) => setDatasetDesc(e.target.value)}
                className="w-full bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] px-3 py-2 rounded-lg outline-hidden"
              />
            </div>
          </div>

          {/* Schema Columns Badges */}
          <div className="space-y-2">
            <span className="text-[10px] font-mono uppercase text-[var(--cds-text-03)] block">
              {isAr ? 'الأعمدة والأنواع المستنتجة (Inferred Columns):' : 'Inferred Schema Columns:'}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {detectedColumns.map((col, idx) => (
                <div
                  key={idx}
                  className="px-2 py-1 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded text-xs font-mono flex items-center gap-1.5"
                >
                  <span className="text-[var(--cds-text-01)] font-bold">{col.name}</span>
                  <span className={`text-[9px] px-1 py-0.2 rounded uppercase ${
                    col.type === 'float' || col.type === 'integer'
                      ? 'bg-blue-500/20 text-blue-400'
                      : col.type === 'date'
                      ? 'bg-purple-500/20 text-purple-400'
                      : 'bg-zinc-500/20 text-zinc-400'
                  }`}>
                    {col.type}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Table Sample Data (Top 5 rows) */}
          <div className="overflow-x-auto border border-[var(--cds-border-subtle)] rounded-xl">
            <table className="w-full text-xs font-mono text-left rtl:text-right">
              <thead className="bg-[var(--cds-layer-02)] text-[var(--cds-text-03)] border-b border-[var(--cds-border-subtle)] text-[11px]">
                <tr>
                  {detectedColumns.map((col, idx) => (
                    <th key={idx} className="p-2.5 whitespace-nowrap">
                      {col.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)]">
                {previewData.slice(0, 5).map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-[var(--cds-hover-ui)]">
                    {detectedColumns.map((col, cIdx) => (
                      <td key={cIdx} className="p-2.5 whitespace-nowrap text-[var(--cds-text-02)]">
                        {String(row[col.name] ?? '-')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
