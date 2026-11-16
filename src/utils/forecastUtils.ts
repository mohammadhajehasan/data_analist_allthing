/**
 * Forward forecasting helpers for the modeling studio.
 *
 * The studio fits a regression model on tabular features. To project it into
 * the future we extrapolate every feature along its own linear time trend and
 * feed those projected feature vectors back into the trained model, so the
 * forecast is produced by the model itself (not by a separate trend line).
 */

export interface ForecastInputRow {
  label: string;
  features: number[];
  actual: number;
}

export interface ForecastPoint {
  step: number;
  label: string;
  predicted: number;
  lower: number;
  upper: number;
  changePct: number | null;
  /** Seasonal offset that was added to the model output (0 when none applies). */
  seasonalAdjustment: number;
  /** True when at least one projected feature lands outside the observed range. */
  outsideTrainingRange: boolean;
}

export type SeasonalityKind = 'weekly' | 'quarterly' | 'semiannual' | 'monthly' | 'annual' | 'custom';

/** Sampling cadence inferred from the row labels, with the cycles it implies. */
export interface SeriesCadence {
  unit: 'day' | 'week' | 'month' | 'quarter' | 'year';
  stepDays: number;
  /** Cycle lengths that carry a name for this cadence, in periods. */
  cycles: Array<{ period: number; kind: SeasonalityKind }>;
  /** Longest lag worth testing for this cadence. */
  maxPeriod: number;
}

/**
 * Works out the sampling interval of a labelled series (daily, weekly, monthly,
 * quarterly, yearly) so seasonality can be searched at the right scale: a
 * weekly cycle is 7 rows of daily data, a quarterly one is 3 rows of monthly
 * data, and so on.
 */
export function detectCadence(labels: string[]): SeriesCadence | null {
  const trimmed = labels.map((label) => (label ?? '').toString().trim());
  if (trimmed.length < 3) return null;
  if (trimmed.every((label) => QUARTER_LABEL.test(label))) {
    return { unit: 'quarter', stepDays: 91, cycles: [{ period: 4, kind: 'annual' }], maxPeriod: 16 };
  }
  const times = trimmed.map((label) => Date.parse(label));
  if (!times.every((time) => Number.isFinite(time))) return null;
  const stepDays = median(times.slice(1).map((time, index) => time - times[index])) / 86_400_000;
  if (!Number.isFinite(stepDays) || stepDays <= 0) return null;

  if (stepDays <= 1.5) {
    return {
      unit: 'day',
      stepDays,
      cycles: [
        { period: 7, kind: 'weekly' },
        { period: 30, kind: 'monthly' },
        { period: 91, kind: 'quarterly' },
        { period: 365, kind: 'annual' },
      ],
      maxPeriod: 366,
    };
  }
  if (stepDays <= 8) {
    return {
      unit: 'week',
      stepDays,
      cycles: [
        { period: 4, kind: 'monthly' },
        { period: 13, kind: 'quarterly' },
        { period: 52, kind: 'annual' },
      ],
      maxPeriod: 104,
    };
  }
  if (stepDays <= 40) {
    return {
      unit: 'month',
      stepDays,
      cycles: [
        { period: 3, kind: 'quarterly' },
        { period: 6, kind: 'semiannual' },
        { period: 12, kind: 'annual' },
      ],
      maxPeriod: 24,
    };
  }
  if (stepDays <= 100) {
    return {
      unit: 'quarter',
      stepDays,
      cycles: [{ period: 4, kind: 'annual' }],
      maxPeriod: 16,
    };
  }
  if (stepDays <= 370) {
    return {
      unit: 'year',
      stepDays,
      cycles: [],
      maxPeriod: 10,
    };
  }
  return null;
}

/**
 * Names a detected cycle using the series cadence, falling back to the period
 * length when the labels are not dates (e.g. 3 or 4 still reads as quarterly).
 */
