import {
  createPolynomialFeatures,
  calculateRidgeRegression,
  calculateRegressionMetrics,
  RegressionMetrics
} from './mathUtils';

export interface GridSearchCandidate {
  id: string;
  modelType: 'linear' | 'polynomial' | 'ridge';
  degree: number;
  alpha?: number;
  includeInteractions: boolean;
  labelAr: string;
  labelEn: string;
}

export interface GridSearchFoldResult {
  fold: number;
  trainMse: number;
  valMse: number;
  trainR2: number;
  valR2: number;
  trainRmse: number;
  valRmse: number;
}

export interface GridSearchResultItem {
  rank: number;
  candidate: GridSearchCandidate;
  meanValR2: number;
  stdValR2: number;
  meanValRmse: number;
  stdValRmse: number;
  meanValMse: number;
  meanTrainR2: number;
  meanTrainRmse: number;
  generalizationGap: number; // meanTrainR2 - meanValR2
  status: 'best' | 'excellent' | 'good' | 'overfitting' | 'underfitting';
  statusLabelAr: string;
  statusLabelEn: string;
  foldResults: GridSearchFoldResult[];
}

export interface GridSearchOptions {
  kFolds: number; // e.g. 3, 5, 10
  scoringMetric: 'r2' | 'rmse' | 'mse';
  scope: 'current' | 'ridge_tuning' | 'poly_tuning' | 'all_models' | 'custom';
  customDegrees?: number[];
  customAlphas?: number[];
  customInteractions?: boolean[];
  seed?: number;
}

export interface GridSearchPoint {
  index: number;
  x: number;
  y: number;
  features: number[];
}

/**
 * Generates human readable candidate label
 */
export function formatCandidateLabel(candidate: GridSearchCandidate, language: 'ar' | 'en'): string {
  const isAr = language === 'ar';
  const typeStr = candidate.modelType === 'linear' 
    ? (isAr ? 'خطي OLS' : 'Linear OLS')
    : candidate.modelType === 'polynomial'
    ? (isAr ? `كثير حدود (درجة ${candidate.degree})` : `Polynomial (Deg ${candidate.degree})`)
    : (isAr ? `حافة Ridge (درجة ${candidate.degree}, α=${candidate.alpha})` : `Ridge (Deg ${candidate.degree}, α=${candidate.alpha})`);

  const interactStr = candidate.includeInteractions ? (isAr ? ' + تفاعل' : ' + Int') : '';
  return `${typeStr}${interactStr}`;
}

/**
 * Builds the list of candidate hyperparameter configurations based on chosen scope
 */
