/**
 * #3 — ملف تدقيق البيانات التلقائي (Data Dossier).
 *
 * لماذا: أغلب «النموذج السيئ» في الحقيقة بيانات سيئة. هذا المحرّك يفحص الجدول
 * كما هو ويُخرج مشكلات مرتّبة بالخطورة مع **سببها** و**إصلاحها** — قبل أن يبني
 * المستخدم تحليلًا على أساس منحرف. وكل مشكلة تحمل أثرها التقديري على الرقم
 * حين يمكن قياسه (مثل نسبة الصفوف المكرّرة التي تُضخّم أي مجموع).
 */

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface DossierIssue {
  id: string;
  severity: IssueSeverity;
  title: string;
  why: string;
  columns: string[];
  fix: string;
  /** أثر رقمي إن أمكن قياسه (نسبة أو قيمة). */
  impact?: string;
}

export interface ColumnProfile {
  name: string;
  kind: 'numeric' | 'date' | 'categorical' | 'text' | 'boolean' | 'id' | 'empty';
  count: number;
  missing: number;
  missingPct: number;
  distinct: number;
  /** أول خمس قيم متكرّرة (للفئات). */
  topValues: Array<{ value: string; count: number }>;
  min?: number;
  max?: number;
  mean?: number;
  median?: number;
  sd?: number;
  /** قيم تبدو كرموز مفقودة مخفية (-999، 9999، N/A…). */
  sentinelHits: number;
  zeroSharePct?: number;
}

export interface DataDossier {
  rowCount: number;
  columnCount: number;
  qualityScore: number; // 0..100
  columns: ColumnProfile[];
  issues: DossierIssue[];
  summary: string;
}

const SENTINELS = new Set(['-999', '-9999', '9999', '99999', 'na', 'n/a', 'null', 'none', 'unknown', 'غير معروف', '?', '-', '']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/;

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

function toNumeric(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const t = v.replace(/[,٬\s]/g, '').replace(/[٪%]$/, '');
    if (t !== '' && !Number.isNaN(Number(t))) return Number(t);
  }
  return null;
}

function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** تعريف نوع العمود من قيمه الفعلية لا من اسمه. */
export function inferColumnKind(values: unknown[]): ColumnProfile['kind'] {
  const present = values.filter((v) => !isBlank(v));
  if (!present.length) return 'empty';
  const numeric = present.filter((v) => toNumeric(v) !== null).length / present.length;
  const dated = present.filter((v) => (typeof v === 'string' ? DATE_RE.test(v.trim()) : v instanceof Date)).length / present.length;
  const bools = present.filter((v) => ['true', 'false', '0', '1', 'yes', 'no', 'نعم', 'لا'].includes(String(v).toLowerCase())).length / present.length;
  const distinct = new Set(present.map((v) => String(v).trim().toLowerCase())).size;
  if (dated >= 0.9) return 'date';
  if (numeric >= 0.9) return 'numeric';
  if (bools >= 0.95 && distinct <= 2) return 'boolean';
  if (distinct > 0 && distinct <= Math.max(2, Math.ceil(present.length * 0.2))) return 'categorical';
  if (/^(id|.*_id|code|رمز|معرف)\b/i.test(String(values.find((v) => !isBlank(v)) ?? '')) && distinct / present.length > 0.95) return 'id';
  return 'text';
}

/** تحليل عمود واحد: الفقد، التكرار، الرموز المخفية، التشتّت. */
export function profileColumn(name: string, rows: Array<Record<string, unknown>>): ColumnProfile {
  const values = rows.map((r) => r[name]);
  const kind = inferColumnKind(values);
  const missing = values.filter(isBlank).length;
  const present = values.filter((v) => !isBlank(v));
  const counts = new Map<string, number>();
  for (const v of present) {
    const key = String(v).trim();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const topValues = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([value, count]) => ({ value, count }));
  const sentinelHits = present.filter((v) => SENTINELS.has(String(v).trim().toLowerCase())).length;
  const profile: ColumnProfile = {
    name,
    kind,
    count: values.length,
    missing,
    missingPct: values.length ? (missing / values.length) * 100 : 0,
    distinct: counts.size,
    topValues,
    sentinelHits,
  };
  if (kind === 'numeric') {
    const nums = present.map(toNumeric).filter((n): n is number => n !== null);
    if (nums.length) {
      const sorted = [...nums].sort((a, b) => a - b);
      const mean = nums.reduce((s, v) => s + v, 0) / nums.length;
      const sd = nums.length > 1 ? Math.sqrt(nums.reduce((s, v) => s + (v - mean) ** 2, 0) / (nums.length - 1)) : 0;
      profile.min = sorted[0];
      profile.max = sorted[sorted.length - 1];
      profile.mean = Number(mean.toFixed(4));
      profile.median = quantile(sorted, 0.5);
      profile.sd = Number(sd.toFixed(4));
      profile.zeroSharePct = (nums.filter((n) => n === 0).length / nums.length) * 100;
    }
  }
  return profile;
}

