import {
  createPolynomialFeatures,
  calculateRidgeRegression,
  calculateRegressionMetrics,
  RegressionMetrics
} from './mathUtils';
import { GridSearchPoint, createKFolds } from './gridSearchUtils';

export interface OutOfFoldPrediction {
  index: number;
  actual: number;
  predicted: number;
  fold: number;
  error: number;
  absPctError: number;
}

export interface FoldMetricDetail {
  fold: number;
  trainSize: number;
  testSize: number;
  trainR2: number;
  testR2: number;
  trainRmse: number;
  testRmse: number;
  trainMse: number;
  testMse: number;
}

export interface CrossValidationResult {
  kFolds: number;
  modelType: 'linear' | 'polynomial' | 'ridge';
  degree: number;
  alpha: number;
  includeInteractions: boolean;
  foldMetrics: FoldMetricDetail[];
  meanTestR2: number;
  stdTestR2: number;
  meanTestRmse: number;
  stdTestRmse: number;
  meanTrainR2: number;
  meanTrainRmse: number;
  generalizationGap: number; // meanTrainR2 - meanTestR2
  overallOofR2: number; // R2 calculated across all out-of-fold predictions combined
  overallOofRmse: number;
  outOfFoldPredictions: OutOfFoldPrediction[];
  verdict: 'excellent' | 'good' | 'overfitting' | 'underfitting';
  verdictLabelAr: string;
  verdictLabelEn: string;
}

/**
 * Runs K-Fold Cross Validation for a given model specification,
 * collecting both fold-level metrics and out-of-fold predictions for every data sample.
 */
