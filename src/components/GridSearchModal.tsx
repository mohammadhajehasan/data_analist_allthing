import React, { useState, useMemo, useEffect } from 'react';
import Plot from 'react-plotly.js';
import {
  X,
  Sparkles,
  Award,
  Play,
  Check,
  CheckCircle2,
  AlertTriangle,
  Layers,
  BarChart2,
  ArrowUpDown,
  Download,
  Filter,
  RefreshCw,
  Sliders,
  ChevronRight,
  Info,
  FileText,
  Copy,
  Activity,
  FileDown
} from 'lucide-react';
import {
  GridSearchCandidate,
  GridSearchResultItem,
  GridSearchOptions,
  GridSearchPoint,
  generateCandidates,
  executeGridSearchCV,
  formatCandidateLabel,
  generateGridSearchReport
} from '../utils/gridSearchUtils';
import { PerformanceCurves } from './charts/PerformanceCurves';
import { InfoTooltip } from './InfoTooltip';
import { exportSelectedModelToPdf } from '../utils/modelPdfExport';
import { useApp } from '../context/AppContext';

interface GridSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: GridSearchPoint[];
  currentModelType: 'linear' | 'polynomial' | 'ridge' | 'kmeans';
  currentDegree: number;
  currentAlpha: number;
  currentInteractions: boolean;
  hasMultipleFeatures: boolean;
  language: 'ar' | 'en';
  isDark: boolean;
  onApplyHyperparameters: (params: {
    modelType: 'linear' | 'polynomial' | 'ridge';
    degree: number;
    alpha: number;
    includeInteractions: boolean;
  }) => void;
}

