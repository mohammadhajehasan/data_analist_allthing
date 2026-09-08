export interface PolynomialTermInfo {
  name: string;
  expression: string;
  power: number;
  components: number[]; // feature indices
}

/**
 * Creates polynomial and interaction features for multivariate regression
 */
export function createPolynomialFeatures(
  features: number[],
  degree: number,
  includeInteractions: boolean = true
): number[] {
  const p = features.length;
  if (p === 0) return [];
  if (p === 1 && degree === 1) return [...features];

  const polyFeatures: number[] = [...features]; // Degree 1

  // Degree 2 to degree powers
  for (let d = 2; d <= degree; d++) {
    for (let i = 0; i < p; i++) {
      polyFeatures.push(Math.pow(features[i], d));
    }
  }

  // Pairwise Interaction terms (X_i * X_j) if multiple features and requested
  if (includeInteractions && p > 1 && degree >= 2) {
    for (let i = 0; i < p; i++) {
      for (let j = i + 1; j < p; j++) {
        polyFeatures.push(features[i] * features[j]);
      }
    }
  }

  return polyFeatures;
}

/**
 * Generates feature names matching createPolynomialFeatures
 */
export function getPolynomialFeatureNames(
  featureNames: string[],
  degree: number,
  includeInteractions: boolean = true
): string[] {
  const p = featureNames.length;
  if (p === 0) return [];

  const names: string[] = [...featureNames];

  // Powers
  for (let d = 2; d <= degree; d++) {
    for (let i = 0; i < p; i++) {
      names.push(`${featureNames[i]}^${d}`);
    }
  }

  // Interactions
  if (includeInteractions && p > 1 && degree >= 2) {
    for (let i = 0; i < p; i++) {
      for (let j = i + 1; j < p; j++) {
        names.push(`${featureNames[i]} · ${featureNames[j]}`);
      }
    }
  }

  return names;
}

export interface CoefficientDetail {
  name: string;
  power: number;
  coefficient: number;
  formattedTerm: string;
  importancePercent: number;
}

export function extractCoefficientDetails(
  intercept: number,
  coefficients: number[],
  featureLabels: string[]
): { intercept: number; details: CoefficientDetail[] } {
  const details: CoefficientDetail[] = [];
  const totalAbsWeight = coefficients.reduce((acc, c) => acc + Math.abs(c), 0);

  coefficients.forEach((coef, idx) => {
    const label = featureLabels[idx] || `x${idx + 1}`;
    let power = 1;
    if (label.includes('^')) {
      const parts = label.split('^');
      power = parseInt(parts[1], 10) || 1;
    }

    const absWeight = Math.abs(coef);
    const importancePercent = totalAbsWeight > 0 ? (absWeight / totalAbsWeight) * 100 : 0;

    details.push({
      name: label,
      power,
      coefficient: coef,
      formattedTerm: `${coef >= 0 ? '+' : '-'} ${Math.abs(coef).toFixed(4)} · ${label}`,
      importancePercent
    });
  });

  return { intercept, details };
}

export function formatPolynomialEquation(
  intercept: number,
  coefficients: number[],
  featureLabels: string[],
  targetName: string = 'y'
): string {
  const terms: string[] = [];

  // Intercept
  const formattedIntercept = Number(intercept.toFixed(4));
  if (formattedIntercept !== 0 || coefficients.length === 0) {
    terms.push(`${formattedIntercept}`);
  }

  // Coefficients
  coefficients.forEach((coef, idx) => {
    const formattedCoef = Number(coef.toFixed(4));
    if (formattedCoef === 0) return;

    const label = featureLabels[idx] || `x${idx + 1}`;
    const sign = formattedCoef > 0 && terms.length > 0 ? '+ ' : formattedCoef < 0 ? '- ' : '';
    const absVal = Math.abs(formattedCoef);
    const coefStr = absVal === 1 ? '' : `${absVal} · `;

    terms.push(`${sign}${coefStr}${label}`);
  });

  if (terms.length === 0) {
    return `${targetName} = 0`;
  }

  return `${targetName} = ${terms.join(' ')}`;
}

