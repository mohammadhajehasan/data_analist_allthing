import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas-pro';

export interface ModelPdfExportData {
  modelType: string;
  modelLabel: string;
  targetName: string;
  featureNames: string[];
  totalSamples: number;
  trainSamples?: number;
  testSamples?: number;
  hyperparameters: {
    degree?: number;
    alpha?: number;
    includeInteractions?: boolean;
    trainSplitRatio?: number;
    splitSeed?: number;
    kFolds?: number;
  };
metrics: {
     r2: number;
     adjustedR2: number;
     rmse: number;
     mse: number;
     mae?: number;
     n?: number;
     p?: number;
     aic?: number;
      bic?: number;
      accuracyGrade?: string;
   };
  splitMetrics?: {
    enabled: boolean;
    trainR2?: number;
    testR2?: number;
    trainRmse?: number;
    testRmse?: number;
    generalizationGap?: number;
    errorInflation?: number;
    diagnosis?: string;
  };
  cvMetrics?: {
    enabled: boolean;
    meanTestR2: number;
    stdTestR2: number;
    meanTestRmse: number;
    overallOofR2: number;
    kFolds: number;
    isCvPredicting?: boolean;
  };
  equation: string;
  coefficients: Array<{
    name: string;
    power?: number;
    coefficient: number;
    importancePercent: number;
  }>;
  featureImportance?: Array<{
    name: string;
    percentage: number;
    beta: number;
    direction: 'positive' | 'negative';
  }>;
  /** التوقعات المستقبلية للنموذج — تُضاف كقسم مستقل مع رسم بياني وملخص تنبؤي */
  forecast?: {
    horizon: number;
    confidence: number;
    history: Array<{ label: string; actual: number }>;
    periods: Array<{ label: string; predicted: number; lower: number; upper: number; changePct: number | null }>;
    nextValue: number;
    nextChangePct: number | null;
    horizonValue: number;
    horizonChangePct: number | null;
    avgStepChangePct: number | null;
    direction: 'up' | 'down' | 'flat';
    reliability: 'high' | 'medium' | 'low';
    rmse: number;
    mape: number | null;
    r2: number;
    peakLabel: string;
    peakValue: number;
    lastActual: number;
    lastLabel: string;
    seasonality: {
      applied: boolean;
      period: number | null;
      strength: number;
      kind?: 'weekly' | 'quarterly' | 'semiannual' | 'monthly' | 'annual' | 'custom' | null;
    };
    extrapolatedPeriods: number;
  };
  language?: 'ar' | 'en';
}

/**
 * Generates and downloads an executive PDF report of the selected model and its hyperparameters
 */
