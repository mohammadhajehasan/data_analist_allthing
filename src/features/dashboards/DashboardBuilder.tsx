import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence } from 'motion/react';
import { useApp } from '../../context/AppContext';
import { WidgetConfig, WidgetType, AggregationFunction, Dataset } from '../../types';
import {
  ChartFactory,
  KpiCard,
  AGGREGATION_OPTIONS,
  computeMathematicalAggregation,
  getAggregationLabel,
  guessGeoLocationColumn,
} from '../../components/charts/ChartFactory';
import {
  exportDashboardAsPng,
  exportDashboardAsPdf,
  exportSingleWidgetAsPng,
  exportSingleWidgetAsPdf,
  ExportProgressState,
} from '../../utils/dashboardExport';
import { DashboardLayoutModal } from '../../components/dashboards/DashboardLayoutModal';
import { LocalCsvImportModal } from '../../components/datasets/LocalCsvImportModal';
import { ExportModal } from '../../components/common/ExportModal';
import { VISUALIZATION_THEMES } from '../../utils/visualizationThemes';
import { AiAgentPanel } from './AiAgentPanel';
import { ForecastingPanel } from './ForecastingPanel';
import { AudioBriefingPanel } from './AudioBriefingPanel';
import { SlidesExportPanel } from './SlidesExportPanel';
import { DataCinemaMode } from '../../components/dashboards/DataCinemaMode';
import { ShareToGroupModal } from '../../components/discussions/ShareToGroupModal';
import { captureElementToCanvas } from '../../utils/dashboardExport';
import { FileUp, FileJson, Trash2 as TrashIcon } from 'lucide-react';
import { parseGeoJsonSource } from '../../utils/geoJson';
import { ALL_COUNTRIES } from '../../data/allCountries';
import {
  LayoutDashboard,
  Plus,
  Trash2,
  RefreshCw,
  Edit3,
  BarChart3,
  PieChart as PieIcon,
  LineChart as LineIcon,
  AreaChart as AreaIcon,
  ScatterChart as ScatterIcon,
  Activity,
  Sliders,
  Check,
  Database,
  Calculator,
  Sigma,
  TrendingUp,
  Filter,
  Eye,
  Loader2,
  Sparkles,
  Percent,
  Layers,
  HelpCircle,
  Download,
  FileImage,
  FileText,
  ChevronDown,
  LayoutGrid,
  Camera,
  CheckCircle2,
  Clapperboard,
  X,
  FileSpreadsheet,
  ShieldCheck,
  Presentation,
  Volume2,
  AlertTriangle,
  Palette,
  MessageSquare,
  Globe2,
  Vibrate,
} from 'lucide-react';

/** Full world country list for the drill-down (single-country) map scope — bilingual labels */
const GEO_COUNTRY_CODES = ALL_COUNTRIES;

