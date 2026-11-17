/**
 * خطة علامات المحور الأفقي لمخطط التوقع (محور فئوي/category).
 *
 * المشكلة: في وضع «كل التاريخ» قد يحمل المحور مئات الفئات (500 صف وأكثر).
 * ‏Plotly يوزّع علاماته تلقائيًّا حسب `nticks` فقط، وتسميات التواريخ طويلة،
 * فتنتهي العلامات إلى التداخل على السلسلة الطويلة.
 *
 * الحل: نحسب العلامات هنا صراحةً (`tickmode: 'array'`) بميزانية عرض حقيقية:
 * عرض منطقة الرسم ÷ العرض التقديري لكل تسمية (بعد أخذ ميل 35° في الحساب)،
 * ثم نتباعد على المؤشرات بخطوة متساوية. التسميات محسوبة هنا أيضًا حتى تبقى
 * فريدة (tickvals فريدة) لأن Plotly يدمج النقاط عند تكرار القيمة.
 */
export type ForecastLabelFormat = 'date' | 'period' | 'year';

/** هوامش المحور الأفقي في تخطيط المخطط (يسار 60 + يمين 30). */
export const PLOT_MARGINS_PX = 90;
/** ميل تسميات التواريخ في المخطط — يقلّص تداخلها الأفقي إلى cos(35°). */
export const DATE_TICK_ANGLE_DEG = 35;

const TICK_CHAR_PX = 6.3; // 11px monospace تقريبًا
const TICK_PADDING_PX = 12; // فراغ داخل عرض التسمية (للقياس)
/** فراغ أدنى مطلوب بين حافتي تسميتين متجاورتين. */
const TICK_GAP_PX = 18;
const ANGLE_FACTOR = Math.cos((DATE_TICK_ANGLE_DEG * Math.PI) / 180); // ≈ 0.819
const MIN_CAPACITY = 3;
const MAX_CAPACITY = 14;
const EDGE_GUARD = 3; // نترك آخر فئات التاريخ: تسميتها تلامس أول تسمية توقع

export function estimateTickWidth(text: string): number {
  return Math.round(String(text || '').length * TICK_CHAR_PX) + TICK_PADDING_PX;
}

export function formatForecastLabel(label: string, format: ForecastLabelFormat, ordinal?: number): string {
  if (format === 'period') return ordinal ? `P${ordinal}` : label;
  if (format === 'year') {
    const year = /(\d{4})/.exec(label || '');
    return year ? year[1] : label;
  }
  return label;
}

export interface ForecastAxisTickOptions {
  historyLabels: string[];
  futureLabels: string[];
  format: ForecastLabelFormat;
  /** عرض منطقة الرسم داخل المخطط (بعد الهوامش). */
  plotWidthPx?: number;
}

export interface ForecastAxisTicks {
  tickmode: 'array';
  tickvals: string[];
  ticktext: string[];
}

/**
 * يُسقط أي علامة تقع أقرب من المسافة التي تحتاجها تسميتها في البكسل الفعلي.
 * العدّ وحده لا يكفي: على سلسلة من 500 فئة قد تكون آخر تسمية تاريخ ملاصقة
 * لأول علامة توقع رغم أن العدد الإجمالي صغير. الأول والآخر محفوظان دائمًا
 * (بداية المدى ونهاية التنبؤ)، وإن تعارضا تُسقط العلامة التي قبلهما.
 */
function fitTicks(
  candidates: number[],
  textAt: (index: number) => string,
  totalCategories: number,
  plotWidthPx: number,
  angled: boolean
): number[] {
  if (candidates.length <= 1) return candidates;
  const perCategory = Math.max(200, plotWidthPx) / Math.max(1, totalCategories - 1);
  const shrink = angled ? ANGLE_FACTOR : 1;
  const required = (a: number, b: number) =>
    ((estimateTickWidth(textAt(a)) + estimateTickWidth(textAt(b))) / 2) * shrink + TICK_GAP_PX;

  const kept: number[] = [candidates[0]];
  for (let i = 1; i < candidates.length; i += 1) {
    const index = candidates[i];
    const previous = kept[kept.length - 1];
    if ((index - previous) * perCategory >= required(previous, index)) kept.push(index);
  }

  const last = candidates[candidates.length - 1];
  if (kept[kept.length - 1] !== last) {
    while (kept.length > 1) {
      const tail = kept[kept.length - 1];
      if ((last - tail) * perCategory >= required(tail, last)) break;
      kept.pop();
    }
    kept.push(last);
  }
  return kept;
}

/** يفصل قائمة إلى عدد محدود من العناصر مع الحفاظ على الأول والأخير. */
function sampleIndexes(indexes: number[], max: number): number[] {
  if (indexes.length <= max) return indexes;
  if (max <= 2) return [indexes[0], indexes[indexes.length - 1]];
  const picked: number[] = [];
  const step = (indexes.length - 1) / (max - 1);
  for (let i = 0; i < max; i += 1) picked.push(indexes[Math.round(i * step)]);
  return [...new Set(picked)];
}