export async function exportSelectedModelToPdf(
  data: ModelPdfExportData,
  onProgress?: (step: string) => void
): Promise<void> {
  const isAr = data.language === 'ar';
  if (onProgress) onProgress(isAr ? 'جاري تجهيز تقرير النموذج...' : 'Preparing model report layout...');

  // A4 is 210×297mm; at 820px wide one page is this tall in CSS pixels.
  const PAGE_WIDTH = 820;
  // Floor, not round: a sheet even a fraction taller than the A4 ratio spills a
  // blank page when the image is placed at its natural height.
  const PAGE_HEIGHT = Math.floor((PAGE_WIDTH * 297) / 210);
  const PAGE_PADDING = 36;
  const PAGE_FOOTER = 30;
  // Usable body height per page: page minus padding and the footer strip.
  const CONTENT_HEIGHT = PAGE_HEIGHT - PAGE_PADDING * 2 - PAGE_FOOTER;
  const SECTION_GAP = 16;
  const PAGE_FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", sans-serif';
  const PAGE_STYLE = [
    'position: fixed',
    'top: -12000px',
    'left: -12000px',
    `width: ${PAGE_WIDTH}px`,
    `height: ${PAGE_HEIGHT}px`,
    'background: #ffffff',
    'color: #1e293b',
    `font-family: ${PAGE_FONT}`,
    'box-sizing: border-box',
    `direction: ${isAr ? 'rtl' : 'ltr'}`,
    // html2canvas falls back to drawing glyph-by-glyph when letter-spacing is not
    // 'normal', which disconnects Arabic letters and reverses their order. The app
    // sets a global letter-spacing on body, so it must be cleared here.
    'letter-spacing: normal',
    'overflow: hidden',
  ].join('; ');

  const exportDate = new Date().toLocaleString(isAr ? 'ar-SA' : 'en-US');
  const reportId = `MOD-${Date.now().toString(36).toUpperCase()}`;

  // Hyperparameters HTML snippet
  const hpItems: Array<{ label: string; value: string }> = [];
  hpItems.push({
    label: isAr ? 'نوع النموذج الإحصائي' : 'Model Architecture',
    value: data.modelLabel,
  });

  if (data.hyperparameters.degree !== undefined) {
    hpItems.push({
      label: isAr ? 'درجة كثير الحدود (Degree)' : 'Polynomial Degree',
      value: `Degree = ${data.hyperparameters.degree}`,
    });
  }

  if (data.hyperparameters.alpha !== undefined) {
    hpItems.push({
      label: isAr ? 'معامل الجزاء (Ridge L2 Alpha)' : 'Regularization Alpha (α)',
      value: `α = ${data.hyperparameters.alpha}`,
    });
  }

  if (data.hyperparameters.includeInteractions !== undefined) {
    hpItems.push({
      label: isAr ? 'متغيرات التفاعل (Interactions)' : 'Interaction Terms',
      value: data.hyperparameters.includeInteractions
        ? isAr
          ? 'مُفعّلة (Active)'
          : 'Enabled'
        : isAr
        ? 'معطّلة'
        : 'Disabled',
    });
  }

  if (data.splitMetrics?.enabled) {
    hpItems.push({
      label: isAr ? 'تقسيم البيانات (Train / Test)' : 'Data Splitting',
      value: `${data.hyperparameters.trainSplitRatio || 70}% ${isAr ? 'تدريب' : 'Train'} / ${100 - (data.hyperparameters.trainSplitRatio || 70)}% ${isAr ? 'اختبار' : 'Test'}`,
    });
    if (data.hyperparameters.splitSeed !== undefined) {
      hpItems.push({
        label: isAr ? 'بذرة التوزيع (Split Seed)' : 'Random Seed',
        value: `#${data.hyperparameters.splitSeed}`,
      });
    }
  }

  if (data.cvMetrics?.enabled) {
    hpItems.push({
      label: isAr ? 'المصادقة التبادلية (K-Fold CV)' : 'Cross-Validation',
      value: `${data.cvMetrics.kFolds}-Fold CV ${data.cvMetrics.isCvPredicting ? (isAr ? '(تنبؤ OOF نشط)' : '(OOF Active)') : ''}`,
    });
  }

  const hpGridHtml = hpItems
    .map(
      (hp) => `
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px;">
      <div style="font-size: 11px; color: #64748b; font-weight: 600;">${hp.label}</div>
      <div style="font-size: 13px; color: #0f172a; font-weight: 700; margin-top: 3px; font-family: monospace;">${hp.value}</div>
    </div>
  `
    )
    .join('');

  // Performance Metrics HTML
  const metricsRowHtml = `
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 10px;">
      <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 11px; color: #1e40af; font-weight: 700;">${isAr ? 'معامل التحديد R²' : 'R-Squared (R²)'}</div>
        <div style="font-size: 20px; font-weight: 900; color: #1d4ed8; font-family: monospace; margin-top: 4px;">${data.metrics.r2.toFixed(4)}</div>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 11px; color: #475569; font-weight: 700;">${isAr ? 'معامل التحديد المعدل' : 'Adjusted R²'}</div>
        <div style="font-size: 20px; font-weight: 900; color: #0f172a; font-family: monospace; margin-top: 4px;">${data.metrics.adjustedR2.toFixed(4)}</div>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 11px; color: #475569; font-weight: 700;">${isAr ? 'جذر متوسط مربع الخطأ' : 'RMSE'}</div>
        <div style="font-size: 20px; font-weight: 900; color: #0f172a; font-family: monospace; margin-top: 4px;">${data.metrics.rmse.toFixed(4)}</div>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; text-align: center;">
        <div style="font-size: 11px; color: #475569; font-weight: 700;">${isAr ? 'متوسط الخطأ المطلق' : 'MAE'}</div>
        <div style="font-size: 20px; font-weight: 900; color: #0f172a; font-family: monospace; margin-top: 4px;">${(data.metrics.mae || 0).toFixed(4)}</div>
      </div>
    </div>
  `;

  // Out-of-sample & CV breakdown if available
  let validationSectionHtml = '';
  if (data.splitMetrics?.enabled) {
    validationSectionHtml += `
      <div style="margin-top: 18px; background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 10px; padding: 14px;">
        <div style="font-size: 13px; font-weight: 800; color: #6b21a8; margin-bottom: 8px;">
          ${isAr ? 'تقييم التعميم خارج العينة (Train vs. Test Evaluation):' : 'Out-of-Sample Generalization Evaluation:'}
        </div>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; text-align: center; font-size: 11px;">
          <div style="background: #ffffff; padding: 8px; border-radius: 6px; border: 1px solid #e9d5ff;">
            <div style="color: #64748b;">${isAr ? 'تدريب (In-Sample R²)' : 'Train R²'}</div>
            <div style="font-size: 15px; font-weight: 800; color: #2563eb; font-family: monospace;">${(data.splitMetrics.trainR2 || 0).toFixed(4)}</div>
          </div>
          <div style="background: #ffffff; padding: 8px; border-radius: 6px; border: 1px solid #e9d5ff;">
            <div style="color: #64748b;">${isAr ? 'اختبار (Out-of-Sample R²)' : 'Test R²'}</div>
            <div style="font-size: 15px; font-weight: 800; color: #059669; font-family: monospace;">${(data.splitMetrics.testR2 || 0).toFixed(4)}</div>
          </div>
          <div style="background: #ffffff; padding: 8px; border-radius: 6px; border: 1px solid #e9d5ff;">
            <div style="color: #64748b;">${isAr ? 'فجوة التعميم (Gap)' : 'Generalization Gap'}</div>
            <div style="font-size: 15px; font-weight: 800; color: #7c3aed; font-family: monospace;">${(data.splitMetrics.generalizationGap || 0).toFixed(4)}</div>
          </div>
          <div style="background: #ffffff; padding: 8px; border-radius: 6px; border: 1px solid #e9d5ff;">
            <div style="color: #64748b;">${isAr ? 'تشخيص النموذج' : 'Diagnosis'}</div>
            <div style="font-size: 12px; font-weight: 700; color: #0f172a; margin-top: 2px;">${data.splitMetrics.diagnosis || (isAr ? 'متوازن ومستقر' : 'Balanced')}</div>
          </div>
        </div>
      </div>
    `;
  }

  if (data.cvMetrics?.enabled) {
    validationSectionHtml += `
      <div style="margin-top: 14px; background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 10px; padding: 14px;">
        <div style="font-size: 13px; font-weight: 800; color: #0f766e; margin-bottom: 8px;">
          ${isAr ? `نتائج المصادقة التبادلية (${data.cvMetrics.kFolds}-Fold Cross-Validation):` : `${data.cvMetrics.kFolds}-Fold Cross-Validation Results:`}
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; text-align: center; font-size: 11px;">
          <div style="background: #ffffff; padding: 8px; border-radius: 6px; border: 1px solid #99f6e4;">
            <div style="color: #64748b;">${isAr ? 'متوسط درجة التحقق (CV Mean R²)' : 'Mean CV R²'}</div>
            <div style="font-size: 16px; font-weight: 800; color: #0d9488; font-family: monospace;">${data.cvMetrics.meanTestR2.toFixed(4)}</div>
            <div style="font-size: 10px; color: #64748b;">± ${data.cvMetrics.stdTestR2.toFixed(4)}</div>
          </div>
          <div style="background: #ffffff; padding: 8px; border-radius: 6px; border: 1px solid #99f6e4;">
            <div style="color: #64748b;">${isAr ? 'دقة خارج العينة (OOF R²)' : 'Out-of-Fold R²'}</div>
            <div style="font-size: 16px; font-weight: 800; color: #4338ca; font-family: monospace;">${data.cvMetrics.overallOofR2.toFixed(4)}</div>
          </div>
          <div style="background: #ffffff; padding: 8px; border-radius: 6px; border: 1px solid #99f6e4;">
            <div style="color: #64748b;">${isAr ? 'متوسط خطأ التحقق (CV RMSE)' : 'Mean CV RMSE'}</div>
            <div style="font-size: 16px; font-weight: 800; color: #0f172a; font-family: monospace;">${data.cvMetrics.meanTestRmse.toFixed(4)}</div>
          </div>
        </div>
      </div>
    `;
  }

  // Feature Importance Table
  const featImportanceRows = (data.featureImportance || [])
    .map(
      (feat, idx) => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 8px 10px; font-weight: bold; color: #64748b; font-family: monospace;">#${idx + 1}</td>
        <td style="padding: 8px 10px; font-weight: 700; color: #0f172a; font-family: monospace;">${feat.name}</td>
        <td style="padding: 8px 10px; text-align: center;">
          <span style="font-size: 11px; padding: 2px 8px; border-radius: 9999px; font-weight: 700; background: ${
            feat.direction === 'positive' ? '#ecfdf5' : '#fff1f2'
          }; color: ${feat.direction === 'positive' ? '#059669' : '#e11d48'};">
            ${feat.direction === 'positive' ? (isAr ? 'طردي (+)' : 'Positive (+)') : (isAr ? 'عكسي (-)' : 'Negative (-)')}
          </span>
        </td>
        <td style="padding: 8px 10px; text-align: right; font-family: monospace; font-weight: 600;">${feat.beta > 0 ? '+' : ''}${feat.beta.toFixed(4)}</td>
        <td style="padding: 8px 10px; text-align: right; font-family: monospace; font-weight: 800; color: #2563eb;">${feat.percentage.toFixed(1)}%</td>
      </tr>
    `
    )
    .join('');

  // ---------------------------------------------------------------------------
  // قسم التوقعات المستقبلية: رسم SVG (تاريخي + توقع + نطاق ثقة) + ملخص تنبؤي
  // ---------------------------------------------------------------------------
  const forecastData = data.forecast;
  const forecastHtml = (() => {
    if (!forecastData || forecastData.periods.length === 0) return '';

    const fmt = (value: number): string => {
      if (!Number.isFinite(value)) return '—';
      const abs = Math.abs(value);
      return value.toLocaleString('en-US', {
        maximumFractionDigits: abs >= 1000 ? 0 : abs >= 10 ? 2 : 4,
      });
    };
    const pct = (value: number | null): string =>
      value === null || !Number.isFinite(value) ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

    const historyTail = forecastData.history.slice(-Math.max(6, Math.min(forecastData.history.length, 24)));
    const labels = [...historyTail.map(point => point.label), ...forecastData.periods.map(point => point.label)];
    const values = [
      ...historyTail.map(point => point.actual),
      ...forecastData.periods.flatMap(point => [point.predicted, point.lower, point.upper]),
    ];
    let minValue = Math.min(...values);
    let maxValue = Math.max(...values);
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue) || minValue === maxValue) {
      minValue = 0;
      maxValue = (Number.isFinite(maxValue) ? maxValue : 1) + 1;
    }
    const spanPad = (maxValue - minValue) * 0.1;
    minValue -= spanPad;
    maxValue += spanPad;

    const chartW = 744;
    const chartH = 248;
    const padL = 46;
    const padR = 12;
    const padT = 14;
    const padB = 30;
    const plotW = chartW - padL - padR;
    const plotH = chartH - padT - padB;
    const xAt = (index: number) => padL + (labels.length <= 1 ? 0 : (index / (labels.length - 1)) * plotW);
    const yAt = (value: number) => padT + (1 - (value - minValue) / (maxValue - minValue)) * plotH;

    const historyCount = historyTail.length;
    const actualPath = historyTail
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${xAt(index).toFixed(1)},${yAt(point.actual).toFixed(1)}`)
      .join(' ');
    const forecastPath = [
      `M${xAt(historyCount - 1).toFixed(1)},${yAt(historyTail[historyCount - 1].actual).toFixed(1)}`,
      ...forecastData.periods.map((point, index) => `L${xAt(historyCount + index).toFixed(1)},${yAt(point.predicted).toFixed(1)}`),
    ].join(' ');
    const upperPoints = forecastData.periods.map(
      (point, index) => `${xAt(historyCount + index).toFixed(1)},${yAt(point.upper).toFixed(1)}`
    );
    const lowerPoints = forecastData.periods
      .map((point, index) => `${xAt(historyCount + index).toFixed(1)},${yAt(point.lower).toFixed(1)}`)
      .reverse();
    const bandPolygon = [
      `${xAt(historyCount - 1).toFixed(1)},${yAt(historyTail[historyCount - 1].actual).toFixed(1)}`,
      ...upperPoints,
      ...lowerPoints,
    ].join(' ');

    const gridLines = [0, 0.25, 0.5, 0.75, 1]
      .map(fraction => {
        const value = maxValue - fraction * (maxValue - minValue);
        const yPos = padT + fraction * plotH;
        return `<line x1="${padL}" y1="${yPos.toFixed(1)}" x2="${padL + plotW}" y2="${yPos.toFixed(1)}" stroke="#e2e8f0" stroke-width="1" />
          <text x="${padL - 6}" y="${(yPos + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#94a3b8" font-family="monospace">${fmt(value)}</text>`;
      })
      .join('');

    const tickIndexes = Array.from(
      new Set([0, Math.floor((labels.length - 1) / 3), Math.floor((2 * (labels.length - 1)) / 3), labels.length - 1])
    );
    const xLabels = tickIndexes
      .map(index => {
        // Keep the edge labels inside the canvas (the last one used to be clipped).
        const anchor = index === 0 ? 'start' : index === labels.length - 1 ? 'end' : 'middle';
        return `<text x="${xAt(index).toFixed(1)}" y="${chartH - 8}" text-anchor="${anchor}" font-size="9" fill="#64748b" font-family="monospace">${labels[index]}</text>`;
      })
      .join('');
    const forecastDots = forecastData.periods
      .map((point, index) => `<circle cx="${xAt(historyCount + index).toFixed(1)}" cy="${yAt(point.predicted).toFixed(1)}" r="2.6" fill="#f59e0b" />`)
      .join('');
    const splitX = xAt(historyCount - 1).toFixed(1);

    const directionLabel = forecastData.direction === 'up'
      ? (isAr ? 'صاعد' : 'Rising')
      : forecastData.direction === 'down'
        ? (isAr ? 'هابط' : 'Falling')
        : (isAr ? 'مستقر' : 'Flat');
    const reliabilityLabel = forecastData.reliability === 'high'
      ? (isAr ? 'عالية' : 'High')
      : forecastData.reliability === 'medium'
        ? (isAr ? 'متوسطة' : 'Medium')
        : (isAr ? 'منخفضة' : 'Low');
    const reliabilityColor = forecastData.reliability === 'high' ? '#059669' : forecastData.reliability === 'medium' ? '#b45309' : '#e11d48';

    const kpiCard = (label: string, value: string, note: string, accent: string) => `
      <div style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; background: #ffffff;">
        <div style="font-size: 9px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; color: #64748b;">${label}</div>
        <div style="font-size: 17px; font-weight: 900; color: ${accent}; font-family: monospace; margin-top: 2px;">${value}</div>
        <div style="font-size: 10px; color: #64748b; margin-top: 2px;">${note}</div>
      </div>`;

    const tableRows = forecastData.periods
      .slice(0, 8)
      .map((point, index) => `
        <tr style="border-bottom: 1px solid #eef2f7;">
          <td style="padding: 6px 8px; text-align: center; color: #94a3b8; font-family: monospace;">${index + 1}</td>
          <td style="padding: 6px 8px; font-weight: 700; color: #0f172a;">${point.label}</td>
          <td style="padding: 6px 8px; text-align: right; font-family: monospace; font-weight: 800; color: #b45309;">${fmt(point.predicted)}</td>
          <td style="padding: 6px 8px; text-align: right; font-family: monospace; color: #475569;">${fmt(point.lower)}</td>
          <td style="padding: 6px 8px; text-align: right; font-family: monospace; color: #475569;">${fmt(point.upper)}</td>
          <td style="padding: 6px 8px; text-align: right; font-family: monospace; font-weight: 700; color: ${(point.changePct ?? 0) >= 0 ? '#059669' : '#e11d48'};">${pct(point.changePct)}</td>
        </tr>`)
      .join('');

    const notes: string[] = [];
    const kindNames: Record<string, { ar: string; en: string }> = {
      weekly: { ar: 'أسبوعية', en: 'weekly' },
      quarterly: { ar: 'ربع سنوية', en: 'quarterly' },
      semiannual: { ar: 'نصف سنوية', en: 'semi-annual' },
      monthly: { ar: 'شهرية', en: 'monthly' },
      annual: { ar: 'سنوية', en: 'annual' },
      custom: { ar: 'دورة مخصصة', en: 'custom' },
    };
    const kindName = forecastData.seasonality.kind ? kindNames[forecastData.seasonality.kind] : undefined;
    if (forecastData.seasonality.applied && forecastData.seasonality.period) {
      notes.push(
        isAr
          ? `تم دمج موسمية ${kindName ? `${kindName.ar} ` : ''}دورتها ${forecastData.seasonality.period} فترة بقوة ${Math.round(forecastData.seasonality.strength * 100)}% في هذه التوقعات.`
          : `A ${kindName ? `${kindName.en} ` : ''}seasonal component of ${forecastData.seasonality.period} periods (strength ${Math.round(forecastData.seasonality.strength * 100)}%) was added to this forecast.`
      );
    }
    if (forecastData.extrapolatedPeriods > 0) {
      notes.push(
        isAr
          ? `${forecastData.extrapolatedPeriods} فترة متوقعة تقع خارج نطاق بيانات التدريب — اعتبرها استشرافية.`
          : `${forecastData.extrapolatedPeriods} forecast periods fall outside the training range — treat them as extrapolative.`
      );
    }

    return `
    <!-- Section 5: Future Forecast & Predictive Summary -->
    <div style="margin-bottom: 20px; page-break-inside: avoid;">
      <h3 style="font-size: 13px; font-weight: 800; color: #0f172a; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.04em;">
        ${isAr ? `5. التوقعات المستقبلية للنموذج (${forecastData.horizon} فترة قادمة)` : `5. Future Forecast (Next ${forecastData.horizon} Periods)`}
      </h3>

      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10px;">
        ${kpiCard(
          isAr ? `التوقع القادم (${forecastData.periods[0].label})` : `Next (${forecastData.periods[0].label})`,
          fmt(forecastData.nextValue),
          `${pct(forecastData.nextChangePct)} ${isAr ? 'مقارنةً بالفعلي' : 'vs actual'}`,
          '#b45309'
        )}
        ${kpiCard(
          isAr ? `نهاية الأفق (${forecastData.periods[forecastData.periods.length - 1].label})` : `Horizon End (${forecastData.periods[forecastData.periods.length - 1].label})`,
          fmt(forecastData.horizonValue),
          `${isAr ? 'إجمالي التغير' : 'Total change'} ${pct(forecastData.horizonChangePct)}`,
          '#0f172a'
        )}
        ${kpiCard(
          isAr ? 'الاتجاه ومتوسط النمو' : 'Trend & Avg Growth',
          directionLabel,
          `${pct(forecastData.avgStepChangePct)} ${isAr ? 'لكل فترة' : 'per period'}`,
          '#1d4ed8'
        )}
        ${kpiCard(
          isAr ? 'موثوقية التوقع' : 'Forecast Reliability',
          reliabilityLabel,
          `R² ${forecastData.r2.toFixed(3)} · MAPE ${forecastData.mape === null ? '—' : `${forecastData.mape.toFixed(1)}%`} · RMSE ${fmt(forecastData.rmse)}`,
          reliabilityColor
        )}
      </div>

      <div style="border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; padding: 6px;" dir="ltr">
        <svg width="100%" height="248" viewBox="0 0 ${chartW} ${chartH}" xmlns="http://www.w3.org/2000/svg" role="img">
          ${gridLines}
          <polygon points="${bandPolygon}" fill="rgba(245, 158, 11, 0.18)" stroke="none" />
          <line x1="${splitX}" y1="${padT}" x2="${splitX}" y2="${padT + plotH}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4 3" />
          <path d="${actualPath}" fill="none" stroke="#2563eb" stroke-width="2" />
          <path d="${forecastPath}" fill="none" stroke="#f59e0b" stroke-width="2.4" stroke-linejoin="round" />
          ${forecastDots}
          ${xLabels}
          <line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="#cbd5e1" stroke-width="1" />
        </svg>
      </div>

      <div style="display: flex; gap: 14px; font-size: 9.5px; color: #64748b; margin: 6px 0 10px 0;">
        <span><span style="display:inline-block;width:14px;height:2px;background:#2563eb;vertical-align:middle;margin-inline-end:4px"></span>${isAr ? 'القيم الفعلية' : 'Actual'}</span>
        <span><span style="display:inline-block;width:14px;height:2px;background:#f59e0b;vertical-align:middle;margin-inline-end:4px"></span>${isAr ? 'التوقع المستقبلي' : 'Forecast'}</span>
        <span><span style="display:inline-block;width:14px;height:9px;background:rgba(245,158,11,0.25);border:1px solid rgba(245,158,11,0.5);vertical-align:middle;margin-inline-end:4px"></span>${Math.round(forecastData.confidence * 100)}% ${isAr ? 'نطاق الثقة' : 'interval'}</span>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 11px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <thead>
          <tr style="background: #f8fafc; color: #475569; font-weight: 700; border-bottom: 1.5px solid #cbd5e1;">
            <th style="padding: 6px 8px; text-align: center; width: 34px;">#</th>
            <th style="padding: 6px 8px; text-align: ${isAr ? 'right' : 'left'};">${isAr ? 'الفترة' : 'Period'}</th>
            <th style="padding: 6px 8px; text-align: right;">${isAr ? 'القيمة المتوقعة' : 'Forecast'}</th>
            <th style="padding: 6px 8px; text-align: right;">${isAr ? 'الحد الأدنى' : 'Lower'}</th>
            <th style="padding: 6px 8px; text-align: right;">${isAr ? 'الحد الأعلى' : 'Upper'}</th>
            <th style="padding: 6px 8px; text-align: right;">${isAr ? 'التغير %' : 'Change %'}</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>

      <div style="font-size: 10px; color: #475569; line-height: 1.7; margin-top: 8px;">
        <div>
          ${isAr
            ? `يتوقع النموذج أن يبلغ ${data.targetName} حوالي ${fmt(forecastData.nextValue)} في ${forecastData.periods[0].label}، ويصل إلى ${fmt(forecastData.horizonValue)} بعد ${forecastData.horizon} فترات (إجمالي ${pct(forecastData.horizonChangePct)})، وأعلى نقطة ${fmt(forecastData.peakValue)} في ${forecastData.peakLabel}.`
            : `The model projects ${data.targetName} at about ${fmt(forecastData.nextValue)} in ${forecastData.periods[0].label}, reaching ${fmt(forecastData.horizonValue)} after ${forecastData.horizon} periods (total ${pct(forecastData.horizonChangePct)}), with a peak of ${fmt(forecastData.peakValue)} in ${forecastData.peakLabel}.`}
        </div>
        ${notes.map(note => `<div style="color: #b45309;">• ${note}</div>`).join('')}
      </div>
    </div>
    `;
  })();

  const headerHtml = `
    <!-- Header Banner -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2.5px solid #2563eb; padding-bottom: 16px; margin-bottom: 20px;">
      <div>
        <div style="font-size: 10px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #2563eb;">
          IBM Cloud Pak • AI Modeling Studio
        </div>
        <h1 style="font-size: 22px; font-weight: 900; color: #0f172a; margin: 4px 0 2px 0;">
          ${isAr ? 'تقرير توثيق النموذج الإحصائي المختار' : 'Selected Model Specification & Hyperparameters Report'}
        </h1>
        <div style="font-size: 12px; color: #64748b;">
          ${isAr ? 'المتغير المستهدف (Y):' : 'Target:'} <strong style="color: #0f172a;">${data.targetName}</strong> | 
          ${isAr ? 'المتغيرات المستقلة (X):' : 'Predictors:'} <strong style="color: #0f172a;">${data.featureNames.join(', ')}</strong> | 
          ${isAr ? 'إجمالي العينات:' : 'Samples:'} <strong style="color: #0f172a;">${data.totalSamples}</strong>
        </div>
      </div>
      <div style="text-align: ${isAr ? 'left' : 'right'}; font-size: 11px; color: #64748b;">
        <div><strong>Report ID:</strong> <span style="font-family: monospace;">${reportId}</span></div>
        <div><strong>Date:</strong> ${exportDate}</div>
        <div style="margin-top: 4px;">
          <span style="background: #2563eb; color: #ffffff; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700;">
            ${data.modelLabel}
          </span>
        </div>
      </div>
    </div>
  `;

  const section1Html = `
    <!-- Section 1: Final Hyperparameters Grid -->
    <div>
      <h3 style="font-size: 13px; font-weight: 800; color: #0f172a; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.04em;">
        ${isAr ? '1. إعدادات المعاملات الفائقة النهائية (Final Hyperparameters & Architecture)' : '1. Final Hyperparameters & Architecture'}
      </h3>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
        ${hpGridHtml}
      </div>
    </div>
  `;

  const section2Html = `
    <!-- Section 2: Mathematical Formulation -->
    <div>
      <h3 style="font-size: 13px; font-weight: 800; color: #0f172a; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.04em;">
        ${isAr ? '2. الصيغة الرياضية التشغيلية للنموذج (Mathematical Equation)' : '2. Final Mathematical Equation'}
      </h3>
      <div style="background: #f8fafc; border: 1.5px solid #cbd5e1; border-left: 4px solid #2563eb; border-radius: 8px; padding: 12px 16px; font-family: 'Consolas', 'Courier New', monospace; font-size: 12px; color: #0f172a; line-height: 1.6; word-break: break-all;">
        ${data.equation}
      </div>
    </div>
  `;

  const section3Html = `
    <!-- Section 3: Performance & Evaluation Metrics -->
    <div>
      <h3 style="font-size: 13px; font-weight: 800; color: #0f172a; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.04em;">
        ${isAr ? '3. مقاييس جودة الأداء والتعميم (Performance & Diagnostic Metrics)' : '3. Model Performance & Diagnostics'}
      </h3>
      ${metricsRowHtml}
      ${validationSectionHtml}
    </div>

  `;

  // Section 4: Feature Importance Ranking
  const importanceHtml =
    data.featureImportance && data.featureImportance.length > 0
      ? `
      <div>
        <h3 style="font-size: 13px; font-weight: 800; color: #0f172a; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.04em;">
          ${isAr ? '4. ترتيب أهمية الميزات المستقلة (Standardized Feature Importance Ranking)' : '4. Feature Importance Rankings'}
        </h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <thead>
            <tr style="background: #f8fafc; color: #475569; font-weight: 700; border-bottom: 1.5px solid #cbd5e1;">
              <th style="padding: 8px 10px; text-align: ${isAr ? 'right' : 'left'}; width: 40px;">#</th>
              <th style="padding: 8px 10px; text-align: ${isAr ? 'right' : 'left'};">${isAr ? 'المتغير المستقل' : 'Feature'}</th>
              <th style="padding: 8px 10px; text-align: center;">${isAr ? 'اتجاه التأثير' : 'Impact Direction'}</th>
              <th style="padding: 8px 10px; text-align: right;">${isAr ? 'المعامل المعياري (Std. Beta)' : 'Std. Beta (β*)'}</th>
              <th style="padding: 8px 10px; text-align: right;">${isAr ? 'نسبة التأثير الإجمالي' : 'Impact Share'}</th>
            </tr>
          </thead>
          <tbody>
            ${featImportanceRows}
          </tbody>
        </table>
      </div>
    `
      : '';

  // ---------------------------------------------------------------------------
  // Pagination happens before any rasterisation: each A4 sheet is captured on
  // its own, so the canvas stays small (the old single tall canvas hung the tab)
  // and no table or chart is split across a page boundary.
  // ---------------------------------------------------------------------------
  const sectionList = [
    headerHtml,
    section1Html,
    section2Html,
    section3Html,
    importanceHtml,
    forecastHtml,
  ].filter(html => html.trim().length > 0);

  const measurer = document.createElement('div');
  measurer.setAttribute(
    'style',
    [
      'position: fixed',
      'top: -12000px',
      'left: -12000px',
      `width: ${PAGE_WIDTH - PAGE_PADDING * 2}px`,
      `font-family: ${PAGE_FONT}`,
      'color: #1e293b',
      'box-sizing: border-box',
      `direction: ${isAr ? 'rtl' : 'ltr'}`,
      'letter-spacing: normal',
    ].join('; ')
  );
  document.body.appendChild(measurer);
  let measuredSections: Array<{ html: string; height: number }> = [];
  try {
    measuredSections = sectionList.map(html => {
      measurer.innerHTML = html;
      return { html, height: measurer.scrollHeight };
    });
  } finally {
    document.body.removeChild(measurer);
  }

  // Greedy packing: a section that does not fit on the current sheet starts the
  // next one whole; a section taller than a sheet gets a sheet of its own.
  const pages: Array<{ body: string; height: number }> = [];
  let bucket: string[] = [];
  let used = 0;
  const flushPage = () => {
    if (bucket.length === 0) return;
    pages.push({ body: bucket.join(`<div style="height: ${SECTION_GAP}px"></div>`), height: PAGE_HEIGHT });
    bucket = [];
    used = 0;
  };
  for (const section of measuredSections) {
    if (section.height > CONTENT_HEIGHT) {
      flushPage();
      pages.push({ body: section.html, height: PAGE_PADDING * 2 + PAGE_FOOTER + section.height });
      continue;
    }
    if (used + section.height + (bucket.length > 0 ? SECTION_GAP : 0) > CONTENT_HEIGHT) flushPage();
    used += section.height + (bucket.length > 0 ? SECTION_GAP : 0);
    bucket.push(section.html);
  }
  flushPage();

  const pageMarkup = (body: string, index: number): string => `
    <div style="padding: ${PAGE_PADDING}px ${PAGE_PADDING}px ${PAGE_FOOTER + 12}px; box-sizing: border-box;">
      ${body}
    </div>
    <div style="position: absolute; left: ${PAGE_PADDING}px; right: ${PAGE_PADDING}px; bottom: 12px; border-top: 1px solid #e2e8f0; padding-top: 6px; display: flex; justify-content: space-between; align-items: center; font-size: 9px; color: #94a3b8;">
      <div>CONFIDENTIAL &amp; OFFICIAL MODEL SPECIFICATION • IBM CLOUD PAK DATA ENGINE</div>
      <div>${isAr ? `صفحة ${index} من ${pages.length}` : `Page ${index} of ${pages.length}`} • AI Studio Build</div>
    </div>
  `;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pdfWidth = 210; // A4 width mm
  const pdfPageHeight = 297; // A4 height mm

  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i];
    if (onProgress) {
      onProgress(
        isAr
          ? `جاري تصيير الصفحة ${i + 1} من ${pages.length}...`
          : `Rendering page ${i + 1} of ${pages.length}...`
      );
    }

    // One sheet at a time: the node is detached again before the next one is
    // built, so the browser never holds a full-report layout or a huge canvas.
    const pageNode = document.createElement('div');
    pageNode.setAttribute('style', `${PAGE_STYLE}; height: ${page.height}px`);
    pageNode.innerHTML = pageMarkup(page.body, i + 1);

    // Neutralise letter-spacing on every node (inline styles included): the app
    // applies a global -0.01em that html2canvas turns into per-glyph drawing,
    // which breaks Arabic shaping and order.
    pageNode.querySelectorAll<HTMLElement>('*').forEach(node => {
      node.style.letterSpacing = 'normal';
    });

    document.body.appendChild(pageNode);
    try {
      // Yield so the browser can paint the progress text and lay the sheet out
      // before the blocking rasterisation starts.
      await new Promise(resolve => setTimeout(resolve, 24));

      const canvas = await html2canvas(pageNode, {
        scale: 2.0,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        windowWidth: PAGE_WIDTH,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;

      if (i > 0) pdf.addPage();
      // 0.5mm tolerance absorbs pixel rounding so a full sheet stays one page.
      if (imgHeight <= pdfPageHeight + 0.5) {
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, Math.min(imgHeight, pdfPageHeight));
      } else {
        // Only for a single section taller than one sheet: slice it, because it
        // cannot be broken at a section boundary.
        let heightLeft = imgHeight;
        let position = 0;
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
        heightLeft -= pdfPageHeight;
        while (heightLeft > 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, imgHeight);
          heightLeft -= pdfPageHeight;
        }
      }
    } finally {
      document.body.removeChild(pageNode);
    }
  }

  const cleanModelName = data.modelType.replace(/[^a-zA-Z0-9]/g, '_');
  const fileName = `Selected_Model_${cleanModelName}_${Date.now()}.pdf`;

  if (onProgress) onProgress(isAr ? 'اكتمل إنشاء التقرير، جاري التحميل...' : 'Downloading PDF...');
  pdf.save(fileName);
}
