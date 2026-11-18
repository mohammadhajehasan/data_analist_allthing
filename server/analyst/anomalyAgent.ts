/**
 * #5 — وكيل الشذوذ: كشف تلقائي، تفكيك، إسناد للسبب، ورواية جاهزة.
 *
 * لماذا: التنبيهات بالعتبة تُنبّه على ما تتوقّعه أنت. الكشف على **بقايا**
 * الاتجاه والموسمية يلتقط ما لم تتوقّعه. ثم الإسناد (أي بُعد ساهم) هو الذي
 * يحوّل «تنبيهًا» إلى «إجابة» — وهذا بالضبط ما يفعله المحلل الخبير صباحًا.
 */

import { mean, medianAbsoluteDeviation, median } from './stats';

export interface TimeSeriesPoint {
  label: string;
  value: number;
}

export interface Decomposition {
  trend: number[];
  seasonal: number[];
  residual: number[];
  period: number;
}

/** متوسط متحرّك مركزي بطول الحالة الموسمية. */
function centeredMovingAverage(values: number[], period: number): number[] {
  const half = Math.floor(period / 2);
  return values.map((_, i) => {
    const from = i - half;
    const to = i + half;
    let sum = 0;
    let n = 0;
    for (let j = from; j <= to; j += 1) {
      if (j < 0 || j >= values.length) continue;
      sum += values[j];
      n += 1;
    }
    return n ? sum / n : values[i];
  });
}

/**
 * تفكيك إضافي بسيط (trend + seasonal + residual) يكفي للكشف العملي، ويشتغل
 * مع دورتين فقط — وهو ما تسمح به معظم بيانات المنصات فعلًا.
 */
export function decomposeSeries(values: number[], period: number): Decomposition {
  const clean = values.map((v) => (Number.isFinite(v) ? v : 0));
  const p = Math.max(2, Math.min(period, Math.floor(clean.length / 2)));
  const trend = centeredMovingAverage(clean, p);
  const detrended = clean.map((v, i) => v - trend[i]);
  const fallback = mean(clean);
  const seasonal = new Array(clean.length).fill(0);
  for (let phase = 0; phase < p; phase += 1) {
    const idxs: number[] = [];
    for (let i = phase; i < clean.length; i += p) idxs.push(i);
    const avg = idxs.length ? mean(idxs.map((i) => detrended[i])) : 0;
    for (const i of idxs) seasonal[i] = Number.isFinite(avg) ? avg : 0;
  }
  const residual = clean.map((v, i) => v - trend[i] - seasonal[i]);
  void fallback;
  return { trend, seasonal, residual, period: p };
}

export interface AnomalyPoint {
  index: number;
  label: string;
  value: number;
  expected: number;
  residual: number;
  /** z قوي (على أساس MAD) — مقاوم للقيم الشاذة نفسها. */
  score: number;
  direction: 'spike' | 'drop';
  severity: 'high' | 'medium' | 'low';
  explanation: string;
}

export interface AnomalyReport {
  period: number;
  points: AnomalyPoint[];
  threshold: number;
  summary: string;
  /** هل السلسلة كافية للكشف؟ */
  sufficient: boolean;
}

/**
 * كشف الشذوذ: z قوي على البقايا (0.6745 · (x−median)/MAD). العتبة 3.5 شائعة
 * في مراقبة الجودة؛ نرفعها حين تكون السلسلة قصيرة لتقليل الإنذارات الكاذبة.
 */