export function runKFoldCrossValidation(
  data: GridSearchPoint[],
  modelType: 'linear' | 'polynomial' | 'ridge',
  degree: number,
  alpha: number = 1.0,
  includeInteractions: boolean = false,
  kFolds: number = 5,
  seed: number = 42
): CrossValidationResult | null {
  if (!data || data.length < 4) return null;

  const k = Math.max(2, Math.min(kFolds, data.length));
  const folds = createKFolds(data, k, seed);

  const foldMetrics: FoldMetricDetail[] = [];
  const outOfFoldPredictions: OutOfFoldPrediction[] = [];

  const deg = modelType === 'linear' ? 1 : Math.max(1, degree);
  const inter = modelType === 'linear' ? false : includeInteractions;
  const isHighDeg = deg > 1 || inter;

  let lambda = 1e-8;
  if (modelType === 'ridge') {
    lambda = Math.max(1e-6, alpha);
  } else if (modelType === 'polynomial') {
    lambda = deg > 5 ? 1e-4 : 1e-6;
  }

  for (let f = 0; f < k; f++) {
    const testPoints = folds[f];
    const trainPoints = folds.filter((_, idx) => idx !== f).flat();

    if (trainPoints.length === 0 || testPoints.length === 0) continue;

    const trainX = trainPoints.map(p => isHighDeg ? createPolynomialFeatures(p.features, deg, inter) : p.features);
    const trainY = trainPoints.map(p => p.y);

    const testX = testPoints.map(p => isHighDeg ? createPolynomialFeatures(p.features, deg, inter) : p.features);
    const testY = testPoints.map(p => p.y);

    try {
      const fitted = calculateRidgeRegression(trainX, trainY, lambda);

      // Predictions on train set
      const trainPreds = trainX.map(row => fitted.predict(row));
      const trainTermsCount = trainX[0]?.length || 1;
      const trainMetrics = calculateRegressionMetrics(trainY, trainPreds, trainTermsCount);

      // Predictions on test set (Out of Fold)
      const testPreds = testX.map(row => fitted.predict(row));
      const testTermsCount = testX[0]?.length || 1;
      const testMetrics = calculateRegressionMetrics(testY, testPreds, testTermsCount);

      foldMetrics.push({
        fold: f + 1,
        trainSize: trainPoints.length,
        testSize: testPoints.length,
        trainR2: isFinite(trainMetrics.r2) ? trainMetrics.r2 : 0,
        testR2: isFinite(testMetrics.r2) ? testMetrics.r2 : 0,
        trainRmse: isFinite(trainMetrics.rmse) ? trainMetrics.rmse : 0,
        testRmse: isFinite(testMetrics.rmse) ? testMetrics.rmse : 0,
        trainMse: isFinite(trainMetrics.mse) ? trainMetrics.mse : 0,
        testMse: isFinite(testMetrics.mse) ? testMetrics.mse : 0
      });

      // Save Out-Of-Fold predictions
      testPoints.forEach((point, pIdx) => {
        const pred = testPreds[pIdx];
        const error = point.y - pred;
        const absPctError = point.y !== 0 ? Math.abs(error / point.y) * 100 : 0;

        outOfFoldPredictions.push({
          index: point.index,
          actual: point.y,
          predicted: pred,
          fold: f + 1,
          error,
          absPctError
        });
      });
    } catch (e) {
      console.error(`Error in CV fold ${f + 1}:`, e);
    }
  }

  if (foldMetrics.length === 0) return null;

  // Sort outOfFoldPredictions back into original data point index order
  outOfFoldPredictions.sort((a, b) => a.index - b.index);

  const validFoldCount = foldMetrics.length;
  const meanTestR2 = foldMetrics.reduce((sum, m) => sum + m.testR2, 0) / validFoldCount;
  const meanTestRmse = foldMetrics.reduce((sum, m) => sum + m.testRmse, 0) / validFoldCount;
  const meanTrainR2 = foldMetrics.reduce((sum, m) => sum + m.trainR2, 0) / validFoldCount;
  const meanTrainRmse = foldMetrics.reduce((sum, m) => sum + m.trainRmse, 0) / validFoldCount;

  const varTestR2 = foldMetrics.reduce((sum, m) => sum + Math.pow(m.testR2 - meanTestR2, 2), 0) / validFoldCount;
  const stdTestR2 = Math.sqrt(varTestR2);

  const varTestRmse = foldMetrics.reduce((sum, m) => sum + Math.pow(m.testRmse - meanTestRmse, 2), 0) / validFoldCount;
  const stdTestRmse = Math.sqrt(varTestRmse);

  const generalizationGap = meanTrainR2 - meanTestR2;

  // Calculate overall Out-Of-Fold R2 and RMSE across all N samples
  const allActuals = outOfFoldPredictions.map(p => p.actual);
  const allPreds = outOfFoldPredictions.map(p => p.predicted);
  const totalTerms = deg > 1 ? (deg + 1) : 2;
  const overallOofMetrics = calculateRegressionMetrics(allActuals, allPreds, totalTerms);

  let verdict: CrossValidationResult['verdict'] = 'good';
  let verdictLabelAr = 'تعميم ملائم ومستقر (Good Generalization)';
  let verdictLabelEn = 'Good Generalization';

  if (meanTrainR2 < 0.45 && meanTestR2 < 0.45) {
    verdict = 'underfitting';
    verdictLabelAr = 'ضعف ملاءمة وانحياز مرتفع (Underfitting / High Bias)';
    verdictLabelEn = 'Underfitting (High Bias)';
  } else if (generalizationGap > 0.15 || (meanTrainR2 > 0.85 && meanTestR2 < 0.60)) {
    verdict = 'overfitting';
    verdictLabelAr = 'فرط تخصيص وتشتت مرتفع (Overfitting / High Variance)';
    verdictLabelEn = 'Overfitting (High Variance)';
  } else if (meanTestR2 >= 0.75 && generalizationGap <= 0.08) {
    verdict = 'excellent';
    verdictLabelAr = 'تعميم ممتاز وموثوقية عالية (Excellent Generalization)';
    verdictLabelEn = 'Excellent Generalization';
  }

  return {
    kFolds: k,
    modelType,
    degree: deg,
    alpha,
    includeInteractions: inter,
    foldMetrics,
    meanTestR2,
    stdTestR2,
    meanTestRmse,
    stdTestRmse,
    meanTrainR2,
    meanTrainRmse,
    generalizationGap,
    overallOofR2: isFinite(overallOofMetrics.r2) ? overallOofMetrics.r2 : meanTestR2,
    overallOofRmse: isFinite(overallOofMetrics.rmse) ? overallOofMetrics.rmse : meanTestRmse,
    outOfFoldPredictions,
    verdict,
    verdictLabelAr,
    verdictLabelEn
  };
}
