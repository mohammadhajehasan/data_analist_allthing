/**
 * #18 — التقرير الأسبوعي بنبرة إنسان: ما تغيّر، لماذا يُرجَّح، وما القرار.
 *
 * لماذا: الأرقام وحدها لا تُقرأ صباح الاثنين. تحويلها إلى ثلاث فقرات مرتبطة
 * بأحداث معروفة (إطلاق، عطلة، حملة) مع ترتيب القرارات حسب الأثر المتوقّع هو
 * الفرق بين لوحة معلومات وتقرير ينتظره الفريق.
 */

export interface WeeklySignal {
  name: string;
  current: number;
  previous: number;
  unit?: string;
  /** هل الارتفاع جيد لهذا المقياس؟ */
  betterWhen: 'higher' | 'lower';
}

export interface KnownEvent {
  date: string;
  label: string;
  kind: 'launch' | 'campaign' | 'holiday' | 'outage' | 'pricing' | 'other';
}

export interface Recommendation {
  action: string;
  expectedImpact: 'high' | 'medium' | 'low';
  evidence: string;
  risk: string;
}

export interface WeeklyReport {
  headline: string;
  /** الفقرة السردية الرئيسية. */
  narrative: string;
  movements: Array<{ name: string; changePct: number; direction: 'up' | 'down'; good: boolean; sentence: string }>;
  eventLinks: Array<{ event: KnownEvent; likelyEffect: string }>;
  recommendations: Recommendation[];
  /** ما لا يمكن الحكم فيه هذا الأسبوع (أمانة). */
  openQuestions: string[];
}

function pct(current: number, previous: number): number {
  if (!Number.isFinite(previous) || previous === 0) return NaN;
  return ((current - previous) / Math.abs(previous)) * 100;
}

const EVENT_HINT: Record<KnownEvent['kind'], string> = {
  launch: 'التغيّر يتزامن مع إطلاق جديد؛ الأثر المتوقّع ارتفاع في الطلب الجديد لا في الأساس.',
  campaign: 'حملة تسويقية قد ترفع الأرقام مؤقتًا — لا تُبنَ عليها توقعات دائمة قبل انتهائها بأسبوعين.',
  holiday: 'عطلة/موسم يفسّر جزءًا من الحركة؛ استخدم نفس الأسبوع من العام الماضي كأساس.',
  outage: 'انقطاع خدمة يُفسد مقارنة هذا الأسبوع؛ استبعد أيام الانقطاع أو أعد الحساب.',
  pricing: 'تغيّر سعر يخلط أثر السعر بأثر الحجم — لا يمكن فصل الاثنين من الإجمالي وحده.',
  other: 'حدث مسجّل قريب من التغيّر — تحقّق من التزامن قبل نسب السبب إليه.',
};

export function buildWeeklyReport(
  signals: WeeklySignal[],
  events: KnownEvent[] = [],
  periodLabel = 'هذا الأسبوع'
): WeeklyReport {
  const movements = signals.map((s) => {
    const change = pct(s.current, s.previous);
    const direction: 'up' | 'down' = change >= 0 ? 'up' : 'down';
    const good = s.betterWhen === 'higher' ? change >= 0 : change <= 0;
    const sentence =
      `${s.name}: ${s.current.toLocaleString('en-US')}${s.unit ? ` ${s.unit}` : ''} ` +
      `(${Number.isFinite(change) ? `${change > 0 ? '+' : ''}${change.toFixed(1)}%` : 'بلا أساس للمقارنة'}) — ${good ? 'اتجاه إيجابي' : 'يستحق الانتباه'}.`;
    return { name: s.name, changePct: Number.isFinite(change) ? Number(change.toFixed(2)) : 0, direction, good, sentence };
  });

  const bad = movements.filter((m) => !m.good).sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  const good = movements.filter((m) => m.good).sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

  const headline = bad.length
    ? `${periodLabel}: ${bad[0].name} ${bad[0].direction === 'down' ? 'انخفض' : 'ارتفع'} ${Math.abs(bad[0].changePct).toFixed(1)}% — هذا محور التركيز.`
    : good.length
      ? `${periodLabel}: ${good[0].name} ${good[0].direction === 'up' ? 'ارتفع' : 'انخفض'} ${Math.abs(good[0].changePct).toFixed(1)}% بلا تدهور في المقاييس الأخرى.`
      : `${periodLabel}: لا حركة جوهرية.`;

  const narrative = [
    headline,
    good.length ? `الأرقام الإيجابية: ${good.slice(0, 2).map((m) => `${m.name} ${m.changePct > 0 ? '+' : ''}${m.changePct}%`).join('، ')}.` : null,
    bad.length ? `الأرقام التي تحتاج تفسيرًا: ${bad.slice(0, 2).map((m) => `${m.name} ${m.changePct > 0 ? '+' : ''}${m.changePct}%`).join('، ')} — لا تُعلن سببًا قبل التحقق.` : null,
  ]
    .filter(Boolean)
    .join(' ');

  const eventLinks = events.map((event) => ({ event, likelyEffect: EVENT_HINT[event.kind] }));

  const recommendations: Recommendation[] = [];
  if (bad.length) {
    recommendations.push({
      action: `افتح تحقيقًا على «${bad[0].name}»: فكّكه حسب المدينة/المنتج وحدّد أكبر مساهم في الانخفاض.`,
      expectedImpact: Math.abs(bad[0].changePct) > 10 ? 'high' : 'medium',
      evidence: `انخفاض ${Math.abs(bad[0].changePct).toFixed(1)}% عن الأسبوع الماضي`,
      risk: 'قد يكون موسميًّا — قارن بنفس الأسبوع من العام الماضي قبل أي إجراء.',
    });
  }
  if (good.length) {
    recommendations.push({
      action: `وثّق سبب تحسّن «${good[0].name}» في سجل القرارات، وأعد استخدامه في قناة أخرى.`,
      expectedImpact: 'medium',
      evidence: `تحسّن ${Math.abs(good[0].changePct).toFixed(1)}%`,
      risk: 'التحسّن قد يكون مؤقتًا (حملة/موسم)؛ لا تُعمّمه قبل أسبوعين ثابتين.',
    });
  }
  recommendations.push({
    action: 'ثبّت الأسبوع القادم على نفس المقاييس ونفس التعريفات لتصبح المقارنة أسبوعية موثوقة.',
    expectedImpact: 'low',
    evidence: 'غياب تعريف موحّد يجعل كل مقارنة قابلة للجدل',
    risk: 'لا شيء يُذكر.',
  });

  const openQuestions: string[] = [];
  if (movements.some((m) => Math.abs(m.changePct) < 3)) openQuestions.push('الحركات أقل من 3% — ضمن الضجيج، لا تُفسَّر.');
  if (!events.length) openQuestions.push('لا أحداث مسجّلة هذا الأسبوع — لن تُنسب الحركة إلى سبب خارجي.');
  if (signals.some((s) => !Number.isFinite(pct(s.current, s.previous)))) openQuestions.push('بعض المقاييس بلا قيمة سابقة — لا يمكن حساب التغيّر.');

  return { headline, narrative, movements, eventLinks, recommendations, openQuestions };
}
