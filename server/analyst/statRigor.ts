/**
 * #6 — طبقة الصرامة الإحصائية (Guardrails for claims).
 *
 * لماذا: ما يميّز عالِم البيانات عن مولّد التقارير ليس الرسم بل **رفض
 * الاستنتاج الزائد**. هذه الوحدة تُرفق كل رقم بثقته، وتلتقط العبارات الجازمة
 * التي لا تسندها البيانات («أفضل»، «يؤدي إلى»، «يثبت») وتقترح صياغة أمينة.
 */

import { mean, normalQuantile, pValueTwoSided, sd, tQuantile } from './stats';

export interface Interval {
  point: number;
  lower: number;
  upper: number;
  level: number;
  n: number;
}

/** متوسط بفترة ثقة (t للعيّنات الصغيرة) — تُعرض مع الرقم دائمًا. */
export function meanConfidenceInterval(values: number[], level = 0.95): Interval {
  const clean = values.filter((v) => Number.isFinite(v));
  const m = mean(clean);
  const s = sd(clean);
  const n = clean.length;
  if (!Number.isFinite(m) || !Number.isFinite(s) || n < 2) {
    return { point: m, lower: NaN, upper: NaN, level, n };
  }
  const t = tQuantile(1 - (1 - level) / 2, n - 1);
  const half = t * (s / Math.sqrt(n));
  return { point: m, lower: m - half, upper: m + half, level, n };
}

export interface ProportionTest {
  diff: number;
  z: number;
  pValue: number;
  /** فرق النسب المئوية بين المجموعتين. */
  diffPct: number;
  interval: Interval;
  significant: boolean;
}

/** اختبار فرق نسبتين (z ثنائي الطرف) مع فترة ثقة للفرق. */
export function twoProportionTest(
  conversionsA: number,
  nA: number,
  conversionsB: number,
  nB: number,
  level = 0.95
): ProportionTest {
  if (nA <= 0 || nB <= 0) throw new Error('twoProportionTest: كل مجموعة تحتاج صفوفًا موجبة');
  const pA = conversionsA / nA;
  const pB = conversionsB / nB;
  const pooled = (conversionsA + conversionsB) / (nA + nB);
  const sePooled = Math.sqrt(pooled * (1 - pooled) * (1 / nA + 1 / nB));
  const diff = pB - pA;
  const z = sePooled > 0 ? diff / sePooled : 0;
  const seUnpooled = Math.sqrt((pA * (1 - pA)) / nA + (pB * (1 - pB)) / nB);
  const zc = normalQuantile(1 - (1 - level) / 2);
  const pValue = pValueTwoSided(z);
  return {
    diff,
    z,
    pValue,
    diffPct: diff * 100,
    interval: {
      point: diff,
      lower: diff - zc * seUnpooled,
      upper: diff + zc * seUnpooled,
      level,
      n: nA + nB,
    },
    significant: pValue < 1 - level,
  };
}

/**
 * الحد الأدنى للأثر القابل للكشف (MDE) — أهم رقم لا يُعرض عادة.
 * يجيب: «بهذا الحجم، ما أصغر تحسّن يمكن أن أراه فعلًا؟» فإن كان تحسّنك 0.5%
 * وMDE لديك 2%، فأنت تقرأ ضجيجًا.
 */
export function minimumDetectableEffect(baseRate: number, nPerGroup: number, power = 0.8, alpha = 0.05): number {
  const zAlpha = normalQuantile(1 - alpha / 2);
  const zBeta = normalQuantile(power);
  const p = Math.min(0.9999, Math.max(0.0001, baseRate));
  const se = Math.sqrt((2 * p * (1 - p)) / Math.max(1, nPerGroup));
  return (zAlpha + zBeta) * se;
}

/** حجم العيّنة المطلوب لكل مجموعة لكشف أثر نسبي معيّن. */
export function requiredSampleSize(baseRate: number, relativeLift: number, power = 0.8, alpha = 0.05): number {
  const p1 = Math.min(0.9999, Math.max(0.0001, baseRate));
  const p2 = Math.min(0.9999, Math.max(0.0001, p1 * (1 + relativeLift)));
  const zAlpha = normalQuantile(1 - alpha / 2);
  const zBeta = normalQuantile(power);
  const pBar = (p1 + p2) / 2;
  const numerator = (zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2;
  return Math.ceil(numerator / (p2 - p1) ** 2);
}

/**
 * فحص عدم تطابق توزيع العيّنة (SRM) — أول ما يُفحص في أي تجربة.
 * إن كانت النسب المرصودة تبتعد كثيرًا عن التوزيع المخطّط، فالتوزيع العشوائي
 * مكسور وأي نتيجة غير قابلة للتفسير.
 */
export function srmCheck(observed: number[], expectedPct?: number[]): { ok: boolean; chiSquare: number; pValue: number; message: string } {
  const total = observed.reduce((s, v) => s + v, 0);
  if (!total) return { ok: false, chiSquare: NaN, pValue: NaN, message: 'لا بيانات لتوزيع العيّنة.' };
  const k = observed.length;
  const expected = expectedPct?.length === k ? expectedPct.map((p) => (p / 100) * total) : observed.map(() => total / k);
  const chiSquare = observed.reduce((s, o, i) => s + (o - expected[i]) ** 2 / Math.max(1e-9, expected[i]), 0);
  // تقريب p عبر غاما(k/2, chi/2) — صيغة Wilson–Hilferty كافية
  const df = k - 1;
  const pValue = df > 0 ? 1 - chiCdf(chiSquare, df) : 1;
  const ok = pValue >= 0.001;
  return {
    ok,
    chiSquare,
    pValue,
    message: ok
      ? 'توزيع العيّنة سليم.'
      : `اختلال توزيع العيّنة (SRM): p=${pValue.toExponential(2)} — النسب لا تطابق الخطة، النتائج غير قابلة للتفسير قبل إصلاح التوزيع.`,
  };
}

/** دالة التوزيع التراكمي لتوزيع كاي-مربع (Wilson–Hilferty). */
export function chiCdf(x: number, df: number): number {
  if (x <= 0) return 0;
  const z = (Math.cbrt(x / df) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df));
  const erf = (v: number) => {
    const t = 1 / (1 + 0.3275911 * Math.abs(v) / Math.SQRT2);
    const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(v * v) / 2);
    return v >= 0 ? y : -y;
  };
  return 0.5 * (1 + erf(z));
}

