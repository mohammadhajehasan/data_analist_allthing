/**
 * محوّلات المصدر: من مجموعة البيانات المحفوظة إلى مدخلات المحرّكات.
 *
 * لماذا: العشرون محرّكًا كانت تستقبل صفوفًا/سلاسل من الواجهة (لصق يدوي)، وهو ما
 * يجعل «تدقيق الجودة» و«الشذوذ» يعملان على ما يكتبه المستخدم لا على بياناته.
 * هنا يُقرأ المصدر من مخزن المجموعات على الخادم، ويُقيَّد الحجم قبل أي حساب،
 * فتصبح كل أداة قادرة على العمل على البيانات الحقيقية بلا وسيط.
 */

import { getUserDataset, listUserDatasets, type StoredDatasetRow } from '../datasetsStore';

/** سقف الصفوف الذي تدخله أي أداة (حماية معالج + خصوصية). */
export const MAX_ANALYST_ROWS = 5000;
/** سقف نقاط السلسلة الزمنية (أعلى من اللازم للكشف الموسمي). */
export const MAX_SERIES_POINTS = 2000;

export interface SourceColumn {
  name: string;
  type: string;
}

export interface DatasetSummary {
  id: string;
  name: string;
  rowCount: number;
  columnCount: number;
  updatedAt: string;
}

export interface DatasetSource {
  id: string;
  name: string;
  rows: Array<Record<string, unknown>>;
  columns: SourceColumn[];
  rowCount: number;
  /** هل قُصّت الصفوف عند السقف؟ يُعلَن للمستخدم ولا يُخفى. */
  truncated: boolean;
  /** آخر تحديث للمجموعة — أساس حكم الطزاجة. */
  updatedAt: string | null;
}

export type FreshnessLevel = 'fresh' | 'aging' | 'stale' | 'unknown';

export interface Freshness {
  ageHours: number | null;
  level: FreshnessLevel;
  labelAr: string;
  labelEn: string;
  /** هل تستحق تنبيهًا عند الاستخدام؟ (aging أو stale) */
  warn: boolean;
}

/**
 * طزاجة البيانات: تحليل على مجموعة عمرها شهر يُقرأ كأنه اليوم — أخطر من
 * خطأ حسابي لأنه لا يبدو خطأً. الحدود: أقل من يوم طازج، أقل من أسبوع يقدم،
 * وما بعده قديم.
 */
export function describeFreshness(updatedAt?: string | null, now: Date = new Date()): Freshness {
  const parsed = updatedAt ? Date.parse(updatedAt) : NaN;
  if (!Number.isFinite(parsed)) {
    return { ageHours: null, level: 'unknown', labelAr: 'طزاجة غير معروفة', labelEn: 'Freshness unknown', warn: false };
  }
  const ageHours = Math.max(0, (now.getTime() - parsed) / 3_600_000);
  if (ageHours < 24) {
    return {
      ageHours,
      level: 'fresh',
      labelAr: `حُدّثت قبل ${Math.max(1, Math.round(ageHours))} ساعة`,
      labelEn: `Updated ${Math.max(1, Math.round(ageHours))}h ago`,
      warn: false,
    };
  }
  const days = Math.floor(ageHours / 24);
  if (ageHours < 24 * 7) {
    return {
      ageHours,
      level: 'aging',
      labelAr: `حُدّثت قبل ${days} يوم`,
      labelEn: `Updated ${days}d ago`,
      warn: true,
    };
  }
  return {
    ageHours,
    level: 'stale',
    labelAr: `قديمة — آخر تحديث قبل ${days} يوم`,
    labelEn: `Stale — last updated ${days}d ago`,
    warn: true,
  };
}

interface ParsedPayload {
  data: Array<Record<string, unknown>>;
  columns: SourceColumn[];
}

function parsePayload(row: StoredDatasetRow): ParsedPayload {
  try {
    const parsed = JSON.parse(row.payload) as {
      data?: unknown;
      rows?: unknown;
      columns?: unknown;
    };
    const data = Array.isArray(parsed.data)
      ? (parsed.data as Array<Record<string, unknown>>)
      : Array.isArray(parsed.rows)
        ? (parsed.rows as Array<Record<string, unknown>>)
        : [];
    const columns: SourceColumn[] = Array.isArray(parsed.columns)
      ? (parsed.columns as Array<{ name?: unknown; type?: unknown }>)
          .filter((c) => c && typeof c.name === 'string')
          .map((c) => ({ name: String(c.name), type: String(c.type || 'string') }))
      : [];
    return { data, columns };
  } catch {
    return { data: [], columns: [] };
  }
}

