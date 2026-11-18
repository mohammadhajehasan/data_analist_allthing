/**
 * #7 — وحدة A/B بالاختبار المتسلسل الصحيح.
 *
 * لماذا: طريقة p-value التقليدية تفترض أنك نظرت **مرة واحدة**. في الواقع
 * الجميع ينظر كل يوم ويوقف التجربة عند أول p<0.05 — وهذا يرفع معدل الإيجابيات
 * الكاذبة إلى أضعاف. الحل: قيمة p صالحة في أي لحظة (mSPRT) + فحص المقاييس
 * الحارسة + SRM قبل أي تفسير.
 */

import { normalQuantile, pValueTwoSided } from './stats';
import { srmCheck } from './statRigor';

export interface ExperimentArm {
  name: string;
  visitors: number;
  conversions: number;
}

export interface AlwaysValidResult {
  /** قيمة p الصالحة في أي وقت (mixed Sequential Probability Ratio Test). */
  pValue: number;
  /** نسبة التوقف (test statistic). */
  likelihoodRatio: number;
  significant: boolean;
  /** الفرق النسبي المرصود. */
  relativeLiftPct: number;
  message: string;
}

/**
 * الانحراف المسبق على **الأثر المطلق** (لا على z): 2 نقاط مئوية.
 * اختياره حاسم: أكبر منه يجعل الاختبار بطيئًا، وأصغر يجعل الإنذارات الكاذبة
 * أكثر. 0.02 هو مقياس فرق تحويل معقول لتجربة بزوار بالآلاف.
 */
const MIXING_SD = 0.02;

/**
 * قيمة p متسلسلة لمقارنة نسبتيه. الصيغة: نسبة إمكان Λ ثم p = min(1, 1/Λ).
 * عند غياب أثر حقيقي تبقى p موزّعة بانتظام تقريبًا مهما نظرت مرات.
 */
export function alwaysValidPValue(control: ExperimentArm, treatment: ExperimentArm, mixingSd = MIXING_SD): AlwaysValidResult {
  const nC = Math.max(1, control.visitors);
  const nT = Math.max(1, treatment.visitors);
  const pC = control.conversions / nC;
  const pT = treatment.conversions / nT;
  const diff = pT - pC;
  const variance = (pC * (1 - pC)) / nC + (pT * (1 - pT)) / nT;
  if (!(variance > 0)) {
    return {
      pValue: 1,
      likelihoodRatio: 1,
      significant: false,
      relativeLiftPct: pC > 0 ? ((diff / pC) * 100) : 0,
      message: 'لا تباين في النتائج بعد — لا حكم.',
    };
  }
  const tau2 = mixingSd ** 2;
  // Robbins/mSPRT على الأثر نفسه: Λ = sqrt(v/(v+τ²))·exp(τ²·d² / (2v(v+τ²)))
  // حيث v تباين الفرق الملاحظ وd الفرق. p = min(1, 1/Λ) صالحة في أي لحظة نظر.
  const factor = Math.sqrt(variance / (variance + tau2));
  const likelihoodRatio = factor * Math.exp((tau2 * diff * diff) / (2 * variance * (variance + tau2)));
  const pValue = Math.min(1, 1 / Math.max(1e-12, likelihoodRatio));
  const relativeLiftPct = pC > 0 ? (diff / pC) * 100 : 0;
  return {
    pValue,
    likelihoodRatio,
    significant: pValue < 0.05,
    relativeLiftPct,
    message: pValue < 0.05
      ? `فرق موثوق بهذه اللحظة (p متسلسلة = ${pValue.toFixed(4)}، تحسّن نسبي ${relativeLiftPct.toFixed(2)}%) — يمكن الإطلاق مع مراقبة المقاييس الحارسة.`
      : `لا يوجد دليل كافٍ الآن (p متسلسلة = ${pValue.toFixed(3)}) — الاستمرار في الجمع أو التوقف بلا حكم، لكن لا تُعلن فوزًا.`,
  };
}

export interface GuardrailMetric {
  name: string;
  /** القيمة في المجموعة الضابطة. */
  control: number;
  /** القيمة في مجموعة المعالجة. */
  treatment: number;
  /** أسوأ انحدار مسموح (نسبة مئوية، مثل 2 = لا تنخفض أكثر من 2%). */
  maxDegradationPct: number;
  /** اتجاه أفضل: أعلى خير أم أدنى خير. */
  betterWhen: 'higher' | 'lower';
}

