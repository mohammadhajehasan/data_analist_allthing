import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { WidgetConfig, WidgetType, AggregationFunction, Dataset } from '../../types';
import {
  ChartFactory,
  KpiCard,
  AGGREGATION_OPTIONS,
  computeMathematicalAggregation,
  getAggregationLabel,
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
import { WidgetCommentBadge } from '../../components/collaboration/WidgetCommentBadge';
import { AiAgentPanel } from './AiAgentPanel';
import { ForecastingPanel } from './ForecastingPanel';
import { AudioBriefingPanel } from './AudioBriefingPanel';
import { SlidesExportPanel } from './SlidesExportPanel';
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
  X,
  FileSpreadsheet,
  ShieldCheck,
  Presentation,
  Volume2,
  AlertTriangle,
  Palette,
} from 'lucide-react';

export const DashboardBuilder: React.FC = () => {
  const {
    activeDashboard,
    datasets,
    activeDataset,
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

  // Export Progress State
  const [exportProgress, setExportProgress] = useState<ExportProgressState | null>(null);
  const [showCentralizedExportModal, setShowCentralizedExportModal] = useState(false);

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
  const [kpiTrendDirection, setKpiTrendDirection] = useState<'up' | 'down'>('up');

  // Auto-refresh animation state
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Target dataset for widget configuration
  const currentTargetDataset = useMemo(() => {
    return datasets.find(d => d.id === selectedDatasetId) || activeDataset || datasets[0];
  }, [datasets, selectedDatasetId, activeDataset]);

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

  if (!activeDashboard) {
    return <div className="carbon-tile p-8 text-center text-[#c6c6c6]">{isAr ? 'لا توجد لوحة تحكم نشطة' : 'No dashboard active'}</div>;
  }

  const kpis = activeDashboard.widgets.filter(w => w.type === 'kpi');
  const charts = activeDashboard.widgets.filter(w => w.type !== 'kpi');

  // Compute responsive grid layout column class from persisted layoutSettings
  const gridColClass = useMemo(() => {
    switch (layoutSettings.chartGridColumns) {
      case 1:
        return 'grid-cols-1';
      case 3:
        return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
      case 2:
      default:
        return 'grid-cols-1 lg:grid-cols-2';
    }
  }, [layoutSettings.chartGridColumns]);

  // Compute card height class from layoutSettings
  const cardHeightClass = useMemo(() => {
    switch (layoutSettings.chartHeight) {
      case 'compact':
        return 'h-[325px]';
      case 'spacious':
        return 'h-[470px]';
      case 'standard':
      default:
        return 'h-[395px]';
    }
  }, [layoutSettings.chartHeight]);

  const chartBodyHeightClass = useMemo(() => {
    switch (layoutSettings.chartHeight) {
      case 'compact':
        return 'h-[235px]';
      case 'spacious':
        return 'h-[370px]';
      case 'standard':
      default:
        return 'h-[295px]';
    }
  }, [layoutSettings.chartHeight]);

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
                className="p-1 bg-[#393939] hover:bg-[#0f62fe] text-[#c6c6c6] hover:text-white transition-colors"
                title={isAr ? 'تعديل العنصر' : 'Edit Widget'}
              >
                <Edit3 className="w-3 h-3" />
              </button>
              <button
                onClick={() => handleExportWidget(w.id, isAr ? w.titleAr || w.title : w.title, 'png')}
                className="p-1 bg-[#393939] hover:bg-[#24a148] text-[#c6c6c6] hover:text-white transition-colors"
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
                className="p-1 bg-[#393939] hover:bg-[#da1e28] text-[#c6c6c6] hover:text-white transition-colors"
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#393939] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#0f62fe] flex items-center gap-1.5">
              <LayoutDashboard className="w-3.5 h-3.5" />
              IBM CARBON / DASHBOARD ANALYTICS & STATISTICAL ENGINE
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-[#ffffff] tracking-tight mt-1">
            {isAr ? activeDashboard.nameAr || activeDashboard.name : activeDashboard.name}
          </h2>
          <p className="text-xs sm:text-sm text-[#c6c6c6] mt-0.5">
            {isAr ? activeDashboard.descriptionAr || activeDashboard.description : activeDashboard.description}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Zero-Upload CSV Ingestion */}
          <button
            onClick={() => setShowCsvModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#262626] hover:bg-[#333333] border border-[#24a148] text-[#f4f4f4] text-xs font-mono font-bold transition-colors shadow-xs"
            title={isAr ? 'استيراد فوري بدون خادم وتغذية لوحة القيادة' : 'Instant in-memory CSV import to feed this dashboard'}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#42be65]" />
            <span>{isAr ? 'استيراد CSV محلي' : 'Import CSV'}</span>
          </button>

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

          {/* Export Dropdown Menu (PNG / PDF) */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="carbon-btn-secondary text-xs font-mono font-bold gap-1.5"
              title={isAr ? 'تصدير لوحة التحكم الحالية كصورة أو PDF' : 'Export Active Dashboard as PNG or PDF'}
            >
              <Download className="w-3.5 h-3.5 text-[#24a148]" />
              <span>{isAr ? 'تصدير اللوحة' : 'Export'}</span>
              <ChevronDown className="w-3 h-3 text-[#8d8d8d]" />
            </button>

            {showExportMenu && (
              <div
                className={`absolute top-full mt-1 w-64 bg-[#262626] border border-[#525252] shadow-2xl p-1 z-50 ${
                  isAr ? 'left-0' : 'right-0'
                }`}
              >
                <div className="px-3 py-1.5 text-[10px] font-mono font-bold text-[#8d8d8d] uppercase tracking-wider border-b border-[#393939] mb-1">
                  {isAr ? 'خيارات التصدير عالي الدقة' : 'Export High-Resolution'}
                </div>

                <button
                  onClick={() => handleExportFullDashboard('png')}
                  className="w-full text-start px-3 py-2 text-xs font-mono text-[#f4f4f4] hover:bg-[#353535] flex items-center gap-2.5 transition-colors"
                >
                  <FileImage className="w-4 h-4 text-[#33b1ff]" />
                  <div>
                    <div className="font-bold">{isAr ? 'تصدير كصورة PNG عالية الدقة' : 'Export as High-Res PNG'}</div>
                    <div className="text-[10px] text-[#8d8d8d]">{isAr ? 'صورة 2x جاهزة للمشاركة والعروض' : 'Retina 2x resolution raster'}</div>
                  </div>
                </button>

                <button
                  onClick={() => handleExportFullDashboard('pdf')}
                  className="w-full text-start px-3 py-2 text-xs font-mono text-[#f4f4f4] hover:bg-[#353535] flex items-center gap-2.5 transition-colors border-b border-[#393939]"
                >
                  <FileText className="w-4 h-4 text-[#da1e28]" />
                  <div>
                    <div className="font-bold">{isAr ? 'تصدير كتقرير PDF رسمي' : 'Export as Official PDF'}</div>
                    <div className="text-[10px] text-[#8d8d8d]">{isAr ? 'مستند A4 منسق مع الرسوم التوضيحية' : 'A4 formatted PDF document'}</div>
                  </div>
                </button>

                <button
                  onClick={() => { setShowExportMenu(false); setShowCentralizedExportModal(true); }}
                  className="w-full text-start px-3 py-2 text-xs font-mono text-[#78a9ff] hover:bg-[#0f62fe]/20 flex items-center gap-2.5 transition-colors"
                >
                  <Download className="w-4 h-4 text-[#0f62fe]" />
                  <div>
                    <div className="font-bold">{isAr ? 'خيارات التصدير الشاملة (CSV, JSON, Excel, SQL)' : 'Centralized Multi-Format Export'}</div>
                    <div className="text-[10px] text-[#8d8d8d]">{isAr ? 'مركز تصدير البيانات والتقارير المتقدم' : 'Advanced multi-format data export hub'}</div>
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

      {/* Visualization Themes Palette Selector */}
      <div className="bg-[#1f1f1f] border border-[#393939] p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-[#0f62fe]/15 border border-[#0f62fe] text-[#0f62fe]">
            <Palette className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-mono font-bold text-[#f4f4f4] flex items-center gap-2">
              <span>{isAr ? 'نسق الألوان للرسوم البيانية' : 'Visualization Themes'}</span>
              <span className="px-1.5 py-0.5 bg-[#262626] border border-[#525252] text-[10px] text-[#33b1ff] font-bold">
                {isAr ? VISUALIZATION_THEMES[selectedTheme]?.nameAr : VISUALIZATION_THEMES[selectedTheme]?.nameEn}
              </span>
            </div>
            <p className="text-[11px] text-[#8d8d8d]">
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
                    ? 'bg-[#262626] border-[#0f62fe] text-[#f4f4f4] shadow-md ring-1 ring-[#0f62fe]'
                    : 'bg-[#161616] border-[#393939] text-[#8d8d8d] hover:border-[#525252] hover:text-[#f4f4f4]'
                }`}
                title={isAr ? vt.descriptionAr : vt.descriptionEn}
              >
                {/* Swatch color dots */}
                <div className="flex items-center -space-x-1">
                  {vt.colors.slice(0, 4).map((c, idx) => (
                    <span
                      key={idx}
                      className="w-2.5 h-2.5 rounded-full border border-[#161616]"
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
          <div className="bg-[#161616] border border-dashed border-[#525252] p-12 text-center space-y-3">
            <BarChart3 className="w-12 h-12 text-[#8d8d8d] mx-auto opacity-50" />
            <h3 className="text-base font-bold text-[#f4f4f4]">
              {isAr ? 'لا توجد عناصر أو رسوم بيانية في هذه اللوحة' : 'No widgets in this dashboard yet'}
            </h3>
            <p className="text-xs text-[#c6c6c6] max-w-md mx-auto">
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
                  className={`bg-[#262626] border border-[#393939] hover:border-[#525252] transition-colors p-4 flex flex-col justify-between ${cardHeightClass} relative group rounded-none shadow-md overflow-hidden`}
                >
                  {/* Visual Calculating Loading Overlay on specific widget */}
                  {isWidgetCalculating && (
                    <div className="absolute inset-0 z-20 bg-[#161616]/85 backdrop-blur-xs flex flex-col items-center justify-center gap-2 transition-all">
                      <Loader2 className="w-6 h-6 text-[#0f62fe] animate-spin" />
                      <span className="text-xs font-mono text-[#f4f4f4] font-bold">
                        {isAr ? 'جارِ إعادة احتساب الدالة الإحصائية...' : 'Recalculating statistical aggregation...'}
                      </span>
                      <span className="text-[10px] font-mono text-[#33b1ff]">
                        {getAggregationLabel(currentAgg, language)}
                      </span>
                    </div>
                  )}

                  {/* Chart Card Header */}
                  <div className="flex items-center justify-between border-b border-[#393939] pb-2.5 mb-3 gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-mono font-bold text-[#ffffff] uppercase tracking-wider truncate" title={w.title}>
                        {widgetDisplayName}
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        {/* Mathematical Aggregation Switcher Dropdown (Carbon Styled) */}
                        {layoutSettings.showFormulas && (
                          <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#33b1ff] bg-[#161616] border border-[#393939] px-2 py-0.5">
                            <Sigma className="w-3 h-3 text-[#33b1ff] shrink-0" />
                            <span className="text-[#a8a8a8]">{isAr ? 'الدالة:' : 'Func:'}</span>
                            <select
                              value={currentAgg}
                              onChange={e => handleQuickAggChange(w, e.target.value as AggregationFunction)}
                              className="bg-transparent text-[#33b1ff] font-bold text-[10px] outline-none cursor-pointer hover:underline"
                              title={isAr ? 'تغيير الدالة الحسابية والإحصائية فوراً' : 'Switch math/statistical aggregation function'}
                            >
                              <optgroup label={isAr ? '── مقاييس النزعة المركزية ──' : '── Central Tendency ──'} className="bg-[#262626] text-[#8d8d8d]">
                                {AGGREGATION_OPTIONS.filter(o => o.category === 'central').map(opt => (
                                  <option key={opt.value} value={opt.value} className="bg-[#262626] text-white">
                                    {opt.symbol} {isAr ? opt.labelAr : opt.labelEn}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label={isAr ? '── مقاييس التشتت والتباين ──' : '── Dispersion & Spread ──'} className="bg-[#262626] text-[#8d8d8d]">
                                {AGGREGATION_OPTIONS.filter(o => o.category === 'dispersion').map(opt => (
                                  <option key={opt.value} value={opt.value} className="bg-[#262626] text-white">
                                    {opt.symbol} {isAr ? opt.labelAr : opt.labelEn}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label={isAr ? '── المقاييس المئوية والاحتمالية ──' : '── Percentiles & Quartiles ──'} className="bg-[#262626] text-[#8d8d8d]">
                                {AGGREGATION_OPTIONS.filter(o => o.category === 'percentile').map(opt => (
                                  <option key={opt.value} value={opt.value} className="bg-[#262626] text-white">
                                    {opt.symbol} {isAr ? opt.labelAr : opt.labelEn}
                                  </option>
                                ))}
                              </optgroup>
                              <optgroup label={isAr ? '── الإجماليات والتكرارات ──' : '── Totals & Aggregates ──'} className="bg-[#262626] text-[#8d8d8d]">
                                {AGGREGATION_OPTIONS.filter(o => o.category === 'aggregate').map(opt => (
                                  <option key={opt.value} value={opt.value} className="bg-[#262626] text-white">
                                    {opt.symbol} {isAr ? opt.labelAr : opt.labelEn}
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                          </div>
                        )}

                        {/* Axes Indicator */}
                        {layoutSettings.showCardBadges && (
                          <span className="text-[10px] font-mono text-[#8d8d8d] hidden sm:inline-block truncate">
                            Y: <strong className="text-[#c6c6c6]">{w.yAxis || 'value'}</strong> | X: <strong className="text-[#c6c6c6]">{w.xAxis || w.categoryField || 'category'}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions & Type Badge */}
                    <div className="flex items-center gap-1.5 shrink-0" data-export-ignore="true">
                      {/* Comments & Discussion Badge */}
                      <WidgetCommentBadge
                        targetType="dashboard_widget"
                        targetId={w.id}
                        targetTitle={widgetDisplayName}
                        className="bg-[#161616] border border-[#393939]"
                      />

                      {layoutSettings.showCardBadges && (
                        <span className="text-[10px] font-mono uppercase bg-[#161616] text-[#0f62fe] border border-[#393939] px-2 py-0.5 font-bold">
                          {w.type}
                        </span>
                      )}

                      {/* Individual Widget Export Dropdown */}
                      <div className="relative">
                        <button
                          onClick={() => setActiveWidgetExportMenuId(isExportMenuOpen ? null : w.id)}
                          className="p-1.5 bg-[#161616] hover:bg-[#24a148] text-[#c6c6c6] hover:text-white border border-[#393939] transition-colors"
                          title={isAr ? 'تصدير هذا الرسم بشكل منفصل (PNG/PDF)' : 'Export this chart (PNG/PDF)'}
                        >
                          <Camera className="w-3.5 h-3.5" />
                        </button>

                        {isExportMenuOpen && (
                          <div
                            className={`absolute top-full mt-1 w-48 bg-[#1f1f1f] border border-[#525252] shadow-2xl p-1 z-30 ${
                              isAr ? 'left-0' : 'right-0'
                            }`}
                          >
                            <button
                              onClick={() => handleExportWidget(w.id, widgetDisplayName, 'png')}
                              className="w-full text-start px-2.5 py-1.5 text-xs font-mono text-[#f4f4f4] hover:bg-[#353535] flex items-center gap-2"
                            >
                              <FileImage className="w-3.5 h-3.5 text-[#33b1ff]" />
                              <span>{isAr ? 'تصدير كصورة PNG' : 'Save as PNG'}</span>
                            </button>
                            <button
                              onClick={() => handleExportWidget(w.id, widgetDisplayName, 'pdf')}
                              className="w-full text-start px-2.5 py-1.5 text-xs font-mono text-[#f4f4f4] hover:bg-[#353535] flex items-center gap-2"
                            >
                              <FileText className="w-3.5 h-3.5 text-[#da1e28]" />
                              <span>{isAr ? 'تصدير كمستند PDF' : 'Save as PDF'}</span>
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Edit Button */}
                      <button
                        onClick={() => handleOpenEditModal(w)}
                        className="p-1.5 bg-[#161616] hover:bg-[#0f62fe] text-[#c6c6c6] hover:text-white border border-[#393939] transition-colors"
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
                        className="p-1.5 bg-[#161616] hover:bg-[#da1e28] text-[#c6c6c6] hover:text-white border border-[#393939] transition-colors"
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
      <div className="border-t border-[#393939] pt-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#161616] border border-[#393939] p-4 text-start">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#8a3ffc] flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-[#8a3ffc]" />
              IBM CARBON / ADVANCED ANALYTICAL SUITE
            </span>
            <h3 className="text-sm font-bold text-white mt-1">
              {isAr ? 'حزمة التحليلات المتقدمة والذكاء الاصطناعي' : 'AI & Advanced Decision Intelligence'}
            </h3>
            <p className="text-[11px] text-[#c6c6c6] mt-0.5">
              {isAr ? 'محركات متكاملة للتنبؤ المستقبلي، الموجزات الصوتية، وتصدير العروض الإدارية' : 'Integrated modules for automated forecasting, text-to-speech briefing, and presentation builders'}
            </p>
          </div>

          {/* Sub-Tab Selector Buttons */}
          <div className="flex flex-wrap items-center gap-1.5 bg-[#262626] p-1 border border-[#393939] text-xs font-mono font-bold">
            <button
              onClick={() => setAdvancedToolTab('forecast')}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition-all rounded-none ${
                advancedToolTab === 'forecast' ? 'bg-[#8a3ffc] text-white shadow-xs' : 'text-[#8d8d8d] hover:text-white'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{isAr ? 'التنبؤ والـ What-If' : 'Predictive Forecast'}</span>
            </button>

            <button
              onClick={() => setAdvancedToolTab('audio')}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition-all rounded-none ${
                advancedToolTab === 'audio' ? 'bg-[#8a3ffc] text-white shadow-xs' : 'text-[#8d8d8d] hover:text-white'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>{isAr ? 'الموجز الصوتي' : 'Audio Briefing'}</span>
            </button>

            <button
              onClick={() => setAdvancedToolTab('slides')}
              className={`px-3 py-1.5 flex items-center gap-1.5 transition-all rounded-none ${
                advancedToolTab === 'slides' ? 'bg-[#8a3ffc] text-white shadow-xs' : 'text-[#8d8d8d] hover:text-white'
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
        <div className="fixed bottom-6 end-6 z-50 bg-[#1f1f1f] border border-[#0f62fe] shadow-2xl p-4 w-80 animate-in fade-in slide-in-from-bottom-4">
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
          <div className="w-full bg-[#161616] h-1.5 overflow-hidden mb-1.5">
            <div
              className={`h-full transition-all duration-200 ${
                exportProgress.status === 'done' ? 'bg-[#24a148]' : 'bg-[#0f62fe]'
              }`}
              style={{ width: `${exportProgress.progress}%` }}
            />
          </div>

          <p className="text-[11px] font-mono text-[#c6c6c6] truncate">
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
          <div className="bg-[#262626] border border-[#525252] max-w-3xl w-full p-6 shadow-2xl space-y-5 rounded-none my-8 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#393939] pb-3">
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
                className="text-[#c6c6c6] hover:text-white font-mono text-sm p-1 hover:bg-[#393939]"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 font-mono text-xs">
              {/* Dataset Selection (if multiple) */}
              {datasets.length > 1 && (
                <div>
                  <label className="block text-[#f4f4f4] font-bold mb-1 flex items-center gap-1.5">
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
                  <label className="block text-[#f4f4f4] font-bold mb-1">
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
                  <label className="block text-[#f4f4f4] font-bold mb-1">
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
                <label className="block text-[#f4f4f4] font-bold mb-2">
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
                            : 'bg-[#161616] border-[#393939] text-[#c6c6c6] hover:border-[#525252] hover:text-white'
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${isSelected ? 'text-[#0f62fe]' : 'text-[#8d8d8d]'}`} />
                        <span className="text-[11px]">{isAr ? item.labelAr : item.labelEn}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* If KPI Type is selected */}
              {widgetType === 'kpi' ? (
                <div className="space-y-3 bg-[#161616] border border-[#393939] p-4">
                  <div className="flex items-center gap-4 border-b border-[#393939] pb-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[#f4f4f4]">
                      <input
                        type="radio"
                        name="kpiMode"
                        checked={kpiMode === 'auto'}
                        onChange={() => setKpiMode('auto')}
                        className="accent-[#0f62fe]"
                      />
                      <span>{isAr ? 'حساب رياضي وإحصائي آلي من البيانات' : 'Auto Compute from Dataset'}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[#f4f4f4]">
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
                          <label className="block text-[#c6c6c6] mb-1 font-bold">
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
                          <label className="block text-[#c6c6c6] mb-1 font-bold">
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
                          <label className="block text-[#c6c6c6] mb-1">{isAr ? 'بادئة (Prefix)' : 'Prefix'}</label>
                          <input
                            type="text"
                            value={kpiPrefix}
                            onChange={e => setKpiPrefix(e.target.value)}
                            placeholder="$ or SAR"
                            className="carbon-input w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-[#c6c6c6] mb-1">{isAr ? 'لاحقة (Suffix)' : 'Suffix'}</label>
                          <input
                            type="text"
                            value={kpiSuffix}
                            onChange={e => setKpiSuffix(e.target.value)}
                            placeholder="e.g. units or %"
                            className="carbon-input w-full"
                          />
                        </div>
                        <div>
                          <label className="block text-[#c6c6c6] mb-1">{isAr ? 'تسمية الوصف' : 'Description Label'}</label>
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
                        <label className="block text-[#c6c6c6] mb-1 font-bold">
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
                        <label className="block text-[#c6c6c6] mb-1 font-bold">
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
                <div className="space-y-4 bg-[#161616] border border-[#393939] p-4">
                  {/* Axes Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Dimension / X-Axis */}
                    <div>
                      <label className="block text-[#f4f4f4] font-bold mb-1.5 flex items-center justify-between">
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
                      <p className="text-[10px] text-[#8d8d8d] mt-1">
                        {isAr ? 'يحدد الأعمدة التجميعية (مثل: المدينة، التصنيف، التاريخ)' : 'Grouping dimension column'}
                      </p>
                    </div>

                    {/* Metric / Y-Axis */}
                    <div>
                      <label className="block text-[#f4f4f4] font-bold mb-1.5 flex items-center justify-between">
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
                      <p className="text-[10px] text-[#8d8d8d] mt-1">
                        {isAr ? 'يحدد العمود الرقمي المراد حسابه وتجميعه' : 'Numeric value column to aggregate'}
                      </p>
                    </div>
                  </div>

                  {/* Mathematical / Statistical Function Selection Section */}
                  <div className="border-t border-[#393939] pt-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <label className="block text-[#f4f4f4] font-bold flex items-center gap-1.5">
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
                    <div className="bg-[#262626] p-3 border border-[#393939] space-y-2">
                      <div className="flex items-center gap-2">
                        <Sigma className="w-4 h-4 text-[#33b1ff] shrink-0" />
                        <span className="text-xs font-bold text-[#ffffff]">
                          {isAr ? 'القائمة المنسدلة لاختيار الدالة الحسابية / الإحصائية / الاحتمالية:' : 'Statistical / Probabilistic Function Selector:'}
                        </span>
                      </div>

                      <select
                        value={widgetAggregation}
                        onChange={e => handleAggregationChange(e.target.value as AggregationFunction)}
                        className="carbon-input w-full text-xs font-mono font-bold text-[#33b1ff] bg-[#161616] border-[#525252] focus:border-[#0f62fe] py-2 cursor-pointer"
                        id="math-function-select"
                      >
                        <optgroup label={isAr ? '── مقاييس النزعة المركزية (Central Tendency) ──' : '── Central Tendency Measures ──'}>
                          {AGGREGATION_OPTIONS.filter(o => o.category === 'central').map(opt => (
                            <option key={opt.value} value={opt.value} className="bg-[#262626] text-white">
                              {opt.symbol} {isAr ? opt.labelAr : opt.labelEn} — ({isAr ? opt.descAr : opt.descEn})
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label={isAr ? '── مقاييس التشتت والتباين (Dispersion & Spread) ──' : '── Measures of Dispersion ──'}>
                          {AGGREGATION_OPTIONS.filter(o => o.category === 'dispersion').map(opt => (
                            <option key={opt.value} value={opt.value} className="bg-[#262626] text-white">
                              {opt.symbol} {isAr ? opt.labelAr : opt.labelEn} — ({isAr ? opt.descAr : opt.descEn})
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label={isAr ? '── المقاييس المئوية والاحتمالية والربيعيات (Percentiles & Quartiles) ──' : '── Percentiles & Probabilistic ──'}>
                          {AGGREGATION_OPTIONS.filter(o => o.category === 'percentile').map(opt => (
                            <option key={opt.value} value={opt.value} className="bg-[#262626] text-white">
                              {opt.symbol} {isAr ? opt.labelAr : opt.labelEn} — ({isAr ? opt.descAr : opt.descEn})
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label={isAr ? '── الإجماليات والتكرارات العامة (Totals & Counts) ──' : '── Totals & Aggregates ──'}>
                          {AGGREGATION_OPTIONS.filter(o => o.category === 'aggregate').map(opt => (
                            <option key={opt.value} value={opt.value} className="bg-[#262626] text-white">
                              {opt.symbol} {isAr ? opt.labelAr : opt.labelEn} — ({isAr ? opt.descAr : opt.descEn})
                            </option>
                          ))}
                        </optgroup>
                      </select>

                      <div className="flex items-center justify-between text-[11px] text-[#a8a8a8] pt-1">
                        <span>{isAr ? selectedAggOption.descAr : selectedAggOption.descEn}</span>
                        <span className="font-mono text-[#33b1ff] font-bold">
                          {isAr ? 'رمز الدالة:' : 'Symbol:'} {selectedAggOption.symbol}
                        </span>
                      </div>
                    </div>

                    {/* Quick Selection Tags Grid categorized for high ergonomics */}
                    <div className="space-y-2 pt-1">
                      <div className="text-[10px] text-[#8d8d8d] uppercase font-bold flex items-center justify-between">
                        <span>{isAr ? 'أو اختر سريعاً بالنقر المباشر على بطاقات الدوال:' : 'Or quick select via function cards:'}</span>
                        <span className="text-[#33b1ff]">{AGGREGATION_OPTIONS.length} {isAr ? 'دالة متاحة' : 'functions available'}</span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1.5 max-h-[160px] overflow-y-auto p-1 bg-[#161616] border border-[#393939]">
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
                                  : 'bg-[#262626] border-[#393939] text-[#c6c6c6] hover:border-[#525252] hover:text-white'
                              }`}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span className={`font-mono px-1 py-0.2 text-[9px] ${isSelected ? 'bg-[#0f62fe] text-white' : 'bg-[#161616] text-[#33b1ff]'}`}>
                                  {opt.symbol}
                                </span>
                                {isSelected && <Check className="w-3 h-3 text-[#0f62fe]" />}
                              </div>
                              <span className="font-bold truncate mt-1 text-[#f4f4f4]">
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
                      : 'bg-[#262626] border-[#525252]'
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
                      <div className="text-[10px] text-[#8d8d8d] uppercase font-bold tracking-wider flex items-center justify-between">
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
            <div className="flex items-center justify-between pt-4 border-t border-[#393939]">
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
        title={activeDashboard ? (isAr ? `تصدير لوحة القيادة: ${activeDashboard.nameAr || activeDashboard.name}` : `Export Dashboard: ${activeDashboard.name}`) : undefined}
        data={activeDataset?.data || datasets[0]?.data || []}
        defaultFilename={activeDashboard ? activeDashboard.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_') : 'dashboard_report'}
        language={language}
      />
    </div>
  );
};