export function buildForecastAxisTicks({
  historyLabels,
  futureLabels,
  format,
  plotWidthPx = 760,
}: ForecastAxisTickOptions): ForecastAxisTicks {
  const allLabels = [...historyLabels, ...futureLabels];
  const histN = historyLabels.length;
  const futN = futureLabels.length;
  const textAt = (index: number) =>
    index < histN
      ? formatForecastLabel(allLabels[index], format)
      : // أرقام مجرّدة على المحور: P1…P6 فوق ست خانات متلاصقة تتداخل.
        format === 'period'
        ? String(index - histN + 1)
        : formatForecastLabel(allLabels[index], format, index - histN + 1);

  // كل الحساب بالبكسل: كم فئة تفصل بين تسميتين كي لا تتلامسا على هذا العرض؟
  const perCategory = Math.max(0.001, Math.max(200, plotWidthPx) / Math.max(1, allLabels.length - 1));
  const shrink = format === 'date' ? ANGLE_FACTOR : 1;
  const widestOf = (from: number, to: number) => {
    let widest = 0;
    const stride = Math.max(1, Math.floor((to - from) / 40));
    for (let index = from; index < to; index += stride) widest = Math.max(widest, estimateTickWidth(textAt(index)));
    return widest || estimateTickWidth('0');
  };
  const stepFor = (widthPx: number) => Math.max(1, Math.ceil((widthPx * shrink + TICK_GAP_PX) / perCategory));

  // نوقف فئات التاريخ قبل آخر ثلاث فئات حتى لا تلامس أول علامة توقع.
  const historyLimit = histN <= 1 ? histN : Math.max(1, histN - EDGE_GUARD);
  const historyStep = stepFor(widestOf(0, historyLimit));
  const historyIndexes: number[] = [];
  for (let index = 0; index < historyLimit; index += historyStep) historyIndexes.push(index);

  // التوقع يحصل على تباعد أكبر من التاريخ لأنه أهم ما في المخطط، لكن على سلسلة
  // طويلة لا تتسع إلا نقطة البداية والنهاية — والباقي يُحذف بالقياس لا بالتخمين.
  const futureWidth = widestOf(histN, allLabels.length);
  const futureStep = stepFor(futureWidth);
  const futureIndexes: number[] = [];
  if (futN > 0) {
    for (let index = 0; index < futN; index += futureStep) futureIndexes.push(histN + index);
    futureIndexes.push(histN + futN - 1);
  }

  const tickIndexes = [...new Set([...historyIndexes, ...futureIndexes])].sort((a, b) => a - b);
  const trimmed = fitTicks(
    sampleIndexes(tickIndexes, MAX_CAPACITY),
    textAt,
    allLabels.length,
    plotWidthPx,
    format === 'date'
  );

  const ticks = trimmed.map((index) => ({ index, text: textAt(index) }));
  // في وضع السنة تتشارك عدة علامات السنة نفسها؛ عرضها ثماني مرات ضجيج.
  const visibleTicks =
    format === 'year'
      ? ticks.filter((tick, position) => position === 0 || tick.text !== ticks[position - 1].text)
      : ticks;

  return {
    tickmode: 'array',
    tickvals: visibleTicks.map((tick) => allLabels[tick.index]),
    ticktext: visibleTicks.map((tick) => tick.text),
  };
}

export interface TickSpacing {
  index: number;
  /** المسافة الأفقية المتاحة بين هذه العلامة والتي قبلها (بالبكسل). */
  gapPx: number;
  /** ما تحتاجه التسميتان كي لا تتلامسا (بالبكسل). */
  requiredPx: number;
  crowded: boolean;
}

/**
 * يقيس المسافة الفعلية بين كل علامتين متجاورتين على المحور بالمقارنة مع عرض
 * نصّهما — أداة الفحص المباشرة لسؤال «هل تتداخل العلامات؟».
 */
export function axisSpacing(
  tickIndexes: number[],
  tickTexts: string[],
  totalCategories: number,
  plotWidthPx: number,
  angled = false
): TickSpacing[] {
  const perCategory = Math.max(200, plotWidthPx) / Math.max(1, totalCategories - 1);
  const shrink = angled ? ANGLE_FACTOR : 1;
  return tickIndexes.slice(1).map((index, position) => {
    const previous = tickIndexes[position];
    const gapPx = (index - previous) * perCategory;
    const requiredPx =
      (estimateTickWidth(tickTexts[position] || '') + estimateTickWidth(tickTexts[position + 1] || '')) / 2 * shrink;
    return { index, gapPx: Math.round(gapPx), requiredPx: Math.round(requiredPx), crowded: gapPx < requiredPx };
  });
}
