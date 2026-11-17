import { describe, expect, it } from 'vitest';
import { buildForecast, buildForecastTable, detectCadence, type ForecastResult } from '../utils/forecastUtils';

/** Deterministic RNG so a failure can always be reproduced. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDates(count: number, stepDays: number, start = Date.UTC(2019, 0, 6)): string[] {
  return Array.from({ length: count }, (_, i) =>
    new Date(start + i * stepDays * 86_400_000).toISOString().slice(0, 10)
  );
}

/** Fits a straight line and returns a forecast built the way the studio builds it. */
function forecastOf(labels: string[], values: number[], horizon = 6, threshold = 0.18): ForecastResult {
  const n = values.length;
  const mx = (n - 1) / 2;
  const my = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  values.forEach((value, i) => {
    num += (i - mx) * (value - my);
    den += (i - mx) ** 2;
  });
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;
  const result = buildForecast({
    rows: values.map((value, i) => ({ label: labels[i], actual: value, features: [i] })),
    fitted: values.map((_, i) => intercept + slope * i),
    predict: (features) => intercept + slope * features[0],
    horizon,
    confidence: 0.95,
    rmse: 1,
    r2: 0.5,
    seasonalityThreshold: threshold,
  });
  if (!result) throw new Error('buildForecast returned null');
  return result;
}

const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;

describe('golden seasonality lab', () => {
  it('detects a yearly cycle on monthly rows and names the months', () => {
    const labels = Array.from({ length: 72 }, (_, i) => `${2016 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`);
    const values = labels.map((_, i) => 100 + 0.9 * i + 20 * Math.sin((2 * Math.PI * i) / 12));
    const seasonality = forecastOf(labels, values).summary.seasonality;

    expect(seasonality.detected).toBe(true);
    expect(seasonality.period).toBe(12);
    expect(seasonality.kind).toBe('annual');
    expect(seasonality.strength).toBeGreaterThan(0.8);
    expect(seasonality.phaseLabels.slice(0, 3)).toEqual(['Jan', 'Feb', 'Mar']);
  });

  it('finds the yearly cycle in weekly rows even though a year is 52.18 rows', () => {
    // The pattern is tied to the calendar week, not to the row number: the
    // fixed 52-row alignment drifts and used to hide this cycle entirely.
    const labels = isoDates(365, 7, Date.UTC(2015, 0, 5));
    const values = labels.map((label, i) => {
      const week = Math.floor((Date.parse(label) - Date.UTC(2015, 0, 1)) / (7 * 86_400_000));
      return 500 + 0.05 * i + 60 * Math.sin((2 * Math.PI * (week % 52)) / 52);
    });
    const result = forecastOf(labels, values, 8);
    const seasonality = result.summary.seasonality;

    expect(seasonality.period).toBe(52);
    expect(seasonality.kind).toBe('annual');
    expect(seasonality.strength).toBeGreaterThan(0.5);
    expect(detectCadence(labels)?.unit).toBe('week');
    // Future labels keep the weekly cadence across the year boundary.
    expect(result.points.every((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.label))).toBe(true);
  });

  it('names the weekdays of a 7-day cycle in the order the data starts', () => {
    const labels = isoDates(200, 1, Date.UTC(2023, 0, 1)); // a Sunday
    const values = labels.map((label, i) => {
      const weekday = new Date(Date.parse(label)).getUTCDay();
      return 1000 + 0.2 * i + (weekday === 0 || weekday === 6 ? -150 : 110);
    });
    const seasonality = forecastOf(labels, values, 7).summary.seasonality;

    expect(seasonality.period).toBe(7);
    expect(seasonality.kind).toBe('weekly');
    expect(seasonality.phaseLabels).toHaveLength(7);
    expect(seasonality.phaseLabels[0]).toBe('Sunday');
    expect(seasonality.phaseLabels[6]).toBe('Saturday');
    // Weekends must read as the low phases, weekdays as the high ones.
    expect(seasonality.indices[0]).toBeLessThan(0);
    expect(seasonality.indices[6]).toBeLessThan(0);
    expect(seasonality.indices[3]).toBeGreaterThan(0);
  });

  it('applies a second cycle when both a weekly and a yearly pattern exist', () => {
    // Three years of daily rows: a 365-phase cycle cannot be estimated from one.
    const labels = isoDates(1100, 1, Date.UTC(2021, 0, 3));
    const values = labels.map((label, i) => {
      const weekday = new Date(Date.parse(label)).getUTCDay();
      const day = (Date.parse(label) - Date.UTC(2021, 0, 1)) / 86_400_000;
      return 1000 + 0.3 * i + (weekday === 0 || weekday === 6 ? -140 : 100) + 220 * Math.sin((2 * Math.PI * day) / 365.25);
    });
    const seasonality = forecastOf(labels, values, 10).summary.seasonality;

    expect(seasonality.detected).toBe(true);
    const periods = [seasonality.period, ...seasonality.extraCycles.map((cycle) => cycle.period)];
    expect(periods).toContain(7);
    expect(periods).toContain(365);
    expect(seasonality.applied).toBe(true);
  });

  it('does not invent a weekly cycle in pure noise (5% nominal rate)', () => {
    const rand = mulberry32(20240117);
    let accepted = 0;
    const runs = 60;
    for (let run = 0; run < runs; run += 1) {
      const values = Array.from({ length: 365 }, () => rand() * 100);
      const seasonality = forecastOf(isoDates(365, 1), values, 3).summary.seasonality;
      if (seasonality.detected && seasonality.period === 7) accepted += 1;
    }
    expect(accepted / runs).toBeLessThan(0.15);
  });

  it('reports the decomposition and the autocorrelation diagnostics', () => {
    const labels = Array.from({ length: 60 }, (_, i) => `${2015 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`);
    const values = labels.map((_, i) => 200 + 1.5 * i + 25 * Math.sin((2 * Math.PI * i) / 12));
    const result = forecastOf(labels, values, 6);
    const summary = result.summary;

    expect(summary.seasonalSharePct).not.toBeNull();
    expect(summary.seasonalSharePct!).toBeGreaterThan(1);
    expect(summary.lastFitted).toBe(result.history[result.history.length - 1].fitted);
    expect(Math.abs(summary.levelGapPct ?? 0)).toBeLessThan(15);
    expect(result.points[0].modelOutput).toBeDefined();
    expect(Math.abs((result.points[0].modelOutput ?? 0) + result.points[0].seasonalAdjustment - result.points[0].predicted)).toBeLessThan(1e-9);
    expect(summary.seasonality.diagnostics.length).toBeGreaterThan(0);
    const best = summary.seasonality.diagnostics[0];
    expect(best.acf).toBeGreaterThanOrEqual(summary.seasonality.diagnostics[summary.seasonality.diagnostics.length - 1].acf);
    expect(mean(summary.seasonality.diagnostics.map((lag) => lag.lag))).toBeGreaterThan(0);
  });

  it('exports the model component and the diagnostics in the CSV table', () => {
    const labels = Array.from({ length: 48 }, (_, i) => `${2018 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`);
    const values = labels.map((_, i) => 90 + i + 12 * Math.sin((2 * Math.PI * i) / 12));
    const table = buildForecastTable(forecastOf(labels, values), { language: 'ar', confidence: 95 });
    const header = table[0].map(String);

    expect(header).toContain('مكوّن النموذج');
    expect(table.some((row) => String(row[0]).includes('تشخيص الارتباط الذاتي'))).toBe(true);
  });
});
