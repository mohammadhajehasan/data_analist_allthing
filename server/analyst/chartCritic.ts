/**
 * #10 — ناقد المخططات: كشف التمثيل المضلِّل قبل أن يراه مديرك.
 *
 * لماذا: «الذوق التحليلي» يُلاحَظ فورًا. محور مقلوب أو أساس مقطوع عند غير
 * الصفر يقلب رسالة الرسم، ولو كان الرقم صحيحًا. المراجعة الآلية تُمسك هذه
 * الأخطاء بصمت وتقترح بديلًا أفضل — قيمة عالية بتكلفة زهيدة جدًا.
 */

export type ChartType = 'line' | 'bar' | 'pie' | 'donut' | 'scatter' | 'area' | 'map' | 'table' | 'histogram';

export interface ChartSeries {
  name: string;
  values: number[];
  /** وحدة القياس (ريال، نسبة، عدد…) لكشف خلط الوحدات. */
  unit?: string;
  /** نوع المحور: أساسي أم ثانوي. */
  axis?: 'primary' | 'secondary';
}

export interface ChartSpec {
  type: ChartType;
  title?: string;
  series: ChartSeries[];
  categories: string[];
  yAxis?: {
    /** أدنى قيمة معروضة. */
    min?: number;
    max?: number;
    /** هل المحور يبدأ من صفر فعلًا. */
    startsAtZero?: boolean;
    inverted?: boolean;
    logScale?: boolean;
  };
  /** عدد شرائح الدائري. */
  slices?: number;
  /** للتشتّت: هل حجم النقطة يمثّل قيمة (مقياس مزدوج). */
  bubbleSizing?: boolean;
  /** هل الألوان متعامدة مع القيمة في خريطة. */
  colorScaleSequential?: boolean;
}

export interface ChartFinding {
  id: string;
  severity: 'high' | 'medium' | 'low';
  issue: string;
  why: string;
  fix: string;
}

export interface ChartVerdict {
  score: number; // 0..100
  findings: ChartFinding[];
  summary: string;
  /** تمثيل بديل مُقترح. */
  suggestion: { type: ChartType; reason: string } | null;
}

function magnitude(values: number[]): number {
  const max = Math.max(...values.map((v) => Math.abs(v)).filter(Number.isFinite), 0);
  return max;
}