export function seasonalityKind(period: number | null, cadence: SeriesCadence | null): SeasonalityKind | null {
  if (!period || period < 2) return null;
  const named = cadence?.cycles.find((cycle) => cycle.period === period);
  if (named) return named.kind;
  if (period === 7) return 'weekly';
  if (period === 3 || period === 4 || period === 91 || period === 13) return 'quarterly';
  if (period === 30 || period === 31) return 'monthly';
  if (period === 6) return 'semiannual';
  if (period === 12 || period === 52 || period === 365) return 'annual';
  return 'custom';
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Names each phase of the cycle using the series its own labels, so a 7-period
 * cycle on daily data reads Sun…Sat and a 12-period cycle reads Jan…Dec instead
 * of bare indexes.
 */
function buildPhaseLabels(labels: string[], period: number, cadence: SeriesCadence | null): string[] {
  const fallback = Array.from({ length: period }, (_, index) => `#${index + 1}`);
  const first = Date.parse((labels[0] ?? '').toString().trim());
  if (!Number.isFinite(first) || !cadence) return fallback;
  const anchor = new Date(first);

  if (cadence.unit === 'day' && period === 7) {
    return Array.from({ length: period }, (_, index) => WEEKDAYS[(anchor.getUTCDay() + index) % 7]);
  }
  if (cadence.unit === 'day' && (period === 30 || period === 31)) {
    return Array.from({ length: period }, (_, index) => `#${index + 1}`);
  }
  if ((cadence.unit === 'month' || cadence.unit === 'quarter') && (period === 12 || period === 4 || period === 6)) {
    const monthsPerPhase = period === 12 ? 1 : 12 / period;
    const startMonth = anchor.getUTCMonth();
    return Array.from({ length: period }, (_, index) => {
      if (period === 4) return `Q${index + 1}`;
      const monthIndex = startMonth + index * monthsPerPhase;
      if (monthsPerPhase === 1) return MONTHS[monthIndex % 12];
      return `${MONTHS[monthIndex % 12]}\u2013${MONTHS[(monthIndex + monthsPerPhase - 1) % 12]}`;
    });
  }
  if (cadence.unit === 'quarter' && period === 4) {
    return Array.from({ length: period }, (_, index) => `Q${((Math.floor(anchor.getUTCMonth() / 3) + index) % 4) + 1}`);
  }
  return fallback;
}

export interface SeasonalityInfo {
  /** A repeating pattern exists in the model residuals. */
  detected: boolean;
  /** The detected pattern was strong enough to be added to the forecast. */
  applied: boolean;
  /** Cycle length in periods (e.g. 12 for monthly data with a yearly cycle). */
  period: number | null;
  /** Share of residual variance explained by the seasonal component (0..1). */
  strength: number;
  /** Strength threshold this run used to accept or reject a cycle (0..1). */
  threshold: number;
  /** Average residual offset for each phase of the cycle. */
  indices: number[];
  /** How many full cycles the history covers. */
  cycles: number;
  /** English name of each phase (weekday, month, quarter or "#n"), aligned to the data. */
  phaseLabels: string[];
  /** Named meaning of the cycle for the observed cadence (weekly, quarterly...). */
  kind: SeasonalityKind | null;
  /** Sampling cadence read from the labels, if they were dates. */
  cadence: SeriesCadence['unit'] | null;
}

export interface ForecastSummary {
  lastActual: number;
  lastLabel: string;
  nextValue: number;
  nextChangeAbs: number;
  nextChangePct: number | null;
  horizonValue: number;
  horizonChangePct: number | null;
  avgStepChangePct: number | null;
  direction: 'up' | 'down' | 'flat';
  seasonality: SeasonalityInfo;
  peak: ForecastPoint;
  trough: ForecastPoint;
  confidence: number;
  bandWidthNext: number;
  rmse: number;
  mae: number;
  mape: number | null;
  r2: number;
  reliability: 'high' | 'medium' | 'low';
  extrapolatedFeatureCount: number;
  historyCount: number;
}

export interface ForecastHistoryPoint {
  label: string;
  actual: number;
  fitted: number;
}

export interface ForecastResult {
  history: ForecastHistoryPoint[];
  points: ForecastPoint[];
  summary: ForecastSummary;
}

const TIME_COLUMN_PATTERN =
  /(date|datetime|timestamp|time|month|year|quarter|week|period|season|تاريخ|وقت|شهر|سنة|سنه|سنہ|ربع|أسبوع|اسبوع|أسبوعي|يوم|فترة|فتره|موسم)/i;

/** Picks the column that most likely represents the chronological axis. */
export function detectTimeColumn(headers: string[], exclude: string[] = []): string | null {
  const excluded = new Set(exclude);
  const candidates = headers.filter((h) => h && !excluded.has(h) && TIME_COLUMN_PATTERN.test(h));
  if (candidates.length === 0) return null;
  const ordered = [...candidates].sort((a, b) => {
    const score = (value: string) => (/^(date|datetime|timestamp|تاريخ|وقت)/i.test(value) ? 2 : 1);
    return score(b) - score(a);
  });
  return ordered[0];
}

/** Least-squares slope/intercept of a series against its position index. */
export function linearTrend(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  if (n === 1) return { slope: 0, intercept: values[0] };

  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i += 1) {
    sx += i;
    sy += values[i];
    sxx += i * i;
    sxy += i * values[i];
  }
  const denominator = n * sxx - sx * sx;
  const slope = denominator === 0 ? 0 : (n * sxy - sx * sy) / denominator;
  const intercept = (sy - slope * sx) / n;
  return { slope, intercept };
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((acc, v) => acc + (v - m) * (v - m), 0) / (values.length - 1);
}

