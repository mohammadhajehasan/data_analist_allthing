import type { ErColumn } from './drawioImporter';

/**
 * التحديد الذكي للقيود — استنتاج قيود مقترحة على العمود من اسمه ونوعه.
 *
 * الاقتراح لا يُطبَّق وحده: تعرضه الواجهة كشرائح مقترحة (بحدود متقطعة) يستطيع
 * المستخدم قبولها بالنقر، أو زر واحد يطبقها كلياً. لا نفرض قيداً لم يطلبه المصمِّم.
 *
 * القواعد:
 *   • UNIQUE  : أعمدة مُعرِّفات الاتصال/العنونة — email، slug، code/sku، username، iban، uuid.
 *   • CHECK   : كميات/أسعار/أرصدة بأساس رقمي — يُقترح `>= 0` حيث لا تكون القيم السالبة منطقية.
 *   • NOT NULL: مفاتيح الاتصال `<جدول>_id` المقدَّرة NULL افتراضياً في الحلل — تُقترح NOT NULL فقط
 *               إذا كانت الافتراضية فارغة (أي القيد يُغيِّر الافتراض الحالي، ولا يجتمع مع PK).
 */

export interface ConstraintSuggestion {
  /** اقتراح UNIQUE */
  unique?: boolean;
  /** اقتراح NOT NULL (العمود افتراضاً NULL حالياً) */
  notNull?: boolean;
  /** اقتراح تعبير CHECK خام مثل `>= 0` (تُغلف الواجهة بـ CHECK (اسمالعمود expr) عند التوليد) */
  check?: string;
}

const NUMERIC_BASES = new Set([
  'bit', 'tinyint', 'smallint', 'int', 'int2', 'int4', 'int8', 'integer', 'bigint',
  'decimal', 'numeric', 'float', 'double', 'real', 'money', 'number',
]);

/** الأساس المُطبَّع للنوع: `DECIMAL(10,2)` → 'decimal' */
function typeBase(type: string): string {
  return type.trim().split(/[(\s]/)[0].toLowerCase();
}

function isNumericType(type: string): boolean {
  return NUMERIC_BASES.has(typeBase(type));
}

/** مطابقة بمقاطع الاسم: user_email → ['user','email'] كي يصبّ email/total_amount مثل المقاطع الوحيدة */
function nameSegmentMatches(name: string, tokens: string[]): boolean {
  const segments = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return segments.some(seg => tokens.includes(seg));
}

/** رموز الأعمدة الفريدة الواعي */
const UNIQUE_TOKENS = ['email', 'slug', 'sku', 'code', 'iban', 'uuid', 'handle', 'username'];

/** رموز الكمّيات التي لا تخضع للسالم — لتقدير CHECK >= 0 */
const NON_NEGATIVE_TOKENS = ['price', 'amount', 'total', 'quantity', 'qty', 'age', 'balance', 'stock', 'count', 'fee', 'tax', 'salary', 'weight', 'height'];

/**
 * استنتاج اقتراحات القيود لعمود واحد — فارقية مع الحالة المرَّرة
 * (لا يقترح UNIQUE على عمود UNIQUE أصلاً، ولا NOT NULL على NOT NULL الحالي).
 */
export function inferColumnConstraints(
  col: Pick<ErColumn, 'name' | 'type' | 'isPrimaryKey' | 'isNullable' | 'isUnique' | 'check'>
): ConstraintSuggestion {
  const out: ConstraintSuggestion = {};
  const name = col.name.toLowerCase();

  if (!col.isPrimaryKey) {
    if (!col.isUnique && nameSegmentMatches(name, UNIQUE_TOKENS)) out.unique = true;
    if (!col.check && isNumericType(col.type) && nameSegmentMatches(name, NON_NEGATIVE_TOKENS)) out.check = '>= 0';
  }

  // مفاتيح الاتصال: id أو <جدول>_id — اقتراح NOT NULL فقط إن كانت NULL افتراضياً حالياً
  if (!col.isPrimaryKey && col.isNullable !== false && /(?:^|_)id$/.test(name)) {
    out.notNull = true;
  }

  return out;
}