/** تقييم مخطط وفق قواعد التمثيل الصادق (Cleveland/Munzner/Tufte عمليًّا). */
export function critiqueChart(spec: ChartSpec): ChartVerdict {
  const findings: ChartFinding[] = [];
  const allValues = spec.series.flatMap((s) => s.values);
  const hasNegative = allValues.some((v) => v < 0);

  if (spec.series.length > 1) {
    const units = new Set(spec.series.map((s) => (s.unit || '').trim()).filter(Boolean));
    if (units.size > 1) {
      findings.push({
        id: 'mixed-units',
        severity: 'high',
        issue: 'سلاسل بوحدات مختلفة على نفس المخطط',
        why: 'الجمع بين «ريال» و«عدد» على محور واحد يجعل التقاطع بلا معنى، ويُوهم بعلاقة غير موجودة.',
        fix: 'افصل إلى مخططين، أو استخدم مؤشّرًا نسبيًّا (فهرس = 100) لا القيم الخام.',
      });
    }
    const secondary = spec.series.filter((s) => s.axis === 'secondary');
    if (secondary.length) {
      findings.push({
        id: 'dual-axis',
        severity: 'high',
        issue: 'محوران للقيم (Dual axis)',
        why: 'اختيار نطاق المحور الثاني يحدّد شكل التقاطع: يمكن جعل أي خطّين «يتقاطعان» بتغيير المدى — الرسم يخترع علاقة.',
        fix: 'ارسم السلسلتين في لوحتين متراكبتين (small multiples) بنفس المقياس النسبي.',
      });
    }
  }

  if (spec.type === 'pie' || spec.type === 'donut') {
    const slices = spec.slices ?? spec.categories.length;
    if (slices > 5) {
      findings.push({
        id: 'pie-too-many',
        severity: 'medium',
        issue: `دائري بـ${slices} شرائح`,
        why: 'الإنسان لا يقارن الزوايا بدقة؛ فوق 5 شرائح يصبح ترتيب الشرائح تخمينًا.',
        fix: 'استخدم أعمدة أفقية مرتّبة (Bar) — المقارنة بالطول أدقّ بكثير.',
      });
    }
    if (spec.series.length > 1) {
      findings.push({
        id: 'pie-multi-series',
        severity: 'high',
        issue: 'دائري بأكثر من سلسلة',
        why: 'الدائري يمثّل جزءًا من كل واحد؛ مقارنة دوائر متعددة عبر الزمن لا تُقرأ.',
        fix: 'استخدم أعمدة مكدّسة 100% أو خطوطًا لنسب الفئات.',
      });
    }
    if (hasNegative) {
      findings.push({
        id: 'pie-negative',
        severity: 'high',
        issue: 'قيم سالبة في مخطط دائري',
        why: 'الزاوية السالبة غير قابلة للتمثيل — البرنامج سيُخفيها أو يقلبها.',
        fix: 'أعمدة (Bar) تتعامل مع الإشارة بوضوح.',
      });
    }
  }

  if ((spec.type === 'line' || spec.type === 'area') && spec.yAxis && spec.yAxis.startsAtZero === false) {
    if (spec.yAxis.min !== undefined && !spec.yAxis.min) {
      findings.push({
        id: 'truncated-axis',
        severity: spec.type === 'line' ? 'medium' : 'high',
        issue: 'المحور مقطوع (لا يبدأ من الصفر)',
        why: spec.type === 'area'
          ? 'المساحة الملوّنة تعني «حجمًا»، وقصّ الأساس يجعل مساحة صغيرة تبدو ضخمة.'
          : 'مقبول للخطوط عند توثيقه، لكنه يضخّم الفروق بصريًّا ويجب التنبيه إليه.',
        fix: spec.type === 'area' ? 'ابدأ المحور من الصفر أو استخدم خطًّا.' : 'أضف ملاحظة «المحور لا يبدأ من الصفر» أو ابدأ من الصفر إن كان الفرق صغيرًا.',
      });
    }
  }
  if (spec.type === 'bar' && spec.yAxis?.startsAtZero === false) {
    findings.push({
      id: 'bar-truncated',
      severity: 'high',
      issue: 'أعمدة بأساس مقطوع',
      why: 'طول العمود هو الترميز؛ قصّ الأساس يجعل 3% تبدو ضعفًا.',
      fix: 'ابدأ أعمدة القيم من الصفر دائمًا (أو استخدم نقاطًا/خطًّا).',
    });
  }

  if (spec.yAxis?.inverted) {
    findings.push({
      id: 'inverted-axis',
      severity: 'medium',
      issue: 'المحور الرأسي مقلوب',
      why: 'مقبول فقط حين تكون القيمة «أسوأ كلما ارتفعت» (مثل زمن الاستجابة) وبشرط توضيح ذلك.',
      fix: 'اقلب المحور للاتجاه الطبيعي أو اكتب «الأقل أفضل» بجوار العنوان.',
    });
  }

  if (spec.type === 'map' && spec.colorScaleSequential === false) {
    findings.push({
      id: 'map-diverging-color',
      severity: 'medium',
      issue: 'ألوان الخريطة غير متدرّجة مع القيمة',
      why: 'الألوان الفئوية على قيمة متصلة تجعل قراءة الترتيب مستحيلة.',
      fix: 'استخدم تدرّجًا متسلسلًا (فاتح→غامق) يُقابل القيمة.',
    });
  }

  if (spec.type === 'scatter' && spec.bubbleSizing && spec.series.length > 1) {
    findings.push({
      id: 'bubble-double-encoding',
      severity: 'low',
      issue: 'حجم النقطة يمثّل قيمة إضافية',
      why: 'ثلاث ترميزات (x، y، الحجم) في لوحة واحدة تُربك عند التقاء النقاط.',
      fix: 'ثبّت الحجم ولوّن حسب الفئة، أو افصل القيمة الثالثة في مخطط صغير مجاور.',
    });
  }

  if (spec.type === 'line' && spec.categories.length > 60) {
    findings.push({
      id: 'line-too-dense',
      severity: 'low',
      issue: `${spec.categories.length} نقطة على الخط`,
      why: 'النقاط المتلاصقة تُظهر ضجيجًا لا اتجاهًا، والقراءة تصبح تخمينية.',
      fix: 'جمّع إلى أسبوع/شهر أو استخدم نافذة زمنية أقصر.',
    });
  }

  if (!spec.title) {
    findings.push({
      id: 'no-title',
      severity: 'low',
      issue: 'بلا عنوان',
      why: 'الرسم بلا عنوان يُقرأ باستنتاجات مختلفة من كل قارئ.',
      fix: 'عنوان يذكر المقياس والفترة والحبيبية: «الإيراد الصافي — شهري 2025».',
    });
  }

  const weight = { high: 22, medium: 10, low: 4 } as const;
  const score = Math.max(0, 100 - findings.reduce((s, f) => s + weight[f.severity], 0));

  let suggestion: ChartVerdict['suggestion'] = null;
  if ((spec.type === 'pie' || spec.type === 'donut') && spec.categories.length > 5) {
    suggestion = { type: 'bar', reason: 'الترتيب والمقارنة أسهل بكثير بالطول الأفقي.' };
  } else if ((spec.type === 'area' && spec.yAxis?.startsAtZero === false) || findings.some((f) => f.id === 'dual-axis')) {
    suggestion = { type: 'line', reason: 'الخط يفصل الاتجاه عن الحجم ويتجنّب إيهام المساحة.' };
  } else if (spec.categories.length > 60 && spec.type === 'line') {
    suggestion = { type: 'table', reason: 'الكثافة تتجاوز قدرة العين؛ جدول مع ملخّص أفضل.' };
  }

  const summary = findings.length
    ? `${findings.length} ملاحظة على التمثيل (${findings.filter((f) => f.severity === 'high').length} جوهرية) — درجة الصدق البصري ${score}/100.`
    : `التمثيل سليم — لا ملاحظات على الصدق البصري (${score}/100).`;

  return { score, findings, summary, suggestion };
}

/** أقصى قيمة مسموحة قبل أن يُعتبر الفرق «بصريًّا مبالغًا فيه» — للتشخيص. */
export function visualExaggeration(series: ChartSeries, axisMin: number): number {
  const max = magnitude(series.values);
  if (!Number.isFinite(max) || max === 0) return 1;
  const visibleRange = max - axisMin;
  return Number((max / Math.max(1e-9, visibleRange)).toFixed(2));
}
