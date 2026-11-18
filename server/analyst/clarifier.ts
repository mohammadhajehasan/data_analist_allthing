/**
 * #8 — المُوضِّح: كشف الغموض قبل الإجابة، وسؤال واحد فقط.
 *
 * لماذا: أكثر إجابة تبدو «غبية» ليست خاطئة لغويًّا بل بُنيت على افتراض صامت
 * (نافذة زمنية، حبيبية، هل تُحتسب المرتجعات، شهر تقويمي أم متحرّك). سؤال واحد
 * بخيارات مضغوطة يقرأه المستخدم ذكاءً عاليًا، ويوفّر دورة كاملة من التصحيح.
 */

export type AmbiguityId =
  | 'time_window'
  | 'grain'
  | 'refunds'
  | 'population'
  | 'currency'
  | 'month_type'
  | 'duplicates'
  | 'comparison_base';

export interface AmbiguityQuestion {
  id: AmbiguityId;
  /** السؤال كما يُعرض — جملة واحدة قصيرة. */
  question: string;
  options: string[];
  /** الافتراض الذي سيُتّخذ إن لم يجب المستخدم، ومعلَن صراحة. */
  defaultAssumption: string;
  /** هل يغيّر الجواب رقميًّا بشكل جوهري؟ */
  impact: 'high' | 'medium' | 'low';
  /** الدليل من السؤال نفسه على وجود الغموض. */
  evidence: string;
}

const RULES: Array<{ id: AmbiguityId; trigger: RegExp; question: string; options: string[]; defaultAssumption: string; impact: AmbiguityQuestion['impact'] }> = [
  {
    id: 'time_window',
    trigger: /(الأداء|اداء|المبيعات|الإيراد|الايراد|النمو|الاتجاه|performance|trend|sales)/i,
    question: 'أي فترة زمنية؟',
    options: ['هذا الشهر', 'آخر 30 يومًا', 'هذا الربع', 'هذه السنة', 'فترة أحدّدها'],
    defaultAssumption: 'آخر 30 يومًا (نافذة متحرّكة)',
    impact: 'high',
  },
  {
    id: 'month_type',
    trigger: /(هذا الشهر|الشهر الماضي|شهري|شهرية|monthly|this month|last month)/i,
    question: '«الشهر» تقويمي (1–31) أم نافذة متحرّكة 30 يومًا؟',
    options: ['شهر تقويمي', 'آخر 30 يومًا'],
    defaultAssumption: 'شهر تقويمي — لأن التقارير المالية تُقارن به',
    impact: 'high',
  },
  {
    id: 'grain',
    trigger: /(متوسط|معدل|average|mean|rate)/i,
    question: 'المتوسط على أي مستوى: صفّ/طلب/عميل/يوم؟',
    options: ['لكل صف', 'لكل طلب', 'لكل عميل', 'لكل يوم'],
    defaultAssumption: 'لكل صف — وهو غالبًا ليس ما يقصده المحلل',
    impact: 'high',
  },
  {
    id: 'refunds',
    trigger: /(إيراد|ايراد|مبيعات|ربح|revenue|sales|profit|تحويل|conversion)/i,
    question: 'هل تُحتسب المرتجعات والإلغاءات؟',
    options: ['استبعاد المرتجعات', 'احتسابها كما هي', 'صافي بعد الخصومات والمرتجعات'],
    defaultAssumption: 'استبعاد المرتجعات — أكثر تعريف شائع للإيراد المحقّق',
    impact: 'high',
  },
  {
    id: 'population',
    trigger: /(نشط|active|كل المستخدمين|جميع المستخدمين|churn|احتفاظ|retention)/i,
    question: 'من يُعدّ «مستخدمًا»؟',
    options: ['سجّل خلال الفترة', 'زار/استخدم خلال الفترة', 'سجّل قبل الفترة ولا يزال نشطًا'],
    defaultAssumption: 'استخدم خلال الفترة (نشط فعليًّا)',
    impact: 'high',
  },
  {
    id: 'currency',
    trigger: /(دولار|ريال|يورو|ليرة|جنيه|usd|sar|eur|سعر|price|تكلفة|cost)/i,
    question: 'أي عملة وسعر صرف؟',
    options: ['كما هي في البيانات', 'كلها بالدولار', 'كلها بعملة الأساس'],
    defaultAssumption: 'كما هي في البيانات دون تحويل',
    impact: 'medium',
  },
  {
    id: 'duplicates',
    trigger: /(عدد|count|كم|عدد الطلبات|عدد العملاء)/i,
    question: 'هل نحسب الصفوف كما هي أم العناصر الفريدة؟',
    options: ['صفوف كما هي', 'عناصر فريدة (DISTINCT)'],
    defaultAssumption: 'عناصر فريدة — لأن التكرار يضخّم العدّ',
    impact: 'medium',
  },
  {
    id: 'comparison_base',
    trigger: /(مقارنة|قارن|نمو|انخفاض|ارتفاع|vs|versus|نسبة التغير|change)/i,
    question: 'المقارنة بأي أساس؟',
    options: ['الفترة السابقة المكافئة', 'نفس الفترة من العام الماضي', 'متوسط آخر 3 فترات'],
    defaultAssumption: 'الفترة السابقة المكافئة (بلا موسمية)',
    impact: 'medium',
  },
];

export interface ClarificationPlan {
  needsClarification: boolean;
  questions: AmbiguityQuestion[];
  /** افتراضات مُعلَنة تُلصق بجانب الجواب إن لم يُجب المستخدم. */
  declaredAssumptions: string[];
  /** نص العرض الجاهز (سؤال واحد فقط حين الإمكان). */
  prompt: string | null;
}

/**
 * عند أكثر من غموض، لا نُغرق المستخدم: نعرض الأثر الأعلى فقط ونُعلن الباقي
 * كافتراضات مكتوبة. هذا يحافظ على سرعة الحوار ويُظهر الشفافية معًا.
 */
export function planClarification(question: string, opts: { maxQuestions?: number } = {}): ClarificationPlan {
  const maxQuestions = opts.maxQuestions ?? 1;
  const hits = RULES.filter((r) => r.trigger.test(question)).map<AmbiguityQuestion>((r) => {
    const match = question.match(r.trigger);
    return {
      id: r.id,
      question: r.question,
      options: r.options,
      defaultAssumption: r.defaultAssumption,
      impact: r.impact,
      evidence: match?.[0] || '',
    };
  });
  // الأثر أولًا ثم ترتيب القواعد (ثابت ومتوقّع للمستخدم)
  const order = { high: 0, medium: 1, low: 2 } as const;
  hits.sort((a, b) => order[a.impact] - order[b.impact]);

  const asked = hits.slice(0, maxQuestions);
  const rest = hits.slice(maxQuestions);
  const prompt = asked.length
    ? `${asked[0].question}\n${asked[0].options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`
    : null;

  return {
    needsClarification: asked.length > 0,
    questions: asked,
    declaredAssumptions: rest.map((r) => r.defaultAssumption),
    prompt,
  };
}

/** الافتراضات بجملة واحدة تُذكر أسفل الجواب (لا تُخفى أبدًا). */
export function assumptionsFooter(plan: ClarificationPlan): string {
  const all = [...plan.questions.map((q) => q.defaultAssumption), ...plan.declaredAssumptions];
  if (!all.length) return '';
  return `الافتراضات المستخدمة: ${all.join('؛ ')}.`;
}