export interface RegressionMetrics {
  r2: number;
  adjustedR2: number;
  mse: number;
  rmse: number;
  mae: number;
  n: number;
  p: number;
  aic: number;
  bic: number;
  accuracyGrade: 'ممتاز (Excellent)' | 'جيد جداً (Very Good)' | 'متوسط (Moderate)' | 'ضعيف (Poor)';
}

export function calculateRegressionMetrics(
  actuals: number[],
  predicted: number[],
  numFeatures: number = 1
): RegressionMetrics {
  const n = actuals.length;
  if (n === 0) {
    return {
      r2: 0,
      adjustedR2: 0,
      mse: 0,
      rmse: 0,
      mae: 0,
      n: 0,
      p: numFeatures,
      aic: 0,
      bic: 0,
      accuracyGrade: 'ضعيف (Poor)'
    };
  }

  let ssTot = 0;
  let ssRes = 0;
  let sumActual = 0;
  let sumAbsError = 0;

  for (let i = 0; i < n; i++) {
    sumActual += actuals[i];
  }
  const meanActual = sumActual / n;

  for (let i = 0; i < n; i++) {
    const diffTot = actuals[i] - meanActual;
    const diffRes = actuals[i] - predicted[i];
    ssTot += diffTot * diffTot;
    ssRes += diffRes * diffRes;
    sumAbsError += Math.abs(diffRes);
  }

  const mse = ssRes / n;
  const rmse = Math.sqrt(mse);
  const mae = sumAbsError / n;
  const r2 = ssTot === 0 ? 1 : Math.max(0, 1 - ssRes / ssTot);

  // Adjusted R2: 1 - [(1 - R2) * (n - 1) / (n - p - 1)]
  let adjustedR2 = r2;
  if (n > numFeatures + 1) {
    adjustedR2 = Math.max(0, 1 - ((1 - r2) * (n - 1)) / (n - numFeatures - 1));
  }

  // Information Criteria
  const k = numFeatures + 1; // features + intercept
  const safeMse = Math.max(mse, 1e-12);
  const aic = n * Math.log(safeMse) + 2 * k;
  const bic = n * Math.log(safeMse) + k * Math.log(n);

  let accuracyGrade: RegressionMetrics['accuracyGrade'] = 'ضعيف (Poor)';
  if (r2 >= 0.90) accuracyGrade = 'ممتاز (Excellent)';
  else if (r2 >= 0.75) accuracyGrade = 'جيد جداً (Very Good)';
  else if (r2 >= 0.50) accuracyGrade = 'متوسط (Moderate)';

  return {
    r2,
    adjustedR2,
    mse,
    rmse,
    mae,
    n,
    p: numFeatures,
    aic,
    bic,
    accuracyGrade
  };
}

/**
 * Calculates Pearson Correlation between two numeric vectors
 */
export function calculatePearsonCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  if (den === 0) return 0;
  return Math.max(-1, Math.min(1, num / den));
}

export interface CorrelationMatrixResult {
  columns: string[];
  matrix: number[][];
}

export function buildCorrelationMatrix(
  data: any[],
  columns: string[]
): CorrelationMatrixResult {
  const numCols = columns.length;
  const columnVectors: number[][] = columns.map(col =>
    data.map(row => parseFloat(row[col])).filter(v => !isNaN(v))
  );

  const matrix: number[][] = Array.from({ length: numCols }, () =>
    Array(numCols).fill(0)
  );

  for (let i = 0; i < numCols; i++) {
    for (let j = 0; j < numCols; j++) {
      if (i === j) {
        matrix[i][j] = 1;
      } else if (i < j) {
        const corr = calculatePearsonCorrelation(columnVectors[i], columnVectors[j]);
        matrix[i][j] = corr;
        matrix[j][i] = corr;
      }
    }
  }

  return { columns, matrix };
}

export interface FeatureCorrelationInsight {
  feature: string;
  targetCorrelation: number;
  absCorrelation: number;
  impactLevel: 'قوي جداً (Very Strong)' | 'قوي (Strong)' | 'متوسط (Moderate)' | 'ضعيف (Weak)';
  direction: 'طردي (+)' | 'عكسي (-)' | 'محايد';
  isRecommended: boolean;
  multicollinearityWarnings: string[];
}