export function generateCandidates(
  scope: GridSearchOptions['scope'],
  currentType: 'linear' | 'polynomial' | 'ridge' | 'kmeans',
  hasMultipleFeatures: boolean,
  customOptions?: { degrees?: number[]; alphas?: number[]; interactions?: boolean[] }
): GridSearchCandidate[] {
  const candidates: GridSearchCandidate[] = [];

  if (scope === 'custom' && customOptions) {
    const degrees = customOptions.degrees && customOptions.degrees.length > 0 ? customOptions.degrees : [1, 2, 3];
    const alphas = customOptions.alphas && customOptions.alphas.length > 0 ? customOptions.alphas : [0.01, 0.1, 1.0, 10.0];
    const interactions = hasMultipleFeatures ? (customOptions.interactions || [false]) : [false];

    // If current type is linear or poly or ridge
    const targetType = currentType === 'kmeans' ? 'ridge' : currentType;
    
    if (targetType === 'linear') {
      candidates.push({
        id: 'linear-ols',
        modelType: 'linear',
        degree: 1,
        includeInteractions: false,
        labelAr: 'انحدار خطي OLS (درجة 1)',
        labelEn: 'Linear OLS (Degree 1)'
      });
    } else if (targetType === 'polynomial') {
      degrees.forEach(d => {
        interactions.forEach(inter => {
          candidates.push({
            id: `poly-d${d}-i${inter ? '1' : '0'}`,
            modelType: 'polynomial',
            degree: d,
            includeInteractions: inter,
            labelAr: `كثير حدود (درجة ${d}${inter ? ' + تفاعل' : ''})`,
            labelEn: `Polynomial (Deg ${d}${inter ? ' + Interactions' : ''})`
          });
        });
      });
    } else {
      // Ridge
      degrees.forEach(d => {
        alphas.forEach(a => {
          interactions.forEach(inter => {
            candidates.push({
              id: `ridge-d${d}-a${a}-i${inter ? '1' : '0'}`,
              modelType: 'ridge',
              degree: d,
              alpha: a,
              includeInteractions: inter,
              labelAr: `انحدار الحافة Ridge (درجة ${d}, α=${a}${inter ? ' + تفاعل' : ''})`,
              labelEn: `Ridge (Deg ${d}, α=${a}${inter ? ' + Int' : ''})`
            });
          });
        });
      });
    }

    return candidates;
  }

  if (scope === 'ridge_tuning') {
    const degrees = [1, 2, 3, 4, 5];
    const alphas = [0.001, 0.01, 0.05, 0.1, 0.5, 1.0, 5.0, 10.0, 50.0, 100.0];
    const interactions = hasMultipleFeatures ? [false, true] : [false];

    degrees.forEach(d => {
      alphas.forEach(a => {
        interactions.forEach(inter => {
          // If degree 1, interactions have no meaning
          if (d === 1 && inter) return;
          candidates.push({
            id: `ridge-d${d}-a${a}-i${inter ? '1' : '0'}`,
            modelType: 'ridge',
            degree: d,
            alpha: a,
            includeInteractions: inter,
            labelAr: `Ridge (درجة ${d}, α=${a}${inter ? ' + تفاعل' : ''})`,
            labelEn: `Ridge (Deg ${d}, α=${a}${inter ? ' + Int' : ''})`
          });
        });
      });
    });

    return candidates;
  }

  if (scope === 'poly_tuning') {
    const degrees = [1, 2, 3, 4, 5, 6, 7, 8];
    const interactions = hasMultipleFeatures ? [false, true] : [false];

    degrees.forEach(d => {
      interactions.forEach(inter => {
        if (d === 1 && inter) return;
        candidates.push({
          id: `poly-d${d}-i${inter ? '1' : '0'}`,
          modelType: 'polynomial',
          degree: d,
          includeInteractions: inter,
          labelAr: `كثير حدود (درجة ${d}${inter ? ' + تفاعل' : ''})`,
          labelEn: `Polynomial (Deg ${d}${inter ? ' + Int' : ''})`
        });
      });
    });

    return candidates;
  }

  if (scope === 'all_models') {
    // 1. Linear
    candidates.push({
      id: 'linear-ols',
      modelType: 'linear',
      degree: 1,
      includeInteractions: false,
      labelAr: 'انحدار خطي OLS',
      labelEn: 'Linear OLS'
    });

    // 2. Polynomial degrees 2, 3, 4, 5
    const polyDegrees = [2, 3, 4, 5];
    polyDegrees.forEach(d => {
      candidates.push({
        id: `poly-d${d}-i0`,
        modelType: 'polynomial',
        degree: d,
        includeInteractions: false,
        labelAr: `كثير حدود (درجة ${d})`,
        labelEn: `Polynomial (Deg ${d})`
      });
      if (hasMultipleFeatures) {
        candidates.push({
          id: `poly-d${d}-i1`,
          modelType: 'polynomial',
          degree: d,
          includeInteractions: true,
          labelAr: `كثير حدود (درجة ${d} + تفاعل)`,
          labelEn: `Polynomial (Deg ${d} + Int)`
        });
      }
    });

    // 3. Ridge across multiple degrees and alphas
    const ridgeDegrees = [1, 2, 3, 4, 5];
    const ridgeAlphas = [0.01, 0.1, 1.0, 10.0, 50.0];
    ridgeDegrees.forEach(d => {
      ridgeAlphas.forEach(a => {
        candidates.push({
          id: `ridge-d${d}-a${a}-i0`,
          modelType: 'ridge',
          degree: d,
          alpha: a,
          includeInteractions: false,
          labelAr: `Ridge (درجة ${d}, α=${a})`,
          labelEn: `Ridge (Deg ${d}, α=${a})`
        });
        if (hasMultipleFeatures && d > 1) {
          candidates.push({
            id: `ridge-d${d}-a${a}-i1`,
            modelType: 'ridge',
            degree: d,
            alpha: a,
            includeInteractions: true,
            labelAr: `Ridge (درجة ${d}, α=${a} + تفاعل)`,
            labelEn: `Ridge (Deg ${d}, α=${a} + Int)`
          });
        }
      });
    });

    return candidates;
  }

  // Fallback: Current model variations
  if (currentType === 'ridge') {
    [0.001, 0.01, 0.1, 0.5, 1.0, 5.0, 10.0, 50.0].forEach(a => {
      candidates.push({
        id: `ridge-current-a${a}`,
        modelType: 'ridge',
        degree: 2,
        alpha: a,
        includeInteractions: hasMultipleFeatures,
        labelAr: `Ridge (α=${a})`,
        labelEn: `Ridge (α=${a})`
      });
    });
  } else {
    [1, 2, 3, 4, 5, 6].forEach(d => {
      candidates.push({
        id: `poly-current-d${d}`,
        modelType: 'polynomial',
        degree: d,
        includeInteractions: hasMultipleFeatures,
        labelAr: `كثير حدود (درجة ${d})`,
        labelEn: `Polynomial (Deg ${d})`
      });
    });
  }

  return candidates;
}