/** استنتاج أنواع الأعمدة حين لا يحملها الملف (أو يحملها ناقصة). */
export function inferColumns(rows: Array<Record<string, unknown>>): SourceColumn[] {
  if (!rows.length) return [];
  const names = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  return names.map((name) => {
    const values = rows.map((r) => r[name]).filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
    const numeric = values.filter((v) => Number.isFinite(Number(v))).length;
    const dateLike = values.filter((v) => !Number.isNaN(Date.parse(String(v))) && /\d/.test(String(v))).length;
    const type = values.length && numeric / values.length >= 0.9
      ? 'number'
      : values.length && dateLike / values.length >= 0.9
        ? 'date'
        : 'string';
    return { name, type };
  });
}

export function capRows<T>(input: T[], cap = MAX_ANALYST_ROWS): { rows: T[]; truncated: boolean } {
  const rows = Array.isArray(input) ? input : [];
  return rows.length > cap ? { rows: rows.slice(0, cap), truncated: true } : { rows, truncated: false };
}

export async function listDatasetSummaries(userId: string): Promise<DatasetSummary[]> {
  const stored = await listUserDatasets(userId);
  return stored.map((row) => {
    const parsed = parsePayload(row);
    const columns = parsed.columns.length ? parsed.columns : inferColumns(parsed.data);
    return {
      id: row.id,
      name: row.name,
      rowCount: Number(row.row_count) || parsed.data.length,
      columnCount: columns.length,
      updatedAt: row.updated_at,
    };
  });
}

/**
 * تحميل مجموعة المستخدم: بالمعرّف إن مُرّر، وإلا أحدث مجموعة.
 * `null` تعني «لا توجد بيانات» — وهذا فرق مهم عن «فشل».
 */
export async function loadDatasetSource(userId: string, datasetId?: string): Promise<DatasetSource | null> {
  const stored = datasetId
    ? await getUserDataset(userId, datasetId)
    : (await listUserDatasets(userId))[0];
  if (!stored) return null;
  const parsed = parsePayload(stored);
  if (!parsed.data.length) return null;
  const { rows, truncated } = capRows(parsed.data, MAX_ANALYST_ROWS);
  const columns = parsed.columns.length ? parsed.columns : inferColumns(rows);
  return {
    id: stored.id,
    name: stored.name,
    rows,
    columns,
    rowCount: Number(stored.row_count) || parsed.data.length,
    truncated,
    updatedAt: stored.updated_at || null,
  };
}

/** الأعمدة الرقمية القابلة للقياس — تُستخدم في اختيار سلسلة الشذوذ. */
export function numericColumns(source: DatasetSource): SourceColumn[] {
  return source.columns.filter((c) => {
    const values = source.rows.map((r) => r[c.name]).filter((v) => v !== null && v !== undefined && String(v) !== '');
    if (!values.length) return false;
    const numeric = values.filter((v) => Number.isFinite(Number(v))).length;
    return numeric / values.length >= 0.8;
  });
}

export function labelColumns(source: DatasetSource): SourceColumn[] {
  const numeric = new Set(numericColumns(source).map((c) => c.name));
  return source.columns.filter((c) => !numeric.has(c.name));
}

/**
 * بناء سلسلة زمنية من صفوف حقيقية: عمود التسمية (أو أول عمود غير رقمي) مقابل
 * عمود القيمة (أو أول عمود رقمي). تُعاد في ترتيب الصفوف كما هو — الترتيب جزء
 * من معنى السلسلة، وقلبه يقلب الاتجاه.
 */
export function seriesFromSource(
  source: DatasetSource,
  labelColumn?: string,
  valueColumn?: string
): { label: string; value: number }[] {
  const numeric = numericColumns(source);
  const value = valueColumn || numeric[0]?.name;
  if (!value) return [];
  const labels = labelColumns(source);
  const label = labelColumn || labels[0]?.name || source.columns[0]?.name;
  const out: Array<{ label: string; value: number }> = [];
  for (const row of source.rows) {
    const value_ = Number(row[value]);
    if (!Number.isFinite(value_)) continue;
    out.push({ label: label ? String(row[label] ?? '') : String(out.length + 1), value: value_ });
    if (out.length >= MAX_SERIES_POINTS) break;
  }
  return out;
}

/** ملخّص وصف الأعمدة لعرضه في الواجهة وتمريره للمساعد. */
export function describeSource(source: DatasetSource): string {
  const cols = source.columns.slice(0, 12).map((c) => `${c.name} (${c.type})`).join(', ');
  return `${source.name}: ${source.rowCount.toLocaleString('en-US')} صفًا${source.truncated ? ` (حُلّلت أول ${source.rows.length.toLocaleString('en-US')} صف)` : ''} — ${cols}`;
}