/** Normalised autocorrelation of a series at a given lag. */
export function autocorrelation(values: number[], lag: number): number {
  const n = values.length;
  if (lag <= 0 || lag >= n) return 0;
  const m = mean(values);
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i += 1) {
    const centered = values[i] - m;
    denominator += centered * centered;
    if (i + lag < n) numerator += centered * (values[i + lag] - m);
  }
  return denominator === 0 ? 0 : numerator / denominator;
}

/** A cycle has to explain at least this much residual variance to be reported. */
export const MIN_SEASONAL_STRENGTH = 0.18;

/**
 * Share of variance a cycle explains after paying for its phases. Averaging p
 * groups always removes about p/n of the variance, so a long cycle fitted to
 * short, noisy data looks seasonal when it is not; correcting for those degrees
 * of freedom keeps random residuals from being reported as a cycle.
 */
function correctedSeasonalStrength(values: number[], period: number): number {
  const n = values.length;
  if (period < 2 || n <= period + 1) return 0;
  const total = variance(values);
  if (total <= 0) return 0;
  const indices = seasonalIndices(values, period);
  const residual = variance(values.map((value, index) => value - indices[index % period]));
  const naive = 1 - residual / total;
  const corrected = 1 - (1 - naive) * ((n - 1) / (n - period));
  return Math.max(0, Math.min(1, corrected));
}

export function detectSeasonalPeriod(
  values: number[],
  maxPeriod = 24,
  /** Cycle lengths that mean something for this cadence; preferred on near-ties. */
  preferred: number[] = []
): { period: number; acf: number; strength: number } | null {
  const n = values.length;
  if (n < 6) return null;
  const namedLimit = Math.max(2, Math.min(maxPeriod, Math.floor(n / 2)));
  // Unknown cycles get a tighter budget: scanning hundreds of lags is what
  // invents "seasonality" in random residuals. Named cycles (7 for daily, 12
  // for monthly...) may use longer lags, since they are what the user expects.
  const exploreLimit = Math.max(2, Math.min(namedLimit, Math.floor(n / 4)));
  // A fixed 0.25 cut-off hides real cycles on long series (a day-of-week effect
  // in a year of data sits around 0.14), so use the ~95% significance band,
  // bounded to stay conservative at both ends.
  const threshold = Math.min(0.25, Math.max(0.08, 2 / Math.sqrt(n)));

  type Candidate = { period: number; acf: number; strength: number };
  const candidates: Candidate[] = [];
  for (let k = 2; k <= exploreLimit; k += 1) {
    const acf = autocorrelation(values, k);
    if (acf < threshold) continue;
    const previous = autocorrelation(values, k - 1);
    const next = k + 1 <= exploreLimit ? autocorrelation(values, k + 1) : -1;
    if (acf < previous || acf < next) continue;
    candidates.push({ period: k, acf, strength: correctedSeasonalStrength(values, k) });
  }

  // Named cycles of the cadence win unless something else explains clearly more
  // variance: raw peaks also land on multiples (14 for a weekly cycle), and a
  // 21-day half-month hump beats 7 on some daily series by pure autocorrelation.
  const named = preferred
    .filter((period) => period >= 2 && period <= namedLimit)
    .map((period) => ({ period, acf: autocorrelation(values, period), strength: correctedSeasonalStrength(values, period) }))
    .filter((candidate) => candidate.acf >= threshold);

  if (candidates.length === 0 && named.length === 0) return null;

  const strongest = [...candidates, ...named].reduce((best, candidate) =>
    candidate.strength > best.strength ? candidate : best
  );
  // Rank named cycles by autocorrelation, not by explained variance: a 12-phase
  // fit reproduces a 3-phase cycle exactly (each value repeated four times), so
  // strength cannot tell them apart and would report the longer, vaguer cycle.
  const bestNamed = named.reduce<Candidate | null>(
    (best, candidate) =>
      candidate.strength >= strongest.strength * 0.6 && (!best || candidate.acf > best.acf) ? candidate : best,
    null
  );
  return bestNamed ?? strongest;
}