export function detectAnomalies(series: TimeSeriesPoint[], period = 7, threshold = 3.5): AnomalyReport {
  if (series.length < Math.max(4, period + 2)) {
    return {
      period,
      points: [],
      threshold,
      sufficient: false,
      summary: `السلسلة قصيرة (${series.length} نقطة) — الكشف يحتاج ${Math.max(4, period + 2)} نقطة على الأقل مع دورة موسمية ${period}.`,
    };
  }
  const values = series.map((p) => p.value);
  const p = Math.max(2, Math.min(period, Math.floor(values.length / 2)));

  /**
   * التوقّع = وسيط نفس الطور في الدورات السابقة (seasonal naive).
   * لماذا لا متوسط متحرك: عند آخر نقطة يمتص المتوسط نفسه القيمة الشاذة فتختفي
   * — وهذا ما أخفى ارتفاعًا حقيقيًّا في الاختبار الحيّ. الوسيط لنفس الطور
   * يقارن النقطة بما حدث في الأيام/الأسابيع المماثلة، وهو ما يفعله المحلل.
   */
  const expectations: Array<number | null> = values.map((_v, i) => {
    if (i < p) return null;
    const samePhase: number[] = [];
    for (let j = i - p; j >= 0; j -= p) samePhase.push(values[j]);
    return samePhase.length ? median(samePhase) : null;
  });
  const residuals = values.map((v, i) => (expectations[i] === null ? NaN : v - (expectations[i] as number)));
  const usable = residuals.filter((r) => Number.isFinite(r));
  const med = median(usable);
  const mad = medianAbsoluteDeviation(usable);
  // MAD = 0 يعني أن كل البقايا متطابقة (سلسلة منتظمة ثم طفرة واحدة). قسمة على
  // 1e-9 تُنتج z بالمليارات وهو رقم بلا معنى للمستخدم، فنستعمل مقياسًا بديلًا
  // من فروق السلسلة، ونحدّ العرض عند 99 مع الاحتفاظ بالحكم الكامل داخليًّا.
  const diffMad = medianAbsoluteDeviation(values.slice(1).map((v, i) => v - values[i]));
  const scale = mad > 1e-9 ? mad : diffMad > 1e-9 ? diffMad : 1;
  const effectiveThreshold = series.length < period * 2 ? Math.max(threshold, 4) : threshold;

  const points: AnomalyPoint[] = [];
  series.forEach((point, i) => {
    const expected = expectations[i];
    if (expected === null || !Number.isFinite(residuals[i])) return;
    const residualValue = residuals[i];
    const rawScore = (0.6745 * (residualValue - med)) / scale;
    const score = Math.max(-99, Math.min(99, rawScore));
    if (Math.abs(score) >= effectiveThreshold) {
      const pct = expected !== 0 ? ((point.value - expected) / Math.abs(expected)) * 100 : 0;
      points.push({
        index: i,
        label: point.label,
        value: point.value,
        expected,
        residual: residualValue,
        score: Number(score.toFixed(2)),
        direction: score > 0 ? 'spike' : 'drop',
        severity: Math.abs(rawScore) >= effectiveThreshold * 1.6 ? 'high' : Math.abs(rawScore) >= effectiveThreshold * 1.2 ? 'medium' : 'low',
        explanation:
          `${point.label}: القيمة ${point.value.toLocaleString('en-US')} بينما المتوقع حسب الاتجاه والموسمية ` +
          `${expected.toLocaleString('en-US', { maximumFractionDigits: 2 })} (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%) — ` +
          `${score > 0 ? 'ارتفاع' : 'انخفاض'} يتجاوز ${Math.abs(score).toFixed(1)} انحرافًا قويًّا.`,
      });
    }
  });
  const areas = points.length;
  const summary = areas
    ? `${areas} نقطة شاذة من ${series.length} — أشدّها «${points.sort((a, b) => Math.abs(b.score) - Math.abs(a.score))[0].label}» (${points[0].score}).`
    : `لا شذوذ يتجاوز العتبة ${effectiveThreshold} في ${series.length} نقطة — الاتجاه والموسمية يفسّران كل التغيّر.`;
  return { period: p, points: points.sort((a, b) => a.index - b.index), threshold: effectiveThreshold, summary, sufficient: true };
}

export interface AttributionRow {
  dimension: string;
  value: string;
  current: number;
  baseline: number;
}

export interface Attribution {
  dimension: string;
  totalDelta: number;
  contributions: Array<{ value: string; delta: number; sharePct: number; current: number; baseline: number }>;
  /** هل التغيّر متمركز في قيمة واحدة أم موزّع؟ */
  concentration: 'single' | 'two' | 'diffuse';
  narrative: string;
}

/**
 * إسناد التغيّر إلى قيم بُعد (مدينة/منتج/قناة): من الذي صنع الفرق فعلًا؟
 * هذه أهم خطوة يحصل عليها المحلل بعد ملاحظة الرقم.
 */
export function attributeChange(rows: AttributionRow[], dimension: string): Attribution {
  const withDelta = rows.map((r) => ({ ...r, delta: r.current - r.baseline }));
  const totalDelta = withDelta.reduce((s, r) => s + r.delta, 0);
  const denom = Math.abs(totalDelta) || 1;
  const contributions = withDelta
    .map((r) => ({
      value: r.value,
      delta: Number(r.delta.toFixed(4)),
      sharePct: Number(((r.delta / denom) * 100).toFixed(1)),
      current: r.current,
      baseline: r.baseline,
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const big = contributions.filter((c) => Math.abs(c.sharePct) >= 25);
  const concentration = big.length === 1 ? 'single' : big.length === 2 ? 'two' : 'diffuse';
  const top = contributions.slice(0, 3).filter((c) => Math.abs(c.sharePct) >= 5);
  const narrative = totalDelta === 0
    ? `لا تغيّر صافيًا في «${dimension}» — قد تكون هناك حركات متعاكسة تُخفي نفسها.`
    : top.length
      ? `التغيّر الصافي ${totalDelta > 0 ? '+' : ''}${totalDelta.toLocaleString('en-US', { maximumFractionDigits: 2 })}، وأكبر مساهم: ` +
        top.map((c) => `${c.value} (${c.sharePct > 0 ? '+' : ''}${c.sharePct}% من الفرق)`).join('، ') +
        (concentration === 'single' ? ' — التغيّر متمركز في قيمة واحدة، افحصها أولًا.' : concentration === 'two' ? ' — التغيّر محصور في قيمتين.' : ' — التغيّر موزّع، لا سبب واحد يفسّره.')
      : `كل القيم تحرّكت قليلًا بلا مساهم واضح في «${dimension}».`;

  return { dimension, totalDelta: Number(totalDelta.toFixed(4)), contributions, concentration, narrative };
}

/** ملخّص صباحي جاهز للبريد أو البطاقة. */
export function anomalyDigest(report: AnomalyReport, attribution?: Attribution): string {
  if (!report.sufficient) return report.summary;
  if (!report.points.length) return report.summary;
  return [report.summary, attribution?.narrative].filter(Boolean).join(' ');
}
