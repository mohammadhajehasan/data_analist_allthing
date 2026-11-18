/**
 * #2 — NL2SQL ذاتي التحقّق: مقارنة نتيجتي استعلامين مستقلين للسؤال نفسه.
 *
 * لماذا: أخطر إجابة ليست الخاطئة الواضحة بل التي «تبدو صحيحة» — JOIN يضاعف
 * الصفوف، WHERE يقصي NULLs، GROUP BY بحبيبية مختلفة. توليد مسارين ومقارنة
 * نتائجهما يلتقط أغلب هذه الأخطاء قبل أن تصل إلى القرار. وحين يختلفان،
 * الصواب ليس اختيار أحدهما بل خفض الثقة وطلب توضيح.
 */

export interface QueryResultSet {
  columns: string[];
  rows: Array<Record<string, unknown>>;
}

export type CrossCheckStatus = 'agree' | 'disagree' | 'inconclusive';

export interface CrossCheckFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  detail: string;
}

export interface CrossCheckReport {
  status: CrossCheckStatus;
  confidence: number; // 0..1
  findings: CrossCheckFinding[];
  /** فقرة عربية جاهزة للعرض بجانب الجواب. */
  verdict: string;
  /** سؤال توضيحي مقترح حين يتعذّر الحسم. */
  clarifyingQuestion: string | null;
}

function numericValue(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function columnSorted(result: QueryResultSet): string[] {
  return [...result.columns].map((c) => c.trim().toLowerCase()).sort();
}

function sumOf(result: QueryResultSet): number {
  let total = 0;
  for (const row of result.rows) {
    for (const col of result.columns) {
      const n = numericValue(row[col]);
      if (n !== null) total += n;
    }
  }
  return total;
}

function keySet(result: QueryResultSet, col: string, limit = 500): Set<string> {
  const set = new Set<string>();
  for (const row of result.rows.slice(0, limit)) {
    const v = row[col];
    set.add(v === null || v === undefined ? '∅' : String(v));
  }
  return set;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const v of a) if (b.has(v)) inter += 1;
  return inter / (a.size + b.size - inter);
}

/** العمود الذي يُرجَّح أنه بُعد (نصي) وآخر رقمي — للمقارنة الدلالية. */
function pickDimensionColumn(result: QueryResultSet): string | null {
  for (const col of result.columns) {
    const sample = result.rows.slice(0, 20).map((r) => r[col]);
    if (sample.length && sample.every((v) => typeof v === 'string')) return col;
  }
  return null;
}

export interface CrossCheckOptions {
  /** نسبة التسامح في المجاميع (افتراضي 0.5%). */
  tolerance?: number;
}

/**
 * مقارنة نتيجتين. التسامح موجود لأن التقريب (ROUND) والفروق العشرية ليست
 * أخطاء تحليلية، بينما فرق 5% في مجموع هو خلل حبيبية/فلاتر.
 */
export function crossCheckResults(
  a: QueryResultSet,
  b: QueryResultSet,
  options: CrossCheckOptions = {}
): CrossCheckReport {
  const tolerance = options.tolerance ?? 0.005;
  const findings: CrossCheckFinding[] = [];
  let agreement = 1;

  const colsA = columnSorted(a);
  const colsB = columnSorted(b);
  if (colsA.join('|') !== colsB.join('|')) {
    findings.push({
      id: 'shape',
      severity: 'high',
      title: 'أعمدة النتيجتين مختلفة',
      detail: `المسار الأول: [${a.columns.join(', ')}] — المسار الثاني: [${b.columns.join(', ')}]`,
    });
    agreement -= 0.4;
  }

  const rowsA = a.rows.length;
  const rowsB = b.rows.length;
  if (rowsA !== rowsB) {
    const ratio = rowsB ? Math.abs(rowsA - rowsB) / Math.max(rowsA, rowsB) : 1;
    findings.push({
      id: 'rowcount',
      severity: ratio > 0.05 ? 'critical' : 'medium',
      title: 'عدد الصفوف مختلف',
      detail: `${rowsA} صفًّا مقابل ${rowsB} — فرق ${Math.round(ratio * 100)}%. غالبًا JOIN مضاعف أو حبيبية مختلفة.`,
    });
    agreement -= Math.min(0.5, ratio * 2);
  }

  const sumA = sumOf(a);
  const sumB = sumOf(b);
  if (Number.isFinite(sumA) && Number.isFinite(sumB) && (sumA !== 0 || sumB !== 0)) {
    const base = Math.max(Math.abs(sumA), Math.abs(sumB));
    const diff = Math.abs(sumA - sumB) / base;
    if (diff > tolerance) {
      findings.push({
        id: 'totals',
        severity: diff > 0.05 ? 'critical' : 'medium',
        title: 'مجموع الأرقام مختلف',
        detail: `${sumA.toLocaleString('en-US', { maximumFractionDigits: 2 })} مقابل ${sumB.toLocaleString('en-US', { maximumFractionDigits: 2 })} — فرق ${(diff * 100).toFixed(1)}%.`,
      });
      agreement -= Math.min(0.5, diff * 3);
    }
  }

  const dimA = pickDimensionColumn(a);
  const dimB = pickDimensionColumn(b);
  if (dimA && dimB) {
    const sim = jaccard(keySet(a, dimA), keySet(b, dimB));
    if (sim < 0.98) {
      findings.push({
        id: 'dimension-keys',
        severity: sim < 0.9 ? 'high' : 'medium',
        title: 'قيم البُعد مختلفة',
        detail: `تشابه قيم «${dimA}» بين النتيجتين ${Math.round(sim * 100)}% — فلاتر أو توحيد نصوص مختلف.`,
      });
      agreement -= (1 - sim) * 0.5;
    }
  }

  if (!a.rows.length && !b.rows.length) {
    return {
      status: 'inconclusive',
      confidence: 0.4,
      findings: [
        ...findings,
        {
          id: 'empty',
          severity: 'medium',
          title: 'النتيجتان فارغتان',
          detail: 'صفر صفوف لا يُثبت صحّة الاستعلام — قد يكون الفلتر خطأً في المسارين معًا.',
        },
      ],
      verdict: 'لا يمكن الحكم: كلتا النتيجتين فارغتان، وتطابق الصفر ليس دليلًا.',
      clarifyingQuestion: 'هل تتوقّع وجود بيانات في هذه الفترة/لهذا الفلتر؟',
    };
  }

  const confidence = Math.max(0, Math.min(1, agreement));
  if (confidence >= 0.9) {
    return {
      status: 'agree',
      confidence,
      findings,
      verdict: 'المسارَان يعطيان نفس الجواب — الثقة مرتفعة.',
      clarifyingQuestion: null,
    };
  }
  if (confidence >= 0.6) {
    return {
      status: 'disagree',
      confidence,
      findings,
      verdict: 'المسارَان متقاربان لكن غير متطابقين — لا تُبنَ قرارات على الفرق قبل تحديد السبب.',
      clarifyingQuestion: 'أيّ الأرقام تعتمد عليه في تقاريرك الحالية؟ سأوحّد التعريف عليه.',
    };
  }
  return {
    status: 'disagree',
    confidence,
    findings,
    verdict: 'المسارَان يعطيان جوابين مختلفين — الرقم غير موثوق.',
    clarifyingQuestion: 'هل «الفترة» تقويمية أم آخر 30 يومًا؟ وهل تُحتسب الصفوف المكرّرة؟',
  };
}