/** معامل ارتباط بيرسون — يُستخدم لكشف تسريب الهدف. */
export function pearson(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return NaN;
  const mx = x.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const my = y.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let sx = 0, sy = 0, sxy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sx += dx * dx;
    sy += dy * dy;
    sxy += dx * dy;
  }
  if (!sx || !sy) return NaN;
  return sxy / Math.sqrt(sx * sy);
}

export interface DossierOptions {
  /** عمود الهدف (للتصنيف) — يفتح فحوص التسريب والتوازن. */
  target?: string;
  /** أعمدة تاريخية لفحص التواريخ المستقبلية. */
  dateColumns?: string[];
}

/** بناء الملف الكامل: تحليل كل عمود ثم قائمة مشكلات مرتّبة بالخطورة. */
export function buildDossier(rows: Array<Record<string, unknown>>, options: DossierOptions = {}): DataDossier {
  if (!rows.length) {
    return {
      rowCount: 0,
      columnCount: 0,
      qualityScore: 0,
      columns: [],
      issues: [{ id: 'empty', severity: 'critical', title: 'لا صفوف', why: 'لا شيء لتحليله.', columns: [], fix: 'أعد استيراد الملف أو اختر ورقة أخرى.' }],
      summary: 'لا توجد صفوف.',
    };
  }
  const columnNames = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const columns = columnNames.map((c) => profileColumn(c, rows));
  const issues: DossierIssue[] = [];
  const n = rows.length;

  // 1) صفوف مكرّرة بالكامل — تُضخّم أي مجموع بصمت
  const rowKeys = new Map<string, number>();
  for (const r of rows) {
    const key = columnNames.map((c) => String(r[c] ?? '')).join('\u0001');
    rowKeys.set(key, (rowKeys.get(key) || 0) + 1);
  }
  const dupCount = Array.from(rowKeys.values()).filter((c) => c > 1).reduce((s, c) => s + c - 1, 0);
  if (dupCount / n > 0.02) {
    issues.push({
      id: 'duplicate-rows',
      severity: dupCount / n > 0.2 ? 'critical' : 'high',
      title: `${dupCount} صفًّا مكرّرًا بالكامل`,
      why: 'أي SUM أو COUNT سيُضخَّم بنفس النسبة، ويصبح الرقم مبالغًا فيه بلا أي إشارة في التقرير.',
      columns: [],
      fix: 'أزل التكرار مع الحفاظ على نسخة واحدة، أو أضف عمود حدث/طابع زمني يميّز الصفوف الحقيقية.',
      impact: `${((dupCount / n) * 100).toFixed(1)}% من الصفوف`,
    });
  }

  for (const col of columns) {
    if (col.kind === 'empty') {
      issues.push({
        id: `empty-${col.name}`,
        severity: 'medium',
        title: `العمود «${col.name}» فارغ تمامًا`,
        why: 'عمود بلا قيم لا يحمل معلومة، لكنه يشوش فهم المخطط ويُربك المطابقة الدلالية.',
        columns: [col.name],
        fix: 'احذف العمود أو صحّح مصدر الاستيراد.',
      });
      continue;
    }
    if (col.missingPct >= 40) {
      issues.push({
        id: `missing-${col.name}`,
        severity: col.missingPct >= 70 ? 'high' : 'medium',
        title: `${col.missingPct.toFixed(0)}% مفقود في «${col.name}»`,
        why: 'نسبة فقد عالية تعني أن أي تحليل عليه يصف شريحة صغيرة لا الكل، وأي متوسط يتحيّز نحو الحالات المكتملة.',
        columns: [col.name],
        fix: 'افهم أولًا هل الغياب عشوائي أم مرتبط بمجموعة (فقد غير عشوائي)، ثم قرّر: استبعاد العمود، أو تعويض معلَن، أو إبقاؤه وتعليم القارئ.',
        impact: `${col.missing.toLocaleString('en-US')} قيمة ناقصة`,
      });
    }
    if (col.sentinelHits > 0) {
      const pct = (col.sentinelHits / n) * 100;
      issues.push({
        id: `sentinel-${col.name}`,
        severity: col.kind === 'numeric' ? 'high' : 'medium',
        title: `قيم تشبه «رمزًا مفقودًا» في «${col.name}»`,
        why: 'رموز مثل -999 أو 9999 تُقرأ كأرقام حقيقية، فتُفسد المتوسط والانحدار دون أي تحذير.',
        columns: [col.name],
        fix: 'حوّل هذه الرموز إلى NULL قبل أي حساب، وأصلح نظام المصدر الذي يكتبها.',
        impact: `${col.sentinelHits} قيمة (${pct.toFixed(1)}%)`,
      });
    }
    if (col.kind === 'numeric' && col.sd !== undefined && col.sd === 0) {
      issues.push({
        id: `constant-${col.name}`,
        severity: 'low',
        title: `«${col.name}» ثابت`,
        why: 'عمود بقيمة واحدة لا يميّز بين الصفوف؛ إدخاله في نموذج يضيف ضجيجًا بلا معلومة.',
        columns: [col.name],
        fix: 'احذفه من الميزات، أو تحقّق أن المصدر يحدّثه فعلًا.',
      });
    }
    if (col.kind === 'numeric' && col.min !== undefined && col.max !== undefined && col.min < -1e6 && col.max > 1e6) {
      issues.push({
        id: `unit-drift-${col.name}`,
        severity: 'medium',
        title: `مدى «${col.name}» واسع بشكل غير طبيعي`,
        why: 'خلط وحدات أو عملات (دولار وريال، أو 1e3 مقابل 1e6) يجعل المتوسط بلا معنى ويجعل النموذج يتعلّم الوحدة لا الظاهرة.',
        columns: [col.name],
        fix: 'وحّد الوحدة/العملة قبل التحليل، وأضف عمود وحدة صريحًا إن اختلفت المصادر.',
      });
    }
    if (col.kind === 'date') {
      const futuristic = rows.filter((r) => {
        const v = r[col.name];
        if (typeof v !== 'string') return false;
        const t = Date.parse(v);
        return Number.isFinite(t) && t > Date.now() + 24 * 60 * 60 * 1000;
      }).length;
      if (futuristic) {
        issues.push({
          id: `future-dates-${col.name}`,
          severity: 'low',
          title: `${futuristic} تاريخ في المستقبل`,
          why: 'تواريخ مستقبلية غالبًا تعني خطأ إدخال سنة (2026 بدل 2016) أو حقلًا ليس تاريخ حدث أصلًا.',
          columns: [col.name],
          fix: 'راجع أصل القيم، وقيّد الاستيراد بتاريخ اليوم.',
        });
      }
    }
    if (col.kind === 'categorical' && col.distinct > 0) {
      const top = col.topValues[0];
      if (top && top.count / n > 0.95) {
        issues.push({
          id: `dominant-${col.name}`,
          severity: 'low',
          title: `«${col.name}» شبه ثابت (${((top.count / n) * 100).toFixed(1)}% قيمة واحدة)`,
          why: 'التباين شبه معدوم: أي تحليل «حسب هذا العمود» سيقارن 95% بـ5% ويوهم بوجود فرق.',
          columns: [col.name],
          fix: 'ادمج الفئات النادرة أو استبعد العمود من التحليل حسب الفئة.',
        });
      }
    }
  }

  // 2) تسرّب الهدف واختلال التوازن
  const target = options.target ? columns.find((c) => c.name === options.target) : undefined;
  if (target && target.kind === 'numeric') {
    const targetVals = rows.map((r) => toNumeric(r[target.name]));
    for (const col of columns) {
      if (col.name === target.name || col.kind !== 'numeric') continue;
      const xs: number[] = [];
      const ys: number[] = [];
      rows.forEach((r, i) => {
        const x = toNumeric(r[col.name]);
        const y = targetVals[i];
        if (x !== null && y !== null) { xs.push(x); ys.push(y); }
      });
      const r = pearson(xs, ys);
      if (Number.isFinite(r) && Math.abs(r) >= 0.98) {
        issues.push({
          id: `leak-${col.name}`,
          severity: 'critical',
          title: `تسريب هدف محتمل: «${col.name}» (|r| = ${Math.abs(r).toFixed(2)})`,
          why: 'ارتباط شبه تام يعني أن العمود يحتوي الهدف نفسه أو نتيجة حُسبت بعده — النموذج سيبدو ممتازًا ويفشل في الإنتاج.',
          columns: [col.name, target.name],
          fix: 'استبعد العمود من الميزات، أو أثبت أنه متاح فعلًا لحظة التنبؤ.',
        });
      }
    }
  }
  if (target && (target.kind === 'categorical' || target.kind === 'boolean' || target.kind === 'numeric')) {
    const counts = target.topValues;
    const total = counts.reduce((s, c) => s + c.count, 0);
    if (counts.length <= 10 && total) {
      const share = counts[0].count / total;
      if (share > 0.85) {
        issues.push({
          id: 'imbalance',
          severity: 'high',
          title: `اختلال فئات شديد في الهدف «${target.name}»`,
          why: `الفئة «${counts[0].value}» تمثّل ${(share * 100).toFixed(1)}% — دقة 90% قد تأتي من تجاهل الأقلية تمامًا.`,
          columns: [target.name],
          fix: 'اعتمد على precision/recall للفئة الأقل، واستخدم موازنة أو أوزان صفوف، ولا تقرأ accuracy وحدها.',
        });
      }
    }
  }

  const weight = { critical: 25, high: 12, medium: 5, low: 2 } as const;
  const penalty = issues.reduce((s, i) => s + weight[i.severity], 0);
  const qualityScore = Math.max(0, 100 - Math.min(100, penalty));
  const order: IssueSeverity[] = ['critical', 'high', 'medium', 'low'];
  issues.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));

  const summary = issues.length
    ? `${issues.length} مشكلة في جودة البيانات (${issues.filter((i) => i.severity === 'critical' || i.severity === 'high').length} خطيرة) — جودة تقديرية ${qualityScore}/100.`
    : `لا مشكلات جوهرية: ${n.toLocaleString('en-US')} صفًّا و${columnNames.length} عمودًا، جودة ${qualityScore}/100.`;

  return { rowCount: n, columnCount: columnNames.length, qualityScore, columns, issues, summary };
}