export interface ClaimContext {
  pValue?: number;
  n?: number;
  effectPct?: number;
  mdePct?: number;
  /** هل البيانات تجريبية (A/B) أم رصدية؟ الفرق حاسم للسببية. */
  design?: 'experiment' | 'observational';
}

export interface RigorFinding {
  id: string;
  severity: 'high' | 'medium' | 'low';
  claim: string;
  message: string;
  /** صياغة بديلة أمينة جاهزة للاستخدام. */
  rewrite: string;
}

const COMPARATIVE = /(أفضل|افضل|أعلى|اعلي|أقل|اقل|أسرع|يتفوّق|يتفوق|أنجح|افضل من|أكثر فاعلية|significant|better|higher|lower|outperform)/i;
const CAUSAL = /(يؤدي|يؤدّي|أدّت|أدّى|أدى|ادت|ادى|ساهم|أسهم|أسهمت|بسبب|نتيجة ل|يثبت|يُثبت|يسبّب|سبب|يزيد من|يقلّل من|improves|causes|drives|leads to|proves)/i;
const ABSOLUTE = /(دائمًا|دائما|أبدًا|ابدا|كل المستخدمين|مضمون|مؤكد|always|never|guaranteed)/i;

/**
 * تدقيق عبارات النص مقابل سياقها الرقمي. لا يمنع الكتابة، بل يُرفق تحذيرًا
 * وصياغة بديلة — المساعد يبقى مفيدًا وأمينًا في الوقت نفسه.
 */
export function lintClaims(text: string, ctx: ClaimContext = {}): RigorFinding[] {
  const out: RigorFinding[] = [];
  const sentences = String(text || '')
    .split(/(?<=[.!؟?\n])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const sentence of sentences) {
    const sample = sentence.slice(0, 140);
    if (COMPARATIVE.test(sentence)) {
      if (ctx.pValue !== undefined && ctx.pValue > 0.05) {
        out.push({
          id: 'comparative-not-significant',
          severity: 'high',
          claim: sample,
          message: `تقول «أفضل/أعلى» لكن p = ${ctx.pValue.toFixed(3)} — أي أن الفرق داخل نطاق الضجيج.`,
          rewrite: 'الفرق المرصود لا يبلغ الدلالة الإحصائية بهذه العيّنة؛ يحتاج بيانات أكثر قبل الحكم.',
        });
      } else if (ctx.n !== undefined && ctx.n < 30) {
        out.push({
          id: 'comparative-small-n',
          severity: 'medium',
          claim: sample,
          message: `عيّنة ${ctx.n} فقط — كل مقارنة بهذا الحجم عرضة لقيمة شاذة واحدة.`,
          rewrite: 'في هذه العيّنة الصغيرة يبدو الاتجاه كذا، لكنه غير حاسم.',
        });
      }
    }
    if (CAUSAL.test(sentence) && ctx.design !== 'experiment') {
      out.push({
        id: 'causal-from-observation',
        severity: 'high',
        claim: sample,
        message: 'لغة سببية من بيانات رصدية: الارتباط وحده لا يُثبت أن X سبّب Y (قد يكون هناك عامل ثالث).',
        rewrite: 'يرتبط X بـY (ارتباط)، ولا تكفي هذه البيانات لإثبات السببية.',
      });
    }
    if (ABSOLUTE.test(sentence)) {
      out.push({
        id: 'absolute-language',
        severity: 'low',
        claim: sample,
        message: 'صياغة مطلقة لا تصمد أمام استثناء واحد.',
        rewrite: 'في البيانات المرصودة، …',
      });
    }
    if (ctx.effectPct !== undefined && ctx.mdePct !== undefined && Math.abs(ctx.effectPct) < ctx.mdePct && COMPARATIVE.test(sentence)) {
      out.push({
        id: 'below-mde',
        severity: 'high',
        claim: sample,
        message: `الأثر ${ctx.effectPct.toFixed(2)}% أصغر من الحد الأدنى القابل للكشف ${ctx.mdePct.toFixed(2)}% بهذه العيّنة.`,
        rewrite: 'الأثر أصغر من أن يُكشف بهذا الحجم من البيانات؛ لا يمكن تأكيده أو نفيه.',
      });
    }
  }
  return out;
}

/** سطر جاهز للعرض أسفل أي رقم: n، الفترة، ودلالة الفرق. */
export function rigorBadge(interval: Interval, label = 'المتوسط'): string {
  if (!Number.isFinite(interval.lower)) return `${label}: ${interval.point} (n=${interval.n})`;
  const pct = Math.round(interval.level * 100);
  return `${label} ${interval.point.toFixed(2)} — فترة ${pct}%: [${interval.lower.toFixed(2)}، ${interval.upper.toFixed(2)}]، n=${interval.n}`;
}
