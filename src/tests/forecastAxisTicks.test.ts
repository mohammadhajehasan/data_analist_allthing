import { describe, expect, it } from 'vitest';
import {
  axisSpacing,
  buildForecastAxisTicks,
  estimateTickWidth,
  PLOT_MARGINS_PX,
  type ForecastLabelFormat,
} from '../utils/forecastAxisTicks';

/** سلسلة يومية طويلة بوسوم ISO كما تخرج من ملفات CSV الحقيقية. */
function dailyLabels(count: number, start = Date.UTC(2023, 0, 1)): string[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start + index * 86_400_000);
    return date.toISOString().slice(0, 10);
  });
}

function indexesOf(tickvals: string[], allLabels: string[]): number[] {
  return tickvals.map((value) => allLabels.indexOf(value));
}

function assertNoCrowding(
  format: ForecastLabelFormat,
  historyCount: number,
  forecastCount: number,
  plotWidthPx: number
) {
  const historyLabels = format === 'period' ? Array.from({ length: historyCount }, (_, i) => `p${i + 1}`) : dailyLabels(historyCount);
  const futureLabels = Array.from({ length: forecastCount }, (_, i) => `f${i + 1}`);
  const ticks = buildForecastAxisTicks({ historyLabels, futureLabels, format, plotWidthPx });
  const allLabels = [...historyLabels, ...futureLabels];
  const indexes = indexesOf(ticks.tickvals, allLabels);

  expect(ticks.tickvals.length).toBe(new Set(ticks.tickvals).size);
  expect(indexes.every((index) => index >= 0)).toBe(true);
  // على الشاشات الضيقة قد لا يتسع أكثر من تسميتين طويلتين — المهم ألا تتلامسا.
  expect(ticks.tickvals.length).toBeGreaterThanOrEqual(2);
  expect(ticks.tickvals.length).toBeLessThanOrEqual(14);

  const spacing = axisSpacing(indexes, ticks.ticktext, allLabels.length, plotWidthPx, format === 'date');
  const crowded = spacing.filter((gap) => gap.crowded);
  expect(crowded, `crowded ticks: ${JSON.stringify({ format, plotWidthPx, crowded })}`).toEqual([]);
  return { ticks, indexes, spacing };
}

describe('forecast axis ticks', () => {
  it('keeps 500+ history labels apart in date mode', () => {
    const historyLabels = dailyLabels(520);
    const futureLabels = ['2024-06-04', '2024-06-05', '2024-06-06', '2024-06-07', '2024-06-08', '2024-06-09'];
    const ticks = buildForecastAxisTicks({
      historyLabels,
      futureLabels,
      format: 'date',
      plotWidthPx: 900 - PLOT_MARGINS_PX,
    });
    const allLabels = [...historyLabels, ...futureLabels];
    const indexes = indexesOf(ticks.tickvals, allLabels);

    // نطاق معقول على 526 فئة، وليست 500 تسمية متلاصقة.
    expect(ticks.tickvals.length).toBeGreaterThanOrEqual(3);
    expect(ticks.tickvals.length).toBeLessThanOrEqual(12);
    // أول تاريخ وآخر نقطة توقع محفوظان: بداية المدى ونهاية التنبؤ.
    expect(indexes[0]).toBe(0);
    expect(indexes[indexes.length - 1]).toBe(allLabels.length - 1);

    const spacing = axisSpacing(indexes, ticks.ticktext, allLabels.length, 900 - PLOT_MARGINS_PX, true);
    for (const gap of spacing) {
      expect(gap.gapPx).toBeGreaterThanOrEqual(gap.requiredPx);
    }
  });

  it('does not crowd on any format and any width', () => {
    for (const format of ['date', 'period', 'year'] as ForecastLabelFormat[]) {
      for (const width of [240, 360, 520, 700, 900, 1200]) {
        assertNoCrowding(format, 520, 6, width);
        assertNoCrowding(format, 500, 24, width);
      }
    }
  });

  it('marks the two ends of the long forecast in date mode instead of all 24 dates', () => {
    const historyLabels = dailyLabels(520);
    const futureLabels = dailyLabels(24, Date.UTC(2024, 6, 1));
    const ticks = buildForecastAxisTicks({
      historyLabels,
      futureLabels,
      format: 'date',
      plotWidthPx: 810,
    });
    const forecastTicks = ticks.tickvals.filter((value) => futureLabels.includes(value));
    expect(forecastTicks.length).toBeLessThanOrEqual(2);
    expect(forecastTicks[forecastTicks.length - 1]).toBe(futureLabels[futureLabels.length - 1]);
  });

  it('keeps period labels short numbers and never repeats a year label', () => {
    const historyLabels = dailyLabels(520);
    const futureLabels = dailyLabels(6, Date.UTC(2024, 5, 1));

    const period = buildForecastAxisTicks({ historyLabels, futureLabels, format: 'period', plotWidthPx: 810 });
    const forecastTexts = period.ticktext.filter((text) => /^\d+$/.test(text)).map(Number);
    expect(forecastTexts.length).toBeGreaterThanOrEqual(1);
    // أرقام فترات التوقع تصاعدية وضمن الأفق، لا "P1…P6" المتلاصقة.
    for (const ordinal of forecastTexts) expect(ordinal).toBeGreaterThanOrEqual(1);
    for (const ordinal of forecastTexts) expect(ordinal).toBeLessThanOrEqual(futureLabels.length);
    expect([...forecastTexts].sort((a, b) => a - b)).toEqual(forecastTexts);

    const year = buildForecastAxisTicks({ historyLabels, futureLabels, format: 'year', plotWidthPx: 810 });
    for (let i = 1; i < year.ticktext.length; i += 1) {
      expect(year.ticktext[i]).not.toBe(year.ticktext[i - 1]);
    }
    expect(year.ticktext.every((text) => /^\d{4}$/.test(text))).toBe(true);
  });

  it('gives a narrow phone width far fewer ticks than a desktop width', () => {
    const historyLabels = dailyLabels(520);
    const futureLabels = dailyLabels(6, Date.UTC(2024, 5, 1));
    const phone = buildForecastAxisTicks({ historyLabels, futureLabels, format: 'date', plotWidthPx: 260 });
    const desktop = buildForecastAxisTicks({ historyLabels, futureLabels, format: 'date', plotWidthPx: 900 });
    expect(phone.tickvals.length).toBeLessThan(desktop.tickvals.length);
  });

  it('estimates label width from the text length', () => {
    expect(estimateTickWidth('2024-06-09')).toBeGreaterThan(estimateTickWidth('P6'));
  });
});
