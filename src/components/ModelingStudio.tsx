import React, { useState, useMemo, useEffect, useImperativeHandle } from 'react';
import Plot from 'react-plotly.js';
import * as ss from 'simple-statistics';
import { kmeans } from 'ml-kmeans';
import MultivariateLinearRegression from 'ml-regression-multivariate-linear';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useApp } from '../context/AppContext';
import { useModelingContext } from '../hooks/useModelingContext';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import {
  CheckCircle2,
  Copy,
  Check,
  TrendingUp,
  Activity,
  BarChart2,
  Table as TableIcon,
  Layers,
  Code2,
  FileSpreadsheet,
  Zap,
  Info,
  GitBranch,
  Network,
  Sliders,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Gauge,
  Box,
  RotateCcw,
  Trash2,
  Compass,
  FileJson,
  Download,
  Upload,
  FileDown
} from 'lucide-react';
import {
  createPolynomialFeatures,
  getPolynomialFeatureNames,
  formatPolynomialEquation,
  calculateRegressionMetrics,
  extractCoefficientDetails,
  buildCorrelationMatrix,
  analyzeFeatureCorrelations,
  calculateRidgeRegression,
  evaluateTrueFunction,
  trainTestSplit,
  RegressionMetrics,
  CoefficientDetail,
  FeatureCorrelationInsight
} from '../utils/mathUtils';
import { GridSearchModal } from './GridSearchModal';
import { PerformanceCurves } from './charts/PerformanceCurves';
import { runKFoldCrossValidation, CrossValidationResult } from '../utils/crossValidationUtils';
import { InfoTooltip } from './InfoTooltip';
import { FeatureImportanceChart, FeatureImportanceItem } from './FeatureImportanceChart';
import { exportSelectedModelToPdf } from '../utils/modelPdfExport';

export interface DataPoint {
  index: number;
  x: number;
  y: number;
  z?: number;
  cluster?: number;
  features: number[];
}

export interface ModelSplitInfo {
  enabled: boolean;
  trainRatio: number; // e.g. 70
  testRatio: number; // e.g. 30
  trainCount: number;
  testCount: number;
  trainMetrics: RegressionMetrics;
  testMetrics: RegressionMetrics;
  generalizationGap: number; // train.r2 - test.r2
  rmseInflationRatio: number; // test.rmse / train.rmse
  verdict: 'excellent' | 'good' | 'overfitting' | 'underfitting';
  verdictLabelAr: string;
  verdictLabelEn: string;
  isRetrainedOnFullData: boolean;
  fullDataMetrics?: RegressionMetrics;
}

interface ModelingResult {
  type: 'Linear' | 'Polynomial' | 'Ridge' | 'K-Means';
  degree?: number;
  alpha?: number;
  l2Penalty?: number;
  includeInteractions?: boolean;
  isMultivariate: boolean;
  equation: string;
  pythonCode: string;
  jsCode: string;
  intercept: number;
  coefficients: number[];
  coefficientDetails: CoefficientDetail[];
  metrics: RegressionMetrics;
  featureNames: string[];
  targetName: string;
  predict: (features: number[]) => number;
  splitInfo?: ModelSplitInfo;
  cvInfo?: CrossValidationResult;
  isCvPredicting?: boolean;
}

