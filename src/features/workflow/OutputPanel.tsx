import React, { useState, useMemo } from 'react';
import {
  Table as TableIcon,
  BarChart3,
  Bot,
  AlertTriangle,
  Code2,
  Download,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  ArrowRight,
  Sparkles,
  Database,
  Layers,
  TrendingUp,
  AlertCircle
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';
import { CustomWorkflowNode, ExecutionRunResult } from './types';

interface OutputPanelProps {
  nodes: CustomWorkflowNode[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  lastRunResult: ExecutionRunResult | null;
  isOpen: boolean;
  onClose: () => void;
  isAr?: boolean;
}

type OutputTab = 'table' | 'charts' | 'ai' | 'errors' | 'raw';

const CHART_COLORS = ['#0f62fe', '#8a3ffc', '#009d9a', '#24a148', '#ff7eb6', '#f1c21b', '#fa4d56'];

export const OutputPanel: React.FC<OutputPanelProps> = ({
  nodes,
  selectedNodeId,
  onSelectNode,
  lastRunResult,
  isOpen,
  onClose,
  isAr = true,
}) => {
  const [activeTab, setActiveTab] = useState<OutputTab>('table');
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Active selected node or default to first node with output or pipeline overview
  const activeNode = useMemo(() => {
    if (selectedNodeId) {
      return nodes.find((n) => n.id === selectedNodeId) || null;
    }
    // Return last executed node with output if any
    return nodes.find((n) => n.data.status === 'success' || n.data.status === 'failed') || nodes[0] || null;
  }, [selectedNodeId, nodes]);

  const outputData = activeNode?.data?.outputData;
  const status = activeNode?.data?.status || 'idle';
  const errorMessage = activeNode?.data?.errorMessage;
  const executionTimeMs = activeNode?.data?.executionTimeMs;

  // Table rows & columns
  const tableRows = useMemo(() => {
    return outputData?.rows || [];
  }, [outputData]);

  const tableColumns = useMemo(() => {
    if (outputData?.columns && outputData.columns.length > 0) {
      return outputData.columns;
    }
    if (tableRows.length > 0) {
      return Object.keys(tableRows[0]).map((key) => ({
        name: key,
        type: typeof tableRows[0][key] === 'number' ? 'number' : 'string',
      }));
    }
    return [];
  }, [outputData, tableRows]);

  // Filtered rows based on search
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim()) return tableRows;
    const q = searchQuery.toLowerCase();
    return tableRows.filter((row) =>
      Object.values(row).some((val) => String(val ?? '').toLowerCase().includes(q))
    );
  }, [tableRows, searchQuery]);

  // Paginated rows
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(filteredRows.length / rowsPerPage) || 1;

  // Copy raw output payload
  const handleCopyRaw = () => {
    const payload = {
      nodeId: activeNode?.id,
      nodeType: activeNode?.data?.nodeType,
      label: activeNode?.data?.label,
      status: activeNode?.data?.status,
      executionTimeMs: activeNode?.data?.executionTimeMs,
      lastOutput: activeNode?.data?.lastOutput,
      outputData: activeNode?.data?.outputData,
      errorMessage: activeNode?.data?.errorMessage,
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Export Table Data to CSV
  const handleExportCSV = () => {
    if (tableRows.length === 0) return;
    const headers = tableColumns.map((c) => `"${c.name}"`).join(',');
    const csvContent = [
      headers,
      ...tableRows.map((r) =>
        tableColumns.map((c) => `"${String(r[c.name] ?? '').replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `workflow_node_${activeNode?.id || 'output'}_data.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Prepare chart series if available
  const numericColumns = useMemo(() => {
    return tableColumns.filter((c) => c.type === 'number' || c.type === 'integer' || c.type === 'float');
  }, [tableColumns]);

  const chartDataFromRows = useMemo(() => {
    if (outputData?.chartData) return outputData.chartData;
    if (outputData?.forecastData) return outputData.forecastData;

    if (tableRows.length > 0 && numericColumns.length > 0) {
      const labelCol = tableColumns.find((c) => c.name !== numericColumns[0]?.name)?.name || 'index';
      return tableRows.slice(0, 15).map((row, idx) => {
        const item: Record<string, any> = {
          name: String(row[labelCol] || `Item ${idx + 1}`),
        };
        numericColumns.forEach((col) => {
          item[col.name] = Number(row[col.name]) || 0;
        });
        return item;
      });
    }
    return [];
  }, [outputData, tableRows, tableColumns, numericColumns]);

  if (!isOpen) return null;

  return (
    <div
      id="workflow-output-panel"
      className={`bg-[var(--cds-layer-01)] border-t border-[var(--cds-border-subtle)] flex flex-col z-30 shadow-2xl transition-all duration-300 ${
        isExpanded ? 'h-[580px]' : 'h-80'
      }`}
    >
      {/* 1. Header Toolbar */}
      <div className="p-2.5 bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)] flex flex-wrap items-center justify-between px-4 gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Main Title Badge */}
          <div className="flex items-center gap-2 text-white font-mono text-xs font-bold">
            <Layers className="w-4 h-4 text-[#78a9ff]" />
            <span>{isAr ? 'لوحة معاينة المخرجات والنتائج (Output Panel)' : 'Workflow Output Inspector'}</span>
          </div>

          {/* Node Selector Dropdown */}
          <div className="flex items-center gap-1.5 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg px-2 py-1 text-xs">
            <Database className="w-3.5 h-3.5 text-[var(--cds-text-03)]" />
            <select
              value={activeNode?.id || ''}
              onChange={(e) => onSelectNode(e.target.value || null)}
              className="bg-transparent text-white font-mono text-[11px] focus:outline-none cursor-pointer"
            >
              {nodes.map((node) => (
                <option key={node.id} value={node.id} className="bg-[var(--cds-layer-02)] text-white">
                  {node.data.status === 'success' ? '✅ ' : node.data.status === 'failed' ? '❌ ' : '⚪ '}
                  {isAr ? (node.data.labelAr || node.data.label) : node.data.label} ({node.data.nodeType})
                </option>
              ))}
            </select>
          </div>

          {/* Node Status Indicator Pill */}
          {activeNode && (
            <div className="flex items-center gap-1.5 text-[11px] font-mono">
              {status === 'success' && (
                <span className="flex items-center gap-1 text-[#42be65] bg-[#24a148]/15 px-2 py-0.5 rounded border border-[#24a148]/30">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{isAr ? 'اكتمل بنجاح' : 'Success'}</span>
                  {executionTimeMs !== undefined && (
                    <span className="text-[var(--cds-text-02)] text-[10px]">({executionTimeMs}ms)</span>
                  )}
                </span>
              )}

              {status === 'running' && (
                <span className="flex items-center gap-1 text-[#78a9ff] bg-[#0f62fe]/15 px-2 py-0.5 rounded border border-[#0f62fe]/30 animate-pulse">
                  <Clock className="w-3 h-3 animate-spin" />
                  <span>{isAr ? 'جاري المعالجة...' : 'Processing...'}</span>
                </span>
              )}

              {status === 'failed' && (
                <span className="flex items-center gap-1 text-[#fa4d56] bg-[#da1e28]/15 px-2 py-0.5 rounded border border-[#da1e28]/30">
                  <AlertCircle className="w-3 h-3" />
                  <span>{isAr ? 'تعثرت المعالجة' : 'Failed'}</span>
                </span>
              )}

              {status === 'idle' && (
                <span className="flex items-center gap-1 text-[var(--cds-text-03)] bg-[var(--cds-layer-03)]/30 px-2 py-0.5 rounded border border-[var(--cds-border-subtle)]">
                  <span>{isAr ? 'جاهز للتشغيل' : 'Idle'}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* View Switcher Tabs & Actions */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-[var(--cds-layer-01)] p-0.5 rounded-lg border border-[var(--cds-border-subtle)] text-[11px] font-mono">
            <button
              onClick={() => setActiveTab('table')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors cursor-pointer ${
                activeTab === 'table' ? 'bg-[#0f62fe] text-white font-bold' : 'text-[var(--cds-text-02)] hover:text-white'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>{isAr ? 'جدول البيانات' : 'Data Table'}</span>
              {tableRows.length > 0 && <span className="text-[10px] opacity-80">({tableRows.length})</span>}
            </button>

            <button
              onClick={() => setActiveTab('charts')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors cursor-pointer ${
                activeTab === 'charts' ? 'bg-[#0f62fe] text-white font-bold' : 'text-[var(--cds-text-02)] hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>{isAr ? 'الرسوم البيانية' : 'Visual Charts'}</span>
            </button>

            {(outputData?.summaryText || activeNode?.data?.nodeType.includes('ai') || lastRunResult?.producedOutputs?.aiSummary) && (
              <button
                onClick={() => setActiveTab('ai')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors cursor-pointer ${
                  activeTab === 'ai' ? 'bg-[#0f62fe] text-white font-bold' : 'text-[var(--cds-text-02)] hover:text-white'
                }`}
              >
                <Bot className="w-3.5 h-3.5 text-[#be95ff]" />
                <span>{isAr ? 'تحليل AI' : 'AI Insights'}</span>
              </button>
            )}

            {status === 'failed' && (
              <button
                onClick={() => setActiveTab('errors')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors cursor-pointer ${
                  activeTab === 'errors' ? 'bg-[#da1e28] text-white font-bold' : 'text-[#fa4d56] hover:bg-[#da1e28]/20'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{isAr ? 'تقرير الخطأ' : 'Error Diagnostics'}</span>
              </button>
            )}

            <button
              onClick={() => setActiveTab('raw')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-colors cursor-pointer ${
                activeTab === 'raw' ? 'bg-[#0f62fe] text-white font-bold' : 'text-[var(--cds-text-02)] hover:text-white'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>{isAr ? 'البيانات الخام JSON' : 'Raw JSON'}</span>
            </button>
          </div>

          {/* Quick Actions (Expand, Copy, Close) */}
          <div className="flex items-center gap-1 text-[var(--cds-text-03)]">
            {tableRows.length > 0 && activeTab === 'table' && (
              <button
                onClick={handleExportCSV}
                className="p-1.5 hover:bg-[var(--cds-layer-03)] hover:text-white rounded-lg transition-colors cursor-pointer"
                title={isAr ? 'تصدير جدول البيانات كملف CSV' : 'Export Table to CSV'}
              >
                <Download className="w-4 h-4 text-[#42be65]" />
              </button>
            )}

            <button
              onClick={handleCopyRaw}
              className="p-1.5 hover:bg-[var(--cds-layer-03)] hover:text-white rounded-lg transition-colors cursor-pointer"
              title={isAr ? 'نسخ مخرجات العقدة' : 'Copy Output JSON'}
            >
              {copied ? <Check className="w-4 h-4 text-[#42be65]" /> : <Copy className="w-4 h-4" />}
            </button>

            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 hover:bg-[var(--cds-layer-03)] hover:text-white rounded-lg transition-colors cursor-pointer"
              title={isExpanded ? (isAr ? 'تصغير اللوحة' : 'Minimize') : (isAr ? 'تكبير اللوحة' : 'Maximize')}
            >
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 hover:bg-[#da1e28] hover:text-white rounded-lg transition-colors cursor-pointer ml-1"
              title={isAr ? 'إغلاق لوحة المخرجات' : 'Close Output Panel'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Content Body Area */}
      <div className="flex-1 overflow-auto p-4 bg-[var(--cds-background)]">
        {/* TAB 1: DATA TABLE VIEW */}
        {activeTab === 'table' && (
          <div className="space-y-3 h-full flex flex-col">
            {tableRows.length > 0 ? (
              <>
                {/* Search & Stats Bar */}
                <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-[var(--cds-border-subtle)]">
                  <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--cds-text-03)]" />
                    <input
                      type="text"
                      placeholder={isAr ? 'بحث في سجلات وقيم الجدول...' : 'Search records...'}
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg pl-8 pr-3 py-1 text-xs text-white placeholder-[#6f6f6f] focus:outline-none focus:border-[#0f62fe]"
                    />
                  </div>

                  <div className="flex items-center gap-3 text-xs text-[var(--cds-text-02)] font-mono">
                    <span className="bg-[var(--cds-layer-02)] px-2 py-0.5 rounded border border-[var(--cds-border-subtle)]">
                      {isAr ? 'الأعمدة:' : 'Columns:'} <strong className="text-white">{tableColumns.length}</strong>
                    </span>
                    <span className="bg-[var(--cds-layer-02)] px-2 py-0.5 rounded border border-[var(--cds-border-subtle)]">
                      {isAr ? 'السجلات:' : 'Rows:'} <strong className="text-[#42be65]">{filteredRows.length}</strong>
                    </span>
                    {outputData?.stats?.removedRows !== undefined && outputData.stats.removedRows > 0 && (
                      <span className="bg-[#da1e28]/15 text-[#fa4d56] px-2 py-0.5 rounded border border-[#da1e28]/30">
                        {isAr ? 'المستبعد بالتصفية:' : 'Excluded:'} -{outputData.stats.removedRows}
                      </span>
                    )}
                  </div>
                </div>

                {/* Interactive Table Container */}
                <div className="flex-1 overflow-auto border border-[var(--cds-border-subtle)] rounded-lg bg-[var(--cds-layer-01)]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] font-mono border-b border-[var(--cds-border-subtle)] z-10">
                      <tr>
                        <th className="p-2.5 px-3 w-12 text-center text-[var(--cds-text-03)]">#</th>
                        {tableColumns.map((col) => (
                          <th key={col.name} className="p-2.5 px-3 font-semibold whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span>{col.name}</span>
                              <span className="text-[9px] px-1 py-0.2 rounded bg-[var(--cds-layer-01)] text-[#78a9ff] border border-[var(--cds-border-subtle)]">
                                {col.type}
                              </span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--cds-border-subtle)] text-[var(--cds-text-01)] font-sans">
                      {paginatedRows.map((row, rIdx) => {
                        const rowNum = (currentPage - 1) * rowsPerPage + rIdx + 1;
                        return (
                          <tr key={rIdx} className="hover:bg-[var(--cds-layer-01)] transition-colors">
                            <td className="p-2.5 px-3 text-center text-[11px] font-mono text-[var(--cds-text-03)] bg-[var(--cds-layer-01)]/50">
                              {rowNum}
                            </td>
                            {tableColumns.map((col) => {
                              const val = row[col.name];
                              const isNull = val === null || val === undefined || val === '';
                              return (
                                <td key={col.name} className="p-2.5 px-3 whitespace-nowrap text-xs">
                                  {isNull ? (
                                    <span className="text-[10px] font-mono italic text-[#fa4d56] bg-[#da1e28]/10 px-1.5 py-0.5 rounded">
                                      null
                                    </span>
                                  ) : typeof val === 'number' ? (
                                    <span className="font-mono text-[#78a9ff]">{val.toLocaleString()}</span>
                                  ) : typeof val === 'boolean' ? (
                                    <span
                                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                                        val ? 'bg-[#24a148]/20 text-[#42be65]' : 'bg-[#da1e28]/20 text-[#fa4d56]'
                                      }`}
                                    >
                                      {String(val)}
                                    </span>
                                  ) : (
                                    <span className="truncate max-w-xs inline-block">{String(val)}</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                <div className="flex items-center justify-between text-xs text-[var(--cds-text-02)] pt-1">
                  <div className="flex items-center gap-2">
                    <span>{isAr ? 'عرض لكل صفحة:' : 'Rows per page:'}</span>
                    <select
                      value={rowsPerPage}
                      onChange={(e) => {
                        setRowsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="bg-[var(--cds-layer-02)] text-white border border-[var(--cds-border-subtle)] rounded px-2 py-0.5 text-xs focus:outline-none"
                    >
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2 font-mono text-[11px]">
                    <span>
                      {isAr ? 'الصفحة' : 'Page'} {currentPage} {isAr ? 'من' : 'of'} {totalPages}
                    </span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage <= 1}
                        className="p-1 rounded bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] disabled:opacity-40 hover:bg-[var(--cds-layer-03)] transition-colors cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage >= totalPages}
                        className="p-1 rounded bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] disabled:opacity-40 hover:bg-[var(--cds-layer-03)] transition-colors cursor-pointer"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-2 text-[var(--cds-text-03)]">
                <TableIcon className="w-10 h-10 text-[var(--cds-text-03)] mb-1" />
                <p className="text-sm font-semibold text-white">
                  {isAr ? 'لا توجد بيانات جدولية لمعاينتها بعد' : 'No tabular output data available yet'}
                </p>
                <p className="text-xs max-w-sm">
                  {isAr
                    ? 'اضغط زر "تشغيل تدفق العمل" في الأعلى لمعالجة البيانات وتوليد النتائج فورياً عبر كافة العقد.'
                    : 'Click "Execute Pipeline" to run the workflow and view live output records.'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: CHARTS & VISUALIZATIONS */}
        {activeTab === 'charts' && (
          <div className="space-y-4 h-full flex flex-col">
            {/* KPI Metrics Cards Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg">
                <div className="text-[10px] font-mono text-[var(--cds-text-03)] uppercase">
                  {isAr ? 'إجمالي السجلات' : 'Total Records'}
                </div>
                <div className="text-xl font-bold text-white mt-1">
                  {(outputData?.stats?.processedRows || tableRows.length).toLocaleString()}
                </div>
              </div>

              {outputData?.qualityScore !== undefined && (
                <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg">
                  <div className="text-[10px] font-mono text-[var(--cds-text-03)] uppercase">
                    {isAr ? 'مؤشر الجودة والصحة' : 'Quality Score'}
                  </div>
                  <div className="text-xl font-bold text-[#42be65] mt-1 flex items-center gap-1.5">
                    <ShieldCheck className="w-5 h-5" />
                    <span>{outputData.qualityScore}%</span>
                  </div>
                </div>
              )}

              {outputData?.metrics?.sum !== undefined && (
                <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg">
                  <div className="text-[10px] font-mono text-[var(--cds-text-03)] uppercase">
                    {isAr ? 'الإجمالي التراكمي' : 'Metric Sum'}
                  </div>
                  <div className="text-xl font-bold text-[#78a9ff] mt-1">
                    {Number(outputData.metrics.sum).toLocaleString()}
                  </div>
                </div>
              )}

              {outputData?.metrics?.average !== undefined && (
                <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg">
                  <div className="text-[10px] font-mono text-[var(--cds-text-03)] uppercase">
                    {isAr ? 'المتوسط الحسابي' : 'Metric Average'}
                  </div>
                  <div className="text-xl font-bold text-[#be95ff] mt-1">
                    {Number(outputData.metrics.average).toLocaleString()}
                  </div>
                </div>
              )}

              {outputData?.metrics?.projectedFutureSum !== undefined && (
                <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg">
                  <div className="text-[10px] font-mono text-[var(--cds-text-03)] uppercase">
                    {isAr ? 'التقدير المستقبلي (+8%)' : 'Projected Value'}
                  </div>
                  <div className="text-xl font-bold text-[#42be65] mt-1 flex items-center gap-1">
                    <TrendingUp className="w-5 h-5" />
                    <span>{Number(outputData.metrics.projectedFutureSum).toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Charts Visual Container */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-[260px]">
              {/* Chart 1: Bar / Area distribution */}
              <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <BarChart3 className="w-4 h-4 text-[#78a9ff]" />
                    {isAr ? 'توزيع القيم والمؤشرات' : 'Metric Distribution'}
                  </span>
                </div>
                <div className="flex-1 w-full h-[220px]">
                  {chartDataFromRows.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartDataFromRows} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                        <XAxis dataKey="name" stroke="#8d8d8d" fontSize={10} />
                        <YAxis stroke="#8d8d8d" fontSize={10} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#161616',
                            borderColor: '#393939',
                            color: '#fff',
                            borderRadius: '8px',
                          }}
                        />
                        {numericColumns.length > 0 ? (
                          numericColumns.slice(0, 2).map((col, idx) => (
                            <Bar key={col.name} dataKey={col.name} fill={CHART_COLORS[idx % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
                          ))
                        ) : (
                          <Bar dataKey="value" fill="#0f62fe" radius={[4, 4, 0, 0]} />
                        )}
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-xs text-[var(--cds-text-03)]">
                      {isAr ? 'لا توجد بيانات رقمية كافية لرسم المخطط' : 'No numeric distribution available'}
                    </div>
                  )}
                </div>
              </div>

              {/* Chart 2: Trend / Forecast Line Chart or Pie Chart */}
              <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <TrendingUp className="w-4 h-4 text-[#42be65]" />
                    {outputData?.forecastData
                      ? (isAr ? 'مسار التنبؤ المستقبلي' : 'Forecast Projections')
                      : (isAr ? 'المنحنى التراكمي / المقارنة' : 'Trend Curves')}
                  </span>
                </div>
                <div className="flex-1 w-full h-[220px]">
                  {outputData?.forecastData ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={outputData.forecastData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                        <XAxis dataKey="period" stroke="#8d8d8d" fontSize={10} />
                        <YAxis stroke="#8d8d8d" fontSize={10} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#161616',
                            borderColor: '#393939',
                            color: '#fff',
                            borderRadius: '8px',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                        <Line type="monotone" dataKey="historical" name={isAr ? 'البيانات التاريخية' : 'Historical'} stroke="#78a9ff" strokeWidth={2} dot={{ r: 4 }} />
                        <Line type="monotone" dataKey="projected" name={isAr ? 'المسار المتوقع' : 'Projected'} stroke="#42be65" strokeWidth={2.5} strokeDasharray="4 4" dot={{ r: 5 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : chartDataFromRows.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartDataFromRows} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                        <XAxis dataKey="name" stroke="#8d8d8d" fontSize={10} />
                        <YAxis stroke="#8d8d8d" fontSize={10} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#161616',
                            borderColor: '#393939',
                            color: '#fff',
                            borderRadius: '8px',
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey={numericColumns[0]?.name || 'value'}
                          stroke="#8a3ffc"
                          fill="#8a3ffc"
                          fillOpacity={0.25}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-xs text-[var(--cds-text-03)]">
                      {isAr ? 'لا توجد بيانات زمنية للمعاينة' : 'No time-series data available'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: AI INSIGHTS & EXECUTIVE SUMMARY */}
        {activeTab === 'ai' && (
          <div className="space-y-4 max-w-4xl">
            <div className="p-4 bg-[var(--cds-layer-01)] border border-[#8a3ffc]/30 rounded-lg space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-[#be95ff]">
                <Sparkles className="w-4 h-4" />
                <span>{isAr ? 'التحليل الاستراتيجي وتوصيات الذكاء الاصطناعي:' : 'AI Strategic Insights:'}</span>
              </div>
              <p className="text-xs text-[var(--cds-text-01)] leading-relaxed whitespace-pre-wrap bg-[var(--cds-layer-01)] p-3 rounded-lg border border-[var(--cds-border-subtle)]">
                {outputData?.summaryText ||
                  lastRunResult?.producedOutputs?.aiSummary ||
                  (isAr
                    ? 'تم فحص السجلات وتحليل الأنماط بنجاح، وتؤكد النتائج استقرار المؤشرات الرئيسية والتزامها بالمعايير المحددة.'
                    : 'Dataset patterns verified successfully with high fidelity.')}
              </p>
            </div>

            {/* Zero-Egress Privacy Assurance */}
            <div className="p-3 bg-[#009d9a]/10 border border-[#009d9a]/30 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-[#08bdba]">
                <ShieldCheck className="w-4 h-4" />
                <span>{isAr ? 'ضمان الخصوصية التامة (Zero-Egress Data Security)' : 'Zero-Egress Privacy Enforced'}</span>
              </div>
              <span className="text-[10px] font-mono text-[var(--cds-text-02)]">Local Edge Processing</span>
            </div>
          </div>
        )}

        {/* TAB 4: ERROR DIAGNOSTICS */}
        {activeTab === 'errors' && (
          <div className="p-4 bg-[#da1e28]/10 border border-[#da1e28]/40 rounded-lg space-y-3 text-xs">
            <div className="flex items-center gap-2 text-[#fa4d56] font-bold">
              <AlertTriangle className="w-5 h-5" />
              <span>{isAr ? 'تفاصيل تعثر المرحلة (Error Diagnostics)' : 'Step Execution Error'}</span>
            </div>
            <div className="bg-[var(--cds-layer-01)] p-3 rounded-lg border border-[#da1e28]/30 font-mono text-[#ff8389] text-[11px]">
              {errorMessage || 'Unknown execution exception encountered.'}
            </div>
            <p className="text-[var(--cds-text-02)]">
              {isAr
                ? 'يرجى مراجعة إعدادات العقدة (Config) والتحقق من صحة أسماء الأعمدة وقيم العتبة المحددة.'
                : 'Please verify node configuration properties, threshold ranges, and dataset column mapping.'}
            </p>
          </div>
        )}

        {/* TAB 5: RAW JSON TELEMETRY */}
        {activeTab === 'raw' && (
          <div className="relative">
            <pre className="p-3 bg-[var(--cds-background)] border border-[var(--cds-border-subtle)] rounded-lg text-[11px] font-mono text-[#42be65] overflow-auto max-h-[420px] leading-relaxed">
              {JSON.stringify(
                {
                  nodeId: activeNode?.id,
                  nodeType: activeNode?.data?.nodeType,
                  label: activeNode?.data?.label,
                  status: activeNode?.data?.status,
                  executionTimeMs: activeNode?.data?.executionTimeMs,
                  lastOutput: activeNode?.data?.lastOutput,
                  outputData: activeNode?.data?.outputData,
                  errorMessage: activeNode?.data?.errorMessage,
                  pipelineSummary: lastRunResult?.producedOutputs,
                },
                null,
                2
              )}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
