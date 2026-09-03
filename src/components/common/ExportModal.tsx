import React, { useState, useMemo } from 'react';
import {
  Download,
  Copy,
  Check,
  X,
  FileSpreadsheet,
  FileText,
  FileCode,
  Printer,
  Database,
  Table as TableIcon,
  Sliders,
  CheckSquare,
  Square,
  Sparkles,
  Info,
  Eye
} from 'lucide-react';

export type ExportFormat = 'csv' | 'json' | 'excel' | 'pdf' | 'markdown' | 'sql';

export interface ExportModalOptions {
  filename: string;
  format: ExportFormat;
  scope: 'all' | 'filtered' | 'selected';
  delimiter: ',' | ';' | '\t';
  includeHeader: boolean;
  includeMetadata: boolean;
  selectedColumns: string[];
}

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  data?: Record<string, any>[];
  columns?: { key: string; header: string; type?: string }[];
  selectedRowIndices?: Set<number>;
  defaultFilename?: string;
  language?: 'ar' | 'en';
  additionalMetadata?: Record<string, any>;
  onCustomExport?: (options: ExportModalOptions) => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  data = [],
  columns: propColumns,
  selectedRowIndices,
  defaultFilename = 'export-report',
  language = 'ar',
  additionalMetadata,
  onCustomExport,
}) => {
  const isAr = language === 'ar';

  // Available Columns Resolution
  const availableColumns = useMemo(() => {
    if (propColumns && propColumns.length > 0) {
      return propColumns.map(c => ({ key: c.key, header: c.header || c.key }));
    }
    if (data.length > 0) {
      return Object.keys(data[0]).map(k => ({ key: k, header: k }));
    }
    return [];
  }, [propColumns, data]);

  // Form State
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [filename, setFilename] = useState<string>(defaultFilename);
  const [scope, setScope] = useState<'all' | 'filtered' | 'selected'>(
    selectedRowIndices && selectedRowIndices.size > 0 ? 'selected' : 'all'
  );
  const [delimiter, setDelimiter] = useState<',' | ';' | '\t'>(',');
  const [includeHeader, setIncludeHeader] = useState<boolean>(true);
  const [includeMetadata, setIncludeMetadata] = useState<boolean>(true);
  const [selectedColumnKeys, setSelectedColumnKeys] = useState<Set<string>>(
    () => new Set(availableColumns.map(c => c.key))
  );
  const [copied, setCopied] = useState<boolean>(false);

  // Filter Target Data based on Scope
  const targetData = useMemo(() => {
    if (scope === 'selected' && selectedRowIndices && selectedRowIndices.size > 0) {
      return data.filter((_, idx) => selectedRowIndices.has(idx));
    }
    return data;
  }, [data, scope, selectedRowIndices]);

  // Selected Columns List
  const activeCols = availableColumns.filter(c => selectedColumnKeys.has(c.key));

  // Toggle All Columns Selection
  const toggleAllColumns = () => {
    if (selectedColumnKeys.size >= availableColumns.length) {
      setSelectedColumnKeys(new Set());
    } else {
      setSelectedColumnKeys(new Set(availableColumns.map(c => c.key)));
    }
  };

  const toggleColumn = (key: string) => {
    const next = new Set(selectedColumnKeys);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setSelectedColumnKeys(next);
  };

  // Generate Export String / Preview Content
  const generatedContent = useMemo(() => {
    if (activeCols.length === 0 || targetData.length === 0) {
      return isAr ? 'لا توجد بيانات متاحة للتصدير' : 'No data available to export';
    }

    const cleanName = filename.replace(/[^a-zA-Z0-9_-]/g, '_');
    const timestamp = new Date().toISOString().split('T')[0];

    // CSV Format
    if (format === 'csv' || format === 'excel') {
      let lines: string[] = [];
      if (includeMetadata) {
        lines.push(`# Carbon Analytics Export Report - ${cleanName}`);
        lines.push(`# Timestamp: ${new Date().toLocaleString()}`);
        lines.push(`# Total Rows: ${targetData.length}`);
        lines.push('');
      }
      if (includeHeader) {
        lines.push(activeCols.map(c => `"${c.header.replace(/"/g, '""')}"`).join(delimiter));
      }
      targetData.forEach(row => {
        const rowVals = activeCols.map(c => {
          const val = row[c.key];
          if (val === null || val === undefined) return '""';
          const str = String(val).replace(/"/g, '""');
          return `"${str}"`;
        });
        lines.push(rowVals.join(delimiter));
      });
      return lines.join('\n');
    }

    // JSON Format
    if (format === 'json') {
      const filteredObjects = targetData.map(row => {
        const obj: Record<string, any> = {};
        activeCols.forEach(c => {
          obj[c.key] = row[c.key];
        });
        return obj;
      });

      if (includeMetadata) {
        return JSON.stringify(
          {
            exportInfo: {
              reportName: cleanName,
              timestamp: new Date().toISOString(),
              rowCount: targetData.length,
              source: 'Carbon Enterprise AI Platform',
              ...additionalMetadata,
            },
            data: filteredObjects,
          },
          null,
          2
        );
      }
      return JSON.stringify(filteredObjects, null, 2);
    }

    // Markdown Format
    if (format === 'markdown') {
      let lines: string[] = [];
      lines.push(`# ${cleanName} Report`);
      lines.push(`*Exported on ${timestamp} | Total records: ${targetData.length}*`);
      lines.push('');
      lines.push(`| ${activeCols.map(c => c.header).join(' | ')} |`);
      lines.push(`| ${activeCols.map(() => '---').join(' | ')} |`);
      targetData.forEach(row => {
        lines.push(`| ${activeCols.map(c => String(row[c.key] ?? '')).join(' | ')} |`);
      });
      return lines.join('\n');
    }

    // SQL Dump Format
    if (format === 'sql') {
      const tableName = cleanName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      let lines: string[] = [];
      lines.push(`-- SQL Dump Export: ${cleanName}`);
      lines.push(`-- Generated at: ${new Date().toISOString()}`);
      lines.push('');
      lines.push(`CREATE TABLE IF NOT EXISTS ${tableName} (`);
      const colDefs = activeCols.map(c => `  ${c.key} VARCHAR(255)`);
      lines.push(colDefs.join(',\n'));
      lines.push(`);`);
      lines.push('');

      targetData.forEach(row => {
        const colNames = activeCols.map(c => c.key).join(', ');
        const vals = activeCols
          .map(c => {
            const v = row[c.key];
            if (v === null || v === undefined) return 'NULL';
            if (typeof v === 'number' || typeof v === 'boolean') return `${v}`;
            return `'${String(v).replace(/'/g, "''")}'`;
          })
          .join(', ');
        lines.push(`INSERT INTO ${tableName} (${colNames}) VALUES (${vals});`);
      });
      return lines.join('\n');
    }

    // PDF / HTML Print Report
    if (format === 'pdf') {
      return `[PDF Report Document]
Report Title: ${title || cleanName}
Generated On: ${new Date().toLocaleString()}
Total Records Included: ${targetData.length}
Selected Columns: ${activeCols.map(c => c.header).join(', ')}

Click "Print / Save PDF" to open a styled print document in your browser.`;
    }

    return '';
  }, [format, activeCols, targetData, delimiter, includeHeader, includeMetadata, filename, title, additionalMetadata, isAr]);

  // Handle PDF Printable Window Generation
  const handlePrintPdf = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const tableHeadersHtml = activeCols.map(c => `<th style="padding: 10px; border: 1px solid #ddd; background: #0f62fe; color: white; text-align: left;">${c.header}</th>`).join('');
    const tableRowsHtml = targetData.map((row, idx) => {
      const bg = idx % 2 === 0 ? '#f9f9f9' : '#ffffff';
      const cells = activeCols.map(c => `<td style="padding: 8px; border: 1px solid #ddd;">${row[c.key] ?? ''}</td>`).join('');
      return `<tr style="background: ${bg};">${cells}</tr>`;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html dir="${isAr ? 'rtl' : 'ltr'}">
        <head>
          <title>${filename} - PDF Report</title>
          <style>
            body { font-family: system-ui, -apple-system, sans-serif; padding: 30px; color: #161616; }
            .header { border-bottom: 2px solid #0f62fe; padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
            .meta-box { background: #f4f4f4; padding: 12px; border-radius: 6px; margin-bottom: 20px; font-size: 12px; display: flex; gap: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            .footer { margin-top: 30px; border-top: 1px solid #ddd; pt-10px; font-size: 10px; color: #666; text-align: center; }
          </style>
        </head>
        <body>
          <div class="header">
            <h2>${title || filename}</h2>
            <span style="font-size: 12px; color: #666;">Carbon AI Platform</span>
          </div>
          <div class="meta-box">
            <div><strong>Date:</strong> ${new Date().toLocaleString()}</div>
            <div><strong>Total Records:</strong> ${targetData.length}</div>
            <div><strong>Format:</strong> PDF / Printable Report</div>
          </div>
          <table>
            <thead><tr>${tableHeadersHtml}</tr></thead>
            <tbody>${tableRowsHtml}</tbody>
          </table>
          <div class="footer">
            Generated by Carbon Enterprise Intelligence Platform
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  // Trigger Download
  const handleDownload = () => {
    if (onCustomExport) {
      onCustomExport({
        filename,
        format,
        scope,
        delimiter,
        includeHeader,
        includeMetadata,
        selectedColumns: Array.from(selectedColumnKeys),
      });
      onClose();
      return;
    }

    if (format === 'pdf') {
      handlePrintPdf();
      onClose();
      return;
    }

    const cleanName = filename.replace(/[^a-zA-Z0-9_-]/g, '_');
    let ext = '.csv';
    let mimeType = 'text/csv;charset=utf-8;';

    if (format === 'json') {
      ext = '.json';
      mimeType = 'application/json;charset=utf-8;';
    } else if (format === 'excel') {
      ext = '.csv'; // Excel CSV
      mimeType = 'text/csv;charset=utf-8;';
    } else if (format === 'markdown') {
      ext = '.md';
      mimeType = 'text/markdown;charset=utf-8;';
    } else if (format === 'sql') {
      ext = '.sql';
      mimeType = 'text/plain;charset=utf-8;';
    }

    const blob = new Blob([generatedContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${cleanName}_${new Date().toISOString().split('T')[0]}${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onClose();
  };

  // Copy Content to Clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(generatedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      <div className="bg-[#161616] border border-[#393939] rounded-xl max-w-2xl w-full p-5 sm:p-6 space-y-5 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#2d2d2d] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#0f62fe]/15 text-[#78a9ff] flex items-center justify-center border border-[#0f62fe]/40 rounded-lg shrink-0">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#f4f4f4] flex items-center gap-2">
                <span>{title || (isAr ? 'خيارات التصدير المركزية (Centralized Export)' : 'Export Options Hub')}</span>
                <span className="px-2 py-0.5 text-[10px] font-mono bg-[#24a148]/20 text-[#42be65] border border-[#24a148]/40 rounded">
                  {targetData.length} {isAr ? 'سجل' : 'rows'}
                </span>
              </h2>
              <p className="text-xs text-[#8d8d8d] mt-0.5">
                {description || (isAr ? 'تنزيل أو نسخ البيانات الحالية بالتنسيقات القياسية (CSV, JSON, Excel, PDF, SQL, Markdown).' : 'Export current dataset or view in standard formats.')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#a8a8a8] hover:text-white hover:bg-[#262626] rounded-md transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="space-y-5 overflow-y-auto pr-1 custom-scrollbar flex-1">
          
          {/* Format Selector Pills */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#8d8d8d] uppercase tracking-wider block">
              {isAr ? '1. اختر تنسيق الملف (Export Format):' : '1. Choose Export Format:'}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {[
                { id: 'csv', name: 'CSV (Delimited)', icon: FileSpreadsheet, badge: 'Standard', color: '#42be65' },
                { id: 'json', name: 'JSON (Array/Object)', icon: FileCode, badge: 'Structured', color: '#78a9ff' },
                { id: 'excel', name: 'Excel Compatible', icon: TableIcon, badge: 'Spreadsheet', color: '#f1c21b' },
                { id: 'pdf', name: 'PDF / Print Report', icon: Printer, badge: 'Printable', color: '#ff832b' },
                { id: 'markdown', name: 'Markdown Table', icon: FileText, badge: 'Documentation', color: '#be95ff' },
                { id: 'sql', name: 'SQL Insert Dump', icon: Database, badge: 'Database', color: '#33b1ff' },
              ].map(item => {
                const Icon = item.icon;
                const isSelected = format === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setFormat(item.id as ExportFormat)}
                    className={`p-3 text-start border transition-all rounded-lg cursor-pointer flex flex-col justify-between h-20 ${
                      isSelected
                        ? 'bg-[#0f62fe]/15 border-[#0f62fe] ring-1 ring-[#0f62fe]'
                        : 'bg-[#1e1e1e] border-[#2d2d2d] hover:border-[#525252]'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <Icon className="w-4 h-4" style={{ color: item.color }} />
                      <span className="text-[9px] font-mono font-semibold px-1.5 py-0.2 bg-[#262626] text-[#8d8d8d] border border-[#393939] rounded">
                        {item.badge}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-[#f4f4f4] mt-2 block">
                      {item.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Configuration Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[#1e1e1e] p-4 border border-[#2d2d2d] rounded-lg">
            
            {/* Filename Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#f4f4f4] block">
                {isAr ? 'اسم الملف (Filename):' : 'Filename:'}
              </label>
              <input
                type="text"
                value={filename}
                onChange={e => setFilename(e.target.value)}
                placeholder="export-report"
                className="w-full h-9 px-3 text-xs bg-[#161616] text-[#f4f4f4] border border-[#525252] focus:border-[#0f62fe] focus:outline-hidden font-mono rounded-md"
              />
            </div>

            {/* Scope Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#f4f4f4] block">
                {isAr ? 'نطاق السجلات (Record Scope):' : 'Record Scope:'}
              </label>
              <select
                value={scope}
                onChange={e => setScope(e.target.value as any)}
                className="w-full h-9 px-3 text-xs bg-[#161616] text-[#f4f4f4] border border-[#525252] focus:border-[#0f62fe] focus:outline-hidden font-mono rounded-md cursor-pointer"
              >
                <option value="all">{isAr ? `جميع السجلات (${data.length} سجل)` : `All Records (${data.length} rows)`}</option>
                {selectedRowIndices && selectedRowIndices.size > 0 && (
                  <option value="selected">{isAr ? `السجلات المحددة فقط (${selectedRowIndices.size} سجل)` : `Selected Rows (${selectedRowIndices.size} rows)`}</option>
                )}
              </select>
            </div>

            {/* CSV Delimiter Options */}
            {(format === 'csv' || format === 'excel') && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[#f4f4f4] block">
                  {isAr ? 'محدد الخلايا (CSV Delimiter):' : 'CSV Delimiter:'}
                </label>
                <div className="flex items-center gap-2">
                  {[
                    { id: ',', label: 'Comma (,)' },
                    { id: ';', label: 'Semicolon (;)' },
                    { id: '\t', label: 'Tab' },
                  ].map(d => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setDelimiter(d.id as any)}
                      className={`h-9 px-3 text-xs font-mono border rounded-md cursor-pointer transition-colors ${
                        delimiter === d.id
                          ? 'bg-[#0f62fe] border-[#0f62fe] text-white font-bold'
                          : 'bg-[#161616] border-[#393939] text-[#c6c6c6] hover:bg-[#262626]'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Checkbox Options */}
            <div className="space-y-2 flex flex-col justify-center">
              <label className="flex items-center gap-2 text-xs text-[#f4f4f4] cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeHeader}
                  onChange={e => setIncludeHeader(e.target.checked)}
                  className="rounded border-[#525252] bg-[#161616] text-[#0f62fe] focus:ring-0"
                />
                <span>{isAr ? 'تضمين أسماء الأعمدة (Header Row)' : 'Include Header Row'}</span>
              </label>

              <label className="flex items-center gap-2 text-xs text-[#f4f4f4] cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeMetadata}
                  onChange={e => setIncludeMetadata(e.target.checked)}
                  className="rounded border-[#525252] bg-[#161616] text-[#0f62fe] focus:ring-0"
                />
                <span>{isAr ? 'تضمين بيانات وصفية وتاريخ التقرير (Metadata Note)' : 'Include Metadata Header'}</span>
              </label>
            </div>

          </div>

          {/* Column Picker */}
          {availableColumns.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#8d8d8d] uppercase tracking-wider">
                  {isAr ? '2. الأعمدة المحددة للتصدير:' : '2. Select Columns to Include:'}
                </label>
                <button
                  type="button"
                  onClick={toggleAllColumns}
                  className="text-xs text-[#78a9ff] hover:underline cursor-pointer"
                >
                  {selectedColumnKeys.size >= availableColumns.length
                    ? (isAr ? 'إلغاء تحديد الكل' : 'Deselect All')
                    : (isAr ? 'تحديد كافة الأعمدة' : 'Select All')}
                </button>
              </div>

              <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto p-2 bg-[#1e1e1e] border border-[#2d2d2d] rounded-lg custom-scrollbar">
                {availableColumns.map(col => {
                  const isChecked = selectedColumnKeys.has(col.key);
                  return (
                    <button
                      key={col.key}
                      type="button"
                      onClick={() => toggleColumn(col.key)}
                      className={`px-2.5 py-1 text-xs font-mono border rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                        isChecked
                          ? 'bg-[#0f62fe]/20 border-[#0f62fe] text-[#78a9ff] font-semibold'
                          : 'bg-[#161616] border-[#393939] text-[#8d8d8d] hover:text-white'
                      }`}
                    >
                      {isChecked ? <CheckSquare className="w-3.5 h-3.5 text-[#0f62fe]" /> : <Square className="w-3.5 h-3.5" />}
                      <span>{col.header}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Live Output Code Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#8d8d8d] uppercase tracking-wider flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-[#78a9ff]" />
                {isAr ? 'معاينة حية للملف المعالج (Live Output Preview):' : 'Live Output Snippet Preview:'}
              </span>
              <span className="text-[10px] font-mono text-[#8d8d8d]">
                {format.toUpperCase()}
              </span>
            </div>

            <pre className="p-3 bg-[#0d0d0d] border border-[#2d2d2d] rounded-lg text-[11px] font-mono text-[#42be65] max-h-36 overflow-auto custom-scrollbar select-all whitespace-pre-wrap">
              {generatedContent.slice(0, 1200)}
              {generatedContent.length > 1200 && '\n\n... [Truncated for preview]'}
            </pre>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-[#2d2d2d] pt-4 gap-3 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="h-9 px-4 text-xs font-semibold bg-[#262626] hover:bg-[#393939] text-[#f4f4f4] border border-[#525252] flex items-center gap-2 transition-all rounded-md cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4 text-[#42be65]" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? (isAr ? 'تم النسخ!' : 'Copied!') : (isAr ? 'نسخ إلى الحافظة' : 'Copy to Clipboard')}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 text-xs font-semibold bg-[#262626] hover:bg-[#393939] text-[#c6c6c6] border border-[#393939] transition-all rounded-md cursor-pointer"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="h-9 px-5 text-xs font-semibold bg-[#0f62fe] hover:bg-[#0353e9] text-white flex items-center gap-2 transition-all rounded-md cursor-pointer shadow-md"
            >
              <Download className="w-4 h-4" />
              <span>{format === 'pdf' ? (isAr ? 'طباعة / حفظ PDF' : 'Print / Save PDF') : (isAr ? 'تنزيل الملف الان' : 'Download File')}</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
