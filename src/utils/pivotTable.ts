/**
 * محرّك الجداول المحورية (Pivot Tables) — index × columns × aggfunc
 * ينفّذ نفس مبدأ `df.pivot_table(values=, index=, columns=, aggfunc=)`:
 * كل صف = قيمة مميزة من حقل الصفوف، وكل عمود = قيمة مميزة من حقل الأعمدة،
 * وكل خلية = تجميع رياضي/إحصائي لقيم المقاييس التي تقع في تقاطع (صف، عمود).
 */
import { AggregationFunction } from '../types';
import { computeMathematicalAggregation } from './aggregationMath';

/** يستخرج قيمة رقمية نظيفة من أي خلية خام (يتسامح مع "$1,200" و"45%" و"1 500") */
export function cleanNumeric(v: unknown): number {
  if (v === null || v === undefined) return NaN;
  if (typeof v === 'number') return v;
  const parsed = parseFloat(String(v).replace(/[\$\s%,]/g, ''));
  return isNaN(parsed) ? NaN : parsed;
}

export interface PivotMatrixResult {
  /** الترتيب الظاهر لقيم حقل الصفوف (index) — بترتيب أول ظهور في البيانات */
  rowKeys: string[];
  /** الترتيب الظاهر لقيم حقل الأعمدة (columns) — بترتيب أول ظهور في البيانات */
  colKeys: string[];
  /** قيمة الخلية مجمّعة: cells[rowIndex][colIndex] */
  values: (number | null)[][];
  /** إجمالي كل صف (مجمّع بأصل الدالة عبر كل أعمدة الصف) */
  rowTotals: number[];
  /** إجمالي كل عمود */
  colTotals: number[];
  /** الإجمالي العام */
  grandTotal: number;
  /** عدد الخلايا الفارغة (تقاطعات بلا بيانات) */
  emptyCells: number;
}

/**
 * يبني مصفوفة محورية كاملة من صفوف خام. القيم النصية أُفريَ أن تُعرض كما هي مع
 * فراغ إلى '' — وعمودان هذه الدالة تتجاهَل الفجوات (لا تُفشِل).
 */
export function buildPivotMatrix(
  rows: Record<string, any>[] | null | undefined,
  rowField: string,
  colField: string,
  valueField: string,
  aggregation: AggregationFunction = 'sum',
  /** أقصى عدد أعمدة معروضة قبل التجاهل (حماية الأداء) */
  maxCols: number = 24,
  /** أقصى عدد صفوف معروضة */
  maxRows: number = 50
): PivotMatrixResult {
  const empty: PivotMatrixResult = {
    rowKeys: [], colKeys: [], values: [], rowTotals: [], colTotals: [],
    grandTotal: 0, emptyCells: 0,
  };
  if (!rows || rows.length === 0 || !rowField || !colField || !valueField) return empty;

  // جمع القيم الرقمية لكل تقاطع (صف، عمود)
  const rowFirstSeen = new Map<string, number>();
  const colFirstSeen = new Map<string, number>();
  const buckets: Map<string, number[]> = new Map();

  rows.forEach(r => {
    const rawRow = r[rowField] ?? r.name ?? '—';
    const rowKey = String(rawRow).trim() || '—';
    const rawCol = r[colField] ?? r.value ?? '—';
    const colKey = String(rawCol).trim() || '—';

    if (!rowFirstSeen.has(rowKey)) rowFirstSeen.set(rowKey, rowFirstSeen.size);
    if (!colFirstSeen.has(colKey)) colFirstSeen.set(colKey, colFirstSeen.size);

    const val = cleanNumeric(r[valueField]);
    if (Number.isNaN(val)) return; // صف بلا قيمة مقيسة — مترجَم في count أيضاً

    const bucketKey = `${rowKey}|||${colKey}`;
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
    buckets.get(bucketKey)!.push(val);
  });

  const rowKeys = [...rowFirstSeen.keys()].slice(0, maxRows);
  const colKeys = [...colFirstSeen.keys()].slice(0, maxCols);
  const rowSet = new Set(rowKeys);
  const colSet = new Set(colKeys);

  // تجميع الخلايا
  const values: (number | null)[][] = rowKeys.map(() => colKeys.map(() => null));
  let emptyCells = 0;

  buckets.forEach((vals, key) => {
    const [rowKey, colKey] = key.split('|||');
    if (!rowSet.has(rowKey) || !colSet.has(colKey)) return;
    const ri = rowKeys.indexOf(rowKey);
    const ci = colKeys.indexOf(colKey);
    values[ri][ci] = computeMathematicalAggregation(vals, aggregation);
  });

  rowKeys.forEach((_, ri) => {
    colKeys.forEach((_, ci) => {
      if (values[ri][ci] === null) emptyCells += 1;
    });
  });

  // الإجماليات — تُحسب من الخلايا غير الفارغة (طريقة الإيجاز: بسيطة وقريبة من التوقعات)
  const rowTotals = rowKeys.map((_, ri) => {
    const present = values[ri].filter(v => v !== null) as number[];
    return computeMathematicalAggregation(present, aggregation);
  });
  const colTotals = colKeys.map((_, ci) => {
    const present = values.map(r => r[ci]).filter(v => v !== null) as number[];
    return computeMathematicalAggregation(present, aggregation);
  });
  const grandTotal = computeMathematicalAggregation(
    values.flat().filter(v => v !== null) as number[],
    aggregation
  );

  return { rowKeys, colKeys, values, rowTotals, colTotals, grandTotal, emptyCells };
}