export function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = A.length;
  if (n === 0) return [];
  const M: number[][] = A.map((row, i) => [...row, b[i]]);

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
        maxRow = k;
      }
    }
    const temp = M[i];
    M[i] = M[maxRow];
    M[maxRow] = temp;

    let pivot = M[i][i];
    if (Math.abs(pivot) < 1e-12) {
      pivot = 1e-12;
      M[i][i] = pivot;
    }

    for (let j = i; j <= n; j++) {
      M[i][j] /= pivot;
    }

    for (let k = 0; k < n; k++) {
      if (k !== i) {
        const factor = M[k][i];
        for (let j = i; j <= n; j++) {
          M[k][j] -= factor * M[i][j];
        }
      }
    }
  }

  return M.map(row => row[n]);
}

export interface RidgeRegressionResult {
  intercept: number;
  coefficients: number[];
  l2Penalty: number;
  predict: (X_row: number[]) => number;
}

export function calculateRidgeRegression(
  X: number[][],
  y: number[],
  alpha: number = 1.0
): RidgeRegressionResult {
  const n = X.length;
  if (n === 0) return { intercept: 0, coefficients: [], l2Penalty: 0, predict: () => 0 };
  const p = X[0].length;
  if (p === 0) return { intercept: 0, coefficients: [], l2Penalty: 0, predict: () => 0 };

  const meanY = y.reduce((a, b) => a + b, 0) / n;
  const yCentered = y.map(v => v - meanY);

  const means: number[] = new Array(p).fill(0);
  const stds: number[] = new Array(p).fill(0);

  for (let j = 0; j < p; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += X[i][j];
    means[j] = sum / n;
  }

  for (let j = 0; j < p; j++) {
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const diff = X[i][j] - means[j];
      sumSq += diff * diff;
    }
    stds[j] = Math.sqrt(sumSq / n) || 1.0;
  }

  const Z: number[][] = X.map(row =>
    row.map((val, j) => (val - means[j]) / stds[j])
  );

  const A: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let j = 0; j < p; j++) {
    for (let k = 0; k < p; k++) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        sum += Z[i][j] * Z[i][k];
      }
      A[j][k] = sum + (j === k ? alpha * n : 0);
    }
  }

  const bVec: number[] = new Array(p).fill(0);
  for (let j = 0; j < p; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += Z[i][j] * yCentered[i];
    }
    bVec[j] = sum;
  }

  const wNorm = solveLinearSystem(A, bVec);

  const coefficients: number[] = wNorm.map((wn, j) => wn / stds[j]);

  let intercept = meanY;
  for (let j = 0; j < p; j++) {
    intercept -= coefficients[j] * means[j];
  }

  const l2Penalty = alpha * coefficients.reduce((acc, c) => acc + c * c, 0);

  const predict = (X_row: number[]) => {
    let res = intercept;
    for (let j = 0; j < Math.min(X_row.length, coefficients.length); j++) {
      res += coefficients[j] * X_row[j];
    }
    return res;
  };

  return { intercept, coefficients, l2Penalty, predict };
}