export interface GuardrailResult {
  name: string;
  changePct: number;
  breached: boolean;
  message: string;
}

/** المقاييس الحارسة تُفحص دائمًا حتى لو فاز المقياس الأساسي. */
export function checkGuardrails(metrics: GuardrailMetric[]): GuardrailResult[] {
  return metrics.map((m) => {
    const base = m.control === 0 ? 1e-9 : m.control;
    const changePct = ((m.treatment - m.control) / Math.abs(base)) * 100;
    const degraded = m.betterWhen === 'higher' ? -changePct : changePct;
    const breached = degraded > m.maxDegradationPct;
    return {
      name: m.name,
      changePct,
      breached,
      message: breached
        ? `«${m.name}» تدهور ${degraded.toFixed(2)}% — يتجاوز الحد المسموح ${m.maxDegradationPct}%. لا إطلاق حتى لو فاز المقياس الأساسي.`
        : `«${m.name}» تغيّر ${changePct.toFixed(2)}% — داخل الحدود.`,
    };
  });
}

export interface ExperimentReadout {
  verdict: 'ship' | 'stop' | 'continue' | 'invalid';
  headline: string;
  primary: AlwaysValidResult;
  guardrails: GuardrailResult[];
  srm: { ok: boolean; pValue: number; message: string };
  /** تنبيه إن كان القرار سيُتخذ الآن فهذا يخفض دلالته في القراءة التقليدية. */
  peekingNote: string;
}

/**
 * قراءة تجربة بترتيب صحيح: أولًا SRM (وإن فشل فلا قرار)، ثم الحوافز،
 * ثم المقياس الأساسي بقيمة p متسلسلة.
 */
export function readExperiment(
  control: ExperimentArm,
  treatment: ExperimentArm,
  guardrails: GuardrailMetric[] = [],
  expectedSplitPct?: number[]
): ExperimentReadout {
  const srm = srmCheck([control.visitors, treatment.visitors], expectedSplitPct);
  const primary = alwaysValidPValue(control, treatment);
  const guards = checkGuardrails(guardrails);
  const peekingNote =
    'القيمة هنا صالحة للاطّلاع المتكرر (متسلسلة)؛ لا تستخدم p التقليدية مع النظر اليومي وإلا سترى «فوزًا» وهميًّا.';

  if (!srm.ok) {
    return {
      verdict: 'invalid',
      headline: 'التجربة غير صالحة: توزيع العيّنة مكسور (SRM) — أصلح التوزيع قبل أي قراءة.',
      primary,
      guardrails: guards,
      srm,
      peekingNote,
    };
  }
  const breached = guards.filter((g) => g.breached);
  if (breached.length) {
    return {
      verdict: 'stop',
      headline: `توقف: ${breached.map((b) => b.name).join('، ')} تدهور بما يتجاوز الحد.`,
      primary,
      guardrails: guards,
      srm,
      peekingNote,
    };
  }
  if (primary.significant) {
    return {
      verdict: 'ship',
      headline: primary.message,
      primary,
      guardrails: guards,
      srm,
      peekingNote,
    };
  }
  return {
    verdict: 'continue',
    headline: primary.message,
    primary,
    guardrails: guards,
    srm,
    peekingNote,
  };
}

/** كم زائرًا إضافيًا يحتاج الأمر لكشف فرق معيّن (تقدير سريع للعرض). */
export function visitorsNeeded(baseRate: number, relativeLift: number, alpha = 0.05, power = 0.8): number {
  const zA = normalQuantile(1 - alpha / 2);
  const zB = normalQuantile(power);
  const p1 = Math.max(1e-4, Math.min(0.9999, baseRate));
  const p2 = Math.max(1e-4, Math.min(0.9999, p1 * (1 + relativeLift)));
  const pBar = (p1 + p2) / 2;
  const num = (zA * Math.sqrt(2 * pBar * (1 - pBar)) + zB * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2;
  return Math.ceil(num / (p2 - p1) ** 2);
}

/** مساعد صغير للعرض: قيمة p التقليدية للمقارنة التعليمية. */
export function conventionalPValue(control: ExperimentArm, treatment: ExperimentArm): number {
  const nC = Math.max(1, control.visitors);
  const nT = Math.max(1, treatment.visitors);
  const pC = control.conversions / nC;
  const pT = treatment.conversions / nT;
  const pooled = (control.conversions + treatment.conversions) / (nC + nT);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / nC + 1 / nT));
  if (!(se > 0)) return 1;
  return pValueTwoSided((pT - pC) / se);
}