export const DashboardBuilder: React.FC = () => {
  const {
    activeDashboard,
    dashboards,
    datasets,
    activeDataset,
    setActiveDashboardId,
    createDashboard,
    deleteDashboard,
    addWidgetToDashboard,
    updateWidgetInDashboard,
    deleteWidgetFromDashboard,
    layoutSettings,
    toast,
    language,
    t,
  } = useApp();

  const isAr = language === 'ar';

  // Refs
  const dashboardContainerRef = useRef<HTMLDivElement>(null);

  // Modal & Layout State
  const [showModal, setShowModal] = useState(false);
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);
  const [showLayoutModal, setShowLayoutModal] = useState(false);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [activeWidgetExportMenuId, setActiveWidgetExportMenuId] = useState<string | null>(null);

  // Dashboard creation & switching state (زر "لوحة جديدة" وقائمة التبديل بين اللوحات)
  const [showDashSwitcher, setShowDashSwitcher] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newDashName, setNewDashName] = useState('');
  const [newDashDesc, setNewDashDesc] = useState('');

  // Export Progress State
  const [exportProgress, setExportProgress] = useState<ExportProgressState | null>(null);
  const [showCentralizedExportModal, setShowCentralizedExportModal] = useState(false);
  const [showCinemaMode, setShowCinemaMode] = useState(false);

  // Visualization Theme Selection State
  const [selectedTheme, setSelectedTheme] = useState<string>('professional');

  // Advanced Tools Sub-Tabs State
  const [advancedToolTab, setAdvancedToolTab] = useState<'agent' | 'forecast' | 'audio' | 'slides'>('forecast');

  // Form Fields
  const [widgetTitle, setWidgetTitle] = useState('');
  const [widgetTitleAr, setWidgetTitleAr] = useState('');
  const [widgetType, setWidgetType] = useState<WidgetType>('bar');
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [widgetXAxis, setWidgetXAxis] = useState('');
  const [widgetYAxis, setWidgetYAxis] = useState('');
  const [widgetAggregation, setWidgetAggregation] = useState<AggregationFunction>('sum');
  // Geo/map widget state (folium-style: choropleth regions or lat/lng markers)
  const [geoMode, setGeoMode] = useState<'choropleth' | 'markers'>('choropleth');
  const [mapScope, setMapScope] = useState<'world' | 'middleEast' | 'europe' | 'africa' | 'asia' | 'americas' | 'country'>('world');
  const [focusCountry, setFocusCountry] = useState('');
  const [geoLocationColumn, setGeoLocationColumn] = useState('');
  // Uploaded GeoJSON boundaries for sub-region drawing (governorates/cities)
  const [geoJsonName, setGeoJsonName] = useState('');
  const [geoJsonData, setGeoJsonData] = useState('');
  const [geoJsonFeatureProperty, setGeoJsonFeatureProperty] = useState('');
  const [geoJsonPropertyOptions, setGeoJsonPropertyOptions] = useState<string[]>([]);

  // Loading States
  const [isCalculatingAgg, setIsCalculatingAgg] = useState(false);
  const [calculatingWidgetId, setCalculatingWidgetId] = useState<string | null>(null);
  const [calculationTimeMs, setCalculationTimeMs] = useState<number>(12);

  // KPI Specific State
  const [kpiMode, setKpiMode] = useState<'auto' | 'manual'>('auto');
  const [kpiMetricColumn, setKpiMetricColumn] = useState('');
  const [kpiMetricAgg, setKpiMetricAgg] = useState<AggregationFunction>('sum');
  const [kpiPrefix, setKpiPrefix] = useState('$');
  const [kpiSuffix, setKpiSuffix] = useState('');
  const [kpiManualValue, setKpiManualValue] = useState('');
  const [kpiLabel, setKpiLabel] = useState('');
  const [kpiTrendPercent, setKpiTrendPercent] = useState<number>(12.5);
  const [kpiTrendDirection, setKpiTrendDirection] = useState<'up' | 'down' | 'neutral'>('up');

  // Auto-refresh animation state
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Target dataset for widget configuration
  const currentTargetDataset = useMemo(() => {
    return datasets.find(d => d.id === selectedDatasetId) || activeDataset || datasets[0];
  }, [datasets, selectedDatasetId, activeDataset]);

  // Preselect the likely location column when opening the geo widget or changing dataset
  useEffect(() => {
    if (widgetType === 'geo' && currentTargetDataset?.columns?.length) {
      const guess = guessGeoLocationColumn(currentTargetDataset.columns);
      setGeoLocationColumn(prev => (prev && prev !== '' ? prev : (guess || '')));
    }
  }, [widgetType, currentTargetDataset]);

  // Initial column selection when dataset changes
  useEffect(() => {
    if (currentTargetDataset?.columns?.length) {
      if (!widgetXAxis || !currentTargetDataset.columns.some(c => c.name === widgetXAxis)) {
        const catCol = currentTargetDataset.columns.find(c => c.type === 'string' || c.type === 'date') || currentTargetDataset.columns[0];
        setWidgetXAxis(catCol.name);
      }
      if (!widgetYAxis || !currentTargetDataset.columns.some(c => c.name === widgetYAxis)) {
        const numCol = currentTargetDataset.columns.find(c => c.type === 'float' || c.type === 'integer') || currentTargetDataset.columns[0];
        setWidgetYAxis(numCol.name);
      }
      if (!kpiMetricColumn) {
        const numCol = currentTargetDataset.columns.find(c => c.type === 'float' || c.type === 'integer') || currentTargetDataset.columns[0];
        setKpiMetricColumn(numCol.name);
      }
    }
  }, [currentTargetDataset]);

  // Trigger calculation loading animation whenever mathematical aggregation or axes change in modal
  const handleAggregationChange = (newAgg: AggregationFunction) => {
    setIsCalculatingAgg(true);
    setWidgetAggregation(newAgg);
    const start = performance.now();
    setTimeout(() => {
      setCalculationTimeMs(Math.max(8, Math.round(performance.now() - start + Math.random() * 20)));
      setIsCalculatingAgg(false);
    }, 280);
  };

  const handleAxisChange = (type: 'x' | 'y', val: string) => {
    setIsCalculatingAgg(true);
    if (type === 'x') setWidgetXAxis(val);
    else setWidgetYAxis(val);
    const start = performance.now();
    setTimeout(() => {
      setCalculationTimeMs(Math.max(8, Math.round(performance.now() - start + Math.random() * 20)));
      setIsCalculatingAgg(false);
    }, 250);
  };

  // Reset or initialize form for creating new widget
  const handleOpenAddModal = () => {
    setEditingWidgetId(null);
    setWidgetTitle('');
    setWidgetTitleAr('');
    setWidgetType('bar');
    setSelectedDatasetId(activeDataset?.id || datasets[0]?.id || '');
    setWidgetAggregation('sum');
    setIsCalculatingAgg(false);
    // Reset geo form state so stale values from a previous edit don't leak into the new widget
    setGeoMode('choropleth');
    setMapScope('world');
    setFocusCountry('');
    setGeoLocationColumn('');
    setGeoJsonName('');
    setGeoJsonData('');
    setGeoJsonFeatureProperty('');
    setGeoJsonPropertyOptions([]);

    if (activeDataset?.columns?.length) {
      const catCol = activeDataset.columns.find(c => c.type === 'string' || c.type === 'date') || activeDataset.columns[0];
      const numCol = activeDataset.columns.find(c => c.type === 'float' || c.type === 'integer') || activeDataset.columns[0];
      setWidgetXAxis(catCol.name);
      setWidgetYAxis(numCol.name);
      setKpiMetricColumn(numCol.name);
    }
    setKpiMode('auto');
    setKpiMetricAgg('sum');
    setKpiPrefix('$');
    setKpiSuffix('');
    setKpiManualValue('');
    setKpiLabel('');
    setShowModal(true);
  };

  // Open modal prefilled with existing widget settings for editing
  const handleOpenEditModal = (w: WidgetConfig) => {
    setEditingWidgetId(w.id);
    setWidgetTitle(w.title);
    setWidgetTitleAr(w.titleAr || w.title);
    setWidgetType(w.type);
    setSelectedDatasetId(w.datasetId || activeDataset?.id || '');
    setWidgetXAxis(w.xAxis || w.categoryField || '');
    setGeoMode(w.geoMode || 'choropleth');
    setMapScope(w.mapScope || 'world');
    setFocusCountry(w.focusCountry || '');
    setGeoJsonName(w.geoJson?.name || '');
    setGeoJsonData(w.geoJson?.data || '');
    setGeoJsonFeatureProperty(w.geoJson?.featureProperty || '');
    const parsedGj = w.geoJson ? parseGeoJsonSource(w.geoJson) : null;
    setGeoJsonPropertyOptions(parsedGj?.candidateProperties || []);
    setWidgetYAxis(w.yAxis || '');
    setWidgetAggregation(w.aggregation || 'sum');
    setIsCalculatingAgg(false);

    if (w.type === 'kpi' && w.kpiMetric) {
      setKpiMode('manual');
      setKpiManualValue(String(w.kpiMetric.value));
      setKpiLabel(w.kpiMetric.label);
      setKpiTrendPercent(w.kpiMetric.trendPercentage ?? 0);
      setKpiTrendDirection(w.kpiMetric.trendDirection ?? 'up');
    }
    setShowModal(true);
  };

  // Save Widget (Add or Update)
  const handleSaveWidget = () => {
    if (!activeDashboard || !currentTargetDataset) return;

    let kpiMetric = undefined;
    if (widgetType === 'kpi') {
      if (kpiMode === 'auto') {
        const rawValues = (currentTargetDataset.data || []).map(r => {
          const val = r[kpiMetricColumn];
          return typeof val === 'number' ? val : parseFloat(String(val).replace(/[\$,\s%]/g, '')) || 0;
        });
        const computed = computeMathematicalAggregation(rawValues, kpiMetricAgg);
        const aggLabel = getAggregationLabel(kpiMetricAgg, language);
        kpiMetric = {
          value: `${kpiPrefix}${computed.toLocaleString()}${kpiSuffix ? ' ' + kpiSuffix : ''}`,
          label: kpiLabel || `${aggLabel} - ${kpiMetricColumn}`,
          trendPercentage: kpiTrendPercent,
          trendDirection: kpiTrendDirection,
        };
      } else {
        kpiMetric = {
          value: kpiManualValue || '$12,450',
          label: kpiLabel || (isAr ? 'نظرة عامة على المقياس' : 'Metric Overview'),
          trendPercentage: kpiTrendPercent,
          trendDirection: kpiTrendDirection,
        };
      }
    }

    const defaultTitleEn = `${widgetAggregation.toUpperCase()}(${widgetYAxis}) by ${widgetXAxis}`;
    const defaultTitleAr = `${getAggregationLabel(widgetAggregation, 'ar')} لـ (${widgetYAxis}) حسب (${widgetXAxis})`;

    const widgetPayload: WidgetConfig = {
      id: editingWidgetId || `w-${Date.now()}`,
      title: widgetTitle.trim() || (isAr ? defaultTitleAr : defaultTitleEn),
      titleAr: widgetTitleAr.trim() || defaultTitleAr,
      type: widgetType,
      datasetId: currentTargetDataset.id,
      xAxis: widgetXAxis,
      yAxis: widgetYAxis,
      categoryField: widgetXAxis,
      aggregation: widgetAggregation,
      w: widgetType === 'kpi' ? 3 : 6,
      h: widgetType === 'kpi' ? 1 : 2,
      kpiMetric,
      ...(widgetType === 'geo'
        ? {
            geoMode,
            mapScope,
            focusCountry: mapScope === 'country' ? focusCountry : undefined,
            geoJson:
              geoJsonData && geoJsonFeatureProperty
                ? { name: geoJsonName || 'custom-boundaries', data: geoJsonData, featureProperty: geoJsonFeatureProperty, uploadedAt: new Date().toISOString() }
                : undefined,
            categoryField: geoLocationColumn,
            xAxis: geoLocationColumn,
            yAxis: widgetYAxis,
          }
        : {}),
    };

    if (editingWidgetId) {
      updateWidgetInDashboard(activeDashboard.id, widgetPayload);
      toast.success(
        isAr ? 'تم تحديث الأداة بنجاح' : 'Widget Updated',
        isAr
          ? `تم تحديث "${widgetPayload.titleAr || widgetPayload.title}" في لوحة القيادة.`
          : `Updated "${widgetPayload.title}" in dashboard.`
      );
    } else {
      addWidgetToDashboard(activeDashboard.id, widgetPayload);
      toast.success(
        isAr ? 'تمت إضافة الأداة بنجاح' : 'Widget Created',
        isAr
          ? `تمت إضافة أداة "${widgetPayload.titleAr || widgetPayload.title}" بحسابات (${getAggregationLabel(widgetAggregation, 'ar')}).`
          : `Added "${widgetPayload.title}" with ${widgetAggregation.toUpperCase()} aggregation.`
      );
    }

    setShowModal(false);
    setEditingWidgetId(null);
  };

  // Quick mathematical function change directly on dashboard card with animated loading feedback
  const handleQuickAggChange = (widget: WidgetConfig, newAgg: AggregationFunction) => {
    if (!activeDashboard) return;
    setCalculatingWidgetId(widget.id);

    setTimeout(() => {
      const updated = {
        ...widget,
        aggregation: newAgg,
      };
      updateWidgetInDashboard(activeDashboard.id, updated);
      setCalculatingWidgetId(null);
      toast.info(
        isAr ? 'تم تحديث الحساب الرياضي' : 'Aggregation Applied',
        isAr
          ? `تم تطبيق دالة (${getAggregationLabel(newAgg, 'ar')}) بنجاح على ${widget.titleAr || widget.title}.`
          : `Applied ${newAgg.toUpperCase()} calculation to ${widget.title}.`
      );
    }, 320);
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      toast.success(
        isAr ? 'تمت مزامنة بيانات لوحة التحكم' : 'Dashboard Synced',
        isAr ? 'تمت إعادة حساب مؤشرات الأداء والرسوم البيانية.' : 'Re-computed all KPIs and chart formulas.'
      );
    }, 500);
  };

  // Dashboard Full Export Handlers
  const handleExportFullDashboard = async (format: 'png' | 'pdf') => {
    setShowExportMenu(false);
    if (!dashboardContainerRef.current) return;
    const dashTitle = isAr ? activeDashboard?.nameAr || activeDashboard?.name : activeDashboard?.name;

    try {
      if (format === 'png') {
        await exportDashboardAsPng(
          dashboardContainerRef.current,
          dashTitle || 'dashboard',
          setExportProgress
        );
      } else {
        await exportDashboardAsPdf(
          dashboardContainerRef.current,
          dashTitle || 'dashboard',
          setExportProgress
        );
      }
      toast.success(
        isAr ? 'تم تصدير لوحة التحكم بنجاح!' : 'Dashboard Exported!',
        isAr
          ? `تم إنشاء وتحميل ملف ${format.toUpperCase()} عالي الدقة.`
          : `Generated high-resolution ${format.toUpperCase()} export.`
      );
    } catch (err) {
      console.error('Export dashboard error:', err);
      toast.error(
        isAr ? 'فشل التصدير' : 'Export Failed',
        isAr ? 'حدث خطأ أثناء إنشاء ملف التصدير.' : 'An error occurred while generating the export file.'
      );
    } finally {
      setTimeout(() => setExportProgress(null), 1800);
    }
  };

  // Single Widget Export Handlers
  const handleExportWidget = async (widgetId: string, widgetName: string, format: 'png' | 'pdf') => {
    setActiveWidgetExportMenuId(null);
    const element = document.getElementById(`widget-card-${widgetId}`);
    if (!element) return;

    try {
      if (format === 'png') {
        await exportSingleWidgetAsPng(element, widgetName || 'chart', setExportProgress);
      } else {
        await exportSingleWidgetAsPdf(element, widgetName || 'chart', setExportProgress);
      }
      toast.success(
        isAr ? 'تم تصدير الرسم البياني بنجاح!' : 'Chart Exported!',
        isAr
          ? `تم تنزيل ${widgetName} بصيغة ${format.toUpperCase()}.`
          : `Downloaded ${widgetName} as ${format.toUpperCase()}.`
      );
    } catch (err) {
      console.error('Export widget error:', err);
      toast.error(
        isAr ? 'فشل التصدير' : 'Export Failed',
        isAr ? 'تعذر التقاط الرسم البياني.' : 'Failed to capture chart content.'
      );
    } finally {
      setTimeout(() => setExportProgress(null), 1800);
    }
  };

  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareImageData, setShareImageData] = useState<string | null>(null);
  const [shareWidgetName, setShareWidgetName] = useState('');
  const [sharingDashboard, setSharingDashboard] = useState(false);

  // Capture the widget card as a PNG data URL and open the share-to-group modal
  const handleShareWidgetToGroup = async (widgetId: string, widgetName: string) => {
    setActiveWidgetExportMenuId(null);
    const element = document.getElementById(`widget-card-${widgetId}`);
    if (!element) return;
    try {
      const canvas = await captureElementToCanvas(element, { backgroundColor: '#161616', scale: 2.0 });
      setShareWidgetName(widgetName || 'chart');
      setShareImageData(canvas.toDataURL('image/png'));
      setShareModalOpen(true);
    } catch (err) {
      console.error('Share widget error:', err);
      toast.error(
        isAr ? 'فشل الالتقاط' : 'Capture Failed',
        isAr ? 'تعذر التقاط لقطة الرسم البياني.' : 'Failed to capture the chart snapshot.'
      );
    }
  };

  // Capture the WHOLE dashboard (all charts + KPIs) and open the share-to-group modal
  const handleShareDashboardToGroup = async () => {
    setShowExportMenu(false);
    setActiveWidgetExportMenuId(null);
    if (!dashboardContainerRef.current) return;
    const dashTitle = isAr
      ? activeDashboard?.nameAr || activeDashboard?.name
      : activeDashboard?.name;
    setSharingDashboard(true);
    try {
      // Lower scale: the full board is much larger than a single widget
      const canvas = await captureElementToCanvas(dashboardContainerRef.current, {
        backgroundColor: '#161616',
        scale: 1.5,
      });
      setShareWidgetName(dashTitle || (isAr ? 'لوحة التحكم' : 'Dashboard'));
      setShareImageData(canvas.toDataURL('image/png'));
      setShareModalOpen(true);
    } catch (err) {
      console.error('Share dashboard error:', err);
      toast.error(
        isAr ? 'فشل الالتقاط' : 'Capture Failed',
        isAr ? 'تعذر التقاط لقطة لوحة التحكم الكاملة.' : 'Failed to capture the full dashboard snapshot.'
      );
    } finally {
      setSharingDashboard(false);
    }
  };

  // إنشاء لوحة تحكم جديدة — يعمل حتى بدون أي بيانات أو لوحات سابقة
  const handleCreateDashboard = () => {
    const name = newDashName.trim();
    if (!name) return;
    createDashboard(name, newDashDesc.trim() || undefined);
    setShowCreateForm(false);
    setNewDashName('');
    setNewDashDesc('');
    setShowDashSwitcher(false);
    toast.success(
      isAr ? 'تم إنشاء لوحة التحكم' : 'Dashboard Created',
      isAr ? `أصبحت لوحة "${name}" هي اللوحة النشطة — أضف إليها مؤشرات ورسوماً الآن.` : `"${name}" is now the active dashboard — start adding widgets.`
    );
  };

  const renderCreateForm = () => (
    <div className="bg-[var(--cds-layer-01)] border border-[#0f62fe]/60 p-4 space-y-3 shadow-lg">
      <div className="text-xs font-mono font-bold text-[var(--cds-text-01)] uppercase tracking-wider flex items-center gap-2">
        <Plus className="w-3.5 h-3.5 text-[#0f62fe]" />
        {isAr ? 'إنشاء لوحة تحكم جديدة' : 'Create New Dashboard'}
      </div>
      <input
        value={newDashName}
        onChange={e => setNewDashName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleCreateDashboard(); }}
        placeholder={isAr ? 'اسم اللوحة (مثال: لوحة المبيعات الشهرية)' : 'Dashboard name (e.g. Monthly Sales)'}
        maxLength={60}
        autoFocus
        className="w-full px-3 py-2 text-sm bg-[var(--cds-layer-02)] text-[var(--cds-text-01)] border border-[var(--cds-border-subtle)] focus:border-[#0f62fe] focus:outline-hidden focus:ring-1 focus:ring-[#0f62fe]/40 rounded-lg transition-colors"
      />
      <input
        value={newDashDesc}
        onChange={e => setNewDashDesc(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleCreateDashboard(); }}
        placeholder={isAr ? 'وصف اختياري للوحة' : 'Optional description'}
        maxLength={140}
        className="w-full px-3 py-2 text-xs bg-[var(--cds-layer-02)] text-[var(--cds-text-01)] border border-[var(--cds-border-subtle)] focus:border-[#0f62fe] focus:outline-hidden focus:ring-1 focus:ring-[#0f62fe]/40 rounded-lg transition-colors"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={handleCreateDashboard}
          disabled={!newDashName.trim()}
          className="carbon-btn-primary text-xs font-mono font-bold uppercase gap-2 disabled:opacity-50"
        >
          <Check className="w-4 h-4" />
          <span>{isAr ? 'إنشاء اللوحة' : 'Create Dashboard'}</span>
        </button>
        <button onClick={() => setShowCreateForm(false)} className="carbon-btn-secondary text-xs uppercase">
          {t.common.cancel}
        </button>
      </div>
    </div>
  );

  if (!activeDashboard) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--cds-border-subtle)] pb-4">
          <div>
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#0f62fe] flex items-center gap-1.5">
              <LayoutDashboard className="w-3.5 h-3.5" />
              IBM CARBON / DASHBOARD ANALYTICS & STATISTICAL ENGINE
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-[#ffffff] tracking-tight mt-1">
              {isAr ? 'لوحات التحكم التفاعلية' : 'Interactive Dashboards'}
            </h2>
          </div>
          <button
            onClick={() => setShowCreateForm(v => !v)}
            className="carbon-btn-primary text-xs font-mono font-bold uppercase tracking-wider gap-2 shadow-lg"
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? 'لوحة تحكم جديدة' : 'New Dashboard'}</span>
          </button>
        </div>

        {showCreateForm && renderCreateForm()}

        <div className="bg-[var(--cds-layer-01)] border border-dashed border-[var(--cds-border-strong)] p-12 text-center space-y-3">
          <LayoutDashboard className="w-12 h-12 text-[var(--cds-text-03)] mx-auto opacity-50" />
          <h3 className="text-base font-bold text-[var(--cds-text-01)]">
            {isAr ? 'لا توجد لوحات تحكم بعد' : 'No dashboards yet'}
          </h3>
          <p className="text-xs text-[var(--cds-text-02)] max-w-md mx-auto">
            {isAr
              ? 'أنشئ لوحتك الأولى الآن، ثم أضف إليها مؤشرات الأداء والرسوم البيانية من زر "إضافة عنصر جديد" — لا تحتاج حتى إلى رفع بيانات للبدء.'
              : 'Create your first dashboard, then add KPI cards and charts via "Add Widget" — no dataset upload required to start.'}
          </p>
          <button onClick={() => setShowCreateForm(true)} className="carbon-btn-primary text-xs font-mono font-bold uppercase gap-2 mt-2">
            <Plus className="w-4 h-4" />
            <span>{isAr ? 'إنشاء لوحة تحكم' : 'Create Dashboard'}</span>
          </button>
        </div>
      </div>
    );
  }

  const kpis = activeDashboard.widgets.filter(w => w.type === 'kpi');
  const charts = activeDashboard.widgets.filter(w => w.type !== 'kpi');

  // Compute responsive grid layout column class from persisted layoutSettings
  const gridColClass = (() => {
    switch (layoutSettings.chartGridColumns) {
      case 1:
        return 'grid-cols-1';
      case 3:
        return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
      case 2:
      default:
        return 'grid-cols-1 lg:grid-cols-2';
    }
  })();

  // Compute card height class from layoutSettings
  const cardHeightClass = (() => {
    switch (layoutSettings.chartHeight) {
      case 'compact':
        return 'h-[325px]';
      case 'spacious':
        return 'h-[470px]';
      case 'standard':
      default:
        return 'h-[395px]';
    }
  })();

  const chartBodyHeightClass = (() => {
    switch (layoutSettings.chartHeight) {
      case 'compact':
        return 'h-[235px]';
      case 'spacious':
        return 'h-[370px]';
      case 'standard':
      default:
        return 'h-[295px]';
    }
  })();

  // Preview statistical calculation value for the modal
  const sampleValues = (currentTargetDataset?.data || []).slice(0, 100).map(r => {
    const raw = r[widgetYAxis];
    return typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[\$,\s%]/g, '')) || 0;
  });
  const computedSampleAgg = computeMathematicalAggregation(sampleValues, widgetAggregation);

  const selectedAggOption = AGGREGATION_OPTIONS.find(o => o.value === widgetAggregation) || AGGREGATION_OPTIONS[0];

  const computedFormulaText = `${widgetAggregation.toUpperCase()}(${widgetYAxis || 'metric'}) GROUPED BY (${widgetXAxis || 'dimension'})`;
  const computedFormulaTextAr = `صيغة الحساب: ${getAggregationLabel(widgetAggregation, 'ar')} لعمود (${widgetYAxis || 'المقياس'}) مجمعة حسب (${widgetXAxis || 'التصنيف'})`;

  // Render KPI strip
  const renderKpiSection = () => {
    if (kpis.length === 0 || layoutSettings.kpiPosition === 'side') return null;
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(w => (
          <div key={w.id} id={`widget-card-${w.id}`} className="relative group">
            <div
              data-export-ignore="true"
              className="absolute top-2 end-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10"
            >
              <button
                onClick={() => handleOpenEditModal(w)}
                className="p-1 bg-[var(--cds-layer-03)] hover:bg-[#0f62fe] text-[var(--cds-text-02)] hover:text-white transition-colors"
                title={isAr ? 'تعديل العنصر' : 'Edit Widget'}
              >
                <Edit3 className="w-3 h-3" />
              </button>
              <button
                onClick={() => handleShareWidgetToGroup(w.id, isAr ? w.titleAr || w.title : w.title)}
                className="p-1 bg-[var(--cds-layer-03)] hover:bg-[#0f62fe] text-[var(--cds-text-02)] hover:text-white transition-colors"
                title={isAr ? 'مشاركة في مناقشة جماعية' : 'Share to group discussion'}
              >
                <MessageSquare className="w-3 h-3" />
              </button>
              <button
                onClick={() => handleExportWidget(w.id, isAr ? w.titleAr || w.title : w.title, 'png')}
                className="p-1 bg-[var(--cds-layer-03)] hover:bg-[#24a148] text-[var(--cds-text-02)] hover:text-white transition-colors"
                title={isAr ? 'تصدير كصورة PNG' : 'Export as PNG'}
              >
                <Camera className="w-3 h-3" />
              </button>
              <button
                onClick={() => {
                  deleteWidgetFromDashboard(activeDashboard.id, w.id);
                  toast.info(
                    isAr ? 'تم حذف مؤشر الأداء' : 'KPI Widget Removed',
                    isAr ? `تمت إزالة ${w.titleAr || w.title} من لوحة القيادة.` : `Removed ${w.title} from dashboard.`
                  );
                }}
                className="p-1 bg-[var(--cds-layer-03)] hover:bg-[#da1e28] text-[var(--cds-text-02)] hover:text-white transition-colors"
                title={isAr ? 'حذف العنصر' : 'Delete Widget'}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
            <KpiCard widget={w} />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--cds-border-subtle)] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#0f62fe] flex items-center gap-1.5">
              <LayoutDashboard className="w-3.5 h-3.5" />
              IBM CARBON / DASHBOARD ANALYTICS & STATISTICAL ENGINE
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#ffffff] tracking-tight mt-1">
            {isAr ? activeDashboard.nameAr || activeDashboard.name || 'Untitled' : activeDashboard.name || 'Untitled'}
          </h2>
          <p className="text-xs sm:text-sm text-[var(--cds-text-02)] mt-0.5">
            {isAr ? activeDashboard.descriptionAr || activeDashboard.description || '' : activeDashboard.description || ''}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Zero-Upload CSV Ingestion */}
          <button
            onClick={() => setShowCsvModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] border border-[#24a148] text-[var(--cds-text-01)] text-xs font-mono font-bold transition-colors shadow-xs"
            title={isAr ? 'استيراد فوري بدون خادم وتغذية لوحة القيادة' : 'Instant in-memory CSV import to feed this dashboard'}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#42be65]" />
            <span>{isAr ? 'استيراد CSV محلي' : 'Import CSV'}</span>
          </button>

          {/* Dashboard Switcher & Manager (تبديل/إنشاء/حذف اللوحات) */}
          <div className="relative">
            <button
              onClick={() => setShowDashSwitcher(!showDashSwitcher)}
              className="carbon-btn-secondary text-xs font-mono font-bold gap-1.5"
              title={isAr ? 'تبديل بين لوحات التحكم وإنشاء أو حذف لوحة' : 'Switch between dashboards, create or delete'}
            >
              <Layers className="w-3.5 h-3.5 text-[#8a3ffc]" />
              <span className="max-w-[140px] truncate">{isAr ? activeDashboard.nameAr || activeDashboard.name : activeDashboard.name}</span>
              <ChevronDown className="w-3 h-3 text-[var(--cds-text-03)]" />
            </button>

            {showDashSwitcher && (
              <div className={`absolute top-full mt-1 w-72 bg-[var(--cds-layer-02)] border border-[var(--cds-border-strong)] shadow-2xl p-1 z-50 ${isAr ? 'left-0' : 'right-0'}`}>
                <div className="px-3 py-1.5 text-[10px] font-mono font-bold text-[var(--cds-text-03)] uppercase tracking-wider border-b border-[var(--cds-border-subtle)] mb-1">
                  {isAr ? `لوحات التحكم (${dashboards.length})` : `Dashboards (${dashboards.length})`}
                </div>
                {dashboards.map(d => (
                  <div key={d.id} className="flex items-center gap-1">
                    <button
                      onClick={() => { setActiveDashboardId(d.id); setShowDashSwitcher(false); }}
                      className={`flex-1 min-w-0 text-start px-3 py-2 text-xs font-mono flex items-center gap-2 transition-colors ${
                        d.id === activeDashboard.id
                          ? 'bg-[#0f62fe]/15 text-[#78a9ff] font-bold'
                          : 'text-[var(--cds-text-01)] hover:bg-[var(--cds-layer-03)]'
                      }`}
                      title={isAr ? (d.nameAr || d.name || d.title || d.id) : (d.name || d.title || d.id)}
                    >
                      {d.id === activeDashboard.id
                        ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[#42be65]" />
                        : <LayoutDashboard className="w-3.5 h-3.5 shrink-0 text-[var(--cds-text-03)]" />}
                      <span className="truncate">{isAr ? (d.nameAr || d.name || d.title) : (d.name || d.title)}</span>
                    </button>
                    {dashboards.length > 1 && (
                      <button
                        onClick={() => {
                          const removedName = isAr ? (d.nameAr || d.name || d.title || '') : (d.name || d.title || '');
                          deleteDashboard(d.id);
                          toast.info(
                            isAr ? 'تم حذف لوحة التحكم' : 'Dashboard Deleted',
                            isAr ? `تم حذف "${removedName}".` : `Deleted "${removedName}".`
                          );
                        }}
                        className="p-1.5 me-1 text-[var(--cds-text-03)] hover:text-white hover:bg-[#da1e28] transition-colors"
                        title={isAr ? 'حذف هذه اللوحة' : 'Delete this dashboard'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                <div className="border-t border-[var(--cds-border-subtle)] mt-1 pt-1">
                  <button
                    onClick={() => { setShowDashSwitcher(false); setShowCreateForm(true); }}
                    className="w-full text-start px-3 py-2 text-xs font-mono text-[#78a9ff] hover:bg-[#0f62fe]/20 flex items-center gap-2 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="font-bold">{isAr ? 'لوحة تحكم جديدة…' : 'New dashboard…'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Refresh / Sync Button */}
          <button
            onClick={handleRefresh}
            className="carbon-btn-secondary text-xs font-mono font-bold gap-1.5"
            title={isAr ? 'تحديث العناصر' : 'Refresh Widgets'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? (isAr ? 'جارِ التحديث...' : 'Syncing...') : (isAr ? 'مزامنة' : 'Sync')}</span>
          </button>

          {/* Layout Settings Button */}
          <button
            onClick={() => setShowLayoutModal(true)}
            className="carbon-btn-secondary text-xs font-mono font-bold gap-1.5"
            title={isAr ? 'تخصيص التخطيط والمظهر' : 'Layout & Display Preferences'}
          >
            <LayoutGrid className="w-3.5 h-3.5 text-[#33b1ff]" />
            <span>{isAr ? 'التخطيط' : 'Layout'}</span>
          </button>

          {/* Smart Alerts Button */}
          <button
            onClick={() => {
              // Simulate opening threshold modal and setting up a watcher
              toast.info(
                isAr ? 'إعدادات التنبيهات الذكية' : 'Smart Alerts',
                isAr ? 'تم تفعيل التنبيهات. سيتم مراقبة تجاوز القيم الحدية (Thresholds) للبيانات الحالية.' : 'Alerts enabled. Monitoring current data for threshold violations.'
              );
              // Trigger a mock alert after 3 seconds to demonstrate real-time alerting
              setTimeout(() => {
                toast.error(
                  isAr ? 'تنبيه ذكي: تجاوز الحد المسموح' : 'Smart Alert: Threshold Exceeded',
                  isAr ? 'إحدى المتغيرات المهمة (مثل المبيعات أو التكاليف) تجاوزت الحد الأقصى المسموح به.' : 'A critical variable has exceeded its predefined maximum threshold.'
                );
              }, 3000);
            }}
            className="carbon-btn-secondary text-xs font-mono font-bold gap-1.5"
            title={isAr ? 'إعداد تنبيهات تجاوز الحدود (Thresholds)' : 'Configure Threshold Alerts'}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-[#f1c21b]" />
            <span>{isAr ? 'التنبيهات' : 'Alerts'}</span>
          </button>

          {/* Data Cinema — Story Mode Trigger */}
          {activeDashboard.widgets.length > 0 && (
            <button
              onClick={() => setShowCinemaMode(true)}
              className="carbon-btn-secondary text-xs font-mono font-bold gap-1.5"
              title={isAr ? 'سينما البيانات: عرض سينمائي متتابع مع سرد تحليلي تلقائي' : 'Data Cinema: guided cinematic walkthrough with auto narration'}
            >
              <Clapperboard className="w-3.5 h-3.5 text-[#f1c21b]" />
              <span>{isAr ? 'وضع السينما' : 'Story Mode'}</span>
            </button>
          )}

          {/* Export Dropdown Menu (PNG / PDF) */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="carbon-btn-secondary text-xs font-mono font-bold gap-1.5"
              title={isAr ? 'تصدير لوحة التحكم الحالية كصورة أو PDF' : 'Export Active Dashboard as PNG or PDF'}
            >
              <Download className="w-3.5 h-3.5 text-[#24a148]" />
              <span>{isAr ? 'تصدير اللوحة' : 'Export'}</span>
              <ChevronDown className="w-3 h-3 text-[var(--cds-text-03)]" />
            </button>

            {showExportMenu && (
              <div
                className={`absolute top-full mt-1 w-64 bg-[var(--cds-layer-02)] border border-[var(--cds-border-strong)] shadow-2xl p-1 z-50 ${
                  isAr ? 'left-0' : 'right-0'
                }`}
              >
                <div className="px-3 py-1.5 text-[10px] font-mono font-bold text-[var(--cds-text-03)] uppercase tracking-wider border-b border-[var(--cds-border-subtle)] mb-1">
                  {isAr ? 'خيارات التصدير عالي الدقة' : 'Export High-Resolution'}
                </div>

                <button
                  onClick={() => handleExportFullDashboard('png')}
                  className="w-full text-start px-3 py-2 text-xs font-mono text-[var(--cds-text-01)] hover:bg-[var(--cds-layer-03)] flex items-center gap-2.5 transition-colors"
                >
                  <FileImage className="w-4 h-4 text-[#33b1ff]" />
                  <div>
                    <div className="font-bold">{isAr ? 'تصدير كصورة PNG عالية الدقة' : 'Export as High-Res PNG'}</div>
                    <div className="text-[10px] text-[var(--cds-text-03)]">{isAr ? 'صورة 2x جاهزة للمشاركة والعروض' : 'Retina 2x resolution raster'}</div>
                  </div>
                </button>

                <button
                  onClick={() => handleExportFullDashboard('pdf')}
                  className="w-full text-start px-3 py-2 text-xs font-mono text-[var(--cds-text-01)] hover:bg-[var(--cds-layer-03)] flex items-center gap-2.5 transition-colors border-b border-[var(--cds-border-subtle)]"
                >
                  <FileText className="w-4 h-4 text-[#da1e28]" />
                  <div>
                    <div className="font-bold">{isAr ? 'تصدير كتقرير PDF رسمي' : 'Export as Official PDF'}</div>
                    <div className="text-[10px] text-[var(--cds-text-03)]">{isAr ? 'مستند A4 منسق مع الرسوم التوضيحية' : 'A4 formatted PDF document'}</div>
                  </div>
                </button>

                <button
                  onClick={handleShareDashboardToGroup}
                  disabled={sharingDashboard}
                  className="w-full text-start px-3 py-2 text-xs font-mono text-[var(--cds-text-01)] hover:bg-[var(--cds-layer-03)] flex items-center gap-2.5 transition-colors disabled:opacity-60"
                >
                  {sharingDashboard
                    ? <Loader2 className="w-4 h-4 text-[#0f62fe] animate-spin" />
                    : <MessageSquare className="w-4 h-4 text-[#78a9ff]" />}
                  <div>
                    <div className="font-bold">{isAr ? 'مشاركة لقطة اللوحة كاملة في مناقشة' : 'Share full dashboard snapshot'}</div>
                    <div className="text-[10px] text-[var(--cds-text-03)]">{isAr ? 'كل الرسوم والمؤشرات معاً في صورة واحدة' : 'All charts & KPIs in one image'}</div>
                  </div>
                </button>

                <button
                  onClick={() => { setShowExportMenu(false); setShowCentralizedExportModal(true); }}
                  className="w-full text-start px-3 py-2 text-xs font-mono text-[#78a9ff] hover:bg-[#0f62fe]/20 flex items-center gap-2.5 transition-colors"
                >
                  <Download className="w-4 h-4 text-[#0f62fe]" />
                  <div>
                    <div className="font-bold">{isAr ? 'خيارات التصدير الشاملة (CSV, JSON, Excel, SQL)' : 'Centralized Multi-Format Export'}</div>
                    <div className="text-[10px] text-[var(--cds-text-03)]">{isAr ? 'مركز تصدير البيانات والتقارير المتقدم' : 'Advanced multi-format data export hub'}</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Add Widget Button */}
          <button
            onClick={handleOpenAddModal}
            className="carbon-btn-primary text-xs font-mono font-bold uppercase tracking-wider gap-2 shadow-lg"
          >
            <Plus className="w-4 h-4" />
            <span>{t.dashboards.addWidget}</span>
          </button>
        </div>
      </div>

      {/* New Dashboard Creation Form */}
      {showCreateForm && renderCreateForm()}

      {/* Visualization Themes Palette Selector */}
      <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-[#0f62fe]/15 border border-[#0f62fe] text-[#0f62fe]">
            <Palette className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-mono font-bold text-[var(--cds-text-01)] flex items-center gap-2">
              <span>{isAr ? 'نسق الألوان للرسوم البيانية' : 'Visualization Themes'}</span>
              <span className="px-1.5 py-0.5 bg-[var(--cds-layer-02)] border border-[var(--cds-border-strong)] text-[10px] text-[#33b1ff] font-bold">
                {isAr ? VISUALIZATION_THEMES[selectedTheme]?.nameAr : VISUALIZATION_THEMES[selectedTheme]?.nameEn}
              </span>
            </div>
            <p className="text-[11px] text-[var(--cds-text-03)]">
              {isAr
                ? 'اختيار لوحة ألوان موحدة تُطبق تلقائياً على كافة أنواع الرسوم البيانية'
                : 'Select a unified color palette applied across all chart types'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {Object.values(VISUALIZATION_THEMES).map(vt => {
            const isSelected = selectedTheme === vt.id;
            return (
              <button
                key={vt.id}
                onClick={() => {
                  setSelectedTheme(vt.id);
                  toast.success(
                    isAr ? 'تم تغيير نسق الألوان' : 'Visualization Theme Updated',
                    isAr ? `تم تطبيق نسق (${vt.nameAr}) على جميع الرسوم البيانية.` : `Applied ${vt.nameEn} theme across all charts.`
                  );
                }}
                className={`flex items-center gap-2 px-2.5 py-1.5 text-xs font-mono transition-all border ${
                  isSelected
                    ? 'bg-[var(--cds-layer-02)] border-[#0f62fe] text-[var(--cds-text-01)] shadow-md ring-1 ring-[#0f62fe]'
                    : 'bg-[var(--cds-layer-01)] border-[var(--cds-border-subtle)] text-[var(--cds-text-03)] hover:border-[var(--cds-border-strong)] hover:text-[var(--cds-text-01)]'
                }`}
                title={isAr ? vt.descriptionAr : vt.descriptionEn}
              >
                {/* Swatch color dots */}
                <div className="flex items-center -space-x-1">
                  {vt.colors.slice(0, 4).map((c, idx) => (
                    <span
                      key={idx}
                      className="w-2.5 h-2.5 rounded-full border border-[var(--cds-layer-01)]"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <span className="font-semibold text-[11px]">{isAr ? vt.nameAr.split(' ')[0] : vt.nameEn.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Dashboard Canvas Container with Ref for Export Capture */}
      <div ref={dashboardContainerRef} className="space-y-6">
        {/* KPI Section (Top Position) */}
        {layoutSettings.kpiPosition === 'top' && renderKpiSection()}

        {/* Analytical Charts Grid */}
        {charts.length === 0 && kpis.length === 0 ? (
          <div className="bg-[var(--cds-layer-01)] border border-dashed border-[var(--cds-border-strong)] p-12 text-center space-y-3">
            <BarChart3 className="w-12 h-12 text-[var(--cds-text-03)] mx-auto opacity-50" />
            <h3 className="text-base font-bold text-[var(--cds-text-01)]">
              {isAr ? 'لا توجد عناصر أو رسوم بيانية في هذه اللوحة' : 'No widgets in this dashboard yet'}
            </h3>
            <p className="text-xs text-[var(--cds-text-02)] max-w-md mx-auto">
              {isAr
                ? 'انقر على "إضافة عنصر جديد" لاختيار نوع الرسم والمحاور وتطبيق الدوال الرياضية والإحصائية المتطورة.'
                : 'Click "Add Widget" to choose chart type, configure axes, and apply mathematical/statistical functions.'}
            </p>
            <button onClick={handleOpenAddModal} className="carbon-btn-primary text-xs font-mono font-bold uppercase gap-2 mt-2">
              <Plus className="w-4 h-4" />
              <span>{t.dashboards.addWidget}</span>
            </button>
          </div>
        ) : (
          <div className={`grid ${gridColClass} gap-6`}>
            {charts.map(w => {
              const currentAgg = w.aggregation || 'sum';
              const widgetDataset = datasets.find(d => d.id === w.datasetId) || activeDataset;
              const isWidgetCalculating = calculatingWidgetId === w.id;
              const isExportMenuOpen = activeWidgetExportMenuId === w.id;
              const widgetDisplayName = isAr ? w.titleAr || w.title : w.title;

              return (
                <div
                  key={w.id}
                  id={`widget-card-${w.id}`}
                  className={`bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] hover:border-[var(--cds-border-strong)] transition-colors p-4 flex flex-col justify-between ${cardHeightClass} relative group rounded-none shadow-md overflow-hidden`}
                >
                  {/* Visual Calculating Loading Overlay on specific widget */}
                  {isWidgetCalculating && (
                    <div className="absolute inset-0 z-20 bg-[var(--cds-layer-01)]/85 backdrop-blur-xs flex flex-col items-center justify-center gap-2 transition-all">
                      <Loader2 className="w-6 h-6 text-[#0f62fe] animate-spin" />
                      <span className="text-xs font-mono text-[var(--cds-text-01)] font-bold">
                        {isAr ? 'جارِ إعادة احتساب الدالة الإحصائية...' : 'Recalculating statistical aggregation...'}
                      </span>
                      <span className="text-[10px] font-mono text-[#33b1ff]">
                        {getAggregationLabel(currentAgg, language)}
                      </span>
                    </div>
                  )}

                  {/* Chart Card Header */}
                  <div className="flex items-center justify-between border-b border-[var(--cds-border-subtle)] pb-2.5 mb-3 gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-mono font-bold text-[#ffffff] uppercase tracking-wider truncate" title={w.title}>
                        {widgetDisplayName}
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        {/* Mathematical Aggregation Switcher Dropdown (Carbon Styled) */}
                        {layoutSettings.showFormulas && (
                          <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#33b1ff] bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] px-2 py-0.5">
                            <Sigma className="w-3 h-3 text-[#33b1ff] shrink-0" />
                            <span className="text-[var(--cds-text-02)]">{isAr ? 'الدالة:' : 'Func:'}</span>
                            <select
                              value={currentAgg}
                              onChange={e => handleQuickAggChange(w, e.target.value as AggregationFunction)}
                              className="bg-transparent text-[#33b1ff] font-bold text-[10px] outline-none cursor-pointer hover:underline"
                              title={isAr ? 'تغيير الدالة الحسابية والإحصائية فوراً' : 'Switch math/statistical aggregation function'}
                            >
                              <optgroup label={isAr ? '── مقاييس النزعة المركزية ──' : '── Central Tendency ──'} className="bg-[var(--cds-layer-02)] text-[var(--cds-text-03)]">
                                {AGGREGATION_OPTIONS.filter(o => o.category === 'central').map(opt => (
                                  <option key={opt.value} value={opt.value} className="bg-[var(--cds-layer-02)] text-white">
                                    {opt.symbol} {isAr ? opt.labelAr : opt.labelEn}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label={isAr ? '── مقاييس التشتت والتباين ──' : '── Dispersion & Spread ──'} className="bg-[var(--cds-layer-02)] text-[var(--cds-text-03)]">
                                {AGGREGATION_OPTIONS.filter(o => o.category === 'dispersion').map(opt => (
                                  <option key={opt.value} value={opt.value} className="bg-[var(--cds-layer-02)] text-white">
                                    {opt.symbol} {isAr ? opt.labelAr : opt.labelEn}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label={isAr ? '── المقاييس المئوية والاحتمالية ──' : '── Percentiles & Quartiles ──'} className="bg-[var(--cds-layer-02)] text-[var(--cds-text-03)]">
                                {AGGREGATION_OPTIONS.filter(o => o.category === 'percentile').map(opt => (
                                  <option key={opt.value} value={opt.value} className="bg-[var(--cds-layer-02)] text-white">
                                    {opt.symbol} {isAr ? opt.labelAr : opt.labelEn}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label={isAr ? '── الإجماليات والتكرارات ──' : '── Totals & Aggregates ──'} className="bg-[var(--cds-layer-02)] text-[var(--cds-text-03)]">
                                {AGGREGATION_OPTIONS.filter(o => o.category === 'aggregate').map(opt => (
                                  <option key={opt.value} value={opt.value} className="bg-[var(--cds-layer-02)] text-white">
                                    {opt.symbol} {isAr ? opt.labelAr : opt.labelEn}
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                          </div>
                        )}

                        {/* Axes Indicator */}
                        {layoutSettings.showCardBadges && (
                          <span className="text-[10px] font-mono text-[var(--cds-text-03)] hidden sm:inline-block truncate">
                            Y: <strong className="text-[var(--cds-text-02)]">{w.yAxis || 'value'}</strong> | X: <strong className="text-[var(--cds-text-02)]">{w.xAxis || w.categoryField || 'category'}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions & Type Badge */}
                    <div className="flex items-center gap-1.5 shrink-0" data-export-ignore="true">

                      {layoutSettings.showCardBadges && (
                        <span className="text-[10px] font-mono uppercase bg-[var(--cds-layer-01)] text-[#0f62fe] border border-[var(--cds-border-subtle)] px-2 py-0.5 font-bold">
                          {w.type}
                        </span>
                      )}

                      {/* Individual Widget Export Dropdown */}
                      <div className="relative">
                        <button
                          onClick={() => setActiveWidgetExportMenuId(isExportMenuOpen ? null : w.id)}
                          className="p-1.5 bg-[var(--cds-layer-01)] hover:bg-[#24a148] text-[var(--cds-text-02)] hover:text-white border border-[var(--cds-border-subtle)] transition-colors"
                          title={isAr ? 'تصدير هذا الرسم بشكل منفصل (PNG/PDF)' : 'Export this chart (PNG/PDF)'}
                        >
                          <Camera className="w-3.5 h-3.5" />
                        </button>

                        {isExportMenuOpen && (
                          <div
                            className={`absolute top-full mt-1 w-48 bg-[var(--cds-layer-01)] border border-[var(--cds-border-strong)] shadow-2xl p-1 z-30 ${
                              isAr ? 'left-0' : 'right-0'
                            }`}
                          >
                            <button
                              onClick={() => handleExportWidget(w.id, widgetDisplayName, 'png')}
                              className="w-full text-start px-2.5 py-1.5 text-xs font-mono text-[var(--cds-text-01)] hover:bg-[var(--cds-layer-03)] flex items-center gap-2"
                            >
                              <FileImage className="w-3.5 h-3.5 text-[#33b1ff]" />
                              <span>{isAr ? 'تصدير كصورة PNG' : 'Save as PNG'}</span>
                            </button>
                            <button
                              onClick={() => handleExportWidget(w.id, widgetDisplayName, 'pdf')}
                              className="w-full text-start px-2.5 py-1.5 text-xs font-mono text-[var(--cds-text-01)] hover:bg-[var(--cds-layer-03)] flex items-center gap-2"
                            >
                              <FileText className="w-3.5 h-3.5 text-[#da1e28]" />
                              <span>{isAr ? 'تصدير كمستند PDF' : 'Save as PDF'}</span>
                            </button>
                            <div className="h-px bg-[var(--cds-border-subtle)] my-1" />
                            <button
                              onClick={() => handleShareWidgetToGroup(w.id, widgetDisplayName)}
                              className="w-full text-start px-2.5 py-1.5 text-xs font-mono text-[var(--cds-text-01)] hover:bg-[var(--cds-layer-03)] flex items-center gap-2"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-[#78a9ff]" />
                              <span>{isAr ? 'مشاركة في مناقشة جماعية' : 'Share to group discussion'}</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Edit Button */}
                      <button
                        onClick={() => handleOpenEditModal(w)}
                        className="p-1.5 bg-[var(--cds-layer-01)] hover:bg-[#0f62fe] text-[var(--cds-text-02)] hover:text-white border border-[var(--cds-border-subtle)] transition-colors"
                        title={isAr ? 'تعديل المحاور والخيارات' : 'Edit Axes & Settings'}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={() => {
                          deleteWidgetFromDashboard(activeDashboard.id, w.id);
                          toast.info(
                            isAr ? 'تم حذف الرسم البياني' : 'Chart Widget Removed',
                            isAr ? `تمت إزالة ${w.titleAr || w.title} من لوحة القيادة.` : `Removed ${w.title} from dashboard.`
                          );
                        }}
                        className="p-1.5 bg-[var(--cds-layer-01)] hover:bg-[#da1e28] text-[var(--cds-text-02)] hover:text-white border border-[var(--cds-border-subtle)] transition-colors"
                        title={isAr ? 'حذف العنصر' : 'Delete Widget'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Chart Body */}
                  <div className={`${chartBodyHeightClass} w-full`}>
                    <ChartFactory widget={w} dataset={widgetDataset} activeTheme={selectedTheme} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* KPI Section (Bottom Position) */}
        {layoutSettings.kpiPosition === 'bottom' && renderKpiSection()}
      </div>

      {/* ──────────────────────────────────────────────────────────────────────── */}
      {/* ADVANCED ANALYTICAL TOOLS SUITE - IBM CARBON THEME */}
      {/* ──────────────────────────────────────────────────────────────────────── */}
      <div className="border-t border-[var(--cds-border-subtle)] pt-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-4 text-start">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#8a3ffc] flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-[#8a3ffc]" />
              IBM CARBON / ADVANCED ANALYTICAL SUITE
            </span>
            <h3 className="text-sm font-bold text-white mt-1">
              {isAr ? 'حزمة التحليلات المتقدمة والذكاء الاصطناعي' : 'AI & Advanced Decision Intelligence'}
            </h3>
            <p className="text-[11px] text-[var(--cds-text-02)] mt-0.5">
              {isAr ? 'محركات متكاملة للتنبؤ المستقبلي، الموجزات الصوتية، وتصدير العروض الإدارية' : 'Integrated modules for automated forecasting, text-to-speech briefing, and presentation builders'}
            </p>
          </div>

          {/* Sub-Tab Selector Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 bg-[var(--cds-layer-02)] p-1 border border-[var(--cds-border-subtle)] text-xs font-mono font-bold">
            <button
              onClick={() => setAdvancedToolTab('forecast')}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition-all rounded-none ${
                advancedToolTab === 'forecast' ? 'bg-[#8a3ffc] text-white shadow-xs' : 'text-[var(--cds-text-03)] hover:text-white'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{isAr ? 'التنبؤ والـ What-If' : 'Predictive Forecast'}</span>
            </button>

            <button
              onClick={() => setAdvancedToolTab('audio')}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition-all rounded-none ${
                advancedToolTab === 'audio' ? 'bg-[#8a3ffc] text-white shadow-xs' : 'text-[var(--cds-text-03)] hover:text-white'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>{isAr ? 'الموجز الصوتي' : 'Audio Briefing'}</span>
            </button>

            <button
              onClick={() => setAdvancedToolTab('slides')}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition-all rounded-none ${
                advancedToolTab === 'slides' ? 'bg-[#8a3ffc] text-white shadow-xs' : 'text-[var(--cds-text-03)] hover:text-white'
              }`}
            >
              <Presentation className="w-3.5 h-3.5" />
              <span>{isAr ? 'العروض التقديمية' : 'Executive Slides'}</span>
            </button>
          </div>
        </div>

        {/* Display Active Tab Component */}
        <div className="animate-in fade-in duration-200">
          {advancedToolTab === 'agent' && <AiAgentPanel />}
          {advancedToolTab === 'forecast' && <ForecastingPanel />}
          {advancedToolTab === 'audio' && <AudioBriefingPanel />}
          {advancedToolTab === 'slides' && <SlidesExportPanel />}
        </div>
      </div>

      {/* Export Toast / Progress Indicator */}
      {exportProgress && (
        <div className="fixed bottom-6 end-6 z-50 bg-[var(--cds-layer-01)] border border-[#0f62fe] shadow-2xl p-4 w-80 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {exportProgress.status === 'done' ? (
                <CheckCircle2 className="w-4 h-4 text-[#24a148]" />
              ) : (
                <Loader2 className="w-4 h-4 text-[#0f62fe] animate-spin" />
              )}
              <span className="text-xs font-mono font-bold text-white uppercase">
                {exportProgress.status === 'done'
                  ? isAr ? 'تم التصدير بنجاح!' : 'Export Completed!'
                  : isAr ? 'جارِ معالجة التصدير...' : 'Processing Export...'}
              </span>
            </div>
            <span className="text-xs font-mono text-[#33b1ff] font-bold">
              {exportProgress.progress}%
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-[var(--cds-layer-01)] h-1.5 overflow-hidden mb-1.5">
            <div
              className={`h-full transition-all duration-200 ${
                exportProgress.status === 'done' ? 'bg-[#24a148]' : 'bg-[#0f62fe]'
              }`}
              style={{ width: `${exportProgress.progress}%` }}
            />
          </div>

          <p className="text-[11px] font-mono text-[var(--cds-text-02)] truncate">
            {exportProgress.step}
          </p>
        </div>
      )}

      {/* Persistent Layout Customization Modal */}
      <DashboardLayoutModal
        isOpen={showLayoutModal}
        onClose={() => setShowLayoutModal(false)}
      />

      {/* Full Modal for Adding & Configuring New / Existing Widget */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-strong)] max-w-3xl w-full p-6 shadow-2xl space-y-5 rounded-lg my-8 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[var(--cds-border-subtle)] pb-3">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#0f62fe] flex items-center gap-1.5">
                  <Sliders className="w-3 h-3" />
                  IBM CARBON / WIDGET & MATHEMATICAL CONFIGURATOR
                </span>
                <h3 className="text-lg font-bold text-[#ffffff] mt-0.5">
                  {editingWidgetId
                    ? (isAr ? 'تعديل إعدادات العنصر والمحاور الرياضية' : 'Edit Widget & Math Axes')
                    : (isAr ? 'إضافة عنصر جديد وضبط المحاور والدوال الحسابية' : 'Add New Widget & Math Functions')}
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-[var(--cds-text-02)] hover:text-white font-mono text-sm p-1 hover:bg-[var(--cds-layer-03)]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 font-mono text-xs">
              {/* Dataset Selection (if multiple) */}
              {datasets.length > 1 && (
                <div>
                  <label className="block text-[var(--cds-text-01)] font-bold mb-1 flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-[#0f62fe]" />
                    <span>{isAr ? 'مجموعة البيانات المصدرية' : 'Source Dataset'}</span>
                  </label>
                  <select
                    value={selectedDatasetId}
                    onChange={e => setSelectedDatasetId(e.target.value)}
                    className="carbon-input w-full"
                  >
                    {datasets.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.rowCount} {isAr ? 'سجل' : 'rows'})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Widget Title */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[var(--cds-text-01)] font-bold mb-1">
                    {isAr ? 'عنوان العنصر (بالإنجليزية)' : 'Widget Title (English)'}
                  </label>
                  <input
                    type="text"
                    value={widgetTitle}
                    onChange={e => setWidgetTitle(e.target.value)}
                    placeholder="e.g. Monthly Revenue Breakdown"
                    className="carbon-input w-full"
                  />
                </div>
                <div>
                  <label className="block text-[var(--cds-text-01)] font-bold mb-1">
                    {isAr ? 'عنوان العنصر (بالعربية)' : 'Widget Title (Arabic)'}
                  </label>
                  <input
                    type="text"
                    value={widgetTitleAr}
                    onChange={e => setWidgetTitleAr(e.target.value)}
                    placeholder="مثال: تحليل الإيرادات الشهرية"
                    className="carbon-input w-full"
                  />
                </div>
              </div>

              {/* Visualization Type */}
              <div>
                <label className="block text-[var(--cds-text-01)] font-bold mb-2">
                  {isAr ? 'نوع الرسم البياني والتمثيل' : 'Visualization Type'}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { type: 'bar' as WidgetType, labelAr: 'أعمدة بيانية', labelEn: 'Bar Chart', icon: BarChart3 },
                    { type: 'line' as WidgetType, labelAr: 'مسار خطي', labelEn: 'Line Trend', icon: LineIcon },
                    { type: 'area' as WidgetType, labelAr: 'مساحة بيانية', labelEn: 'Area Chart', icon: AreaIcon },
                    { type: 'pie' as WidgetType, labelAr: 'توزيع دائري', labelEn: 'Pie Chart', icon: PieIcon },
                    { type: 'scatter' as WidgetType, labelAr: 'مخطط مبعثر', labelEn: 'Scatter Plot', icon: ScatterIcon },
                    { type: 'radar' as WidgetType, labelAr: 'مخطط راداري', labelEn: 'Radar Chart', icon: Activity },
                    { type: 'kpi' as WidgetType, labelAr: 'مؤشر رقمي (KPI)', labelEn: 'KPI Stat Card', icon: TrendingUp },
                    { type: 'heatmap' as WidgetType, labelAr: 'خريطة حرارية', labelEn: 'Heatmap', icon: LayoutGrid },
                    { type: 'timeseries' as WidgetType, labelAr: 'متجهات زمنية', labelEn: 'Time-Series', icon: Activity },
                    { type: 'geo' as WidgetType, labelAr: 'خريطة جغرافية', labelEn: 'Geo Map', icon: Globe2 },
                  ].map(item => {
                    const Icon = item.icon;
                    const isSelected = widgetType === item.type;
                    return (
                      <button
                        key={item.type}
                        type="button"
                        onClick={() => setWidgetType(item.type)}
                        className={`p-2.5 flex flex-col items-center justify-center gap-1.5 border text-center transition-all ${
                          isSelected
                            ? 'bg-[#0f62fe]/20 border-[#0f62fe] text-white font-bold shadow-md'
                            : 'bg-[var(--cds-layer-01)] border-[var(--cds-border-subtle)] text-[var(--cds-text-02)] hover:border-[var(--cds-border-strong)] hover:text-white'
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${isSelected ? 'text-[#0f62fe]' : 'text-[var(--cds-text-03)]'}`} />
                        <span className="text-[11px]">{isAr ? item.labelAr : item.labelEn}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* If KPI Type is selected */}
              {widgetType === 'kpi' ? (
                <div className="space-y-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-4">
                  <div className="flex items-center gap-4 border-b border-[var(--cds-border-subtle)] pb-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[var(--cds-text-01)]">
                      <input
                        type="radio"
                        name="kpiMode"
                        checked={kpiMode === 'auto'}
                        onChange={() => setKpiMode('auto')}
                        className="accent-[#0f62fe]"
                      />
                      <span>{isAr ? 'حساب رياضي وإحصائي آلي من البيانات' : 'Auto Compute from Dataset'}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[var(--cds-text-01)]">
                      <input
                        type="radio"
                        name="kpiMode"
                        checked={kpiMode === 'manual'}
                        onChange={() => setKpiMode('manual')}
                        className="accent-[#0f62fe]"
                      />
                      <span>{isAr ? 'إدخال قيمة مخصصة يدوياً' : 'Manual Metric Value'}</span>
                    </label>
                  </div>

                  {kpiMode === 'auto' ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[var(--cds-text-02)] mb-1 font-bold">
                            {isAr ? 'عمود المقياس الرقمي' : 'Metric Column'}
                          </label>
                          <select
                            value={kpiMetricColumn}
                            onChange={e => setKpiMetricColumn(e.target.value)}
                            className="carbon-input w-full"
                          >
                            {currentTargetDataset?.columns?.map(c => (
                              <option key={c.name} value={c.name}>
                                [{c.type}] {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[var(--cds-text-02)] mb-1 font-bold">
                            {isAr ? 'الدالة الرياضية والإحصائية' : 'Statistical Function'}
                          </label>
                          <select
                            value={kpiMetricAgg}
                            onChange={e => setKpiMetricAgg(e.target.value as AggregationFunction)}
                            className="carbon-input w-full"
                          >
                            <optgroup label={isAr ? 'مقاييس النزعة المركزية' : 'Central Tendency'}>
                              {AGGREGATION_OPTIONS.filter(o => o.category === 'central').map(opt => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.symbol} {isAr ? opt.labelAr : opt.labelEn}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label={isAr ? 'مقاييس التشتت والتباين' : 'Dispersion & Spread'}>
                              {AGGREGATION_OPTIONS.filter(o => o.category === 'dispersion').map(opt => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.symbol} {isAr ? opt.labelAr : opt.labelEn}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label={isAr ? 'المقاييس المئوية والاحتمالية' : 'Percentiles & Quartiles'}>
                              {AGGREGATION_OPTIONS.filter(o => o.category === 'percentile').map(opt => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.symbol} {isAr ? opt.labelAr : opt.labelEn}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label={isAr ? 'الإجماليات والتكرارات' : 'Totals & Aggregates'}>
                              {AGGREGATION_OPTIONS.filter(o => o.category === 'aggregate').map(opt => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.symbol} {isAr ? opt.labelAr : opt.labelEn}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[var(--cds-text-02)] mb-1">{isAr ? 'بادئة (Prefix)' : 'Prefix'}</label>
                          <input
                            type="text"
                            value={kpiPrefix}
                            onChange={e => setKpiPrefix(e.target.value)}
                            placeholder="$ or SAR"
                            className="carbon-input w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-[var(--cds-text-02)] mb-1">{isAr ? 'لاحقة (Suffix)' : 'Suffix'}</label>
                          <input
                            type="text"
                            value={kpiSuffix}
                            onChange={e => setKpiSuffix(e.target.value)}
                            placeholder="e.g. units or %"
                            className="carbon-input w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-[var(--cds-text-02)] mb-1">{isAr ? 'تسمية الوصف' : 'Description Label'}</label>
                          <input
                            type="text"
                            value={kpiLabel}
                            onChange={e => setKpiLabel(e.target.value)}
                            placeholder="e.g. Total Revenue"
                            className="carbon-input w-full"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[var(--cds-text-02)] mb-1 font-bold">
                          {isAr ? 'القيمة المعروضة (KPI Value)' : 'Display Value'}
                        </label>
                        <input
                          type="text"
                          value={kpiManualValue}
                          onChange={e => setKpiManualValue(e.target.value)}
                          placeholder="$45,200 or 98.5%"
                          className="carbon-input w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-[var(--cds-text-02)] mb-1 font-bold">
                          {isAr ? 'الوصف التوضيحي (Label)' : 'Metric Label'}
                        </label>
                        <input
                          type="text"
                          value={kpiLabel}
                          onChange={e => setKpiLabel(e.target.value)}
                          placeholder="Gross Sales Volume"
                          className="carbon-input w-full"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Standard Chart Axes & Mathematical Aggregation Configuration */
                <div className="space-y-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-4">
                  {/* Axes Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Dimension / X-Axis */}
                    <div>
                      <label className="block text-[var(--cds-text-01)] font-bold mb-1.5 flex items-center justify-between">
                        <span>{isAr ? 'المحور الأفقي / التصنيف (X-Axis)' : 'Dimension / Category (X-Axis)'}</span>
                        <span className="text-[10px] text-[#0f62fe] font-normal font-mono">Category / Time</span>
                      </label>
                      <select
                        value={widgetXAxis}
                        onChange={e => handleAxisChange('x', e.target.value)}
                        className="carbon-input w-full text-xs font-mono"
                      >
                        {currentTargetDataset?.columns?.map(c => (
                          <option key={c.name} value={c.name}>
                            [{c.type}] {c.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-[var(--cds-text-03)] mt-1">
                        {isAr ? 'يحدد الأعمدة التجميعية (مثل: المدينة، التصنيف، التاريخ)' : 'Grouping dimension column'}
                      </p>
                      {widgetType === 'geo' && (
                        <div className="mt-2 space-y-2 border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] p-2.5">
                          <div>
                            <label className="block text-[var(--cds-text-01)] font-bold mb-1 text-[11px] flex items-center gap-1">
                              <Globe2 className="w-3.5 h-3.5 text-[#33b1ff]" />
                              {isAr ? 'عمود الموقع الجغرافي (الدول/المناطق أو خط العرض)' : 'Geographic location column (countries or latitude)'}
                            </label>
                            <select
                              value={geoLocationColumn}
                              onChange={e => setGeoLocationColumn(e.target.value)}
                              className="carbon-input w-full text-xs font-mono"
                            >
                              <option value="">{isAr ? '— اختر العمود الجغرافي —' : '— pick location column —'}</option>
                              {currentTargetDataset?.columns?.map(c => (
                                <option key={c.name} value={c.name}>
                                  [{c.type}] {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[var(--cds-text-02)] font-bold mb-1 text-[11px]">
                              {isAr ? 'نمط الخريطة (نمط Folium)' : 'Map style (folium-like)'}
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => setGeoMode('choropleth')}
                                className={`p-2 border text-[11px] font-bold ${
                                  geoMode === 'choropleth'
                                    ? 'bg-[#0f62fe]/25 border-[#0f62fe] text-white'
                                    : 'bg-[var(--cds-layer-01)] border-[var(--cds-border-subtle)] text-[var(--cds-text-02)] hover:text-white'
                                }`}
                              >
                                {isAr ? 'تلوين المناطق (Choropleth)' : 'Colored regions (Choropleth)'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setGeoMode('markers')}
                                className={`p-2 border text-[11px] font-bold ${
                                  geoMode === 'markers'
                                    ? 'bg-[#0f62fe]/25 border-[#0f62fe] text-white'
                                    : 'bg-[var(--cds-layer-01)] border-[var(--cds-border-subtle)] text-[var(--cds-text-02)] hover:text-white'
                                }`}
                              >
                                {isAr ? 'نقاط خط العرض/الطول' : 'Lat/Lng markers'}
                              </button>
                            </div>
                          </div>
                          {geoMode === 'choropleth' && (
                            <div>
                              <label className="block text-[var(--cds-text-02)] font-bold mb-1 text-[11px]">
                                {isAr ? 'نطاق العرض الجغرافي' : 'Geographic scope'}
                              </label>
                              <select
                                value={mapScope}
                                onChange={e => setMapScope(e.target.value as typeof mapScope)}
                                className="carbon-input w-full text-xs"
                              >
                                <option value="world">{isAr ? 'العالم كامل' : 'Whole world'}</option>
                                <option value="middleEast">{isAr ? 'الشرق الأوسط' : 'Middle East'}</option>
                                <option value="europe">{isAr ? 'أوروبا' : 'Europe'}</option>
                                <option value="africa">{isAr ? 'أفريقيا' : 'Africa'}</option>
                                <option value="asia">{isAr ? 'آسيا' : 'Asia'}</option>
                                <option value="americas">{isAr ? 'الأمريكتان' : 'Americas'}</option>
                                <option value="country">{isAr ? 'دولة محددة (تكبير تفصيلي)' : 'Single country (drill-down)'}</option>
                              </select>
                            </div>
                          )}
                          {geoMode === 'choropleth' && mapScope === 'country' && (
                            <div>
                              <label className="block text-[var(--cds-text-02)] font-bold mb-1 text-[11px]">
                                {isAr ? 'الدولة المستهدفة' : 'Focused country'}
                              </label>
                              <select
                                value={focusCountry}
                                onChange={e => setFocusCountry(e.target.value)}
                                className="carbon-input w-full text-xs font-mono"
                              >
                                <option value="">{isAr ? '— اختر الدولة —' : '— pick country —'}</option>
                                {GEO_COUNTRY_CODES.map(code => (
                                  <option key={code.iso3} value={code.iso3}>
                                    {isAr ? code.labelAr : code.labelEn}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                          {geoMode === 'choropleth' && (
                            <div className="border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] p-2.5 space-y-2">
                              <div className="flex items-center justify-between">
                                <label className="flex items-center gap-1.5 text-[var(--cds-text-01)] font-bold text-[11px]">
                                  <FileJson className="w-3.5 h-3.5 text-[#33b1ff]" />
                                  {isAr ? 'حدود جغرافية مخصصة (GeoJSON)' : 'Custom GeoJSON boundaries'}
                                </label>
                                {geoJsonData && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setGeoJsonData('');
                                      setGeoJsonName('');
                                      setGeoJsonFeatureProperty('');
                                      setGeoJsonPropertyOptions([]);
                                    }}
                                    className="text-[10px] font-mono text-[#ff8389] hover:underline flex items-center gap-1"
                                  >
                                    <TrashIcon className="w-3 h-3" />
                                    {isAr ? 'إزالة' : 'Remove'}
                                  </button>
                                )}
                              </div>
                              <p className="text-[10px] text-[var(--cds-text-03)] leading-4">
                                {isAr
                                  ? 'ارفع ملف GeoJSON يدعم محافظات أو مدن الدولة (FeatureCollection) لرسم مناطق فرعية على الخريطة بدل الدول الافتراضية.'
                                  : 'Upload a FeatureCollection GeoJSON of governorates/cities to draw sub-regions on the map instead of built-in countries.'}
                              </p>
                              {!geoJsonData ? (
                                <label className="flex items-center justify-center gap-2 py-3 border border-dashed border-[var(--cds-border-strong)] cursor-pointer hover:border-[#0f62fe] transition-colors text-[11px] font-mono text-[var(--cds-text-02)] hover:text-white">
                                  <FileUp className="w-4 h-4 text-[#0f62fe]" />
                                  <span>{isAr ? 'اختر ملف ‎.geojson / ‏.json' : 'Pick a .geojson / .json file'}</span>
                                  <input
                                    type="file"
                                    accept=".geojson,.json,application/geo+json,application/json"
                                    className="hidden"
                                    onChange={e => {
                                      const file = e.target.files?.[0];
                                      if (!file) return;
                                      const reader = new FileReader();
                                      reader.onload = () => {
                                        const text = String(reader.result || '');
                                        const probe = parseGeoJsonSource({ name: file.name, data: text, featureProperty: '', uploadedAt: '' });
                                        if (!probe || probe.error || probe.candidateProperties.length === 0) {
                                          toast.error(
                                            isAr ? 'ملف GeoJSON غير صالح' : 'Invalid GeoJSON',
                                            isAr ? 'جرب ملف GeoJSON بصيغة FeatureCollection.' : 'Expected a FeatureCollection GeoJSON file.'
                                          );
                                          return;
                                        }
                                        setGeoJsonData(text);
                                        setGeoJsonName(file.name);
                                        setGeoJsonPropertyOptions(probe.candidateProperties);
                                        const guess = probe.candidateProperties.find(k => /name|governorate|city|admin|region|wilaya|محافظة|مدينة|اسم|دولة|منطقة/i.test(k)) || probe.candidateProperties[0];
                                        setGeoJsonFeatureProperty(guess);
                                        toast.success(
                                          isAr ? 'تم رفع الملف' : 'GeoJSON Loaded',
                                          isAr
                                            ? `تم تحميل ${probe.features.length} منطقة من "${file.name}" — حدد خاصية الاسم المطابقة لعمود الموقع.`
                                            : `Loaded ${probe.features.length} features from "${file.name}" — pick the name property matching your location column.`
                                        );
                                      };
                                      reader.readAsText(file);
                                      e.target.value = '';
                                    }}
                                  />
                                </label>
                              ) : (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between text-[10px] font-mono bg-[var(--cds-layer-02)] border border-[#24a148]/40 px-2 py-1.5">
                                    <span className="flex items-center gap-1.5 text-[#42be65] font-bold truncate">
                                      <FileJson className="w-3 h-3 shrink-0" />
                                      {geoJsonName}
                                    </span>
                                    <span className="text-[var(--cds-text-03)]">{geoJsonPropertyOptions.length} props</span>
                                  </div>
                                  <div>
                                    <label className="block text-[var(--cds-text-02)] font-bold mb-1 text-[10px]">
                                      {isAr ? 'خاصية الاسم داخل GeoJSON (تطابق عمود الموقع)' : 'Name property in GeoJSON (matches location column)'}
                                    </label>
                                    <select
                                      value={geoJsonFeatureProperty}
                                      onChange={e => setGeoJsonFeatureProperty(e.target.value)}
                                      className="carbon-input w-full text-xs font-mono"
                                    >
                                      {geoJsonPropertyOptions.map(k => (
                                        <option key={k} value={k}>{k}</option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          <p className="text-[10px] text-[var(--cds-text-03)] leading-4">
                            {isAr
                              ? 'اعرض المناطق ذات أعلى مبيعات على الخريطة: اختر عمود الدولة، وعمود المقياس مثل (المبيعات)، وستُلوّن المناطق الأعلى قيمة بالأزرق والأقل بالأصفر.'
                              : 'Show top-sales regions on a geographic map: pick the country column and a metric like sales; higher values draw blue, lower yellow.'}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Metric / Y-Axis */}
                    <div>
                      <label className="block text-[var(--cds-text-01)] font-bold mb-1.5 flex items-center justify-between">
                        <span>{isAr ? 'المحور الرأسي / المقياس الرقمي (Y-Axis)' : 'Metric / Measure (Y-Axis)'}</span>
                        <span className="text-[10px] text-[#33b1ff] font-normal font-mono">Numeric Metric</span>
                      </label>
                      <select
                        value={widgetYAxis}
                        onChange={e => handleAxisChange('y', e.target.value)}
                        className="carbon-input w-full text-xs font-mono"
                      >
                        {currentTargetDataset?.columns?.map(c => (
                          <option key={c.name} value={c.name}>
                            [{c.type}] {c.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-[var(--cds-text-03)] mt-1">
                        {isAr ? 'يحدد العمود الرقمي المراد حسابه وتجميعه' : 'Numeric value column to aggregate'}
                      </p>
                    </div>
                  </div>

                  {/* Mathematical / Statistical Function Selection Section */}
                  <div className="border-t border-[var(--cds-border-subtle)] pt-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <label className="block text-[var(--cds-text-01)] font-bold flex items-center gap-1.5">
                        <Calculator className="w-4 h-4 text-[#33b1ff]" />
                        <span>{isAr ? 'الدالة الرياضية والإحصائية للتجميع (Mathematical Function Dropdown)' : 'Mathematical & Statistical Function'}</span>
                      </label>

                      {/* Live Calculation Indicator Badge */}
                      <div className="flex items-center gap-2">
                        {isCalculatingAgg ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-[#0f62fe]/20 text-[#33b1ff] border border-[#0f62fe] text-[10px] font-mono animate-pulse font-bold">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            {isAr ? 'جارِ معالجة الحساب الرياضي...' : 'Computing statistics...'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#24a148]/15 text-[#42be65] border border-[#24a148]/40 text-[10px] font-mono font-bold">
                            <Check className="w-3 h-3" />
                            {isAr ? `تم الحساب (${calculationTimeMs}ms)` : `Computed (${calculationTimeMs}ms)`}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Dedicated Dropdown (Select Control) as explicitly requested */}
                    <div className="bg-[var(--cds-layer-02)] p-3 border border-[var(--cds-border-subtle)] space-y-2">
                      <div className="flex items-center gap-2">
                        <Sigma className="w-4 h-4 text-[#33b1ff] shrink-0" />
                        <span className="text-xs font-bold text-[#ffffff]">
                          {isAr ? 'القائمة المنسدلة لاختيار الدالة الحسابية / الإحصائية / الاحتمالية:' : 'Statistical / Probabilistic Function Selector:'}
                        </span>
                      </div>

                      <select
                        value={widgetAggregation}
                        onChange={e => handleAggregationChange(e.target.value as AggregationFunction)}
                        className="carbon-input w-full text-xs font-mono font-bold text-[#33b1ff] bg-[var(--cds-layer-01)] border-[var(--cds-border-strong)] focus:border-[#0f62fe] py-2 cursor-pointer"
                        id="math-function-select"
                      >
                        <optgroup label={isAr ? '── مقاييس النزعة المركزية (Central Tendency) ──' : '── Central Tendency Measures ──'}>
                          {AGGREGATION_OPTIONS.filter(o => o.category === 'central').map(opt => (
                            <option key={opt.value} value={opt.value} className="bg-[var(--cds-layer-02)] text-white">
                              {opt.symbol} {isAr ? opt.labelAr : opt.labelEn} — ({isAr ? opt.descAr : opt.descEn})
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label={isAr ? '── مقاييس التشتت والتباين (Dispersion & Spread) ──' : '── Measures of Dispersion ──'}>
                          {AGGREGATION_OPTIONS.filter(o => o.category === 'dispersion').map(opt => (
                            <option key={opt.value} value={opt.value} className="bg-[var(--cds-layer-02)] text-white">
                              {opt.symbol} {isAr ? opt.labelAr : opt.labelEn} — ({isAr ? opt.descAr : opt.descEn})
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label={isAr ? '── المقاييس المئوية والاحتمالية والربيعيات (Percentiles & Quartiles) ──' : '── Percentiles & Probabilistic ──'}>
                          {AGGREGATION_OPTIONS.filter(o => o.category === 'percentile').map(opt => (
                            <option key={opt.value} value={opt.value} className="bg-[var(--cds-layer-02)] text-white">
                              {opt.symbol} {isAr ? opt.labelAr : opt.labelEn} — ({isAr ? opt.descAr : opt.descEn})
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label={isAr ? '── الإجماليات والتكرارات العامة (Totals & Counts) ──' : '── Totals & Aggregates ──'}>
                          {AGGREGATION_OPTIONS.filter(o => o.category === 'aggregate').map(opt => (
                            <option key={opt.value} value={opt.value} className="bg-[var(--cds-layer-02)] text-white">
                              {opt.symbol} {isAr ? opt.labelAr : opt.labelEn} — ({isAr ? opt.descAr : opt.descEn})
                            </option>
                          ))}
                        </optgroup>
                      </select>

                      <div className="flex items-center justify-between text-[11px] text-[var(--cds-text-02)] pt-1">
                        <span>{isAr ? selectedAggOption.descAr : selectedAggOption.descEn}</span>
                        <span className="font-mono text-[#33b1ff] font-bold">
                          {isAr ? 'رمز الدالة:' : 'Symbol:'} {selectedAggOption.symbol}
                        </span>
                      </div>
                    </div>

                    {/* Quick Selection Tags Grid categorized for high ergonomics */}
                    <div className="space-y-2 pt-1">
                      <div className="text-[10px] text-[var(--cds-text-03)] uppercase font-bold flex items-center justify-between">
                        <span>{isAr ? 'أو اختر سريعاً بالنقر المباشر على بطاقات الدوال:' : 'Or quick select via function cards:'}</span>
                        <span className="text-[#33b1ff]">{AGGREGATION_OPTIONS.length} {isAr ? 'دالة متاحة' : 'functions available'}</span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1.5 max-h-[160px] overflow-y-auto p-1 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)]">
                        {AGGREGATION_OPTIONS.map(opt => {
                          const isSelected = widgetAggregation === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => handleAggregationChange(opt.value)}
                              className={`p-1.5 border text-start flex flex-col justify-between transition-all text-[10px] ${
                                isSelected
                                  ? 'bg-[#0f62fe]/25 border-[#0f62fe] text-white shadow-sm font-bold'
                                  : 'bg-[var(--cds-layer-02)] border-[var(--cds-border-subtle)] text-[var(--cds-text-02)] hover:border-[var(--cds-border-strong)] hover:text-white'
                              }`}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span className={`font-mono px-1 py-0.2 text-[9px] ${isSelected ? 'bg-[#0f62fe] text-white' : 'bg-[var(--cds-layer-01)] text-[#33b1ff]'}`}>
                                  {opt.symbol}
                                </span>
                                {isSelected && <Check className="w-3 h-3 text-[#0f62fe]" />}
                              </div>
                              <span className="font-bold truncate mt-1 text-[var(--cds-text-01)]">
                                {isAr ? opt.labelAr.split('(')[0] : opt.labelEn.split('(')[0]}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Mathematical Calculation Formula Preview Banner with Live Loading State */}
                  <div className={`p-3 border transition-colors flex items-center gap-3 relative ${
                    isCalculatingAgg
                      ? 'bg-[#0f62fe]/10 border-[#0f62fe]'
                      : 'bg-[var(--cds-layer-02)] border-[var(--cds-border-strong)]'
                  }`}>
                    {isCalculatingAgg ? (
                      <div className="w-8 h-8 bg-[#0f62fe] text-white flex items-center justify-center shrink-0">
                        <Loader2 className="w-4 h-4 animate-spin" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 bg-[#0f62fe]/20 border border-[#0f62fe] flex items-center justify-center text-[#0f62fe] font-mono font-bold shrink-0">
                        {selectedAggOption.symbol}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] text-[var(--cds-text-03)] uppercase font-bold tracking-wider flex items-center justify-between">
                        <span>{isAr ? 'معاينة صيغة الحساب الفعلي والنتيجة اللحظية' : 'Formula Preview & Live Calculated Value'}</span>
                        <span className="text-[#42be65] font-mono font-bold">
                          {isAr ? 'عينة محسوبة:' : 'Sample Value:'} {computedSampleAgg.toLocaleString()}
                        </span>
                      </div>
                      <div className="text-xs font-bold text-[#33b1ff] font-mono truncate mt-0.5">
                        {isAr ? computedFormulaTextAr : computedFormulaText}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-[var(--cds-border-subtle)]">
              <button
                onClick={() => setShowModal(false)}
                className="carbon-btn-secondary text-xs uppercase"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={handleSaveWidget}
                disabled={isCalculatingAgg}
                className="carbon-btn-primary text-xs uppercase font-mono font-bold gap-2 shadow-lg disabled:opacity-50"
              >
                {isCalculatingAgg ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{isAr ? 'جارِ المعالجة...' : 'Processing...'}</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{editingWidgetId ? (isAr ? 'تحديث العنصر' : 'Update Widget') : (isAr ? 'حفظ وإدراج العنصر' : 'Save & Insert Widget')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Local Zero-Upload CSV Ingestion Modal */}
      <LocalCsvImportModal
        isOpen={showCsvModal}
        onClose={() => setShowCsvModal(false)}
      />

      {/* Centralized Export Options Modal */}
      <ExportModal
        isOpen={showCentralizedExportModal}
        onClose={() => setShowCentralizedExportModal(false)}
        title={activeDashboard ? (isAr ? `تصدير لوحة القيادة: ${activeDashboard.nameAr || activeDashboard.name || 'اللوحة'}` : `Export Dashboard: ${activeDashboard.name || 'dashboard'}`) : undefined}
        data={activeDataset?.data || datasets[0]?.data || []}
        defaultFilename={activeDashboard?.name ? activeDashboard.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_') : 'dashboard_report'}
        language={language}
      />

      {/* Data Cinema — Cinematic Story Mode Reel */}
      <AnimatePresence>
        {showCinemaMode && activeDashboard && (
          <DataCinemaMode
            isOpen={showCinemaMode}
            onClose={() => setShowCinemaMode(false)}
            widgets={activeDashboard.widgets}
            datasets={datasets}
            activeTheme={selectedTheme}
          />
        )}
      </AnimatePresence>

      {/* Share Widget Snapshot to Group Discussion */}
      <ShareToGroupModal
        isOpen={shareModalOpen}
        source="dashboard"
        onClose={() => setShareModalOpen(false)}
        imageDataUrl={shareImageData}
        widgetName={shareWidgetName}
      />
    </div>
  );
};