/** Per-phase average residual, centred so the component sums to zero. */
export function seasonalIndices(residuals: number[], period: number): number[] {
  if (period <= 0) return [];
  const sums = new Array(period).fill(0);
  const counts = new Array(period).fill(0);
  residuals.forEach((value, index) => {
    const phase = index % period;
    sums[phase] += value;
    counts[phase] += 1;
  });
  const averages = sums.map((sum, index) => (counts[index] > 0 ? sum / counts[index] : 0));
  const offset = mean(averages);
  return averages.map((value) => value - offset);
}

function zScoreFor(confidence: number): number {
  if (confidence >= 0.99) return 2.5758;
  if (confidence >= 0.95) return 1.96;
  if (confidence >= 0.9) return 1.6449;
  if (confidence >= 0.8) return 1.2816;
  return 1.96;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function formatNumericLabel(value: number, integerLabels: boolean, decimals: number): string {
  if (integerLabels) return String(Math.round(value));
  return Number(value.toFixed(Math.max(0, Math.min(6, decimals)))).toString();
}

/**
 * Builds the next period labels from the observed ones. Numeric sequences keep
 * their step (e.g. 2021, 2022...), ISO dates advance by the median interval,
 * anything else falls back to a simple period counter.
 */
const QUARTER_LABEL = /^(\d{4})[- ]?Q([1-4])$|^Q([1-4])[- ]?(\d{4})$/i;

/** Reads labels such as 2024-Q1, 2024Q1 or Q1 2024 into a quarter index. */
function parseQuarterLabel(label: string): { year: number; quarter: number } | null {
  const yearFirst = /^(\d{4})[- ]?Q([1-4])$/i.exec(label);
  if (yearFirst) return { year: Number(yearFirst[1]), quarter: Number(yearFirst[2]) };
  const quarterFirst = /^Q([1-4])[- ]?(\d{4})$/i.exec(label);
  if (quarterFirst) return { year: Number(quarterFirst[2]), quarter: Number(quarterFirst[1]) };
  return null;
}

export function inferFutureLabels(labels: string[], horizon: number): string[] {
  const result: string[] = [];
  if (horizon <= 0) return result;
  const trimmed = labels.map((l) => (l ?? '').toString().trim());

  // Quarter labels (2024-Q1) are not dates to Date.parse, so advance them here
  // instead of falling back to a generic P<n> counter.
  const quarters = trimmed.map((label) => parseQuarterLabel(label));
  if (quarters.every((quarter) => quarter !== null)) {
    const last = quarters[quarters.length - 1]!;
    const sample = trimmed[0];
    const yearFirst = /^\d{4}/.test(sample);
    const separator = (/^\d{4}([- ]?)Q/i.exec(sample)?.[1] ?? /^Q[1-4]([- ]?)\d{4}$/i.exec(sample)?.[1]) || '-';
    const lastIndex = last.year * 4 + (last.quarter - 1);
    for (let k = 1; k <= horizon; k += 1) {
      const total = lastIndex + k;
      const year = Math.floor(total / 4);
      const quarter = (total % 4) + 1;
      result.push(yearFirst ? `${year}${separator}Q${quarter}` : `Q${quarter}${separator}${year}`);
    }
    return result;
  }

  const numeric = trimmed.map((l) => Number(l.replace(/,/g, '')));
  const numericOk = trimmed.length >= 2 && numeric.every((v) => Number.isFinite(v));
  if (numericOk) {
    const diffs = numeric.slice(1).map((v, i) => v - numeric[i]);
    const step = median(diffs) || 1;
    const integerLabels = trimmed.every((l) => /^-?\d+$/.test(l));
    const decimals = trimmed.reduce((acc, l) => {
      const dot = l.indexOf('.');
      return dot === -1 ? acc : Math.max(acc, l.length - dot - 1);
    }, 0);
    for (let k = 1; k <= horizon; k += 1) {
      result.push(formatNumericLabel(numeric[numeric.length - 1] + step * k, integerLabels, decimals));
    }
    return result;
  }

  const times = trimmed.map((l) => Date.parse(l));
  const datesOk = trimmed.length >= 2 && times.every((t) => Number.isFinite(t));
  if (datesOk) {
    const stepMs = median(times.slice(1).map((t, i) => t - times[i])) || 24 * 60 * 60 * 1000;
    const stepDays = stepMs / 86_400_000;
    const lastDate = new Date(times[times.length - 1]);
    const lastDay = lastDate.getUTCDate();
    const sameDayOfMonth = times.every((t) => new Date(t).getUTCDate() === lastDay);
    const monthEndLabels = times.every((t) => new Date(t).getUTCDate() >= 28);
    const yearMonthLabels = trimmed.every((l) => /^\d{4}-\d{2}$/.test(l));
    const isoDateLabels = trimmed.every((l) => /^\d{4}-\d{2}-\d{2}$/.test(l));
    // A ~monthly cadence must advance by calendar months, not by milliseconds:
    // adding 30.5 days to 2024-01-01 lands on Jan 31 and repeats the label.
    const monthly = stepDays >= 26 && stepDays <= 35;
    const monthStep = Math.max(1, Math.round(stepDays / 30.44));

    const labelFor = (date: Date): string => {
      if (yearMonthLabels) return date.toISOString().slice(0, 7);
      if (isoDateLabels) return date.toISOString().slice(0, 10);
      if (stepDays >= 0.9 && stepDays <= 1.1) return date.toISOString().slice(0, 10);
      return date.toLocaleDateString('en-CA', { year: 'numeric', month: 'short' });
    };

    // Market/business series never fall on a weekend, so a calendar-day step
    // would label future Saturdays and Sundays that cannot exist in the data.
    const businessDays =
      stepDays <= 1.5 &&
      times.every((time) => {
        const weekday = new Date(time).getUTCDay();
        return weekday !== 0 && weekday !== 6;
      });
    if (businessDays) {
      let cursor = times[times.length - 1];
      while (result.length < horizon) {
        cursor += 86_400_000;
        const weekday = new Date(cursor).getUTCDay();
        if (weekday === 0 || weekday === 6) continue;
        result.push(labelFor(new Date(cursor)));
      }
      return result;
    }

    for (let k = 1; k <= horizon; k += 1) {
      if (monthly && (yearMonthLabels || isoDateLabels || sameDayOfMonth || monthEndLabels)) {
        const monthIndex = lastDate.getUTCFullYear() * 12 + lastDate.getUTCMonth() + monthStep * k;
        const year = Math.floor(monthIndex / 12);
        const month = monthIndex % 12;
        const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        const day = Math.min(lastDay, daysInMonth);
        result.push(labelFor(new Date(Date.UTC(year, month, day))));
      } else {
        result.push(labelFor(new Date(times[times.length - 1] + stepMs * k)));
      }
    }
    return result;
  }

  for (let k = 1; k <= horizon; k += 1) {
    result.push(`P${trimmed.length + k}`);
  }
  return result;
}

export function buildForecast(params: {
  rows: ForecastInputRow[];
  fitted: number[];
  predict: (features: number[]) => number;
  horizon: number;
  confidence: number;
  rmse: number;
  r2: number;
  /** When false the seasonal component is detected but not added. */
  applySeasonality?: boolean;
  /**
   * How much residual variance a cycle must explain to count (0..1). Higher is
   * stricter — fewer, better-supported cycles. Defaults to MIN_SEASONAL_STRENGTH.
   */
  seasonalityThreshold?: number;
}): ForecastResult | null {
  const { rows, fitted, predict, confidence, rmse, r2 } = params;
  const horizon = Math.max(0, Math.round(params.horizon));
  const requestedThreshold = Number(params.seasonalityThreshold);
  const seasonalityThreshold = Number.isFinite(requestedThreshold)
    ? Math.min(0.95, Math.max(0.02, requestedThreshold))
    : MIN_SEASONAL_STRENGTH;
  const n = rows.length;
  if (n < 2 || horizon === 0) return null;

  const featureCount = rows[0].features.length;
  if (featureCount === 0) return null;

  const trends: { slope: number; intercept: number; binary: boolean; min: number; max: number }[] = [];
  for (let f = 0; f < featureCount; f += 1) {
    const values = rows.map((row) => row.features[f]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const binary = values.every((v) => Number.isInteger(v)) && max - min <= 1;
    const { slope, intercept } = linearTrend(values);
    trends.push({ slope, intercept, binary, min, max });
  }

  const actualTrend = linearTrend(rows.map((row) => row.actual));
  const futureLabels = inferFutureLabels(
    rows.map((row) => row.label),
    horizon
  );

  // Seasonality is measured on what the regression model failed to explain:
  // a repeating offset in the residuals. This avoids double-counting a cycle
  // the model already captured through its features.
  const residuals = rows.map((row, index) => row.actual - fitted[index]);
  const residualsUsable = residuals.every((value) => Number.isFinite(value));
  const cadence = detectCadence(rows.map((row) => row.label));
  let seasonality: SeasonalityInfo = {
    detected: false,
    applied: false,
    period: null,
    strength: 0,
    threshold: seasonalityThreshold,
    indices: [],
    cycles: 0,
    phaseLabels: [],
    kind: null,
    cadence: cadence?.unit ?? null,
  };
  let residualSigma = Math.max(0, rmse);

  if (residualsUsable && n >= 8) {
    const found = detectSeasonalPeriod(
      residuals,
      cadence?.maxPeriod ?? 24,
      cadence?.cycles.map((cycle) => cycle.period) ?? []
    );
    // Below this the "cycle" is within what random residuals produce anyway.
    if (found && found.strength >= seasonalityThreshold) {
      const indices = seasonalIndices(residuals, found.period);
      const deseasonalised = residuals.map((value, index) => value - indices[index % found.period]);
      const residualVariance = variance(deseasonalised);
      const strength = found.strength;
      const cycles = n / found.period;
      seasonality = {
        detected: true,
        applied: params.applySeasonality !== false && strength >= seasonalityThreshold && cycles >= 2,
        period: found.period,
        strength,
        threshold: seasonalityThreshold,
        indices,
        cycles,
        phaseLabels: buildPhaseLabels(
          rows.map((row) => row.label),
          found.period,
          cadence
        ),
        kind: seasonalityKind(found.period, cadence),
        cadence: cadence?.unit ?? null,
      };
      if (seasonality.applied) residualSigma = Math.sqrt(Math.max(0, residualVariance));
    }
  }

  const z = zScoreFor(confidence);
  const lastActual = rows[n - 1].actual;
  const nextIndex = n - 1;
  const points: ForecastPoint[] = [];

  for (let k = 1; k <= horizon; k += 1) {
    const features: number[] = [];
    let outside = false;
    for (let f = 0; f < featureCount; f += 1) {
      const trend = trends[f];
      // Continue the historical slope from the last observed value instead of
      // from the fitted line: a feature that ends above or below its trend
      // would otherwise jump the whole forecast level in a single step.
      const lastValue = rows[n - 1].features[f];
      let value = lastValue + trend.slope * k;
      if (!Number.isFinite(value)) value = trend.intercept + trend.slope * (nextIndex + k);
      if (!Number.isFinite(value)) value = lastValue;
      if (trend.binary) value = Math.min(trend.max, Math.max(trend.min, Math.round(value)));
      features.push(value);
      const tolerance = Math.max(Math.abs(trend.max), Math.abs(trend.min)) * 1e-9 + 1e-9;
      if (value < trend.min - tolerance || value > trend.max + tolerance) outside = true;
    }

    const seasonalAdjustment =
      seasonality.applied && seasonality.period
        ? seasonality.indices[(nextIndex + k) % seasonality.period]
        : 0;

    let predicted = predict(features);
    if (!Number.isFinite(predicted)) {
      predicted = actualTrend.intercept + actualTrend.slope * (nextIndex + k);
    }
    predicted += seasonalAdjustment;

    // Prediction intervals widen with the horizon: the further out we project,
    // the less the historical residuals constrain the true value.
    const sigma = residualSigma * Math.sqrt(1 + k / n);
    const previousValue = points.length > 0 ? points[points.length - 1].predicted : lastActual;
    const changePct = previousValue !== 0 ? ((predicted - previousValue) / Math.abs(previousValue)) * 100 : null;

    points.push({
      step: k,
      label: futureLabels[k - 1],
      predicted,
      lower: predicted - z * sigma,
      upper: predicted + z * sigma,
      changePct: changePct !== null && Number.isFinite(changePct) ? changePct : null,
      seasonalAdjustment,
      outsideTrainingRange: outside,
    });
  }

  const residualPairs = rows
    .map((row, i) => ({ actual: row.actual, fitted: fitted[i] }))
    .filter((pair) => Number.isFinite(pair.fitted));

  const mae =
    residualPairs.length > 0
      ? residualPairs.reduce((acc, pair) => acc + Math.abs(pair.actual - pair.fitted), 0) / residualPairs.length
      : 0;

  const absolutePercentErrors = residualPairs
    .filter((pair) => Math.abs(pair.actual) > 1e-9)
    .map((pair) => (Math.abs(pair.actual - pair.fitted) / Math.abs(pair.actual)) * 100);
  const mape =
    absolutePercentErrors.length > 0
      ? absolutePercentErrors.reduce((a, b) => a + b, 0) / absolutePercentErrors.length
      : null;

  const nextValue = points[0].predicted;
  const horizonValue = points[points.length - 1].predicted;
  const nextChangeAbs = nextValue - lastActual;
  const nextChangePct = lastActual !== 0 ? (nextChangeAbs / Math.abs(lastActual)) * 100 : null;
  const horizonChangePct = lastActual !== 0 ? ((horizonValue - lastActual) / Math.abs(lastActual)) * 100 : null;

  let avgStepChangePct: number | null = null;
  if (lastActual !== 0 && horizonValue !== 0 && Math.sign(horizonValue) === Math.sign(lastActual)) {
    avgStepChangePct = (Math.pow(horizonValue / lastActual, 1 / horizon) - 1) * 100;
    if (!Number.isFinite(avgStepChangePct)) avgStepChangePct = null;
  }

  // Relative (0.1%) rather than absolute threshold so large-magnitude series
  // are not reported as flat when they still trend clearly.
  const directionThreshold = Math.max(Math.abs(lastActual) * 0.001, 1e-9);
  const direction: ForecastSummary['direction'] =
    horizonValue - lastActual > directionThreshold
      ? 'up'
      : lastActual - horizonValue > directionThreshold
        ? 'down'
        : 'flat';

  const peak = points.reduce((best, p) => (p.predicted > best.predicted ? p : best), points[0]);
  const trough = points.reduce((best, p) => (p.predicted < best.predicted ? p : best), points[0]);

  const reliability: ForecastSummary['reliability'] =
    r2 >= 0.8 && (mape === null || mape <= 12)
      ? 'high'
      : r2 >= 0.5 && (mape === null || mape <= 30)
        ? 'medium'
        : 'low';

  return {
    history: rows.map((row, i) => ({
      label: row.label,
      actual: row.actual,
      fitted: Number.isFinite(fitted[i]) ? fitted[i] : row.actual,
    })),
    points,
    summary: {
      lastActual,
      lastLabel: rows[n - 1].label,
      nextValue,
      nextChangeAbs,
      nextChangePct: nextChangePct !== null && Number.isFinite(nextChangePct) ? nextChangePct : null,
      horizonValue,
      horizonChangePct: horizonChangePct !== null && Number.isFinite(horizonChangePct) ? horizonChangePct : null,
      avgStepChangePct,
      direction,
      seasonality,
      peak,
      trough,
      confidence,
      bandWidthNext: points[0].upper - points[0].lower,
      rmse: Math.max(0, rmse),
      mae,
      mape,
      r2,
      reliability,
      extrapolatedFeatureCount: points.filter((p) => p.outsideTrainingRange).length,
      historyCount: n,
    },
  };
}

/**
 * Rows for the forecast CSV export: the forecast block first, then the full
 * seasonal table (per-phase offset, relative effect and detection metadata) so
 * the cycle can be inspected or re-implemented outside the app.
 */
export function buildForecastTable(
  forecast: ForecastResult,
  options: { language: string; confidence: number }
): (string | number)[][] {
  const ar = options.language === 'ar';
  const table: (string | number)[][] = [
    [
      ar ? 'الفترة' : 'Period',
      ar ? 'التوقع' : 'Forecast',
      `${ar ? 'الحد الأدنى' : 'Lower'} (${options.confidence}%)`,
      `${ar ? 'الحد الأعلى' : 'Upper'} (${options.confidence}%)`,
      ar ? 'التغير %' : 'Change %',
      ar ? 'التعديل الموسمي' : 'Seasonal Adjustment',
    ],
    ...forecast.points.map((point) => [
      point.label,
      Number(point.predicted.toFixed(6)),
      Number(point.lower.toFixed(6)),
      Number(point.upper.toFixed(6)),
      point.changePct === null ? '' : Number(point.changePct.toFixed(2)),
      Number(point.seasonalAdjustment.toFixed(6)),
    ]),
  ];

  const seasonality = forecast.summary.seasonality;
  if (seasonality.indices.length === 0 || !seasonality.period) return table;

  const meanActual =
    forecast.history.length > 0
      ? forecast.history.reduce((sum, point) => sum + point.actual, 0) / forecast.history.length
      : 0;

  table.push(
    [],
    [
      ar
        ? `مؤشرات الموسمية — دورة من ${seasonality.period} فترة`
        : `Seasonal indices — ${seasonality.period}-period cycle`,
    ],
    [
      ar ? 'الطور' : 'Phase',
      ar ? 'اسم الطور' : 'Phase name',
      ar ? 'المؤشر' : 'Seasonal index',
      ar ? 'الأثر %' : 'Effect %',
      ar ? 'الاتجاه' : 'Direction',
    ],
    ...seasonality.indices.map((value, index) => [
      `P${index + 1}`,
      seasonality.phaseLabels[index] ?? '',
      Number(value.toFixed(6)),
      meanActual === 0 ? '' : Number(((value / meanActual) * 100).toFixed(2)),
      value > 0 ? (ar ? 'ارتفاع' : 'Above') : value < 0 ? (ar ? 'انخفاض' : 'Below') : ar ? 'متعادل' : 'Neutral',
    ]),
    [ar ? 'قوة الموسمية %' : 'Seasonal strength %', Number((seasonality.strength * 100).toFixed(2))],
    [ar ? 'عتبة الكشف %' : 'Detection threshold %', Number(seasonality.threshold * 100)],
    [ar ? 'عدد الدورات' : 'Cycles covered', Number(seasonality.cycles.toFixed(2))],
    [ar ? 'مدمجة في التوقع' : 'Applied to forecast', seasonality.applied ? (ar ? 'نعم' : 'Yes') : ar ? 'لا' : 'No']
  );

  return table;
}