export const GridSearchModal: React.FC<GridSearchModalProps> = ({
  isOpen,
  onClose,
  data,
  currentModelType,
  currentDegree,
  currentAlpha,
  currentInteractions,
  hasMultipleFeatures,
  language,
  isDark,
  onApplyHyperparameters
}) => {
  const [scope, setScope] = useState<GridSearchOptions['scope']>('all_models');
  const [kFolds, setKFolds] = useState<number>(5);
  const [scoringMetric, setScoringMetric] = useState<'r2' | 'rmse' | 'mse'>('r2');
  
  // Custom grid parameters state
  const [customDegrees, setCustomDegrees] = useState<number[]>([1, 2, 3, 4]);
  const [customAlphas, setCustomAlphas] = useState<number[]>([0.01, 0.1, 1.0, 10.0]);
  const [customInteractions, setCustomInteractions] = useState<boolean>([false, true]);

  // Execution state
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ completed: number; total: number; currentCandidate?: GridSearchCandidate }>({
    completed: 0,
    total: 0
  });
  const [results, setResults] = useState<GridSearchResultItem[]>([]);
  const [bestModel, setBestModel] = useState<GridSearchResultItem | null>(null);
  const [activeTab, setActiveTab] = useState<'table' | 'visual' | 'curves' | 'report'>('table');
  const [filterText, setFilterText] = useState<string>('');
  const [appliedCandidateId, setAppliedCandidateId] = useState<string | null>(null);
  const [copiedReport, setCopiedReport] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  const handleExportChampionPdf = async () => {
    if (!bestModel) return;
    setIsExportingPdf(true);
    try {
      const featNames = data[0]?.features && data[0].features.length > 0 
        ? data[0].features.map((_, i) => `X${i + 1}`) 
        : ['Feature 1 (X)'];

      await exportSelectedModelToPdf({
        modelType: bestModel.candidate.type,
        modelLabel: language === 'ar' ? bestModel.candidate.labelAr : bestModel.candidate.labelEn,
        targetName: 'Target (Y)',
        featureNames: featNames,
        totalSamples: data.length,
        hyperparameters: {
          degree: bestModel.candidate.degree,
          alpha: bestModel.candidate.alpha,
          includeInteractions: bestModel.candidate.includeInteractions,
          kFolds: kFolds,
        },
        metrics: {
          r2: bestModel.meanValR2,
          adjustedR2: bestModel.meanValR2,
          rmse: bestModel.meanValRmse,
          mse: bestModel.meanValMse,
        },
        splitMetrics: {
          enabled: true,
          trainR2: bestModel.meanTrainR2,
          testR2: bestModel.meanValR2,
          generalizationGap: bestModel.generalizationGap,
          diagnosis: bestModel.status === 'optimal' 
            ? (language === 'ar' ? 'نموذج مثالي ومتوازن' : 'Optimal Balance')
            : bestModel.status === 'overfitting'
            ? (language === 'ar' ? 'خطر فرط التخصيص' : 'Overfitting Risk')
            : (language === 'ar' ? 'مقبول' : 'Acceptable')
        },
        cvMetrics: {
          enabled: true,
          meanTestR2: bestModel.meanValR2,
          stdTestR2: bestModel.stdValR2,
          meanTestRmse: bestModel.meanValRmse,
          overallOofR2: bestModel.meanValR2,
          kFolds: kFolds,
        },
        equation: `Y = f(${featNames.join(', ')}) [Grid Search Champion: ${bestModel.candidate.type.toUpperCase()}${bestModel.candidate.degree ? `, Degree=${bestModel.candidate.degree}` : ''}${bestModel.candidate.alpha ? `, Alpha=${bestModel.candidate.alpha}` : ''}]`,
        coefficients: [],
        language: language,
      });
    } catch (err) {
      console.error('Failed to export PDF:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Automatic Text Report Generation
  const summaryReport = useMemo(() => {
    return generateGridSearchReport(
      results,
      bestModel,
      {
        kFolds,
        scoringMetric,
        scope
      },
      language
    );
  }, [results, bestModel, kFolds, scoringMetric, scope, language]);

  const handleCopyReport = async () => {
    try {
      await navigator.clipboard.writeText(summaryReport);
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
    } catch (err) {
      console.error('Failed to copy report:', err);
    }
  };

  const handleDownloadReport = () => {
    const blob = new Blob([summaryReport], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `grid_search_report_${Date.now()}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Generate candidates dynamically based on current configuration
  const candidates = useMemo(() => {
    return generateCandidates(scope, currentModelType, hasMultipleFeatures, {
      degrees: customDegrees,
      alphas: customAlphas,
      interactions: customInteractions
    });
  }, [scope, currentModelType, hasMultipleFeatures, customDegrees, customAlphas, customInteractions]);

  // Reset or initialize on open
  useEffect(() => {
    if (isOpen && results.length === 0) {
      // Don't auto-run if empty, let user confirm settings or click run
    }
  }, [isOpen]);

  const { toast } = useApp();

  const handleRunGridSearch = async () => {
    if (data.length < 5) {
      toast.warning(
        language === 'ar' ? 'بيانات غير كافية' : 'Insufficient Data',
        language === 'ar' ? 'يلزم 5 نقاط بيانات على الأقل لتشغيل البحث الشبكي.' : 'At least 5 data points are required to execute Grid Search.'
      );
      return;
    }
    setIsRunning(true);
    setProgress({ completed: 0, total: candidates.length });
    setResults([]);
    setBestModel(null);

    try {
      const { results: searchResults, best } = await executeGridSearchCV(
        data,
        candidates,
        {
          kFolds,
          scoringMetric,
          scope
        },
        (prog) => {
          setProgress(prog);
        }
      );

      setResults(searchResults);
      setBestModel(best);
      toast.success(
        language === 'ar' ? 'اكتملت عملية البحث الشبكي بنجاح!' : 'Grid Search Optimization Completed!',
        language === 'ar'
          ? `تم اختبار ${searchResults.length} نموذجاً بنجاح. أفضل نموذج هو "${best?.candidate.labelAr}" بدقة R² = ${(best?.meanValR2 ?? 0).toFixed(4)}`
          : `Evaluated ${searchResults.length} candidate models. Best configuration: "${best?.candidate.labelEn}" with R² = ${(best?.meanValR2 ?? 0).toFixed(4)}`
      );
    } catch (err: any) {
      console.error('Grid Search execution error:', err);
      toast.error(
        language === 'ar' ? 'خطأ في عملية البحث الشبكي' : 'Grid Search Execution Error',
        err?.message || (language === 'ar' ? 'فشل تنفيذ عملية البحث الشبكي للنماذج.' : 'Failed to execute hyperparameter search.')
      );
    } finally {
      setIsRunning(false);
    }
  };

  const handleApply = (candidate: GridSearchCandidate) => {
    onApplyHyperparameters({
      modelType: candidate.modelType,
      degree: candidate.degree,
      alpha: candidate.alpha ?? 1.0,
      includeInteractions: candidate.includeInteractions
    });
    setAppliedCandidateId(candidate.id);
    setTimeout(() => {
      onClose();
    }, 400);
  };

  const filteredResults = useMemo(() => {
    if (!filterText.trim()) return results;
    const q = filterText.toLowerCase();
    return results.filter(r => 
      r.candidate.labelAr.toLowerCase().includes(q) ||
      r.candidate.labelEn.toLowerCase().includes(q) ||
      r.candidate.modelType.toLowerCase().includes(q)
    );
  }, [results, filterText]);

  // Export results to CSV
  const handleExportCSV = () => {
    if (results.length === 0) return;
    const headers = [
      'Rank',
      'Model Type',
      'Degree',
      'Alpha',
      'Interactions',
      'Validation R2',
      'Validation R2 Std',
      'Validation RMSE',
      'Validation MSE',
      'Train R2',
      'Generalization Gap',
      'Status'
    ];
    const rows = results.map(r => [
      r.rank,
      r.candidate.modelType,
      r.candidate.degree,
      r.candidate.alpha ?? 'N/A',
      r.candidate.includeInteractions ? 'Yes' : 'No',
      r.meanValR2.toFixed(4),
      r.stdValR2.toFixed(4),
      r.meanValRmse.toFixed(4),
      r.meanValMse.toFixed(4),
      r.meanTrainR2.toFixed(4),
      r.generalizationGap.toFixed(4),
      r.status
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `grid_search_results_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Top 10 visualization chart data
  const top10 = useMemo(() => results.slice(0, 10), [results]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div 
        className="relative w-full max-w-6xl max-h-[92vh] flex flex-col bg-[var(--cds-layer-01)] text-[var(--cds-text-01)] rounded-2xl border border-[var(--cds-border-subtle)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        dir={language === 'ar' ? 'rtl' : 'ltr'}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[var(--cds-text-01)]">
                  {language === 'ar' ? 'البحث الشبكي لضبط المعاملات الفائقة (Grid Search CV)' : 'Grid Search Hyperparameter Tuning (CV)'}
                </h2>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  {kFolds}-Fold Cross-Validation
                </span>
              </div>
              <p className="text-xs text-[var(--cds-text-03)]">
                {language === 'ar'
                  ? 'اختبار منظم لجميع توليفات النماذج والمعاملات (الدرجة، معامل الجزاء Alpha، التفاعل) لتحديد النموذج الأفضل إحصائياً وتفادي التوافق المفرط.'
                  : 'Systematically explores hyperparameters (degree, alpha penalty, interactions) using K-fold CV to crown the best model.'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[var(--cds-text-03)] hover:text-[var(--cds-text-01)] hover:bg-[var(--cds-layer-01)] transition-colors cursor-pointer"
            title={language === 'ar' ? 'إغلاق' : 'Close'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Configuration Box */}
          <div className="p-4 rounded-xl bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              {/* Scope Selection */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[var(--cds-text-02)] flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-500" />
                    {language === 'ar' ? 'نطاق البحث (Search Scope):' : 'Search Scope:'}
                  </label>
                  <InfoTooltip
                    title={language === 'ar' ? 'نطاق البحث الشبكي' : 'Search Scope'}
                    content={
                      language === 'ar'
                        ? 'يحدد مجموعة الفرضيات والنماذج المراد استكشافها. يتيح لك فحص شامل لمختلف أنواع النماذج، أو التركيز على تحسين معاملات انحدار الحافة Ridge أو كثير الحدود.'
                        : 'Defines the parameter space to explore. Allows evaluating all model architectures or focusing on Ridge/Polynomial tuning.'
                    }
                    recommended={language === 'ar' ? 'مقارنة شاملة لجميع النماذج' : 'All Models Champion'}
                    language={language}
                  />
                </div>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as any)}
                  className="w-full text-xs font-semibold p-2.5 rounded-xl bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="all_models">
                    {language === 'ar' ? '🏆 مقارنة شاملة لجميع النماذج (All Models Champion)' : '🏆 Champion Across All Models (OLS, Poly, Ridge)'}
                  </option>
                  <option value="ridge_tuning">
                    {language === 'ar' ? 'انحدار الحافة Ridge (درجات 1..5 × معاملات α مختلفة)' : 'Ridge Regression (Degrees 1..5 × Multi-Alpha)'}
                  </option>
                  <option value="poly_tuning">
                    {language === 'ar' ? 'كثير الحدود Polynomial (درجات 1..8 + تفاعلات)' : 'Polynomial Regression (Degrees 1..8 + Interactions)'}
                  </option>
                  <option value="custom">
                    {language === 'ar' ? 'شبكة مخصصة (Custom Parameter Grid)' : 'Custom Parameter Grid'}
                  </option>
                </select>
              </div>

              {/* K-Folds Selector */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[var(--cds-text-02)] flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-blue-500" />
                    {language === 'ar' ? 'طيات التحقق المتقاطع (K-Folds):' : 'Cross-Validation Folds:'}
                  </label>
                  <InfoTooltip
                    title={language === 'ar' ? 'المصادقة التبادلية K-Fold' : 'K-Fold Cross-Validation'}
                    content={
                      language === 'ar'
                        ? 'تقسيم البيانات إلى K طيات؛ حيث يتم التدريب على (K-1) أجزاء والتقييم على الجزء المتبقي بالتناوب لضمان قياس غير متحيز لقدرة النموذج على التعميم على بيانات غير مرئية.'
                        : 'Splits data into K folds; trains on K-1 and evaluates on the remaining fold iteratively to calculate an unbiased generalization score.'
                    }
                    recommended="5-Fold CV"
                    language={language}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[3, 5, 10].map(kVal => (
                    <button
                      key={kVal}
                      type="button"
                      onClick={() => setKFolds(kVal)}
                      className={`py-2 px-2 rounded-xl text-xs font-bold transition-all ${
                        kFolds === kVal
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-[var(--cds-layer-01)] text-[var(--cds-text-02)] border border-[var(--cds-border-subtle)] hover:bg-[var(--cds-layer-03)]'
                      }`}
                    >
                      {kVal}-Fold {kVal === 5 ? (language === 'ar' ? '(الموصى به)' : '(Default)') : ''}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scoring Metric Selector */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[var(--cds-text-02)] flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5 text-amber-500" />
                    {language === 'ar' ? 'معيار الترتيب والتحسين (Scoring):' : 'Optimization Metric:'}
                  </label>
                  <InfoTooltip
                    title={language === 'ar' ? 'معيار ترتيب النماذج' : 'Scoring Metric'}
                    content={
                      language === 'ar'
                        ? 'المعيار الإحصائي لتحديد النموذج الفائز: معامل التحديد R² (الأعلى هو الأفضل) يفضل التباين المفسر، بينما جذر متوسط الخطأ RMSE يقيس بعد التنبؤات عن الواقع.'
                        : 'The statistical metric used to rank candidates. Higher R² maximizes explained variance; lower RMSE minimizes forecast deviations.'
                    }
                    recommended="R² (Validation)"
                    language={language}
                  />
                </div>
                <select
                  value={scoringMetric}
                  onChange={(e) => setScoringMetric(e.target.value as any)}
                  className="w-full text-xs font-semibold p-2.5 rounded-xl bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="r2">{language === 'ar' ? 'أعلى معامل تحديد R² (Validation R²)' : 'Highest Validation R²'}</option>
                  <option value="rmse">{language === 'ar' ? 'أدنى جذر متوسط مربع الخطأ (Min RMSE)' : 'Lowest Validation RMSE'}</option>
                  <option value="mse">{language === 'ar' ? 'أدنى متوسط مربع الخطأ (Min MSE)' : 'Lowest Validation MSE'}</option>
                </select>
              </div>
            </div>

            {/* Custom Grid Configuration if Selected */}
            {scope === 'custom' && (
              <div className="p-3 bg-[var(--cds-layer-01)] rounded-xl border border-[var(--cds-border-subtle)] space-y-3">
                <div className="text-xs font-bold text-[var(--cds-text-01)]">
                  {language === 'ar' ? 'تخصيص قيم المعاملات للبحث الشبكي:' : 'Customize Grid Search Hyperparameter Candidates:'}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="font-semibold text-[var(--cds-text-02)] block mb-1">
                      {language === 'ar' ? 'الدرجات (Degrees):' : 'Degrees:'}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {[1, 2, 3, 4, 5, 6, 7, 8].map(d => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            if (customDegrees.includes(d)) {
                              if (customDegrees.length > 1) setCustomDegrees(customDegrees.filter(x => x !== d));
                            } else {
                              setCustomDegrees([...customDegrees, d].sort((a,b)=>a-b));
                            }
                          }}
                          className={`px-2 py-1 rounded-md text-[11px] font-bold ${
                            customDegrees.includes(d) ? 'bg-indigo-600 text-white' : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] border border-[var(--cds-border-subtle)]'
                          }`}
                        >
                          d={d}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="font-semibold text-[var(--cds-text-02)] block mb-1">
                      {language === 'ar' ? 'معامل الجزاء (Ridge Alphas):' : 'Ridge Alphas:'}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {[0.001, 0.01, 0.1, 1.0, 10.0, 50.0].map(a => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => {
                            if (customAlphas.includes(a)) {
                              if (customAlphas.length > 1) setCustomAlphas(customAlphas.filter(x => x !== a));
                            } else {
                              setCustomAlphas([...customAlphas, a].sort((a,b)=>a-b));
                            }
                          }}
                          className={`px-2 py-1 rounded-md text-[10px] font-mono font-bold ${
                            customAlphas.includes(a) ? 'bg-amber-600 text-white' : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] border border-[var(--cds-border-subtle)]'
                          }`}
                        >
                          α={a}
                        </button>
                      ))}
                    </div>
                  </div>

                  {hasMultipleFeatures && (
                    <div>
                      <span className="font-semibold text-[var(--cds-text-02)] block mb-1">
                        {language === 'ar' ? 'حدود التفاعل (Interactions):' : 'Interactions:'}
                      </span>
                      <div className="flex gap-2">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={customInteractions.includes(false)}
                            onChange={(e) => {
                              if (e.target.checked) setCustomInteractions([...customInteractions, false]);
                              else if (customInteractions.length > 1) setCustomInteractions(customInteractions.filter(x => x !== false));
                            }}
                            className="rounded text-indigo-600"
                          />
                          <span>{language === 'ar' ? 'بدون تفاعل' : 'No Int'}</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={customInteractions.includes(true)}
                            onChange={(e) => {
                              if (e.target.checked) setCustomInteractions([...customInteractions, true]);
                              else if (customInteractions.length > 1) setCustomInteractions(customInteractions.filter(x => x !== true));
                            }}
                            className="rounded text-indigo-600"
                          />
                          <span>{language === 'ar' ? 'مع تفاعل' : 'With Int'}</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Run Button & Candidate Count Overview */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--cds-border-subtle)]">
              <div className="text-xs text-[var(--cds-text-03)] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                <span>
                  {language === 'ar'
                    ? `إجمالي النماذج المرشحة في الشبكة: ${candidates.length} نموذج × ${kFolds} طيات = ${candidates.length * kFolds} تقييم فرعي`
                    : `Total Grid Candidates: ${candidates.length} models × ${kFolds} folds = ${candidates.length * kFolds} evaluations`}
                </span>
              </div>

              <button
                type="button"
                onClick={handleRunGridSearch}
                disabled={isRunning || data.length < 5}
                className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:opacity-95 active:scale-95 text-white font-bold px-6 py-2.5 rounded-xl text-xs shadow-lg shadow-indigo-500/25 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRunning ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 fill-current" />
                )}
                <span>
                  {isRunning 
                    ? (language === 'ar' ? 'جارٍ تنفيذ البحث الشبكي...' : 'Running Grid Search...')
                    : (results.length > 0
                        ? (language === 'ar' ? 'إعادة تشغيل البحث الشبكي' : 'Re-run Grid Search')
                        : (language === 'ar' ? 'بدء تشغيل البحث الشبكي (Run Grid Search)' : 'Run Grid Search CV'))
                  }
                </span>
              </button>
            </div>

            {/* Live Progress Bar */}
            {isRunning && (
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    {language === 'ar' 
                      ? `تقييم المرشح ${progress.completed} من ${progress.total}: ${progress.currentCandidate?.labelAr || ''}`
                      : `Evaluating ${progress.completed}/${progress.total}: ${progress.currentCandidate?.labelEn || ''}`}
                  </span>
                  <span className="font-mono text-[var(--cds-text-02)]">
                    {Math.round((progress.completed / (progress.total || 1)) * 100)}%
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div 
                    style={{ width: `${Math.round((progress.completed / (progress.total || 1)) * 100)}%` }}
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-150 rounded-full"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Champion Model Banner */}
          {bestModel && (
            <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-emerald-500/10 border-2 border-amber-500/40 shadow-lg space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/30">
                    <Award className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full bg-amber-500 text-white uppercase tracking-wider">
                        {language === 'ar' ? 'النموذج الفائز رقم #1' : 'Winner #1 Champion'}
                      </span>
                      <h3 className="text-base font-extrabold text-[var(--cds-text-01)]">
                        {language === 'ar' ? bestModel.candidate.labelAr : bestModel.candidate.labelEn}
                      </h3>
                    </div>
                    <p className="text-xs text-[var(--cds-text-03)]">
                      {language === 'ar'
                        ? `حقق أعلى دقة تعميم عبر جميع طيات التحقق (${kFolds}-Folds) مع أدنى نسبة تشتت.`
                        : `Achieved the highest cross-validation generalization score across all ${kFolds} folds.`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportChampionPdf}
                    disabled={isExportingPdf}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-[var(--cds-layer-01)] hover:bg-[var(--cds-layer-03)] text-[var(--cds-text-01)] border border-[var(--cds-border-subtle)] transition-all shadow-xs active:scale-95 cursor-pointer disabled:opacity-50"
                    title={language === 'ar' ? 'تصدير تفاصيل النموذج الفائز كملف PDF' : 'Export champion model as PDF'}
                  >
                    {isExportingPdf ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
                    ) : (
                      <FileDown className="w-4 h-4 text-indigo-500" />
                    )}
                    <span>
                      {isExportingPdf
                        ? (language === 'ar' ? 'جاري التصدير...' : 'Exporting PDF...')
                        : (language === 'ar' ? 'تصدير كـ PDF' : 'Export PDF')}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleApply(bestModel.candidate)}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-md active:scale-95 cursor-pointer ${
                      appliedCandidateId === bestModel.candidate.id
                        ? 'bg-emerald-600 shadow-emerald-500/30'
                        : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-95 shadow-emerald-500/25'
                    }`}
                  >
                    {appliedCandidateId === bestModel.candidate.id ? (
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    <span>
                      {appliedCandidateId === bestModel.candidate.id
                        ? (language === 'ar' ? 'تم تطبيق المعاملات بنجاح!' : 'Hyperparameters Applied!')
                        : (language === 'ar' ? 'تطبيق هذا النموذج الفائز فوراً' : 'Apply Champion Hyperparameters Now')}
                    </span>
                  </button>
                </div>
              </div>

              {/* Champion Metric Scorecards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-3 bg-[var(--cds-layer-01)] rounded-xl border border-amber-500/20 shadow-2xs">
                  <div className="text-[10px] text-[var(--cds-text-03)] font-semibold">
                    {language === 'ar' ? 'متوسط R² التحقق (CV R²)' : 'Mean Validation R²'}
                  </div>
                  <div className="text-lg font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                    {bestModel.meanValR2.toFixed(4)}
                  </div>
                  <div className="text-[10px] text-[var(--cds-text-03)] font-mono">
                    ± {bestModel.stdValR2.toFixed(4)} (SD)
                  </div>
                </div>

                <div className="p-3 bg-[var(--cds-layer-01)] rounded-xl border border-amber-500/20 shadow-2xs">
                  <div className="text-[10px] text-[var(--cds-text-03)] font-semibold">
                    {language === 'ar' ? 'جذر متوسط مربع الخطأ (RMSE)' : 'Validation RMSE'}
                  </div>
                  <div className="text-lg font-mono font-extrabold text-blue-600 dark:text-blue-400">
                    {bestModel.meanValRmse.toFixed(4)}
                  </div>
                  <div className="text-[10px] text-[var(--cds-text-03)] font-mono">
                    ± {bestModel.stdValRmse.toFixed(4)}
                  </div>
                </div>

                <div className="p-3 bg-[var(--cds-layer-01)] rounded-xl border border-amber-500/20 shadow-2xs">
                  <div className="text-[10px] text-[var(--cds-text-03)] font-semibold">
                    {language === 'ar' ? 'متوسط R² التدريب' : 'Mean Train R²'}
                  </div>
                  <div className="text-lg font-mono font-extrabold text-purple-600 dark:text-purple-400">
                    {bestModel.meanTrainR2.toFixed(4)}
                  </div>
                  <div className="text-[10px] text-[var(--cds-text-03)]">
                    {language === 'ar' ? 'داخل العينة' : 'In-Sample'}
                  </div>
                </div>

                <div className="p-3 bg-[var(--cds-layer-01)] rounded-xl border border-amber-500/20 shadow-2xs">
                  <div className="text-[10px] text-[var(--cds-text-03)] font-semibold">
                    {language === 'ar' ? 'فجوة التعميم (Generalization Gap)' : 'Generalization Gap'}
                  </div>
                  <div className={`text-lg font-mono font-extrabold ${bestModel.generalizationGap > 0.1 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {bestModel.generalizationGap.toFixed(4)}
                  </div>
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                    {language === 'ar' ? 'مستوى أمان ممتاز' : 'Safe Generalization'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Results Views Toggle and Controls */}
          {results.length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Tabs */}
                <div className="flex items-center gap-1 bg-[var(--cds-layer-02)] p-1 rounded-xl border border-[var(--cds-border-subtle)]">
                  <button
                    type="button"
                    onClick={() => setActiveTab('table')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeTab === 'table'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'
                    }`}
                  >
                    <span>{language === 'ar' ? 'جدول الترتيب والمقارنة' : 'Leaderboard Table'}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 text-white font-mono">
                      {results.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('visual')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeTab === 'visual'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'
                    }`}
                  >
                    <BarChart2 className="w-3.5 h-3.5" />
                    <span>{language === 'ar' ? 'المقارنة البيانية' : 'Visual (Top 10)'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('curves')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeTab === 'curves'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>{language === 'ar' ? 'منحنيات الأداء والتعلم' : 'Performance Curves'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('report')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeTab === 'report'
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>{language === 'ar' ? 'تقرير التحسن التلقائي' : 'Summary Report'}</span>
                  </button>
                </div>

                {/* Filter & Export */}
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Filter className="w-3.5 h-3.5 text-[var(--cds-text-03)] absolute top-2.5 left-2.5 rtl:left-auto rtl:right-2.5" />
                    <input
                      type="text"
                      value={filterText}
                      onChange={(e) => setFilterText(e.target.value)}
                      placeholder={language === 'ar' ? 'تصفية النماذج...' : 'Filter models...'}
                      className="text-xs pl-8 pr-3 rtl:pl-3 rtl:pr-8 py-1.5 rounded-xl bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] focus:outline-none w-44"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-02)] transition-colors cursor-pointer"
                    title={language === 'ar' ? 'تصدير النتائج إلى CSV' : 'Export to CSV'}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{language === 'ar' ? 'تصدير CSV' : 'Export'}</span>
                  </button>
                </div>
              </div>

              {/* Leaderboard Table View */}
              {activeTab === 'table' && (
                <div className="overflow-x-auto border border-[var(--cds-border-subtle)] rounded-xl bg-[var(--cds-layer-01)] shadow-2xs max-h-[420px]">
                  <table className="w-full text-xs text-left rtl:text-right border-collapse">
                    <thead className="bg-[var(--cds-layer-02)] text-[var(--cds-text-01)] font-bold sticky top-0 border-b border-[var(--cds-border-subtle)] z-10">
                      <tr>
                        <th className="p-3 text-center w-14">{language === 'ar' ? 'الترتيب' : 'Rank'}</th>
                        <th className="p-3">{language === 'ar' ? 'النموذج والمعاملات (Candidate)' : 'Model & Hyperparameters'}</th>
                        <th className="p-3 text-center">{language === 'ar' ? 'النوع' : 'Type'}</th>
                        <th className="p-3 text-center">{language === 'ar' ? 'الدرجة' : 'Degree'}</th>
                        <th className="p-3 text-center">{language === 'ar' ? 'معامل الجزاء α' : 'Alpha α'}</th>
                        <th className="p-3 text-center text-emerald-600 font-extrabold">{language === 'ar' ? 'متوسط R² التحقق' : 'Validation R²'}</th>
                        <th className="p-3 text-center text-blue-600 font-extrabold">{language === 'ar' ? 'RMSE التحقق' : 'Val RMSE'}</th>
                        <th className="p-3 text-center text-purple-600 font-bold">{language === 'ar' ? 'R² التدريب' : 'Train R²'}</th>
                        <th className="p-3 text-center">{language === 'ar' ? 'فجوة التعميم' : 'Gap (ΔR²)'}</th>
                        <th className="p-3 text-center">{language === 'ar' ? 'التشخيص' : 'Status'}</th>
                        <th className="p-3 text-center">{language === 'ar' ? 'إجراء' : 'Action'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--cds-border-subtle)] font-mono">
                      {filteredResults.map((item) => (
                        <tr 
                          key={item.candidate.id} 
                          className={`hover:bg-[var(--cds-layer-02)]/70 transition-colors ${
                            item.rank === 1 ? 'bg-amber-500/5 dark:bg-amber-500/10' : ''
                          }`}
                        >
                          <td className="p-3 text-center">
                            {item.rank === 1 ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500 text-white font-extrabold text-[11px] shadow-xs">
                                1
                              </span>
                            ) : (
                              <span className="text-[var(--cds-text-03)] font-sans font-semibold">
                                #{item.rank}
                              </span>
                            )}
                          </td>
                          <td className="p-3 font-sans font-bold text-[var(--cds-text-01)]">
                            <div className="flex items-center gap-1.5">
                              {item.rank === 1 && <Award className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                              <span>{language === 'ar' ? item.candidate.labelAr : item.candidate.labelEn}</span>
                            </div>
                          </td>
                          <td className="p-3 text-center font-sans">
                            <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold uppercase ${
                              item.candidate.modelType === 'ridge'
                                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20'
                                : item.candidate.modelType === 'polynomial'
                                ? 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/20'
                                : 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20'
                            }`}>
                              {item.candidate.modelType}
                            </span>
                          </td>
                          <td className="p-3 text-center font-bold">
                            {item.candidate.degree}
                          </td>
                          <td className="p-3 text-center text-amber-600 dark:text-amber-400 font-bold">
                            {item.candidate.alpha !== undefined ? item.candidate.alpha : '—'}
                          </td>
                          <td className="p-3 text-center font-bold text-emerald-600 dark:text-emerald-400">
                            <div>{item.meanValR2.toFixed(4)}</div>
                            <div className="text-[9px] text-[var(--cds-text-03)] font-normal">± {item.stdValR2.toFixed(3)}</div>
                          </td>
                          <td className="p-3 text-center font-bold text-blue-600 dark:text-blue-400">
                            {item.meanValRmse.toFixed(4)}
                          </td>
                          <td className="p-3 text-center text-purple-600 dark:text-purple-400">
                            {item.meanTrainR2.toFixed(4)}
                          </td>
                          <td className={`p-3 text-center font-bold ${
                            item.generalizationGap > 0.12 ? 'text-rose-600' : 'text-emerald-600'
                          }`}>
                            {item.generalizationGap.toFixed(4)}
                          </td>
                          <td className="p-3 text-center font-sans">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold whitespace-nowrap border ${
                              item.status === 'best'
                                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                                : item.status === 'excellent'
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                                : item.status === 'overfitting'
                                ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
                                : item.status === 'underfitting'
                                ? 'bg-gray-500/15 text-gray-700 dark:text-gray-300 border-gray-500/30'
                                : 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30'
                            }`}>
                              {language === 'ar' ? item.statusLabelAr : item.statusLabelEn}
                            </span>
                          </td>
                          <td className="p-3 text-center font-sans">
                            <button
                              type="button"
                              onClick={() => handleApply(item.candidate)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                                appliedCandidateId === item.candidate.id
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-indigo-500/10 hover:bg-indigo-600 hover:text-white text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
                              }`}
                            >
                              {appliedCandidateId === item.candidate.id ? (
                                language === 'ar' ? '✓ تم' : '✓ Done'
                              ) : (
                                language === 'ar' ? 'تطبيق' : 'Apply'
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Visual Top 10 Comparison Chart */}
              {activeTab === 'visual' && (
                <div className="p-4 bg-[var(--cds-layer-01)] rounded-xl border border-[var(--cds-border-subtle)] space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-[var(--cds-text-01)]">
                      {language === 'ar' ? 'مقارنة أفضل 10 نماذج: دقة التحقق (Validation R²) مقابل التدريب (Train R²)' : 'Top 10 Models: Validation R² vs Training R²'}
                    </span>
                    <span className="text-[10px] text-[var(--cds-text-03)]">
                      {language === 'ar' ? 'الأعمدة الخضراء توضح أداء التحقق مع هوامش الخطأ المعياري (±SD)' : 'Green bars indicate Validation R² with error bars'}
                    </span>
                  </div>

                  <div className="h-[320px] w-full">
                    <Plot
                      key={`grid-plot-${isDark}`}
                      data={[
                        {
                          x: top10.map(m => language === 'ar' ? m.candidate.labelAr : m.candidate.labelEn),
                          y: top10.map(m => m.meanValR2),
                          name: language === 'ar' ? 'أداء التحقق (Val R²)' : 'Validation R²',
                          type: 'bar',
                          marker: { color: '#10b981' },
                          error_y: {
                            type: 'data',
                            array: top10.map(m => m.stdValR2),
                            visible: true,
                            color: '#047857'
                          }
                        },
                        {
                          x: top10.map(m => language === 'ar' ? m.candidate.labelAr : m.candidate.labelEn),
                          y: top10.map(m => m.meanTrainR2),
                          name: language === 'ar' ? 'أداء التدريب (Train R²)' : 'Train R²',
                          type: 'bar',
                          marker: { color: '#6366f1', opacity: 0.6 }
                        }
                      ] as any}
                      layout={{
                        autosize: true,
                        barmode: 'group',
                        margin: { l: 45, r: 25, t: 15, b: 85 },
                        paper_bgcolor: 'transparent',
                        plot_bgcolor: 'transparent',
                        font: { color: isDark ? '#e5e7eb' : '#374151', size: 10 },
                        xaxis: {
                          tickangle: -30,
                          showgrid: false,
                          tickfont: { size: 9 }
                        },
                        yaxis: {
                          title: 'R² Score',
                          showgrid: true,
                          gridcolor: isDark ? '#374151' : '#e5e7eb',
                          range: [Math.max(0, Math.min(...top10.map(m => m.meanValR2)) - 0.1), 1.05]
                        },
                        legend: {
                          orientation: 'h',
                          y: 1.15,
                          x: 0.5,
                          xanchor: 'center'
                        }
                      }}
                      config={{ responsive: true, displayModeBar: false }}
                      style={{ width: '100%', height: '100%' }}
                    />
                  </div>
                </div>
              )}

              {/* Performance Curves & Overfitting Detection View */}
              {activeTab === 'curves' && (
                <div className="p-4 bg-[var(--cds-layer-01)] rounded-2xl border border-[var(--cds-border-subtle)] space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--cds-border-subtle)]">
                    <div>
                      <h4 className="text-sm font-bold text-[var(--cds-text-01)] flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-indigo-500" />
                        <span>
                          {language === 'ar'
                            ? `منحنيات أداء النموذج الفائز (${bestModel ? (language === 'ar' ? bestModel.candidate.labelAr : bestModel.candidate.labelEn) : ''})`
                            : `Performance Curves (${bestModel?.candidate.labelEn || 'Candidate Model'})`}
                        </span>
                      </h4>
                      <p className="text-xs text-[var(--cds-text-03)] mt-0.5">
                        {language === 'ar'
                          ? 'مخططات Recharts التفاعلية لرصد فرط التخصيص (Overfitting) ومنحنى التعلم (Learning Curve) ومقارنة أداء التدريب مقابل التحقق.'
                          : 'Interactive Recharts curves diagnosing learning trajectory and detecting overfitting/underfitting.'}
                      </p>
                    </div>

                    {bestModel && (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                          CV R²: {bestModel.meanValR2.toFixed(4)}
                        </span>
                      </div>
                    )}
                  </div>

                  <PerformanceCurves
                    data={data.map((d, i) => ({ index: i, x: d.x, y: d.y, features: d.features }))}
                    modelType={(bestModel?.candidate.type || (currentModelType === 'kmeans' ? 'linear' : currentModelType))}
                    currentDegree={bestModel?.candidate.degree || currentDegree}
                    currentAlpha={bestModel?.candidate.alpha || currentAlpha}
                    includeInteractions={bestModel?.candidate.includeInteractions ?? currentInteractions}
                    language={language}
                    isDark={isDark}
                  />
                </div>
              )}

              {/* Automatic Text Report View */}
              {activeTab === 'report' && (
                <div className="p-4 bg-[var(--cds-layer-01)] rounded-xl border border-[var(--cds-border-subtle)] space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--cds-border-subtle)]">
                    <div>
                      <h4 className="text-xs font-bold text-[var(--cds-text-01)] flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-indigo-500" />
                        <span>{language === 'ar' ? 'تقرير التقييم الإحصائي ومستوى تحسن الدقة' : 'Statistical Improvement & Summary Report'}</span>
                      </h4>
                      <p className="text-[11px] text-[var(--cds-text-03)] mt-0.5">
                        {language === 'ar'
                          ? 'ملخص نصي مؤتمت يحلل المعاملات الفائقة المثلى ويقارن دقة النموذج الفائز مقابل خط الأساس.'
                          : 'Automated executive summary quantifying accuracy gains and hyperparameter performance.'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCopyReport}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] text-[var(--cds-text-01)] border border-[var(--cds-border-subtle)] transition-all active:scale-95 cursor-pointer shadow-2xs"
                      >
                        {copiedReport ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">{language === 'ar' ? 'تم النسخ!' : 'Copied!'}</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-[var(--cds-text-03)]" />
                            <span>{language === 'ar' ? 'نسخ التقرير' : 'Copy Report'}</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleDownloadReport}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-all active:scale-95 cursor-pointer shadow-2xs"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'تنزيل التقرير (.md)' : 'Download (.md)'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Formatted Markdown Box */}
                  <div className="p-4 rounded-xl bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] font-mono text-xs leading-relaxed text-[var(--cds-text-01)] max-h-[380px] overflow-y-auto whitespace-pre-wrap select-text">
                    {summaryReport}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Guide / Educational Callout */}
          <div className="p-3 bg-[var(--cds-layer-02)] rounded-xl border border-[var(--cds-border-subtle)] flex items-start gap-2.5 text-xs text-[var(--cds-text-03)]">
            <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-[var(--cds-text-01)] block mb-0.5">
                {language === 'ar' ? 'كيف يعمل البحث الشبكي (Grid Search CV)؟' : 'How does Grid Search CV work?'}
              </span>
              <span>
                {language === 'ar'
                  ? 'يقوم البحث الشبكي ببناء مصفوفة من جميع المعاملات المحتملة وتدريب كل توليفة على طيات التحقق المتقاطع (K-Folds). النموذج الذي يحقق أعلى معدل دقة على بيانات التحقق الخارجة عن التدريب مع الحفاظ على فجوة تعميم ضئيلة هو النموذج الفائز القادر على التنبؤ في العالم الحقيقي.'
                  : 'Grid search evaluates every parameter combination using K-fold CV. The model with highest validation score and lowest generalization gap is crowned winner.'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] text-xs">
          <div className="text-[var(--cds-text-03)]">
            {results.length > 0 ? (
              <span>
                {language === 'ar' ? `تم تقييم ${results.length} توليفة بنجاح.` : `Evaluated ${results.length} candidate models.`}
              </span>
            ) : (
              <span>
                {language === 'ar' ? 'اضغط "بدء تشغيل البحث الشبكي" للمقارنة.' : 'Click "Run Grid Search" to compare candidates.'}
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] text-[var(--cds-text-01)] hover:bg-[var(--cds-layer-03)] font-semibold transition-colors cursor-pointer"
          >
            {language === 'ar' ? 'إغلاق' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
