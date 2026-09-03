import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Dataset, Dashboard } from '../../types';
import { generateDatasetLineage } from '../../utils/dataLineageGenerator';
import {
  GitFork,
  Database,
  ArrowRight,
  Layers,
  Sparkles,
  LayoutDashboard,
  FileText,
  Terminal,
  Download,
  ShieldCheck,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
  Filter,
  ZoomIn,
  ZoomOut,
  Maximize2,
  RefreshCw,
  Info,
  ChevronRight,
  ChevronLeft,
  X,
  Share2,
  Cpu,
  BarChart2,
  Server,
  Workflow,
  Radio,
  FileCode,
  FileSpreadsheet,
  Sliders,
  ExternalLink,
  Code2,
  Check,
  Copy,
} from 'lucide-react';

interface DataLineageViewProps {
  dataset: Dataset;
  onSelectDataset?: (id: string) => void;
}

type LineageTab = 'graph' | 'columns' | 'impact';

export const DataLineageView: React.FC<DataLineageViewProps> = ({
  dataset,
  onSelectDataset,
}) => {
  const {
    datasets,
    dashboards,
    dataStories,
    reports,
    auditLogs,
    setActiveTab,
    setActiveDatasetId,
    setActiveDashboardId,
    language,
    toast,
  } = useApp();
  const isAr = language === 'ar';

  const [activeTab, setActiveTabMode] = useState<LineageTab>('graph');
  const [selectedColumn, setSelectedColumn] = useState<string>(
    dataset.columns[0]?.name || ''
  );
  const [selectedNode, setSelectedNode] = useState<{
    id: string;
    type: 'source' | 'transform' | 'dataset' | 'destination';
    data: any;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [selectedSimColumn, setSelectedSimColumn] = useState<string>(
    dataset.columns[0]?.name || ''
  );
  const [simAction, setSimAction] = useState<'delete' | 'rename' | 'type_change'>('delete');
  const [isCopied, setIsCopied] = useState(false);

  // Generate real-time Lineage Manifest
  const manifest = useMemo(() => {
    return generateDatasetLineage(dataset, dashboards, dataStories, reports, auditLogs);
  }, [dataset, dashboards, dataStories, reports, auditLogs]);

  // Filtered nodes based on search query
  const filteredSources = useMemo(() => {
    if (!searchQuery) return manifest.sources;
    const q = searchQuery.toLowerCase();
    return manifest.sources.filter(
      s =>
        s.name.toLowerCase().includes(q) ||
        s.nameAr.toLowerCase().includes(q) ||
        s.sourceSystem.toLowerCase().includes(q)
    );
  }, [manifest.sources, searchQuery]);

  const filteredTransforms = useMemo(() => {
    if (!searchQuery) return manifest.transformations;
    const q = searchQuery.toLowerCase();
    return manifest.transformations.filter(
      t =>
        t.name.toLowerCase().includes(q) ||
        t.nameAr.toLowerCase().includes(q) ||
        t.details.toLowerCase().includes(q)
    );
  }, [manifest.transformations, searchQuery]);

  const filteredDestinations = useMemo(() => {
    if (!searchQuery) return manifest.destinations;
    const q = searchQuery.toLowerCase();
    return manifest.destinations.filter(
      d =>
        d.name.toLowerCase().includes(q) ||
        d.nameAr.toLowerCase().includes(q) ||
        d.category.toLowerCase().includes(q)
    );
  }, [manifest.destinations, searchQuery]);

  // Selected column trace
  const activeColumnTrace = useMemo(() => {
    return (
      manifest.columnTraces.find(c => c.columnName === selectedColumn) ||
      manifest.columnTraces[0] ||
      null
    );
  }, [manifest.columnTraces, selectedColumn]);

  // Impact simulation calculations
  const impactAnalysis = useMemo(() => {
    const colName = selectedSimColumn;
    const affectedWidgets: { dashTitle: string; widgetTitle: string; role: string }[] = [];

    dashboards.forEach(d => {
      d.widgets.forEach(w => {
        if (w.datasetId === dataset.id) {
          if (w.xAxis === colName) {
            affectedWidgets.push({ dashTitle: d.title, widgetTitle: w.title, role: 'X-Axis Dimension' });
          } else if (w.yAxis === colName) {
            affectedWidgets.push({ dashTitle: d.title, widgetTitle: w.title, role: 'Y-Axis Aggregated Metric' });
          } else if (w.categoryField === colName) {
            affectedWidgets.push({ dashTitle: d.title, widgetTitle: w.title, role: 'Category Filter / Slice' });
          }
        }
      });
    });

    const affectedReportsCount = dataStories.filter(s => s.datasetId === dataset.id).length;
    const isCritical = affectedWidgets.length > 0 || colName === 'revenue' || colName === 'order_id';

    return {
      column: colName,
      action: simAction,
      affectedWidgets,
      affectedReportsCount,
      riskLevel: isCritical ? 'HIGH' : affectedWidgets.length > 0 ? 'MEDIUM' : 'LOW',
      breakingQueriesCount: 3 + affectedWidgets.length * 2,
    };
  }, [selectedSimColumn, simAction, dashboards, dataStories, dataset.id]);

  // Export JSON Manifest
  const handleExportLineage = () => {
    const lineageExport = {
      $schema: 'https://openlineage.io/spec/1-0-5/OpenLineage.json',
      eventType: 'COMPLETE',
      eventTime: new Date().toISOString(),
      producer: 'IBM_Carbon_Analytics_Lineage_Engine_v2',
      dataset: {
        namespace: 'ibm.carbon.workspace',
        name: dataset.name,
        facets: {
          schema: {
            fields: dataset.columns.map(c => ({ name: c.name, type: c.type })),
          },
          dataSource: {
            name: manifest.sources[0]?.name || 'Local Catalog',
            uri: manifest.sources[0]?.sourceHost || 'in-memory://carbon',
          },
          dataQuality: {
            score: dataset.profile?.quality.overallScore || 95,
            slaStatus: manifest.slaStatus,
          },
        },
      },
      upstreamSources: manifest.sources,
      transformations: manifest.transformations,
      downstreamConsumers: manifest.destinations,
      columnTraces: manifest.columnTraces,
    };

    const blob = new Blob([JSON.stringify(lineageExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `data_lineage_${dataset.id}_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success(
      isAr ? 'تم تصدير مخطط مسار البيانات' : 'Data Lineage Exported',
      isAr
        ? `تم تصدير ملف OpenLineage لمجموعة ${dataset.name}.`
        : `Exported OpenLineage manifest for ${dataset.name}.`
    );
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(manifest, null, 2));
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
    toast.info(
      isAr ? 'تم نسخ المخطط للحافظة' : 'Lineage Copied',
      isAr ? 'تم نسخ مصفوفة التتبع بصيغة JSON.' : 'Copied lineage manifest JSON to clipboard.'
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Controls & Lineage Stats Bar */}
      <div className="bg-[#262626] border border-[#393939] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm">
        {/* Left: Title & Dataset Selector */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-9 h-9 bg-[#0f62fe] text-white flex items-center justify-center font-bold shrink-0">
            <GitFork className="w-5 h-5 rotate-90" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#0f62fe]">
                DATA LINEAGE & PROVENANCE ENGINE
              </span>
              <span className="bg-[#161616] text-[#42be65] border border-[#24a148] px-1.5 py-0.2 text-[9px] font-mono font-bold">
                ● SLA: {manifest.slaStatus}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <h3 className="text-base font-bold text-[#f4f4f4] truncate max-w-xs sm:max-w-md">
                {dataset.name}
              </h3>
              <span className="text-xs font-mono text-[#8d8d8d]">
                ({dataset.rowCount.toLocaleString()} {isAr ? 'سجل' : 'rows'} • {dataset.columns.length} {isAr ? 'حقل' : 'cols'})
              </span>
            </div>
          </div>

          {/* Dataset Switcher in Lineage View */}
          {datasets.length > 1 && onSelectDataset && (
            <div className="ms-2">
              <select
                value={dataset.id}
                onChange={e => {
                  onSelectDataset(e.target.value);
                  setActiveDatasetId(e.target.value);
                }}
                className="bg-[#161616] border border-[#525252] hover:border-[#8d8d8d] text-xs font-mono text-[#f4f4f4] px-2.5 py-1.5 cursor-pointer outline-hidden"
              >
                {datasets.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.format.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Right: Metrics & Actions */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Quick Metrics Pills */}
          <div className="hidden sm:flex items-center gap-3 bg-[#161616] border border-[#393939] px-3 py-1.5 text-xs font-mono">
            <div>
              <span className="text-[#8d8d8d] text-[10px] block">{isAr ? 'المصادر' : 'Sources'}</span>
              <span className="font-bold text-[#33b1ff]">{manifest.sources.length}</span>
            </div>
            <div className="border-e border-[#393939] h-6" />
            <div>
              <span className="text-[#8d8d8d] text-[10px] block">{isAr ? 'التحويلات' : 'Transforms'}</span>
              <span className="font-bold text-[#f1c21b]">{manifest.transformations.length}</span>
            </div>
            <div className="border-e border-[#393939] h-6" />
            <div>
              <span className="text-[#8d8d8d] text-[10px] block">{isAr ? 'الوجهات' : 'Consumers'}</span>
              <span className="font-bold text-[#42be65]">{manifest.destinations.length}</span>
            </div>
            <div className="border-e border-[#393939] h-6" />
            <div>
              <span className="text-[#8d8d8d] text-[10px] block">{isAr ? 'الحوكمة' : 'Governance'}</span>
              <span className="font-bold text-[#be95ff]">{manifest.governanceScore}%</span>
            </div>
          </div>

          {/* Export Manifest */}
          <button
            onClick={handleExportLineage}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#161616] hover:bg-[#333333] border border-[#393939] hover:border-[#42be65] text-xs font-mono text-[#f4f4f4] transition-colors"
            title={isAr ? 'تصدير وثيقة مسار البيانات (OpenLineage JSON)' : 'Export OpenLineage JSON'}
          >
            <Download className="w-3.5 h-3.5 text-[#42be65]" />
            <span className="hidden md:inline">{isAr ? 'تصدير المخطط' : 'Export JSON'}</span>
          </button>

          <button
            onClick={handleCopyJson}
            className="p-1.5 bg-[#161616] hover:bg-[#333333] border border-[#393939] text-[#c6c6c6] hover:text-white transition-colors"
            title={isAr ? 'نسخ المخطط' : 'Copy JSON'}
          >
            {isCopied ? <Check className="w-4 h-4 text-[#42be65]" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Lineage Sub-navigation (Pipeline Graph / Column Tracing / Impact Simulation) */}
      <div className="flex items-center justify-between border-b border-[#393939] bg-[#1a1a1a] px-2 pt-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTabMode('graph')}
            className={`px-4 py-2 text-xs font-mono font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'graph'
                ? 'border-[#0f62fe] text-[#f4f4f4] bg-[#262626]'
                : 'border-transparent text-[#8d8d8d] hover:text-[#c6c6c6] hover:bg-[#222222]'
            }`}
          >
            <Workflow className="w-3.5 h-3.5 text-[#0f62fe]" />
            <span>{isAr ? 'المسار المرئي الكامل (Pipeline DAG)' : 'Visual Pipeline Graph'}</span>
            <span className="text-[10px] bg-[#393939] px-1.5 py-0.2 text-[#c6c6c6]">
              {manifest.sources.length + manifest.transformations.length + manifest.destinations.length + 1}
            </span>
          </button>

          <button
            onClick={() => setActiveTabMode('columns')}
            className={`px-4 py-2 text-xs font-mono font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'columns'
                ? 'border-[#0f62fe] text-[#f4f4f4] bg-[#262626]'
                : 'border-transparent text-[#8d8d8d] hover:text-[#c6c6c6] hover:bg-[#222222]'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-[#f1c21b]" />
            <span>{isAr ? 'تتبع مسار الحقول والأعمدة (Column Lineage)' : 'Column-Level Tracing'}</span>
            <span className="text-[10px] bg-[#393939] px-1.5 py-0.2 text-[#c6c6c6]">
              {dataset.columns.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTabMode('impact')}
            className={`px-4 py-2 text-xs font-mono font-semibold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'impact'
                ? 'border-[#0f62fe] text-[#f4f4f4] bg-[#262626]'
                : 'border-transparent text-[#8d8d8d] hover:text-[#c6c6c6] hover:bg-[#222222]'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#da1e28]" />
            <span>{isAr ? 'تحليل الأثر ومحاكاة التغيير (Impact Analysis)' : 'Impact Simulation'}</span>
          </button>
        </div>

        {/* Zoom & Search Controls for Graph */}
        {activeTab === 'graph' && (
          <div className="hidden sm:flex items-center gap-2 pb-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#8d8d8d] absolute top-2 start-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={isAr ? 'بحث في العقد...' : 'Filter lineage nodes...'}
                className="bg-[#161616] border border-[#393939] text-xs font-mono text-[#f4f4f4] ps-8 pe-3 py-1 w-44 placeholder-[#6f6f6f] outline-hidden focus:border-[#0f62fe]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute top-1.5 end-2 text-[#8d8d8d] hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 bg-[#161616] border border-[#393939] px-1.5 py-0.5">
              <button
                onClick={() => setZoomLevel(prev => Math.max(70, prev - 10))}
                className="p-1 text-[#8d8d8d] hover:text-white"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-mono text-[#c6c6c6] w-8 text-center">
                {zoomLevel}%
              </span>
              <button
                onClick={() => setZoomLevel(prev => Math.min(130, prev + 10))}
                className="p-1 text-[#8d8d8d] hover:text-white"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setZoomLevel(100)}
                className="text-[10px] font-mono text-[#0f62fe] px-1 hover:underline"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>

      {/* TAB 1: VISUAL PIPELINE GRAPH (DAG) */}
      {activeTab === 'graph' && (
        <div className="relative border border-[#393939] bg-[#161616] overflow-x-auto min-h-[540px] p-6">
          {/* Background grid canvas effect */}
          <div
            className="absolute inset-0 opacity-15 pointer-events-none"
            style={{
              backgroundImage:
                'radial-gradient(circle, #525252 1px, transparent 1px)',
              backgroundSize: '24px 24px',
            }}
          />

          <div
            className="relative transition-transform origin-top-left flex gap-8 items-start justify-between min-w-[1050px]"
            style={{ transform: `scale(${zoomLevel / 100})` }}
          >
            {/* ------------------------------------------------------------- */}
            {/* STAGE 1: UPSTREAM ORIGINS / SOURCES */}
            {/* ------------------------------------------------------------- */}
            <div className="flex-1 space-y-3 min-w-[240px]">
              <div className="flex items-center justify-between pb-2 border-b border-[#393939]">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 bg-[#33b1ff] rounded-none" />
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#f4f4f4]">
                    1. {isAr ? 'المصادر والأنظمة الأصلية' : 'Origins & Sources'}
                  </span>
                </div>
                <span className="text-[10px] font-mono bg-[#262626] text-[#33b1ff] px-2 py-0.5 border border-[#393939]">
                  {filteredSources.length} {isAr ? 'مصدر' : 'Sources'}
                </span>
              </div>

              <div className="space-y-3">
                {filteredSources.map(src => {
                  const isSelected = selectedNode?.id === src.id;
                  return (
                    <div
                      key={src.id}
                      onClick={() =>
                        setSelectedNode({ id: src.id, type: 'source', data: src })
                      }
                      className={`bg-[#262626] border p-3.5 transition-all cursor-pointer relative group ${
                        isSelected
                          ? 'border-[#33b1ff] ring-1 ring-[#33b1ff] shadow-lg'
                          : 'border-[#393939] hover:border-[#525252]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-[#161616] border border-[#393939] flex items-center justify-center shrink-0">
                            {src.type === 'database' ? (
                              <Server className="w-3.5 h-3.5 text-[#33b1ff]" />
                            ) : src.type === 'stream' ? (
                              <Radio className="w-3.5 h-3.5 text-[#f1c21b]" />
                            ) : src.type === 'api' ? (
                              <Code2 className="w-3.5 h-3.5 text-[#42be65]" />
                            ) : (
                              <FileSpreadsheet className="w-3.5 h-3.5 text-[#be95ff]" />
                            )}
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-[#f4f4f4] group-hover:text-[#33b1ff] transition-colors line-clamp-1">
                              {isAr ? src.nameAr : src.name}
                            </h4>
                            <span className="text-[10px] font-mono text-[#8d8d8d] uppercase">
                              {src.sourceSystem.split(' ')[0]} • {src.ingestionMode}
                            </span>
                          </div>
                        </div>

                        <span className="w-2 h-2 rounded-full bg-[#42be65] shrink-0 mt-1" title="Connected & Synced" />
                      </div>

                      <p className="text-[11px] text-[#c6c6c6] mt-2 line-clamp-2 leading-relaxed">
                        {isAr ? src.descriptionAr : src.description}
                      </p>

                      <div className="mt-3 pt-2.5 border-t border-[#393939] flex items-center justify-between text-[10px] font-mono text-[#8d8d8d]">
                        <span>{src.rawRecordCount.toLocaleString()} raw rows</span>
                        <span className="text-[#33b1ff] group-hover:underline flex items-center gap-1">
                          {isAr ? 'عرض الحقول' : 'Inspect'} <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SVG Connector Stage 1 -> 2 */}
            <div className="hidden lg:flex flex-col items-center justify-center pt-24 text-[#525252]">
              <ArrowRight className="w-5 h-5 text-[#0f62fe] animate-pulse" />
              <span className="text-[9px] font-mono text-[#8d8d8d] mt-1 uppercase">CDC / Stream</span>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* STAGE 2: PROCESSING & TRANSFORMATIONS */}
            {/* ------------------------------------------------------------- */}
            <div className="flex-1 space-y-3 min-w-[260px]">
              <div className="flex items-center justify-between pb-2 border-b border-[#393939]">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 bg-[#f1c21b] rounded-none" />
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#f4f4f4]">
                    2. {isAr ? 'المعالجة والتحويلات' : 'ETL & Transformations'}
                  </span>
                </div>
                <span className="text-[10px] font-mono bg-[#262626] text-[#f1c21b] px-2 py-0.5 border border-[#393939]">
                  {filteredTransforms.length} {isAr ? 'خطوات' : 'Steps'}
                </span>
              </div>

              <div className="space-y-2.5">
                {filteredTransforms.map(tx => {
                  const isSelected = selectedNode?.id === tx.id;
                  return (
                    <div
                      key={tx.id}
                      onClick={() =>
                        setSelectedNode({ id: tx.id, type: 'transform', data: tx })
                      }
                      className={`bg-[#262626] border p-3 transition-all cursor-pointer relative group ${
                        isSelected
                          ? 'border-[#f1c21b] ring-1 ring-[#f1c21b] shadow-lg'
                          : 'border-[#393939] hover:border-[#525252]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 bg-[#161616] text-[#f1c21b] border border-[#393939] text-[10px] font-mono font-bold flex items-center justify-center">
                            0{tx.stepNumber}
                          </span>
                          <h4 className="text-xs font-bold text-[#f4f4f4] group-hover:text-[#f1c21b] transition-colors truncate max-w-[170px]">
                            {isAr ? tx.nameAr : tx.name}
                          </h4>
                        </div>
                        <span className="text-[9px] font-mono px-1.5 py-0.2 bg-[#161616] text-[#42be65] border border-[#24a148]">
                          {tx.executionTimeMs}ms
                        </span>
                      </div>

                      <p className="text-[11px] text-[#c6c6c6] mt-1.5 line-clamp-2 leading-relaxed">
                        {isAr ? tx.detailsAr : tx.details}
                      </p>

                      <div className="mt-2 flex flex-wrap gap-1">
                        {tx.rulesApplied.slice(0, 2).map((rule, rIdx) => (
                          <span
                            key={rIdx}
                            className="text-[9px] font-mono bg-[#1f1f1f] text-[#8d8d8d] px-1.5 py-0.5 border border-[#393939] truncate max-w-[200px]"
                          >
                            ✓ {rule}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SVG Connector Stage 2 -> 3 */}
            <div className="hidden lg:flex flex-col items-center justify-center pt-24 text-[#525252]">
              <ArrowRight className="w-5 h-5 text-[#0f62fe] animate-pulse" />
              <span className="text-[9px] font-mono text-[#8d8d8d] mt-1 uppercase">Validated</span>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* STAGE 3: ACTIVE DATASET (CORE NODE) */}
            {/* ------------------------------------------------------------- */}
            <div className="flex-1 space-y-3 min-w-[250px]">
              <div className="flex items-center justify-between pb-2 border-b border-[#393939]">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 bg-[#0f62fe] rounded-none" />
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#f4f4f4]">
                    3. {isAr ? 'مجموعة البيانات المختارة' : 'Active Dataset (Core)'}
                  </span>
                </div>
                <span className="text-[10px] font-mono bg-[#0f62fe] text-white px-2 py-0.5">
                  CORE NODE
                </span>
              </div>

              {/* Central Core Card */}
              <div
                onClick={() =>
                  setSelectedNode({ id: dataset.id, type: 'dataset', data: dataset })
                }
                className={`bg-[#1f2937] border-2 p-4 transition-all cursor-pointer relative shadow-xl ${
                  selectedNode?.id === dataset.id
                    ? 'border-[#0f62fe] ring-2 ring-[#0f62fe]/50'
                    : 'border-[#0f62fe] hover:border-[#33b1ff]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 bg-[#0f62fe] text-white flex items-center justify-center font-bold">
                      <Database className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white truncate max-w-[160px]">
                        {dataset.name}
                      </h4>
                      <span className="text-[10px] font-mono text-[#33b1ff] uppercase">
                        {dataset.format.toUpperCase()} • Schema v{dataset.version}
                      </span>
                    </div>
                  </div>

                  <span className="bg-[#24a148] text-white text-[10px] font-mono font-bold px-2 py-0.5">
                    READY
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/10 text-xs font-mono">
                  <div className="bg-[#161616]/60 p-2 border border-white/10">
                    <span className="text-[10px] text-[#8d8d8d] block">{isAr ? 'عدد السجلات' : 'Row Count'}</span>
                    <span className="text-white font-bold">{dataset.rowCount.toLocaleString()}</span>
                  </div>
                  <div className="bg-[#161616]/60 p-2 border border-white/10">
                    <span className="text-[10px] text-[#8d8d8d] block">{isAr ? 'عدد الحقول' : 'Attributes'}</span>
                    <span className="text-white font-bold">{dataset.columns.length} cols</span>
                  </div>
                  <div className="bg-[#161616]/60 p-2 border border-white/10">
                    <span className="text-[10px] text-[#8d8d8d] block">{isAr ? 'مؤشر الجودة' : 'Quality Health'}</span>
                    <span className="text-[#42be65] font-bold">
                      {dataset.profile?.quality.overallScore || 95}%
                    </span>
                  </div>
                  <div className="bg-[#161616]/60 p-2 border border-white/10">
                    <span className="text-[10px] text-[#8d8d8d] block">{isAr ? 'الحجم التخزيني' : 'In-Memory Size'}</span>
                    <span className="text-[#33b1ff] font-bold">
                      {(dataset.sizeBytes / 1024).toFixed(1)} KB
                    </span>
                  </div>
                </div>

                {/* Quick Column preview */}
                <div className="mt-3 space-y-1">
                  <div className="text-[10px] font-mono text-[#8d8d8d] uppercase">
                    {isAr ? 'أهم الحقول المعرّفة:' : 'Indexed Schema Fields:'}
                  </div>
                  <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                    {dataset.columns.slice(0, 8).map(c => (
                      <button
                        key={c.name}
                        onClick={e => {
                          e.stopPropagation();
                          setSelectedColumn(c.name);
                          setActiveTabMode('columns');
                        }}
                        className="text-[9px] font-mono px-1.5 py-0.5 bg-[#161616] hover:bg-[#33b1ff] text-[#c6c6c6] hover:text-white border border-white/10 transition-colors"
                        title={isAr ? 'تتبع مسار هذا الحقل' : 'Trace this column'}
                      >
                        {c.name} ({c.type.substring(0, 3)})
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* SVG Connector Stage 3 -> 4 */}
            <div className="hidden lg:flex flex-col items-center justify-center pt-24 text-[#525252]">
              <ArrowRight className="w-5 h-5 text-[#0f62fe] animate-pulse" />
              <span className="text-[9px] font-mono text-[#8d8d8d] mt-1 uppercase">Consumes</span>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* STAGE 4: DESTINATIONS & CONSUMERS */}
            {/* ------------------------------------------------------------- */}
            <div className="flex-1 space-y-3 min-w-[260px]">
              <div className="flex items-center justify-between pb-2 border-b border-[#393939]">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 bg-[#42be65] rounded-none" />
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#f4f4f4]">
                    4. {isAr ? 'الوجهات والمستهلكون' : 'Destinations & Consumers'}
                  </span>
                </div>
                <span className="text-[10px] font-mono bg-[#262626] text-[#42be65] px-2 py-0.5 border border-[#393939]">
                  {filteredDestinations.length} {isAr ? 'وجهات' : 'Consumers'}
                </span>
              </div>

              <div className="space-y-2.5">
                {filteredDestinations.map(dst => {
                  const isSelected = selectedNode?.id === dst.id;
                  return (
                    <div
                      key={dst.id}
                      onClick={() =>
                        setSelectedNode({ id: dst.id, type: 'destination', data: dst })
                      }
                      className={`bg-[#262626] border p-3 transition-all cursor-pointer relative group ${
                        isSelected
                          ? 'border-[#42be65] ring-1 ring-[#42be65] shadow-lg'
                          : 'border-[#393939] hover:border-[#525252]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 bg-[#161616] border border-[#393939] flex items-center justify-center shrink-0">
                            {dst.category === 'Dashboard' ? (
                              <LayoutDashboard className="w-3 h-3 text-[#33b1ff]" />
                            ) : dst.category === 'AI Report' ? (
                              <FileText className="w-3 h-3 text-[#f1c21b]" />
                            ) : dst.category === 'SQL Sandbox' ? (
                              <Terminal className="w-3 h-3 text-[#08bdba]" />
                            ) : (
                              <Download className="w-3 h-3 text-[#42be65]" />
                            )}
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-[#f4f4f4] group-hover:text-[#42be65] transition-colors truncate max-w-[170px]">
                              {isAr ? dst.nameAr : dst.name}
                            </h4>
                            <span className="text-[10px] font-mono text-[#8d8d8d] uppercase">
                              {dst.category}
                            </span>
                          </div>
                        </div>

                        <span className="text-[9px] font-mono px-1.5 py-0.2 bg-[#161616] text-[#33b1ff] border border-[#393939]">
                          {dst.status}
                        </span>
                      </div>

                      <p className="text-[11px] text-[#c6c6c6] mt-1.5 line-clamp-2 leading-relaxed">
                        {isAr ? dst.descriptionAr : dst.description}
                      </p>

                      {/* Jump button if target exists */}
                      <div className="mt-2.5 pt-2 border-t border-[#393939] flex items-center justify-between text-[10px] font-mono">
                        <span className="text-[#8d8d8d]">
                          {dst.consumerCount ? `${dst.consumerCount} consumers` : 'Auto-Sync'}
                        </span>

                        {dst.category === 'Dashboard' && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setActiveTab('dashboards');
                              if (dst.targetEntityId) setActiveDashboardId(dst.targetEntityId);
                            }}
                            className="text-[#33b1ff] hover:underline flex items-center gap-1"
                          >
                            <span>{isAr ? 'فتح اللوحة' : 'Open Dashboard'}</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        )}

                        {dst.category === 'AI Report' && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setActiveTab('reports');
                            }}
                            className="text-[#f1c21b] hover:underline flex items-center gap-1"
                          >
                            <span>{isAr ? 'فتح التقارير' : 'View Report'}</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        )}

                        {dst.category === 'SQL Sandbox' && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setActiveTab('nl2sql');
                            }}
                            className="text-[#08bdba] hover:underline flex items-center gap-1"
                          >
                            <span>{isAr ? 'فتح NL2SQL' : 'Open NL2SQL'}</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: COLUMN-LEVEL LINEAGE TRACING */}
      {activeTab === 'columns' && (
        <div className="bg-[#161616] border border-[#393939] p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#393939] pb-4">
            <div>
              <h3 className="text-sm font-bold text-[#f4f4f4] flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#f1c21b]" />
                <span>{isAr ? 'تتبع مسار الحقول والأعمدة الفردية (Fine-Grained Column Provenance)' : 'Fine-Grained Column Provenance Tracing'}</span>
              </h3>
              <p className="text-xs text-[#8d8d8d] mt-0.5">
                {isAr
                  ? 'اختر أي عمود لتتبع مصدره الأصلي، التحويلات المطبقة عليه، وكافة الرسوم البيانية ومؤشرات الأداء التي تستهلكه.'
                  : 'Select any attribute to trace its upstream source origin, applied ETL transformations, and downstream dashboard metrics.'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-mono text-[#8d8d8d]">{isAr ? 'الحقل المحدد:' : 'Target Column:'}</label>
              <select
                value={selectedColumn}
                onChange={e => setSelectedColumn(e.target.value)}
                className="bg-[#262626] border border-[#525252] text-xs font-mono text-[#f4f4f4] px-3 py-1.5 outline-hidden cursor-pointer"
              >
                {dataset.columns.map(c => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Ribbon Visual Flow for Selected Column */}
          {activeColumnTrace && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Origin Column */}
                <div className="bg-[#262626] border border-[#33b1ff] p-4 space-y-3 relative">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#33b1ff] font-bold uppercase">1. Upstream Source</span>
                    <span className="text-[10px] bg-[#161616] text-[#8d8d8d] px-1.5 py-0.5">
                      {activeColumnTrace.sourceType}
                    </span>
                  </div>
                  <div className="text-base font-mono font-bold text-white">
                    {activeColumnTrace.sourceColumn}
                  </div>
                  <p className="text-xs text-[#c6c6c6]">
                    {isAr
                      ? `حقل أصلي مستخرج من ${manifest.sources[0]?.name || 'المستودع الرئيسي'}.`
                      : `Native attribute ingested from ${manifest.sources[0]?.name || 'Primary Source'}.`}
                  </p>
                </div>

                {/* 2. Transformations Applied */}
                <div className="bg-[#262626] border border-[#f1c21b] p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#f1c21b] font-bold uppercase">2. Transformations</span>
                    <span className="text-[10px] bg-[#161616] text-[#8d8d8d] px-1.5 py-0.5">
                      {activeColumnTrace.transformations.length} Rules
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {activeColumnTrace.transformations.map((t, idx) => (
                      <div
                        key={idx}
                        className="text-xs font-mono bg-[#161616] p-2 border border-[#393939] text-[#f4f4f4] flex items-center gap-2"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#42be65] shrink-0" />
                        <span>{isAr ? activeColumnTrace.transformationsAr[idx] || t : t}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 3. Downstream Consumers */}
                <div className="bg-[#262626] border border-[#42be65] p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#42be65] font-bold uppercase">3. Downstream Consumers</span>
                    <span className="text-[10px] bg-[#161616] text-[#8d8d8d] px-1.5 py-0.5">
                      {activeColumnTrace.downstreamUses.length} Usage(s)
                    </span>
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {activeColumnTrace.downstreamUses.map((u, idx) => (
                      <div
                        key={idx}
                        className="text-xs font-mono bg-[#161616] p-2 border border-[#393939] text-[#f4f4f4] space-y-0.5"
                      >
                        <div className="font-bold text-[#33b1ff]">
                          {isAr ? u.targetNameAr : u.targetName}
                        </div>
                        <div className="text-[10px] text-[#8d8d8d]">
                          Role: <span className="text-[#42be65]">{u.role}</span> ({u.type})
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Complete Columns Tracing Table */}
              <div className="border border-[#393939] overflow-x-auto">
                <table className="w-full text-start text-xs font-sans">
                  <thead className="bg-[#1f1f1f] text-[#c6c6c6] font-mono text-[11px] uppercase border-b border-[#393939]">
                    <tr>
                      <th className="px-4 py-3 text-start">{isAr ? 'اسم العمود' : 'Column Name'}</th>
                      <th className="px-4 py-3 text-start">{isAr ? 'النوع' : 'Data Type'}</th>
                      <th className="px-4 py-3 text-start">{isAr ? 'التحويلات المطبقة' : 'Transformations'}</th>
                      <th className="px-4 py-3 text-start">{isAr ? 'المستهلكون في اللوحات' : 'Downstream Consumers'}</th>
                      <th className="px-4 py-3 text-end">{isAr ? 'إجراء' : 'Action'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#393939] font-mono text-xs">
                    {manifest.columnTraces.map(trace => {
                      const isSel = trace.columnName === selectedColumn;
                      return (
                        <tr
                          key={trace.columnName}
                          onClick={() => setSelectedColumn(trace.columnName)}
                          className={`cursor-pointer transition-colors ${
                            isSel ? 'bg-[#2a2a2a] border-s-4 border-s-[#0f62fe]' : 'hover:bg-[#222222]'
                          }`}
                        >
                          <td className="px-4 py-3 font-bold text-white">
                            {trace.columnName}
                          </td>
                          <td className="px-4 py-3 text-[#33b1ff]">
                            {trace.sourceType}
                          </td>
                          <td className="px-4 py-3 text-[#c6c6c6]">
                            {trace.transformations.join(', ')}
                          </td>
                          <td className="px-4 py-3 text-[#42be65]">
                            {trace.downstreamUses.map(u => u.targetName.split(':')[1] || u.targetName).join(' • ')}
                          </td>
                          <td className="px-4 py-3 text-end">
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                setSelectedColumn(trace.columnName);
                              }}
                              className="px-2 py-1 bg-[#393939] hover:bg-[#0f62fe] text-white text-[11px] transition-colors"
                            >
                              {isAr ? 'تفصيل' : 'Trace'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: IMPACT ANALYSIS & SCHEMA SIMULATION */}
      {activeTab === 'impact' && (
        <div className="bg-[#161616] border border-[#393939] p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#393939] pb-4">
            <div>
              <h3 className="text-sm font-bold text-[#f4f4f4] flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#da1e28]" />
                <span>{isAr ? 'محاكاة الأثر والمخاطر للتغييرات في المخطط (Schema Change Impact Simulation)' : 'Schema Change Impact Simulation'}</span>
              </h3>
              <p className="text-xs text-[#8d8d8d] mt-0.5">
                {isAr
                  ? 'اختبر ما سيحدث للوحات التحكم والتقارير واستعلامات SQL في حال حذف أو إعادة تسمية أو تعديل نوع أي حقل.'
                  : 'Simulate downstream blast radius before modifying, dropping, or altering schema attributes.'}
              </p>
            </div>
          </div>

          {/* Simulation Playground Controls */}
          <div className="bg-[#262626] border border-[#393939] p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-mono text-[#c6c6c6] mb-1.5">
                {isAr ? '1. اختر الحقل المراد تعديله:' : '1. Select Target Attribute:'}
              </label>
              <select
                value={selectedSimColumn}
                onChange={e => setSelectedSimColumn(e.target.value)}
                className="w-full bg-[#161616] border border-[#525252] text-xs font-mono text-[#f4f4f4] px-3 py-2 outline-hidden"
              >
                {dataset.columns.map(c => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono text-[#c6c6c6] mb-1.5">
                {isAr ? '2. نوع الإجراء التجريبي:' : '2. Simulated Schema Mutation:'}
              </label>
              <select
                value={simAction}
                onChange={e => setSimAction(e.target.value as any)}
                className="w-full bg-[#161616] border border-[#525252] text-xs font-mono text-[#f4f4f4] px-3 py-2 outline-hidden"
              >
                <option value="delete">{isAr ? 'حذف العمود (DROP COLUMN)' : 'DROP COLUMN (Delete)'}</option>
                <option value="rename">{isAr ? 'إعادة تسمية العمود (RENAME COLUMN)' : 'RENAME COLUMN'}</option>
                <option value="type_change">{isAr ? 'تغيير نوع البيانات (ALTER TYPE)' : 'ALTER TYPE (Cast mismatch)'}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono text-[#c6c6c6] mb-1.5">
                {isAr ? '3. مستوى الخطورة المتوقع:' : '3. Computed Blast Radius:'}
              </label>
              <div className={`px-4 py-2 border font-mono font-bold text-xs flex items-center justify-between ${
                impactAnalysis.riskLevel === 'HIGH'
                  ? 'bg-[#da1e28]/20 border-[#da1e28] text-[#ff8389]'
                  : impactAnalysis.riskLevel === 'MEDIUM'
                  ? 'bg-[#f1c21b]/20 border-[#f1c21b] text-[#f1c21b]'
                  : 'bg-[#24a148]/20 border-[#24a148] text-[#42be65]'
              }`}>
                <span>{impactAnalysis.riskLevel} RISK</span>
                <span>{impactAnalysis.affectedWidgets.length} Affected Visuals</span>
              </div>
            </div>
          </div>

          {/* Simulation Output Report */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Impact Summary */}
            <div className="bg-[#262626] border border-[#393939] p-4 space-y-3">
              <h4 className="text-xs font-mono font-bold uppercase text-[#f4f4f4] flex items-center gap-2">
                <Info className="w-4 h-4 text-[#33b1ff]" />
                <span>{isAr ? 'تقرير الأثر المباشر' : 'Downstream Dependency Impact'}</span>
              </h4>

              <div className="space-y-2 text-xs font-mono">
                <div className="bg-[#161616] p-3 border border-[#393939] flex items-center justify-between">
                  <span className="text-[#8d8d8d]">{isAr ? 'عناصر لوحة التحكم المتأثرة:' : 'Affected Dashboard Widgets:'}</span>
                  <span className="font-bold text-[#ff8389]">{impactAnalysis.affectedWidgets.length} widgets</span>
                </div>
                <div className="bg-[#161616] p-3 border border-[#393939] flex items-center justify-between">
                  <span className="text-[#8d8d8d]">{isAr ? 'استعلامات SQL المهددة بالتوقف:' : 'Potentially Broken SQL Queries:'}</span>
                  <span className="font-bold text-[#f1c21b]">{impactAnalysis.breakingQueriesCount} queries</span>
                </div>
                <div className="bg-[#161616] p-3 border border-[#393939] flex items-center justify-between">
                  <span className="text-[#8d8d8d]">{isAr ? 'التقارير التنفيذية المرتبطة:' : 'Bound Executive Stories:'}</span>
                  <span className="font-bold text-[#33b1ff]">{impactAnalysis.affectedReportsCount} reports</span>
                </div>
              </div>

              <div className="pt-2 border-t border-[#393939] text-xs text-[#c6c6c6] leading-relaxed">
                <p>
                  {impactAnalysis.riskLevel === 'HIGH'
                    ? (isAr
                        ? `تحذير: الحقل "${selectedSimColumn}" مستخدم كركيزة أساسية في مؤشرات الأداء والرسوم البيانية. حذفه أو تغييره سيؤدي إلى تعطيل العرض المباشر في لوحات القيادة.`
                        : `CRITICAL WARNING: Attribute "${selectedSimColumn}" is actively bound to core visual KPIs. Modifying it without aliasing will cause runtime failures on active dashboards.`)
                    : (isAr
                        ? `يمكن تطبيق التعديل بأمان نسبي مع تحديث الفهارس الدلالية لـ NL2SQL.`
                        : `Safe to proceed with automated index invalidation and migration.`)}
                </p>
              </div>
            </div>

            {/* List of Affected Components */}
            <div className="bg-[#262626] border border-[#393939] p-4 space-y-3">
              <h4 className="text-xs font-mono font-bold uppercase text-[#f4f4f4] flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4 text-[#42be65]" />
                <span>{isAr ? 'قائمة العناصر المتأثرة تفصيلياً' : 'Affected Target Components'}</span>
              </h4>

              {impactAnalysis.affectedWidgets.length > 0 ? (
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {impactAnalysis.affectedWidgets.map((w, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-[#161616] border border-[#da1e28]/50 text-xs font-mono space-y-1"
                    >
                      <div className="flex items-center justify-between text-white font-bold">
                        <span>{w.widgetTitle}</span>
                        <span className="text-[10px] text-[#ff8389] uppercase">Will Break</span>
                      </div>
                      <div className="text-[11px] text-[#8d8d8d]">
                        In {w.dashTitle} • Role: <span className="text-[#33b1ff]">{w.role}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center text-xs font-mono text-[#8d8d8d] bg-[#161616] border border-[#393939]">
                  <CheckCircle2 className="w-8 h-8 text-[#42be65] mx-auto mb-2" />
                  <p>{isAr ? 'لا توجد عناصر لوحة تحكم مرتبطة مباشرة بهذا العمود.' : 'No dashboard widgets directly bound to this column.'}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Node Details Inspector Drawer (Opens when any node in DAG is clicked) */}
      {selectedNode && (
        <div className="fixed inset-y-0 end-0 w-full sm:w-96 bg-[#262626] border-s border-[#393939] shadow-2xl z-50 p-5 overflow-y-auto space-y-5 animate-in slide-in-from-right duration-200">
          <div className="flex items-center justify-between border-b border-[#393939] pb-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#0f62fe]">
                NODE INSPECTOR
              </span>
              <span className="text-[10px] font-mono bg-[#161616] text-[#c6c6c6] px-1.5 py-0.5 uppercase">
                {selectedNode.type}
              </span>
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-[#8d8d8d] hover:text-white text-lg font-mono p-1"
            >
              ✕
            </button>
          </div>

          <div>
            <h3 className="text-base font-bold text-white">
              {isAr ? selectedNode.data.nameAr || selectedNode.data.name : selectedNode.data.name}
            </h3>
            <p className="text-xs text-[#8d8d8d] mt-0.5 font-mono">
              ID: {selectedNode.id}
            </p>
          </div>

          <div className="space-y-3 text-xs font-mono">
            {selectedNode.type === 'source' && (
              <>
                <div className="bg-[#161616] p-3 border border-[#393939] space-y-1">
                  <div className="text-[10px] text-[#8d8d8d] uppercase">Source System & Host</div>
                  <div className="text-white font-semibold">{selectedNode.data.sourceSystem}</div>
                  <div className="text-[#33b1ff] text-[11px]">{selectedNode.data.sourceHost}</div>
                </div>

                <div className="bg-[#161616] p-3 border border-[#393939] space-y-1">
                  <div className="text-[10px] text-[#8d8d8d] uppercase">Ingestion Protocol</div>
                  <div className="text-white font-semibold">{selectedNode.data.ingestionMode} • {selectedNode.data.connectionStatus}</div>
                  <div className="text-[#8d8d8d] text-[11px]">Extracted: {new Date(selectedNode.data.extractedAt).toLocaleString()}</div>
                </div>
              </>
            )}

            {selectedNode.type === 'transform' && (
              <>
                <div className="bg-[#161616] p-3 border border-[#393939] space-y-1">
                  <div className="text-[10px] text-[#8d8d8d] uppercase">ETL Engine & Timing</div>
                  <div className="text-[#f1c21b] font-semibold">{selectedNode.data.engine} • {selectedNode.data.executionTimeMs}ms</div>
                  <div className="text-[#8d8d8d] text-[11px]">Rows In: {selectedNode.data.rowsIn} ➔ Rows Out: {selectedNode.data.rowsOut}</div>
                </div>

                <div className="bg-[#161616] p-3 border border-[#393939] space-y-1">
                  <div className="text-[10px] text-[#8d8d8d] uppercase">Rules Applied</div>
                  <div className="space-y-1 pt-1">
                    {selectedNode.data.rulesApplied.map((r: string, idx: number) => (
                      <div key={idx} className="text-[#42be65] text-[11px]">
                        ✓ {r}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {selectedNode.type === 'destination' && (
              <>
                <div className="bg-[#161616] p-3 border border-[#393939] space-y-1">
                  <div className="text-[10px] text-[#8d8d8d] uppercase">Consumer Category</div>
                  <div className="text-[#42be65] font-semibold">{selectedNode.data.category} • {selectedNode.data.status}</div>
                  <div className="text-[#8d8d8d] text-[11px]">Last Sync: {new Date(selectedNode.data.lastRefreshedAt).toLocaleString()}</div>
                </div>
              </>
            )}
          </div>

          <div className="pt-3 border-t border-[#393939]">
            <button
              onClick={() => setSelectedNode(null)}
              className="w-full py-2 bg-[#393939] hover:bg-[#4c4c4c] text-white text-xs font-mono uppercase font-bold transition-colors"
            >
              {isAr ? 'إغلاق المعاين' : 'Close Inspector'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
