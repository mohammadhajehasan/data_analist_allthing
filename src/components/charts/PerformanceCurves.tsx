import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ReferenceArea
} from 'recharts';
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  BarChart3,
  Layers,
  ArrowRight,
  ShieldAlert,
  Info
} from 'lucide-react';
import {
  createPolynomialFeatures,
  calculateRidgeRegression,
  calculateRegressionMetrics
} from '../../utils/mathUtils';
import { GridSearchPoint, createKFolds } from '../../utils/gridSearchUtils';

interface PerformanceCurvesProps {
  data: GridSearchPoint[];
  modelType: 'linear' | 'polynomial' | 'ridge';
  currentDegree: number;
  currentAlpha?: number;
  includeInteractions?: boolean;
  language: 'ar' | 'en';
  isDark?: boolean;
}

export const PerformanceCurves: React.FC<PerformanceCurvesProps> = ({
  data,
  modelType,
  currentDegree,
  currentAlpha = 1.0,
  includeInteractions = false,
  language,
  isDark = false
}) => {
  const isAr = language === 'ar';
  const [activeCurveTab, setActiveCurveTab] = useState<'validation' | 'learning'>('validation');
  const [metricType, setMetricType] = useState<'r2' | 'rmse'>('r2');

  // Colors based on theme
  const trainColor = '#3b82f6'; // Blue
  const valColor = '#10b981'; // Emerald
  const overfitColor = '#ef4444'; // Red
  const gridColor = isDark ? '#374151' : '#e5e7eb';
  const textColor = isDark ? '#9ca3af' : '#4b5563';

  // 1. Calculate Validation Curve across Model Degrees (Degree 1 to 8)
  const validationCurveData = useMemo(() => {
    if (!data || data.length < 6) return [];

    const k = 5;
    const folds: GridSearchPoint[][] = createKFolds<GridSearchPoint>(data, k, 1337);
    const maxDegree = Math.min(8, Math.max(4, Math.floor(data.length / 4)));
    const curvePoints: Array<{
      degree: number;
      trainR2: number;
      valR2: number;
      trainRmse: number;
      valRmse: number;
      gap: number;
      isCurrent: boolean;
      zone: 'underfitting' | 'optimal' | 'overfitting';
    }> = [];

    for (let deg = 1; deg <= maxDegree; deg++) {
      let foldTrainR2Sum = 0;
      let foldValR2Sum = 0;
      let foldTrainRmseSum = 0;
      let foldValRmseSum = 0;
      let validFolds = 0;

      const lambda = modelType === 'ridge' ? Math.max(1e-6, currentAlpha) : (deg > 5 ? 1e-4 : 1e-7);

      for (let f = 0; f < k; f++) {
        const testPoints: GridSearchPoint[] = folds[f];
        const trainPoints: GridSearchPoint[] = folds.reduce<GridSearchPoint[]>((acc, fold, idx) => idx !== f ? acc.concat(fold) : acc, []);
        if (trainPoints.length < deg + 2 || testPoints.length === 0) continue;

        try {
          const trainX = trainPoints.map(p => deg > 1 ? createPolynomialFeatures(p.features, deg, false) : p.features);
          const trainY = trainPoints.map(p => p.y);
          const testX = testPoints.map(p => deg > 1 ? createPolynomialFeatures(p.features, deg, false) : p.features);
          const testY = testPoints.map(p => p.y);

          const model = calculateRidgeRegression(trainX, trainY, lambda);

          const trainPreds = trainX.map(x => model.predict(x));
          const testPreds = testX.map(x => model.predict(x));

          const trainMetrics = calculateRegressionMetrics(trainY, trainPreds, deg + 1);
          const testMetrics = calculateRegressionMetrics(testY, testPreds, deg + 1);

          foldTrainR2Sum += Math.max(-1, Math.min(1, trainMetrics.r2));
          foldValR2Sum += Math.max(-1.5, Math.min(1, testMetrics.r2));
          foldTrainRmseSum += trainMetrics.rmse;
          foldValRmseSum += testMetrics.rmse;
          validFolds++;
        } catch {
          // ignore singular matrix in high degree
        }
      }

      if (validFolds > 0) {
        const meanTrainR2 = Number((foldTrainR2Sum / validFolds).toFixed(3));
        const meanValR2 = Number((foldValR2Sum / validFolds).toFixed(3));
        const meanTrainRmse = Number((foldTrainRmseSum / validFolds).toFixed(3));
        const meanValRmse = Number((foldValRmseSum / validFolds).toFixed(3));
        const gap = Number(Math.max(0, meanTrainR2 - meanValR2).toFixed(3));

        let zone: 'underfitting' | 'optimal' | 'overfitting' = 'optimal';
        if (deg === 1 && meanValR2 < 0.60) {
          zone = 'underfitting';
        } else if (gap > 0.15 || meanValR2 < 0.3) {
          zone = 'overfitting';
        }

        curvePoints.push({
          degree: deg,
          trainR2: meanTrainR2,
          valR2: meanValR2,
          trainRmse: meanTrainRmse,
          valRmse: meanValRmse,
          gap,
          isCurrent: deg === currentDegree,
          zone
        });
      }
    }

    return curvePoints;
  }, [data, modelType, currentAlpha, currentDegree]);

  // Optimal degree according to validation curve
  const optimalPoint = useMemo(() => {
    if (validationCurveData.length === 0) return null;
    return [...validationCurveData].sort((a, b) => b.valR2 - a.valR2)[0];
  }, [validationCurveData]);

  // Current model point
  const currentModelPoint = useMemo(() => {
    return validationCurveData.find(p => p.degree === currentDegree) || null;
  }, [validationCurveData, currentDegree]);

  // 2. Calculate Learning Curve across Training Sample Sizes
  const learningCurveData = useMemo(() => {
    if (!data || data.length < 8) return [];

    const shuffled = [...data].sort((a, b) => ((a.index * 17) % 97) - ((b.index * 17) % 97));
    const testCount = Math.max(3, Math.floor(shuffled.length * 0.25));
    const testSet = shuffled.slice(shuffled.length - testCount);
    const trainPool = shuffled.slice(0, shuffled.length - testCount);

    if (trainPool.length < 5) return [];

    const steps = 6;
    const curvePoints: Array<{
      sampleSize: number;
      trainR2: number;
      valR2: number;
      trainRmse: number;
      valRmse: number;
      gap: number;
    }> = [];

    const deg = modelType === 'linear' ? 1 : Math.max(1, currentDegree);
    const lambda = modelType === 'ridge' ? Math.max(1e-6, currentAlpha) : (deg > 5 ? 1e-4 : 1e-7);

    for (let s = 1; s <= steps; s++) {
      const currentCount = Math.max(deg + 2, Math.floor((trainPool.length * s) / steps));
      const subTrain = trainPool.slice(0, currentCount);

      try {
        const trainX = subTrain.map(p => deg > 1 ? createPolynomialFeatures(p.features, deg, includeInteractions) : p.features);
        const trainY = subTrain.map(p => p.y);
        const testX = testSet.map(p => deg > 1 ? createPolynomialFeatures(p.features, deg, includeInteractions) : p.features);
        const testY = testSet.map(p => p.y);

        const model = calculateRidgeRegression(trainX, trainY, lambda);

        const trainPreds = trainX.map(x => model.predict(x));
        const testPreds = testX.map(x => model.predict(x));

        const trainMetrics = calculateRegressionMetrics(trainY, trainPreds, deg + 1);
        const testMetrics = calculateRegressionMetrics(testY, testPreds, deg + 1);

        const tR2 = Number(Math.max(-0.5, Math.min(1, trainMetrics.r2)).toFixed(3));
        const vR2 = Number(Math.max(-1.0, Math.min(1, testMetrics.r2)).toFixed(3));
        const tRmse = Number(trainMetrics.rmse.toFixed(3));
        const vRmse = Number(testMetrics.rmse.toFixed(3));

        curvePoints.push({
          sampleSize: currentCount,
          trainR2: tR2,
          valR2: vR2,
          trainRmse: tRmse,
          valRmse: vRmse,
          gap: Number(Math.max(0, tR2 - vR2).toFixed(3))
        });
      } catch {
        // ignore numeric error
      }
    }

    return curvePoints;
  }, [data, modelType, currentDegree, currentAlpha, includeInteractions]);

  // Overfitting diagnostic message
  const diagnosis = useMemo(() => {
    if (!currentModelPoint) return null;
    const gap = currentModelPoint.gap;
    const val = currentModelPoint.valR2;

    if (currentModelPoint.zone === 'underfitting' || val < 0.40) {
      return {
        status: 'underfitting',
        titleAr: 'ضعف ملاءمة (Underfitting / High Bias)',
        titleEn: 'Underfitting (High Bias)',
        descAr: 'النموذج بسيط جداً ولا يستوعب العلاقات الجوهرية في البيانات. يُنصح بزيادة درجة كثير الحدود أو إضافة متغيرات تفاعلية.',
        descEn: 'The model is too simple to capture patterns. Consider increasing polynomial degree or adding interaction terms.',
        color: 'text-amber-500 border-amber-500/30 bg-amber-500/10'
      };
    } else if (gap > 0.15 || currentModelPoint.zone === 'overfitting') {
      return {
        status: 'overfitting',
        titleAr: 'تحذير: فرط تخصيص (Overfitting / High Variance)',
        titleEn: 'Warning: Overfitting (High Variance)',
        descAr: `دقة التدريب مرتفعة (${(currentModelPoint.trainR2 * 100).toFixed(1)}%) لكن دقة التحقق تتراجع إلى (${(currentModelPoint.valR2 * 100).toFixed(1)}%) مع فجوة تعميم واسعة (${gap.toFixed(3)}). النموذج يحفظ الضوضاء! قلل الدرجة أو فعّل جزاء Ridge.`,
        descEn: `High train accuracy (${(currentModelPoint.trainR2 * 100).toFixed(1)}%) but validation drops to (${(currentModelPoint.valR2 * 100).toFixed(1)}%) with large gap (${gap.toFixed(3)}). Reduce degree or add L2 Ridge penalty.`,
        color: 'text-rose-500 border-rose-500/30 bg-rose-500/10'
      };
    } else {
      return {
        status: 'optimal',
        titleAr: 'ملاءمة مثالية وتعليم متوازن (Optimal Balance)',
        titleEn: 'Optimal Balance & Good Generalization',
        descAr: `النموذج يظهر قدرة تعميم متزنة بفجوة ضئيلة (${gap.toFixed(3)}) ودقة تحقق ممتازة (${(val * 100).toFixed(1)}%). هذا النموذج آمن للتنبؤ.`,
        descEn: `Model exhibits balanced generalization with minimal gap (${gap.toFixed(3)}) and strong validation score (${(val * 100).toFixed(1)}%).`,
        color: 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10'
      };
    }
  }, [currentModelPoint]);

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Top Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--cds-layer-01)] p-3 rounded-xl border border-[var(--cds-border-subtle)] shadow-2xs">
        <div className="flex items-center gap-1.5 p-1 bg-[var(--cds-layer-02)] rounded-lg border border-[var(--cds-border-subtle)]">
          <button
            type="button"
            onClick={() => setActiveCurveTab('validation')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeCurveTab === 'validation'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs'
                : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>{isAr ? 'منحنى دقة التدريب مقابل الاختبار (Overfitting Curve)' : 'Validation / Complexity Curve'}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveCurveTab('learning')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeCurveTab === 'learning'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xs'
                : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{isAr ? 'منحنى التعلم وحجم العينة (Learning Curve)' : 'Learning Curve (Data Size)'}</span>
          </button>
        </div>

        {/* Metric Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--cds-text-03)] font-semibold">{isAr ? 'المقياس:' : 'Metric:'}</span>
          <div className="flex items-center gap-1 p-0.5 bg-[var(--cds-layer-02)] rounded-lg border border-[var(--cds-border-subtle)]">
            <button
              type="button"
              onClick={() => setMetricType('r2')}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                metricType === 'r2'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'
              }`}
            >
              R² Score
            </button>
            <button
              type="button"
              onClick={() => setMetricType('rmse')}
              className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                metricType === 'rmse'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'
              }`}
            >
              RMSE (Error)
            </button>
          </div>
        </div>
      </div>

      {/* Diagnosis Banner */}
      {diagnosis && (
        <div className={`p-4 rounded-xl border flex items-start gap-3.5 transition-all shadow-xs ${diagnosis.color}`}>
          {diagnosis.status === 'optimal' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          ) : diagnosis.status === 'overfitting' ? (
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
              <span className="font-bold text-sm">{isAr ? diagnosis.titleAr : diagnosis.titleEn}</span>
              {currentModelPoint && (
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-white/40 dark:bg-black/40">
                  {isAr ? `الدرجة الحالية: ${currentDegree}` : `Current Degree: ${currentDegree}`} | 
                  Train R² = {currentModelPoint.trainR2} | Val R² = {currentModelPoint.valR2} | 
                  Δ Gap = {currentModelPoint.gap}
                </span>
              )}
            </div>
            <p className="text-xs leading-relaxed opacity-90">{isAr ? diagnosis.descAr : diagnosis.descEn}</p>
          </div>
        </div>
      )}

      {/* Main Recharts Container */}
      <div className="bg-[var(--cds-layer-01)] p-4 rounded-xl border border-[var(--cds-border-subtle)] shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h4 className="text-sm font-bold text-[var(--cds-text-01)]">
              {activeCurveTab === 'validation'
                ? (isAr ? 'منحنى دقة التدريب مقابل الاختبار عبر درجات تعقيد النموذج' : 'Validation Curve: Model Complexity vs Training & Test Accuracy')
                : (isAr ? 'منحنى التعلم: تباين الأداء مع زيادة حجم عينة التدريب' : 'Learning Curve: Convergence with Training Data Size')}
            </h4>
            <p className="text-xs text-[var(--cds-text-03)] mt-0.5">
              {activeCurveTab === 'validation'
                ? (isAr ? 'مقارنة دقة التدريب (داخل العينة) ودقة الاختبار (التحقق المتقاطع 5-Fold) عبر درجات متعددة لرصد الانحياز وفرط التخصيص' : '5-Fold cross-validation comparison across degrees to detect overfitting variance')
                : (isAr ? 'يوضح ما إذا كان تزويد النموذج ببيانات تدريب إضافية يقلل خطأ التحقق ويزيد التعميم' : 'Shows whether collecting more training samples will improve generalization')}
            </p>
          </div>
          {optimalPoint && activeCurveTab === 'validation' && (
            <div className="text-xs px-3 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-bold flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{isAr ? `الدرجة المثلى إحصائياً: ${optimalPoint.degree}` : `Optimal Degree: ${optimalPoint.degree}`}</span>
            </div>
          )}
        </div>

        <div className="w-full h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            {activeCurveTab === 'validation' ? (
              <LineChart
                data={validationCurveData}
                margin={{ top: 15, right: 30, left: 10, bottom: 15 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} opacity={0.5} />
                <XAxis
                  dataKey="degree"
                  tick={{ fill: textColor, fontSize: 11 }}
                  tickLine={{ stroke: gridColor }}
                  label={{
                    value: isAr ? 'درجة تعقيد النموذج (Polynomial Degree)' : 'Polynomial Degree',
                    position: 'insideBottom',
                    offset: -10,
                    fill: textColor,
                    fontSize: 11
                  }}
                />
                <YAxis
                  tick={{ fill: textColor, fontSize: 11 }}
                  tickLine={{ stroke: gridColor }}
                  domain={metricType === 'r2' ? [-0.2, 1.05] : ['auto', 'auto']}
                  label={{
                    value: metricType === 'r2' ? (isAr ? 'معامل التحديد R²' : 'R² Score') : 'RMSE',
                    angle: -90,
                    position: 'insideLeft',
                    fill: textColor,
                    fontSize: 11
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#1f2937' : '#ffffff',
                    borderColor: isDark ? '#374151' : '#e5e7eb',
                    borderRadius: '0.75rem',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    fontSize: '12px',
                    color: isDark ? '#f3f4f6' : '#111827'
                  }}
                  formatter={(value: any, name: string) => {
                    const formatted = typeof value === 'number' ? value.toFixed(3) : value;
                    if (name === 'train') return [formatted, isAr ? 'دقة التدريب (Train Score)' : 'Train Score'];
                    if (name === 'val') return [formatted, isAr ? 'دقة الاختبار (Validation Score)' : 'Validation Score'];
                    return [formatted, name];
                  }}
                  labelFormatter={(label) => isAr ? `درجة كثير الحدود: ${label}` : `Degree: ${label}`}
                />
                <Legend
                  verticalAlign="top"
                  height={36}
                  formatter={(value) => {
                    if (value === 'train') return <span style={{ color: trainColor, fontWeight: 'bold' }}>{isAr ? 'بيانات التدريب (Train)' : 'Training Set'}</span>;
                    if (value === 'val') return <span style={{ color: valColor, fontWeight: 'bold' }}>{isAr ? 'بيانات التحقق والتقييم (Validation)' : 'Validation Set'}</span>;
                    return value;
                  }}
                />

                {/* Vertical reference for current model */}
                <ReferenceLine
                  x={currentDegree}
                  stroke="#8b5cf6"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  label={{
                    value: isAr ? 'النموذج الحالي' : 'Current Model',
                    position: 'top',
                    fill: '#8b5cf6',
                    fontSize: 10,
                    fontWeight: 'bold'
                  }}
                />

                {/* Optimal Degree Reference */}
                {optimalPoint && optimalPoint.degree !== currentDegree && (
                  <ReferenceLine
                    x={optimalPoint.degree}
                    stroke="#10b981"
                    strokeDasharray="2 2"
                    strokeWidth={1.5}
                    label={{
                      value: isAr ? 'الأمثل 🏆' : 'Optimal 🏆',
                      position: 'insideTopRight',
                      fill: '#10b981',
                      fontSize: 10,
                      fontWeight: 'bold'
                    }}
                  />
                )}

                <Line
                  type="monotone"
                  dataKey={metricType === 'r2' ? 'trainR2' : 'trainRmse'}
                  name="train"
                  stroke={trainColor}
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: trainColor }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey={metricType === 'r2' ? 'valR2' : 'valRmse'}
                  name="val"
                  stroke={valColor}
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: valColor }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            ) : (
              <LineChart
                data={learningCurveData}
                margin={{ top: 15, right: 30, left: 10, bottom: 15 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} opacity={0.5} />
                <XAxis
                  dataKey="sampleSize"
                  tick={{ fill: textColor, fontSize: 11 }}
                  tickLine={{ stroke: gridColor }}
                  label={{
                    value: isAr ? 'حجم عينة التدريب (Training Sample Size N)' : 'Training Sample Size (N)',
                    position: 'insideBottom',
                    offset: -10,
                    fill: textColor,
                    fontSize: 11
                  }}
                />
                <YAxis
                  tick={{ fill: textColor, fontSize: 11 }}
                  tickLine={{ stroke: gridColor }}
                  domain={metricType === 'r2' ? [-0.2, 1.05] : ['auto', 'auto']}
                  label={{
                    value: metricType === 'r2' ? (isAr ? 'معامل التحديد R²' : 'R² Score') : 'RMSE',
                    angle: -90,
                    position: 'insideLeft',
                    fill: textColor,
                    fontSize: 11
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#1f2937' : '#ffffff',
                    borderColor: isDark ? '#374151' : '#e5e7eb',
                    borderRadius: '0.75rem',
                    fontSize: '12px',
                    color: isDark ? '#f3f4f6' : '#111827'
                  }}
                  formatter={(value: any, name: string) => {
                    const formatted = typeof value === 'number' ? value.toFixed(3) : value;
                    if (name === 'train') return [formatted, isAr ? 'أداء التدريب (Train)' : 'Train'];
                    if (name === 'val') return [formatted, isAr ? 'أداء التحقق (Validation)' : 'Validation'];
                    return [formatted, name];
                  }}
                />
                <Legend
                  verticalAlign="top"
                  height={36}
                  formatter={(value) => {
                    if (value === 'train') return <span style={{ color: trainColor, fontWeight: 'bold' }}>{isAr ? 'بيانات التدريب (Train)' : 'Training Set'}</span>;
                    if (value === 'val') return <span style={{ color: valColor, fontWeight: 'bold' }}>{isAr ? 'بيانات التحقق (Validation)' : 'Validation Set'}</span>;
                    return value;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey={metricType === 'r2' ? 'trainR2' : 'trainRmse'}
                  name="train"
                  stroke={trainColor}
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: trainColor }}
                />
                <Line
                  type="monotone"
                  dataKey={metricType === 'r2' ? 'valR2' : 'valRmse'}
                  name="val"
                  stroke={valColor}
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: valColor }}
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* Informational Guidance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4 pt-4 border-t border-[var(--cds-border-subtle)] text-xs">
          <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-800 dark:text-blue-300">
            <span className="font-bold block mb-1">1. {isAr ? 'ضعف الملاءمة (Underfitting)' : 'Underfitting (High Bias)'}</span>
            <p className="text-[11px] leading-relaxed opacity-90">
              {isAr
                ? 'يحدث عند الدرجات الأولى المنخفضة حيث يعجز النموذج عن تمثيل الاتجاه الحقيقي وتكون دقة التدريب والاختبار متدنيتين معاً.'
                : 'Both train and test performance are low. The model is too rigid to capture underlying nonlinear patterns.'}
            </p>
          </div>

          <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300">
            <span className="font-bold block mb-1">2. {isAr ? 'المنطقة المثالية (Sweet Spot)' : 'Optimal Sweet Spot'}</span>
            <p className="text-[11px] leading-relaxed opacity-90">
              {isAr
                ? 'النقطة التي تبلغ فيها دقة التحقق (Validation R²) ذروتها مع بقاء فجوة التعميم أقل من 0.08، مما يضمن أقصى قدرة على التنبؤ بمشاهدات مستقبلية.'
                : 'Validation score peaks with minimal generalization gap (< 0.08). Best candidate for production predictions.'}
            </p>
          </div>

          <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-800 dark:text-rose-300">
            <span className="font-bold block mb-1">3. {isAr ? 'فرط التخصيص (Overfitting)' : 'Overfitting (High Variance)'}</span>
            <p className="text-[11px] leading-relaxed opacity-90">
              {isAr
                ? 'يقترب منحنى التدريب من 100% بينما ينحدر منحنى التحقق هبوطاً مع اتساع فجوة التعميم؛ النموذج يحفظ الضوضاء بدلاً من القاعدة العامة.'
                : 'Train accuracy reaches near 100% while validation drops drastically. The model memorizes random noise.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