export function evaluateTrueFunction(
  formula: string,
  xVal: number,
  featureVals: number[] = []
): number {
  if (!formula || !formula.trim()) return NaN;
  try {
    let jsExpr = formula
      .replace(/(\w+)\^(\d+)/g, 'Math.pow($1, $2)')
      .replace(/x\^(\d+)/gi, 'Math.pow(x, $1)')
      .replace(/\^/g, '**')
      .replace(/sin\(/gi, 'Math.sin(')
      .replace(/cos\(/gi, 'Math.cos(')
      .replace(/tan\(/gi, 'Math.tan(')
      .replace(/sqrt\(/gi, 'Math.sqrt(')
      .replace(/exp\(/gi, 'Math.exp(')
      .replace(/abs\(/gi, 'Math.abs(');

    const args = ['x'];
    const vals = [xVal];
    featureVals.forEach((fv, idx) => {
      args.push(`x${idx + 1}`);
      vals.push(fv);
    });

    const fn = new Function(...args, `return (${jsExpr});`);
    const res = fn(...vals);
    return typeof res === 'number' && !isNaN(res) && isFinite(res) ? res : NaN;
  } catch (e) {
    return NaN;
  }
}

export function analyzeFeatureCorrelations(
  data: any[],
  featureCols: string[],
  targetCol: string,
  threshold: number = 0.3
): {
  insights: FeatureCorrelationInsight[];
  recommendedFeatures: string[];
  highMulticollinearityPairs: { f1: string; f2: string; corr: number }[];
} {
  const allCols = [...featureCols, targetCol];
  const { matrix } = buildCorrelationMatrix(data, allCols);
  const targetIdx = allCols.indexOf(targetCol);

  const insights: FeatureCorrelationInsight[] = [];
  const highMulticollinearityPairs: { f1: string; f2: string; corr: number }[] = [];

  // Check pairwise multicollinearity between features
  for (let i = 0; i < featureCols.length; i++) {
    for (let j = i + 1; j < featureCols.length; j++) {
      const corr = matrix[i][j];
      if (Math.abs(corr) >= 0.80) {
        highMulticollinearityPairs.push({
          f1: featureCols[i],
          f2: featureCols[j],
          corr
        });
      }
    }
  }

  featureCols.forEach((feat, i) => {
    const targetCorr = matrix[i][targetIdx];
    const absCorr = Math.abs(targetCorr);

    let impactLevel: FeatureCorrelationInsight['impactLevel'] = 'ضعيف (Weak)';
    if (absCorr >= 0.75) impactLevel = 'قوي جداً (Very Strong)';
    else if (absCorr >= 0.50) impactLevel = 'قوي (Strong)';
    else if (absCorr >= 0.30) impactLevel = 'متوسط (Moderate)';

    const direction: FeatureCorrelationInsight['direction'] =
      targetCorr > 0.05 ? 'طردي (+)' : targetCorr < -0.05 ? 'عكسي (-)' : 'محايد';

    const warnings: string[] = [];
    highMulticollinearityPairs.forEach(pair => {
      if (pair.f1 === feat) {
        warnings.push(`ارتباط عالٍ جداً (${pair.corr.toFixed(2)}) مع ${pair.f2} (قد يسبب تكرار معلومات/Multicollinearity)`);
      } else if (pair.f2 === feat) {
        warnings.push(`ارتباط عالٍ جداً (${pair.corr.toFixed(2)}) مع ${pair.f1} (قد يسبب تكرار معلومات/Multicollinearity)`);
      }
    });

    const isRecommended = absCorr >= threshold;

    insights.push({
      feature: feat,
      targetCorrelation: targetCorr,
      absCorrelation: absCorr,
      impactLevel,
      direction,
      isRecommended,
      multicollinearityWarnings: warnings
    });
  });

  // Sort insights by target correlation strength descending
  insights.sort((a, b) => b.absCorrelation - a.absCorrelation);

  const recommendedFeatures = insights
    .filter(ins => ins.isRecommended)
    .map(ins => ins.feature);

  return {
    insights,
    recommendedFeatures: recommendedFeatures.length > 0 ? recommendedFeatures : [featureCols[0]],
    highMulticollinearityPairs
  };
}

export interface SplitResult<T> {
  train: T[];
  test: T[];
  trainIndices: number[];
  testIndices: number[];
}

/**
 * Deterministic seeded train-test splitter
 * Splits data into training (e.g. 70%) and testing (e.g. 30%)
 */
export function trainTestSplit<T>(
  data: T[],
  trainRatio: number = 0.7,
  shuffle: boolean = true,
  seed: number = 42
): SplitResult<T> {
  const n = data.length;
  if (n <= 1) {
    return { train: [...data], test: [], trainIndices: n === 1 ? [0] : [], testIndices: [] };
  }

  const indices = Array.from({ length: n }, (_, i) => i);

  if (shuffle) {
    let currentSeed = seed;
    const lcg = () => {
      currentSeed = (currentSeed * 1664525 + 1013904223) % 4294967296;
      return currentSeed / 4294967296;
    };

    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(lcg() * (i + 1));
      const temp = indices[i];
      indices[i] = indices[j];
      indices[j] = temp;
    }
  }

  const trainSize = Math.max(1, Math.min(n - 1, Math.round(n * trainRatio)));
  const trainIndices = indices.slice(0, trainSize);
  const testIndices = indices.slice(trainSize);

  const train = trainIndices.map(i => data[i]);
  const test = testIndices.map(i => data[i]);

  return { train, test, trainIndices, testIndices };
}
