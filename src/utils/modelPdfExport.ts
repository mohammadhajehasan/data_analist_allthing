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

  // Create temporary container offscreen
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '-9999px';
  container.style.left = '-9999px';
  container.style.width = '820px';
  container.style.background = '#ffffff';
  container.style.color = '#1e293b';
  container.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", sans-serif';
  container.style.padding = '36px';
  container.style.boxSizing = 'border-box';
  container.style.direction = isAr ? 'rtl' : 'ltr';

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

  container.innerHTML = `
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

    <!-- Section 1: Final Hyperparameters Grid -->
    <div style="margin-bottom: 20px;">
      <h3 style="font-size: 13px; font-weight: 800; color: #0f172a; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.04em;">
        ${isAr ? '1. إعدادات المعاملات الفائقة النهائية (Final Hyperparameters & Architecture)' : '1. Final Hyperparameters & Architecture'}
      </h3>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
        ${hpGridHtml}
      </div>
    </div>

    <!-- Section 2: Mathematical Formulation -->
    <div style="margin-bottom: 20px;">
      <h3 style="font-size: 13px; font-weight: 800; color: #0f172a; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.04em;">
        ${isAr ? '2. الصيغة الرياضية التشغيلية للنموذج (Mathematical Equation)' : '2. Final Mathematical Equation'}
      </h3>
      <div style="background: #f8fafc; border: 1.5px solid #cbd5e1; border-left: 4px solid #2563eb; border-radius: 8px; padding: 12px 16px; font-family: 'Consolas', 'Courier New', monospace; font-size: 12px; color: #0f172a; line-height: 1.6; word-break: break-all;">
        ${data.equation}
      </div>
    </div>

    <!-- Section 3: Performance & Evaluation Metrics -->
    <div style="margin-bottom: 20px;">
      <h3 style="font-size: 13px; font-weight: 800; color: #0f172a; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.04em;">
        ${isAr ? '3. مقاييس جودة الأداء والتعميم (Performance & Diagnostic Metrics)' : '3. Model Performance & Diagnostics'}
      </h3>
      ${metricsRowHtml}
      ${validationSectionHtml}
    </div>

    <!-- Section 4: Feature Importance Ranking -->
    ${
      data.featureImportance && data.featureImportance.length > 0
        ? `
      <div style="margin-bottom: 20px;">
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
        : ''
    }

    <!-- Footer -->
    <div style="border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 24px; display: flex; justify-content: space-between; align-items: center; font-size: 10px; color: #94a3b8;">
      <div>CONFIDENTIAL & OFFICIAL MODEL SPECIFICATION • IBM CLOUD PAK DATA ENGINE</div>
      <div>Page 1 of 1 • System Generated via AI Studio Build</div>
    </div>
  `;

  document.body.appendChild(container);

  try {
    if (onProgress) onProgress(isAr ? 'جاري تحويل التقرير إلى صيغة PDF...' : 'Rendering high-resolution PDF...');

    const canvas = await html2canvas(container, {
      scale: 2.0,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 820,
    });

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const imgWidth = 210; // A4 width mm
    const pageHeight = 297; // A4 height mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    if (imgHeight <= pageHeight) {
      pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight);
    } else {
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
    }

    const cleanModelName = data.modelType.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `Selected_Model_${cleanModelName}_${Date.now()}.pdf`;

    if (onProgress) onProgress(isAr ? 'اكتمل إنشاء التقرير، جاري التحميل...' : 'Downloading PDF...');
    pdf.save(fileName);
  } finally {
    document.body.removeChild(container);
  }
}
