/**
 * Pre-training audit of the chosen features.
 *
 * A regression on a feature that secretly contains the target produces a
 * perfect-looking model with no predictive value at all. These checks run
 * before `calculateModel` so the studio can warn instead of silently
 * reporting an excellent score.
 */

export type FeatureFindingKind =
  | 'target-leak'
  | 'duplicate-feature'
  | 'constant-feature'
  | 'future-name';

export interface FeatureFinding {
  kind: FeatureFindingKind;
  severity: 'high' | 'medium';
  /** Columns involved, target last when it takes part in the check. */
  columns: string[];
  /** Pearson correlation between `columns[0]` and `columns[1]`, when relevant. */
  correlation?: number;
  /** Share of rows whose values are identical (duplicate check). */
  identicalShare?: number;
}

const LEAK_CORRELATION = 0.98;
const DUPLICATE_CORRELATION = 0.999;
/** Names that usually mean the column was built after the fact. */
const FUTURE_NAME_PATTERN = /(^|[_\s-])(next|future|target|leak|lead|tomorrow|قادم|تالي|مستقبل|لاحق)([_\s-]|$)/i;

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

/** Pearson correlation over the rows where both columns are numeric. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i += 1) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx <= 0 || dy <= 0) return null;
  return num / Math.sqrt(dx * dy);
}

function columnValues(rows: Record<string, unknown>[], column: string): (number | null)[] {
  return rows.map((row) => toNumber(row?.[column]));
}

/**
 * Audits `features` against `target` and against each other.
 * Returns an empty array when nothing suspicious is found.
 */
export function auditFeatures(
  rows: Record<string, unknown>[],
  features: string[],
  target: string
): FeatureFinding[] {
  const findings: FeatureFinding[] = [];
  if (!rows.length || !target || features.length === 0) return findings;

  const targetValues = columnValues(rows, target);
  const featureValues = new Map<string, (number | null)[]>();

  for (const column of features) {
    const values = columnValues(rows, column);
    featureValues.set(column, values);
    const numeric = values.filter((value): value is number => value !== null);

    // A constant column carries no information but inflates the model's
    // parameter count (and with it the adjusted R² penalty).
    if (numeric.length >= 3) {
      const min = Math.min(...numeric);
      const max = Math.max(...numeric);
      if (max - min <= Math.abs(max) * 1e-12 + 1e-12) {
        findings.push({ kind: 'constant-feature', severity: 'medium', columns: [column] });
      }
    }

    if (FUTURE_NAME_PATTERN.test(column)) {
      findings.push({ kind: 'future-name', severity: 'medium', columns: [column] });
    }

    const pairs: Array<[number, number]> = [];
    for (let i = 0; i < rows.length; i += 1) {
      const f = values[i];
      const t = targetValues[i];
      if (f !== null && t !== null) pairs.push([f, t]);
    }
    if (pairs.length >= 5) {
      const correlation = pearson(
        pairs.map((p) => p[0]),
        pairs.map((p) => p[1])
      );
      if (correlation !== null && Math.abs(correlation) >= LEAK_CORRELATION) {
        findings.push({
          kind: 'target-leak',
          severity: 'high',
          columns: [column, target],
          correlation,
        });
      }
    }
  }

  const columns = [...featureValues.keys()];
  for (let i = 0; i < columns.length; i += 1) {
    for (let j = i + 1; j < columns.length; j += 1) {
      const a = featureValues.get(columns[i])!;
      const b = featureValues.get(columns[j])!;
      const pairs: Array<[number, number]> = [];
      let identical = 0;
      let comparable = 0;
      for (let row = 0; row < rows.length; row += 1) {
        const va = a[row];
        const vb = b[row];
        if (va === null || vb === null) continue;
        comparable += 1;
        if (Math.abs(va - vb) <= Math.abs(va) * 1e-12 + 1e-12) identical += 1;
        pairs.push([va, vb]);
      }
      if (comparable < 5) continue;
      const identicalShare = identical / comparable;
      const correlation = pearson(
        pairs.map((p) => p[0]),
        pairs.map((p) => p[1])
      );
      const redundant =
        identicalShare >= 0.999 || (correlation !== null && Math.abs(correlation) >= DUPLICATE_CORRELATION);
      if (redundant) {
        findings.push({
          kind: 'duplicate-feature',
          severity: identicalShare >= 0.999 ? 'high' : 'medium',
          columns: [columns[i], columns[j]],
          correlation: correlation ?? undefined,
          identicalShare,
        });
      }
    }
  }

  return findings;
}

/** Short Arabic/English text for one finding. */
export function describeFinding(finding: FeatureFinding, language: string): { title: string; detail: string } {
  const ar = language === 'ar';
  const [first, second] = finding.columns;
  switch (finding.kind) {
    case 'target-leak': {
      const pct = finding.correlation === undefined ? '' : ` (${(finding.correlation * 100).toFixed(1)}%)`;
      return {
        title: ar ? `تسريب هدف محتمل: ${first}` : `Possible target leak: ${first}`,
        detail: ar
          ? `ارتباط «${first}» بالهدف «${second}» يساوي${pct}. ميزة تحمل الهدف تُنتج نموذجًا يبدو دقيقًا لكنه لا يتنبأ بأي شيء جديد.`
          : `"${first}" correlates with the target "${second}"${pct}. A feature that carries the target gives a model that looks accurate but predicts nothing new.`,
      };
    }
    case 'duplicate-feature': {
      const identical = finding.identicalShare !== undefined && finding.identicalShare >= 0.999;
      return {
        title: ar
          ? `ميزة مكرّرة: ${first} و${second}`
          : `Duplicate feature: ${first} and ${second}`,
        detail: ar
          ? identical
            ? `القيمتان متطابقتان في كل الصفوف تقريبًا؛ إحداهما زائدة وتشوّه مؤشرات التعقيد.`
            : `ارتباطهما ${((finding.correlation ?? 0) * 100).toFixed(1)}% — عمليًا ميزة واحدة مكرّرة، والثانية لا تضيف معلومة.`
          : identical
            ? 'Both columns hold the same value on almost every row; one is redundant and inflates the model complexity metrics.'
            : `They correlate at ${((finding.correlation ?? 0) * 100).toFixed(1)}% — practically the same feature twice, with no added information.`,
      };
    }
    case 'constant-feature':
      return {
        title: ar ? `ميزة ثابتة: ${first}` : `Constant feature: ${first}`,
        detail: ar
          ? 'كل قيم هذا العمود متساوية؛ لن يُغيّر أي توقع ويستهلك درجة حرية في التقييم.'
          : 'Every value in this column is the same; it cannot move a prediction and still costs a degree of freedom.',
      };
    case 'future-name':
    default:
      return {
        title: ar ? `اسم يشير لمعلومة مستقبلية: ${first}` : `Name suggests future information: ${first}`,
        detail: ar
          ? 'اسماً مثل "next" أو "future" يعني عادةً عمودًا محسوبًا بعد وقوع الهدف — تأكد أن هذه القيمة متاحة لحظة التنبؤ.'
          : 'A name like "next" or "future" usually means the column was derived after the target happened — make sure it would be known at prediction time.',
      };
  }
}