export const ModelingStudio = React.forwardRef<any, any>((props, ref) => {
  const { addChatMessage, activeChatSession, setModelingResult, theme, language, toast } = useApp();
  const isDark = theme === 'g90' || theme === 'g100';
  const [rawJsonData, setRawJsonData] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [xAxisCols, setXAxisCols] = useState<string[]>([]);
  const [yAxisCol, setYAxisCol] = useState<string>('');
  const [isParsed, setIsParsed] = useState<boolean>(false);
  const [kmeansClusters, setKmeansClusters] = useState<number[] | null>(null);

  // Main Studio View Mode
  const [mainViewMode, setMainViewMode] = useState<'studio' | 'correlation' | 'pipeline' | 'preprocessing' | 'inference'>('studio');

  // Saved Models with initial benchmark models for instant Radar comparison
  const [savedModels, setSavedModels] = useState<{ 
    id: string;
    name: string;
    type: string;
    mse: number;
    r2: number;
    equation: string;
    features?: string[];
    target?: string;
    trainingTime: number;
    overfittingIndex: number;
    coefficients?: number[];
    intercept?: number;
    degree?: number;
    alpha?: number;
    includeInteractions?: boolean;
    metrics?: RegressionMetrics;
  }[]>([
    {
      id: 'm1',
      name: 'Linear Regression (Baseline)',
      type: 'linear',
      mse: 24.15,
      r2: 0.824,
      equation: 'y = 3.42 * X1 + 12.10',
      trainingTime: 8.2,
      overfittingIndex: 0.12,
      coefficients: [3.42],
      intercept: 12.10,
      degree: 1,
      includeInteractions: false,
      metrics: {
        r2: 0.824,
        adjustedR2: 0.812,
        mse: 24.15,
        rmse: 4.91,
        mae: 3.85,
        n: 100,
        p: 1,
        aic: 210.4,
        bic: 215.2,
        accuracyGrade: 'ممتاز (Excellent)'
      }
    },
    {
      id: 'm2',
      name: 'Polynomial Reg (Deg 2)',
      type: 'polynomial',
      mse: 11.30,
      r2: 0.941,
      equation: 'y = 1.15 * X1² + 0.84 * X1 + 5.62',
      trainingTime: 16.5,
      overfittingIndex: 0.18,
      coefficients: [0.84, 1.15],
      intercept: 5.62,
      degree: 2,
      includeInteractions: false,
      metrics: {
        r2: 0.941,
        adjustedR2: 0.931,
        mse: 11.30,
        rmse: 3.36,
        mae: 2.54,
        n: 100,
        p: 2,
        aic: 180.2,
        bic: 187.6,
        accuracyGrade: 'ممتاز (Excellent)'
      }
    },
    {
      id: 'm3',
      name: 'Multivariate Linear (Ridge)',
      type: 'linear',
      mse: 18.20,
      r2: 0.887,
      equation: 'y = 2.10 * X1 + 1.45 * X2 + 8.30',
      trainingTime: 12.0,
      overfittingIndex: 0.15,
      coefficients: [2.10, 1.45],
      intercept: 8.30,
      degree: 1,
      includeInteractions: false,
      metrics: {
        r2: 0.887,
        adjustedR2: 0.875,
        mse: 18.20,
        rmse: 4.27,
        mae: 3.21,
        n: 100,
        p: 2,
        aic: 198.5,
        bic: 205.3,
        accuracyGrade: 'ممتاز (Excellent)'
      }
    },
    {
      id: 'm4',
      name: 'Poly Deg 3 + Interactions',
      type: 'polynomial',
      mse: 9.40,
      r2: 0.962,
      equation: 'y = 0.42 * X1³ + 0.81 * X1·X2 + 4.15',
      trainingTime: 42.1,
      overfittingIndex: 0.46,
      coefficients: [0.52, 0.81, 0.42],
      intercept: 4.15,
      degree: 3,
      includeInteractions: true,
      metrics: {
        r2: 0.962,
        adjustedR2: 0.951,
        mse: 9.40,
        rmse: 3.07,
        mae: 2.15,
        n: 100,
        p: 6,
        aic: 165.8,
        bic: 180.2,
        accuracyGrade: 'ممتاز (Excellent)'
      }
    }
  ]);
  const [modelsSortField, setModelsSortField] = useState<'r2' | 'mse' | 'trainingTime' | 'overfittingIndex' | 'none'>('none');
  const [modelsSortOrder, setModelsSortOrder] = useState<'asc' | 'desc'>('desc');

  // Inference & Sensitivity Analysis
  const [inferenceInputs, setInferenceInputs] = useState<Record<string, number>>({});
  const [predictionHistory, setPredictionHistory] = useState<{ id: string, inputs: Record<string, number>, prediction: number }[]>([]);

  // Feature Engineering State
  const [featEngCol, setFeatEngCol] = useState<string>('');
  const [featEngType, setFeatEngType] = useState<'log' | 'sqrt' | 'square' | 'inverse'>('square');

  // Rational approximation of inverse cumulative standard normal distribution
  const normSInv = (p: number): number => {
    if (p <= 0 || p >= 1) return 0;
    const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285108919487e2, 1.383577518672690e2, -3.066479895683002e1, 2.506628277459239];
    const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
    const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    const d = [7.784695709041462e-3, 3.224671290700341e-1, 2.445134137142993, 3.754408661907416];
    
    const p_low = 0.02425;
    const p_high = 1 - p_low;
    
    if (p < p_low) {
      const q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
             ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > p_high) {
      const q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
              ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    const q = p - 0.5;
    const r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
           (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  };

  const getStdDev = (arr: number[]): number => {
    if (arr.length <= 1) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (arr.length - 1);
    return Math.sqrt(variance);
  };

  const handleApplyFeatureEngineering = () => {
    if (!featEngCol) {
      toast({
        title: language === 'ar' ? 'خطأ في هندسة الميزات' : 'Feature Engineering Error',
        description: language === 'ar' ? 'يرجى اختيار عمود أولاً.' : 'Please select a column first.',
        variant: 'error'
      });
      return;
    }
    const colIndex = headers.indexOf(featEngCol);
    if (colIndex === -1) return;

    const newColName = `${featEngCol}_${featEngType}`;
    if (headers.includes(newColName)) {
      addLog(`Feature ${newColName} already exists!`);
      toast({
        title: language === 'ar' ? 'الميزة موجودة بالفعل' : 'Feature Already Exists',
        description: language === 'ar' ? `الميزة ${newColName} تمت هندستها مسبقاً مسبقاً.` : `Feature ${newColName} already exists in the workspace.`,
        variant: 'error'
      });
      return;
    }

    const updatedHeaders = [...headers, newColName];
    const updatedRawData = rawJsonData.map(row => {
      const val = parseFloat(row[colIndex]);
      let newVal = NaN;
      if (!isNaN(val)) {
        if (featEngType === 'log') {
          newVal = val > 0 ? Math.log(val) : 0;
        } else if (featEngType === 'sqrt') {
          newVal = val >= 0 ? Math.sqrt(val) : 0;
        } else if (featEngType === 'square') {
          newVal = val * val;
        } else if (featEngType === 'inverse') {
          newVal = val !== 0 ? 1 / val : 0;
        }
      }
      return [...row, isNaN(newVal) ? '' : newVal];
    });

    setHeaders(updatedHeaders);
    setRawJsonData(updatedRawData);
    addLog(`[Feature Engineering] Generated transformed column: ${newColName}`);
    toast({
      title: language === 'ar' ? 'تمت هندسة الميزة بنجاح' : 'Feature Engineering Success',
      description: language === 'ar' ? `تم تزويد مصفوفة البيانات بالعمود الجديد: ${newColName}` : `Successfully injected new column ${newColName} into the pipeline.`,
      variant: 'success'
    });
  };

  // Visualization sub-tab in Studio
  const [activeVizTab, setActiveVizTab] = useState<'fit' | 'actualVsPredicted' | 'residuals' | 'table' | '3dSurface' | 'comparator' | 'importance' | 'diagnostics' | 'learningCurve'>('fit');
  const [selectedCompModelAId, setSelectedCompModelAId] = useState<string>('');
  const [selectedCompModelBId, setSelectedCompModelBId] = useState<string>('');
  const [activeEquationTab, setActiveEquationTab] = useState<'math' | 'python' | 'js' | 'coefficients' | 'scikit'>('math');
  const [copied, setCopied] = useState<boolean>(false);

  // Polynomial & Ridge options
  const [includeInteractions, setIncludeInteractions] = useState<boolean>(true);
  const [degree, setDegree] = useState<number>(2);
  const [alpha, setAlpha] = useState<number>(1.0); // Ridge L2 penalty alpha/lambda
  const [isComparisonMode, setIsComparisonMode] = useState<boolean>(false);

  // True Function overlay options
  const [showTrueFunction, setShowTrueFunction] = useState<boolean>(true);
  const [trueFunctionFormula, setTrueFunctionFormula] = useState<string>('3.5 * x + 12');

  // Correlation threshold for auto-selection
  const [corrThreshold, setCorrThreshold] = useState<number>(0.3);

  // Model PDF Export state
  const [isExportingModelPdf, setIsExportingModelPdf] = useState<boolean>(false);

  const prepareData = (xAxisList: string[], yAxis: string): DataPoint[] => {
    if (xAxisList.length === 0 || !yAxis || rawJsonData.length === 0) return [];
    const xIndexes = xAxisList.map(x => headers.indexOf(x));
    const yIndex = headers.indexOf(yAxis);
    
    return rawJsonData
      .map((row, idx) => ({
        index: idx + 1,
        x: parseFloat(row[xIndexes[0]]), // Primary X for 2D plotting
        z: xIndexes.length > 1 ? parseFloat(row[xIndexes[1]]) : undefined, // Secondary X for 3D
        features: xIndexes.map(i => parseFloat(row[i])), // All features
        y: parseFloat(row[yIndex]),
      }))
      .filter(row => !isNaN(row.x) && !isNaN(row.y) && row.features.every(f => !isNaN(f)));
  };

  const data = useMemo(() => prepareData(xAxisCols, yAxisCol), [rawJsonData, headers, xAxisCols, yAxisCol]);

  const dataWithClusters = useMemo(() => {
    return data.map((d, i) => ({
      ...d,
      cluster: kmeansClusters && kmeansClusters.length === data.length ? kmeansClusters[i] : undefined,
    }));
  }, [data, kmeansClusters]);

  const [selectedType, setSelectedType] = useState<'linear' | 'polynomial' | 'ridge' | 'kmeans'>('linear');
  const [dimension, setDimension] = useState<'2d' | '3d'>('2d');

  useEffect(() => {
    if ((selectedType === 'polynomial' || selectedType === 'ridge') && degree === undefined) {
      setDegree(2);
    }
  }, [selectedType, degree]);

  const [k, setK] = useState(3);
  const [result, setResult] = useState<ModelingResult | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const { lastUpdated, forceSync } = useModelingContext();

  // Train/Test Split & Out-of-Sample Model Evaluation State
  const [enableTrainTestSplit, setEnableTrainTestSplit] = useState<boolean>(true);
  const [trainSplitRatio, setTrainSplitRatio] = useState<number>(70); // Default 70% Train, 30% Test (المعيار الموصى به)
  const [splitSeed, setSplitSeed] = useState<number>(42);
  const [splitIndices, setSplitIndices] = useState<{ train: number[]; test: number[] } | null>(null);
  const [isRetrainedOnFullData, setIsRetrainedOnFullData] = useState<boolean>(false);

  // K-Fold Cross-Validation State (درجة التحقق التبادلي وتنبؤ بالمخرجات)
  const [enableCrossValidation, setEnableCrossValidation] = useState<boolean>(false);
  const [cvFolds, setCvFolds] = useState<number>(5);
  const [useCvPredictions, setUseCvPredictions] = useState<boolean>(true);
  const [cvResult, setCvResult] = useState<CrossValidationResult | null>(null);
  const configFileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Save Configuration (حفظ التكوين) to local JSON file
  const handleSaveConfiguration = () => {
    const configData = {
      appName: 'IBM Cloud Pak Data Modeling & Grid Search',
      version: '2.0',
      exportedAt: new Date().toISOString(),
      metadata: {
        totalRows: data.length,
        features: xAxisCols,
        target: yAxisCol
      },
      modelSettings: {
        modelType: selectedType,
        degree,
        alpha,
        includeInteractions,
        showTrueFunction,
        trueFunctionFormula
      },
      dataSplit: {
        enableTrainTestSplit,
        trainSplitRatio,
        splitSeed
      },
      crossValidation: {
        enableCrossValidation,
        cvFolds,
        useCvPredictions
      },
      gridSearch: {
        defaultKFolds: 5,
        defaultScoringMetric: 'r2',
        scope: 'all_models'
      }
    };

    const jsonStr = JSON.stringify(configData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `modeling_config_${selectedType}_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: language === 'ar' ? 'تم حفظ التكوين بنجاح 💾' : 'Configuration Saved 💾',
      description: language === 'ar' 
        ? 'تم حفظ وتنزيل إعدادات تقسيم البيانات والمعاملات والبحث الشبكي كملف JSON محلي.'
        : 'Data split, CV, and Grid Search settings exported to local JSON file.',
      variant: 'success'
    });
    addLog(`[حفظ التكوين] تم تصدير ملف إعدادات التكوين بصيغة JSON بنجاح.`);
  };

  // Import / Load Configuration (استيراد التكوين) from JSON
  const handleImportConfiguration = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        if (parsed.modelSettings) {
          if (parsed.modelSettings.modelType) setSelectedType(parsed.modelSettings.modelType);
          if (parsed.modelSettings.degree !== undefined) setDegree(parsed.modelSettings.degree);
          if (parsed.modelSettings.alpha !== undefined) setAlpha(parsed.modelSettings.alpha);
          if (parsed.modelSettings.includeInteractions !== undefined) setIncludeInteractions(parsed.modelSettings.includeInteractions);
          if (parsed.modelSettings.showTrueFunction !== undefined) setShowTrueFunction(parsed.modelSettings.showTrueFunction);
          if (parsed.modelSettings.trueFunctionFormula) setTrueFunctionFormula(parsed.modelSettings.trueFunctionFormula);
        }
        if (parsed.dataSplit) {
          if (parsed.dataSplit.enableTrainTestSplit !== undefined) setEnableTrainTestSplit(parsed.dataSplit.enableTrainTestSplit);
          if (parsed.dataSplit.trainSplitRatio !== undefined) setTrainSplitRatio(parsed.dataSplit.trainSplitRatio);
          if (parsed.dataSplit.splitSeed !== undefined) setSplitSeed(parsed.dataSplit.splitSeed);
        }
        if (parsed.crossValidation) {
          if (parsed.crossValidation.enableCrossValidation !== undefined) setEnableCrossValidation(parsed.crossValidation.enableCrossValidation);
          if (parsed.crossValidation.cvFolds !== undefined) setCvFolds(parsed.crossValidation.cvFolds);
          if (parsed.crossValidation.useCvPredictions !== undefined) setUseCvPredictions(parsed.crossValidation.useCvPredictions);
        }

        toast({
          title: language === 'ar' ? 'تم استيراد التكوين بنجاح ✓' : 'Configuration Imported ✓',
          description: language === 'ar' ? 'تمت استعادة كافة إعدادات تقسيم البيانات والـ Grid Search.' : 'Settings successfully restored from JSON.',
          variant: 'success'
        });
        addLog(`[استيراد التكوين] تم تحميل الإعدادات بنجاح من ملف ${file.name}.`);
      } catch (err: any) {
        toast({
          title: language === 'ar' ? 'فشل استيراد التكوين' : 'Configuration Import Failed',
          description: err.message || 'Invalid JSON structure',
          variant: 'error'
        });
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  // Dynamic preview counts for UI feedback
  const splitPreview = useMemo(() => {
    const total = data.length;
    if (total === 0) return { trainCount: 0, testCount: 0, trainPct: trainSplitRatio, testPct: 100 - trainSplitRatio };
    const trainCount = Math.max(1, Math.min(total - 1, Math.round(total * (trainSplitRatio / 100))));
    const testCount = Math.max(0, total - trainCount);
    return {
      trainCount,
      testCount,
      trainPct: trainSplitRatio,
      testPct: 100 - trainSplitRatio
    };
  }, [data.length, trainSplitRatio]);

  // Grid Search Hyperparameter Tuning State
  const [isGridSearchOpen, setIsGridSearchOpen] = useState<boolean>(false);

  const handleApplyGridSearchParams = (params: {
    modelType: 'linear' | 'polynomial' | 'ridge';
    degree: number;
    alpha: number;
    includeInteractions: boolean;
  }) => {
    setSelectedType(params.modelType);
    setDegree(params.degree);
    setAlpha(params.alpha);
    setIncludeInteractions(params.includeInteractions);

    addLog(`Grid Search: applied optimal hyperparameters (${params.modelType}, degree=${params.degree}, alpha=${params.alpha}, interactions=${params.includeInteractions})`);
    toast({
      title: language === 'ar' ? 'تم تطبيق المعاملات الفائقة بنجاح' : 'Hyperparameters Applied',
      description: language === 'ar'
        ? `النموذج: ${params.modelType} | الدرجة: ${params.degree} | α: ${params.alpha}`
        : `Model: ${params.modelType} | Deg: ${params.degree} | α: ${params.alpha}`,
      variant: 'success'
    });

    setTimeout(() => {
      calculateModel();
    }, 150);
  };

  useImperativeHandle(ref, () => ({
    calculateModel,
    getSelectedOptions: () => ({ selectedType, xAxisCols, yAxisCol, degree, includeInteractions })
  }));

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  useEffect(() => {
    setModelingResult(result ? {
      type: result.type,
      equation: result.equation,
      r2: result.metrics.r2,
      mse: result.metrics.mse,
      predict: result.predict
    } : null);
  }, [result, setModelingResult]);

  const scikitCode = useMemo(() => {
    if (!result || result.type === 'K-Means') return '';

    const featuresJson = JSON.stringify(result.featureNames || ['x']);
    const targetVal = result.targetName || 'y';
    const interceptVal = result.intercept;
    const coefficientsJson = JSON.stringify(result.coefficients);
    const degreeVal = result.degree || 1;
    const interactionsOnly = result.includeInteractions ? 'False' : 'True';
    
    let code = '';

    if (result.type === 'Linear') {
      code = `# Linear Regression Reproducer using scikit-learn
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

# 1. Dataset features and target definition
features = ${featuresJson}
target = "${targetVal}"

# 2. Define pre-computed model parameters
coefficients = np.array(${coefficientsJson})
intercept = ${interceptVal.toFixed(6)}

# 3. Create and initialize the scikit-learn model
model = LinearRegression()

# Assign the pre-computed parameters
model.coef_ = coefficients
model.intercept_ = intercept

print("✓ scikit-learn LinearRegression model successfully initialized!")
print(f"Intercept (beta_0): {model.intercept_}")
for name, coef in zip(features, model.coef_):
    print(f"Coefficient ({name}): {coef:.6f}")

# 4. Predict on new incoming pipeline data
# Example input: Dataframe with matching column headers
X_new = pd.DataFrame([[1.0] * len(features)], columns=features)
prediction = model.predict(X_new)
print(f"Example prediction: {prediction[0]:.6f}")
`;
    } else if (result.type === 'Polynomial') {
      code = `# Polynomial Regression Pipeline Reproducer using scikit-learn
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import PolynomialFeatures
from sklearn.pipeline import Pipeline

# 1. Setup configuration
features = ${featuresJson}
target = "${targetVal}"
degree = ${degreeVal}
include_interactions = ${result.includeInteractions ? 'True' : 'False'}

# 2. Define pre-computed parameters
coefficients = np.array(${coefficientsJson})
intercept = ${interceptVal.toFixed(6)}

# 3. Build scikit-learn Pipeline
# Note: include_bias=False as the intercept is handled by LinearRegression
poly = PolynomialFeatures(degree=degree, include_bias=False)
model = LinearRegression(fit_intercept=True)

pipeline = Pipeline([
    ('poly', poly),
    ('reg', model)
])

# Trigger a mock fit on dummy data to initialize scikit-learn's internal structures
# (required before manually injecting pre-trained coefficients)
X_dummy = pd.DataFrame(np.random.rand(5, len(features)), columns=features)
y_dummy = np.random.rand(5)
pipeline.fit(X_dummy, y_dummy)

# Inject pre-computed parameters into the regression estimator
pipeline.named_steps['reg'].coef_ = coefficients
pipeline.named_steps['reg'].intercept_ = intercept

print("✓ scikit-learn Polynomial Pipeline successfully initialized with pre-computed coefficients!")
print(f"Intercept: {pipeline.named_steps['reg'].intercept_:.6f}")

# 4. Predict on new pipeline data
X_new = pd.DataFrame([[1.0] * len(features)], columns=features)
prediction = pipeline.predict(X_new)
print(f"Example prediction: {prediction[0]:.6f}")
`;
    } else if (result.type === 'Ridge') {
      const alphaVal = result.alpha || 1.0;
      code = `# Ridge Regression Reproducer using scikit-learn
import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.preprocessing import PolynomialFeatures
from sklearn.pipeline import Pipeline

# 1. Setup configuration
features = ${featuresJson}
target = "${targetVal}"
alpha = ${alphaVal}
degree = ${degreeVal}

# 2. Define pre-computed parameters
coefficients = np.array(${coefficientsJson})
intercept = ${interceptVal.toFixed(6)}

# 3. Build the scikit-learn Model/Pipeline
model = Ridge(alpha=alpha)

if degree > 1:
    poly = PolynomialFeatures(degree=degree, include_bias=False)
    pipeline = Pipeline([
        ('poly', poly),
        ('reg', model)
    ])
    
    # Initialize structures with dummy data
    X_dummy = pd.DataFrame(np.random.rand(5, len(features)), columns=features)
    y_dummy = np.random.rand(5)
    pipeline.fit(X_dummy, y_dummy)
    
    # Inject coefficients
    pipeline.named_steps['reg'].coef_ = coefficients
    pipeline.named_steps['reg'].intercept_ = intercept
    predictor = pipeline
    print("✓ scikit-learn Ridge Polynomial Pipeline successfully initialized!")
else:
    # Initialize linear Ridge
    # Fit dummy to build internal array sizes
    X_dummy = pd.DataFrame(np.random.rand(5, len(features)), columns=features)
    y_dummy = np.random.rand(5)
    model.fit(X_dummy, y_dummy)
    
    # Override with pre-computed parameters
    model.coef_ = coefficients
    model.intercept_ = intercept
    predictor = model
    print("✓ scikit-learn Ridge model successfully initialized!")

# 4. Predict on new incoming pipeline data
X_new = pd.DataFrame([[1.0] * len(features)], columns=features)
prediction = predictor.predict(X_new)
print(f"Example prediction: {prediction[0]:.6f}")
`;
    }

    return code;
  }, [result]);

  // Correlation & Multicollinearity Analysis
  const correlationAnalysis = useMemo(() => {
    if (!isParsed || headers.length < 2 || !yAxisCol) {
      return null;
    }
    const candidateFeatureCols = headers.filter(h => h !== yAxisCol);
    if (candidateFeatureCols.length === 0) return null;

    // Convert raw data to objects
    const dataObjects = rawJsonData.map(row => {
      const obj: any = {};
      headers.forEach((h, i) => {
        obj[h] = parseFloat(row[i]);
      });
      return obj;
    });

    const analysis = analyzeFeatureCorrelations(dataObjects, candidateFeatureCols, yAxisCol, corrThreshold);
    const matrixResult = buildCorrelationMatrix(dataObjects, headers);

    return {
      ...analysis,
      matrixResult,
      candidateFeatureCols
    };
  }, [rawJsonData, headers, yAxisCol, isParsed, corrThreshold]);

  const preprocessingSuggestions = useMemo(() => {
    if (!isParsed || rawJsonData.length === 0) return [];
    const suggestions: { feature: string, type: string, reason: string }[] = [];
    headers.forEach((h, i) => {
      if (h === yAxisCol) return;
      
      const values = rawJsonData.map(row => row[i]);
      const numericValues = values.filter(v => typeof v === 'number' && !isNaN(v));
      const stringValues = values.filter(v => typeof v === 'string' && isNaN(Number(v)));

      if (stringValues.length > numericValues.length) {
        suggestions.push({ feature: h, type: 'One-Hot Encoding / Label Encoding', reason: 'يحتوي على نصوص أو فئات (Categorical Data).' });
      } else if (numericValues.length > 0) {
        const min = Math.min(...numericValues);
        const max = Math.max(...numericValues);
        if (max - min > 1000) {
          suggestions.push({ feature: h, type: 'Scaling (Min-Max / Standard)', reason: 'نطاق القيم كبير جداً (Variance/Range is high).' });
        } else if (min < 0 && max > 0) {
           suggestions.push({ feature: h, type: 'Normalization', reason: 'يحتوي على قيم سالبة وموجبة قد تحتاج إلى توحيد النطاق.' });
        }
      }
    });
    return suggestions;
  }, [rawJsonData, headers, isParsed, yAxisCol]);

  const featureBounds = useMemo(() => {
    const bounds: Record<string, { min: number, max: number, step: number, default: number }> = {};
    xAxisCols.forEach(col => {
      const idx = headers.indexOf(col);
      if (idx === -1) return;
      const values = rawJsonData.map(row => parseFloat(row[idx])).filter(v => !isNaN(v));
      if (values.length > 0) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        const step = (max - min) / 100 || 1;
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        bounds[col] = { min, max, step, default: avg };
      }
    });
    return bounds;
  }, [rawJsonData, headers, xAxisCols]);

  useEffect(() => {
    if (mainViewMode === 'inference' && result) {
      // Initialize inputs when entering inference mode
      const initialInputs: Record<string, number> = {};
      result.featureNames.forEach(feat => {
        initialInputs[feat] = featureBounds[feat]?.default || 0;
      });
      setInferenceInputs(initialInputs);
    }
  }, [mainViewMode, result, featureBounds]);

  const radarData = useMemo(() => {
    if (savedModels.length === 0) return [];
    
    // Normalize metrics so higher is always better (0-100 scale)
    const maxMSE = Math.max(...savedModels.map(m => m.mse), 0.0001);
    const minMSE = Math.min(...savedModels.map(m => m.mse));
    const maxTime = Math.max(...savedModels.map(m => m.trainingTime), 1);
    const minTime = Math.min(...savedModels.map(m => m.trainingTime));
    const maxOverfitting = Math.max(...savedModels.map(m => m.overfittingIndex), 0.01);
    const minOverfitting = Math.min(...savedModels.map(m => m.overfittingIndex));

    const metrics = [
      { 
        key: 'r2', 
        name: language === 'ar' ? 'معامل التحديد R²' : 'R² Score',
        fullLabel: language === 'ar' ? 'معامل التحديد وجودة التوافق (R²)' : 'Fit Quality (R² Score)',
        unit: ''
      },
      { 
        key: 'mse', 
        name: language === 'ar' ? 'مؤشر دقة MSE' : 'MSE Precision',
        fullLabel: language === 'ar' ? 'دقة تقليل الخطأ (Mean Squared Error)' : 'Error Minimization (MSE)',
        unit: ''
      },
      { 
        key: 'trainingTime', 
        name: language === 'ar' ? 'سرعة التدريب' : 'Training Speed',
        fullLabel: language === 'ar' ? 'سرعة إنجاز التدريب الحسابي' : 'Training Execution Speed',
        unit: 'ms'
      },
      { 
        key: 'overfittingIndex', 
        name: language === 'ar' ? 'مقاومة التخصيص' : 'Generalization',
        fullLabel: language === 'ar' ? 'مقاومة فرط التخصيص والتعميم' : 'Generalization (Anti-Overfitting)',
        unit: ''
      }
    ];

    return metrics.map(metric => {
      const dataRow: any = { 
        name: metric.name,
        fullLabel: metric.fullLabel,
        metricKey: metric.key,
        unit: metric.unit
      };

      savedModels.forEach(model => {
        const modelKey = `m_${model.id}`;
        let score = 50;

        if (metric.key === 'r2') {
          score = Math.max(0, Math.min(100, (model.r2 || 0) * 100));
          dataRow[`${modelKey}_raw`] = (model.r2 || 0).toFixed(4);
        } else if (metric.key === 'mse') {
          if (maxMSE === minMSE) {
            score = 90;
          } else {
            score = Math.max(12, Math.min(100, 100 - (((model.mse || 0) - minMSE) / (maxMSE - minMSE)) * 80));
          }
          dataRow[`${modelKey}_raw`] = (model.mse || 0).toFixed(4);
        } else if (metric.key === 'trainingTime') {
          if (maxTime === minTime) {
            score = 90;
          } else {
            score = Math.max(15, Math.min(100, 100 - (((model.trainingTime || 1) - minTime) / (maxTime - minTime)) * 75));
          }
          dataRow[`${modelKey}_raw`] = `${(model.trainingTime || 0).toFixed(1)} ms`;
        } else if (metric.key === 'overfittingIndex') {
          if (maxOverfitting === minOverfitting) {
            score = 90;
          } else {
            score = Math.max(15, Math.min(100, 100 - (((model.overfittingIndex || 0.1) - minOverfitting) / (maxOverfitting - minOverfitting)) * 75));
          }
          dataRow[`${modelKey}_raw`] = (model.overfittingIndex || 0).toFixed(3);
        }

        dataRow[modelKey] = Math.round(score);
      });

      return dataRow;
    });
  }, [savedModels, language]);

  const modelColors = ['#0f62fe', '#8a3ffc', '#198038', '#ff832b', '#0072c3', '#da1e28', '#1192e8', '#6929c4'];

  const sortedSavedModels = useMemo(() => {
    if (modelsSortField === 'none') return savedModels;
    return [...savedModels].sort((a, b) => {
      const valA = (a as any)[modelsSortField];
      const valB = (b as any)[modelsSortField];
      if (modelsSortOrder === 'asc') return valA - valB;
      return valB - valA;
    });
  }, [savedModels, modelsSortField, modelsSortOrder]);

  const bestModelMetrics = useMemo(() => {
    if (savedModels.length === 0) return { bestR2: -Infinity, bestMSE: Infinity, fastestTime: Infinity, bestGen: Infinity };
    return {
      bestR2: Math.max(...savedModels.map(m => m.r2)),
      bestMSE: Math.min(...savedModels.map(m => m.mse)),
      fastestTime: Math.min(...savedModels.map(m => m.trainingTime)),
      bestGen: Math.min(...savedModels.map(m => m.overfittingIndex))
    };
  }, [savedModels]);

  const loadBenchmarkSuite = () => {
    const sampleModels = [
      {
        id: 'bench-1',
        name: language === 'ar' ? 'انحدار خطي أولي (Linear Baseline)' : 'Linear Regression (Baseline)',
        type: 'linear',
        mse: 22.4500,
        r2: 0.8120,
        equation: 'y = 3.42 * X1 + 12.10',
        features: xAxisCols.length > 0 ? xAxisCols : ['Feature_1'],
        target: yAxisCol || 'Target_Y',
        trainingTime: 8.4,
        overfittingIndex: 0.12,
        coefficients: [3.42],
        intercept: 12.10,
        degree: 1,
        includeInteractions: false,
        metrics: {
          r2: 0.8120,
          adjustedR2: 0.7980,
          mse: 22.4500,
          rmse: 4.7381,
          mae: 3.6500,
          n: 100,
          p: 1,
          aic: 205.6,
          bic: 210.4,
          accuracyGrade: 'ممتاز (Excellent)'
        }
      },
      {
        id: 'bench-2',
        name: language === 'ar' ? 'متعدد الحدود (Degree 2 Fit)' : 'Polynomial Reg (Deg 2)',
        type: 'polynomial',
        mse: 11.2300,
        r2: 0.9380,
        equation: 'y = 1.15 * X1² + 0.84 * X1 + 5.62',
        features: xAxisCols.length > 0 ? xAxisCols : ['Feature_1'],
        target: yAxisCol || 'Target_Y',
        trainingTime: 16.2,
        overfittingIndex: 0.19,
        coefficients: [0.84, 1.15],
        intercept: 5.62,
        degree: 2,
        includeInteractions: false,
        metrics: {
          r2: 0.9380,
          adjustedR2: 0.9250,
          mse: 11.2300,
          rmse: 3.3511,
          mae: 2.4500,
          n: 100,
          p: 2,
          aic: 178.4,
          bic: 185.8,
          accuracyGrade: 'ممتاز (Excellent)'
        }
      },
      {
        id: 'bench-3',
        name: language === 'ar' ? 'انحدار متعدد الميزات (Ridge Multi)' : 'Multivariate Linear (Ridge)',
        type: 'linear',
        mse: 16.8200,
        r2: 0.8750,
        equation: 'y = 2.10 * X1 + 1.45 * X2 + 8.30',
        features: xAxisCols.length > 1 ? xAxisCols : ['Feature_1', 'Feature_2'],
        target: yAxisCol || 'Target_Y',
        trainingTime: 12.8,
        overfittingIndex: 0.15,
        coefficients: [2.10, 1.45],
        intercept: 8.30,
        degree: 1,
        includeInteractions: false,
        metrics: {
          r2: 0.8750,
          adjustedR2: 0.8610,
          mse: 16.8200,
          rmse: 4.1012,
          mae: 3.1200,
          n: 100,
          p: 2,
          aic: 195.3,
          bic: 202.1,
          accuracyGrade: 'ممتاز (Excellent)'
        }
      },
      {
        id: 'bench-4',
        name: language === 'ar' ? 'متعدد حدود عالي (Deg 3 + Inter)' : 'Poly Reg (Deg 3 + Inter)',
        type: 'polynomial',
        mse: 8.9400,
        r2: 0.9650,
        equation: 'y = 0.42 * X1³ + 0.81 * X1·X2 + 4.15',
        features: xAxisCols.length > 1 ? xAxisCols : ['Feature_1', 'Feature_2'],
        target: yAxisCol || 'Target_Y',
        trainingTime: 44.5,
        overfittingIndex: 0.48,
        coefficients: [0.52, 0.81, 0.42],
        intercept: 4.15,
        degree: 3,
        includeInteractions: true,
        metrics: {
          r2: 0.9650,
          adjustedR2: 0.9540,
          mse: 8.9400,
          rmse: 2.9900,
          mae: 2.0500,
          n: 100,
          p: 6,
          aic: 162.4,
          bic: 176.8,
          accuracyGrade: 'ممتاز (Excellent)'
        }
      }
    ];
    setSavedModels(sampleModels as typeof savedModels);
    addLog('Loaded Benchmark Regression Suite (4 Models) for Radar Comparison.');
  };

  const exportModelsCSV = () => {
    if (savedModels.length === 0) return;
    const csvData = savedModels.map((m, i) => ({
      'Model ID': i + 1,
      'Model Name': m.name,
      'Model Type': m.type,
      'R-squared': m.r2.toFixed(4),
      'MSE': m.mse.toFixed(4),
      'Equation': m.equation,
      'Features': m.features?.join(', ') || '',
      'Target Variable': m.target || ''
    }));
    const csv = Papa.unparse(csvData);
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'model_comparison_report.csv';
    a.click();
    URL.revokeObjectURL(url);
    addLog('Exported saved models to CSV.');
  };

  const exportModelsJSON = () => {
    if (savedModels.length === 0) return;
    const blob = new Blob([JSON.stringify(savedModels, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'model_comparison_report.json';
    a.click();
    URL.revokeObjectURL(url);
    addLog('Exported saved models to JSON.');
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    addLog(`File uploaded: ${file.name}`);
    setKmeansClusters(null);
    setResult(null);

    if (file.name.endsWith('.csv')) {
      Papa.parse(file, {
        header: false,
        dynamicTyping: true,
        complete: (results) => {
          const rows = results.data as any[][];
          if (rows.length < 2) return;
          const [headerRow, ...dataRows] = rows;
          setHeaders(headerRow);
          setRawJsonData(dataRows);
          setXAxisCols([headerRow[0]]);
          setYAxisCol(headerRow[headerRow.length - 1] || headerRow[0]);
          setIsParsed(true);
          addLog(`CSV parsed: ${dataRows.length} points, ${headerRow.length} columns.`);
        }
      });
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataBuffer = new Uint8Array(e.target!.result as ArrayBuffer);
        const workbook = XLSX.read(dataBuffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        if (json.length < 2) return;
        const [headerRow, ...dataRows] = json;
        setHeaders(headerRow);
        setRawJsonData(dataRows);
        setXAxisCols([headerRow[0]]);
        setYAxisCol(headerRow[headerRow.length - 1] || headerRow[0]);
        setIsParsed(true);
        addLog(`XLSX parsed: ${dataRows.length} points, ${headerRow.length} columns.`);
      };
      reader.readAsArrayBuffer(file);
    }
  };

  const loadDemoDataset = (type: 'multivariate' | 'poly' | 'linear') => {
    setKmeansClusters(null);
    setResult(null);

    if (type === 'multivariate') {
      // Multivariate Real Estate Dataset (Area, Rooms, Age, Distance -> Price)
      const headersList = ['المساحة_Area_m2', 'عدد_الغرف_Rooms', 'عمر_العقار_Age_yrs', 'المسافة_للمركز_Dist_km', 'السعر_Price_k$'];
      const rows: number[][] = [];
      
      for (let i = 0; i < 50; i++) {
        const area = Math.round(70 + Math.random() * 180); // 70 - 250 m2
        const rooms = Math.round(2 + (area / 50) + (Math.random() - 0.5) * 1.5); // 2 - 6 rooms
        const age = Math.round(1 + Math.random() * 30); // 1 - 30 years
        const dist = Number((1.5 + Math.random() * 20).toFixed(1)); // 1.5 - 21.5 km

        // Non-linear True Function with Interaction:
        // Price = 40 + 1.8*Area + 15*Rooms - 1.2*Age - 3.5*Dist + 0.003*(Area^2) + noise
        const noise = (Math.random() - 0.5) * 12;
        const price = Number((40 + 1.8 * area + 15 * rooms - 1.2 * age - 3.5 * dist + 0.003 * Math.pow(area, 2) + noise).toFixed(2));

        rows.push([area, rooms, age, dist, price]);
      }

      setHeaders(headersList);
      setRawJsonData(rows);
      setXAxisCols(['المساحة_Area_m2', 'عدد_الغرف_Rooms', 'عمر_العقار_Age_yrs', 'المسافة_للمركز_Dist_km']);
      setYAxisCol('السعر_Price_k$');
      setSelectedType('polynomial');
      setDegree(2);
      setIncludeInteractions(true);
      setTrueFunctionFormula('40 + 1.8 * x1 + 15 * x2 - 1.2 * x3 - 3.5 * x4 + 0.003 * x1^2');
      setIsParsed(true);
      addLog('Loaded Synthetic Multivariate Dataset (Real Estate: 4 Features with Interaction Terms)');
    } else if (type === 'poly') {
      const headersList = ['x', 'y'];
      const rows: number[][] = [];
      for (let i = -10; i <= 10; i += 0.5) {
        const noise = (Math.random() - 0.5) * 8;
        const yVal = 2.5 * (i * i) - 4.2 * i + 15 + noise;
        rows.push([Number(i.toFixed(2)), Number(yVal.toFixed(3))]);
      }
      setHeaders(headersList);
      setRawJsonData(rows);
      setXAxisCols(['x']);
      setYAxisCol('y');
      setSelectedType('polynomial');
      setDegree(2);
      setTrueFunctionFormula('2.5 * x^2 - 4.2 * x + 15');
      setIsParsed(true);
      addLog('Loaded Synthetic Polynomial Demo Dataset (y = 2.5x² - 4.2x + 15 + ε)');
    } else {
      const headersList = ['x', 'y'];
      const rows: number[][] = [];
      for (let i = 0; i <= 30; i += 1) {
        const noise = (Math.random() - 0.5) * 6;
        const yVal = 3.5 * i + 12 + noise;
        rows.push([Number(i.toFixed(2)), Number(yVal.toFixed(3))]);
      }
      setHeaders(headersList);
      setRawJsonData(rows);
      setXAxisCols(['x']);
      setYAxisCol('y');
      setSelectedType('linear');
      setTrueFunctionFormula('3.5 * x + 12');
      setIsParsed(true);
      addLog('Loaded Synthetic Linear Demo Dataset (y = 3.5x + 12 + ε)');
    }
  };

  const applyRecommendedFeatures = () => {
    if (correlationAnalysis && correlationAnalysis.recommendedFeatures.length > 0) {
      setXAxisCols(correlationAnalysis.recommendedFeatures);
      addLog(`Applied recommended features from correlation analysis: [${correlationAnalysis.recommendedFeatures.join(', ')}]`);
    }
  };

  /**
   * Fits model parameters on a specified dataset (e.g. 70% Train or 100% Full)
   */
  const fitModelCore = (trainingData: DataPoint[]) => {
    const isMultivariate = xAxisCols.length > 1;

    if (selectedType === 'linear') {
      if (!isMultivariate) {
        // Simple Linear Regression (1 Feature)
        const points = trainingData.map(p => [p.x, p.y]);
        const reg = ss.linearRegression(points);
        const line = ss.linearRegressionLine(reg);
        const mFormatted = Number(reg.m.toFixed(4));
        const bFormatted = Number(reg.b.toFixed(4));
        const xLabel = xAxisCols[0] || 'x';
        const sign = bFormatted >= 0 ? '+ ' : '- ';
        const eq = `${yAxisCol || 'y'} = ${mFormatted} · ${xLabel} ${sign}${Math.abs(bFormatted)}`;

        const pythonCode = `# Simple Linear Regression Model\n# ${yAxisCol} = f(${xLabel})\ndef predict_${yAxisCol || 'y'}(${xLabel}):\n    return ${mFormatted} * ${xLabel} + (${bFormatted})`;
        const jsCode = `// Simple Linear Regression Model\nfunction predict${yAxisCol || 'Y'}(${xLabel}) {\n  return ${mFormatted} * ${xLabel} + (${bFormatted});\n}`;

        return {
          type: 'Linear' as const,
          degree: 1,
          isMultivariate: false,
          equation: eq,
          pythonCode,
          jsCode,
          intercept: reg.b,
          coefficients: [reg.m],
          coefficientDetails: [{
            name: xLabel,
            power: 1,
            coefficient: reg.m,
            formattedTerm: `${reg.m >= 0 ? '+' : '-'} ${Math.abs(reg.m).toFixed(4)} · ${xLabel}`,
            importancePercent: 100
          }],
          featureNames: xAxisCols,
          termsCount: 1,
          predictFn: (features: number[]) => line(features[0])
        };
      } else {
        // Multiple Linear Regression
        const X = trainingData.map(p => p.features);
        const Y = trainingData.map(p => [p.y]);
        const reg = new MultivariateLinearRegression(X, Y, { intercept: true, statistics: true });
        
        const weights = reg.weights as number[][];
        const intercept = weights[weights.length - 1][0];
        const coefficients = weights.slice(0, weights.length - 1).map((w: number[]) => w[0]);

        const equation = formatPolynomialEquation(intercept, coefficients, xAxisCols, yAxisCol || 'y');
        const coeffAnalysis = extractCoefficientDetails(intercept, coefficients, xAxisCols);

        const pyTerms = coefficients.map((c, i) => `${c.toFixed(6)} * ${xAxisCols[i]}`).join(' +\n        ');
        const pythonCode = `# Multiple Linear Regression Model\n# ${yAxisCol} = f(${xAxisCols.join(', ')})\ndef predict_${yAxisCol || 'y'}(${xAxisCols.join(', ')}):\n    return (${intercept.toFixed(6)} +\n        ${pyTerms})`;

        const jsTerms = coefficients.map((c, i) => `${c.toFixed(6)} * ${xAxisCols[i]}`).join(' +\n    ');
        const jsCode = `// Multiple Linear Regression Model\nfunction predict${yAxisCol || 'Y'}(${xAxisCols.join(', ')}) {\n  return ${intercept.toFixed(6)} +\n    ${jsTerms};\n}`;

        return {
          type: 'Linear' as const,
          degree: 1,
          isMultivariate: true,
          equation,
          pythonCode,
          jsCode,
          intercept,
          coefficients,
          coefficientDetails: coeffAnalysis.details,
          featureNames: xAxisCols,
          termsCount: xAxisCols.length,
          predictFn: (features: number[]) => reg.predict(features)[0]
        };
      }
    } else if (selectedType === 'polynomial') {
      const X = trainingData.map(p => createPolynomialFeatures(p.features, degree, includeInteractions));
      const Y = trainingData.map(p => p.y);
      const featureNames = getPolynomialFeatureNames(xAxisCols, degree, includeInteractions);

      let intercept = 0;
      let coefficients: number[] = [];
      let predictFn: (features: number[]) => number;

      if (degree > 5) {
        const ridgeAns = calculateRidgeRegression(X, Y, 1e-6);
        intercept = ridgeAns.intercept;
        coefficients = ridgeAns.coefficients;
        predictFn = (features: number[]) => {
          const polyX = createPolynomialFeatures(features, degree, includeInteractions);
          return ridgeAns.predict(polyX);
        };
      } else {
        try {
          const reg = new MultivariateLinearRegression(X, Y.map(yVal => [yVal]), { intercept: true, statistics: true });
          const weights = reg.weights as number[][];
          intercept = weights[weights.length - 1][0];
          coefficients = weights.slice(0, weights.length - 1).map((w: number[]) => w[0]);
          predictFn = (features: number[]) => {
            const polyX = createPolynomialFeatures(features, degree, includeInteractions);
            return reg.predict(polyX)[0];
          };
        } catch (e) {
          const ridgeAns = calculateRidgeRegression(X, Y, 1e-6);
          intercept = ridgeAns.intercept;
          coefficients = ridgeAns.coefficients;
          predictFn = (features: number[]) => {
            const polyX = createPolynomialFeatures(features, degree, includeInteractions);
            return ridgeAns.predict(polyX);
          };
        }
      }

      const equation = formatPolynomialEquation(intercept, coefficients, featureNames, yAxisCol || 'y');
      const coeffAnalysis = extractCoefficientDetails(intercept, coefficients, featureNames);

      const pyTerms = coefficients.map((c, i) => {
        const rawName = featureNames[i] || `x${i+1}`;
        let formattedName = rawName.replace(/\^(\d+)/g, '**$1').replace('·', '*');
        return `${c.toFixed(6)} * (${formattedName})`;
      }).join(' +\n        ');
      const pythonCode = `# Multivariate Polynomial Regression (Degree ${degree}, Interactions: ${includeInteractions ? 'Yes' : 'No'})\n# ${yAxisCol} = f(${xAxisCols.join(', ')})\ndef predict_${yAxisCol || 'y'}(${xAxisCols.join(', ')}):\n    return (${intercept.toFixed(6)} +\n        ${pyTerms})`;

      const jsTerms = coefficients.map((c, i) => {
        const name = featureNames[i] || `x${i+1}`;
        if (name.includes('·')) {
          const [f1, f2] = name.split('·').map(s => s.trim());
          return `${c.toFixed(6)} * (${f1} * ${f2})`;
        } else if (name.includes('^')) {
          const [base, pow] = name.split('^').map(s => s.trim());
          return `${c.toFixed(6)} * Math.pow(${base}, ${pow})`;
        }
        return `${c.toFixed(6)} * ${name}`;
      }).join(' +\n    ');
      const jsCode = `// Multivariate Polynomial Regression (Degree ${degree})\nfunction predict${yAxisCol || 'Y'}(${xAxisCols.join(', ')}) {\n  return ${intercept.toFixed(6)} +\n    ${jsTerms};\n}`;

      return {
        type: 'Polynomial' as const,
        degree,
        includeInteractions,
        isMultivariate,
        equation,
        pythonCode,
        jsCode,
        intercept,
        coefficients,
        coefficientDetails: coeffAnalysis.details,
        featureNames: xAxisCols,
        termsCount: featureNames.length,
        predictFn
      };
    } else if (selectedType === 'ridge') {
      const featureNames = degree > 1 
        ? getPolynomialFeatureNames(xAxisCols, degree, includeInteractions)
        : xAxisCols;

      const X = trainingData.map(p => 
        degree > 1 ? createPolynomialFeatures(p.features, degree, includeInteractions) : p.features
      );
      const y = trainingData.map(p => p.y);

      const ridgeAns = calculateRidgeRegression(X, y, alpha);
      const intercept = ridgeAns.intercept;
      const coefficients = ridgeAns.coefficients;

      const equation = formatPolynomialEquation(intercept, coefficients, featureNames, yAxisCol || 'y');
      const coeffAnalysis = extractCoefficientDetails(intercept, coefficients, featureNames);

      const predictFn = (features: number[]) => {
        const xFeats = degree > 1 ? createPolynomialFeatures(features, degree, includeInteractions) : features;
        return ridgeAns.predict(xFeats);
      };

      const pyTerms = coefficients.map((c, i) => {
        const rawName = featureNames[i] || `x${i+1}`;
        let formattedName = rawName.replace(/\^(\d+)/g, '**$1').replace('·', '*');
        return `${c.toFixed(6)} * (${formattedName})`;
      }).join(' +\n        ');
      const pythonCode = `# Ridge Regression (Alpha: ${alpha}, Degree: ${degree})\nfrom sklearn.linear_model import Ridge\n# model = Ridge(alpha=${alpha})\ndef predict_${yAxisCol || 'y'}(${xAxisCols.join(', ')}):\n    return (${intercept.toFixed(6)} +\n        ${pyTerms})`;

      const jsTerms = coefficients.map((c, i) => {
        const name = featureNames[i] || `x${i+1}`;
        return `${c.toFixed(6)} * ${name}`;
      }).join(' +\n    ');
      const jsCode = `// Ridge Regression Model (Alpha=${alpha}, Deg=${degree})\nfunction predict${yAxisCol || 'Y'}(${xAxisCols.join(', ')}) {\n  return ${intercept.toFixed(6)} +\n    ${jsTerms};\n}`;

      return {
        type: 'Ridge' as const,
        degree: degree > 1 ? degree : 1,
        alpha,
        l2Penalty: ridgeAns.l2Penalty,
        includeInteractions,
        isMultivariate,
        equation,
        pythonCode,
        jsCode,
        intercept,
        coefficients,
        coefficientDetails: coeffAnalysis.details,
        featureNames: xAxisCols,
        termsCount: featureNames.length,
        predictFn
      };
    } else {
      throw new Error('Invalid model type selected.');
    }
  };

  /**
   * Retrains the chosen model architecture on 100% of the dataset
   * as requested: "وبعد ان ينتهي تدريب النموذج يجب ان نستخدم جميع البيانات لتدريب النموذج"
   */
  const retrainOnFullData = () => {
    if (!result || selectedType === 'kmeans') return;
    const validatedData = prepareData(xAxisCols, yAxisCol);
    if (validatedData.length < 2) return;

    try {
      const fullFitted = fitModelCore(validatedData);
      const actualsFull = validatedData.map(p => p.y);
      const predsFull = validatedData.map(p => fullFitted.predictFn(p.features));
      const fullMetrics = calculateRegressionMetrics(actualsFull, predsFull, fullFitted.termsCount);

      setResult(prev => {
        if (!prev) return null;
        return {
          ...prev,
          equation: fullFitted.equation,
          intercept: fullFitted.intercept,
          coefficients: fullFitted.coefficients,
          coefficientDetails: fullFitted.coefficientDetails,
          pythonCode: fullFitted.pythonCode,
          jsCode: fullFitted.jsCode,
          predict: fullFitted.predictFn,
          metrics: fullMetrics,
          splitInfo: prev.splitInfo ? {
            ...prev.splitInfo,
            isRetrainedOnFullData: true,
            fullDataMetrics: fullMetrics
          } : undefined
        };
      });

      setIsRetrainedOnFullData(true);
      addLog(`✓ تم إعادة تدريب النموذج النهائي بنجاح على كامل البيانات (100% - ${validatedData.length} عينة). البارامترات الآن جاهزة للإنتاج والتنبؤ مع الاحتفاظ بتقييم الاختبار كمرجع معتمد.`);
      if (toast) {
        toast({
          title: language === 'ar' ? 'تم التدريب النهائي بنجاح' : 'Full Retraining Complete',
          description: language === 'ar' ? `تم تدريب النموذج على كامل الـ ${validatedData.length} نقطة بيانات للاستخدام الإنتاجي.` : `Trained on all ${validatedData.length} samples for production readiness.`,
          variant: 'success'
        });
      }
    } catch (err: any) {
      const errorMsg = `Retraining error: ${err.message}`;
      setStatusMessage(errorMsg);
      addLog(errorMsg);
    }
  };

  const calculateModel = () => {
    setStatusMessage(null);
    const validatedData = prepareData(xAxisCols, yAxisCol);
    addLog(`Initiating calculation. Points: ${validatedData.length}, Type: ${selectedType}, Features: [${xAxisCols.join(', ')}], Target: ${yAxisCol}`);
    
    if (validatedData.length === 0) {
      const errorMsg = 'Error: Dataset is empty or no valid numeric data matches the selected columns.';
      setStatusMessage(errorMsg);
      addLog(errorMsg);
      return;
    }
    
    if (validatedData.length < 2) {
      const errorMsg = 'Error: Data too short (need at least 2 points).';
      setStatusMessage(errorMsg);
      addLog(errorMsg);
      return;
    }

    const isMultivariate = xAxisCols.length > 1;

    try {
      if (selectedType === 'kmeans') {
        const points = validatedData.map(p => p.features); 
        const ans = kmeans(points, k, {});
        setKmeansClusters(ans.clusters);
        setResult({
          type: 'K-Means',
          isMultivariate,
          equation: `Clusters: ${k}`,
          pythonCode: `# K-Means Clustering\nfrom sklearn.cluster import KMeans\nkmeans = KMeans(n_clusters=${k}).fit(X)`,
          jsCode: `// K-Means with ${k} clusters\nconst { kmeans } = require('ml-kmeans');\nconst result = kmeans(points, ${k});`,
          intercept: 0,
          coefficients: [],
          coefficientDetails: [],
          metrics: {
            r2: 0,
            adjustedR2: 0,
            mse: 0,
            rmse: 0,
            mae: 0,
            n: validatedData.length,
            p: xAxisCols.length,
            aic: 0,
            bic: 0,
accuracyGrade: 'ضعيف (Poor)'
          },
          featureNames: xAxisCols,
          targetName: yAxisCol || 'y',
          predict: () => 0
        });
        setSplitIndices(null);
        setIsRetrainedOnFullData(false);
        addLog(`K-Means clustering completed with ${k} clusters on ${xAxisCols.length} features.`);
      } else {
        // Supervised Regression with Train / Test Split Model Evaluation
        const shouldUseSplit = enableTrainTestSplit && validatedData.length >= 4;

        if (shouldUseSplit) {
          // 1. Split into Training (e.g. 70%) and Testing (e.g. 30%)
          const split = trainTestSplit(validatedData, trainSplitRatio / 100, true, splitSeed);
          const trainData = split.train;
          const testData = split.test;
          setSplitIndices({ train: split.trainIndices, test: split.testIndices });

          // 2. Fit model ONLY on Training Set (داخل العينة)
          const fitted = fitModelCore(trainData);

          // 3. Compute In-Sample Metrics (Training Performance)
          const actualsTrain = trainData.map(p => p.y);
          const predsTrain = trainData.map(p => fitted.predictFn(p.features));
          const trainMetrics = calculateRegressionMetrics(actualsTrain, predsTrain, fitted.termsCount);

          // 4. Compute Out-of-Sample Metrics (Testing Performance on Unseen Data)
          const actualsTest = testData.map(p => p.y);
          const predsTest = testData.map(p => fitted.predictFn(p.features));
          const testMetrics = calculateRegressionMetrics(actualsTest, predsTest, fitted.termsCount);

          // 5. Generalization Gap & Overfitting Analysis
          const generalizationGap = trainMetrics.r2 - testMetrics.r2;
          const rmseInflationRatio = trainMetrics.rmse > 0 ? testMetrics.rmse / trainMetrics.rmse : 1;

          let verdict: ModelSplitInfo['verdict'] = 'good';
          let verdictLabelAr = 'تعميم ملائم (Good Generalization)';
          let verdictLabelEn = 'Good Generalization';

          if (trainMetrics.r2 < 0.40 && testMetrics.r2 < 0.40) {
            verdict = 'underfitting';
            verdictLabelAr = 'ضعف ملاءمة (Underfitting)';
            verdictLabelEn = 'Underfitting';
          } else if (generalizationGap > 0.12 || (trainMetrics.r2 > 0.85 && testMetrics.r2 < 0.65) || rmseInflationRatio > 1.35) {
            verdict = 'overfitting';
            verdictLabelAr = 'خطر التوافق المفرط (Overfitting Risk)';
            verdictLabelEn = 'Overfitting Risk';
          } else if (generalizationGap <= 0.06 && testMetrics.r2 >= 0.70) {
            verdict = 'excellent';
            verdictLabelAr = 'تعميم ممتاز (Excellent Generalization)';
            verdictLabelEn = 'Excellent Generalization';
          }

          setIsRetrainedOnFullData(false);

          // Execute Cross-Validation if enabled (for smaller datasets or thorough multi-fold R² evaluation)
          let computedCvResult: CrossValidationResult | null = null;
          if (enableCrossValidation && validatedData.length >= cvFolds) {
            try {
              computedCvResult = runKFoldCrossValidation(
                validatedData,
                selectedType,
                degree,
                alpha,
                includeInteractions,
                cvFolds,
                splitSeed
              );
              setCvResult(computedCvResult);
              addLog(`[المصادقة التبادلية ${cvFolds}-Fold CV] درجة التحقق التبادلي: R² = ${computedCvResult.meanTestR2.toFixed(4)} (±${computedCvResult.stdTestR2.toFixed(4)}) | إجمالي تنبؤات المخرجات R²_OOF = ${computedCvResult.overallOofR2.toFixed(4)}`);
            } catch (cvErr: any) {
              console.warn('Cross-validation calculation error:', cvErr);
            }
          } else {
            setCvResult(null);
          }

          setResult({
            ...fitted,
            metrics: testMetrics, // Primary metrics represent true out-of-sample capability
            targetName: yAxisCol || 'y',
            predict: fitted.predictFn,
            cvInfo: computedCvResult || undefined,
            isCvPredicting: enableCrossValidation && useCvPredictions && !!computedCvResult,
            splitInfo: {
              enabled: true,
              trainRatio: trainSplitRatio,
              testRatio: 100 - trainSplitRatio,
              trainCount: trainData.length,
              testCount: testData.length,
              trainMetrics,
              testMetrics,
              generalizationGap,
              rmseInflationRatio,
              verdict,
              verdictLabelAr,
              verdictLabelEn,
              isRetrainedOnFullData: false
            }
          });

          addLog(`[تقسيم البيانات ${trainSplitRatio}/${100 - trainSplitRatio}] تم تدريب النموذج على ${trainData.length} نقطة (داخل العينة). R² للتدريب = ${trainMetrics.r2.toFixed(4)} | تم تقييم النموذج على ${testData.length} نقطة (خارج العينة). R² للاختبار = ${testMetrics.r2.toFixed(4)} | التشخيص: ${verdictLabelAr}`);
          
          toast.success(
            language === 'ar' ? 'اكتمل تدريب وتقييم النموذج بنجاح!' : 'Model Training & Evaluation Completed!',
            language === 'ar'
              ? `تم تدريب النموذج بنجاح. R² للاختبار = ${testMetrics.r2.toFixed(4)} (${verdictLabelAr})`
              : `Model successfully trained. Test R² = ${testMetrics.r2.toFixed(4)} (${verdictLabelEn})`
          );
        } else {
          // Fit on all validated data directly
          const fitted = fitModelCore(validatedData);
          const actuals = validatedData.map(p => p.y);
          const preds = validatedData.map(p => fitted.predictFn(p.features));
          const metrics = calculateRegressionMetrics(actuals, preds, fitted.termsCount);

          setSplitIndices(null);
          setIsRetrainedOnFullData(true);

          // Execute Cross-Validation if enabled (for smaller datasets or multi-fold R² evaluation)
          let computedCvResult: CrossValidationResult | null = null;
          if (enableCrossValidation && validatedData.length >= cvFolds) {
            try {
              computedCvResult = runKFoldCrossValidation(
                validatedData,
                selectedType,
                degree,
                alpha,
                includeInteractions,
                cvFolds,
                splitSeed
              );
              setCvResult(computedCvResult);
              addLog(`[المصادقة التبادلية ${cvFolds}-Fold CV] درجة التحقق التبادلي: R² = ${computedCvResult.meanTestR2.toFixed(4)} (±${computedCvResult.stdTestR2.toFixed(4)}) | إجمالي تنبؤات المخرجات R²_OOF = ${computedCvResult.overallOofR2.toFixed(4)}`);
            } catch (cvErr: any) {
              console.warn('Cross-validation calculation error:', cvErr);
            }
          } else {
            setCvResult(null);
          }

          setResult({
            ...fitted,
            metrics,
            targetName: yAxisCol || 'y',
            predict: fitted.predictFn,
            cvInfo: computedCvResult || undefined,
            isCvPredicting: enableCrossValidation && useCvPredictions && !!computedCvResult,
            splitInfo: undefined
          });

          addLog(`${fitted.type} regression calculated on full dataset (${validatedData.length} samples): ${fitted.equation} | R²: ${metrics.r2.toFixed(4)}`);

          toast.success(
            language === 'ar' ? 'اكتمل تدريب النموذج بنجاح!' : 'Model Training Completed!',
            language === 'ar'
              ? `تم تدريب نموذج ${fitted.type} على ${validatedData.length} عينة بدقة R² = ${metrics.r2.toFixed(4)}`
              : `${fitted.type} model trained on ${validatedData.length} samples with R² = ${metrics.r2.toFixed(4)}`
          );
        }
      }
    } catch (error: any) {
      const errorMsg = `Modeling error: ${error.message}`;
      setStatusMessage(errorMsg);
      addLog(errorMsg);
      setResult(null);
      toast.error(
        language === 'ar' ? 'فشل تدريب النموذج' : 'Model Training Failed',
        error.message || (language === 'ar' ? 'حدث خطأ أثناء حساب معاملات النموذج.' : 'An error occurred during model computation.')
      );
    }
  };

  const handleFindOptimalLambda = () => {
    if (data.length < 10) {
      toast({
        title: language === 'ar' ? 'بيانات غير كافية' : 'Insufficient Data',
        description: language === 'ar' ? 'يرجى تحميل مجموعة بيانات تحتوي على 10 صفوف على الأقل للتحقق من صحة النموذج.' : 'Please load a dataset with at least 10 rows for validation.',
        variant: 'error'
      });
      return;
    }
    
    addLog('Starting 5-fold cross-validation to find the optimal Ridge Lambda/Alpha...');
    const alphas = [0.0001, 0.001, 0.01, 0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 20.0, 50.0, 100.0, 500.0, 1000.0];
    const numFolds = 5;
    
    const shuffled = [...data].sort(() => Math.random() - 0.5);
    const folds: DataPoint[][] = Array.from({ length: numFolds }, () => []);
    shuffled.forEach((point, idx) => {
      folds[idx % numFolds].push(point);
    });
    
    let bestAlpha = 1.0;
    let lowestMse = Infinity;
    const alphaMses: Record<number, number> = {};
    
    alphas.forEach(aCandidate => {
      let totalMse = 0;
      
      for (let foldIdx = 0; foldIdx < numFolds; foldIdx++) {
        const trainPoints = folds.filter((_, idx) => idx !== foldIdx).flat();
        const valPoints = folds[foldIdx];
        
        if (trainPoints.length === 0 || valPoints.length === 0) continue;
        
        const trainX = trainPoints.map(p => degree > 1 ? createPolynomialFeatures(p.features, degree, includeInteractions) : p.features);
        const trainY = trainPoints.map(p => p.y);
        
        const valX = valPoints.map(p => degree > 1 ? createPolynomialFeatures(p.features, degree, includeInteractions) : p.features);
        const valY = valPoints.map(p => p.y);
        
        try {
          const ridgeAns = calculateRidgeRegression(trainX, trainY, aCandidate);
          
          let foldSumSqError = 0;
          valX.forEach((rowX, rowIdx) => {
            const pred = ridgeAns.predict(rowX);
            const error = valY[rowIdx] - pred;
            foldSumSqError += error * error;
          });
          totalMse += foldSumSqError / valPoints.length;
        } catch (err) {
          totalMse += Infinity;
        }
      }
      
      const avgMse = totalMse / numFolds;
      alphaMses[aCandidate] = avgMse;
      if (avgMse < lowestMse) {
        lowestMse = avgMse;
        bestAlpha = aCandidate;
      }
    });
    
    setAlpha(bestAlpha);
    addLog(`Cross-validation complete. Best Lambda/Alpha: ${bestAlpha} (Lowest Validation MSE: ${lowestMse.toFixed(4)})`);
    toast({
      title: language === 'ar' ? 'تم العثور على أفضل معامل منظم' : 'Optimal Lambda Found',
      description: language === 'ar' ? `المعامل الأمثل: α = ${bestAlpha} (خطأ التحقق: ${lowestMse.toFixed(2)})` : `Optimal Alpha found: α = ${bestAlpha} (CV MSE: ${lowestMse.toFixed(2)})`,
      variant: 'success'
    });
  };

  const handleExportModelPdf = async () => {
    if (!result) {
      toast({
        title: language === 'ar' ? 'لا يوجد نموذج نشط' : 'No Active Model',
        description: language === 'ar' ? 'يرجى تدريب النموذج أولاً قبل التصدير.' : 'Please train the model first before exporting.',
        variant: 'error'
      });
      return;
    }

    setIsExportingModelPdf(true);
    toast({
      title: language === 'ar' ? 'جاري تجهيز تقرير النموذج...' : 'Generating Model PDF Report...',
      description: language === 'ar' ? 'يتم تحويل المقاييس والإعدادات النهائية إلى وثيقة PDF.' : 'Compiling final hyperparameters and metrics into PDF.',
      variant: 'info'
    });

    try {
      await exportSelectedModelToPdf({
        modelType: result.type,
        modelLabel: result.type === 'Linear' 
          ? (language === 'ar' ? 'انحدار خطي (Linear Regression)' : 'Linear Regression')
          : result.type === 'Polynomial'
          ? (language === 'ar' ? `كثير الحدود (Polynomial Degree ${result.degree})` : `Polynomial Regression (Degree ${result.degree})`)
          : (language === 'ar' ? `انحدار الحافة (Ridge α=${result.alpha})` : `Ridge Regularization (α=${result.alpha})`),
        targetName: yAxisCol || 'Target (Y)',
        featureNames: xAxisCols,
        totalSamples: data.length,
        trainSamples: result.splitInfo?.trainCount,
        testSamples: result.splitInfo?.testCount,
        hyperparameters: {
          degree: result.degree || degree,
          alpha: result.alpha || alpha,
          includeInteractions: includeInteractions,
          trainSplitRatio: enableTrainTestSplit ? trainSplitRatio : undefined,
          splitSeed: enableTrainTestSplit ? splitSeed : undefined,
          kFolds: enableCrossValidation ? cvFolds : undefined
        },
metrics: {
           r2: result.metrics.r2,
           adjustedR2: result.metrics.adjustedR2,
           rmse: result.metrics.rmse,
           mse: result.metrics.mse,
           mae: result.metrics.mae,
           n: result.metrics.n,
           p: result.metrics.p,
           aic: result.metrics.aic,
           bic: result.metrics.bic,
           accuracyGrade: result.metrics.accuracyGrade
         },
        splitMetrics: result.splitInfo ? {
          enabled: result.splitInfo.enabled,
          trainR2: result.splitInfo.trainMetrics.r2,
          testR2: result.splitInfo.testMetrics.r2,
          trainRmse: result.splitInfo.trainMetrics.rmse,
          testRmse: result.splitInfo.testMetrics.rmse,
          generalizationGap: result.splitInfo.generalizationGap,
          errorInflation: result.splitInfo.rmseInflationRatio,
          diagnosis: language === 'ar' ? result.splitInfo.verdictLabelAr : result.splitInfo.verdictLabelEn
        } : undefined,
        cvMetrics: result.cvInfo ? {
          enabled: true,
          meanTestR2: result.cvInfo.meanTestR2,
          stdTestR2: result.cvInfo.stdTestR2,
          meanTestRmse: result.cvInfo.meanTestRmse,
          overallOofR2: result.cvInfo.overallOofR2,
          kFolds: result.cvInfo.kFolds,
          isCvPredicting: useCvPredictions
        } : undefined,
        equation: result.equation,
        coefficients: result.coefficientDetails || [],
        featureImportance: featureImportanceItems.map(item => ({
          name: item.name,
          percentage: item.percentage,
          beta: item.beta || 0,
          direction: item.direction || 'positive'
        })),
        language: language
      });

      toast({
        title: language === 'ar' ? 'تم تنزيل تقرير النموذج بنجاح' : 'Model PDF Downloaded',
        description: language === 'ar' ? 'تم حفظ التقرير الشامل للإعدادات والمعاملات النهائية بصيغة PDF.' : 'Full model specifications report saved as PDF successfully.',
        variant: 'success'
      });
    } catch (err) {
      console.error('Model PDF export error:', err);
      toast({
        title: language === 'ar' ? 'تعذر تصدير PDF' : 'PDF Export Failed',
        description: language === 'ar' ? 'حدث خطأ أثناء إنشاء ملف PDF.' : 'An error occurred during PDF generation.',
        variant: 'error'
      });
    } finally {
      setIsExportingModelPdf(false);
    }
  };

  const downloadModelReport = () => {
    handleExportModelPdf();
  };

  const regressionModelsComparison = useMemo(() => {
    if (data.length < 3 || xAxisCols.length === 0 || !yAxisCol || selectedType === 'kmeans') return null;
    
    const validatedData = data;
    const Y = validatedData.map(p => p.y);
    
    // 1. Linear Model
    let r2Linear = 0, adjR2Linear = 0, rmseLinear = 0;
    try {
      const X = validatedData.map(p => p.features);
      const reg = new MultivariateLinearRegression(X, Y.map(yVal => [yVal]), { intercept: true });
      const predicted = validatedData.map(p => reg.predict(p.features)[0]);
      const metrics = calculateRegressionMetrics(Y, predicted, xAxisCols.length);
      r2Linear = metrics.r2;
      adjR2Linear = metrics.adjustedR2;
      rmseLinear = metrics.rmse;
    } catch (e) {
      console.warn("Linear comparison model failed:", e);
    }

    // 2. Polynomial Model
    let r2Poly = 0, adjR2Poly = 0, rmsePoly = 0;
    try {
      const X = validatedData.map(p => createPolynomialFeatures(p.features, degree, includeInteractions));
      const featureNames = getPolynomialFeatureNames(xAxisCols, degree, includeInteractions);
      let predictFn: (features: number[]) => number;
      if (degree > 5) {
        const ridgeAns = calculateRidgeRegression(X, Y, 1e-6);
        predictFn = (features: number[]) => ridgeAns.predict(createPolynomialFeatures(features, degree, includeInteractions));
      } else {
        const reg = new MultivariateLinearRegression(X, Y.map(yVal => [yVal]), { intercept: true });
        predictFn = (features: number[]) => reg.predict(createPolynomialFeatures(features, degree, includeInteractions))[0];
      }
      const predicted = validatedData.map(p => predictFn(p.features));
      const metrics = calculateRegressionMetrics(Y, predicted, featureNames.length);
      r2Poly = metrics.r2;
      adjR2Poly = metrics.adjustedR2;
      rmsePoly = metrics.rmse;
    } catch (e) {
      console.warn("Polynomial comparison model failed:", e);
    }

    // 3. Ridge Model
    let r2Ridge = 0, adjR2Ridge = 0, rmseRidge = 0;
    try {
      const X = validatedData.map(p => degree > 1 ? createPolynomialFeatures(p.features, degree, includeInteractions) : p.features);
      const featureNames = degree > 1 ? getPolynomialFeatureNames(xAxisCols, degree, includeInteractions) : xAxisCols;
      const ridgeAns = calculateRidgeRegression(X, Y, alpha);
      const predictFn = (features: number[]) => {
        const xFeats = degree > 1 ? createPolynomialFeatures(features, degree, includeInteractions) : features;
        return ridgeAns.predict(xFeats);
      };
      const predicted = validatedData.map(p => predictFn(p.features));
      const metrics = calculateRegressionMetrics(Y, predicted, featureNames.length);
      r2Ridge = metrics.r2;
      adjR2Ridge = metrics.adjustedR2;
      rmseRidge = metrics.rmse;
    } catch (e) {
      console.warn("Ridge comparison model failed:", e);
    }

    return [
      { name: language === 'ar' ? 'الانحدار الخطي (Linear)' : 'Linear Regression', r2: r2Linear, adjR2: adjR2Linear, rmse: rmseLinear, active: selectedType === 'linear' },
      { name: language === 'ar' ? `الانحدار متعدد الحدود (Poly d=${degree})` : `Polynomial (d=${degree})`, r2: r2Poly, adjR2: adjR2Poly, rmse: rmsePoly, active: selectedType === 'polynomial' },
      { name: language === 'ar' ? `انحدار الحافة (Ridge α=${alpha})` : `Ridge (α=${alpha})`, r2: r2Ridge, adjR2: adjR2Ridge, rmse: rmseRidge, active: selectedType === 'ridge' }
    ];
  }, [data, xAxisCols, yAxisCol, degree, includeInteractions, alpha, selectedType, language]);

  // Detailed comparison data for table and residual plots
  const comparisonRows = useMemo(() => {
    if (!result || (selectedType !== 'linear' && selectedType !== 'polynomial' && selectedType !== 'ridge')) return [];
    
    // Index map for Cross-Validation Out-Of-Fold predictions
    const oofMap = new Map<number, { predicted: number; fold: number; error: number }>();
    if (result.cvInfo?.outOfFoldPredictions) {
      result.cvInfo.outOfFoldPredictions.forEach(p => {
        oofMap.set(p.index, { predicted: p.predicted, fold: p.fold, error: p.error });
      });
    }

    const isUsingCvPreds = Boolean(result.cvInfo && (useCvPredictions || result.isCvPredicting));

    return data.map((d, idx) => {
      const standardPred = result.predict(d.features);
      const oofEntry = oofMap.get(d.index);
      const effectivePred = (isUsingCvPreds && oofEntry) ? oofEntry.predicted : standardPred;
      const residual = d.y - effectivePred;
      const absErrorPercent = d.y !== 0 ? Math.abs((residual / d.y) * 100) : 0;
      const isTest = splitIndices ? splitIndices.test.includes(idx) : false;
      const isTrain = splitIndices ? splitIndices.train.includes(idx) : true;

      return {
        index: d.index,
        x: d.x,
        z: d.z,
        features: d.features,
        actual: d.y,
        predicted: effectivePred,
        standardPredicted: standardPred,
        isCvPrediction: Boolean(isUsingCvPreds && oofEntry),
        cvFold: oofEntry?.fold,
        residual,
        absErrorPercent,
        isTest,
        isTrain
      };
    });
  }, [data, result, selectedType, splitIndices, useCvPredictions]);

  // Cross-Validation & Learning Curve Calculator
  const learningCurvePoints = useMemo(() => {
    if (!result || data.length < 5 || selectedType === 'kmeans') return [];
    
    // Split into training (80%) and validation (20%) sets
    const shuffled = [...data];
    // Simple deterministic shuffling based on indexes so it doesn't jump randomly on every re-render
    shuffled.sort((a, b) => ((a.index * 13) % 100) - ((b.index * 13) % 100));
    
    const trainCount = Math.floor(shuffled.length * 0.8);
    const trainSet = shuffled.slice(0, trainCount);
    const valSet = shuffled.slice(trainCount);
    
    if (trainSet.length < 3 || valSet.length < 1) return [];
    
    const pointsCount = 5;
    const resultsList = [];
    
    for (let step = 1; step <= pointsCount; step++) {
      const fraction = step / pointsCount;
      const currentTrainCount = Math.max(3, Math.floor(trainSet.length * fraction));
      const currentTrainSet = trainSet.slice(0, currentTrainCount);
      
      if (currentTrainSet.length < 2) continue;
      
      let trainRMSE = 0;
      let valRMSE = 0;
      
      try {
        const isPoly = selectedType === 'polynomial';
        const deg = degree || 1;
        const incInter = includeInteractions;
        
        const X_train = currentTrainSet.map(p => isPoly ? createPolynomialFeatures(p.features, deg, incInter) : p.features);
        const Y_train = currentTrainSet.map(p => p.y);
        
        const X_val = valSet.map(p => isPoly ? createPolynomialFeatures(p.features, deg, incInter) : p.features);
        
        let predictFn: (feats: number[]) => number;
        
        if (selectedType === 'ridge') {
          const ridgeAns = calculateRidgeRegression(X_train, Y_train, alpha);
          predictFn = (feats) => {
            const polyFeats = isPoly ? createPolynomialFeatures(feats, deg, incInter) : feats;
            return ridgeAns.predict(polyFeats);
          };
        } else if (selectedType === 'polynomial') {
          if (deg > 5) {
            const ridgeAns = calculateRidgeRegression(X_train, Y_train, 1e-6);
            predictFn = (feats) => ridgeAns.predict(createPolynomialFeatures(feats, deg, incInter));
          } else {
            const reg = new MultivariateLinearRegression(X_train, Y_train.map(yVal => [yVal]), { intercept: true });
            predictFn = (feats) => reg.predict(createPolynomialFeatures(feats, deg, incInter))[0];
          }
        } else {
          // Linear
          const reg = new MultivariateLinearRegression(X_train, Y_train.map(yVal => [yVal]), { intercept: true });
          predictFn = (feats) => reg.predict(feats)[0];
        }
        
        // Calculate train RMSE
        const trainPreds = currentTrainSet.map(p => predictFn(p.features));
        const trainActuals = currentTrainSet.map(p => p.y);
        const trainMSE = trainPreds.reduce((acc, p, i) => acc + Math.pow(p - trainActuals[i], 2), 0) / trainPreds.length;
        trainRMSE = Math.sqrt(trainMSE);
        
        // Calculate validation RMSE
        const valPreds = valSet.map(p => predictFn(p.features));
        const valActuals = valSet.map(p => p.y);
        const valMSE = valPreds.reduce((acc, p, i) => acc + Math.pow(p - valActuals[i], 2), 0) / valPreds.length;
        valRMSE = Math.sqrt(valMSE);
        
      } catch (err) {
        console.error("Error in learning curve fitting:", err);
        continue;
      }
      
      resultsList.push({
        size: currentTrainSet.length,
        trainRMSE,
        valRMSE
      });
    }
    
    return resultsList;
  }, [result, data, selectedType, degree, includeInteractions, alpha]);

  // Standardized Feature Importance Items for Recharts Component & PDF Export
  const featureImportanceItems = useMemo<FeatureImportanceItem[]>(() => {
    if (!result || selectedType === 'kmeans' || data.length === 0) return [];
    
    const targetVals = data.map(d => d.y);
    const sdY = getStdDev(targetVals);

    const coeffDetails = result.coefficientDetails || [];
    if (coeffDetails.length > 0) {
      const computed = coeffDetails.map((det, idx) => {
        let sdX = 1.0;
        if (idx < result.featureNames.length) {
          const featVals = data.map(d => d.features[idx] ?? d.x);
          sdX = getStdDev(featVals);
        }
        const beta = sdY > 0 && sdX > 0 ? (det.coefficient * sdX) / sdY : det.coefficient;
        const absBeta = Math.abs(beta);
        return {
          name: det.name,
          beta: beta,
          absBeta: absBeta,
          rawCoefficient: det.coefficient,
          direction: (det.coefficient >= 0 ? 'positive' : 'negative') as 'positive' | 'negative',
          power: det.power,
          fallbackPercent: det.importancePercent
        };
      });

      const totalAbsBeta = computed.reduce((sum, item) => sum + item.absBeta, 0);

      return computed.map(item => ({
        name: item.name,
        percentage: totalAbsBeta > 0 
          ? (item.absBeta / totalAbsBeta) * 100 
          : (item.fallbackPercent || (100 / computed.length)),
        rawCoefficient: item.rawCoefficient,
        beta: item.beta,
        direction: item.direction,
        power: item.power
      })).sort((a, b) => b.percentage - a.percentage);
    }

    if (result.featureNames && result.coefficients) {
      const computed = result.featureNames.map((name, idx) => {
        const coef = result.coefficients[idx] ?? 0;
        const featVals = data.map(d => d.features[idx] ?? d.x);
        const sdX = getStdDev(featVals);
        const beta = sdY > 0 && sdX > 0 ? (coef * sdX) / sdY : coef;
        return {
          name,
          beta,
          absBeta: Math.abs(beta),
          rawCoefficient: coef,
          direction: (coef >= 0 ? 'positive' : 'negative') as 'positive' | 'negative'
        };
      });
      const totalAbsBeta = computed.reduce((sum, item) => sum + item.absBeta, 0);
      return computed.map(item => ({
        name: item.name,
        percentage: totalAbsBeta > 0 ? (item.absBeta / totalAbsBeta) * 100 : 100 / computed.length,
        rawCoefficient: item.rawCoefficient,
        beta: item.beta,
        direction: item.direction
      })).sort((a, b) => b.percentage - a.percentage);
    }

    return [];
  }, [result, data, selectedType]);

  // Dynamic plot builder
  const plotData = useMemo(() => {
    if (selectedType === 'kmeans') {
      return [{
        x: dataWithClusters.map(d => d.x),
        y: dataWithClusters.map(d => d.y),
        z: dimension === '3d' ? dataWithClusters.map(d => d.z || 0) : undefined,
        mode: 'markers',
        type: dimension === '3d' ? 'scatter3d' : 'scatter',
        marker: { color: dataWithClusters.map(d => d.cluster ?? 0), colorscale: 'Viridis', size: 8 },
        name: 'Clusters'
      }];
    }

    const baseData = {
      x: data.map(d => d.x),
      y: data.map(d => d.y),
      mode: 'markers' as const,
      type: 'scatter' as const,
      name: language === 'ar' ? 'نقاط البيانات الفعلية (Real Data)' : 'Real Data Points',
      marker: { size: 8, color: '#2563eb', opacity: 0.8 }
    };

    const predictSavedModel = (model: any, features: number[]): number => {
      if (model.coefficients && model.intercept !== undefined) {
        const isPoly = model.type?.toLowerCase() === 'polynomial';
        if (isPoly) {
          const deg = model.degree || 1;
          const incInter = model.includeInteractions !== false;
          const polyFeatures = deg > 1 ? createPolynomialFeatures(features, deg, incInter) : features;
          return model.intercept + polyFeatures.reduce((sum: number, val: number, i: number) => sum + val * (model.coefficients?.[i] || 0), 0);
        } else {
          return model.intercept + features.reduce((sum: number, val: number, i: number) => sum + val * (model.coefficients?.[i] || 0), 0);
        }
      }
      
      if (!data || data.length === 0) return 0;
      
      try {
        const isPoly = model.type?.toLowerCase() === 'polynomial';
        const deg = model.degree || 1;
        const includeInter = model.includeInteractions !== false;
        
        if (isPoly) {
          const polyX = data.map(p => createPolynomialFeatures(p.features, deg, includeInter));
          const polyY = data.map(p => p.y);
          if (deg > 5) {
            const ridgeAns = calculateRidgeRegression(polyX, polyY, 1e-6);
            return ridgeAns.predict(createPolynomialFeatures(features, deg, includeInter));
          } else {
            const reg = new MultivariateLinearRegression(polyX, polyY.map(yVal => [yVal]), { intercept: true });
            return reg.predict(createPolynomialFeatures(features, deg, includeInter))[0];
          }
        } else {
          const polyX = data.map(p => p.features);
          const polyY = data.map(p => p.y);
          if (model.type?.toLowerCase() === 'ridge') {
            const ridgeAns = calculateRidgeRegression(polyX, polyY, model.alpha || 1.0);
            return ridgeAns.predict(features);
          } else {
            const reg = new MultivariateLinearRegression(polyX, polyY.map(yVal => [yVal]), { intercept: true });
            return reg.predict(features)[0];
          }
        }
      } catch (err) {
        console.error("Error in fallback predictSavedModel:", err);
        return 0;
      }
    };

    if (activeVizTab === 'comparator') {
      const modelA = savedModels.find(m => m.id === selectedCompModelAId);
      const modelB = savedModels.find(m => m.id === selectedCompModelBId);
      
      const sortedData = [...data].sort((a, b) => a.x - b.x);
      
      const traces: any[] = [baseData];
      
      let curveAX: number[] = [];
      let curveAY: number[] = [];
      let curveBX: number[] = [];
      let curveBY: number[] = [];
      
      const steps = 160;
      
      if (modelA) {
        if (xAxisCols.length === 1 && sortedData.length >= 2) {
          const minX = sortedData[0].x;
          const maxX = sortedData[sortedData.length - 1].x;
          const stepSize = (maxX - minX) / steps;
          for (let i = 0; i <= steps; i++) {
            const val = minX + i * stepSize;
            curveAX.push(val);
            curveAY.push(predictSavedModel(modelA, [val]));
          }
        } else {
          curveAX = sortedData.map(d => d.x);
          curveAY = sortedData.map(d => predictSavedModel(modelA, d.features));
        }
        
        traces.push({
          x: curveAX,
          y: curveAY,
          mode: xAxisCols.length === 1 ? 'lines' : 'markers+lines',
          type: 'scatter',
          name: `${modelA.name} (${language === 'ar' ? 'النموذج أ' : 'Model A'})`,
          line: { color: '#0f62fe', width: 3.5 }
        });
      }
      
      if (modelB) {
        if (xAxisCols.length === 1 && sortedData.length >= 2) {
          const minX = sortedData[0].x;
          const maxX = sortedData[sortedData.length - 1].x;
          const stepSize = (maxX - minX) / steps;
          for (let i = 0; i <= steps; i++) {
            const val = minX + i * stepSize;
            curveBX.push(val);
            curveBY.push(predictSavedModel(modelB, [val]));
          }
        } else {
          curveBX = sortedData.map(d => d.x);
          curveBY = sortedData.map(d => predictSavedModel(modelB, d.features));
        }
        
        traces.push({
          x: curveBX,
          y: curveBY,
          mode: xAxisCols.length === 1 ? 'lines' : 'markers+lines',
          type: 'scatter',
          name: `${modelB.name} (${language === 'ar' ? 'النموذج ب' : 'Model B'})`,
          line: { color: '#8a3ffc', width: 3.5 }
        });
      }
      
      // True function curve
      if (showTrueFunction && trueFunctionFormula) {
        let trueFunctionX: number[] = [];
        let trueFunctionY: number[] = [];
        if (xAxisCols.length === 1 && sortedData.length >= 2) {
          const minX = sortedData[0].x;
          const maxX = sortedData[sortedData.length - 1].x;
          const stepSize = (maxX - minX) / steps;
          for (let i = 0; i <= steps; i++) {
            const val = minX + i * stepSize;
            trueFunctionX.push(val);
            trueFunctionY.push(evaluateTrueFunction(trueFunctionFormula, val, [val]));
          }
        } else {
          trueFunctionX = sortedData.map(d => d.x);
          trueFunctionY = sortedData.map(d => evaluateTrueFunction(trueFunctionFormula, d.x, d.features));
        }
        
        traces.push({
          x: trueFunctionX,
          y: trueFunctionY,
          mode: 'lines',
          type: 'scatter',
          name: language === 'ar' ? 'الدالة الحقيقية (المعيار)' : 'True Function (Ground Truth)',
          line: { color: '#198038', dash: 'dash', width: 2.5 }
        });
      }
      
      return traces;
    }

    // 3D Surface / Mesh Plot for 2 Input Features + 1 Target
    if (activeVizTab === '3dSurface' && result && xAxisCols.length >= 2) {
      const xVals = data.map(d => d.features[0]);
      const zVals = data.map(d => d.features[1]); // second feature
      const yVals = data.map(d => d.y); // Target
      
      const minX = Math.min(...xVals);
      const maxX = Math.max(...xVals);
      const minZ = Math.min(...zVals);
      const maxZ = Math.max(...zVals);

      const gridSteps = 20;
      const gridX: number[] = [];
      const gridZ: number[] = [];
      const surfaceY: number[][] = [];

      for (let i = 0; i <= gridSteps; i++) {
        gridX.push(minX + (i / gridSteps) * (maxX - minX));
        gridZ.push(minZ + (i / gridSteps) * (maxZ - minZ));
      }

      for (let i = 0; i <= gridSteps; i++) {
        const rowY: number[] = [];
        for (let j = 0; j <= gridSteps; j++) {
          const featVector = [gridX[i], gridZ[j]];
          // if there are more features, pad with average values
          if (xAxisCols.length > 2) {
            for (let f = 2; f < xAxisCols.length; f++) {
              const avgF = data.reduce((acc, d) => acc + d.features[f], 0) / data.length;
              featVector.push(avgF);
            }
          }
          rowY.push(result.predict(featVector));
        }
        surfaceY.push(rowY);
      }

      const traces3d: any[] = [
        {
          x: xVals,
          y: zVals,
          z: yVals,
          mode: 'markers',
          type: 'scatter3d',
          name: language === 'ar' ? 'البيانات الفعلية (Real Points)' : 'Real Points',
          marker: { size: 5, color: '#2563eb', opacity: 0.9 }
        },
        {
          x: gridX,
          y: gridZ,
          z: surfaceY,
          type: 'surface',
          name: language === 'ar' ? 'سطح النموذج المنسجم (Fitted Surface)' : 'Fitted Surface',
          colorscale: 'Portland',
          opacity: 0.75,
          showscale: false
        }
      ];

      if (showTrueFunction && trueFunctionFormula) {
        const trueSurfaceY: number[][] = [];
        for (let i = 0; i <= gridSteps; i++) {
          const rowY: number[] = [];
          for (let j = 0; j <= gridSteps; j++) {
            const featVector = [gridX[i], gridZ[j]];
            rowY.push(evaluateTrueFunction(trueFunctionFormula, gridX[i], featVector));
          }
          trueSurfaceY.push(rowY);
        }
        if (trueSurfaceY.some(row => row.some(v => !isNaN(v)))) {
          traces3d.push({
            x: gridX,
            y: gridZ,
            z: trueSurfaceY,
            type: 'surface',
            name: language === 'ar' ? 'سطح الدالة الحقيقية (True Surface)' : 'True Surface',
            colorscale: 'Viridis',
            opacity: 0.45,
            showscale: false
          });
        }
      }

      return traces3d;
    }

    if (activeVizTab === 'actualVsPredicted' && result) {
      const actuals = comparisonRows.map(r => r.actual);
      const preds = comparisonRows.map(r => r.predicted);
      const minVal = Math.min(...actuals, ...preds);
      const maxVal = Math.max(...actuals, ...preds);

      return [
        {
          x: actuals,
          y: preds,
          mode: 'markers',
          type: 'scatter',
          name: 'Data Points (Actual vs Pred)',
          marker: {
            size: 8,
            color: '#3b82f6',
            opacity: 0.8,
            line: { color: '#1d4ed8', width: 1 }
          },
          text: comparisonRows.map(r => `Actual: ${r.actual.toFixed(2)}, Pred: ${r.predicted.toFixed(2)}, Residual: ${r.residual.toFixed(2)}`),
          hoverinfo: 'text'
        },
        {
          x: [minVal, maxVal],
          y: [minVal, maxVal],
          mode: 'lines',
          type: 'scatter',
          name: 'Perfect Match Line (y = x)',
          line: { color: '#10b981', dash: 'dash', width: 2 }
        }
      ];
    }

    if (activeVizTab === 'residuals' && result) {
      return [
        {
          x: comparisonRows.map(r => r.actual),
          y: comparisonRows.map(r => r.residual),
          mode: 'markers',
          type: 'scatter',
          name: 'Residuals (Actual - Pred)',
          marker: {
            size: 8,
            color: comparisonRows.map(r => r.residual >= 0 ? '#3b82f6' : '#ef4444'),
            opacity: 0.85
          },
          text: comparisonRows.map(r => `Actual: ${r.actual.toFixed(2)}, Error: ${r.residual.toFixed(2)}`),
          hoverinfo: 'text'
        },
        {
          x: [Math.min(...comparisonRows.map(r => r.actual)), Math.max(...comparisonRows.map(r => r.actual))],
          y: [0, 0],
          mode: 'lines',
          type: 'scatter',
          name: 'Zero Error Baseline',
          line: { color: '#6b7280', dash: 'dot', width: 2 }
        }
      ];
    }

    if (activeVizTab === 'importance' && result) {
      const targetVals = data.map(d => d.y);
      const sdY = getStdDev(targetVals);
      
      const importances = result.featureNames.map((feat, idx) => {
        const featVals = data.map(d => d.features[idx] ?? d.x);
        const sdX = getStdDev(featVals);
        const coef = result.coefficients[idx] ?? 0;
        const beta = sdY > 0 ? Math.abs(coef * sdX / sdY) : 0;
        return { name: feat, val: beta };
      });
      
      const totalBeta = importances.reduce((sum, item) => sum + item.val, 0);
      const importanceData = importances.map(item => ({
        name: item.name,
        percentage: totalBeta > 0 ? (item.val / totalBeta) * 100 : 100 / importances.length
      })).sort((a, b) => a.percentage - b.percentage);
      
      return [{
        y: importanceData.map(item => item.name),
        x: importanceData.map(item => item.percentage),
        type: 'bar',
        orientation: 'h',
        marker: {
          color: '#3b82f6',
          opacity: 0.85,
          line: { color: '#1d4ed8', width: 1.5 }
        },
        name: language === 'ar' ? 'الأهمية النسبية %' : 'Relative Importance %'
      }];
    }

    if (activeVizTab === 'learningCurve' && result && learningCurvePoints.length > 0) {
      return [
        {
          x: learningCurvePoints.map(p => p.size),
          y: learningCurvePoints.map(p => p.trainRMSE),
          mode: 'lines+markers',
          type: 'scatter',
          name: language === 'ar' ? 'خطأ التدريب (Train RMSE)' : 'Train RMSE',
          line: { color: '#2563eb', width: 3 },
          marker: { size: 6 }
        },
        {
          x: learningCurvePoints.map(p => p.size),
          y: learningCurvePoints.map(p => p.valRMSE),
          mode: 'lines+markers',
          type: 'scatter',
          name: language === 'ar' ? 'خطأ التحقق المتقاطع (CV Val RMSE)' : 'CV Val RMSE',
          line: { color: '#ea580c', width: 3 },
          marker: { size: 6 }
        }
      ];
    }
    
    // Default: Fit Curve View
    if ((selectedType === 'linear' || selectedType === 'polynomial' || selectedType === 'ridge') && result) {
      const sortedData = [...data].sort((a, b) => a.x - b.x);
      
      let curveX: number[] = [];
      let curveY: number[] = [];
      let trueY: number[] = [];

      if (xAxisCols.length === 1 && sortedData.length >= 2) {
        const minX = sortedData[0].x;
        const maxX = sortedData[sortedData.length - 1].x;
        const steps = 160;
        const stepSize = (maxX - minX) / steps;
        for (let i = 0; i <= steps; i++) {
          const val = minX + i * stepSize;
          curveX.push(val);
          curveY.push(result.predict([val]));
          if (showTrueFunction && trueFunctionFormula) {
            trueY.push(evaluateTrueFunction(trueFunctionFormula, val, [val]));
          }
        }
      } else {
        // Multi-feature: plot prediction against primary X feature
        curveX = sortedData.map(d => d.x);
        curveY = sortedData.map(d => result.predict(d.features));
        if (showTrueFunction && trueFunctionFormula) {
          trueY = sortedData.map(d => evaluateTrueFunction(trueFunctionFormula, d.x, d.features));
        }
      }

      let dataTraces: any[] = [];
      if (result.splitInfo?.enabled && splitIndices) {
        const trainPoints = data.filter((_, idx) => splitIndices.train.includes(idx));
        const testPoints = data.filter((_, idx) => splitIndices.test.includes(idx));

        dataTraces.push({
          x: trainPoints.map(d => d.x),
          y: trainPoints.map(d => d.y),
          mode: 'markers' as const,
          type: 'scatter' as const,
          name: language === 'ar' ? `بيانات التدريب داخل العينة (${trainPoints.length})` : `Train Set: In-Sample (${trainPoints.length})`,
          marker: { size: 8, color: '#2563eb', symbol: 'circle', opacity: 0.85 }
        });

        dataTraces.push({
          x: testPoints.map(d => d.x),
          y: testPoints.map(d => d.y),
          mode: 'markers' as const,
          type: 'scatter' as const,
          name: language === 'ar' ? `بيانات الاختبار خارج العينة (${testPoints.length})` : `Test Set: Out-of-Sample (${testPoints.length})`,
          marker: { size: 9, color: '#10b981', symbol: 'diamond', opacity: 0.95, line: { color: '#047857', width: 1.5 } }
        });
      } else {
        dataTraces.push(baseData);
      }

      const traces: any[] = [
        ...dataTraces,
        {
          x: curveX,
          y: curveY,
          mode: xAxisCols.length === 1 ? 'lines' : 'markers+lines',
          type: 'scatter',
          name: language === 'ar' ? `منحنى النموذج الحالي (${result.type} Deg ${result.degree || 1} Fit)` : `Active Model Fit (${result.type} d=${result.degree || 1})`,
          line: { color: '#dc2626', width: 3 }
        }
      ];

      // Add Comparison Mode curves for polynomial degrees
      if (isComparisonMode && (selectedType === 'polynomial' || selectedType === 'ridge')) {
        const degreesToCompare = [1, 2, 3, 5, 10, 20];
        const colors = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#6366f1'];
        
        degreesToCompare.forEach((dVal, colorIdx) => {
          // Skip if it is the currently active degree so we don't draw it twice
          if (dVal === result.degree) return;
          
          try {
            let predictFn: (features: number[]) => number;
            if (selectedType === 'polynomial') {
              const polyX = data.map(p => createPolynomialFeatures(p.features, dVal, includeInteractions));
              const polyY = data.map(p => p.y);
              if (dVal > 5) {
                const ridgeAns = calculateRidgeRegression(polyX, polyY, 1e-6);
                predictFn = (features: number[]) => ridgeAns.predict(createPolynomialFeatures(features, dVal, includeInteractions));
              } else {
                const reg = new MultivariateLinearRegression(polyX, polyY.map(yVal => [yVal]), { intercept: true });
                predictFn = (features: number[]) => reg.predict(createPolynomialFeatures(features, dVal, includeInteractions))[0];
              }
            } else {
              // Ridge
              const polyX = data.map(p => dVal > 1 ? createPolynomialFeatures(p.features, dVal, includeInteractions) : p.features);
              const polyY = data.map(p => p.y);
              const ridgeAns = calculateRidgeRegression(polyX, polyY, alpha);
              predictFn = (features: number[]) => ridgeAns.predict(dVal > 1 ? createPolynomialFeatures(features, dVal, includeInteractions) : features);
            }
            
            // Predict on grid
            if (xAxisCols.length === 1 && sortedData.length >= 2) {
              const minX = sortedData[0].x;
              const maxX = sortedData[sortedData.length - 1].x;
              const steps = 100;
              const stepSize = (maxX - minX) / steps;
              const compCurveX: number[] = [];
              const compCurveY: number[] = [];
              for (let i = 0; i <= steps; i++) {
                const val = minX + i * stepSize;
                compCurveX.push(val);
                compCurveY.push(predictFn([val]));
              }
              
              traces.push({
                x: compCurveX,
                y: compCurveY,
                mode: 'lines',
                type: 'scatter',
                name: language === 'ar' ? `درجة ${dVal} (Degree ${dVal})` : `Degree ${dVal} Fit`,
                line: { color: colors[colorIdx % colors.length], width: 1.5, dash: 'dot' }
              });
            }
          } catch (err) {
            console.warn(`Comparison fitting failed for degree ${dVal}`, err);
          }
        });
      }

      if (showTrueFunction && trueFunctionFormula && trueY.length > 0 && trueY.some(v => !isNaN(v))) {
        traces.push({
          x: curveX,
          y: trueY,
          mode: 'lines',
          type: 'scatter',
          name: language === 'ar' ? `الدالة الحقيقية (${trueFunctionFormula})` : `True Function (${trueFunctionFormula})`,
          line: { color: '#10b981', dash: 'dash', width: 2.5 }
        });
      }

      return traces;
    }
    
    return [baseData];
  }, [data, dataWithClusters, selectedType, dimension, result, activeVizTab, comparisonRows, xAxisCols, showTrueFunction, trueFunctionFormula, language, isComparisonMode, degree, includeInteractions, alpha, selectedCompModelAId, selectedCompModelBId, savedModels]);

  const plotLayout = useMemo(() => {
    let titleText = language === 'ar' ? 'مخطط النتائج والتحليل' : 'Analysis Result';
    let xAxisTitle = xAxisCols[0] || (language === 'ar' ? 'المتغيرات المستقلة X' : 'X (Features)');
    let yAxisTitle = yAxisCol || (language === 'ar' ? 'المتغير التابع Y' : 'Y (Target)');

    const textColor = isDark ? '#f4f4f4' : '#161616';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
    const axisColor = isDark ? '#a8a8a8' : '#525252';

    if (activeVizTab === '3dSurface') {
      titleText = language === 'ar' 
        ? `مجسم ثلاثي الأبعاد للنموذج المتعدد (${xAxisCols[0]} vs ${xAxisCols[1]} -> ${yAxisCol})`
        : `3D Surface Response (${xAxisCols[0]} vs ${xAxisCols[1]} -> ${yAxisCol})`;
      return {
        title: { text: titleText, font: { size: 13, color: textColor } },
        scene: {
          xaxis: { title: xAxisCols[0] || 'X1', gridcolor: gridColor, color: axisColor },
          yaxis: { title: xAxisCols[1] || 'X2', gridcolor: gridColor, color: axisColor },
          zaxis: { title: yAxisCol || 'Target Y', gridcolor: gridColor, color: axisColor }
        },
        autosize: true,
        margin: { l: 20, r: 20, t: 35, b: 20 },
        paper_bgcolor: 'transparent'
      };
    }

    if (activeVizTab === 'actualVsPredicted') {
      titleText = language === 'ar' ? 'القيم الحقيقية مقابل المتوقعة (Actual vs. Predicted)' : 'Actual vs. Predicted Values';
      xAxisTitle = `Actual Values (${yAxisCol || 'y'})`;
      yAxisTitle = `Predicted Values (\\hat{y})`;
    } else if (activeVizTab === 'residuals') {
      titleText = language === 'ar' ? 'مخطط البواقي والأخطاء (Residuals vs. Actual)' : 'Residuals & Error Distribution';
      xAxisTitle = `Actual Values (${yAxisCol || 'y'})`;
      yAxisTitle = 'Residuals (Error = Actual - Pred)';
    } else if (activeVizTab === 'importance') {
      titleText = language === 'ar' ? 'تحليل الأهمية النسبية للمتغيرات (Standardized Feature Importance)' : 'Standardized Feature Importance Analysis';
      xAxisTitle = language === 'ar' ? 'الأهمية النسبية المؤثرة %' : 'Relative Contribution %';
      yAxisTitle = language === 'ar' ? 'المتغير المستقل' : 'Feature';
    } else if (activeVizTab === 'learningCurve') {
      titleText = language === 'ar' ? 'منحنى التعلم لتقييم كفاءة النموذج (Learning Curve: Bias vs. Variance Analysis)' : 'Model Learning Curve (Bias vs. Variance)';
      xAxisTitle = language === 'ar' ? 'حجم عينة التدريب (Training Size)' : 'Training Sample Size';
      yAxisTitle = language === 'ar' ? 'جذر متوسط مربع الخطأ (RMSE)' : 'Root Mean Squared Error (RMSE)';
    } else if (activeVizTab === 'fit' && result) {
      titleText = language === 'ar' ? `منحنى التوافق (${result.type} Regression Fit)` : `${result.type} Regression Fit Curve`;
    }

    return {
      title: { text: titleText, font: { size: 13, color: textColor } },
      xaxis: { title: xAxisTitle, zeroline: false, gridcolor: gridColor, tickfont: { color: axisColor }, titlefont: { color: axisColor } },
      yaxis: { title: yAxisTitle, zeroline: false, gridcolor: gridColor, tickfont: { color: axisColor }, titlefont: { color: axisColor } },
      autosize: true,
      margin: { l: 60, r: 30, t: 40, b: 50 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      legend: { orientation: 'h', y: -0.2, font: { color: axisColor } }
    };
  }, [activeVizTab, result, xAxisCols, yAxisCol, isDark, language]);

  const handleCopyEquation = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportCSV = () => {
    const csv = Papa.unparse(comparisonRows.length > 0 ? comparisonRows : data);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'multivariate_modeling_results.csv';
    a.click();
  };

  const sendToAssistant = () => {
    if (!result) {
      addChatMessage(activeChatSession.id, {
        id: `msg-${Date.now()}`,
        sender: 'assistant',
        content: 'لم يتم حساب نموذج بعد. يرجى اختيار البيانات ونوع النموذج ثم الضغط على Compute Model.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const analysis = selectedType === 'kmeans'
      ? `Performed K-Means Clustering with ${k} clusters on features: [${xAxisCols.join(', ')}].`
      : `Performed ${result.isMultivariate ? 'Multivariate' : 'Simple'} ${result.type} regression with features [${xAxisCols.join(', ')}]. Equation: ${result.equation}, R²: ${result.metrics.r2.toFixed(4)}, Adjusted R²: ${result.metrics.adjustedR2.toFixed(4)}, MSE: ${result.metrics.mse.toFixed(4)}, RMSE: ${result.metrics.rmse.toFixed(4)}, AIC: ${result.metrics.aic.toFixed(2)}.`;
    
    addChatMessage(activeChatSession.id, {
      id: `msg-${Date.now()}`,
      sender: 'user',
      content: `Analyze these multivariate modeling results and pipeline evaluation: ${analysis}`,
      timestamp: new Date().toISOString(),
    });
  };

  return (
    <div className="p-6 bg-[var(--cds-layer-01)] rounded-lg shadow-sm border border-[var(--cds-border-subtle)] space-y-6">
      {/* Top Header & View Modes Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--cds-border-subtle)] pb-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--cds-text-01)] flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            استوديو النمذجة الإحصائية والانحدار متعدد الحدود المتعدد (Multivariate Modeling & Pipeline)
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            الانحدار الخطي والمتعدد، الانحدار متعدد الحدود، قياس مصفوفة الارتباط (Correlation Matrix)، مسار هندسة الميزات (Pipeline) وتقييم النماذج.
          </p>
        </div>

        {/* Studio Main Mode Navigation */}
        <div className="flex items-center gap-1.5 bg-[var(--cds-layer-02)] p-1 rounded-xl border border-[var(--cds-border-subtle)]">
          <button
            onClick={() => setMainViewMode('studio')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${mainViewMode === 'studio' ? 'bg-[var(--cds-layer-01)] text-blue-600 shadow-sm' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'}`}
          >
            <Sliders className="w-4 h-4" />
            {language === 'ar' ? 'استوديو النمذجة' : 'Studio'}
          </button>
          <button
            onClick={() => setMainViewMode('correlation')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${mainViewMode === 'correlation' ? 'bg-[var(--cds-layer-01)] text-purple-600 shadow-sm' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'}`}
          >
            <Network className="w-4 h-4 text-purple-600" />
            {language === 'ar' ? 'مصفوفة الارتباط' : 'Correlation Matrix'}
          </button>
          <button
            onClick={() => setMainViewMode('preprocessing')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${mainViewMode === 'preprocessing' ? 'bg-[var(--cds-layer-01)] text-orange-600 shadow-sm' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'}`}
          >
            <Sliders className="w-4 h-4 text-orange-600" />
            {language === 'ar' ? 'المعالجة المسبقة' : 'Preprocessing'}
          </button>
          <button
            onClick={() => setMainViewMode('pipeline')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${mainViewMode === 'pipeline' ? 'bg-[var(--cds-layer-01)] text-emerald-600 shadow-sm' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'}`}
          >
            <GitBranch className="w-4 h-4 text-emerald-600" />
            {language === 'ar' ? 'مسار العمل المتكامل' : 'Pipeline'}
          </button>
          <button
            onClick={() => setMainViewMode('inference')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${mainViewMode === 'inference' ? 'bg-[var(--cds-layer-01)] text-amber-600 shadow-sm' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'}`}
          >
            <Zap className="w-4 h-4 text-amber-500" />
            {language === 'ar' ? 'التوقعات والحساسية' : 'Inference'}
          </button>
        </div>
      </div>
      
      {/* File Upload & Synthetic Datasets Bar (Data Pipeline Hub) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-[var(--cds-layer-02)]/30 p-5 rounded-2xl border border-[var(--cds-border-subtle)] shadow-sm">
        <div className="md:col-span-1 space-y-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-[var(--cds-text-03)] uppercase tracking-wider flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-blue-500" />
              <span>{language === 'ar' ? '1. تحميل مصدر البيانات (Data Source):' : '1. Upload Data Source:'}</span>
            </label>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <span className="text-[10px] text-[var(--cds-text-03)] font-semibold">{language === 'ar' ? 'عينات سريعة:' : 'Quick Demo:'}</span>
              <button
                type="button"
                onClick={() => loadDemoDataset('multivariate')}
                className="text-[10px] bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-300 font-bold px-2.5 py-1 rounded-lg border border-purple-500/20 transition-all cursor-pointer"
                title="تحميل عينة متعددة المتغيرات (Real Estate - 4 Features)"
              >
                {language === 'ar' ? 'عقار متعدد' : 'Real Estate'}
              </button>
              <button
                type="button"
                onClick={() => loadDemoDataset('poly')}
                className="text-[10px] bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-300 font-bold px-2.5 py-1 rounded-lg border border-blue-500/20 transition-all cursor-pointer"
                title="تحميل عينة متعدد حدود تجريبية (Polynomial Demo Data)"
              >
                {language === 'ar' ? 'متعدد حدود' : 'Polynomial'}
              </button>
              <button
                type="button"
                onClick={() => loadDemoDataset('linear')}
                className="text-[10px] bg-gray-500/10 hover:bg-gray-500/20 text-gray-600 dark:text-gray-300 font-bold px-2.5 py-1 rounded-lg border border-gray-500/20 transition-all cursor-pointer"
                title="تحميل عينة خطية تجريبية (Linear Demo Data)"
              >
                {language === 'ar' ? 'نموذج خطي' : 'Linear'}
              </button>
            </div>
          </div>
          <input 
            type="file" 
            accept=".csv, .xlsx, .xls" 
            onChange={handleFileUpload} 
            className="block w-full text-xs text-[var(--cds-text-02)] file:mr-3 file:py-1.5 file:px-3.5 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-700 border border-[var(--cds-border-subtle)] rounded-xl p-1.5 bg-[var(--cds-layer-01)] transition-colors" 
          />
        </div>

        {isParsed ? (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-[var(--cds-text-03)] uppercase tracking-wider">
                  {language === 'ar' ? `2. المتغيرات المستقلة (Features X): ${xAxisCols.length} محددة` : `2. Independent Features (X): ${xAxisCols.length} selected`}
                </label>
                {correlationAnalysis && (
                  <button
                    onClick={applyRecommendedFeatures}
                    className="text-[10px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 rounded-lg border border-emerald-500/30 flex items-center gap-1 font-bold transition-all cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3 text-emerald-500" />
                    <span>{language === 'ar' ? 'تحديد ذكي' : 'Smart Select'}</span>
                  </button>
                )}
              </div>
              <select 
                multiple
                value={xAxisCols} 
                onChange={(e) => {
                  setXAxisCols(Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value));
                }} 
                className="w-full p-2.5 h-20 border border-[var(--cds-border-subtle)] rounded-xl text-xs font-mono bg-[var(--cds-layer-01)] text-[var(--cds-text-01)] focus:ring-2 focus:ring-blue-500/40 outline-none transition-all"
              >
                {headers.map(h => <option key={h} value={h} className="p-1 rounded">{h}</option>)}
              </select>
            </div>

            <div className="space-y-2 flex flex-col justify-between">
              <div>
                <label className="text-xs font-bold text-[var(--cds-text-03)] uppercase tracking-wider block mb-2">
                  {language === 'ar' ? '3. المتغير التابع للنمذجة (Target Y):' : '3. Target Variable (Y):'}
                </label>
                <select 
                  value={yAxisCol} 
                  onChange={(e) => setYAxisCol(e.target.value)} 
                  className="w-full px-3 h-10 border border-[var(--cds-border-subtle)] rounded-xl text-xs font-mono bg-[var(--cds-layer-01)] text-[var(--cds-text-01)] focus:ring-2 focus:ring-blue-500/40 outline-none transition-all"
                >
                  {headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold mt-2">
                <CheckCircle2 className="w-4 h-4" /> 
                <span>
                  {data.length} {language === 'ar' ? 'عينة صالحة •' : 'valid rows •'} {xAxisCols.length > 1 ? (language === 'ar' ? 'متعدد المتغيرات (Multivariate)' : 'Multivariate Model') : (language === 'ar' ? 'أحادي المتغير (Univariate)' : 'Univariate Model')}
                </span>
              </div>
            </div>

            {/* Auto-Feature Engineering & Selection */}
            <div className="space-y-3 pt-3 border-t border-[var(--cds-border-subtle)]">
              <label className="text-xs font-bold text-[var(--cds-text-03)] uppercase tracking-wider block">
                {language === 'ar' ? '4. هندسة وتوليد الميزات (Feature Engineering):' : '4. Feature Engineering:'}
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-[10px] text-[var(--cds-text-03)] font-semibold block">{language === 'ar' ? 'المتغير' : 'Column'}</span>
                  <select
                    value={featEngCol}
                    onChange={(e) => setFeatEngCol(e.target.value)}
                    className="w-full px-2.5 h-8.5 border border-[var(--cds-border-subtle)] rounded-lg text-xs bg-[var(--cds-layer-01)] text-[var(--cds-text-01)] outline-none"
                  >
                    <option value="">-- {language === 'ar' ? 'اختر عموداً' : 'Select'} --</option>
                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-[var(--cds-text-03)] font-semibold block">{language === 'ar' ? 'التحويل الرياضي' : 'Transformation'}</span>
                  <select
                    value={featEngType}
                    onChange={(e) => setFeatEngType(e.target.value as any)}
                    className="w-full px-2.5 h-8.5 border border-[var(--cds-border-subtle)] rounded-lg text-xs bg-[var(--cds-layer-01)] text-[var(--cds-text-01)] outline-none"
                  >
                    <option value="square">{language === 'ar' ? 'تربيعي (x²)' : 'Square (x²)'}</option>
                    <option value="sqrt">{language === 'ar' ? 'جذر تربيعي (√x)' : 'Square Root (√x)'}</option>
                    <option value="log">{language === 'ar' ? 'لوغاريتم طبيعي (ln)' : 'Logarithm (ln)'}</option>
                    <option value="inverse">{language === 'ar' ? 'مقلوب (1/x)' : 'Inverse (1/x)'}</option>
                  </select>
                </div>
              </div>
              <button
                type="button"
                onClick={handleApplyFeatureEngineering}
                className="w-full h-8 text-xs bg-blue-600/10 hover:bg-blue-600/20 text-blue-600 dark:text-blue-400 font-bold rounded-lg border border-blue-500/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                <span>{language === 'ar' ? 'توليد ميزة جديدة' : 'Generate New Feature'}</span>
              </button>
            </div>
          </>
        ) : (
          <div className="md:col-span-2 flex items-center justify-center border border-dashed border-[var(--cds-border-subtle)] rounded-xl p-6 bg-[var(--cds-layer-01)]/50">
            <span className="text-xs font-semibold text-[var(--cds-text-03)]">
              {language === 'ar' ? 'يرجى تحميل ملف بيانات أو تحديد أحد العينات التجريبية أعلاه للبدء بالنمذجة.' : 'Please upload a dataset or select a quick demo above to start modeling.'}
            </span>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODE 1: STUDIO (Training & Fitting Controls) */}
      {/* ========================================================================= */}
      {mainViewMode === 'studio' && (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          <div className="xl:col-span-3 space-y-6">
            {/* Model Configurations Grid */}
            <div className="bg-[var(--cds-layer-01)] rounded-2xl border border-[var(--cds-border-subtle)] overflow-hidden shadow-md">
              {/* Step 1 & 2 Headers */}
              <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6 border-b border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)]/30">
                {/* Select Algorithm */}
                <div className="lg:col-span-4 space-y-2">
                  <label className="text-xs font-bold text-[var(--cds-text-03)] uppercase tracking-wider block">
                    {language === 'ar' ? '1. خوارزمية التعلم (Algorithm):' : '1. Learning Algorithm:'}
                  </label>
                  <select 
                    value={selectedType} 
                    onChange={(e) => {
                      setSelectedType(e.target.value as any);
                      setResult(null);
                      setKmeansClusters(null);
                    }} 
                    className="w-full h-10 px-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-xl text-xs font-semibold text-[var(--cds-text-01)] focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all"
                  >
                    <option value="linear">
                      {xAxisCols.length > 1 ? (language === 'ar' ? 'انحدار خطي متعدد (Multiple Linear)' : 'Multiple Linear Regression') : (language === 'ar' ? 'انحدار خطي بسيط (Simple Linear)' : 'Simple Linear Regression')}
                    </option>
                    <option value="polynomial">
                      {xAxisCols.length > 1 ? (language === 'ar' ? 'انحدار متعدد الحدود متعدد المتغيرات' : 'Multivariate Polynomial Regression') : (language === 'ar' ? 'انحدار متعدد الحدود' : 'Polynomial Regression')}
                    </option>
                    <option value="ridge">
                      {xAxisCols.length > 1 ? (language === 'ar' ? 'انحدار الحافة (Ridge L2 Regression)' : 'Multivariate Ridge Regression') : (language === 'ar' ? 'انحدار الحافة (Ridge L2 Regression)' : 'Ridge Regression')}
                    </option>
                    <option value="kmeans">{language === 'ar' ? 'عنقدة كMeans (K-Means Clustering)' : 'K-Means Clustering'}</option>
                  </select>
                </div>

                {/* Hyperparameters Configurations */}
                <div className="lg:col-span-8 flex flex-col justify-center">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <label className="text-xs font-bold text-[var(--cds-text-03)] uppercase tracking-wider block">
                      {language === 'ar' ? '2. المعاملات والضبط الفائق (Hyperparameters):' : '2. Hyperparameter Settings:'}
                    </label>
                    {selectedType !== 'kmeans' && (
                      <button
                        type="button"
                        onClick={() => setIsGridSearchOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-indigo-500/10 hover:from-indigo-500/20 hover:to-purple-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 transition-all active:scale-95 cursor-pointer shadow-2xs"
                        title={language === 'ar' ? 'البحث الشبكي الآلي لتحديد أفضل درجة ومعامل جزاء بدقة عبر التحقق المتقاطع' : 'Grid Search Hyperparameter Tuning via Cross-Validation'}
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
                        <span>{language === 'ar' ? 'البحث الشبكي (Grid Search CV)' : 'Grid Search CV'}</span>
                      </button>
                    )}
                  </div>
                  
                  {/* Polynomial or Ridge Configuration */}
                  {(selectedType === 'polynomial' || selectedType === 'ridge') && (
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 bg-[var(--cds-layer-01)] px-3 py-1.5 rounded-xl border border-[var(--cds-border-subtle)]">
                        <span className="text-xs font-semibold text-[var(--cds-text-02)]">{language === 'ar' ? 'الدرجة:' : 'Degree:'}</span>
                        <input 
                          type="number" 
                          value={degree} 
                          onChange={(e) => setDegree(Math.max(1, Math.min(20, Number(e.target.value))))} 
                          min={1} 
                          max={20} 
                          className="w-10 bg-transparent text-center text-xs font-bold font-mono text-blue-600 focus:outline-none" 
                        />
                      </div>

                      <div className="flex items-center gap-1 bg-[var(--cds-layer-02)] p-0.5 rounded-lg border border-[var(--cds-border-subtle)]">
                        {[1, 2, 3, 5, 10, 15, 20].map(dVal => (
                          <button
                            key={dVal}
                            type="button"
                            onClick={() => setDegree(dVal)}
                            className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition-all ${degree === dVal ? 'bg-blue-600 text-white shadow-xs' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'}`}
                          >
                            d={dVal}
                          </button>
                        ))}
                      </div>

                      {xAxisCols.length > 1 && (
                        <label className="flex items-center gap-2 bg-[var(--cds-layer-01)] hover:bg-[var(--cds-layer-02)] px-3.5 py-1.5 rounded-xl border border-[var(--cds-border-subtle)] cursor-pointer transition-colors">
                          <input 
                            type="checkbox" 
                            checked={includeInteractions} 
                            onChange={(e) => setIncludeInteractions(e.target.checked)}
                            className="rounded border-[var(--cds-border-subtle)] text-purple-600 focus:ring-purple-500 w-3.5 h-3.5"
                          />
                          <span className="text-xs font-semibold text-[var(--cds-text-02)]">{language === 'ar' ? 'حدود التفاعل المشترك' : 'Interactions (Xi·Xj)'}</span>
                        </label>
                      )}

                      <label className="flex items-center gap-2 bg-[var(--cds-layer-01)] hover:bg-[var(--cds-layer-02)] px-3.5 py-1.5 rounded-xl border border-[var(--cds-border-subtle)] cursor-pointer transition-colors">
                        <input 
                          type="checkbox" 
                          checked={isComparisonMode} 
                          onChange={(e) => setIsComparisonMode(e.target.checked)}
                          className="rounded border-[var(--cds-border-subtle)] text-rose-600 focus:ring-rose-500 w-3.5 h-3.5"
                        />
                        <span className="text-xs font-bold text-[var(--cds-text-02)] flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5 text-rose-500" />
                          {language === 'ar' ? 'مقارنة الدرجات' : 'Compare Degrees'}
                        </span>
                      </label>
                    </div>
                  )}

                  {/* Ridge Alpha Configuration */}
                  {selectedType === 'ridge' && (
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 bg-[var(--cds-layer-01)] px-3 py-1.5 rounded-xl border border-[var(--cds-border-subtle)]">
                        <span className="text-xs font-semibold text-[var(--cds-text-02)]">{language === 'ar' ? 'معامل الجزاء α:' : 'Alpha α:'}</span>
                        <input 
                          type="number" 
                          step="0.1"
                          value={alpha} 
                          onChange={(e) => setAlpha(Math.max(0.0001, Number(e.target.value)))} 
                          min={0.0001}
                          max={1000}
                          className="w-16 bg-transparent text-center text-xs font-bold font-mono text-amber-600 focus:outline-none" 
                        />
                      </div>

                      <div className="flex items-center gap-1 bg-[var(--cds-layer-02)] p-0.5 rounded-lg border border-[var(--cds-border-subtle)]">
                        {[0.01, 0.1, 1.0, 10.0, 100.0].map(aVals => (
                          <button
                            key={aVals}
                            type="button"
                            onClick={() => setAlpha(aVals)}
                            className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition-all ${alpha === aVals ? 'bg-amber-600 text-white shadow-xs' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'}`}
                          >
                            α={aVals}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={handleFindOptimalLambda}
                        className="flex items-center gap-1.5 bg-amber-500/10 hover:bg-amber-500/25 text-amber-700 dark:text-amber-400 font-bold px-3 py-1.5 rounded-xl border border-amber-500/30 text-xs transition-all active:scale-95 cursor-pointer"
                        title={language === 'ar' ? 'البحث التلقائي عن أفضل معامل جزاء (عبر التحقق المتقاطع 5-folds)' : 'Auto-tune best Ridge penalty using 5-fold Cross-Validation'}
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                        <span>{language === 'ar' ? 'البحث عن Lambda الأمثل' : 'Find Optimal Lambda (CV)'}</span>
                      </button>
                    </div>
                  )}

                  {/* K-Means Clustering Settings */}
                  {selectedType === 'kmeans' && (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2 bg-[var(--cds-layer-01)] px-3 py-1.5 rounded-xl border border-[var(--cds-border-subtle)]">
                        <span className="text-xs font-semibold text-[var(--cds-text-02)]">{language === 'ar' ? 'عدد العناقيد (k):' : 'Clusters (k):'}</span>
                        <input 
                          type="number" 
                          value={k} 
                          onChange={(e) => setK(Number(e.target.value))} 
                          min={2} 
                          max={10} 
                          className="w-12 bg-transparent text-center text-xs font-bold font-mono text-purple-600 focus:outline-none" 
                        />
                      </div>
                    </div>
                  )}

                  {/* Default / Simple Linear has no extra settings */}
                  {selectedType === 'linear' && (
                    <div className="text-xs text-[var(--cds-text-03)] font-semibold italic">
                      {language === 'ar' ? 'لا توجد معاملات فائقة إضافية لهذا النموذج (تقدير المربعات الصغرى الاعتيادية OLS).' : 'No extra hyperparameters are required for standard OLS model.'}
                    </div>
                  )}
                </div>
              </div>

              {/* Train / Test Data Split & Out-of-Sample Evaluation Settings */}
              {selectedType !== 'kmeans' && (
                <div className="p-4 bg-[var(--cds-layer-01)] border-t border-[var(--cds-border-subtle)] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[var(--cds-text-01)]">
                            {language === 'ar' ? 'تقسيم البيانات وتقييم النموذج (Train / Test Split):' : 'Data Splitting & Model Evaluation:'}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                            {enableTrainTestSplit ? `${trainSplitRatio}% ${language === 'ar' ? 'تدريب' : 'Train'} / ${100 - trainSplitRatio}% ${language === 'ar' ? 'اختبار' : 'Test'}` : (language === 'ar' ? 'معطّل (100% تدريب)' : 'Disabled')}
                          </span>
                          <InfoTooltip
                            title={language === 'ar' ? 'تقسيم البيانات (Train/Test Split)' : 'Data Splitting'}
                            content={
language === 'ar'
                              ? 'فصل البيانات إلى عينة Training/Test Split البيانات إلى'
                              : 'Partitions dataset into training samples to fit coefficients and an unseen testing subset to benchmark real-world generalization and overfitting.'
                        }
                        recommended={language === 'ar' ? '70% Training / 30% Test' : '70% Train / 30% Test'}
                          />
                        </div>
                        <p className="text-[11px] text-[var(--cds-text-03)]">
                          {language === 'ar'
                            ? 'فصل البيانات إلى عينة تدريب (داخل العينة لبناء النموذج) وعينة اختبار (خارج العينة لتقييم قوة التنبؤ بالواقع ورصد التوافق المفرط).'
                            : 'Split data into training (in-sample) and testing (out-of-sample) to evaluate real-world predictive power.'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={enableTrainTestSplit} 
                          onChange={(e) => setEnableTrainTestSplit(e.target.checked)} 
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                        <span className="ms-2 text-xs font-semibold text-[var(--cds-text-02)]">
                          {enableTrainTestSplit ? (language === 'ar' ? 'مُفعّل' : 'Active') : (language === 'ar' ? 'معطّل' : 'Disabled')}
                        </span>
                      </label>
                    </div>
                  </div>

                  {enableTrainTestSplit && (
                    <div className="space-y-3 pt-2 border-t border-[var(--cds-border-subtle)]/60">
                      {/* Ratio Slider and Presets */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                        <div className="md:col-span-7 space-y-1.5">
                          <div className="flex justify-between items-center text-xs">
                            <div className="flex items-center gap-1.5 font-semibold text-blue-600 dark:text-blue-400">
                              <span>{language === 'ar' ? `بيانات التدريب (داخل العينة): ${trainSplitRatio}%` : `Train Set (In-Sample): ${trainSplitRatio}%`}</span>
                              <InfoTooltip
                                title={language === 'ar' ? 'نسبة عينة التدريب' : 'Training Ratio'}
                                content={
                                  language === 'ar'
                                    ? 'النسبة المئوية المخصصة لتدريب النموذج وضبط الأوزان. نسبة 70% أو 80% تعتبر مثالية لمنح النموذج دقة مناسبة مع الاحتفاظ بعينة اختبار كافية للتأكد من عدم وجود فرط تخصيص.'
                                    : 'Percentage of data used to train the model. 70% or 80% offers optimal learning capacity while leaving sufficient holdout test data.'
                                }
recommended="70%"
                              />
                            </div>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              {language === 'ar' ? `بيانات الاختبار (خارج العينة): ${100 - trainSplitRatio}%` : `Test Set (Out-of-Sample): ${100 - trainSplitRatio}%`}
                            </span>
                          </div>
                          <input 
                            type="range" 
                            min={50} 
                            max={90} 
                            step={5} 
                            value={trainSplitRatio} 
                            onChange={(e) => setTrainSplitRatio(Number(e.target.value))} 
                            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                          />
                        </div>

                        <div className="md:col-span-5 flex flex-wrap items-center justify-end gap-1.5">
                          {[
                            { r: 70, label: '70% / 30% (الموصى به)', enLabel: '70/30 (Recommended)' },
                            { r: 80, label: '80% / 20%', enLabel: '80/20' },
                            { r: 75, label: '75% / 25%', enLabel: '75/25' },
                            { r: 60, label: '60% / 40%', enLabel: '60/40' }
                          ].map(preset => (
                            <button
                              key={preset.r}
                              type="button"
                              onClick={() => setTrainSplitRatio(preset.r)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${trainSplitRatio === preset.r ? 'bg-indigo-600 text-white shadow-xs' : 'bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] border border-[var(--cds-border-subtle)]'}`}
                            >
                              {language === 'ar' ? preset.label : preset.enLabel}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Visual Partition Bar */}
                      <div className="space-y-1">
                        <div className="w-full h-3 rounded-full overflow-hidden flex bg-gray-200 dark:bg-gray-800 border border-[var(--cds-border-subtle)]">
                          <div 
                            style={{ width: `${trainSplitRatio}%` }} 
                            className="bg-blue-600 h-full flex items-center justify-center text-[9px] text-white font-bold tracking-tight transition-all duration-300"
                            title={`Train Set: ${splitPreview.trainCount} samples`}
                          />
                          <div 
                            style={{ width: `${100 - trainSplitRatio}%` }} 
                            className="bg-emerald-500 h-full flex items-center justify-center text-[9px] text-white font-bold tracking-tight transition-all duration-300"
                            title={`Test Set: ${splitPreview.testCount} samples`}
                          />
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-[var(--cds-text-03)] font-mono">
                          <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                            <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
                            {language === 'ar' ? `مجموعة التدريب: ${splitPreview.trainCount} نقطة (${splitPreview.trainPct}%)` : `Training Set: ${splitPreview.trainCount} samples (${splitPreview.trainPct}%)`}
                          </span>
                          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                            {language === 'ar' ? `مجموعة الاختبار: ${splitPreview.testCount} نقطة (${splitPreview.testPct}%)` : `Testing Set: ${splitPreview.testCount} samples (${splitPreview.testPct}%)`}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* K-Fold Cross-Validation Section (المصادقة التبادلية في حال عدم وجود بيانات كافية) */}
                  <div className="pt-3 border-t border-[var(--cds-border-subtle)]/70 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-600 dark:text-teal-400">
                          <Network className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[var(--cds-text-01)]">
                              {language === 'ar' ? 'المصادقة التبادلية (K-Fold Cross-Validation):' : 'K-Fold Cross-Validation:'}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
                              {enableCrossValidation ? `${cvFolds} ${language === 'ar' ? 'طيات فرعية (Folds)' : 'Folds'}` : (language === 'ar' ? 'معطّلة' : 'Disabled')}
                            </span>
                            <InfoTooltip
                              title={language === 'ar' ? 'المصادقة التبادلية (Cross-Validation)' : 'K-Fold Cross-Validation'}
                              content={
                                language === 'ar'
                                  ? 'تعتبر المصادقة التبادلية ميزة حاسمة في حال عدم وجود بيانات كافية؛ حيث يتم تجزئة البيانات إلى K مجموعات وتدريب النموذج على K-1 مجموعة واختباره على المجموعة المتبقية بالتناوب حتى يتم اختبار جميع العينات بدون هدر.'
                                  : 'Crucial when sample size is small or scarce. Partitions data into K folds and iteratively rotates the holdout validation fold so every observation is tested fairly.'
                              }
                              recommended="5 Folds"
                            />
                          </div>
                          <p className="text-[11px] text-[var(--cds-text-03)]">
                            {language === 'ar'
                              ? 'في حال عدم وجود بيانات كافية، يمكن اللجوء إلى المصادقة التبادلية؛ حيث يتم تجزئة البيانات إلى عدة مجموعات فرعية للتدريب والاختبار عدة مرات لتقدير درجة التحقق التبادلي R² وتوليد تنبؤ موثوق بالمخرجات.'
                              : 'When dataset size is limited, Cross-Validation evaluates the model over K randomized test folds to measure robust R² without wasting valuable samples.'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={enableCrossValidation} 
                            onChange={(e) => setEnableCrossValidation(e.target.checked)} 
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600"></div>
                          <span className="ms-2 text-xs font-semibold text-[var(--cds-text-02)]">
                            {enableCrossValidation ? (language === 'ar' ? 'مُفعّلة' : 'Active') : (language === 'ar' ? 'معطّلة' : 'Disabled')}
                          </span>
                        </label>
                      </div>
                    </div>

                    {enableCrossValidation && (
                      <div className="p-3 bg-[var(--cds-layer-02)] rounded-xl border border-[var(--cds-border-subtle)] space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[var(--cds-text-01)]">
                              {language === 'ar' ? 'عدد طيات التحقق التبادلي (K Folds):' : 'Number of CV Folds (K):'}
                            </span>
                            <InfoTooltip
                              title={language === 'ar' ? 'اختيار عدد الطيات (K Folds)' : 'Number of Folds (K)'}
                              content={
                                language === 'ar'
                                  ? '5 طيات هو المعيار الذهبي لتحقيق توازن ممتاز بين التباين والانحياز الحسابي. 10 طيات تناسب مجموعات البيانات الصغيرة لتقليل الانحياز، بينما 3 طيات أسرع للبيانات الضخمة.'
                                  : '5 folds balances bias and variance. 10 folds reduces bias for smaller datasets, while 3 folds is fast for large sets.'
                              }
                              recommended="5 Folds"
                            />
                            <div className="inline-flex rounded-lg border border-[var(--cds-border-subtle)] p-0.5 bg-[var(--cds-layer-01)]">
                              {[3, 5, 10].map(folds => (
                                <button
                                  key={folds}
                                  type="button"
                                  onClick={() => setCvFolds(folds)}
                                  className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${cvFolds === folds ? 'bg-teal-600 text-white shadow-xs' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'}`}
                                >
                                  {folds} {language === 'ar' ? 'طيات' : 'Folds'}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="text-[11px] text-[var(--cds-text-03)] font-mono">
                            {language === 'ar' 
                              ? `تجزئة ${data.length} عينة إلى ${cvFolds} مجموعات فرعية (~${Math.max(1, Math.floor(data.length / cvFolds))} عينة اختبار في كل دورة)` 
                              : `Partitioning ${data.length} points into ${cvFolds} test folds (~${Math.max(1, Math.floor(data.length / cvFolds))} samples per fold)`}
                          </div>
                        </div>

                        {/* CV Predictions for Outputs */}
                        <div className="flex items-center justify-between pt-2 border-t border-[var(--cds-border-subtle)]/60 text-xs">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={useCvPredictions}
                              onChange={(e) => setUseCvPredictions(e.target.checked)}
                              className="rounded border-[var(--cds-border-subtle)] text-teal-600 focus:ring-teal-500 w-4 h-4 cursor-pointer"
                            />
                            <span className="text-[var(--cds-text-01)] font-semibold">
                              {language === 'ar'
                                ? 'استخدام نموذج المصادقة التبادلية لإنشاء تنبؤ بالمخرجات (Cross-Validation Out-of-Fold Predictions)'
                                : 'Use Cross-Validation Out-of-Fold predictions for output table and residual analysis'}
                            </span>
                            <InfoTooltip
                              title={language === 'ar' ? 'تنبؤات خارج العينة (Out-of-Fold)' : 'Out-of-Fold Predictions'}
                              content={
language === 'ar'
                                   ? 'توليد القيم المتوقعة Ŷ لكل عينة فقط عبر النماذج الفرعية التي لم تشاهدها في التدريب، مما يحقق تنبؤات واقعية غير متحيزة لجميع نقاط البيانات.'
                                   : 'Calculates predicted values Ŷ for each sample strictly from the sub-models that did not train on it, providing realistic, unbiased validation.'
                               }
                             />
                          </label>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-teal-500/10 text-teal-600 dark:text-teal-400">
                            {language === 'ar' ? 'تنبؤ غير متحيز لجميع العينات' : 'Unbiased All-Sample Predictions'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 3: Action Toolbar - Solid Row with Unified Height Buttons */}
              <div className="p-4 bg-[var(--cds-layer-02)] flex flex-wrap gap-3 items-center justify-between border-t border-[var(--cds-border-subtle)]">
                <div className="flex flex-wrap items-center gap-2.5">
                  <button 
                    onClick={calculateModel} 
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all text-white h-10 px-5 rounded-xl text-xs font-bold shadow-md shadow-blue-500/10 cursor-pointer"
                  >
                    <Zap className="w-4 h-4" />
                    <span>{language === 'ar' ? 'تدريب وحساب النموذج' : 'Compute Model'}</span>
                  </button>

                  {selectedType !== 'kmeans' && (
                    <button
                      type="button"
                      onClick={() => setIsGridSearchOpen(true)}
                      className="flex items-center gap-2 bg-[var(--cds-layer-01)] hover:bg-[var(--cds-layer-03)] text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 h-10 px-4 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-xs"
                      title={language === 'ar' ? 'فتح لوحة البحث الشبكي لضبط واختيار النموذج الأمثل عبر التحقق المتقاطع' : 'Open Grid Search CV Studio'}
                    >
                      <Sparkles className="w-4 h-4 text-indigo-500" />
                      <span>{language === 'ar' ? 'البحث الشبكي (Grid Search)' : 'Grid Search CV'}</span>
                    </button>
                  )}

                  {/* Hidden Input for Importing Config JSON */}
                  <input
                    type="file"
                    ref={configFileInputRef}
                    accept=".json"
                    onChange={handleImportConfiguration}
                    className="hidden"
                  />

                  {/* Save Configuration Button (حفظ التكوين) */}
                  <button
                    type="button"
                    onClick={handleSaveConfiguration}
                    className="flex items-center gap-2 bg-[var(--cds-layer-01)] hover:bg-[var(--cds-layer-03)] text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 h-10 px-4 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer shadow-xs"
                    title={language === 'ar' ? 'حفظ إعدادات تقسيم البيانات والـ Grid Search المختارة كملف JSON محلي' : 'Save current data split and Grid Search config as JSON'}
                  >
                    <FileJson className="w-4 h-4 text-emerald-500" />
                    <span>{language === 'ar' ? 'حفظ التكوين' : 'Save Config'}</span>
                  </button>

                  {/* Import Configuration Button (استيراد التكوين) */}
                  <button
                    type="button"
                    onClick={() => configFileInputRef.current?.click()}
                    className="flex items-center gap-2 bg-[var(--cds-layer-01)] hover:bg-[var(--cds-layer-03)] text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] border border-[var(--cds-border-subtle)] h-10 px-3.5 rounded-xl text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-xs"
                    title={language === 'ar' ? 'استيراد إعدادات النموذج والتقسيم من ملف JSON سابق' : 'Load config from JSON file'}
                  >
                    <Upload className="w-4 h-4 text-[var(--cds-text-03)]" />
                    <span>{language === 'ar' ? 'استيراد التكوين' : 'Load Config'}</span>
                  </button>

                  {result && selectedType !== 'kmeans' && result.splitInfo?.enabled && (
                    <button
                      onClick={retrainOnFullData}
                      title={language === 'ar' ? 'تدريب النموذج النهائي على كامل البيانات (100%) للاستخدام والتنبؤ مع بقاء تقييم الاختبار كمرجع' : 'Train the final model on 100% of all data for production readiness'}
                      className={`flex items-center gap-2 h-10 px-4 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer border ${
                        result.splitInfo.isRetrainedOnFullData
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 shadow-xs'
                          : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:opacity-95 shadow-md shadow-emerald-500/20'
                      }`}
                    >
                      <CheckCircle2 className={`w-4 h-4 ${result.splitInfo.isRetrainedOnFullData ? 'text-emerald-500' : 'text-white'}`} />
                      <span>
                        {result.splitInfo.isRetrainedOnFullData
                          ? (language === 'ar' ? '✓ تم التدريب النهائي على كامل البيانات (100%)' : '✓ Trained on 100% Full Data')
                          : (language === 'ar' ? 'إعادة التدريب النهائي على كامل البيانات (100%)' : 'Retrain Final Model on Full Data (100%)')}
                      </span>
                    </button>
                  )}

                  {result && selectedType !== 'kmeans' && (
                    <button
                      onClick={() => {
                        const modelName = `${result.type} ${result.isMultivariate ? 'Multi' : 'Uni'} (deg: ${result.degree || 1})`;
                        const simulatedTrainingTime = (result.isMultivariate ? 24 : 12) + (result.degree || 1) * 15 + Math.random() * 10;
                        const simulatedOverfitting = Math.max(0.1, Math.min(1, (1 - result.metrics.r2) * 2 + ((result.degree || 1) * 0.08)));
                        
                        setSavedModels([...savedModels, {
                          id: Date.now().toString(),
                          name: modelName,
                          type: result.type,
                          mse: result.metrics.mse,
                          r2: result.metrics.r2,
                          equation: result.equation,
                          features: [...xAxisCols],
                          target: yAxisCol,
                          trainingTime: simulatedTrainingTime,
                          overfittingIndex: simulatedOverfitting,
                          coefficients: [...result.coefficients],
                          intercept: result.intercept,
                          degree: result.degree || 1,
                          alpha: result.alpha || 0,
                          includeInteractions: !!result.includeInteractions,
                          metrics: { ...result.metrics }
                        }]);
                        addLog(`Saved Model: ${modelName}`);
                      }}
                      className="flex items-center gap-2 bg-[var(--cds-layer-01)] hover:bg-[var(--cds-layer-03)] text-[var(--cds-text-01)] h-10 px-4 rounded-xl text-xs font-semibold border border-[var(--cds-border-subtle)] transition-colors active:scale-95 cursor-pointer"
                    >
                      <Layers className="w-4 h-4 text-purple-500" />
                      <span>{language === 'ar' ? 'حفظ للمقارنة' : 'Save Model'}</span>
                    </button>
                  )}
                  
                  <button 
                    onClick={exportCSV} 
                    className="flex items-center gap-2 bg-[var(--cds-layer-01)] hover:bg-[var(--cds-layer-03)] text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] h-10 px-4 rounded-xl text-xs font-semibold border border-[var(--cds-border-subtle)] transition-colors active:scale-95 cursor-pointer"
                  >
                    <span>{language === 'ar' ? 'تصدير (CSV)' : 'Export CSV'}</span>
                  </button>
                </div>

                {result && (
                  <button 
                    onClick={handleExportModelPdf}
                    disabled={isExportingModelPdf}
                    className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 disabled:opacity-60 active:scale-95 text-white h-10 px-4 rounded-xl text-xs font-bold shadow-md shadow-emerald-500/10 border border-emerald-600/10 transition-all cursor-pointer"
                    title={language === 'ar' ? 'تصدير النموذج المختار وتنزيل تفاصيل الإعدادات النهائية (Hyperparameters) بصيغة PDF لسهولة التوثيق والمشاركة' : 'Export selected model hyperparameters and metrics as PDF'}
                  >
                    <FileDown className="w-4 h-4" />
                    <span>
                      {isExportingModelPdf
                        ? (language === 'ar' ? 'جاري إنشاء PDF...' : 'Generating PDF...')
                        : (language === 'ar' ? 'تصدير النموذج المختار (PDF)' : 'Export Selected Model (PDF)')}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* True Function Overlay Controls */}
            <div className="bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-xs text-emerald-800 dark:text-emerald-300 shrink-0">
                  <input 
                    type="checkbox"
                    checked={showTrueFunction}
                    onChange={(e) => setShowTrueFunction(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                  <span>{language === 'ar' ? 'إظهار الدالة الحقيقية الأصيلة (True Function):' : 'Show True Function overlay:'}</span>
                </label>
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400 font-bold shrink-0">f(x) =</span>
                  <input 
                    type="text"
                    value={trueFunctionFormula}
                    onChange={(e) => setTrueFunctionFormula(e.target.value)}
                    placeholder="e.g. 2.5 * x^2 - 4.2 * x + 15"
                    className="flex-1 h-9 px-3 bg-[var(--cds-layer-01)] border border-emerald-500/30 rounded-xl text-xs font-mono text-[var(--cds-text-01)] focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-[var(--cds-text-03)] font-semibold">{language === 'ar' ? 'نماذج جاهزة:' : 'Presets:'}</span>
                <button
                  type="button"
                  onClick={() => setTrueFunctionFormula('2.5 * x^2 - 4.2 * x + 15')}
                  className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-800 dark:text-emerald-300 rounded-lg font-mono text-[10px] font-bold border border-emerald-500/20 transition-all cursor-pointer"
                >
                  Poly Deg 2
                </button>
                <button
                  type="button"
                  onClick={() => setTrueFunctionFormula('0.5 * x^3 - 2 * x^2 + 3 * x + 5')}
                  className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-800 dark:text-emerald-300 rounded-lg font-mono text-[10px] font-bold border border-emerald-500/20 transition-all cursor-pointer"
                >
                  Cubic
                </button>
                <button
                  type="button"
                  onClick={() => setTrueFunctionFormula('10 * sin(x) + 2 * x')}
                  className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/25 text-emerald-800 dark:text-emerald-300 rounded-lg font-mono text-[10px] font-bold border border-emerald-500/20 transition-all cursor-pointer"
                >
                  Sin Wave
                </button>
              </div>
            </div>

          {statusMessage && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs rounded-lg flex items-center gap-2">
              <Info className="w-4 h-4 text-red-500 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Train/Test Split & Out-of-Sample Evaluation Scorecard */}
          {result && selectedType !== 'kmeans' && result.splitInfo?.enabled && (
            <div className="bg-[var(--cds-layer-01)] rounded-2xl border border-[var(--cds-border-subtle)] p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--cds-border-subtle)] pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-[var(--cds-text-01)]">
                        {language === 'ar' ? 'تقييم أداء وقوة تنبؤ النموذج (Train / Test Evaluation)' : 'Model Out-of-Sample Evaluation'}
                      </h3>
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${
                        result.splitInfo.verdict === 'excellent'
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                          : result.splitInfo.verdict === 'good'
                          ? 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30'
                          : result.splitInfo.verdict === 'overfitting'
                          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'
                          : 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30'
                      }`}>
                        {language === 'ar' ? result.splitInfo.verdictLabelAr : result.splitInfo.verdictLabelEn}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--cds-text-03)]">
                      {language === 'ar'
                        ? 'مقارنة دقيقة بين أداء النموذج على بيانات التدريب (داخل العينة 70%) وبيانات الاختبار غير المرئية (خارج العينة 30%).'
                        : 'Comparison between model performance on in-sample training data and unseen out-of-sample test data.'}
                    </p>
                  </div>
                </div>

                {/* Retrain Action Button */}
                <div>
                  {!result.splitInfo.isRetrainedOnFullData ? (
                    <button
                      onClick={retrainOnFullData}
                      className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 active:scale-95 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{language === 'ar' ? 'إعادة التدريب النهائي على كامل البيانات (100%)' : 'Retrain Final Model on Full Data (100%)'}</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-xl">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span>{language === 'ar' ? '✓ تم تدريب النموذج النهائي على 100% من البيانات' : 'Model Retrained on 100% Full Data'}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Metric Comparison Grid: Train vs Test */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Train Set (In-Sample) */}
                <div className="p-4 bg-blue-500/5 dark:bg-blue-950/20 border border-blue-500/20 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                      <span className="text-xs font-bold text-blue-700 dark:text-blue-300">
                        {language === 'ar' ? 'مجموعة التدريب (داخل العينة)' : 'Train Set (In-Sample)'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                      {result.splitInfo.trainRatio}% ({result.splitInfo.trainCount} {language === 'ar' ? 'عينة' : 'pts'})
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="p-2 bg-[var(--cds-layer-01)] rounded-lg border border-blue-500/10">
                      <div className="text-[10px] text-[var(--cds-text-03)] font-semibold">R² (Train)</div>
                      <div className="text-base font-mono font-bold text-blue-600 dark:text-blue-400">
                        {result.splitInfo.trainMetrics.r2.toFixed(4)}
                      </div>
                    </div>
                    <div className="p-2 bg-[var(--cds-layer-01)] rounded-lg border border-blue-500/10">
                      <div className="text-[10px] text-[var(--cds-text-03)] font-semibold">RMSE (Train)</div>
                      <div className="text-base font-mono font-bold text-blue-700 dark:text-blue-300">
                        {result.splitInfo.trainMetrics.rmse.toFixed(4)}
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] text-[var(--cds-text-03)]">
                    {language === 'ar' ? 'يقيس مدى ملاءمة وتطابق النموذج مع البيانات التي تم تدريبه عليها مباشرة.' : 'Measures how closely the model fits the samples it was directly trained on.'}
                  </div>
                </div>

                {/* Test Set (Out-of-Sample) */}
                <div className="p-4 bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/20 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                        {language === 'ar' ? 'مجموعة الاختبار (خارج العينة)' : 'Test Set (Out-of-Sample)'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      {result.splitInfo.testRatio}% ({result.splitInfo.testCount} {language === 'ar' ? 'عينة' : 'pts'})
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="p-2 bg-[var(--cds-layer-01)] rounded-lg border border-emerald-500/10">
                      <div className="text-[10px] text-[var(--cds-text-03)] font-semibold">R² (Test)</div>
                      <div className="text-base font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {result.splitInfo.testMetrics.r2.toFixed(4)}
                      </div>
                    </div>
                    <div className="p-2 bg-[var(--cds-layer-01)] rounded-lg border border-emerald-500/10">
                      <div className="text-[10px] text-[var(--cds-text-03)] font-semibold">RMSE (Test)</div>
                      <div className="text-base font-mono font-bold text-emerald-700 dark:text-emerald-300">
                        {result.splitInfo.testMetrics.rmse.toFixed(4)}
                      </div>
                    </div>
                  </div>
                  <div className="text-[11px] text-[var(--cds-text-03)]">
                    {language === 'ar' ? 'يقيس القدرة الحقيقية للنموذج على التنبؤ ببيانات جديدة في العالم الواقعي.' : 'Measures true real-world predictive ability on never-before-seen samples.'}
                  </div>
                </div>

                {/* Generalization Diagnosis */}
                <div className="p-4 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-xl space-y-3 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-[var(--cds-text-01)]">
                        {language === 'ar' ? 'مؤشرات التعميم والخطأ:' : 'Generalization Indicators:'}
                      </span>
                      <InfoTooltip
                        title={language === 'ar' ? 'فجوة التعميم ونسبة التضخم' : 'Generalization Indicators'}
                        content={
                          language === 'ar'
                            ? 'فجوة التعميم تقيس الفارق بين دقة التدريب ودقة الاختبار. إذا كانت فجوة R² أكبر من 0.15 أو تضخم خطأ RMSE أعلى من 1.35x، فإن النموذج يعاني من فرط تخصيص (Overfitting) ولن يتنبأ بدقة في الواقع.'
                            : 'Evaluates the performance drop from training to testing data. Gaps exceeding 0.15 R² or 1.35x RMSE inflation indicate severe overfitting.'
                        }
                         recommended={language === 'ar' ? 'فجوة < 0.10' : 'Gap < 0.10'}
                       />
                    </div>
                    <span className="text-[10px] text-[var(--cds-text-03)] font-mono">
                      Δ R²: {result.splitInfo.generalizationGap >= 0 ? `+${result.splitInfo.generalizationGap.toFixed(4)}` : result.splitInfo.generalizationGap.toFixed(4)}
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--cds-text-02)]">{language === 'ar' ? 'فجوة التعميم (Train - Test R²):' : 'Generalization Gap:'}</span>
                      <span className={`font-mono font-bold ${result.splitInfo.generalizationGap > 0.12 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {result.splitInfo.generalizationGap.toFixed(4)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--cds-text-02)]">{language === 'ar' ? 'نسبة تضخم الخطأ (Test/Train RMSE):' : 'Error Inflation Ratio:'}</span>
                      <span className={`font-mono font-bold ${result.splitInfo.rmseInflationRatio > 1.35 ? 'text-rose-600' : 'text-blue-600'}`}>
                        {result.splitInfo.rmseInflationRatio.toFixed(2)}x
                      </span>
                    </div>
                  </div>
                  <div className="p-2 bg-[var(--cds-layer-01)] rounded-lg text-[11px] border border-[var(--cds-border-subtle)] text-[var(--cds-text-02)]">
                    {result.splitInfo.verdict === 'overfitting' && (
                      <span className="text-amber-700 dark:text-amber-300 font-semibold">
                        {language === 'ar' ? '⚠️ تنبيه: النموذج يتطابق بشكل زائد مع بيانات التدريب ويفقد الدقة على بيانات الاختبار. يُنصح بخفض الدرجة أو استخدام انحدار الحافة (Ridge).' : 'Warning: Potential overfitting detected. Consider regularizing or lowering degree.'}
                      </span>
                    )}
                    {result.splitInfo.verdict === 'underfitting' && (
                      <span className="text-rose-700 dark:text-rose-300 font-semibold">
                        {language === 'ar' ? '⚠️ تنبيه: النموذج بسيط للغاية ولا يستوعب العلاقات الأساسية. جرّب إضافة متغيرات أو رفع درجة كثير الحدود.' : 'Warning: Underfitting. Model may need more features or polynomial terms.'}
                      </span>
                    )}
                    {(result.splitInfo.verdict === 'excellent' || result.splitInfo.verdict === 'good') && (
                      <span className="text-emerald-700 dark:text-emerald-300 font-semibold">
                        {language === 'ar' ? '✓ النموذج يتمتع بقدرة تعميم ممتازة؛ أداء الاختبار متقارب جداً مع التدريب مما يؤكد موثوقية التنبؤ.' : 'Model shows excellent generalization across both in-sample and out-of-sample data.'}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Production Readiness Status Callout */}
              <div className="p-3 bg-[var(--cds-layer-02)] rounded-xl border border-[var(--cds-border-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-indigo-500 shrink-0" />
                  <span className="text-[var(--cds-text-02)]">
                    {result.splitInfo.isRetrainedOnFullData
                      ? (language === 'ar'
                          ? `✓ تم تدريب النموذج النهائي على كامل البيانات (100% - ${result.metrics.n} عينة). المعادلة والبارامترات الحالية محسوبة بأعلى دقة لجميع البيانات وجاهزة للإنتاج مع توثيق نتائج الاختبار.`
                          : `Final model has been retrained on all ${result.metrics.n} samples. Ready for production.`)
                      : (language === 'ar'
                          ? 'النموذج الحالي مُدرّب على عينة التدريب (70%) لأغراض تقييم الأداء. اضغط "إعادة التدريب النهائي على كامل البيانات (100%)" لتدريب النموذج النهائي على كل البيانات للتنبؤ في العالم الحقيقي.'
                          : 'Current model parameters fit the 70% train split. Click Retrain to use 100% of samples for final deployment.')}
                  </span>
                </div>
                {!result.splitInfo.isRetrainedOnFullData && (
                  <button
                    onClick={retrainOnFullData}
                    className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    {language === 'ar' ? 'إعادة التدريب الآن ←' : 'Retrain Now →'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* K-Fold Cross-Validation Scorecard (درجة التحقق التبادلي وتنبؤ بالمخرجات) */}
          {result && selectedType !== 'kmeans' && result.cvInfo && (
            <div className="bg-[var(--cds-layer-01)] border border-teal-500/30 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--cds-border-subtle)] pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/15 flex items-center justify-center text-teal-600 dark:text-teal-400">
                    <Network className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-[var(--cds-text-01)]">
                        {language === 'ar' ? 'درجة التحقق التبادلي (K-Fold Cross-Validation Score)' : 'K-Fold Cross-Validation Scorecard'}
                      </h3>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/25">
                        {result.cvInfo.kFolds}-Fold CV
                      </span>
                      {result.isCvPredicting && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25">
                          {language === 'ar' ? 'تنبؤ المخرجات: OOF نشط' : 'Output: OOF Active'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--cds-text-03)]">
                      {language === 'ar'
                        ? 'في حال عدم وجود بيانات كافية، يوفر التحقق التبادلي تقديراً دقيقاً وغير متحيز لمدى قوة النموذج في التنبؤ ببيانات جديدة دون تسريب بيانات التدريب.'
                        : 'Evaluates model generalization across subsets of data, providing reliable R² estimates and unbiased out-of-fold predictions.'}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[11px] font-semibold text-[var(--cds-text-03)]">
                    {language === 'ar' ? 'درجة الدقة الإجمالية' : 'Overall Assessment'}
                  </div>
                  <div className="text-sm font-bold text-teal-600 dark:text-teal-400">
                    R² = {result.cvInfo.meanTestR2.toFixed(4)}
                  </div>
                </div>
              </div>

              {/* CV Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* Mean Test R2 */}
                <div className="p-3.5 bg-teal-500/5 dark:bg-teal-950/20 rounded-xl border border-teal-500/20">
                  <div className="text-[11px] font-semibold text-teal-700 dark:text-teal-300">
                    {language === 'ar' ? 'متوسط درجة التحقق التبادلي (CV R²)' : 'Mean CV R² Score'}
                  </div>
                  <div className="text-2xl font-mono font-black text-teal-600 dark:text-teal-400 mt-1">
                    {result.cvInfo.meanTestR2.toFixed(4)}
                  </div>
                  <div className="text-[10px] text-[var(--cds-text-03)] mt-0.5">
                    ± {result.cvInfo.stdTestR2.toFixed(4)} ({language === 'ar' ? 'الانحراف المعياري' : 'Std Dev'})
                  </div>
                </div>

                {/* Overall OOF R2 */}
                <div className="p-3.5 bg-indigo-500/5 dark:bg-indigo-950/20 rounded-xl border border-indigo-500/20">
                  <div className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                    {language === 'ar' ? 'دقة التنبؤ خارج العينة (OOF R²)' : 'Out-of-Fold R² Score'}
                  </div>
                  <div className="text-2xl font-mono font-black text-indigo-600 dark:text-indigo-400 mt-1">
                    {result.cvInfo.overallOofR2.toFixed(4)}
                  </div>
                  <div className="text-[10px] text-[var(--cds-text-03)] mt-0.5">
                    {language === 'ar' ? 'محسوب على كامل العينات عبر الطيات' : 'Across all out-of-fold test samples'}
                  </div>
                </div>

                {/* Mean Test RMSE */}
                <div className="p-3.5 bg-[var(--cds-layer-02)] rounded-xl border border-[var(--cds-border-subtle)]">
                  <div className="text-[11px] font-semibold text-[var(--cds-text-02)]">
                    {language === 'ar' ? 'متوسط خطأ الاختبار (CV RMSE)' : 'Mean CV Test RMSE'}
                  </div>
                  <div className="text-2xl font-mono font-black text-[var(--cds-text-01)] mt-1">
                    {result.cvInfo.meanTestRmse.toFixed(4)}
                  </div>
                  <div className="text-[10px] text-[var(--cds-text-03)] mt-0.5">
                    ± {result.cvInfo.stdTestRmse.toFixed(4)}
                  </div>
                </div>

                {/* Stability / Diagnosis */}
                <div className="p-3.5 bg-[var(--cds-layer-02)] rounded-xl border border-[var(--cds-border-subtle)] flex flex-col justify-between">
                  <div className="text-[11px] font-semibold text-[var(--cds-text-02)]">
                    {language === 'ar' ? 'استقرار النموذج عبر الطيات' : 'Model Fold Stability'}
                  </div>
                  <div className="mt-1">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-lg inline-block ${
                      result.cvInfo.stdTestR2 <= 0.08
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                        : result.cvInfo.stdTestR2 <= 0.18
                        ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30'
                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                    }`}>
                      {result.cvInfo.stdTestR2 <= 0.08
                        ? (language === 'ar' ? 'استقرار عالي جداً ✓' : 'Highly Stable ✓')
                        : result.cvInfo.stdTestR2 <= 0.18
                        ? (language === 'ar' ? 'استقرار معتدل' : 'Moderate Variance')
                        : (language === 'ar' ? 'تباين مرتفع بين الطيات ⚠️' : 'High Fold Variance ⚠️')}
                    </span>
                  </div>
                  <div className="text-[10px] text-[var(--cds-text-03)] mt-1">
                    {language === 'ar' ? 'يوضح مدى حساسية التنبؤ عند اختلاف عينات التدريب' : 'Measures prediction sensitivity to training subsets'}
                  </div>
                </div>
              </div>

              {/* Fold Breakdown Mini Table */}
              <div className="overflow-x-auto pt-1">
                <div className="text-xs font-bold text-[var(--cds-text-02)] mb-1.5 flex items-center justify-between">
                  <span>{language === 'ar' ? 'تفاصيل نتائج الطيات المنفردة (Folds Breakdown):' : 'Individual Folds Performance:'}</span>
                  <span className="text-[10px] text-[var(--cds-text-03)]">
                    {language === 'ar' ? `إجمالي ${result.cvInfo.kFolds} طيات مصادقة` : `Total ${result.cvInfo.kFolds} folds evaluated`}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10 gap-2">
                  {result.cvInfo.foldMetrics.map((f) => (
                    <div key={f.fold} className="p-2 bg-[var(--cds-layer-02)] rounded-lg border border-[var(--cds-border-subtle)] text-center text-xs">
                      <div className="font-bold text-[var(--cds-text-03)] text-[10px]">
                        {language === 'ar' ? `طية #${f.fold}` : `Fold #${f.fold}`}
                      </div>
                      <div className="font-mono font-bold text-teal-600 dark:text-teal-400 mt-0.5 text-xs">
                        R² {f.testR2.toFixed(3)}
                      </div>
                      <div className="text-[9px] font-mono text-[var(--cds-text-03)]">
                        RMSE {f.testRmse.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Model Statistics Panel & Resulting Equation Card */}
          {result && selectedType !== 'kmeans' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Statistical Evaluation Panel */}
              <div className="lg:col-span-4 bg-[var(--cds-layer-01)] p-4 rounded-xl border border-[var(--cds-border-subtle)] shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-[var(--cds-border-subtle)] pb-2">
                  <h3 className="text-sm font-bold text-[var(--cds-text-01)] flex items-center gap-1.5">
                    <Activity className="w-4 h-4 text-blue-500" />
                    {language === 'ar' ? 'لوحة التقييم الإحصائي' : 'Model Evaluation Metrics'}
                  </h3>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30">
                    {result.metrics.accuracyGrade}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* R-Squared */}
                  <div className="p-3 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg">
                    <div className="text-[11px] text-[var(--cds-text-02)] font-medium">{language === 'ar' ? 'معامل التحديد (R² Score)' : 'R² Score'}</div>
                    <div className="text-xl font-mono font-bold text-blue-600 dark:text-blue-400 mt-1">
                      {result.metrics.r2.toFixed(4)}
                    </div>
                    <div className="text-[10px] text-[var(--cds-text-03)] mt-0.5">
                      {(result.metrics.r2 * 100).toFixed(2)}% {language === 'ar' ? 'دقة التفسير' : 'Variance Explained'}
                    </div>
                  </div>

                  {/* Adjusted R-Squared */}
                  <div className="p-3 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg">
                    <div className="text-[11px] text-[var(--cds-text-02)] font-medium">{language === 'ar' ? 'المعدل (Adjusted R²)' : 'Adjusted R²'}</div>
                    <div className="text-xl font-mono font-bold text-indigo-600 dark:text-indigo-400 mt-1">
                      {result.metrics.adjustedR2.toFixed(4)}
                    </div>
                    <div className="text-[10px] text-[var(--cds-text-03)] mt-0.5">{language === 'ar' ? `معدل بالميزات (${result.metrics.p})` : `Adjusted for ${result.metrics.p} vars`}</div>
                  </div>

                  {/* MSE */}
                  <div className="p-3 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg">
                    <div className="text-[11px] text-[var(--cds-text-02)] font-medium">{language === 'ar' ? 'متوسط الخطأ (MSE)' : 'Mean Squared Error'}</div>
                    <div className="text-xl font-mono font-bold text-purple-600 dark:text-purple-400 mt-1">
                      {result.metrics.mse.toFixed(4)}
                    </div>
                    <div className="text-[10px] text-[var(--cds-text-03)] mt-0.5">MSE Metric</div>
                  </div>

                  {/* RMSE */}
                  <div className="p-3 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-lg">
                    <div className="text-[11px] text-[var(--cds-text-02)] font-medium">{language === 'ar' ? 'جذر الخطأ (RMSE)' : 'Root MSE'}</div>
                    <div className="text-xl font-mono font-bold text-rose-600 dark:text-rose-400 mt-1">
                      {result.metrics.rmse.toFixed(4)}
                    </div>
                    <div className="text-[10px] text-[var(--cds-text-03)] mt-0.5">Std Error Scale</div>
                  </div>

                  {/* Ridge L2 Details if type is Ridge */}
                  {result.type === 'Ridge' && (
                    <div className="col-span-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center justify-between">
                      <div>
                        <div className="text-[11px] font-bold text-amber-800 dark:text-amber-300">
                          {language === 'ar' ? 'معامل منظم الحافة Ridge L2:' : 'Ridge L2 Regularization:'}
                        </div>
                        <div className="text-xs font-mono font-semibold text-amber-700 dark:text-amber-400 mt-0.5">
                          α = {result.alpha} | L2 Term = {result.l2Penalty?.toFixed(4) || '0.0000'}
                        </div>
                      </div>
                      <span className="text-[10px] font-bold bg-amber-500/20 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">
                        L2 Penalty
                      </span>
                    </div>
                  )}
                </div>

                {/* Additional metrics info */}
                <div className="pt-2 border-t border-[var(--cds-border-subtle)] grid grid-cols-4 text-center text-xs text-[var(--cds-text-02)]">
                  <div className="p-1">
                    <span className="text-[10px] text-[var(--cds-text-03)] block">MAE</span>
                    <span className="font-mono font-semibold text-[var(--cds-text-01)]">{result.metrics.mae.toFixed(3)}</span>
                  </div>
                  <div className="p-1 border-x border-[var(--cds-border-subtle)]">
                    <span className="text-[10px] text-[var(--cds-text-03)] block">AIC</span>
                    <span className="font-mono font-semibold text-[var(--cds-text-01)]">{result.metrics.aic.toFixed(1)}</span>
                  </div>
                  <div className="p-1 border-r border-[var(--cds-border-subtle)]">
                    <span className="text-[10px] text-[var(--cds-text-03)] block">{language === 'ar' ? 'العينات' : 'Samples (N)'}</span>
                    <span className="font-mono font-semibold text-[var(--cds-text-01)]">{result.metrics.n}</span>
                  </div>
                  <div className="p-1">
                    <span className="text-[10px] text-[var(--cds-text-03)] block">{language === 'ar' ? 'الميزات' : 'Features (p)'}</span>
                    <span className="font-mono font-semibold text-[var(--cds-text-01)]">{result.coefficientDetails.length}</span>
                  </div>
                </div>

                {/* Side-by-Side Model Comparison Table */}
                {regressionModelsComparison && (
                  <div className="pt-3 border-t border-[var(--cds-border-subtle)] space-y-2">
                    <h4 className="text-[11px] font-bold text-[var(--cds-text-02)] tracking-wider uppercase">
                      {language === 'ar' ? 'مقارنة أداء النماذج' : 'Models Performance Comparison'}
                    </h4>
                    <div className="overflow-x-auto rounded-lg border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)]">
                      <table className="w-full text-[10px] text-[var(--cds-text-01)] text-start">
                        <thead className="bg-[var(--cds-layer-03)] text-[var(--cds-text-02)] border-b border-[var(--cds-border-subtle)]">
                          <tr>
                            <th className="p-2 text-start font-medium">{language === 'ar' ? 'النموذج' : 'Model'}</th>
                            <th className="p-2 text-center font-medium">R²</th>
                            <th className="p-2 text-center font-medium">Adj R²</th>
                            <th className="p-2 text-end font-medium">RMSE</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--cds-border-subtle)] font-mono">
                          {regressionModelsComparison.map((mRow, mIdx) => (
                            <tr key={mIdx} className={`hover:bg-[var(--cds-layer-03)]/50 ${mRow.active ? 'bg-blue-500/10 font-bold' : ''}`}>
                              <td className="p-2 text-start font-sans text-[var(--cds-text-01)] flex items-center gap-1">
                                {mRow.active && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />}
                                {mRow.name}
                              </td>
                              <td className="p-2 text-center text-blue-600 dark:text-blue-400">{mRow.r2.toFixed(4)}</td>
                              <td className="p-2 text-center text-indigo-600 dark:text-indigo-400">{mRow.adjR2.toFixed(4)}</td>
                              <td className="p-2 text-end text-rose-600 dark:text-rose-400">{mRow.rmse.toFixed(4)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Resulting Equation & Mathematical Formula Box */}
              <div className="lg:col-span-8 bg-[var(--cds-layer-01)] p-4 rounded-xl border border-[var(--cds-border-subtle)] shadow-sm space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--cds-border-subtle)] pb-2.5">
                    <div className="flex items-center gap-2">
                      <Code2 className="w-4 h-4 text-emerald-500" />
                      <h3 className="text-sm font-bold text-[var(--cds-text-01)]">
                        {language === 'ar' ? `التابع الرياضي الناتج (${result.isMultivariate ? 'Multivariate' : 'Univariate'} ${result.type})` : `Fitted Model Formula (${result.type})`}
                      </h3>
                    </div>

                    {/* Equation view switcher */}
                    <div className="flex flex-wrap items-center bg-[var(--cds-layer-02)] p-0.5 rounded-lg text-xs border border-[var(--cds-border-subtle)] gap-1">
                      <button
                        onClick={() => setActiveEquationTab('math')}
                        className={`px-2.5 py-1 rounded-md font-medium transition-all ${activeEquationTab === 'math' ? 'bg-[var(--cds-layer-01)] text-[var(--cds-text-01)] shadow-xs' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'}`}
                      >
                        {language === 'ar' ? 'المعادلة الرياضية' : 'Formula'}
                      </button>
                      <button
                        onClick={() => setActiveEquationTab('python')}
                        className={`px-2.5 py-1 rounded-md font-medium transition-all ${activeEquationTab === 'python' ? 'bg-[var(--cds-layer-01)] text-[var(--cds-text-01)] shadow-xs' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'}`}
                      >
                        Python (Math)
                      </button>
                      <button
                        onClick={() => setActiveEquationTab('scikit')}
                        className={`px-2.5 py-1 rounded-md font-medium transition-all ${activeEquationTab === 'scikit' ? 'bg-[var(--cds-layer-01)] text-[var(--cds-text-01)] shadow-xs' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'}`}
                        title={language === 'ar' ? 'توليد كود scikit-learn لتشغيل النموذج خارجيًا' : 'Generate complete scikit-learn code for external pipeline reproduction'}
                      >
                        {language === 'ar' ? 'توليد كود Python (scikit-learn)' : 'scikit-learn (Generate Code)'}
                      </button>
                      <button
                        onClick={() => setActiveEquationTab('js')}
                        className={`px-2.5 py-1 rounded-md font-medium transition-all ${activeEquationTab === 'js' ? 'bg-[var(--cds-layer-01)] text-[var(--cds-text-01)] shadow-xs' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'}`}
                      >
                        JavaScript
                      </button>
                      <button
                        onClick={() => setActiveEquationTab('coefficients')}
                        className={`px-2.5 py-1 rounded-md font-medium transition-all ${activeEquationTab === 'coefficients' ? 'bg-[var(--cds-layer-01)] text-[var(--cds-text-01)] shadow-xs' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'}`}
                      >
                        {language === 'ar' ? `المعاملات (${result.coefficientDetails.length})` : `Coefficients (${result.coefficientDetails.length})`}
                      </button>
                    </div>
                  </div>
 
                  {/* Display Area */}
                  <div className="mt-3 relative">
                    {activeEquationTab === 'math' && (
                      <div className="p-4 bg-[var(--cds-layer-02)] text-emerald-600 dark:text-emerald-400 rounded-xl font-mono text-sm leading-relaxed overflow-x-auto select-all shadow-inner border border-[var(--cds-border-subtle)] min-h-[90px] flex items-center">
                        <span className="text-[var(--cds-text-03)] mr-2 text-xs font-sans">ƒ(x):</span>
                        <span>{result.equation}</span>
                      </div>
                    )}
 
                    {activeEquationTab === 'python' && (
                      <pre className="p-4 bg-[var(--cds-layer-02)] text-blue-600 dark:text-blue-400 rounded-xl font-mono text-xs leading-relaxed overflow-x-auto select-all shadow-inner border border-[var(--cds-border-subtle)] min-h-[90px]">
                        {result.pythonCode}
                      </pre>
                    )}

                    {activeEquationTab === 'scikit' && (
                      <pre className="p-4 bg-[var(--cds-layer-02)] text-indigo-600 dark:text-indigo-400 rounded-xl font-mono text-xs leading-relaxed overflow-x-auto select-all shadow-inner border border-[var(--cds-border-subtle)] min-h-[90px]">
                        {scikitCode}
                      </pre>
                    )}
 
                    {activeEquationTab === 'js' && (
                      <pre className="p-4 bg-[var(--cds-layer-02)] text-amber-600 dark:text-amber-400 rounded-xl font-mono text-xs leading-relaxed overflow-x-auto select-all shadow-inner border border-[var(--cds-border-subtle)] min-h-[90px]">
                        {result.jsCode}
                      </pre>
                    )}
 
                    {activeEquationTab === 'coefficients' && (
                      <div className="max-h-48 overflow-y-auto border border-[var(--cds-border-subtle)] rounded-lg">
                        <table className="w-full text-xs font-mono">
                          <thead className="bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] font-sans border-b border-[var(--cds-border-subtle)]">
                            <tr>
                              <th className="p-2 text-start">{language === 'ar' ? 'الحد / المتغير (Term)' : 'Term / Variable'}</th>
                              <th className="p-2 text-center">{language === 'ar' ? 'الأس (Power)' : 'Power'}</th>
                              <th className="p-2 text-end">{language === 'ar' ? 'قيمة المعامل (Coefficient)' : 'Coefficient'}</th>
                              <th className="p-2 text-center">{language === 'ar' ? 'الأهمية النسبية' : 'Importance'}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--cds-border-subtle)]">
                            <tr className="bg-blue-500/5">
                              <td className="p-2 font-semibold text-[var(--cds-text-01)]">{language === 'ar' ? 'الحد الثابت (Intercept / β₀)' : 'Intercept (β₀)'}</td>
                              <td className="p-2 text-center text-[var(--cds-text-03)]">0</td>
                              <td className="p-2 text-end text-blue-600 dark:text-blue-400 font-bold">{result.intercept.toFixed(6)}</td>
                              <td className="p-2 text-center text-[var(--cds-text-03)]">-</td>
                            </tr>
                            {result.coefficientDetails.map((det, idx) => (
                              <tr key={idx} className="hover:bg-[var(--cds-layer-02)] text-[var(--cds-text-01)]">
                                <td className="p-2 font-medium">{det.name}</td>
                                <td className="p-2 text-center text-[var(--cds-text-03)]">{det.power}</td>
                                <td className="p-2 text-end font-semibold">{det.coefficient.toFixed(6)}</td>
                                <td className="p-2 text-center">
                                  <div className="w-full bg-[var(--cds-layer-03)] rounded-full h-1.5 max-w-[80px] mx-auto">
                                    <div 
                                      className="bg-blue-600 h-1.5 rounded-full" 
                                      style={{ width: `${Math.min(100, det.importancePercent)}%` }}
                                    />
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
 
                    {/* Copy Action Button */}
                    <button
                      onClick={() => {
                        const textToCopy = activeEquationTab === 'math' ? result.equation : activeEquationTab === 'python' ? result.pythonCode : activeEquationTab === 'scikit' ? scikitCode : activeEquationTab === 'js' ? result.jsCode : result.pythonCode;
                        handleCopyEquation(textToCopy);
                      }}
                      className="absolute top-2.5 right-2.5 flex items-center gap-1.5 bg-gray-800/90 hover:bg-gray-700 text-gray-200 hover:text-white px-3 py-1.5 rounded-md text-xs font-sans transition-all border border-gray-700 shadow-sm"
                      title="نسخ إلى الحافظة"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-green-400" />
                          <span className="text-green-400 font-medium">تم النسخ!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>نسخ النص</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-gray-500 pt-2 border-t border-gray-100">
                  <span className="flex items-center gap-1">
                    <Info className="w-3.5 h-3.5 text-blue-500" />
                    المعادلة صالحة للتنبؤ الرياضي والبرمجي المتعدد.
                  </span>
                  <span className="font-mono text-gray-400">
                    {result.type} • {result.isMultivariate ? 'Multivariate' : 'Univariate'} • {result.coefficientDetails.length} Features Terms
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Visualizations & Data Comparison Section */}
          <div className="bg-[var(--cds-layer-01)] rounded-xl border border-[var(--cds-border-subtle)] shadow-sm overflow-hidden">
            {/* Viz Navigation Tabs */}
            <div className="flex flex-wrap items-center justify-between border-b border-[var(--cds-border-subtle)] px-4 py-3 bg-[var(--cds-layer-02)]">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-blue-600" />
                <h3 className="text-xs font-bold text-[var(--cds-text-01)]">
                  {language === 'ar' ? 'المخططات البيانية والتحليل التفاعلي' : 'Interactive Visualizations & Analysis'}:
                </h3>
              </div>

              <div className="flex items-center gap-1 bg-[var(--cds-layer-03)] p-1 rounded-lg text-xs">
                <button
                  onClick={() => setActiveVizTab('fit')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${activeVizTab === 'fit' ? 'bg-[var(--cds-layer-01)] text-blue-600 shadow-sm' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'}`}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  {language === 'ar' ? 'منحنى التوافق' : 'Fit Curve'}
                </button>
                {xAxisCols.length >= 2 && (
                  <button
                    onClick={() => setActiveVizTab('3dSurface')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${activeVizTab === '3dSurface' ? 'bg-[var(--cds-layer-01)] text-blue-600 shadow-sm' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'}`}
                  >
                    <Box className="w-3.5 h-3.5 text-purple-600" />
                    {language === 'ar' ? 'مجسم ثلاثي الأبعاد' : '3D Surface'}
                  </button>
                )}
                <button
                  onClick={() => setActiveVizTab('actualVsPredicted')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${activeVizTab === 'actualVsPredicted' ? 'bg-[var(--cds-layer-01)] text-blue-600 shadow-sm' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'}`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  {language === 'ar' ? 'الحقيقي مقابل المتوقع' : 'Actual vs Pred'}
                </button>
                <button
                  onClick={() => setActiveVizTab('residuals')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${activeVizTab === 'residuals' ? 'bg-[var(--cds-layer-01)] text-blue-600 shadow-sm' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'}`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  {language === 'ar' ? 'البواقي والخطأ' : 'Residuals'}
                </button>
                <button
                  onClick={() => setActiveVizTab('table')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${activeVizTab === 'table' ? 'bg-[var(--cds-layer-01)] text-blue-600 shadow-sm' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'}`}
                >
                  <TableIcon className="w-3.5 h-3.5" />
                  {language === 'ar' ? 'جدول المقارنة' : 'Data Table'}
                </button>
                <button
                  onClick={() => {
                    setActiveVizTab('comparator');
                    if (!selectedCompModelAId && savedModels.length > 0) {
                      setSelectedCompModelAId(savedModels[0].id);
                    }
                    if (!selectedCompModelBId && savedModels.length > 1) {
                      setSelectedCompModelBId(savedModels[1].id);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${activeVizTab === 'comparator' ? 'bg-[var(--cds-layer-01)] text-purple-600 shadow-sm' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'}`}
                  title={language === 'ar' ? 'مقارنة نموذجين جنباً إلى جنب' : 'Compare two saved models side-by-side'}
                >
                  <Compass className="w-3.5 h-3.5" />
                  {language === 'ar' ? 'مقارن النماذج جنباً لجنب' : 'Model Comparator'}
                </button>
                <button
                  onClick={() => setActiveVizTab('importance')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${activeVizTab === 'importance' ? 'bg-[var(--cds-layer-01)] text-blue-600 shadow-sm' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'}`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                  {language === 'ar' ? 'أهمية الميزات' : 'Feature Importance'}
                </button>
                <button
                  onClick={() => setActiveVizTab('diagnostics')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${activeVizTab === 'diagnostics' ? 'bg-[var(--cds-layer-01)] text-purple-600 shadow-sm' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'}`}
                >
                  <Activity className="w-3.5 h-3.5 text-purple-500" />
                  {language === 'ar' ? 'التشخيص والفحوصات' : 'Diagnostics & Assumptions'}
                </button>
                <button
                  onClick={() => setActiveVizTab('learningCurve')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${activeVizTab === 'learningCurve' ? 'bg-[var(--cds-layer-01)] text-orange-600 shadow-sm' : 'text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'}`}
                >
                  <GitBranch className="w-3.5 h-3.5 text-orange-500" />
                  {language === 'ar' ? 'منحنى التعلم (Overfit)' : 'Learning Curve'}
                </button>
              </div>
            </div>
 
            {/* Viz Content */}
            <div className="p-4">
              {activeVizTab === 'diagnostics' ? (
                result && selectedType !== 'kmeans' && comparisonRows.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Plot 1: Residuals vs Fitted */}
                    <div className="bg-[var(--cds-layer-02)] p-4 rounded-xl border border-[var(--cds-border-subtle)] shadow-xs">
                      <div className="text-xs font-bold text-[var(--cds-text-01)] mb-1">
                        {language === 'ar' ? '1. المتبقيات مقابل التوافق (Residuals vs Fitted)' : '1. Residuals vs Fitted'}
                      </div>
                      <div className="text-[10px] text-[var(--cds-text-03)] mb-2">
                        {language === 'ar' 
                          ? 'يتحقق من افتراض الخطية ( linearity). يجب أن تتوزع النقاط عشوائياً حول الصفر دون نمط واضح.' 
                          : 'Checks linearity. Points should be scattered randomly around the zero line with no distinct pattern.'}
                      </div>
                      <div className="h-[220px]">
                        <Plot
                          key={`diag-fit-${isDark}`}
                          data={[
                            {
                              x: comparisonRows.map(r => r.predicted),
                              y: comparisonRows.map(r => r.residual),
                              mode: 'markers',
                              type: 'scatter',
                              marker: { color: '#3b82f6', opacity: 0.8 }
                            },
                            {
                              x: [Math.min(...comparisonRows.map(r => r.predicted)), Math.max(...comparisonRows.map(r => r.predicted))],
                              y: [0, 0],
                              mode: 'lines',
                              type: 'scatter',
                              line: { color: '#ef4444', dash: 'dash' }
                            }
                          ] as any}
                          layout={{
                            autosize: true,
                            margin: { l: 40, r: 15, t: 15, b: 35 },
                            paper_bgcolor: 'transparent',
                            plot_bgcolor: 'transparent',
                            showlegend: false,
                            xaxis: { gridcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
                            yaxis: { gridcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }
                          }}
                          config={{ responsive: true, displayModeBar: false }}
                          style={{ width: '100%', height: '100%' }}
                        />
                      </div>
                    </div>

                    {/* Plot 2: Normal Q-Q */}
                    <div className="bg-[var(--cds-layer-02)] p-4 rounded-xl border border-[var(--cds-border-subtle)] shadow-xs">
                      <div className="text-xs font-bold text-[var(--cds-text-01)] mb-1">
                        {language === 'ar' ? '2. مخطط التطابق الطبيعي (Normal Q-Q Plot)' : '2. Normal Q-Q Plot'}
                      </div>
                      <div className="text-[10px] text-[var(--cds-text-03)] mb-2">
                        {language === 'ar'
                          ? 'يتحقق من التوزيع الطبيعي للمتبقيات. يجب أن تقع النقاط على الخط المستقيم بزاوية 45 درجة.'
                          : 'Checks normality of residuals. Points should lie close to the 45-degree reference line.'}
                      </div>
                      <div className="h-[220px]">
                        {(() => {
                          const residuals = comparisonRows.map(r => r.residual);
                          const meanRes = residuals.reduce((a,b)=>a+b,0)/residuals.length;
                          const sdRes = Math.sqrt(residuals.reduce((sum,r)=>sum+Math.pow(r-meanRes,2),0)/(residuals.length-1 || 1));
                          const stdRes = residuals.map(r => sdRes > 0 ? r/sdRes : 0);
                          const sortedStdRes = [...stdRes].sort((a,b)=>a-b);
                          const theoreticalQ = sortedStdRes.map((_,idx)=>{
                            const p = (idx + 1 - 0.5) / sortedStdRes.length;
                            return normSInv(p);
                          });
                          const minQ = Math.min(...theoreticalQ);
                          const maxQ = Math.max(...theoreticalQ);
                          return (
                            <Plot
                              key={`diag-qq-${isDark}`}
                              data={[
                                {
                                  x: theoreticalQ,
                                  y: sortedStdRes,
                                  mode: 'markers',
                                  type: 'scatter',
                                  marker: { color: '#8a3ffc', opacity: 0.8 }
                                },
                                {
                                  x: [minQ, maxQ],
                                  y: [minQ, maxQ],
                                  mode: 'lines',
                                  type: 'scatter',
                                  line: { color: '#10b981', dash: 'solid' }
                                }
                              ] as any}
                              layout={{
                                autosize: true,
                                margin: { l: 40, r: 15, t: 15, b: 35 },
                                paper_bgcolor: 'transparent',
                                plot_bgcolor: 'transparent',
                                showlegend: false,
                                xaxis: { gridcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
                                yaxis: { gridcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }
                              }}
                              config={{ responsive: true, displayModeBar: false }}
                              style={{ width: '100%', height: '100%' }}
                            />
                          );
                        })()}
                      </div>
                    </div>

                    {/* Plot 3: Scale-Location Plot */}
                    <div className="bg-[var(--cds-layer-02)] p-4 rounded-xl border border-[var(--cds-border-subtle)] shadow-xs">
                      <div className="text-xs font-bold text-[var(--cds-text-01)] mb-1">
                        {language === 'ar' ? '3. مخطط ثبات التباين (Scale-Location Plot)' : '3. Scale-Location Plot'}
                      </div>
                      <div className="text-[10px] text-[var(--cds-text-03)] mb-2">
                        {language === 'ar'
                          ? 'يتحقق من ثبات التباين (homoscedasticity). يجب أن تظهر المتبقيات نمطاً أفقياً ثابتاً.'
                          : 'Checks homoscedasticity. Standardized residual spread should be constant across fitted values.'}
                      </div>
                      <div className="h-[220px]">
                        {(() => {
                          const residuals = comparisonRows.map(r => r.residual);
                          const meanRes = residuals.reduce((a,b)=>a+b,0)/residuals.length;
                          const sdRes = Math.sqrt(residuals.reduce((sum,r)=>sum+Math.pow(r-meanRes,2),0)/(residuals.length-1 || 1));
                          const stdRes = residuals.map(r => sdRes > 0 ? r/sdRes : 0);
                          const sqrtAbsStdRes = stdRes.map(r => Math.sqrt(Math.abs(r)));
                          return (
                            <Plot
                              key={`diag-scale-${isDark}`}
                              data={[
                                {
                                  x: comparisonRows.map(r => r.predicted),
                                  y: sqrtAbsStdRes,
                                  mode: 'markers',
                                  type: 'scatter',
                                  marker: { color: '#0072c3', opacity: 0.8 }
                                }
                              ] as any}
                              layout={{
                                autosize: true,
                                margin: { l: 40, r: 15, t: 15, b: 35 },
                                paper_bgcolor: 'transparent',
                                plot_bgcolor: 'transparent',
                                showlegend: false,
                                xaxis: { gridcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
                                yaxis: { gridcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }
                              }}
                              config={{ responsive: true, displayModeBar: false }}
                              style={{ width: '100%', height: '100%' }}
                            />
                          );
                        })()}
                      </div>
                    </div>

                    {/* Plot 4: Normality Histogram */}
                    <div className="bg-[var(--cds-layer-02)] p-4 rounded-xl border border-[var(--cds-border-subtle)] shadow-xs">
                      <div className="text-xs font-bold text-[var(--cds-text-01)] mb-1">
                        {language === 'ar' ? '4. مدرج توزيع المتبقيات (Residuals Histogram)' : '4. Residuals Histogram'}
                      </div>
                      <div className="text-[10px] text-[var(--cds-text-03)] mb-2">
                        {language === 'ar'
                          ? 'تمثيل بياني مباشر لتوزيع الأخطاء لرصد وجود أي التواء (skewness) أو قيم متطرفة.'
                          : 'Direct distribution of prediction error. Ideally fits a bell curve with zero skewness.'}
                      </div>
                      <div className="h-[220px]">
                        <Plot
                          key={`diag-hist-${isDark}`}
                          data={[
                            {
                              x: comparisonRows.map(r => r.residual),
                              type: 'histogram',
                              marker: { color: '#2563eb', opacity: 0.75 }
                            }
                          ] as any}
                          layout={{
                            autosize: true,
                            margin: { l: 40, r: 15, t: 15, b: 35 },
                            paper_bgcolor: 'transparent',
                            plot_bgcolor: 'transparent',
                            showlegend: false,
                            xaxis: { gridcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' },
                            yaxis: { gridcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }
                          }}
                          config={{ responsive: true, displayModeBar: false }}
                          style={{ width: '100%', height: '100%' }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-12 text-[var(--cds-text-03)] flex flex-col items-center justify-center">
                    <Activity className="w-10 h-10 mb-2 opacity-50 text-purple-500" />
                    <p className="font-semibold text-sm">
                      {language === 'ar' ? 'يتطلب تشخيص النموذج تدريب نموذج انحدار صالح أولاً.' : 'Diagnostic plots require an active regression model.'}
                    </p>
                  </div>
                )
              ) : activeVizTab === 'learningCurve' ? (
                !result || selectedType === 'kmeans' ? (
                  <div className="text-center p-12 text-[var(--cds-text-03)] flex flex-col items-center justify-center">
                    <Sparkles className="w-10 h-10 mb-2 opacity-50 text-blue-500" />
                    <p className="font-semibold text-sm">
                      {language === 'ar' ? 'هذه الميزة التقييمية متوفرة لنماذج الانحدار النشطة فقط.' : 'This advanced evaluation tab is only available for active regression models.'}
                    </p>
                  </div>
                ) : (
                  <div className="w-full">
                    <PerformanceCurves
                      data={data.map((d, i) => ({ index: i, x: d.x, y: d.y, features: d.features }))}
                      modelType={selectedType as 'linear' | 'polynomial' | 'ridge'}
                      currentDegree={degree}
                      currentAlpha={alpha}
                      includeInteractions={includeInteractions}
                      language={language}
                      isDark={isDark}
                    />
                  </div>
                )
              ) : activeVizTab === 'importance' ? (
                !result || selectedType === 'kmeans' ? (
                  <div className="text-center p-12 text-[var(--cds-text-03)] flex flex-col items-center justify-center">
                    <Sparkles className="w-10 h-10 mb-2 opacity-50 text-blue-500" />
                    <p className="font-semibold text-sm">
                      {language === 'ar' ? 'هذه الميزة التقييمية متوفرة لنماذج الانحدار النشطة فقط. يرجى ملاءمة النموذج أولاً.' : 'Feature importance analysis is only available for active regression models. Please fit a model first.'}
                    </p>
                  </div>
                ) : (
                  <FeatureImportanceChart
                    features={featureImportanceItems}
                    modelType={selectedType as 'linear' | 'polynomial' | 'ridge'}
                    language={language}
                    isDark={isDark}
                    targetName={yAxisCol || 'Target'}
                  />
                )
              ) : activeVizTab !== 'table' && activeVizTab !== 'comparator' ? (
                <div className="w-full h-[430px]">
                  <Plot
                    key={JSON.stringify(data.length) + selectedType + activeVizTab + (result ? result.equation : '') + (isDark ? 'dark' : 'light')}
                    data={plotData as any}
                    layout={plotLayout as any}
                    config={{ responsive: true, displayModeBar: true }}
                    style={{ width: '100%', height: '100%' }}
                  />
                </div>
              ) : activeVizTab === 'table' ? (
                <div className="max-h-[430px] overflow-y-auto">
                  <table className="w-full text-xs text-right font-mono border-collapse">
                    <thead className="bg-[var(--cds-layer-02)] text-[var(--cds-text-01)] font-sans sticky top-0 border-b border-[var(--cds-border-subtle)]">
                      <tr>
                        <th className="p-2.5 text-center">#</th>
                        {result?.splitInfo?.enabled && (
                          <th className="p-2.5 text-center text-indigo-600">{language === 'ar' ? 'المجموعة' : 'Split Group'}</th>
                        )}
                        {result?.cvInfo && (
                          <th className="p-2.5 text-center text-teal-600">{language === 'ar' ? 'طية التحقق (CV Fold)' : 'CV Fold'}</th>
                        )}
                        <th className="p-2.5">{language === 'ar' ? `المتغيرات المستقلة X (${xAxisCols.join(', ')})` : `Features X (${xAxisCols.join(', ')})`}</th>
                        <th className="p-2.5 text-blue-600">{language === 'ar' ? `القيمة الحقيقية Y (${yAxisCol || 'Actual'})` : `Actual Y (${yAxisCol || 'Actual'})`}</th>
                        <th className="p-2.5 text-emerald-600">
                          {result?.cvInfo && (useCvPredictions || result?.isCvPredicting)
                            ? (language === 'ar' ? 'تنبؤ المصادقة التبادلية Ŷ (CV OOF)' : 'CV OOF Predicted Ŷ')
                            : (language === 'ar' ? 'القيمة المتوقعة Ŷ (Predicted)' : 'Predicted Ŷ')}
                        </th>
                        <th className="p-2.5 text-purple-600">{language === 'ar' ? 'الباقي (Residual = Y - Ŷ)' : 'Residual (Y - Ŷ)'}</th>
                        <th className="p-2.5 text-rose-600">{language === 'ar' ? 'نسبة الخطأ المطلق (% Error)' : 'Abs % Error'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--cds-border-subtle)]">
                      {comparisonRows.map((row) => (
                        <tr key={row.index} className="hover:bg-[var(--cds-layer-02)] transition-colors">
                          <td className="p-2 text-center text-[var(--cds-text-03)] font-sans">{row.index}</td>
                          {result?.splitInfo?.enabled && (
                            <td className="p-2 text-center font-sans">
                              <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${row.isTest ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30' : 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30'}`}>
                                {row.isTest ? (language === 'ar' ? 'اختبار (خارج العينة)' : 'Test') : (language === 'ar' ? 'تدريب (داخل العينة)' : 'Train')}
                              </span>
                            </td>
                          )}
                          {result?.cvInfo && (
                            <td className="p-2 text-center font-sans">
                              {row.isCvPrediction && row.cvFold !== undefined ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30" title="Out-of-Fold Cross-Validation Prediction">
                                  {language === 'ar' ? `طية #${row.cvFold}` : `Fold #${row.cvFold}`}
                                </span>
                              ) : (
                                <span className="text-[10px] text-[var(--cds-text-03)] font-mono">-</span>
                              )}
                            </td>
                          )}
                          <td className="p-2 font-medium text-[var(--cds-text-01)]">{row.features.map(f => f.toFixed(2)).join(', ')}</td>
                          <td className="p-2 text-blue-600 font-bold">{row.actual.toFixed(4)}</td>
                          <td className="p-2 text-emerald-600 font-bold flex items-center gap-1.5 justify-end">
                            {row.isCvPrediction && (
                              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" title="OOF Prediction" />
                            )}
                            <span>{row.predicted.toFixed(4)}</span>
                          </td>
                          <td className={`p-2 font-semibold ${row.residual >= 0 ? 'text-green-600' : 'text-rose-600'}`}>
                            {row.residual >= 0 ? '+' : ''}{row.residual.toFixed(4)}
                          </td>
                          <td className="p-2 text-rose-600 font-bold">
                            {row.absErrorPercent.toFixed(2)}%
                          </td>
                        </tr>
                      ))}
                      {comparisonRows.length === 0 && (
                        <tr>
                          <td colSpan={(result?.splitInfo?.enabled ? 1 : 0) + (result?.cvInfo ? 1 : 0) + 6} className="text-center p-8 text-[var(--cds-text-03)] font-sans">
                            {language === 'ar' ? 'يرجى تدريب النموذج أولاً لعرض المقارنة التفصيلية.' : 'Please calculate a model first to view detailed row comparisons.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Model Selection Dropdowns */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-[var(--cds-layer-02)] p-3 rounded-xl border border-[var(--cds-border-subtle)] shadow-inner">
                    <div>
                      <label className="block text-[10px] font-bold text-[var(--cds-text-03)] uppercase mb-1">
                        {language === 'ar' ? 'النموذج المقارن أ (اللون الأزرق):' : 'Model A to Compare (Blue):'}
                      </label>
                      <select
                        value={selectedCompModelAId}
                        onChange={(e) => setSelectedCompModelAId(e.target.value)}
                        className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-2 rounded-lg text-xs font-semibold outline-none text-[var(--cds-text-01)] focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">{language === 'ar' ? '-- اختر نموذجاً --' : '-- Select a Model --'}</option>
                        {savedModels.map(m => (
                          <option key={m.id} value={m.id}>{m.name} ({m.type} - R²: {m.r2.toFixed(3)})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-[var(--cds-text-03)] uppercase mb-1">
                        {language === 'ar' ? 'النموذج المقارن ب (اللون الأرجواني):' : 'Model B to Compare (Purple):'}
                      </label>
                      <select
                        value={selectedCompModelBId}
                        onChange={(e) => setSelectedCompModelBId(e.target.value)}
                        className="w-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-2 rounded-lg text-xs font-semibold outline-none text-[var(--cds-text-01)] focus:ring-1 focus:ring-purple-500"
                      >
                        <option value="">{language === 'ar' ? '-- اختر نموذجاً --' : '-- Select a Model --'}</option>
                        {savedModels.map(m => (
                          <option key={m.id} value={m.id} disabled={m.id === selectedCompModelAId}>{m.name} ({m.type} - R²: {m.r2.toFixed(3)})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Chart and Delta Table */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    {/* Visualizer Chart */}
                    <div className="lg:col-span-7 border border-[var(--cds-border-subtle)] rounded-xl overflow-hidden bg-[var(--cds-layer-02)] p-2 h-[380px]">
                      <Plot
                        key={JSON.stringify(data.length) + selectedCompModelAId + selectedCompModelBId + activeVizTab + (isDark ? 'dark' : 'light')}
                        data={plotData as any}
                        layout={{
                          ...plotLayout,
                          title: {
                            text: language === 'ar' ? 'مقارنة المنحنيات جنباً لجنب' : 'Side-by-Side Fit Curves Comparison',
                            font: { size: 12, color: isDark ? '#f4f4f4' : '#161616', family: 'sans-serif' }
                          },
                          height: 360,
                          margin: { t: 30, b: 40, l: 40, r: 20 }
                        } as any}
                        config={{ responsive: true, displayModeBar: true }}
                        style={{ width: '100%', height: '100%' }}
                      />
                    </div>

                    {/* Performance Delta Table */}
                    <div className="lg:col-span-5 flex flex-col justify-between space-y-3">
                      <div className="bg-[var(--cds-layer-02)] rounded-xl border border-[var(--cds-border-subtle)] p-3.5 flex-1 overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-[var(--cds-border-subtle)] pb-2 mb-2">
                          <span className="text-xs font-bold text-[var(--cds-text-01)] flex items-center gap-1.5">
                            <Activity className="w-4 h-4 text-purple-600" />
                            <span>{language === 'ar' ? 'جدول فروقات مقاييس الأداء (Performance Deltas)' : 'Performance Metrics Delta'}</span>
                          </span>
                        </div>

                        {(() => {
                          const modelA = savedModels.find(m => m.id === selectedCompModelAId);
                          const modelB = savedModels.find(m => m.id === selectedCompModelBId);

                          if (!modelA || !modelB) {
                            return (
                              <div className="flex flex-col items-center justify-center text-center p-6 h-full text-[var(--cds-text-03)] min-h-[180px]">
                                <Box className="w-8 h-8 opacity-40 mb-2" />
                                <p className="text-xs font-semibold">
                                  {language === 'ar' ? 'الرجاء اختيار نموذجين للمقارنة وعرض جدول الفروقات' : 'Please select two models above to view the delta comparison.'}
                                </p>
                              </div>
                            );
                          }

                          const getMetric = (model: any, key: 'r2' | 'mse' | 'adjustedR2' | 'rmse' | 'mae') => {
                            if (model.metrics && model.metrics[key] !== undefined) return model.metrics[key];
                            if (key === 'r2') return model.r2;
                            if (key === 'mse') return model.mse;
                            if (key === 'rmse') return Math.sqrt(model.mse);
                            if (key === 'adjustedR2') return model.r2 * 0.98;
                            if (key === 'mae') return Math.sqrt(model.mse) * 0.8;
                            return 0;
                          };

                          const metricsList = [
                            { key: 'r2', name: 'R² (R-squared)', higherIsBetter: true, format: (v: number) => v.toFixed(4) },
                            { key: 'adjustedR2', name: language === 'ar' ? 'R² المعدل (Adj R²)' : 'Adjusted R²', higherIsBetter: true, format: (v: number) => v.toFixed(4) },
                            { key: 'mse', name: 'MSE (Mean Squared Error)', higherIsBetter: false, format: (v: number) => v.toFixed(4) },
                            { key: 'rmse', name: 'RMSE (Root MSE)', higherIsBetter: false, format: (v: number) => v.toFixed(4) },
                            { key: 'mae', name: 'MAE (Mean Absolute Error)', higherIsBetter: false, format: (v: number) => v.toFixed(4) },
                            { key: 'overfittingIndex', name: language === 'ar' ? 'مؤشر التخصيص الزائد' : 'Overfitting Index', higherIsBetter: false, format: (v: number) => v.toFixed(3) }
                          ];

                          return (
                            <table className="w-full text-[11px] font-mono border-collapse">
                              <thead>
                                <tr className="border-b border-[var(--cds-border-subtle)] text-[var(--cds-text-03)] font-sans text-[10px]">
                                  <th className="p-2 text-right">{language === 'ar' ? 'المقياس' : 'Metric'}</th>
                                  <th className="p-2 text-center text-blue-600">Model A</th>
                                  <th className="p-2 text-center text-purple-600">Model B</th>
                                  <th className="p-2 text-center">{language === 'ar' ? 'الفارق' : 'Delta'}</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[var(--cds-border-subtle)]/40">
                                {metricsList.map(m => {
                                  const valA = m.key === 'overfittingIndex' ? modelA.overfittingIndex : getMetric(modelA, m.key as any);
                                  const valB = m.key === 'overfittingIndex' ? modelB.overfittingIndex : getMetric(modelB, m.key as any);
                                  const diff = valB - valA;
                                  const isBetterB = m.higherIsBetter ? diff > 0 : diff < 0;
                                  const isBetterA = m.higherIsBetter ? diff < 0 : diff > 0;
                                  const isZero = Math.abs(diff) < 1e-6;

                                  let badgeClass = 'text-gray-500 bg-gray-500/10 dark:text-gray-400';
                                  if (!isZero) {
                                    if (isBetterB) {
                                      badgeClass = 'text-emerald-600 bg-emerald-500/15 dark:text-emerald-400 font-bold';
                                    } else {
                                      badgeClass = 'text-rose-600 bg-rose-500/15 dark:text-rose-400 font-bold';
                                    }
                                  }

                                  return (
                                    <tr key={m.key} className="hover:bg-[var(--cds-layer-03)]/40 transition-colors">
                                      <td className="p-2 text-right font-sans font-semibold text-[var(--cds-text-01)]">{m.name}</td>
                                      <td className={`p-2 text-center font-bold ${isBetterA ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--cds-text-02)]'}`}>{m.format(valA)}</td>
                                      <td className={`p-2 text-center font-bold ${isBetterB ? 'text-emerald-600 dark:text-emerald-400' : 'text-[var(--cds-text-02)]'}`}>{m.format(valB)}</td>
                                      <td className="p-2 text-center">
                                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${badgeClass}`}>
                                          {diff > 0 ? '+' : ''}{m.format(diff)}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          );
                        })()}
                      </div>
                      
                      {/* Comparison Snapshot Card */}
                      {(() => {
                        const modelA = savedModels.find(m => m.id === selectedCompModelAId);
                        const modelB = savedModels.find(m => m.id === selectedCompModelBId);
                        if (!modelA || !modelB) return null;
                        
                        return (
                          <div className="p-3 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 rounded-xl border border-purple-500/15 text-xs shadow-2xs">
                            <span className="font-bold text-indigo-600 dark:text-indigo-400 block mb-1">
                              💡 {language === 'ar' ? 'التحليل التلقائي المقارن:' : 'Automated Comparative Insight:'}
                            </span>
                            <p className="text-[11px] leading-relaxed text-[var(--cds-text-02)]">
                              {(() => {
                                const r2A = modelA.r2;
                                const r2B = modelB.r2;
                                const r2Diff = Math.abs(r2B - r2A);
                                const bestModel = r2B > r2A ? modelB : modelA;
                                const otherModel = r2B > r2A ? modelA : modelB;
                                
                                if (r2Diff < 0.01) {
                                  return language === 'ar'
                                    ? `النموذجان متقاربان للغاية في الأداء الإحصائي (الفرق في R² هو ${r2Diff.toFixed(4)}). يُنصح باختيار النموذج ذي مؤشر التخصيص الأقل لتفادي مشكلة الإفراط في التخصيص (Overfitting) والتمتع بقدرة تعميم أفضل.`
                                    : `Both models perform almost identically (R² difference: ${r2Diff.toFixed(4)}). We recommend choosing the model with the lower Overfitting Index to ensure better generalizability.`;
                                } else {
                                  return language === 'ar'
                                    ? `يتفوق نموذج "${bestModel.name}" على نموذج "${otherModel.name}" بمقدار ${(r2Diff * 100).toFixed(2)}% في معامل التحديد (R²). هذا يوضح قدرته الأكبر على تمثيل التباين في البيانات التابعة.`
                                    : `"${bestModel.name}" outperforms "${otherModel.name}" by ${(r2Diff * 100).toFixed(2)}% in R² score. This indicates a significantly stronger capability to capture target variance.`;
                                }
                              })()}
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SIDE PANEL: Saved Models with Advanced Radar Comparison */}
        <div className="xl:col-span-1 bg-[var(--cds-layer-01)] p-4 rounded-xl border border-[var(--cds-border-subtle)] shadow-sm flex flex-col h-full max-h-[850px]">
          {/* Header */}
          <div className="flex flex-col gap-2.5 border-b border-[var(--cds-border-subtle)] pb-3 mb-3 shrink-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--cds-text-01)] flex items-center gap-2">
                <Compass className="w-4 h-4 text-purple-600" />
                <span>{language === 'ar' ? 'لوحة مقارنة النماذج المتعددة' : 'Model Comparison Radar'}</span>
                <span className="text-[10px] bg-purple-500/15 text-purple-700 dark:text-purple-300 font-bold px-2 py-0.5 rounded-full">
                  {savedModels.length}
                </span>
              </h3>
              <div className="flex items-center gap-1">
                <button 
                  onClick={loadBenchmarkSuite} 
                  className="px-2 py-1 text-[10px] font-semibold bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-lg border border-blue-200 dark:border-blue-800 transition-colors"
                  title="تحميل عينة معيارية لمقارنة 4 نماذج انحدار"
                >
                  {language === 'ar' ? 'نماذج معيارية' : 'Demo 4'}
                </button>
                {savedModels.length > 0 && (
                  <>
                    <button onClick={exportModelsCSV} className="p-1.5 text-emerald-600 hover:bg-[var(--cds-layer-02)] rounded-lg transition-colors" title="تصدير كـ CSV">
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={exportModelsJSON} className="p-1.5 text-blue-600 hover:bg-[var(--cds-layer-02)] rounded-lg transition-colors" title="تصدير كـ JSON">
                      <Code2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Sorting controls */}
            {savedModels.length > 1 && (
              <div className="flex items-center justify-between bg-[var(--cds-layer-02)] p-1.5 rounded-lg border border-[var(--cds-border-subtle)] text-[10px]">
                <div className="flex items-center gap-1 text-[var(--cds-text-02)]">
                  <Sliders className="w-3 h-3 text-purple-600" />
                  <span>{language === 'ar' ? 'ترتيب:' : 'Sort:'}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <select 
                    value={modelsSortField} 
                    onChange={(e) => setModelsSortField(e.target.value as any)} 
                    className="bg-transparent outline-none font-bold text-[var(--cds-text-01)] text-[10px] cursor-pointer"
                  >
                    <option value="none" className="bg-[var(--cds-layer-01)] text-[var(--cds-text-01)]">{language === 'ar' ? 'الافتراضي' : 'Default'}</option>
                    <option value="r2" className="bg-[var(--cds-layer-01)] text-[var(--cds-text-01)]">R² Score</option>
                    <option value="mse" className="bg-[var(--cds-layer-01)] text-[var(--cds-text-01)]">MSE (Error)</option>
                    <option value="trainingTime" className="bg-[var(--cds-layer-01)] text-[var(--cds-text-01)]">{language === 'ar' ? 'سرعة التدريب' : 'Training Time'}</option>
                    <option value="overfittingIndex" className="bg-[var(--cds-layer-01)] text-[var(--cds-text-01)]">{language === 'ar' ? 'مقاومة التخصيص' : 'Generalization'}</option>
                  </select>
                  <button 
                    onClick={() => setModelsSortOrder(modelsSortOrder === 'desc' ? 'asc' : 'desc')} 
                    className="text-[10px] font-bold text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] px-1 rounded"
                    title={modelsSortOrder === 'desc' ? 'تنازلي' : 'تصاعدي'}
                  >
                    {modelsSortOrder === 'desc' ? '▼' : '▲'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* RADAR CHART: Multi-Metric Model Comparison (MSE, R2, Training Time, Overfitting Index) */}
          {savedModels.length > 0 ? (
            <div className="h-64 mb-3 shrink-0 border border-[var(--cds-border-subtle)] rounded-xl bg-[var(--cds-layer-02)] p-2 relative overflow-hidden">
              <div className="flex items-center justify-between px-2 pt-1 pb-1">
                <span className="text-[10px] font-bold text-[var(--cds-text-02)] flex items-center gap-1">
                  <Activity className="w-3 h-3 text-purple-600" />
                  {language === 'ar' ? 'رادار المقارنة متعدد المقاييس (Radar Chart)' : 'Multi-Metric Comparison Radar'}
                </span>
                <span className="text-[9px] font-medium text-[var(--cds-text-03)]">
                  {language === 'ar' ? '100 = الأداء الأفضل' : '100 = Optimal'}
                </span>
              </div>
              <ResponsiveContainer width="100%" height="90%">
                <RadarChart cx="50%" cy="50%" outerRadius="62%" data={radarData} margin={{ top: 10, right: 15, bottom: 10, left: 15 }}>
                  <PolarGrid stroke={isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'} />
                  <PolarAngleAxis 
                    dataKey="name" 
                    tick={{ fill: isDark ? '#c6c6c6' : '#525252', fontSize: 9.5, fontWeight: 600 }} 
                  />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                  <RechartsTooltip 
                    content={({ active, payload, label }) => {
                      if (!active || !payload || !payload.length) return null;
                      const metricRow = radarData.find(d => d.name === label);
                      return (
                        <div className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-2.5 rounded-xl shadow-xl text-xs space-y-1.5 min-w-[200px] z-50">
                          <div className="font-bold text-[var(--cds-text-01)] border-b border-[var(--cds-border-subtle)] pb-1 text-[11px]">
                            {metricRow?.fullLabel || label}
                          </div>
                          <div className="space-y-1">
                            {payload.map((item: any) => {
                              const modelId = item.dataKey.replace('m_', '');
                              const rawVal = metricRow ? metricRow[`${item.dataKey}_raw`] : null;
                              return (
                                <div key={item.dataKey} className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 truncate">
                                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                                    <span className="text-[var(--cds-text-02)] text-[10px] truncate max-w-[110px]" title={item.name}>
                                      {item.name}
                                    </span>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="font-mono font-bold text-[var(--cds-text-01)] text-[10px]">{rawVal || item.value}</span>
                                    <span className="text-[9px] text-[var(--cds-text-03)] ml-1">({item.value}/100)</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    }}
                  />
                  {savedModels.map((model, idx) => (
                    <Radar
                      key={model.id}
                      name={model.name}
                      dataKey={`m_${model.id}`}
                      stroke={modelColors[idx % modelColors.length]}
                      fill={modelColors[idx % modelColors.length]}
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                  ))}
                  <Legend 
                    wrapperStyle={{ fontSize: '9px', paddingTop: '2px' }} 
                    iconSize={7}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="p-6 text-center bg-[var(--cds-layer-02)] rounded-xl border border-[var(--cds-border-subtle)] mb-3">
              <Box className="w-8 h-8 text-[var(--cds-text-03)] mx-auto mb-2 opacity-60" />
              <p className="text-xs font-semibold text-[var(--cds-text-01)]">
                {language === 'ar' ? 'لا توجد نماذج محفوظة للمقارنة بعد' : 'No saved models for comparison yet'}
              </p>
              <p className="text-[11px] text-[var(--cds-text-03)] mt-1 mb-3">
                {language === 'ar' ? 'يمكنك تدريب نماذجك وحفظها أو تحميل النماذج المعيارية الجاهزة للمقارنة الفورية.' : 'Train and save models or click demo to instantly benchmark 4 models.'}
              </p>
              <button 
                onClick={loadBenchmarkSuite} 
                className="px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition-all flex items-center gap-1.5 mx-auto"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {language === 'ar' ? 'تحميل 4 نماذج معيارية في الرادار' : 'Load 4 Benchmark Models in Radar'}
              </button>
            </div>
          )}
          
          {/* Models List */}
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {sortedSavedModels.map((model, idx) => {
              const isBestR2 = model.r2 === bestModelMetrics.bestR2;
              const isBestMSE = model.mse === bestModelMetrics.bestMSE;
              const isFastest = model.trainingTime === bestModelMetrics.fastestTime;
              const isBestGen = model.overfittingIndex === bestModelMetrics.bestGen;

              return (
                <div 
                  key={model.id} 
                  className="p-3 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] hover:border-blue-500/50 rounded-xl text-xs space-y-2 transition-all shadow-2xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 truncate">
                      <span 
                        className="w-2.5 h-2.5 rounded-full shrink-0" 
                        style={{ backgroundColor: modelColors[idx % modelColors.length] }} 
                      />
                      <span className="font-bold text-[var(--cds-text-01)] truncate text-xs" title={model.name}>
                        {model.name}
                      </span>
                    </div>
                    <button 
                      onClick={() => setSavedModels(savedModels.filter(m => m.id !== model.id))}
                      className="text-[var(--cds-text-03)] hover:text-rose-600 p-1 rounded transition-colors"
                      title={language === 'ar' ? 'حذف النموذج' : 'Remove model'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Highlights badges */}
                  {(isBestR2 || isBestMSE || isFastest) && (
                    <div className="flex flex-wrap gap-1">
                      {isBestR2 && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" /> Best R²
                        </span>
                      )}
                      {isBestMSE && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                          Lowest MSE
                        </span>
                      )}
                      {isFastest && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                          Fastest
                        </span>
                      )}
                    </div>
                  )}
                  
                  {/* 4 Metrics Grid: MSE, R², Training Time, Overfitting Index */}
                  <div className="grid grid-cols-4 gap-1 mt-1 text-center">
                    <div className="p-1 rounded bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)]">
                      <div className="text-[8.5px] text-[var(--cds-text-03)]">R²</div>
                      <div className="font-bold text-[10px] text-blue-600 truncate">{model.r2.toFixed(3)}</div>
                    </div>
                    <div className="p-1 rounded bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)]">
                      <div className="text-[8.5px] text-[var(--cds-text-03)]">MSE</div>
                      <div className="font-bold text-[10px] text-purple-600 truncate">{model.mse.toFixed(2)}</div>
                    </div>
                    <div className="p-1 rounded bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)]">
                      <div className="text-[8.5px] text-[var(--cds-text-03)]">{language === 'ar' ? 'الوقت' : 'Time'}</div>
                      <div className="font-bold text-[10px] text-emerald-600 truncate">{model.trainingTime.toFixed(0)}ms</div>
                    </div>
                    <div className="p-1 rounded bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)]">
                      <div className="text-[8.5px] text-[var(--cds-text-03)]">{language === 'ar' ? 'التعميم' : 'Overfit'}</div>
                      <div className="font-bold text-[10px] text-amber-600 truncate">{model.overfittingIndex.toFixed(2)}</div>
                    </div>
                  </div>
                  
                  <div className="text-[9.5px] font-mono text-[var(--cds-text-02)] bg-[var(--cds-layer-01)] p-1.5 rounded border border-[var(--cds-border-subtle)] truncate" title={model.equation}>
                    {model.equation}
                  </div>
                </div>
              );
            })}
          </div>
          
          {savedModels.length > 0 && (
            <div className="mt-3 pt-2.5 border-t border-[var(--cds-border-subtle)] flex items-center justify-between shrink-0">
              <button
                onClick={() => setSavedModels([])}
                className="text-xs text-rose-600 hover:text-rose-700 font-semibold p-1 transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {language === 'ar' ? 'تفريغ القائمة' : 'Clear All'}
              </button>
              <button
                onClick={loadBenchmarkSuite}
                className="text-xs text-blue-600 hover:text-blue-700 font-semibold p-1 transition-colors flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {language === 'ar' ? 'إعادة ضبط المعيار' : 'Reset Suite'}
              </button>
            </div>
          )}
        </div>
      </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 5: INFERENCE & SENSITIVITY ANALYSIS */}
      {/* ========================================================================= */}
      {mainViewMode === 'inference' && (
        <div className="space-y-6">
          {!result || selectedType === 'kmeans' ? (
            <div className="p-12 text-center bg-[var(--cds-layer-01)] rounded-xl border border-[var(--cds-border-subtle)] shadow-sm">
              <Zap className="w-12 h-12 text-[var(--cds-text-03)] mx-auto mb-4" />
              <h3 className="text-base font-bold text-[var(--cds-text-01)]">{language === 'ar' ? 'يتطلب تدريب نموذج الانحدار أولاً' : 'Train a Regression Model First'}</h3>
              <p className="text-xs text-[var(--cds-text-02)] mt-2">
                {language === 'ar' ? 'قم بتدريب نموذج انحدار في استوديو النمذجة لتتمكن من إدخال قيم جديدة وتوقع النتائج.' : 'Fit a regression model in the Studio tab to enable interactive inference and sensitivity analysis.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-[var(--cds-layer-01)] p-6 rounded-xl border border-[var(--cds-border-subtle)] shadow-sm">
                  <h3 className="text-sm font-bold text-[var(--cds-text-01)] flex items-center gap-2 mb-4 border-b border-[var(--cds-border-subtle)] pb-3">
                    <Sliders className="w-4 h-4 text-blue-500" />
                    {language === 'ar' ? 'لوحة التحكم بالمتغيرات (Sensitivity Controls)' : 'Feature Sensitivity Controls'}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    {result.featureNames.map(feat => {
                      const bounds = featureBounds[feat];
                      if (!bounds) return null;
                      const val = inferenceInputs[feat] ?? bounds.default;
                      return (
                        <div key={feat} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-[var(--cds-text-01)]">{feat}</label>
                            <input 
                              type="number" 
                              className="text-xs border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] text-[var(--cds-text-01)] rounded-md p-1 w-20 text-center font-mono"
                              value={val.toFixed(2)}
                              onChange={(e) => setInferenceInputs({ ...inferenceInputs, [feat]: parseFloat(e.target.value) || 0 })}
                            />
                          </div>
                          <input 
                            type="range" 
                            min={bounds.min} 
                            max={bounds.max} 
                            step={bounds.step}
                            value={val}
                            onChange={(e) => setInferenceInputs({ ...inferenceInputs, [feat]: parseFloat(e.target.value) })}
                            className="w-full accent-blue-600"
                          />
                          <div className="flex justify-between text-[9px] text-[var(--cds-text-03)] font-mono">
                            <span>{bounds.min.toFixed(2)}</span>
                            <span>{bounds.max.toFixed(2)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-1 space-y-6">
                <div className="bg-gradient-to-br from-blue-900/90 to-indigo-950/90 p-6 rounded-xl border border-blue-700/50 shadow-lg text-white">
                  <h3 className="text-sm font-bold text-blue-200 flex items-center gap-2 mb-2">
                    <Zap className="w-4 h-4 text-blue-400" />
                    {language === 'ar' ? 'النتيجة المتوقعة (Prediction)' : 'Predicted Target'}
                  </h3>
                  {(() => {
                    const pred = result.predict(result.featureNames.map(f => inferenceInputs[f] || 0));
                    const rmse = result.metrics.rmse || 0;
                    const lowerBound = pred - 1.96 * rmse;
                    const upperBound = pred + 1.96 * rmse;
                    return (
                      <>
                        <div className="text-4xl font-bold font-mono tracking-tight my-3 text-blue-100">
                          {pred.toFixed(4)}
                        </div>
                        {rmse > 0 && (
                          <div className="bg-blue-950/40 p-2.5 rounded-lg border border-blue-800/30 text-[11px] text-blue-200 mt-2 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">{language === 'ar' ? 'نطاق التوقع (95% CI):' : '95% Prediction Interval:'}</span>
                              <span className="font-mono bg-blue-900 px-1.5 py-0.5 rounded border border-blue-700/50 text-[10px] text-blue-100 font-bold">95% CI</span>
                            </div>
                            <div className="font-mono font-bold text-center text-xs text-blue-100 bg-blue-950/60 py-1 rounded">
                              [{lowerBound.toFixed(4)} , {upperBound.toFixed(4)}]
                            </div>
                            <p className="text-[9px] text-blue-300 leading-normal">
                              {language === 'ar' 
                                ? `بناءً على تشتت المتبقيات (RMSE = ${rmse.toFixed(3)})، فإن القيمة الحقيقية ستقع بنسبة 95% داخل هذا المجال.` 
                                : `Based on model residual variance (RMSE = ${rmse.toFixed(3)}), the true value will fall in this range with 95% certainty.`}
                            </p>
                          </div>
                        )}
                      </>
                    );
                  })()}
                  <div className="text-[11px] text-blue-300 border-t border-blue-700/40 pt-3">
                    {language === 'ar' ? 'المتغير التابع: ' : 'Target: '} <span className="font-bold text-white">{result.targetName}</span>
                  </div>
                  <button 
                    onClick={() => {
                      const prediction = result.predict(result.featureNames.map(f => inferenceInputs[f] || 0));
                      setPredictionHistory([{ id: `pred-${Date.now()}`, inputs: { ...inferenceInputs }, prediction }, ...predictionHistory]);
                      addLog(`Saved prediction: ${prediction.toFixed(4)}`);
                    }}
                    className="mt-4 w-full bg-blue-600 hover:bg-blue-500 active:scale-98 text-white font-semibold h-9 px-4 rounded-lg text-xs transition-colors shadow-sm"
                  >
                    {language === 'ar' ? 'حفظ التوقع الحالي' : 'Save Prediction Snapshot'}
                  </button>
                </div>

                <div className="bg-[var(--cds-layer-01)] p-4 rounded-xl border border-[var(--cds-border-subtle)] shadow-sm flex flex-col max-h-[400px]">
                  <h3 className="text-sm font-bold text-[var(--cds-text-01)] flex items-center justify-between border-b border-[var(--cds-border-subtle)] pb-2 mb-3 shrink-0">
                    <span className="flex items-center gap-2"><TableIcon className="w-4 h-4 text-emerald-500" />{language === 'ar' ? 'سجل التوقعات' : 'Prediction Log'}</span>
                    {predictionHistory.length > 0 && (
                      <button onClick={() => {
                        const csvData = predictionHistory.map((p, i) => ({
                          'ID': i + 1,
                          ...p.inputs,
                          [result.targetName]: p.prediction
                        }));
                        const csv = Papa.unparse(csvData);
                        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'predictions_history.csv';
                        a.click();
                        URL.revokeObjectURL(url);
                      }} className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 px-2 py-1 rounded-md font-semibold transition-colors">
                        {language === 'ar' ? 'تصدير CSV' : 'Export CSV'}
                      </button>
                    )}
                  </h3>
                  <div className="overflow-y-auto space-y-2 pr-1 flex-1">
                    {predictionHistory.length === 0 ? (
                      <div className="text-center p-4 text-[var(--cds-text-03)] text-xs">{language === 'ar' ? 'لا توجد توقعات محفوظة.' : 'No saved predictions.'}</div>
                    ) : (
                      predictionHistory.map((pred, i) => (
                        <div key={pred.id} className="p-2.5 border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] rounded-lg text-xs relative group">
                          <button onClick={() => setPredictionHistory(predictionHistory.filter(p => p.id !== pred.id))} className="absolute top-1.5 end-1.5 text-red-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                          <div className="font-bold text-blue-600 dark:text-blue-400 mb-1">{language === 'ar' ? `توقع #${predictionHistory.length - i}:` : `Pred #${predictionHistory.length - i}:`} {pred.prediction.toFixed(4)}</div>
                          <div className="text-[10px] text-[var(--cds-text-02)] grid grid-cols-2 gap-1">
                            {Object.entries(pred.inputs).map(([k, v]) => {
                              const formattedVal = typeof v === 'number' ? v.toFixed(2) : String(v);
                              return (
                                <div key={k} className="truncate" title={`${k}: ${formattedVal}`}>{k}: <span className="font-bold text-[var(--cds-text-01)]">{formattedVal}</span></div>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 2: CORRELATION MATRIX & FEATURE SELECTION */}
      {/* ========================================================================= */}
      {mainViewMode === 'correlation' && (
        <div className="space-y-6">
          {correlationAnalysis ? (
            <>
              {/* Correlation Insights Overview Cards */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Ranking with Target Y */}
                <div className="lg:col-span-2 bg-[var(--cds-layer-01)] p-4 rounded-xl border border-[var(--cds-border-subtle)] shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-[var(--cds-border-subtle)] pb-2">
                    <h3 className="text-sm font-bold text-[var(--cds-text-01)] flex items-center gap-1.5">
                      <Network className="w-4 h-4 text-purple-500" />
                      {language === 'ar' ? `ترتيب المتغيرات حسب قوة الارتباط مع المتغير التابع (${yAxisCol})` : `Feature Ranking by Correlation with Target (${yAxisCol})`}
                    </h3>
                    <button
                      onClick={applyRecommendedFeatures}
                      className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold h-8 px-3 rounded-lg flex items-center gap-1.5 transition-all shadow-xs"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {language === 'ar' ? 'تطبيق المقترح' : 'Apply Selected'}
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {correlationAnalysis.insights.map((ins, idx) => (
                      <div 
                        key={idx} 
                        className={`p-3 rounded-lg border transition-all ${ins.isRecommended ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-[var(--cds-layer-02)] border-[var(--cds-border-subtle)]'}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] flex items-center justify-center text-xs font-bold text-[var(--cds-text-01)]">
                              {idx + 1}
                            </span>
                            <span className="font-semibold text-[var(--cds-text-01)] text-sm">{ins.feature}</span>
                            <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${ins.targetCorrelation >= 0 ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300' : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'}`}>
                              {ins.direction}
                            </span>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className="font-mono text-sm font-bold text-[var(--cds-text-01)]">
                              r = {ins.targetCorrelation >= 0 ? '+' : ''}{ins.targetCorrelation.toFixed(3)}
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                              ins.impactLevel.includes('قوي') || ins.impactLevel.includes('Strong') ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' :
                              ins.impactLevel.includes('متوسط') || ins.impactLevel.includes('Moderate') ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'bg-[var(--cds-layer-03)] text-[var(--cds-text-02)]'
                            }`}>
                              {ins.impactLevel}
                            </span>
                          </div>
                        </div>

                        {/* Correlation Bar */}
                        <div className="mt-2 w-full bg-[var(--cds-layer-03)] rounded-full h-2 overflow-hidden">
                          <div 
                            className={`h-2 rounded-full ${ins.targetCorrelation >= 0 ? 'bg-blue-600' : 'bg-rose-600'}`}
                            style={{ width: `${ins.absCorrelation * 100}%` }}
                          />
                        </div>

                        {/* Collinearity Warning */}
                        {ins.multicollinearityWarnings.length > 0 && (
                          <div className="mt-2 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 p-1.5 rounded border border-amber-500/30 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span>{ins.multicollinearityWarnings[0]}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Multicollinearity & Threshold Config Card */}
                <div className="bg-[var(--cds-layer-01)] p-4 rounded-xl border border-[var(--cds-border-subtle)] shadow-sm space-y-4">
                  <h3 className="text-sm font-bold text-[var(--cds-text-01)] flex items-center gap-1.5 border-b border-[var(--cds-border-subtle)] pb-2">
                    <Gauge className="w-4 h-4 text-blue-500" />
                    {language === 'ar' ? 'معايير الفلترة والارتباط المتعدد' : 'Collinearity & Thresholds'}
                  </h3>

                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium text-[var(--cds-text-02)]">{language === 'ar' ? 'عتبة الارتباط الأدنى (|r|):' : 'Min Correlation (|r|):'}</span>
                        <span className="font-mono font-bold text-blue-600 dark:text-blue-400">{corrThreshold}</span>
                      </div>
                      <input 
                        type="range" 
                        min="0.1" 
                        max="0.8" 
                        step="0.05"
                        value={corrThreshold}
                        onChange={(e) => setCorrThreshold(parseFloat(e.target.value))}
                        className="w-full h-2 bg-[var(--cds-layer-03)] rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <div className="flex justify-between text-[10px] text-[var(--cds-text-03)] mt-0.5">
                        <span>0.10</span>
                        <span>0.50</span>
                        <span>0.80</span>
                      </div>
                    </div>

                    <div className="p-3 bg-[var(--cds-layer-02)] rounded-lg border border-[var(--cds-border-subtle)] text-xs text-[var(--cds-text-02)] space-y-1">
                      <div className="font-bold flex items-center gap-1 text-[var(--cds-text-01)]">
                        <Info className="w-3.5 h-3.5 text-blue-500" />
                        {language === 'ar' ? 'نصيحة إحصائية لاختيار المدخلات:' : 'Statistical Tip:'}
                      </div>
                      <p className="text-[11px] leading-relaxed text-[var(--cds-text-02)]">
                        {language === 'ar' 
                          ? 'المدخلات المثالية للانحدار هي التي تمتلك ارتباطاً عالياً مع الهدف Y، مع ارتباط ضعيف فيما بينها لتجنب التشتت وتضخم التباين.'
                          : 'Ideal predictors correlate strongly with target Y while having weak collinearity among each other.'}
                      </p>
                    </div>

                    {/* Detected Collinear Pairs */}
                    <div>
                      <h4 className="text-xs font-bold text-[var(--cds-text-01)] mb-2">{language === 'ar' ? 'أزواج المتغيرات ذات التكرار العالي (|r| ≥ 0.80):' : 'High Collinearity Pairs (|r| ≥ 0.80):'}</h4>
                      {correlationAnalysis.highMulticollinearityPairs.length > 0 ? (
                        <div className="space-y-1.5 max-h-36 overflow-y-auto">
                          {correlationAnalysis.highMulticollinearityPairs.map((pair, i) => (
                            <div key={i} className="p-2 bg-red-500/10 border border-red-500/25 rounded-md text-xs text-red-600 dark:text-red-400 flex items-center justify-between">
                              <span>{pair.f1} ↔ {pair.f2}</span>
                              <span className="font-mono font-bold">r = {pair.corr.toFixed(3)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-lg text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          <span>{language === 'ar' ? 'لا يوجد تكرار خطي خطير بين المتغيرات (مستوى آمن).' : 'No collinearity anomalies detected (Safe).'}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Correlation Matrix Heatmap */}
              <div className="bg-[var(--cds-layer-01)] p-4 rounded-xl border border-[var(--cds-border-subtle)] shadow-sm">
                <h3 className="text-sm font-bold text-[var(--cds-text-01)] mb-3 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-blue-500" />
                  {language === 'ar' ? 'مصفوفة الارتباط الحرارية التفاعلية (Pearson Correlation Heatmap)' : 'Pearson Correlation Heatmap'}
                </h3>
                <div className="w-full h-[450px]">
                  <Plot
                    data={[{
                      z: correlationAnalysis.matrixResult.matrix,
                      x: correlationAnalysis.matrixResult.columns,
                      y: correlationAnalysis.matrixResult.columns,
                      type: 'heatmap',
                      colorscale: [
                        [0, '#ef4444'], // -1 (Strong Negative: Red)
                        [0.5, '#f8fafc'], // 0 (No Corr: Neutral/White)
                        [1, '#2563eb']  // +1 (Strong Positive: Blue)
                      ],
                      zmin: -1,
                      zmax: 1,
                      hoverongaps: false
                    }]}
                    layout={{
                      title: language === 'ar' ? 'مصفوفة الارتباط الشاملة لجميع المتغيرات' : 'Correlation Matrix Across All Features',
                      margin: { l: 120, r: 40, t: 40, b: 100 },
                      paper_bgcolor: 'transparent',
                      plot_bgcolor: 'transparent',
                      font: { color: isDark ? '#f8fafc' : '#0f172a' },
                      autosize: true,
                      annotations: correlationAnalysis.matrixResult.matrix.flatMap((row, i) =>
                        row.map((val, j) => ({
                          xref: 'x',
                          yref: 'y',
                          x: correlationAnalysis.matrixResult.columns[j],
                          y: correlationAnalysis.matrixResult.columns[i],
                          text: val.toFixed(2),
                          font: {
                            color: Math.abs(val) > 0.6 ? '#ffffff' : (isDark ? '#e2e8f0' : '#1e293b'),
                            size: 11
                          },
                          showarrow: false
                        }))
                      )
                    }}
                    config={{ responsive: true }}
                    style={{ width: '100%', height: '100%' }}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="p-12 text-center bg-[var(--cds-layer-01)] rounded-xl border border-[var(--cds-border-subtle)]">
              <Network className="w-12 h-12 text-[var(--cds-text-03)] mx-auto mb-3" />
              <h3 className="text-base font-bold text-[var(--cds-text-01)]">{language === 'ar' ? 'يرجى تحميل ملف بيانات أولاً' : 'Upload Data to Analyze'}</h3>
              <p className="text-xs text-[var(--cds-text-02)] mt-1 max-w-md mx-auto">
                {language === 'ar' ? 'قم برفع ملف بيانات أو اختيار إحدى العينات التجريبية أعلاه للبدء في حساب مصفوفة الارتباط.' : 'Load a dataset or demo data above to calculate the feature correlation matrix.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 3: PIPELINE (End-to-End Machine Learning Pipeline) */}
      {/* ========================================================================= */}
      {mainViewMode === 'pipeline' && (
        <div className="space-y-6">
          <div className="bg-[var(--cds-layer-01)] p-6 rounded-xl border border-[var(--cds-border-subtle)] shadow-sm space-y-6">
            <div>
              <h3 className="text-base font-bold text-[var(--cds-text-01)] flex items-center gap-2">
                <GitBranch className="w-5 h-5 text-emerald-500" />
                {language === 'ar' ? 'مسار العمل المتكامل (End-to-End Regression Pipeline)' : 'End-to-End Modeling Pipeline'}
              </h3>
              <p className="text-xs text-[var(--cds-text-02)] mt-1">
                {language === 'ar' ? 'تتبع مسار تدفق البيانات خطوة بخطوة من التغذية الخام إلى التدريب واستخراج التابع الرياضي.' : 'Inspect the complete pipeline flow from raw feature selection to model scoring and export.'}
              </p>
            </div>

            {/* Pipeline Flowchart Nodes */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {/* Step 1 */}
              <div className="p-3.5 bg-[var(--cds-layer-02)] rounded-xl border border-[var(--cds-border-subtle)] space-y-2 relative">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-500/15 px-2 py-0.5 rounded-full">Phase 1</span>
                  <CheckCircle2 className="w-4 h-4 text-blue-500" />
                </div>
                <h4 className="text-xs font-bold text-[var(--cds-text-01)]">{language === 'ar' ? '1. تغذية البيانات' : '1. Data Ingestion'}</h4>
                <p className="text-[11px] text-[var(--cds-text-02)]">
                  {isParsed ? `${data.length} ${language === 'ar' ? 'عينة جاهزة' : 'samples ready'}` : 'Pending data.'}
                </p>
              </div>

              {/* Step 2 */}
              <div className="p-3.5 bg-[var(--cds-layer-02)] rounded-xl border border-[var(--cds-border-subtle)] space-y-2 relative">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-500/15 px-2 py-0.5 rounded-full">Phase 2</span>
                  <Sparkles className="w-4 h-4 text-purple-500" />
                </div>
                <h4 className="text-xs font-bold text-[var(--cds-text-01)]">{language === 'ar' ? '2. فلترة الارتباط' : '2. Correlation Filtering'}</h4>
                <p className="text-[11px] text-[var(--cds-text-02)]">
                  {language === 'ar' ? `تم تحديد ${xAxisCols.length} ميزات لـ ${yAxisCol}` : `${xAxisCols.length} features selected`}
                </p>
              </div>

              {/* Step 3 */}
              <div className="p-3.5 bg-[var(--cds-layer-02)] rounded-xl border border-[var(--cds-border-subtle)] space-y-2 relative">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-full">Phase 3</span>
                  <Code2 className="w-4 h-4 text-amber-500" />
                </div>
                <h4 className="text-xs font-bold text-[var(--cds-text-01)]">{language === 'ar' ? '3. هندسة الميزات' : '3. Feature Engineering'}</h4>
                <p className="text-[11px] text-[var(--cds-text-02)]">
                  {selectedType === 'polynomial' 
                    ? `Poly (deg: ${degree})` 
                    : 'Linear (deg: 1)'}
                </p>
              </div>

              {/* Step 4 */}
              <div className="p-3.5 bg-[var(--cds-layer-02)] rounded-xl border border-[var(--cds-border-subtle)] space-y-2 relative">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full">Phase 4</span>
                  <Activity className="w-4 h-4 text-emerald-500" />
                </div>
                <h4 className="text-xs font-bold text-[var(--cds-text-01)]">{language === 'ar' ? '4. التدريب والتقييم' : '4. Model Scoring'}</h4>
                <p className="text-[11px] text-[var(--cds-text-02)]">
                  {result ? `R² = ${result.metrics.r2.toFixed(3)}` : 'Ready.'}
                </p>
              </div>

              {/* Step 5 */}
              <div className="p-3.5 bg-[var(--cds-layer-02)] rounded-xl border border-[var(--cds-border-subtle)] space-y-2 relative">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/15 px-2 py-0.5 rounded-full">Phase 5</span>
                  <Zap className="w-4 h-4 text-indigo-500" />
                </div>
                <h4 className="text-xs font-bold text-[var(--cds-text-01)]">{language === 'ar' ? '5. استخراج المعادلة' : '5. Export Formula'}</h4>
                <p className="text-[11px] text-[var(--cds-text-02)]">
                  {language === 'ar' ? 'توليد كود Python و JS' : 'Python & JS Code Ready'}
                </p>
              </div>
            </div>

            {/* Quick Action Button in Pipeline */}
            <div className="p-4 bg-[var(--cds-layer-02)] rounded-xl border border-[var(--cds-border-subtle)] flex flex-wrap items-center justify-between gap-4">
              <div>
                <h4 className="text-sm font-bold text-[var(--cds-text-01)]">{language === 'ar' ? 'تشغيل مسار المعالجة والتدريب الفوري:' : 'Execute Full Pipeline:'}</h4>
                <p className="text-xs text-[var(--cds-text-02)]">{language === 'ar' ? 'يقوم بتطبيق أفضل إعدادات المدخلات وتدريب النموذج الرياضي مباشرة.' : 'Applies recommended correlation features and fits regression model.'}</p>
              </div>

              <button
                onClick={() => {
                  applyRecommendedFeatures();
                  calculateModel();
                  setMainViewMode('studio');
                }}
                className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold h-9 px-4 rounded-lg text-xs flex items-center gap-2 shadow-sm transition-all"
              >
                <Zap className="w-4 h-4" />
                {language === 'ar' ? 'تشغيل الـ Pipeline وعرض النتائج' : 'Run Pipeline & View Studio'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 4: PREPROCESSING ASSISTANT */}
      {/* ========================================================================= */}
      {mainViewMode === 'preprocessing' && (
        <div className="space-y-6">
          <div className="bg-[var(--cds-layer-01)] p-6 rounded-xl border border-[var(--cds-border-subtle)] shadow-sm space-y-6">
            <div>
              <h3 className="text-base font-bold text-[var(--cds-text-01)] flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-orange-500" />
                {language === 'ar' ? 'مساعد المعالجة المسبقة للبيانات' : 'Data Preprocessing Assistant'}
              </h3>
              <p className="text-xs text-[var(--cds-text-02)] mt-1">
                {language === 'ar' ? 'يحلل البيانات المدخلة ويقترح تلقائياً تحويلات رياضية لتحسين أداء نماذج الانحدار.' : 'Analyzes feature distributions and suggests transformations to improve model fit.'}
              </p>
            </div>

            {preprocessingSuggestions.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {preprocessingSuggestions.map((sug, idx) => (
                  <div key={idx} className="p-4 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] rounded-xl space-y-2">
                    <h4 className="text-sm font-bold text-[var(--cds-text-01)]">{sug.feature}</h4>
                    <div className="flex flex-col gap-1 text-xs">
                      <span className="font-semibold text-orange-600 dark:text-orange-400">{language === 'ar' ? `التحويل المقترح: ${sug.type}` : `Suggested: ${sug.type}`}</span>
                      <span className="text-[var(--cds-text-02)]">{language === 'ar' ? `السبب: ${sug.reason}` : `Reason: ${sug.reason}`}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center bg-[var(--cds-layer-02)] rounded-xl border border-[var(--cds-border-subtle)]">
                <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                <h3 className="text-base font-bold text-[var(--cds-text-01)]">{language === 'ar' ? 'بياناتك تبدو جاهزة ومثالية!' : 'Features Look Clean & Ready!'}</h3>
                <p className="text-xs text-[var(--cds-text-02)] mt-1 max-w-md mx-auto">
                  {language === 'ar' ? 'لم يتم رصد أي مشكلات في التوزيع الإحصائي. يمكنك المتابعة إلى استوديو النمذجة مباشرة.' : 'No distribution anomalies detected. You can proceed directly to model training.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Execution Logs Terminal */}
      <div className="bg-[var(--cds-layer-02)] text-[var(--cds-text-01)] p-3.5 rounded-xl text-xs h-28 overflow-y-auto font-mono border border-[var(--cds-border-subtle)] shadow-inner">
        <h4 className="font-bold text-[var(--cds-text-03)] mb-1 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-blue-500" />
          {language === 'ar' ? 'سجل عمليات النمذجة والتدريب (Execution Log):' : 'Modeling Execution Log:'}
        </h4>
        {logs.map((log, i) => <div key={i} className="leading-5 text-[var(--cds-text-02)]">{log}</div>)}
        {logs.length === 0 && <div className="text-[var(--cds-text-03)]">{language === 'ar' ? 'في انتظار تحميل البيانات أو بدء التدريب...' : 'Awaiting data upload or model computation...'}</div>}
      </div>

      {/* Grid Search Hyperparameter Tuning Modal */}
      <GridSearchModal
        isOpen={isGridSearchOpen}
        onClose={() => setIsGridSearchOpen(false)}
        data={data}
        currentModelType={selectedType}
        currentDegree={degree}
        currentAlpha={alpha}
        currentInteractions={includeInteractions}
        hasMultipleFeatures={xAxisCols.length > 1}
        language={language}
        isDark={isDark}
        onApplyHyperparameters={handleApplyGridSearchParams}
      />
    </div>
  );
});
