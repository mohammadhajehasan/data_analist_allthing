/**
 * #17 — المحكّم: الحكم بين تحليلين متعارضين.
 *
 * لماذا: أعلى لحظة ثقة حين يقول النظام «الرقمَان ليسا متعارضين: أحدهما بلا
 * المرتجعات والآخر بها، والفرق 3.2%» أو «أحد التحليلين مخطئ في الحبيبية».
 * هذا حكم خبير فعلي، لا مقارنة نصوص.
 */

export interface AnalysisClaim {
  id: string;
  author?: string;
  /** الرقم المعلن. */
  value: number;
  unit?: string;
  /** التعريفات المطبّقة كما فهمها صاحب التحليل. */
  filters?: string[];
  grain?: string;
  period?: string;
  /** حجم العيّنة إن ذُكر. */
  n?: number;
}

export type ArbitrationVerdict = 'equivalent' | 'explainable' | 'contradiction' | 'not-comparable';

export interface Arbitration {
  verdict: ArbitrationVerdict;
  headline: string;
  /** فرق نسبي بين الرقمين. */
  deltaPct: number;
  /** سبب الفرق إن أمكن تفسيره. */
  explanations: string[];
  /** ما يجب فعله لحلّ الخلاف. */
  resolution: string;
  /** الأكثر اتساقًا مع التعريف المعتمد (إن أمكن الترجيح). */
  recommended: { id: string; reason: string } | null;
}

function diffPct(a: number, b: number): number {
  const base = Math.max(Math.abs(a), Math.abs(b), 1e-9);
  return (Math.abs(a - b) / base) * 100;
}

/**
 * الحكم: أولًا هل هما قابلان للمقارنة أصلًا (فترة/حبيبية)، ثم هل الفرق يُفسَّر
 * بتعريف معلوم (المرتجعات، العملة)، وإلا فهو تناقض يستحق التحقيق.
 */
export function arbitrate(a: AnalysisClaim, b: AnalysisClaim): Arbitration {
  const delta = diffPct(a.value, b.value);
  const explanations: string[] = [];
  const setA = new Set((a.filters || []).map((f) => f.trim().toLowerCase()));
  const setB = new Set((b.filters || []).map((f) => f.trim().toLowerCase()));
  const onlyA = [...setA].filter((f) => !setB.has(f));
  const onlyB = [...setB].filter((f) => !setA.has(f));

  if (a.grain && b.grain && a.grain !== b.grain) {
    return {
      verdict: 'not-comparable',
      headline: `الرقمان ليسا على نفس الحبيبية («${a.grain}» مقابل «${b.grain}») — الخلاف لفظي لا رقمي.`,
      deltaPct: Number(delta.toFixed(2)),
      explanations: [`الحبيبية المختلفة تعني أن كل رقم يقيس شيئًا آخر.`],
      resolution: 'أعد حساب الرقمين على الحبيبية المعتمدة في طبقة المقاييس، ثم قارن.',
      recommended: null,
    };
  }
  if (a.period && b.period && a.period !== b.period) {
    return {
      verdict: 'not-comparable',
      headline: `فترتان مختلفتان («${a.period}» مقابل «${b.period}») — لا تعارض أصلًا.`,
      deltaPct: Number(delta.toFixed(2)),
      explanations: ['مقارنة رقمين من فترتين مختلفتين ليست خلافًا في الحساب.'],
      resolution: 'وحّد الفترة (وأعلن هل هي تقويمية أم متحرّكة) ثم أعد المقارنة.',
      recommended: null,
    };
  }
  if (delta < 0.5) {
    return {
      verdict: 'equivalent',
      headline: `لا خلاف حقيقي: الفرق ${delta.toFixed(2)}% فقط (تقريب/وقت التحديث).`,
      deltaPct: Number(delta.toFixed(2)),
      explanations: ['الفرق أصغر من أن يكون تعريفًا مختلفًا.'],
      resolution: 'اعتمد رقمًا واحدًا في التقرير واذكر وقت التحديث.',
      recommended: null,
    };
  }
  if (onlyA.length || onlyB.length) {
    for (const f of onlyA) explanations.push(`التحليل الأول يطبّق «${f}» ولا يطبّقه الثاني.`);
    for (const f of onlyB) explanations.push(`التحليل الثاني يطبّق «${f}» ولا يطبّقه الأول.`);
    return {
      verdict: 'explainable',
      headline: `الفرق ${delta.toFixed(2)}% مُفسَّر باختلاف الفلاتر — ليس خطأً.`,
      deltaPct: Number(delta.toFixed(2)),
      explanations,
      resolution: 'اعتمد التعريف المعتمد في طبقة المقاييس، ووثّق الفلتر بجانب الرقم في كل تقرير.',
      recommended: null,
    };
  }
  if (a.n && b.n && Math.abs(a.n - b.n) / Math.max(a.n, b.n) > 0.05) {
    explanations.push(`حجم العيّنة مختلف (${a.n} مقابل ${b.n}) — أحدهما يقرأ شريحة أوسع.`);
  }
  return {
    verdict: 'contradiction',
    headline: `تناقض غير مفسَّر: ${a.value} مقابل ${b.value} (${delta.toFixed(2)}%) بنفس التعريف المعلن.`,
    deltaPct: Number(delta.toFixed(2)),
    explanations: explanations.length ? explanations : ['لا فرق في الفلاتر/الحبيبية/الفترة المعلنة — إذًا أحد الاستعلامين به خلل (JOIN مضاعف أو فلتر مفقود).'],
    resolution: 'شغّل الاستعلامين بالمسار المزدوج (cross-check): فرق الصفوف والمجاميع سيحدّد أيّهما المخطئ. لا تنشر أيًّا منهما قبل ذلك.',
    recommended: null,
  };
}

/** اقتراح التعريف المعتمد حين تكون هناك طبقة دلالية. */
export function recommendCanonical(
  claims: AnalysisClaim[],
  canonical: { grain: string; filters: string[] }
): { id: string; reason: string } | null {
  const norm = (arr: string[]) => arr.map((f) => f.trim().toLowerCase()).sort().join('|');
  const target = norm(canonical.filters);
  const match = claims.find((c) => c.grain === canonical.grain && norm(c.filters || []) === target);
  if (match) return { id: match.id, reason: 'يطابق التعريف المعتمد في طبقة المقاييس (حبيبية وفلاتر).' };
  return null;
}
