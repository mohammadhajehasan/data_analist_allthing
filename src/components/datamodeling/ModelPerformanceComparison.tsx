import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts';
import {
  BarChart3,
  Award,
  Zap,
  Activity,
  CheckCircle2,
  TrendingUp,
  Sliders,
  ShieldCheck,
  Cpu,
  Layers,
  ArrowUpDown,
  Download,
  Info,
  Maximize2
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

export interface ModelBenchmarkItem {
  id: string;
  name: string;
  nameAr: string;
  type: string;
  category: 'Linear' | 'Regularized' | 'Non-Linear' | 'Ensemble';
  r2: number;
  testR2: number;
  rmse: number;
  mae: number;
  trainingTimeMs: number;
  complexityScore: number; // 1 to 10
  generalizationScore: number; // 0 to 100
  cvMeanR2: number;
  cvStd: number;
  color: string;
  isBest?: boolean;
}

const DEFAULT_BENCHMARK_MODELS: ModelBenchmarkItem[] = [
  {
    id: 'lr',
    name: 'Ordinary Least Squares (Linear)',
    nameAr: 'الانحدار الخطي البسيط (OLS)',
    type: 'linear',
    category: 'Linear',
    r2: 0.812,
    testR2: 0.798,
    rmse: 4.82,
    mae: 3.65,
    trainingTimeMs: 4.2,
    complexityScore: 2,
    generalizationScore: 92,
    cvMeanR2: 0.795,
    cvStd: 0.021,
    color: '#0f62fe',
  },
  {
    id: 'ridge',
    name: 'Ridge Regression (L2 Penalty)',
    nameAr: 'انحدار ريدج (Ridge L2)',
    type: 'ridge',
    category: 'Regularized',
    r2: 0.829,
    testR2: 0.822,
    rmse: 4.31,
    mae: 3.24,
    trainingTimeMs: 6.8,
    complexityScore: 3,
    generalizationScore: 96,
    cvMeanR2: 0.819,
    cvStd: 0.014,
    color: '#1192e8',
  },
  {
    id: 'lasso',
    name: 'Lasso Regression (L1 Sparsity)',
    nameAr: 'انحدار لاسو (Lasso L1)',
    type: 'lasso',
    category: 'Regularized',
    r2: 0.815,
    testR2: 0.809,
    rmse: 4.55,
    mae: 3.41,
    trainingTimeMs: 8.1,
    complexityScore: 3,
    generalizationScore: 94,
    cvMeanR2: 0.805,
    cvStd: 0.018,
    color: '#007d79',
  },
  {
    id: 'poly2',
    name: 'Polynomial Regression (Degree 2)',
    nameAr: 'انحدار متعدد الحدود (درجة 2)',
    type: 'polynomial',
    category: 'Non-Linear',
    r2: 0.891,
    testR2: 0.874,
    rmse: 3.48,
    mae: 2.61,
    trainingTimeMs: 14.5,
    complexityScore: 5,
    generalizationScore: 89,
    cvMeanR2: 0.868,
    cvStd: 0.026,
    color: '#8a3ffc',
  },
  {
    id: 'poly3',
    name: 'Polynomial Regression (Degree 3)',
    nameAr: 'انحدار متعدد الحدود (درجة 3)',
    type: 'polynomial',
    category: 'Non-Linear',
    r2: 0.942,
    testR2: 0.852,
    rmse: 3.82,
    mae: 2.94,
    trainingTimeMs: 32.0,
    complexityScore: 8,
    generalizationScore: 71,
    cvMeanR2: 0.841,
    cvStd: 0.048,
    color: '#fa4d56',
  },
  {
    id: 'rf',
    name: 'Random Forest Regressor (100 Trees)',
    nameAr: 'الغابات العشوائية (Random Forest)',
    type: 'random_forest',
    category: 'Ensemble',
    r2: 0.938,
    testR2: 0.915,
    rmse: 2.76,
    mae: 2.05,
    trainingTimeMs: 86.4,
    complexityScore: 7,
    generalizationScore: 95,
    cvMeanR2: 0.912,
    cvStd: 0.012,
    color: '#24a148',
    isBest: true,
  },
  {
    id: 'gbt',
    name: 'Gradient Boosting (XGBoost Equivalent)',
    nameAr: 'التعزيز التدريجي (Gradient Boosting)',
    type: 'gradient_boosting',
    category: 'Ensemble',
    r2: 0.954,
    testR2: 0.928,
    rmse: 2.45,
    mae: 1.82,
    trainingTimeMs: 112.0,
    complexityScore: 8,
    generalizationScore: 93,
    cvMeanR2: 0.924,
    cvStd: 0.015,
    color: '#009d9a',
  },
];

interface ModelPerformanceComparisonProps {
  customModels?: ModelBenchmarkItem[];
  onSelectModel?: (model: ModelBenchmarkItem) => void;
}

export const ModelPerformanceComparison: React.FC<ModelPerformanceComparisonProps> = ({
  customModels,
  onSelectModel,
}) => {
  const { language, toast } = useApp();
  const isAr = language === 'ar';

  const [modelsData] = useState<ModelBenchmarkItem[]>(
    customModels && customModels.length > 0 ? customModels : DEFAULT_BENCHMARK_MODELS
  );

  const [viewType, setViewType] = useState<'bar' | 'radar' | 'table'>('bar');
  const [selectedMetric, setSelectedMetric] = useState<'r2' | 'rmse' | 'mae' | 'generalizationScore' | 'trainingTimeMs'>('r2');
  const [sortBy, setSortBy] = useState<'r2' | 'rmse' | 'time' | 'generalization'>('r2');
  const [selectedModelId, setSelectedModelId] = useState<string>('rf');

  // Sorted list based on user preference
  const sortedModels = useMemo(() => {
    return [...modelsData].sort((a, b) => {
      if (sortBy === 'r2') return b.testR2 - a.testR2;
      if (sortBy === 'rmse') return a.rmse - b.rmse;
      if (sortBy === 'time') return a.trainingTimeMs - b.trainingTimeMs;
      if (sortBy === 'generalization') return b.generalizationScore - a.generalizationScore;
      return 0;
    });
  }, [modelsData, sortBy]);

  const bestModel = useMemo(() => {
    return sortedModels[0] || modelsData[0];
  }, [sortedModels, modelsData]);

  // Selected Model Details
  const activeModel = useMemo(() => {
    return modelsData.find(m => m.id === selectedModelId) || bestModel;
  }, [modelsData, selectedModelId, bestModel]);

  // Recharts Bar Data Preparation
  const chartData = useMemo(() => {
    return sortedModels.map(m => ({
      id: m.id,
      name: isAr ? m.nameAr : m.name,
      shortName: isAr ? m.nameAr.split(' ')[0] : m.name.split(' ')[0],
      r2: Number((m.testR2 * 100).toFixed(1)),
      trainR2: Number((m.r2 * 100).toFixed(1)),
      rmse: Number(m.rmse.toFixed(2)),
      mae: Number(m.mae.toFixed(2)),
      generalizationScore: m.generalizationScore,
      trainingTimeMs: Number(m.trainingTimeMs.toFixed(1)),
      color: m.color,
      isWinner: m.id === bestModel.id,
    }));
  }, [sortedModels, isAr, bestModel]);

  // Recharts Radar Data for Multi-Dimensional Profile Comparison
  const radarData = useMemo(() => {
    const metricsKeys = [
      { key: 'accuracy', name: isAr ? 'دقة التنبؤ (R²)' : 'Test Accuracy (R²)' },
      { key: 'generalization', name: isAr ? 'مقاومة الإفراط (Generalization)' : 'Generalization' },
      { key: 'errorEff', name: isAr ? 'كفاءة الخطأ (Low RMSE)' : 'Error Efficiency' },
      { key: 'speed', name: isAr ? 'سرعة المعالجة (Speed)' : 'Inference Speed' },
      { key: 'parsimony', name: isAr ? 'بساطة النموذج (Parsimony)' : 'Model Parsimony' },
    ];

    return metricsKeys.map(item => {
      const row: Record<string, any> = { metric: item.name };
      modelsData.forEach(m => {
        let val = 50;
        if (item.key === 'accuracy') val = Math.min(100, Math.max(10, m.testR2 * 100));
        if (item.key === 'generalization') val = m.generalizationScore;
        if (item.key === 'errorEff') val = Math.min(100, Math.max(10, 100 - m.rmse * 12));
        if (item.key === 'speed') val = Math.min(100, Math.max(10, 100 - (m.trainingTimeMs / 120) * 80));
        if (item.key === 'parsimony') val = (11 - m.complexityScore) * 10;
        row[m.id] = Math.round(val);
      });
      return row;
    });
  }, [modelsData, isAr]);

  const metricLabels: Record<string, { title: string; unit: string; desc: string }> = {
    r2: {
      title: isAr ? 'معامل التحديد للاختبار (Test R² %)' : 'Out-of-Sample Test R² (%)',
      unit: '%',
      desc: isAr ? 'يقيس النسبة المئوية للتباين المفسر من النموذج على بيانات جديدة غير مسبوقة.' : 'Percentage of variance explained on unseen holdout test data.',
    },
    rmse: {
      title: isAr ? 'جذر متوسط مربع الخطأ (RMSE)' : 'Root Mean Squared Error (RMSE)',
      unit: '',
      desc: isAr ? 'يقيس متوسط المسافة بين القيم الحقيقية والمتوقعة (الأقل هو الأفضل).' : 'Standard deviation of residuals; penalizes larger errors more heavily (lower is better).',
    },
    mae: {
      title: isAr ? 'متوسط الخطأ المطلق (MAE)' : 'Mean Absolute Error (MAE)',
      unit: '',
      desc: isAr ? 'يقيس الحجم المتوسط للأخطاء في التنبؤات من دون مراعاة الاتجاه (الأقل هو الأفضل).' : 'Average absolute deviation between target and predicted values.',
    },
    generalizationScore: {
      title: isAr ? 'درجة التعميم ومقاومة الإفراط (Generalization Score)' : 'Generalization Score (/100)',
      unit: '/100',
      desc: isAr ? 'يقيس استقرار النموذج بين بيانات التدريب والاختبار وخلوه من Overfitting.' : 'Robustness against overfitting, calculated from train-test consistency.',
    },
    trainingTimeMs: {
      title: isAr ? 'زمن التدريب والمعالجة (Latency ms)' : 'Training Latency (ms)',
      unit: 'ms',
      desc: isAr ? 'الوقت الزمني المستغرق لتجهيز وتدريب النموذج بالملي ثانية.' : 'Computation duration taken to fit hyperparameters and converge.',
    },
  };

  const handleExportSummary = () => {
    const textData = sortedModels.map((m, idx) => 
      `${idx + 1}. ${m.name} [${m.category}] -> Test R²: ${(m.testR2 * 100).toFixed(1)}%, RMSE: ${m.rmse.toFixed(2)}, Generalization: ${m.generalizationScore}/100, Time: ${m.trainingTimeMs}ms`
    ).join('\n');
    
    const blob = new Blob([textData], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `model_benchmark_comparison_${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);

    toast.success(
      isAr ? 'تم تصدير تقرير المقارنة بنجاح!' : 'Benchmark Report Exported!',
      isAr ? 'تم تنزيل ملخص مقارنة أداء النماذج كملف نصي.' : 'Comparison summary downloaded successfully.'
    );
  };

  return (
    <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg p-5 space-y-6 shadow-md">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[var(--cds-border-subtle)] pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[var(--cds-interactive-01)]" />
            <h3 className="text-base font-bold text-[var(--cds-text-01)]">
              {isAr ? 'مقارنة أداء نماذج تعلم الآلة (Machine Learning Model Benchmark)' : 'Machine Learning Model Performance Benchmark'}
            </h3>
            <span className="px-2 py-0.5 text-[10px] font-mono bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded font-bold flex items-center gap-1">
              <Award className="w-3 h-3" />
              {isAr ? 'مدعوم بـ Recharts' : 'Powered by Recharts'}
            </span>
          </div>
          <p className="text-xs text-[var(--cds-text-03)]">
            {isAr
              ? 'تحليل ومقارنة دقة وتعميم وسرعة مختلف خوارزميات الانحدار لتسهيل اتخاذ قرار النموذج الأمثل للنشر.'
              : 'Evaluate and compare test accuracy, generalization stability, and latency across regression algorithms to facilitate optimal model selection.'}
          </p>
        </div>

        {/* Action and Switcher buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* View Toggle */}
          <div className="flex items-center bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] p-0.5 rounded-lg text-xs font-mono">
            <button
              onClick={() => setViewType('bar')}
              className={`px-3 py-1.5 rounded-md font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                viewType === 'bar' ? 'bg-[var(--cds-interactive-01)] text-white shadow-xs' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>{isAr ? 'رسم شريطي (Bar)' : 'Bar Chart'}</span>
            </button>
            <button
              onClick={() => setViewType('radar')}
              className={`px-3 py-1.5 rounded-md font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                viewType === 'radar' ? 'bg-[var(--cds-interactive-01)] text-white shadow-xs' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              <span>{isAr ? 'تحليل رادار (Radar)' : 'Radar Profile'}</span>
            </button>
            <button
              onClick={() => setViewType('table')}
              className={`px-3 py-1.5 rounded-md font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                viewType === 'table' ? 'bg-[var(--cds-interactive-01)] text-white shadow-xs' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{isAr ? 'جدول المقارنة' : 'Metrics Table'}</span>
            </button>
          </div>

          {/* Export Report Button */}
          <button
            onClick={handleExportSummary}
            className="px-3 py-1.5 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-hover-ui)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] text-xs font-mono font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-[#78a9ff]" />
            <span>{isAr ? 'تصدير الملخص' : 'Export Summary'}</span>
          </button>
        </div>
      </div>

      {/* Metric Selector & Sort Filter Row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[var(--cds-layer-02)] p-3 rounded-lg border border-[var(--cds-border-subtle)] text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[var(--cds-text-03)] font-semibold flex items-center gap-1">
            <Sliders className="w-3.5 h-3.5" />
            {isAr ? 'المعيار المقارن:' : 'Comparison Metric:'}
          </span>
          <div className="flex items-center gap-1 flex-wrap">
            {(['r2', 'rmse', 'mae', 'generalizationScore', 'trainingTimeMs'] as const).map(mKey => (
              <button
                key={mKey}
                onClick={() => setSelectedMetric(mKey)}
                className={`px-2.5 py-1 rounded font-mono text-[11px] font-semibold transition-all cursor-pointer ${
                  selectedMetric === mKey
                    ? 'bg-[var(--cds-interactive-01)] text-white shadow-xs'
                    : 'bg-[var(--cds-layer-01)] text-[var(--cds-text-02)] hover:bg-[var(--cds-hover-ui)] border border-[var(--cds-border-subtle)]'
                }`}
              >
                {mKey === 'r2' ? 'R² (Accuracy)' : mKey.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <span className="font-mono text-[var(--cds-text-03)] text-[11px] flex items-center gap-1">
            <ArrowUpDown className="w-3 h-3" />
            {isAr ? 'ترتيب حسب:' : 'Sort by:'}
          </span>
          <select
            value={sortBy}
            onChange={(e: any) => setSortBy(e.target.value)}
            className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] text-xs font-mono rounded px-2 py-1 outline-hidden"
          >
            <option value="r2">{isAr ? 'الأعلى دقة (Best R²)' : 'Highest Accuracy (R²)'}</option>
            <option value="rmse">{isAr ? 'الأقل خطأ (Lowest RMSE)' : 'Lowest Error (RMSE)'}</option>
            <option value="generalization">{isAr ? 'الأعلى تعميماً (Best Generalization)' : 'Best Generalization'}</option>
            <option value="time">{isAr ? 'الأسرع تدريباً (Fastest)' : 'Fastest Training'}</option>
          </select>
        </div>
      </div>

      {/* Top Winner Card Recommendation */}
      <div className="bg-gradient-to-r from-[var(--cds-interactive-01)]/10 via-[var(--cds-layer-02)] to-[var(--cds-interactive-01)]/5 border border-[var(--cds-interactive-01)]/30 rounded-lg p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[var(--cds-interactive-01)] text-white flex items-center justify-center shrink-0 shadow-md">
            <Award className="w-6 h-6" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase text-emerald-400 font-bold tracking-wider">
                {isAr ? 'النموذج الموصى به لاتخاذ القرار' : 'Recommended Optimal Model'}
              </span>
              <span className="px-2 py-0.2 rounded-full text-[10px] font-mono bg-[var(--cds-interactive-01)] text-white">
                {bestModel.category}
              </span>
            </div>
            <h4 className="text-sm font-bold text-[var(--cds-text-01)]">
              {isAr ? bestModel.nameAr : bestModel.name}
            </h4>
            <p className="text-xs text-[var(--cds-text-03)]">
              {isAr
                ? `يحقق أعلى دقة تعميم (Test R² = ${(bestModel.testR2 * 100).toFixed(1)}%) مع توازن ممتاز في مقاومة التوافق المفرط (${bestModel.generalizationScore}/100).`
                : `Achieved highest out-of-sample performance (Test R² = ${(bestModel.testR2 * 100).toFixed(1)}%) with superior overfitting resilience (${bestModel.generalizationScore}/100).`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right rtl:text-left font-mono">
            <span className="text-[10px] text-[var(--cds-text-03)] block">{isAr ? 'دقة الاختبار (Test R²)' : 'Test R²'}</span>
            <span className="text-base font-bold text-emerald-400">{(bestModel.testR2 * 100).toFixed(1)}%</span>
          </div>
          <div className="text-right rtl:text-left font-mono">
            <span className="text-[10px] text-[var(--cds-text-03)] block">{isAr ? 'الخطأ (RMSE)' : 'RMSE'}</span>
            <span className="text-base font-bold text-[#78a9ff]">{bestModel.rmse.toFixed(2)}</span>
          </div>
          {onSelectModel && (
            <button
              onClick={() => onSelectModel(bestModel)}
              className="px-3.5 py-2 bg-[var(--cds-interactive-01)] hover:bg-[var(--cds-interactive-01)]/90 text-white font-mono text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isAr ? 'اعتماد هذا النموذج' : 'Select Model'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Visualization Canvas */}
      {viewType === 'bar' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-[var(--cds-text-03)] font-mono">
            <span>{metricLabels[selectedMetric].title}</span>
            <span>{metricLabels[selectedMetric].desc}</span>
          </div>
          <div className="h-[320px] w-full bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 10, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" />
                <XAxis
                  dataKey="shortName"
                  stroke="var(--cds-text-03)"
                  tick={{ fill: 'var(--cds-text-02)', fontSize: 11, fontFamily: 'monospace' }}
                  angle={-15}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis
                  stroke="var(--cds-text-03)"
                  tick={{ fill: 'var(--cds-text-02)', fontSize: 11, fontFamily: 'monospace' }}
                  unit={metricLabels[selectedMetric].unit}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-3 rounded-lg shadow-xl text-xs font-mono space-y-1.5 z-50 text-left rtl:text-right">
                          <div className="flex items-center gap-2 font-bold text-white">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: data.color }} />
                            <span>{data.name}</span>
                            {data.isWinner && (
                              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">
                                Winner
                              </span>
                            )}
                          </div>
                          <div className="space-y-1 text-[var(--cds-text-02)] text-[11px] pt-1 border-t border-[var(--cds-border-subtle)]">
                            <div>Test R²: <span className="text-white font-bold">{data.r2}%</span> (Train R²: {data.trainR2}%)</div>
                            <div>RMSE: <span className="text-white font-bold">{data.rmse}</span></div>
                            <div>MAE: <span className="text-white font-bold">{data.mae}</span></div>
                            <div>Generalization: <span className="text-emerald-400 font-bold">{data.generalizationScore}/100</span></div>
                            <div>Latency: <span className="text-[#78a9ff] font-bold">{data.trainingTimeMs} ms</span></div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  wrapperStyle={{ paddingTop: '10px', fontSize: '11px', fontFamily: 'monospace' }}
                />
                <Bar
                  dataKey={selectedMetric}
                  name={metricLabels[selectedMetric].title}
                  radius={[4, 4, 0, 0]}
                  onClick={(entry) => setSelectedModelId(entry.id)}
                  cursor="pointer"
                >
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.id === selectedModelId ? '#f1c21b' : entry.color}
                      stroke={entry.isWinner ? '#24a148' : 'none'}
                      strokeWidth={entry.isWinner ? 2 : 0}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Radar Profile View */}
      {viewType === 'radar' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 h-[340px] bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg p-3">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="rgba(128,128,128,0.2)" />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fill: 'var(--cds-text-01)', fontSize: 11, fontFamily: 'monospace' }}
                />
                <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="var(--cds-text-03)" />
                {modelsData.slice(0, 4).map(m => (
                  <Radar
                    key={m.id}
                    name={isAr ? m.nameAr : m.name}
                    dataKey={m.id}
                    stroke={m.color}
                    fill={m.color}
                    fillOpacity={m.id === selectedModelId ? 0.4 : 0.1}
                  />
                ))}
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace' }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Model Dimension Breakdown Info */}
          <div className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg p-4 space-y-3 font-mono text-xs">
            <h4 className="font-bold text-[var(--cds-text-01)] flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>{isAr ? 'محاور تقييم الرادار' : 'Radar Evaluation Dimensions'}</span>
            </h4>
            <div className="space-y-2 text-[11px] text-[var(--cds-text-02)]">
              <div className="p-2 bg-[var(--cds-layer-01)] rounded border border-[var(--cds-border-subtle)]">
                <span className="font-bold text-white block">{isAr ? '1. دقة التنبؤ (Test Accuracy):' : '1. Test Accuracy:'}</span>
                <span>{isAr ? 'مقياس R² المحسوب على عينة التحقق خارج التدريب.' : 'Holdout test R² variance explanation ratio.'}</span>
              </div>
              <div className="p-2 bg-[var(--cds-layer-01)] rounded border border-[var(--cds-border-subtle)]">
                <span className="font-bold text-white block">{isAr ? '2. مقاومة التوافق المفرط (Generalization):' : '2. Generalization Stability:'}</span>
                <span>{isAr ? 'تقارب النتائج بين داخل العينة وخارجها لمنع الانحياز.' : 'Train-test gap proximity ensuring no overfitting.'}</span>
              </div>
              <div className="p-2 bg-[var(--cds-layer-01)] rounded border border-[var(--cds-border-subtle)]">
                <span className="font-bold text-white block">{isAr ? '3. سرعة الاستنتاج (Inference Speed):' : '3. Inference Latency:'}</span>
                <span>{isAr ? 'معدل المعالجة بالملي ثانية لإتاحة الاستخدام في الوقت الحقيقي.' : 'Computation speed for real-time serving.'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Table Comparison View */}
      {viewType === 'table' && (
        <div className="overflow-x-auto border border-[var(--cds-border-subtle)] rounded-lg">
          <table className="w-full text-xs font-mono text-left rtl:text-right">
            <thead className="bg-[var(--cds-layer-02)] text-[var(--cds-text-03)] border-b border-[var(--cds-border-subtle)] uppercase text-[10px]">
              <tr>
                <th className="p-3">{isAr ? 'النموذج' : 'Model'}</th>
                <th className="p-3">{isAr ? 'الفئة' : 'Category'}</th>
                <th className="p-3">Test R²</th>
                <th className="p-3">Train R²</th>
                <th className="p-3">RMSE</th>
                <th className="p-3">MAE</th>
                <th className="p-3">{isAr ? 'التعميم' : 'Generalization'}</th>
                <th className="p-3">{isAr ? 'الزمن (ms)' : 'Latency'}</th>
                <th className="p-3 text-center">{isAr ? 'الإجراء' : 'Action'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)]">
              {sortedModels.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => setSelectedModelId(m.id)}
                  className={`hover:bg-[var(--cds-hover-ui)] transition-colors cursor-pointer ${
                    m.id === selectedModelId ? 'bg-[var(--cds-layer-02)] font-semibold' : ''
                  }`}
                >
                  <td className="p-3 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
                    <span className="text-[var(--cds-text-01)]">{isAr ? m.nameAr : m.name}</span>
                    {m.id === bestModel.id && (
                      <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded font-bold">
                        Best
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-[var(--cds-text-02)]">{m.category}</td>
                  <td className="p-3 font-bold text-emerald-400">{(m.testR2 * 100).toFixed(1)}%</td>
                  <td className="p-3 text-[var(--cds-text-02)]">{(m.r2 * 100).toFixed(1)}%</td>
                  <td className="p-3 text-[#78a9ff]">{m.rmse.toFixed(2)}</td>
                  <td className="p-3 text-[var(--cds-text-02)]">{m.mae.toFixed(2)}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] ${
                      m.generalizationScore >= 90
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : m.generalizationScore >= 80
                        ? 'bg-amber-500/10 text-amber-400'
                        : 'bg-red-500/10 text-red-400'
                    }`}>
                      {m.generalizationScore}/100
                    </span>
                  </td>
                  <td className="p-3 text-[var(--cds-text-02)]">{m.trainingTimeMs.toFixed(1)} ms</td>
                  <td className="p-3 text-center">
                    {onSelectModel ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectModel(m);
                        }}
                        className="px-2.5 py-1 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-interactive-01)] hover:text-white text-[var(--cds-text-01)] border border-[var(--cds-border-subtle)] rounded text-[10px] font-bold transition-colors cursor-pointer"
                      >
                        {isAr ? 'اختيار' : 'Select'}
                      </button>
                    ) : (
                      <span className="text-[10px] text-[var(--cds-text-03)]">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