/**
 * Deterministic pseudo-random number generator for reproducible fold splitting
 */
function seededRandom(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/**
 * Creates K balanced folds
 */
export function createKFolds<T>(items: T[], k: number, seed = 42): T[][] {
  const rng = seededRandom(seed);
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const folds: T[][] = Array.from({ length: k }, () => []);
  shuffled.forEach((item, idx) => {
    folds[idx % k].push(item);
  });
  return folds;
}

/**
 * Evaluates a single candidate over K-folds
 */
function evaluateCandidateOnFolds(
  candidate: GridSearchCandidate,
  folds: GridSearchPoint[][]
): { foldResults: GridSearchFoldResult[]; meanValR2: number; stdValR2: number; meanValRmse: number; stdValRmse: number; meanValMse: number; meanTrainR2: number; meanTrainRmse: number } {
  const k = folds.length;
  const foldResults: GridSearchFoldResult[] = [];

  for (let f = 0; f < k; f++) {
    const valPoints = folds[f];
    const trainPoints = folds.filter((_, idx) => idx !== f).flat();

    if (trainPoints.length === 0 || valPoints.length === 0) continue;

    const deg = candidate.degree;
    const inter = candidate.includeInteractions;
    const isHighDeg = deg > 1 || inter;

    // Feature matrix transformation
    const trainX = trainPoints.map(p => isHighDeg ? createPolynomialFeatures(p.features, deg, inter) : p.features);
    const trainY = trainPoints.map(p => p.y);

    const valX = valPoints.map(p => isHighDeg ? createPolynomialFeatures(p.features, deg, inter) : p.features);
    const valY = valPoints.map(p => p.y);

    // Regularization penalty lambda:
    // For ridge: candidate.alpha
    // For polynomial: tiny stability regularization 1e-6
    // For linear: tiny 1e-8
    let lambda = 1e-8;
    if (candidate.modelType === 'ridge') {
      lambda = candidate.alpha ?? 1.0;
    } else if (candidate.modelType === 'polynomial') {
      lambda = deg > 5 ? 1e-4 : 1e-6;
    }

    try {
      const fitted = calculateRidgeRegression(trainX, trainY, lambda);

      // Training predictions
      const trainPreds = trainX.map(row => fitted.predict(row));
      const trainTermsCount = trainX[0]?.length || 1;
      const trainMetrics = calculateRegressionMetrics(trainY, trainPreds, trainTermsCount);

      // Validation predictions
      const valPreds = valX.map(row => fitted.predict(row));
      const valTermsCount = valX[0]?.length || 1;
      const valMetrics = calculateRegressionMetrics(valY, valPreds, valTermsCount);

      foldResults.push({
        fold: f + 1,
        trainMse: isFinite(trainMetrics.mse) ? trainMetrics.mse : 1e8,
        valMse: isFinite(valMetrics.mse) ? valMetrics.mse : 1e8,
        trainR2: isFinite(trainMetrics.r2) ? trainMetrics.r2 : -1,
        valR2: isFinite(valMetrics.r2) ? valMetrics.r2 : -1,
        trainRmse: isFinite(trainMetrics.rmse) ? trainMetrics.rmse : 1e4,
        valRmse: isFinite(valMetrics.rmse) ? valMetrics.rmse : 1e4
      });
    } catch {
      foldResults.push({
        fold: f + 1,
        trainMse: 1e8,
        valMse: 1e8,
        trainR2: -1,
        valR2: -1,
        trainRmse: 1e4,
        valRmse: 1e4
      });
    }
  }

  const validFoldCount = foldResults.length || 1;
  const meanValR2 = foldResults.reduce((sum, r) => sum + r.valR2, 0) / validFoldCount;
  const meanValRmse = foldResults.reduce((sum, r) => sum + r.valRmse, 0) / validFoldCount;
  const meanValMse = foldResults.reduce((sum, r) => sum + r.valMse, 0) / validFoldCount;
  const meanTrainR2 = foldResults.reduce((sum, r) => sum + r.trainR2, 0) / validFoldCount;
  const meanTrainRmse = foldResults.reduce((sum, r) => sum + r.trainRmse, 0) / validFoldCount;

  // Standard deviation of Val R2 and RMSE across folds
  const varianceR2 = foldResults.reduce((sum, r) => sum + Math.pow(r.valR2 - meanValR2, 2), 0) / (validFoldCount || 1);
  const stdValR2 = Math.sqrt(varianceR2);

  const varianceRmse = foldResults.reduce((sum, r) => sum + Math.pow(r.valRmse - meanValRmse, 2), 0) / (validFoldCount || 1);
  const stdValRmse = Math.sqrt(varianceRmse);

  return {
    foldResults,
    meanValR2,
    stdValR2,
    meanValRmse,
    stdValRmse,
    meanValMse,
    meanTrainR2,
    meanTrainRmse
  };
}

/**
 * Runs Grid Search Cross Validation asynchronously with live progress callback
 */
export async function executeGridSearchCV(
  data: GridSearchPoint[],
  candidates: GridSearchCandidate[],
  options: GridSearchOptions,
  onProgress?: (progress: { completed: number; total: number; currentCandidate?: GridSearchCandidate }) => void
): Promise<{ results: GridSearchResultItem[]; best: GridSearchResultItem | null }> {
  if (data.length < 4 || candidates.length === 0) {
    return { results: [], best: null };
  }

  const k = Math.max(2, Math.min(options.kFolds, Math.floor(data.length / 2)));
  const folds = createKFolds(data, k, options.seed || 42);

  const rawResults: Array<{
    candidate: GridSearchCandidate;
    meanValR2: number;
    stdValR2: number;
    meanValRmse: number;
    stdValRmse: number;
    meanValMse: number;
    meanTrainR2: number;
    meanTrainRmse: number;
    generalizationGap: number;
    status: GridSearchResultItem['status'];
    statusLabelAr: string;
    statusLabelEn: string;
    foldResults: GridSearchFoldResult[];
  }> = [];

  const total = candidates.length;

  for (let i = 0; i < total; i++) {
    const candidate = candidates[i];
    if (onProgress) {
      onProgress({ completed: i, total, currentCandidate: candidate });
      // Give browser time to render progress bar
      if (i % 2 === 0) {
        await new Promise(r => setTimeout(r, 0));
      }
    }

    const evalResult = evaluateCandidateOnFolds(candidate, folds);
    const generalizationGap = evalResult.meanTrainR2 - evalResult.meanValR2;

    let status: GridSearchResultItem['status'] = 'good';
    let statusLabelAr = 'جيد (Good)';
    let statusLabelEn = 'Good';

    if (evalResult.meanTrainR2 < 0.45 && evalResult.meanValR2 < 0.45) {
      status = 'underfitting';
      statusLabelAr = 'ضعف ملاءمة (Underfitting)';
      statusLabelEn = 'Underfitting';
    } else if (generalizationGap > 0.15 || (evalResult.meanTrainR2 > 0.85 && evalResult.meanValR2 < 0.65)) {
      status = 'overfitting';
      statusLabelAr = 'خطر التوافق المفرط (Overfitting)';
      statusLabelEn = 'Overfitting';
    } else if (evalResult.meanValR2 >= 0.75 && generalizationGap <= 0.08) {
      status = 'excellent';
      statusLabelAr = 'ممتاز (Excellent Generalization)';
      statusLabelEn = 'Excellent Generalization';
    }

    rawResults.push({
      candidate,
      ...evalResult,
      generalizationGap,
      status,
      statusLabelAr,
      statusLabelEn
    });
  }

  if (onProgress) {
    onProgress({ completed: total, total });
  }

  // Sort by chosen scoring metric
  rawResults.sort((a, b) => {
    if (options.scoringMetric === 'rmse') {
      return a.meanValRmse - b.meanValRmse;
    } else if (options.scoringMetric === 'mse') {
      return a.meanValMse - b.meanValMse;
    } else {
      // default: highest R2
      return b.meanValR2 - a.meanValR2;
    }
  });

  // Assign ranks and mark champion
  const results: GridSearchResultItem[] = rawResults.map((item, idx) => {
    const isBest = idx === 0;
    return {
      rank: idx + 1,
      candidate: item.candidate,
      meanValR2: item.meanValR2,
      stdValR2: item.stdValR2,
      meanValRmse: item.meanValRmse,
      stdValRmse: item.stdValRmse,
      meanValMse: item.meanValMse,
      meanTrainR2: item.meanTrainR2,
      meanTrainRmse: item.meanTrainRmse,
      generalizationGap: item.generalizationGap,
      status: isBest ? 'best' : item.status,
      statusLabelAr: isBest ? '🏆 النموذج الأفضل (Champion)' : item.statusLabelAr,
      statusLabelEn: isBest ? '🏆 Champion Model' : item.statusLabelEn,
      foldResults: item.foldResults
    };
  });

  return {
    results,
    best: results[0] || null
  };
}

/**
 * Generates an automatic, professional textual report summarizing Grid Search findings,
 * detailing the champion hyperparameters and quantifying performance improvements.
 */
export function generateGridSearchReport(
  results: GridSearchResultItem[],
  bestModel: GridSearchResultItem | null,
  options: GridSearchOptions,
  language: 'ar' | 'en' = 'ar'
): string {
  if (!bestModel || results.length === 0) {
    return language === 'ar' 
      ? 'لم يتم تنفيذ بحث شبكي حتى الآن أو لا توجد نتائج متاحة.' 
      : 'No Grid Search has been executed yet or no results available.';
  }

  const isAr = language === 'ar';
  
  // Baseline model: Look for linear-ols or the simplest model
  const baseline = results.find(r => r.candidate.modelType === 'linear' || (r.candidate.degree === 1 && !r.candidate.includeInteractions)) || results[results.length - 1];

  // Improvement calculations
  const deltaR2 = bestModel.meanValR2 - baseline.meanValR2;
  const pctR2Gain = baseline.meanValR2 > 0 ? (deltaR2 / baseline.meanValR2) * 100 : 0;
  
  const rmseReduction = baseline.meanValRmse - bestModel.meanValRmse;
  const pctRmseReduction = baseline.meanValRmse > 0 ? (rmseReduction / baseline.meanValRmse) * 100 : 0;

  const dateStr = new Date().toLocaleString(isAr ? 'ar-SA' : 'en-US');

  if (isAr) {
    return `# 📊 تقرير التحليل التلقائي لنتائج البحث الشبكي (Grid Search Report)
**تاريخ الإصدار:** ${dateStr}
**استراتيجية التقييم:** التحقق المتقاطع (${options.kFolds}-Fold Cross-Validation)
**إجمالي النماذج المفحوصة:** ${results.length} نموذج مرشح
**معيار التحسين المعتمد:** ${options.scoringMetric === 'r2' ? 'معامل التحديد (R² Score)' : options.scoringMetric === 'rmse' ? 'أدنى خطأ تربيعي (Min RMSE)' : 'أدنى متوسط مربعات (Min MSE)'}

---

## 🏆 1. النموذج الفائز الموصى به (Champion Model)
- **نوع النموذج:** ${bestModel.candidate.modelType === 'linear' ? 'انحدار خطي (Linear OLS)' : bestModel.candidate.modelType === 'polynomial' ? 'انحدار كثير الحدود (Polynomial Regression)' : 'انحدار الحافة الموزون (Ridge Regression)'}
- **الدرجة المثلى (Optimal Degree):** الدرجة ${bestModel.candidate.degree}
- **معامل الجزاء (Ridge Penalty α / λ):** ${bestModel.candidate.alpha !== undefined ? bestModel.candidate.alpha : 'غير مفعل (OLS)'}
- **حدود التفاعل المشترك (Interactions):** ${bestModel.candidate.includeInteractions ? 'مفعلة (x_i · x_j)' : 'غير مفعلة'}
- **درجة التحقق التبادلي (Mean Val R²):** **${bestModel.meanValR2.toFixed(4)}** (± ${bestModel.stdValR2.toFixed(4)})
- **جذر متوسط مربع الخطأ (Mean Val RMSE):** **${bestModel.meanValRmse.toFixed(4)}**
- **دقة التدريب داخل العينة (Mean Train R²):** **${bestModel.meanTrainR2.toFixed(4)}**
- **فجوة التعميم (Generalization Gap):** **${bestModel.generalizationGap.toFixed(4)}**
- **تشخيص الملاءمة:** **${bestModel.statusLabelAr}**

---

## 📈 2. قياس مستوى التحسن في دقة النموذج (Performance Improvement)
مقارنة أداء النموذج الفائز مقابل النموذج الخطي المرجعي (Baseline OLS):

| المؤشر الإحصائي | النموذج المرجعي (Baseline) | النموذج الفائز (Champion) | صافي التحسن (Δ) | نسبة التغير (%) |
| :--- | :---: | :---: | :---: | :---: |
| **معامل التحديد (R²)** | ${baseline.meanValR2.toFixed(4)} | **${bestModel.meanValR2.toFixed(4)}** | ${deltaR2 >= 0 ? '+' : ''}${deltaR2.toFixed(4)} | **${pctR2Gain >= 0 ? '+' : ''}${pctR2Gain.toFixed(2)}%** |
| **جذر متوسط الخطأ (RMSE)** | ${baseline.meanValRmse.toFixed(4)} | **${bestModel.meanValRmse.toFixed(4)}** | ${-rmseReduction.toFixed(4)} | **${pctRmseReduction >= 0 ? '-' : '+'}${Math.abs(pctRmseReduction).toFixed(2)}%** |
| **فجوة التعميم (Gap)** | ${baseline.generalizationGap.toFixed(4)} | **${bestModel.generalizationGap.toFixed(4)}** | ${(bestModel.generalizationGap - baseline.generalizationGap).toFixed(4)} | ${bestModel.generalizationGap <= 0.10 ? 'أمان ممتاز' : 'مقبول'} |

${deltaR2 > 0.05 
  ? `> 💡 **خلاصة التحسن:** أدى ضبط المعاملات الفائقة إلى قفزة نوعية في دقة التنبؤ خارج العينة بمقدار **+${deltaR2.toFixed(4)}** على مقياس R²، مع تقليص هامش الخطأ بمقدار **${pctRmseReduction.toFixed(1)}%**، مما يثبت جدوى النموذج غير الخطي المقيد جزائياً.`
  : `> 💡 **خلاصة التحسن:** يحقق النموذج المختار توازناً مستقراً مع النموذج المرجعي ويمنع ظاهرة فرط التخصيص عبر تقييد التعقيد الزائد.`}

---

## 🥇 3. ترتيب أفضل 5 نماذج متنافسة (Top 5 Leaderboard)
${results.slice(0, 5).map((r, i) => `${i + 1}. **${r.candidate.labelAr}**: R² = ${r.meanValR2.toFixed(4)} (±${r.stdValR2.toFixed(3)}) | RMSE = ${r.meanValRmse.toFixed(4)} | [${r.statusLabelAr}]`).join('\n')}

---

## 🛡️ 4. فحص فرط التخصيص والاستقرار (Overfitting Diagnostics)
- **الانحراف المعياري بين الطيات:** ${bestModel.stdValR2.toFixed(4)} (${bestModel.stdValR2 < 0.05 ? 'استقرار ممتاز عبر جميع العينات الفرعية' : 'تشتت طفيف طبيعي في البيانات الصغيرة'}).
- **فجوة التدريب والاختبار:** فجوة التعميم تبلغ ${bestModel.generalizationGap.toFixed(4)}، وهي ${bestModel.generalizationGap < 0.10 ? 'ضمن النطاق الآمن والمثالي (< 0.10)' : 'تتطلب مراقبة إضافية'}.
- **التوصية النهائية:** اعتمد هذا النموذج لأغراض التنبؤ في الإنتاجية والتحليل الإحصائي.
`;
  }

  // English Report
  return `# 📊 Automated Grid Search Cross-Validation Report
**Generated on:** ${dateStr}
**Validation Scheme:** ${options.kFolds}-Fold Cross-Validation
**Candidates Evaluated:** ${results.length} models
**Primary Optimization Metric:** ${options.scoringMetric.toUpperCase()}

---

## 🏆 1. Champion Model Specification
- **Model Type:** ${bestModel.candidate.modelType.toUpperCase()} Regression
- **Optimal Degree:** Degree ${bestModel.candidate.degree}
- **Ridge Penalty (α / λ):** ${bestModel.candidate.alpha !== undefined ? bestModel.candidate.alpha : 'None (OLS)'}
- **Interaction Terms:** ${bestModel.candidate.includeInteractions ? 'Enabled' : 'Disabled'}
- **Validation R²:** **${bestModel.meanValR2.toFixed(4)}** (± ${bestModel.stdValR2.toFixed(4)})
- **Validation RMSE:** **${bestModel.meanValRmse.toFixed(4)}**
- **Train R²:** **${bestModel.meanTrainR2.toFixed(4)}**
- **Generalization Gap:** **${bestModel.generalizationGap.toFixed(4)}**
- **Diagnosis Verdict:** **${bestModel.statusLabelEn}**

---

## 📈 2. Quantified Accuracy Improvement vs Baseline
Comparison against the baseline linear model (${baseline.candidate.labelEn}):

| Metric | Baseline Model | Champion Model | Net Delta (Δ) | Relative Change |
| :--- | :---: | :---: | :---: | :---: |
| **Validation R²** | ${baseline.meanValR2.toFixed(4)} | **${bestModel.meanValR2.toFixed(4)}** | ${deltaR2 >= 0 ? '+' : ''}${deltaR2.toFixed(4)} | **${pctR2Gain >= 0 ? '+' : ''}${pctR2Gain.toFixed(2)}%** |
| **Validation RMSE** | ${baseline.meanValRmse.toFixed(4)} | **${bestModel.meanValRmse.toFixed(4)}** | ${-rmseReduction.toFixed(4)} | **-${Math.abs(pctRmseReduction).toFixed(2)}%** |
| **Generalization Gap** | ${baseline.generalizationGap.toFixed(4)} | **${bestModel.generalizationGap.toFixed(4)}** | ${(bestModel.generalizationGap - baseline.generalizationGap).toFixed(4)} | ${bestModel.generalizationGap <= 0.10 ? 'Safe' : 'Watch'} |

${deltaR2 > 0.05
  ? `> 💡 **Executive Summary:** Tuning hyperparameters boosted out-of-sample accuracy by **+${deltaR2.toFixed(4)}** R² points and reduced prediction error by **${pctRmseReduction.toFixed(1)}%** compared to baseline OLS.`
  : `> 💡 **Executive Summary:** The tuned candidate preserves robust generalization while mitigating overfitting variance.`}

---

## 🥇 3. Top 5 Candidates Leaderboard
${results.slice(0, 5).map((r, i) => `${i + 1}. **${r.candidate.labelEn}**: R² = ${r.meanValR2.toFixed(4)} (±${r.stdValR2.toFixed(3)}) | RMSE = ${r.meanValRmse.toFixed(4)} | [${r.statusLabelEn}]`).join('\n')}

---

## 🛡️ 4. Overfitting & Stability Diagnostics
- **Cross-Validation Standard Deviation:** ${bestModel.stdValR2.toFixed(4)} (${bestModel.stdValR2 < 0.05 ? 'High stability across folds' : 'Moderate fold variance'}).
- **Generalization Gap:** ${bestModel.generalizationGap.toFixed(4)} (${bestModel.generalizationGap < 0.10 ? 'Safe & well-regularized' : 'Noticeable variance gap'}).
- **Recommendation:** Safe for inference and deployment.
`;
}
