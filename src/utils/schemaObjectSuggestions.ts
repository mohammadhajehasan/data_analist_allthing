/**
 * اقتراحات ذكية لكائنات السكيمّا — فهارس وعروض وTriggers.
 *
 * كلها استنتاجات حتمية من النموذج نفسه (لا ذكاء اصطناعي، لا تخمين خارج السكيما):
 *   • فهرس على كل عمود مفتاح أجنبي لا يغطيه فهرس/PK/UNIQUE — أهم مكسب أداء للـJOIN.
 *   • فهرس UNIQUE لأعمدة المفاتيح الطبيعية (email / username / slug / SKU …) غير المفروضة.
 *   • عرض «السجلات النشطة» للجداول التي فيها status أو is_active.
 *   • Trigger لتحديث updated_at عند التعديل، وTrigger لتعبئة created_at عند الإدراج
 *     إن لم يكن له DEFAULT — بصياغة MySQL/SQLite/PostgreSQL.
 *   • Trigger تدقيق تلقائي عندما يوجد جدول سجل/تاريخ مطابق للجدول المصدر (`orders_audit`,
 *     `audit_orders`, `orders_history`, `orders_log`…) — بشرط إمكان تخطيط أعمدة الهوية
 *     والحدث والوقت، وبلا أعمدة NOT NULL غير مغطاة قد تُفشل الإدراج. تُدعم أزواج
 *     `old_`/`new_` (و`before_`/`after_` و`previous_`/`current_`) فتُسجّل القيمة السابقة واللاحقة لكل حقل.
 *   • تنظيف الفهارس: كشف التكرار التام، والبادئات البيسارية المغطاة بفهرس أطول،
 *     والفهرس الزائد على PK/UNIQUE، والفهرس المرتبط بأعمدة محذوفة أو غير المخدوم
 *     بأي علاقة أو بشرط WHERE/JOIN في عرض معلن (بتحليل الأسماء المستعارة لا مطابقة النص)
 *     — ويُقترح حذفه لا إضافته.
 *
 * الاقتراح لا يُطبَّق تلقائياً: تعرضه الواجهة مع السبب ونسبة الثقة، ويقبله المستخدم
 * واحداً واحداً أو كلياً، ويستطيع تجاهله.
 */
import type { ErColumn, ErIndex, ErModel, ErTable, ErTrigger, ErView } from './drawioImporter';
import {
  schemaDropIndexStatement,
  schemaIndexStatement,
  schemaTriggerStatement,
  schemaViewStatement,
  type SqlDialect,
} from './ddlGenerator';

export type ObjectSuggestionKind = 'index' | 'view' | 'trigger' | 'index-cleanup';

/** سبب اقتراح حذف فهرس قائم */
export type IndexCleanupReason = 'duplicate' | 'redundant' | 'unused';

export interface ObjectSuggestion {
  id: string;
  kind: ObjectSuggestionKind;
  /** اسم الكائن المقترح — يُعرض في الواجهة */
  name: string;
  titleAr: string;
  titleEn: string;
  detailAr: string;
  detailEn: string;
  confidence: number;
  index?: { tableId: string; value: ErIndex };
  view?: ErView;
  trigger?: ErTrigger;
  /** فهرس قائم مقترَح حذفه (تكرار/تغطية/عدم استخدام) */
  dropIndex?: { tableId: string; name: string; columns: string[]; unique: boolean; position?: number };
  cleanupReason?: IndexCleanupReason;
}

const NATURAL_KEY_TOKENS = ['email', 'username', 'slug', 'sku', 'isbn', 'iban', 'uuid', 'handle', 'national_id'];
const NON_INDEXABLE_TYPES = new Set(['text', 'clob', 'json', 'jsonb', 'blob', 'bytea', 'xml']);
const UPDATED_COLUMN_TOKENS = ['updated_at', 'updatedat', 'modified_at', 'modifiedat', 'last_modified', 'lastmodified'];
const CREATED_COLUMN_TOKENS = ['created_at', 'createdat', 'created_on', 'creation_date', 'creationdate', 'inserted_at', 'insertedat'];
const TIMESTAMP_TYPE_BASES = ['timestamp', 'timestamptz', 'datetime', 'date'];
const STATUS_COLUMN_TOKENS = ['status', 'state'];
const BOOLEAN_ACTIVE_COLUMNS = ['is_active', 'active', 'is_enabled', 'enabled'];
const AUDIT_SOURCE_NAME_RE = /(^|_)(audit|history|hist|log|journal|revision|version)(_|$)/i;
const AUDIT_ACTION_COLUMNS = ['action', 'operation', 'op', 'event', 'event_type', 'change_type', 'audit_action'];
const AUDIT_TIME_COLUMNS = [
  'changed_at', 'occurred_at', 'event_time', 'logged_at', 'audit_time',
  'created_at', 'modified_at', 'updated_at', 'timestamp',
];
const AUDIT_ACTOR_COLUMNS = ['changed_by', 'modified_by', 'updated_by', 'performed_by', 'actor', 'audit_user', 'db_user', 'changed_by_user'];
/** بادئات أزواج القيمة السابقة/اللاحقة — كل مجموعة تُقابل جانباً واحداً من الحدث */
const AUDIT_PAIR_PREFIXES: Record<string, 'old' | 'new'> = {
  old: 'old', before: 'old', previous: 'old', prev: 'old', prior: 'old',
  new: 'new', after: 'new', current: 'new',
};

function typeBase(type: string): string {
  return (type || '').trim().split(/[(\s]/)[0].toLowerCase();
}

function tableById(model: ErModel): Map<string, ErTable> {
  return new Map(model.tables.map(table => [table.id, table]));
}

function singular(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('ies') && lower.length > 4) return name.slice(0, -3) + 'y';
  if (lower.endsWith('ses') && lower.length > 4) return name.slice(0, -2);
  if (lower.endsWith('s') && lower.length > 3) return name.slice(0, -1);
  return name;
}

/** هل يغطي فهرس موجود (أو PK/UNIQUE على العمود) البحث على هذا العمود؟ */
function columnIsCovered(table: ErTable, columnName: string): boolean {
  const lower = columnName.toLowerCase();
  const column = table.columns.find(item => item.name.toLowerCase() === lower);
  if (column && (column.isPrimaryKey || column.isUnique)) return true;
  return (table.indexes ?? []).some(index => (index.columns?.[0] ?? '').toLowerCase() === lower);
}

/** العمود الفعلي في الجدول لعلاقة FK — المعلَن أولاً ثم المشتق من اسم الجدول الأب */
function resolveFkColumn(table: ErTable, declared: string | undefined, parentName: string): string | null {
  if (declared) {
    const found = table.columns.find(column => column.name.toLowerCase() === declared.toLowerCase());
    if (found) return found.name;
  }
  const candidates = [
    `${parentName}_id`,
    `${singular(parentName)}_id`,
    `${parentName}id`,
  ].map(candidate => candidate.toLowerCase());
  const match = table.columns.find(column => candidates.includes(column.name.toLowerCase()));
  return match?.name ?? null;
}

function isNaturalKey(column: ErColumn): boolean {
  const name = column.name.toLowerCase();
  if (NON_INDEXABLE_TYPES.has(typeBase(column.type))) return false;
  return NATURAL_KEY_TOKENS.some(token => name === token || name.endsWith(`_${token}`));
}

function uniqueName(used: Set<string>, base: string): string {
  let name = base;
  let suffix = 2;
  while (used.has(name.toLowerCase())) name = `${base}_${suffix++}`;
  used.add(name.toLowerCase());
  return name;
}

/** أعمدة الفهرس موحّدة للمقارنة (بلا فراغات وحالة أحرف) */
function normalizedColumns(columns: string[] | undefined): string[] {
  return (columns ?? []).map(column => column.trim().toLowerCase()).filter(Boolean);
}

function columnsLabel(columns: string[]): string {
  return columns.join(', ');
}

/** هل تستخدم إحدى العلاقات المعلنة أعمدة هذا الفهرس (طرفا العلاقة)؟ */
function relationUsesColumns(model: ErModel, table: ErTable, columns: Set<string>): boolean {
  return model.relationships.some(relation => {
    if (relation.sourceTable === table.id && relation.sourceColumn && columns.has(relation.sourceColumn.toLowerCase())) return true;
    if (relation.targetTable === table.id && relation.targetColumn && columns.has(relation.targetColumn.toLowerCase())) return true;
    return false;
  });
}

/* ---------------------------------------------------------------------------
 * تحليل WHERE / JOIN في العروض المعلنة
 *
 * المطابقة النصية تسبّب إنذاراً كاذباً: كلمة في قائمة SELECT، أو اسم عمود في
 * جدول آخر، أو نص بين علامتي اقتباس، كانت تُحسب «استخداماً» للفهرس. هنا نستخرج
 * شروط WHERE وON/USING فقط، ثم نحلّ كل مرجع عبر اسم الجدول أو اسمه المستعار،
 * ولا نقبل المرجع غير المؤهّل إلا إذا كان ينتمي إلى جدول واحد بلا لبس.
 * ------------------------------------------------------------------------- */

const SQL_IDENT = String.raw`[A-Za-z_\u0600-\u06FF][A-Za-z0-9_$\u0600-\u06FF]*`;
const SQL_QUALIFIED_RE = new RegExp(`(${SQL_IDENT})\\s*\\.\\s*(${SQL_IDENT})`, 'g');
const SQL_IDENT_RE = new RegExp(SQL_IDENT, 'g');
const SQL_TABLE_REF_RE = new RegExp(
  `\\b(?:from|join)\\s+(${SQL_IDENT})(?:\\s*\\.\\s*(${SQL_IDENT}))?\\s*(?:(?:as\\s+)?(${SQL_IDENT}))?`,
  'gi'
);

/** كلمات قد تظهر بعد اسم جدول/عمود ولا تصلح كاسم مستعار أو عمود */
const SQL_KEYWORDS = new Set([
  'on', 'where', 'group', 'order', 'having', 'limit', 'union', 'join', 'left', 'right',
  'full', 'inner', 'cross', 'natural', 'outer', 'using', 'as', 'and', 'or', 'not', 'null',
  'is', 'in', 'between', 'like', 'ilike', 'true', 'false', 'case', 'when', 'then', 'else',
  'end', 'distinct', 'exists', 'any', 'all', 'cast', 'asc', 'desc', 'offset', 'window',
  'fetch', 'returning', 'with', 'lateral', 'select', 'from', 'set', 'values',
]);

/** أسماء دوال شائعة لا تُعدّ أعمدة إذا جاء بعدها قوس */
const SQL_FUNCTIONS = new Set([
  'date', 'timestamp', 'lower', 'upper', 'coalesce', 'concat', 'now', 'current_date',
  'current_timestamp', 'length', 'trim', 'substring', 'count', 'sum', 'avg', 'min', 'max',
  'extract', 'interval', 'round', 'abs', 'greatest', 'least', 'if', 'ifnull', 'nullif',
]);

function stripSqlNoise(sql: string): string {
  return sql
    // النصوص بين علامات اقتباس أحادية ليست أسماء أعمدة (والاقتباس المضاعف هروب)
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    // الاقتباس المزدوج: معرّف إن كان كلمة واحدة، وإلا فهو نص في لهجات مثل MySQL
    .replace(/"([^"]*)"/g, (whole, inner: string) => (/^[A-Za-z_\u0600-\u06FF][\w$\u0600-\u06FF]*$/.test(inner) ? inner : ' '))
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([A-Za-z_\u0600-\u06FF][\w$\u0600-\u06FF]*)\]/g, '$1');
}

/** تقسيم نص على فاصل في المستوى الأعلى فقط (يتجاهل الفواصل داخل الأقواس) */
function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (character === '(') depth++;
    else if (character === ')') depth = Math.max(0, depth - 1);
    else if (character === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

interface ViewRelation {
  /** اسم الجدول الأخير بعد أي schema */
  table: string;
  alias?: string;
}

/** جداول العرض وأسماؤها المستعارة — من FROM وJOIN وجداول FROM المفصولة بفواصل */
function parseViewRelations(sql: string): ViewRelation[] {
  const relations: ViewRelation[] = [];
  const seen = new Set<string>();
  const add = (rawTable: string | undefined, rawAlias: string | undefined): void => {
    if (!rawTable) return;
    const table = rawTable.toLowerCase();
    if (SQL_KEYWORDS.has(table)) return;
    const alias = rawAlias && !SQL_KEYWORDS.has(rawAlias.toLowerCase()) ? rawAlias.toLowerCase() : undefined;
    const key = `${table}|${alias ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    relations.push({ table, ...(alias ? { alias } : {}) });
  };

  // exec يدوي: إن التقطت الكلمة التالية كـ«alias» وهي JOIN/WHERE، نعيد المؤشر
  // إلى بدايتها كي تبقى قابلة للمطابقة (وإلا ضاعت جداول JOIN بلا LEFT/RIGHT).
  const tableRefRe = new RegExp(SQL_TABLE_REF_RE.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = tableRefRe.exec(sql)) !== null) {
    const rawAlias = match[3];
    add(match[2] ?? match[1], rawAlias);
    if (rawAlias && SQL_KEYWORDS.has(rawAlias.toLowerCase())) {
      tableRefRe.lastIndex = match.index + match[0].length - rawAlias.length;
    }
  }

  const fromClauseRe = /\bfrom\b([\s\S]*?)(?=\bwhere\b|\bgroup\s+by\b|\border\s+by\b|\bhaving\b|\blimit\b|\bunion\b|;|$)/gi;
  for (const match of sql.matchAll(fromClauseRe)) {
    for (const part of splitTopLevel(match[1], ',').slice(1)) {
      const ref = part.match(new RegExp(`^\\s*(${SQL_IDENT})(?:\\s*\\.\\s*(${SQL_IDENT}))?\\s*(?:(?:as\\s+)?(${SQL_IDENT}))?`));
      add(ref?.[2] ?? ref?.[1], ref?.[3]);
    }
  }

  return relations;
}

/** شروط WHERE وON وUSING فقط — لا قوائم SELECT ولا ORDER BY */
function viewPredicateClauses(sql: string): string[] {
  const clauses: string[] = [];
  const whereRe = /\bwhere\b([\s\S]*?)(?=\bgroup\s+by\b|\border\s+by\b|\bhaving\b|\blimit\b|\bunion\b|\bwindow\b|\bfetch\b|\breturning\b|;|$)/gi;
  for (const match of sql.matchAll(whereRe)) clauses.push(match[1]);

  const onRe = /\bon\b([\s\S]*?)(?=\bjoin\b|\bwhere\b|\bgroup\s+by\b|\border\s+by\b|\bhaving\b|\blimit\b|\bunion\b|;|$)/gi;
  for (const match of sql.matchAll(onRe)) clauses.push(match[1]);

  const usingRe = /\busing\s*\(([^)]*)\)/gi;
  for (const match of sql.matchAll(usingRe)) clauses.push(match[1]);

  return clauses;
}

interface ViewColumnReference {
  qualifier?: string;
  column: string;
}

/** مراجع الأعمدة داخل الشروط: مؤهّلة باسم جدول/alias، أو مجرّدة */
function viewColumnReferences(sql: string): ViewColumnReference[] {
  const references: ViewColumnReference[] = [];
  for (const clause of viewPredicateClauses(sql)) {
    const withoutQualified = clause.replace(SQL_QUALIFIED_RE, (_whole, qualifier: string, column: string) => {
      references.push({ qualifier: qualifier.toLowerCase(), column: column.toLowerCase() });
      return ' ';
    });
    for (const match of withoutQualified.matchAll(SQL_IDENT_RE)) {
      const token = match[0];
      const lower = token.toLowerCase();
      const after = withoutQualified.slice((match.index ?? 0) + token.length);
      if (/^\s*\(/.test(after)) continue;
      if (SQL_KEYWORDS.has(lower) || SQL_FUNCTIONS.has(lower)) continue;
      references.push({ column: lower });
    }
  }
  return references;
}

/**
 * هل يذكر عرض معلن أعمدة هذا الفهرس في WHERE أو JOIN؟
 *  • مرجع مؤهّل يُحلّ باسم الجدول أو alias، ولا يُقبل إن كان الاسم مشتركاً/ملتبساً.
 *  • مرجع مجرّد يُقبل فقط إذا كان ينتمي إلى جدول واحد في العرض (أو الوحيد الذي يملك العمود).
 *  • استعلام فارغ يُعتبر تغطية (لا ندّعي عدم الاستخدام بلا دليل).
 */
function viewUsesColumns(model: ErModel, table: ErTable, columns: string[]): boolean {
  const tableName = table.name.toLowerCase();
  const wanted = new Set(columns.map(column => column.toLowerCase()));
  return (model.views ?? []).some(view => {
    const query = (view.query ?? '').trim();
    if (!query) return true;
    const sql = stripSqlNoise(query);
    if (!sql.toLowerCase().includes(tableName)) return false;

    const relations = parseViewRelations(sql);
    if (relations.length === 0) return false;
    const relationTables = Array.from(new Set(relations.map(relation => relation.table)));
    const tablesByName = new Map(model.tables.map(item => [item.name.toLowerCase(), item]));

    const unqualifiedBelongsToTable = (column: string): boolean => {
      if (!wanted.has(column)) return false;
      if (relationTables.length === 1) return relationTables[0] === tableName;
      // أثناء الالتباس: لا نعدّ العمود مستخدماً إلا إذا كان جدول واحد فقط يملكه
      const owners = relationTables.filter(name => {
        if (name === tableName) return true;
        return Boolean(tablesByName.get(name)?.columns.some(item => item.name.toLowerCase() === column));
      });
      return owners.length === 1 && owners[0] === tableName;
    };

    return viewColumnReferences(sql).some(reference => {
      if (!wanted.has(reference.column)) return false;
      if (!reference.qualifier) return unqualifiedBelongsToTable(reference.column);
      const matches = relations.filter(
        relation => relation.alias === reference.qualifier || relation.table === reference.qualifier
      );
      // المؤهّل قد يكون schema وليس alias — نتجاهله بصمت بدل ادعاء استخدام كاذب
      return matches.length > 0 && matches.every(relation => relation.table === tableName);
    });
  });
}

function timestampColumn(table: ErTable, tokens: string[]): ErColumn | null {
  const column = table.columns.find(item => tokens.includes(item.name.toLowerCase()));
  if (!column) return null;
  return TIMESTAMP_TYPE_BASES.includes(typeBase(column.type)) ? column : null;
}

function updatedColumn(table: ErTable): ErColumn | null {
  return timestampColumn(table, UPDATED_COLUMN_TOKENS);
}

/** عمود إنشاء بلا DEFAULT — الإدراج الذي لا يمرّره يتركه NULL */
function createdColumn(table: ErTable): ErColumn | null {
  const column = timestampColumn(table, CREATED_COLUMN_TOKENS);
  if (!column || column.isPrimaryKey) return null;
  if ((column.defaultValue ?? '').trim()) return null;
  return column;
}

function statusColumn(table: ErTable): { column: ErColumn; literal: string } | null {
  const booleanColumn = table.columns.find(item => BOOLEAN_ACTIVE_COLUMNS.includes(item.name.toLowerCase()));
  if (booleanColumn) return { column: booleanColumn, literal: 'BOOLEAN' };
  const status = table.columns.find(column => {
    const name = column.name.toLowerCase();
    return STATUS_COLUMN_TOKENS.some(token => name === token || name.endsWith(`_${token}`));
  });
  return status ? { column: status, literal: 'ACTIVE' } : null;
}

interface AuditColumnMap {
  auditColumn: string;
  sourceColumn: string;
  /** snapshot = حالة الصف بعد التغيير، old/new = زوج قيم قبل/بعد التعديل */
  role?: 'snapshot' | 'old' | 'new';
}

interface AuditPlan {
  audit: ErTable;
  snapshots: AuditColumnMap[];
  /** عدد الأزواج old_/new_ المخططة (للتوضيح في الواجهة) */
  pairs: number;
  actionColumn?: ErColumn;
  timeColumn?: ErColumn;
  actorColumn?: ErColumn;
}

/** جدول التدقيق المطابق بالاسم، بترتيب أولوية ثابت — أول مرشّح موجود فقط */
function findAuditTable(model: ErModel, source: ErTable): ErTable | null {
  const byName = new Map(model.tables.map(table => [table.name.toLowerCase(), table]));
  const base = source.name.toLowerCase();
  const singularBase = singular(source.name).toLowerCase();
  const candidates = [
    `${base}_audit`, `audit_${base}`,
    `${base}_history`, `history_${base}`,
    `${base}_hist`, `${base}_log`,
    `audit_${singularBase}`, `${singularBase}_audit`,
  ];
  for (const name of candidates) {
    const table = byName.get(name);
    if (table && table.id !== source.id) return table;
  }
  return null;
}

/**
 * تخطيط أعمدة التدقيق — لا نكتب Trigger يخمّن: كل عمود NOT NULL في جدول السجل
 * يجب أن يكون له مصدر (لقطة/حدث/وقت) أو DEFAULT أو أن يكون مفتاحه الخاص، وإلا نرفض الاقتراح.
 */
function buildAuditPlan(model: ErModel, source: ErTable, dialect: SqlDialect): AuditPlan | null {
  if (AUDIT_SOURCE_NAME_RE.test(source.name)) return null;
  const audit = findAuditTable(model, source);
  if (!audit) return null;

  const auditPks = new Set(audit.columns.filter(column => column.isPrimaryKey).map(column => column.name.toLowerCase()));
  const used = new Set<string>();
  const sourcePks = source.columns.filter(column => column.isPrimaryKey);
  if (sourcePks.length === 0) return null;

  const snapshots: AuditColumnMap[] = [];

  // هوية الصف المصدر: `orders_id` ثم `order_id`، وأخيراً نفس اسم المفتاح لغير `id`
  for (const pk of sourcePks) {
    const candidates = [
      `${source.name}_${pk.name}`,
      `${singular(source.name)}_${pk.name}`,
      ...(pk.name.toLowerCase() === 'id' ? [] : [pk.name]),
    ].map(name => name.toLowerCase());
    const match = audit.columns.find(column =>
      candidates.includes(column.name.toLowerCase()) && !used.has(column.name.toLowerCase())
    );
    if (!match || auditPks.has(match.name.toLowerCase())) return null;
    used.add(match.name.toLowerCase());
    snapshots.push({ auditColumn: match.name, sourceColumn: pk.name });
  }

  const pick = (tokens: string[]): ErColumn | undefined => {
    const column = audit.columns.find(item =>
      tokens.includes(item.name.toLowerCase()) &&
      !used.has(item.name.toLowerCase()) &&
      !auditPks.has(item.name.toLowerCase())
    );
    if (column) used.add(column.name.toLowerCase());
    return column;
  };

  const actionColumn = pick(AUDIT_ACTION_COLUMNS);
  const timeColumn = pick(AUDIT_TIME_COLUMNS);
  // SQLite لا يوفّر CURRENT_USER في تعبيرات الـTrigger — لا نحجزه هناك
  const actorColumn = dialect === 'sqlite' ? undefined : pick(AUDIT_ACTOR_COLUMNS);

  // أزواج old_<column> / new_<column>: تُخزّن القيمة السابقة واللاحقة معاً — أدقّ من لقطة واحدة
  const pairedSourceColumns = new Set<string>();
  for (const auditColumn of audit.columns) {
    const lower = auditColumn.name.toLowerCase();
    if (used.has(lower) || auditPks.has(lower)) continue;
    const match = /^([a-z]+)_(.+)$/.exec(lower);
    if (!match) continue;
    const side = AUDIT_PAIR_PREFIXES[match[1]];
    if (!side) continue;
    // أحد الجانبين يُكتب NULL في الحدث المقابل — عمود NOT NULL لا يصلح لهذا التخطيط
    if (!auditColumn.isNullable) continue;
    const base = match[2];
    const sourceColumn = source.columns.find(column => column.name.toLowerCase() === base);
    if (!sourceColumn) continue;
    used.add(lower);
    pairedSourceColumns.add(sourceColumn.name.toLowerCase());
    snapshots.push({ auditColumn: auditColumn.name, sourceColumn: sourceColumn.name, role: side });
  }

  // لقطة أعمدة بنفس الاسم (status, total …) — يُستبعد ما غطّته أزواج old_/new_
  for (const auditColumn of audit.columns) {
    const lower = auditColumn.name.toLowerCase();
    if (used.has(lower) || auditPks.has(lower)) continue;
    const sourceColumn = source.columns.find(column => column.name.toLowerCase() === lower);
    if (!sourceColumn || pairedSourceColumns.has(sourceColumn.name.toLowerCase())) continue;
    used.add(lower);
    snapshots.push({ auditColumn: auditColumn.name, sourceColumn: sourceColumn.name, role: 'snapshot' });
  }

  const missingRequired = audit.columns.some(column => {
    const lower = column.name.toLowerCase();
    if (auditPks.has(lower) || used.has(lower) || column.isNullable) return false;
    return !((column.defaultValue ?? '').trim());
  });
  if (missingRequired) return null;
  if (snapshots.length === 0 || (!actionColumn && !timeColumn)) return null;

  const order = new Map(audit.columns.map((column, index) => [column.name.toLowerCase(), index]));
  snapshots.sort((a, b) => (order.get(a.auditColumn.toLowerCase()) ?? 0) - (order.get(b.auditColumn.toLowerCase()) ?? 0));
  const pairs = snapshots.filter(snapshot => snapshot.role === 'old' || snapshot.role === 'new').length;

  return { audit, snapshots, pairs, ...(actionColumn ? { actionColumn } : {}), ...(timeColumn ? { timeColumn } : {}), ...(actorColumn ? { actorColumn } : {}) };
}

/** اسم أساس لا يتعارض مع أي من أسماء MySQL/SQLite الفرعية (`_ins/_upd/_del`) */
function uniqueAuditTriggerName(used: Set<string>, base: string): string {
  const variants = (name: string): string[] => [name, `${name}_ins`, `${name}_upd`, `${name}_del`].map(value => value.toLowerCase());
  let name = base;
  let suffix = 2;
  while (variants(name).some(value => used.has(value))) name = `${base}_${suffix++}`;
  for (const value of variants(name)) used.add(value);
  return name;
}

/**
 * Trigger تدقيق بصياغة المحرك: MySQL/SQLite تحتاج Trigger لكل حدث (بلا BEGIN في MySQL
 * كي لا تُغلّف بـDELIMITER)، وPostgreSQL تكفيها دالة واحدة مع `INSERT OR UPDATE OR DELETE`.
 */
function auditTriggerSql(source: ErTable, plan: AuditPlan, dialect: SqlDialect, triggerName: string): string | null {
  if (dialect !== 'mysql' && dialect !== 'sqlite' && dialect !== 'postgres') return null;

  const columns = plan.snapshots.map(snapshot => snapshot.auditColumn);
  if (plan.actionColumn) columns.push(plan.actionColumn.name);
  if (plan.timeColumn) columns.push(plan.timeColumn.name);
  if (plan.actorColumn) columns.push(plan.actorColumn.name);
  const columnList = columns.join(', ');

  const snapshotValue = (snapshot: AuditColumnMap, event: 'INSERT' | 'UPDATE' | 'DELETE'): string => {
    const { sourceColumn, role } = snapshot;
    if (dialect === 'postgres') {
      if (role === 'old') return `CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.${sourceColumn} END`;
      if (role === 'new') return `CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.${sourceColumn} END`;
      return `CASE WHEN TG_OP = 'DELETE' THEN OLD.${sourceColumn} ELSE NEW.${sourceColumn} END`;
    }
    // الجانب غير الموجود في الحدث يُكتب NULL (إدراج لا OLD له، وحذف لا NEW له)
    if (role === 'old') return event === 'INSERT' ? 'NULL' : `OLD.${sourceColumn}`;
    if (role === 'new') return event === 'DELETE' ? 'NULL' : `NEW.${sourceColumn}`;
    return `${event === 'DELETE' ? 'OLD' : 'NEW'}.${sourceColumn}`;
  };

  const valuesFor = (event: 'INSERT' | 'UPDATE' | 'DELETE'): string => {
    const values = plan.snapshots.map(snapshot => snapshotValue(snapshot, event));
    if (plan.actionColumn) values.push(dialect === 'postgres' ? 'TG_OP' : `'${event}'`);
    if (plan.timeColumn) values.push(dialect === 'postgres' ? 'NOW()' : 'CURRENT_TIMESTAMP');
    if (plan.actorColumn) values.push('CURRENT_USER');
    return values.join(', ');
  };

  if (dialect === 'mysql') {
    const statement = (event: 'INSERT' | 'UPDATE' | 'DELETE', suffix: string): string =>
      `CREATE TRIGGER ${triggerName}_${suffix} AFTER ${event} ON ${source.name}\nFOR EACH ROW\nINSERT INTO ${plan.audit.name} (${columnList}) VALUES (${valuesFor(event)})`;
    return [statement('INSERT', 'ins'), statement('UPDATE', 'upd'), statement('DELETE', 'del')].join(';\n\n');
  }

  if (dialect === 'sqlite') {
    const statement = (event: 'INSERT' | 'UPDATE' | 'DELETE', suffix: string): string =>
      `CREATE TRIGGER ${triggerName}_${suffix} AFTER ${event} ON ${source.name}\nFOR EACH ROW\nBEGIN\n  INSERT INTO ${plan.audit.name} (${columnList}) VALUES (${valuesFor(event)});\nEND`;
    return [statement('INSERT', 'ins'), statement('UPDATE', 'upd'), statement('DELETE', 'del')].join(';\n\n');
  }

  const functionName = `audit_${source.name}`;
  return `CREATE OR REPLACE FUNCTION ${functionName}() RETURNS trigger AS $$\nBEGIN\n  INSERT INTO ${plan.audit.name} (${columnList})\n  VALUES (${valuesFor('UPDATE')});\n  IF TG_OP = 'DELETE' THEN\n    RETURN OLD;\n  END IF;\n  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql;\n\nCREATE TRIGGER ${triggerName} AFTER INSERT OR UPDATE OR DELETE ON ${source.name}\nFOR EACH ROW EXECUTE FUNCTION ${functionName}()`;
}

/**
 * Trigger طابع زمني بصياغة المحرك: `touch` يحدّث updated_at عند التعديل،
 * و`fill` يملأ created_at عند الإدراج إن جاء NULL. SQL Server/Oracle خارج النطاق
 * لأن ملف الترحيل يحتاج GO / محرف PL-SQL مستقل لكل Trigger.
 */
function timestampTriggerSql(
  table: ErTable,
  column: ErColumn,
  dialect: SqlDialect,
  triggerName: string,
  mode: 'touch' | 'fill',
  pk?: ErColumn
): string | null {
  const tableName = table.name;
  const fill = mode === 'fill';
  if (dialect === 'mysql') {
    return fill
      ? `CREATE TRIGGER ${triggerName} BEFORE INSERT ON ${tableName}\nFOR EACH ROW\nSET NEW.${column.name} = IFNULL(NEW.${column.name}, CURRENT_TIMESTAMP)`
      : `CREATE TRIGGER ${triggerName} BEFORE UPDATE ON ${tableName}\nFOR EACH ROW\nSET NEW.${column.name} = CURRENT_TIMESTAMP`;
  }
  if (dialect === 'sqlite') {
    if (!pk) return null;
    if (fill) {
      return `CREATE TRIGGER ${triggerName} AFTER INSERT ON ${tableName}\nFOR EACH ROW\nWHEN NEW.${column.name} IS NULL\nBEGIN\n  UPDATE ${tableName} SET ${column.name} = CURRENT_TIMESTAMP WHERE ${pk.name} = NEW.${pk.name};\nEND`;
    }
    return `CREATE TRIGGER ${triggerName} AFTER UPDATE ON ${tableName}\nFOR EACH ROW\nWHEN NEW.${column.name} = OLD.${column.name}\nBEGIN\n  UPDATE ${tableName} SET ${column.name} = CURRENT_TIMESTAMP WHERE ${pk.name} = NEW.${pk.name};\nEND`;
  }
  if (dialect === 'postgres') {
    if (fill) {
      const functionName = `fill_${tableName}`;
      return `CREATE OR REPLACE FUNCTION ${functionName}() RETURNS trigger AS $$\nBEGIN\n  NEW.${column.name} := COALESCE(NEW.${column.name}, NOW());\n  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql;\n\nCREATE TRIGGER ${triggerName} BEFORE INSERT ON ${tableName}\nFOR EACH ROW EXECUTE FUNCTION ${functionName}()`;
    }
    const functionName = `touch_${tableName}`;
    return `CREATE OR REPLACE FUNCTION ${functionName}() RETURNS trigger AS $$\nBEGIN\n  NEW.${column.name} := NOW();\n  RETURN NEW;\nEND;\n$$ LANGUAGE plpgsql;\n\nCREATE TRIGGER ${triggerName} BEFORE UPDATE ON ${tableName}\nFOR EACH ROW EXECUTE FUNCTION ${functionName}()`;
  }
  return null;
}

/**
 * يبني اقتراحات كائنات السكيمّا مرتبةً بالثقة تنازلياً.
 * حتمي بالكامل: نفس النموذج واللهجة يعطيان نفس القائمة.
 */
export function suggestSchemaObjects(model: ErModel, dialect: SqlDialect): ObjectSuggestion[] {
  const suggestions: ObjectSuggestion[] = [];
  const tables = tableById(model);
  const usedIndexNames = new Set<string>();
  for (const table of model.tables) for (const index of table.indexes ?? []) usedIndexNames.add(index.name.toLowerCase());
  const usedViewNames = new Set((model.views ?? []).map(view => view.name.toLowerCase()));
  const usedTriggerNames = new Set((model.triggers ?? []).map(trigger => trigger.name.toLowerCase()));

  /* ------------------------------ الفهارس ------------------------------ */

  const suggestedFkIndexes = new Set<string>();

  for (const relation of model.relationships) {
    if (relation.cardinality !== '1-N' && relation.cardinality !== 'N-1') continue;
    const forward = relation.cardinality === '1-N';
    const child = tables.get(forward ? relation.targetTable : relation.sourceTable);
    const parent = tables.get(forward ? relation.sourceTable : relation.targetTable);
    if (!child || !parent) continue;
    const fkColumn = resolveFkColumn(child, forward ? relation.targetColumn : relation.sourceColumn, parent.name);
    if (!fkColumn || columnIsCovered(child, fkColumn)) continue;
    const dedupeKey = `${child.id}:${fkColumn.toLowerCase()}`;
    if (suggestedFkIndexes.has(dedupeKey)) continue;
    suggestedFkIndexes.add(dedupeKey);

    const name = uniqueName(usedIndexNames, `ix_${child.name}_${fkColumn}`);
    suggestions.push({
      id: `index:${dedupeKey}`,
      kind: 'index',
      name,
      titleAr: `فهرس على ${child.name}.${fkColumn}`,
      titleEn: `Index on ${child.name}.${fkColumn}`,
      detailAr: `عمود مفتاح أجنبي يشير إلى ${parent.name} بلا فهرس يغطّيه — الـJOIN والفلترة عليهما يمرّان بمسح كامل للجدول.`,
      detailEn: `Foreign-key column referencing ${parent.name} has no covering index — joins and filters on it do a full table scan.`,
      confidence: 0.95,
      index: { tableId: child.id, value: { name, columns: [fkColumn], unique: false } },
    });
  }

  for (const table of model.tables) {
    for (const column of table.columns) {
      if (!isNaturalKey(column) || column.isPrimaryKey || column.isUnique) continue;
      if (columnIsCovered(table, column.name)) continue;
      const name = uniqueName(usedIndexNames, `uq_${table.name}_${column.name}`);
      suggestions.push({
        id: `index:${table.id}:unique:${column.name.toLowerCase()}`,
        kind: 'index',
        name,
        titleAr: `فهرس فريد على ${table.name}.${column.name}`,
        titleEn: `Unique index on ${table.name}.${column.name}`,
        detailAr: 'عمود مفتاح طبيعي (بريد/اسم مستخدم/SKU…) بلا قيد فرادة — التكرار فيه يفسد الربط والبحث.',
        detailEn: 'A natural-key column (email/username/SKU…) without uniqueness — duplicates break lookups and joins.',
        confidence: 0.65,
        index: { tableId: table.id, value: { name, columns: [column.name], unique: true } },
      });
    }
  }

  /* ------------------- تنظيف الفهارس: تكرار / تغطية / عدم استخدام ------------------- */

  for (const table of model.tables) {
    const indexes = table.indexes ?? [];
    if (indexes.length === 0) continue;
    const columnsByName = new Map(table.columns.map(column => [column.name.toLowerCase(), column]));
    const flagged = new Set<number>();
    // فهارس أُبقيت كمرجع لتغطية فهرس آخر — لا ناصفها «غير مستخدمة» في نفس الجولة
    const keptAsCover = new Set<number>();

    const addCleanup = (
      position: number,
      reason: IndexCleanupReason,
      confidence: number,
      titles: { ar: string; en: string },
      details: { ar: string; en: string }
    ): void => {
      if (flagged.has(position)) return;
      const index = indexes[position];
      flagged.add(position);
      suggestions.push({
        // معرف مستقر على هوية الفهرس (لا موضعه) كي يبقى التجاهل فعّالاً بعد إضافة/حذف فهارس أخرى
        id: `index-cleanup:${table.id}:${index.name.toLowerCase()}:${normalizedColumns(index.columns).join(',')}:${reason}`,
        kind: 'index-cleanup',
        name: index.name,
        titleAr: titles.ar,
        titleEn: titles.en,
        detailAr: details.ar,
        detailEn: details.en,
        confidence,
        cleanupReason: reason,
        dropIndex: {
          tableId: table.id,
          name: index.name,
          columns: (index.columns ?? []).slice(),
          unique: Boolean(index.unique),
          position,
        },
      });
    };

    // 1) أعمدة لم تعد موجودة بعد تحرير الجدول — الفهرس ميت مهما كان الغرض منه
    indexes.forEach((index, position) => {
      const columns = normalizedColumns(index.columns);
      const missing = columns.filter(column => !columnsByName.has(column));
      if (missing.length === 0) return;
      addCleanup(
        position,
        'unused',
        0.95,
        { ar: `فهرس على أعمدة محذوفة: ${index.name}`, en: `Index on removed columns: ${index.name}` },
        {
          ar: `الأعمدة (${columnsLabel(missing)}) لم تعد في ${table.name} — الفهرس لن يخدم أي استعلام بعد حذفها.`,
          en: `Columns (${columnsLabel(missing)}) no longer exist in ${table.name} — the index can never serve a query again.`,
        }
      );
    });

    // 2) تكرار تام: نفس الأعمدة بنفس الترتيب — الفريد يتغلّب على غير الفريد، وإلا يُبقى الأول
    for (let a = 0; a < indexes.length; a++) {
      if (flagged.has(a)) continue;
      const colsA = normalizedColumns(indexes[a].columns);
      if (colsA.length === 0) continue;
      for (let b = a + 1; b < indexes.length; b++) {
        if (flagged.has(b)) continue;
        const colsB = normalizedColumns(indexes[b].columns);
        if (colsB.length !== colsA.length || !colsA.every((column, i) => column === colsB[i])) continue;
        const indexA = indexes[a];
        const indexB = indexes[b];
        if (indexA.unique === indexB.unique) {
          keptAsCover.add(a);
          addCleanup(
            b,
            'duplicate',
            0.9,
            { ar: `فهرس مكرر: ${indexB.name}`, en: `Duplicate index: ${indexB.name}` },
            {
              ar: `الأعمدة (${columnsLabel(colsA)}) مفهرسة بالفعل باسم ${indexA.name} — إبقاء الاثنين يستهلك مساحة ويكلّف كتابة في كل INSERT/UPDATE بلا فائدة.`,
              en: `Columns (${columnsLabel(colsA)}) are already indexed by ${indexA.name} — keeping both wastes space and write cost on every INSERT/UPDATE.`,
            }
          );
        } else {
          const uniqueIndex = indexA.unique ? indexA : indexB;
          const redundant = indexA.unique ? indexB : indexA;
          const redundantPosition = indexA.unique ? b : a;
          keptAsCover.add(indexA.unique ? a : b);
          addCleanup(
            redundantPosition,
            'redundant',
            0.9,
            { ar: `فهرس زائد: ${redundant.name}`, en: `Redundant index: ${redundant.name}` },
            {
              ar: `الفهرس الفريد ${uniqueIndex.name} على نفس الأعمدة (${columnsLabel(colsA)}) يغطّي هذا الفهرس تماماً — حذفه لا يغيّر أي استعلام.`,
              en: `The unique index ${uniqueIndex.name} on the same columns (${columnsLabel(colsA)}) fully covers this one — dropping it changes no query.`,
            }
          );
        }
        if (flagged.has(a)) break;
      }
    }

    // 3) بادئة يسارية: فهرس غير فريد على (a) مقطوع بـ (a, b) — B-tree يخدم الاثنين
    for (let a = 0; a < indexes.length; a++) {
      if (flagged.has(a)) continue;
      const colsA = normalizedColumns(indexes[a].columns);
      if (colsA.length === 0 || indexes[a].unique) continue;
      for (let b = 0; b < indexes.length; b++) {
        if (a === b || flagged.has(b)) continue;
        const colsB = normalizedColumns(indexes[b].columns);
        if (colsB.length <= colsA.length) continue;
        if (!colsA.every((column, i) => column === colsB[i])) continue;
        keptAsCover.add(b);
        addCleanup(
          a,
          'redundant',
          0.85,
          { ar: `فهرس مغطّى ببادئة: ${indexes[a].name}`, en: `Index covered by a prefix: ${indexes[a].name}` },
          {
            ar: `أعمدة (${columnsLabel(colsA)}) هي البادئة اليسرى للفهرس ${indexes[b].name} (${columnsLabel(colsB)}) — أي استعلام يخدمه هذا الفهرس يخدمه الفهرس الأطول أيضاً.`,
            en: `Columns (${columnsLabel(colsA)}) are the leftmost prefix of ${indexes[b].name} (${columnsLabel(colsB)}) — any query this index serves is served by the longer one too.`,
          }
        );
        break;
      }
    }

    // 4) فهرس عمود واحد على PK/UNIQUE — القيد نفسه ينشئ فهرسه
    indexes.forEach((index, position) => {
      if (flagged.has(position)) return;
      const columns = normalizedColumns(index.columns);
      if (columns.length !== 1) return;
      const column = columnsByName.get(columns[0]);
      if (!column || !(column.isPrimaryKey || column.isUnique)) return;
      addCleanup(
        position,
        'redundant',
        0.8,
        { ar: `فهرس زائد على قيد: ${index.name}`, en: `Index redundant with a constraint: ${index.name}` },
        {
          ar: `العمود ${column.name} ${column.isPrimaryKey ? 'مفتاح أساسي' : 'فريد'} في ${table.name} — قاعدة البيانات تنشئ فهرسه تلقائياً، وهذا الفهرس نسخة مكررة.`,
          en: `${column.name} is ${column.isPrimaryKey ? 'the primary key' : 'unique'} in ${table.name} — the database already indexes it, so this index duplicates it.`,
        }
      );
    });

    // 5) غير مستخدم: لا علاقة ولا عرض معلن يلمس أعمدته، وليس فريداً ولا مفتاحاً طبيعياً
    indexes.forEach((index, position) => {
      if (flagged.has(position) || keptAsCover.has(position) || index.unique) return;
      const columns = normalizedColumns(index.columns);
      if (columns.length === 0) return;
      if (relationUsesColumns(model, table, new Set(columns))) return;
      if (viewUsesColumns(model, table, columns)) return;
      const columnDefs = columns.map(column => columnsByName.get(column)).filter((column): column is ErColumn => Boolean(column));
      if (columnDefs.some(column => isNaturalKey(column))) return;
      addCleanup(
        position,
        'unused',
        0.35,
        { ar: `فهرس بلا استخدام معلن: ${index.name}`, en: `Index with no declared use: ${index.name}` },
        {
          ar: `لا علاقة ولا عرض في النموذج يستخدم أعمدة (${columnsLabel(columns)}) في ${table.name} — قد يخدم استعلامات تطبيق غير ممثلة هنا، فراجعه قبل الحذف.`,
          en: `No relation or view in the model uses (${columnsLabel(columns)}) in ${table.name} — it may serve application queries not represented here, so review before dropping.`,
        }
      );
    });
  }

  /* ------------------------------- العروض ------------------------------ */

  for (const table of model.tables) {
    if (table.columns.length < 2) continue;
    const status = statusColumn(table);
    if (!status) continue;
    // عرض نشط موجود لهذا الجدول (بأي لاحقة) يعني الحاجة مغطاة — لا نقترح نسخة ثانية.
    const viewBase = `v_${table.name}_active`;
    if ((model.views ?? []).some(view => view.name.toLowerCase() === viewBase || view.name.toLowerCase().startsWith(`${viewBase}_`))) {
      continue;
    }
    const viewName = uniqueName(usedViewNames, viewBase);
    const columns = table.columns.map(column => column.name).join(', ');
    const booleanLiteral =
      status.literal === 'BOOLEAN'
        ? dialect === 'mysql' || dialect === 'sqlserver' || dialect === 'oracle'
          ? '1'
          : 'TRUE'
        : null;
    const predicate = booleanLiteral
      ? `${status.column.name} = ${booleanLiteral}`
      : `${status.column.name} = 'active'`;
    suggestions.push({
      id: `view:${table.id}:${status.column.name.toLowerCase()}`,
      kind: 'view',
      name: viewName,
      titleAr: `عرض ${viewName}`,
      titleEn: `View ${viewName}`,
      detailAr: `يعزل السجلات النشطة في ${table.name} (${predicate}) — يبسّط كل استعلام ويقلّل نسيان الشرط.`,
      detailEn: `Isolates active rows in ${table.name} (${predicate}) — every query gets simpler and cannot forget the filter.`,
      confidence: 0.55,
      view: {
        name: viewName,
        query: `SELECT ${columns}\nFROM ${table.name}\nWHERE ${predicate}`,
      },
    });
  }

  /* ------------------------------ Triggers ----------------------------- */

  const triggerSqlSupported = dialect === 'mysql' || dialect === 'sqlite' || dialect === 'postgres';
  if (triggerSqlSupported) {
    for (const table of model.tables) {
      // trigger قائم على الجدول يعني أن صيانة الطوابع الزمنية غالباً مقصودة ومكتوبة بحكمة المالك
      if ((model.triggers ?? []).some(trigger => (trigger.table ?? '').toLowerCase() === table.name.toLowerCase())) continue;
      const primaryKeys = table.columns.filter(item => item.isPrimaryKey);
      const pk = primaryKeys.length === 1 ? primaryKeys[0] : undefined;
      const updated = updatedColumn(table);
      const created = createdColumn(table);

      if (updated) {
        const triggerName = uniqueName(usedTriggerNames, `trg_${table.name}_touch`);
        const rawSql = timestampTriggerSql(table, updated, dialect, triggerName, 'touch', pk);
        if (rawSql) {
          suggestions.push({
            id: `trigger:${table.id}:${updated.name.toLowerCase()}`,
            kind: 'trigger',
            name: triggerName,
            titleAr: `Trigger تحديث ${updated.name}`,
            titleEn: `Trigger for ${updated.name}`,
            detailAr: `الجدول فيه ${updated.name} لكن لا شيء يحدّثه تلقائياً — القيمة ستبقى وقت الإنشاء فقط.`,
            detailEn: `The table has ${updated.name} but nothing updates it — it will keep the insert-time value forever.`,
            confidence: 0.7,
            trigger: {
              name: triggerName,
              table: table.name,
              timing: 'BEFORE',
              event: 'UPDATE',
              rawSql,
            },
          });
        }
      }

      // SQLite لا يسمح بتعديل NEW داخل الـTrigger، فالـAFTER INSERT لا ينقذ عموداً NOT NULL — لا نقترحه هناك.
      const canFillCreated = created
        && (!updated || created.name.toLowerCase() !== updated.name.toLowerCase())
        && !(dialect === 'sqlite' && created.isNullable === false);
      if (created && canFillCreated) {
        const triggerName = uniqueName(usedTriggerNames, `trg_${table.name}_created`);
        const rawSql = timestampTriggerSql(table, created, dialect, triggerName, 'fill', pk);
        if (rawSql) {
          suggestions.push({
            id: `trigger:${table.id}:insert:${created.name.toLowerCase()}`,
            kind: 'trigger',
            name: triggerName,
            titleAr: `Trigger تعبئة ${created.name}`,
            titleEn: `Trigger to fill ${created.name}`,
            detailAr: `الجدول فيه ${created.name} بلا DEFAULT — أي إدراج لا يمرّره سيتركه NULL/فاشلاً؛ هذا الـTrigger يملؤه عند الإدراج.`,
            detailEn: `${created.name} has no DEFAULT — an insert that omits it leaves NULL (or fails); this trigger fills it on insert.`,
            confidence: 0.6,
            trigger: {
              name: triggerName,
              table: table.name,
              timing: 'BEFORE',
              event: 'INSERT',
              rawSql,
            },
          });
        }
      }
    }
  }

  /* ------------------------ Triggers: تدقيق تلقائي ------------------------ */

  if (triggerSqlSupported) {
    for (const table of model.tables) {
      const plan = buildAuditPlan(model, table, dialect);
      if (!plan) continue;
      // trigger قائم يكتب في نفس جدول السجل → لا نكرّر التسجيل مرتين
      const auditName = plan.audit.name.toLowerCase();
      if ((model.triggers ?? []).some(trigger => (trigger.rawSql ?? '').toLowerCase().includes(auditName))) continue;
      const triggerName = uniqueAuditTriggerName(usedTriggerNames, `trg_${table.name}_audit`);
      const rawSql = auditTriggerSql(table, plan, dialect, triggerName);
      if (!rawSql) continue;
      const partsAr = [
        plan.snapshots.length > 0
          ? `${plan.snapshots.length} عموداً${plan.pairs > 0 ? ` (منها ${plan.pairs} قبل/بعد)` : ''}`
          : '',
        plan.actionColumn ? 'الحدث' : '',
        plan.timeColumn ? 'الوقت' : '',
        plan.actorColumn ? 'المستخدم' : '',
      ].filter(Boolean).join(' + ');
      const partsEn = [
        plan.snapshots.length > 0
          ? `${plan.snapshots.length} column(s)${plan.pairs > 0 ? ` (${plan.pairs} old/new)` : ''}`
          : '',
        plan.actionColumn ? 'the event' : '',
        plan.timeColumn ? 'the timestamp' : '',
        plan.actorColumn ? 'the actor' : '',
      ].filter(Boolean).join(' + ');
      suggestions.push({
        id: `trigger:${table.id}:audit`,
        kind: 'trigger',
        name: triggerName,
        titleAr: `Trigger تدقيق ${table.name} في ${plan.audit.name}`,
        titleEn: `Audit trigger for ${table.name} → ${plan.audit.name}`,
        detailAr: `جدول السجل ${plan.audit.name} يطابق ${table.name}: يُسجّل ${partsAr} تلقائياً عند الإدراج والتعديل والحذف.`,
        detailEn: `History table ${plan.audit.name} matches ${table.name}: records ${partsEn} automatically on insert, update and delete.`,
        confidence: 0.55,
        trigger: {
          name: triggerName,
          table: table.name,
          timing: 'AFTER',
          event: 'INSERT, UPDATE, DELETE',
          rawSql,
        },
      });
    }
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name));
}

/** فرق SQL المقترَح: ما سيخرج من التعريف وما سيدخل إليه */
export interface SuggestionSqlDiff {
  /** تعريفات ستختفي من المخطط (تُعرض بعلامة −) */
  removed: string[];
  /** عبارات ستُضاف عند التطبيق (تُعرض بعلامة +) — وقد تكون DROP INDEX */
  added: string[];
  note?: { ar: string; en: string };
}

const NO_SQL_NOTE = {
  ar: 'لا تغيير قابل للتنفيذ في SQL — القيد أو الحالة الحالية تغطّي هذا الكائن.',
  en: 'No executable SQL change — the existing constraint or state already covers this object.',
};

function indexMatches(index: ErIndex, name: string, columns: string[], unique: boolean): boolean {
  return (
    index.name.toLowerCase() === name.toLowerCase() &&
    Boolean(index.unique) === unique &&
    normalizedColumns(index.columns).join(',') === normalizedColumns(columns).join(',')
  );
}

/** أسماء الفهارس المستخدمة عدا فهرس معلَّم (حتى لا يتغيّر اسمه في معاينة إعادة الإنشاء) */
function usedIndexNamesExcept(model: ErModel, tableId: string, target?: ErIndex): Set<string> {
  const names = new Set<string>();
  for (const table of model.tables) {
    for (const index of table.indexes ?? []) {
      if (table.id === tableId && target && index === target) continue;
      names.add(index.name.toLowerCase());
    }
  }
  return names;
}

/**
 * يبني معاينة الفراق لكل اقتراح — نفس دوال DDL التي تولّد المخطط، بلا توليد كامل:
 *  • إضافة فهرس/عرض/Trigger → سطر + واحد.
 *  • حذف فهرس → سطر − (تعريفه الحالي) وسطر + (DROP INDEX بصياغة اللهجة) كمهاجرة.
 */
export function suggestionSqlDiff(model: ErModel, suggestion: ObjectSuggestion, dialect: SqlDialect): SuggestionSqlDiff {
  if (suggestion.index) {
    const { tableId, value } = suggestion.index;
    const table = model.tables.find(item => item.id === tableId);
    if (!table) return { removed: [], added: [], note: NO_SQL_NOTE };
    const statement = schemaIndexStatement(table, value, dialect, usedIndexNamesExcept(model, tableId));
    return statement ? { removed: [], added: [statement] } : { removed: [], added: [], note: NO_SQL_NOTE };
  }

  if (suggestion.dropIndex) {
    const drop = suggestion.dropIndex;
    const table = model.tables.find(item => item.id === drop.tableId);
    const target = table?.indexes?.find(index => indexMatches(index, drop.name, drop.columns, drop.unique));
    if (!table || !target) return { removed: [], added: [], note: NO_SQL_NOTE };
    const create = schemaIndexStatement(table, target, dialect, usedIndexNamesExcept(model, table.id, target));
    return {
      removed: create ? [create] : [],
      added: [schemaDropIndexStatement(table, target.name, dialect)],
      ...(create ? {} : { note: NO_SQL_NOTE }),
    };
  }

  if (suggestion.view) {
    return { removed: [], added: [schemaViewStatement(suggestion.view, dialect)] };
  }

  if (suggestion.trigger) {
    return { removed: [], added: [schemaTriggerStatement(suggestion.trigger)] };
  }

  return { removed: [], added: [], note: NO_SQL_NOTE };
}

/** فرق مجمّع لدفعة اقتراحات — ملف SQL واحد بترتيب التطبيق الفعلي */
export interface BulkSuggestionSqlDiff {
  /** تعريفات ستزول من المخطط (تُعرض بعلامة −) */
  removed: string[];
  /** كل العبارات التي ستُنفَّذ، بترتيب التطبيق */
  added: string[];
  /** إحصاء الدفعة: كائنات تُضاف، فهارس تُحذف، واقتراحات بلا SQL */
  counts: { add: number; drop: number; skipped: number };
  /** ملف SQL جاهز للنسخ: ترويسة + العبارات مفصولة بأسطر فارغة */
  sql: string;
  /** ملاحظة عن الاقتراحات التي لم تُنتج SQL قابلاً للتنفيذ */
  note?: { ar: string; en: string };
}

/**
 * يبني فرقاً واحداً لكل الدفعة — يحاكي `apply-all` بالضبط لا مجرد جمع الفروق:
 * كل اقتراح يُقاس على النموذج بعد تطبيق سابقيه، فلا يتكرر اسم ولا يختفي هدف حذف.
 * الناتج ملف SQL واحد جاهز للنسخ/التنفيذ، مع تعريفات الحذف منفصلة للمراجعة.
 */
export function bulkSuggestionsSqlDiff(
  model: ErModel,
  suggestions: ObjectSuggestion[],
  dialect: SqlDialect
): BulkSuggestionSqlDiff {
  const removed: string[] = [];
  const added: string[] = [];
  const skipped: string[] = [];
  let add = 0;
  let drop = 0;
  let current = model;

  for (const suggestion of suggestions) {
    const diff = suggestionSqlDiff(current, suggestion, dialect);
    removed.push(...diff.removed);
    added.push(...diff.added);
    if (diff.added.length > 0) {
      if (suggestion.dropIndex) drop++;
      else add++;
    } else {
      skipped.push(suggestion.name);
    }
    current = applyObjectSuggestion(current, suggestion);
  }

  const summary = [
    `-- Schema object changes (${dialect})`,
    `-- ${added.length} statement(s): ${add} added, ${drop} dropped${skipped.length > 0 ? `, ${skipped.length} skipped` : ''}`,
  ];
  const sql = [...summary, ...(added.length > 0 ? added : ['-- No executable SQL changes.'])].join('\n\n');

  return {
    removed,
    added,
    counts: { add, drop, skipped: skipped.length },
    sql,
    ...(skipped.length > 0
      ? {
          note: {
            ar: `${skipped.length} اقتراحاً بلا تغيير قابل للتنفيذ: ${skipped.join(', ')} — سيُطبَّق على النموذج لكنه لن يولّد SQL.`,
            en: `${skipped.length} suggestion(s) have no executable change: ${skipped.join(', ')} — they will still apply to the model but generate no SQL.`,
          },
        }
      : {}),
  };
}

/** يطبّق اقتراحاً واحداً على النموذج — دالة نقية تُستخدم في الواجهة والاختبارات */
export function applyObjectSuggestion(model: ErModel, suggestion: ObjectSuggestion): ErModel {
  if (suggestion.dropIndex) {
    const { tableId, name, columns, unique } = suggestion.dropIndex;
    const targetColumns = normalizedColumns(columns);
    return {
      ...model,
      tables: model.tables.map(table => {
        if (table.id !== tableId) return table;
        const indexes = table.indexes ?? [];
        const position = indexes.findIndex(
          index =>
            index.name.toLowerCase() === name.toLowerCase() &&
            index.unique === unique &&
            normalizedColumns(index.columns).join(',') === targetColumns.join(',')
        );
        if (position < 0) return table;
        return { ...table, indexes: indexes.filter((_index, i) => i !== position) };
      }),
    };
  }
  if (suggestion.index) {
    const { tableId, value } = suggestion.index;
    return {
      ...model,
      tables: model.tables.map(table =>
        table.id === tableId ? { ...table, indexes: [...(table.indexes ?? []), value] } : table
      ),
    };
  }
  if (suggestion.view) {
    return { ...model, views: [...(model.views ?? []), suggestion.view] };
  }
  if (suggestion.trigger) {
    return { ...model, triggers: [...(model.triggers ?? []), suggestion.trigger] };
  }
  return model;
}

/**
 * عكس اقتراح طُبّق للتو — تراجع جراحي لا يسترجع لقطة كاملة، فلا يمس أي تعديل آخر.
 *  • إضافة فهرس/عرض/Trigger → إزالتها.
 *  • حذف فهرس → إعادته إلى موضعه الأصلي إن كان الموضع معلوماً وما زال متاحاً.
 */
export function revertObjectSuggestion(model: ErModel, suggestion: ObjectSuggestion): ErModel {
  if (suggestion.dropIndex) {
    const { tableId, name, columns, unique } = suggestion.dropIndex;
    return {
      ...model,
      tables: model.tables.map(table => {
        if (table.id !== tableId) return table;
        const indexes = table.indexes ?? [];
        if (indexes.some(index => indexMatches(index, name, columns, unique))) return table;
        if (indexes.some(index => index.name.toLowerCase() === name.toLowerCase())) return table;
        const next = [...indexes];
        const position = suggestion.dropIndex?.position;
        const at = position === undefined ? next.length : Math.min(Math.max(position, 0), next.length);
        next.splice(at, 0, { name, columns: [...columns], unique });
        return { ...table, indexes: next };
      }),
    };
  }

  if (suggestion.index) {
    const { tableId, value } = suggestion.index;
    return {
      ...model,
      tables: model.tables.map(table => {
        if (table.id !== tableId) return table;
        const indexes = table.indexes ?? [];
        const position = indexes.findIndex(index => indexMatches(index, value.name, value.columns, Boolean(value.unique)));
        return position < 0 ? table : { ...table, indexes: indexes.filter((_index, i) => i !== position) };
      }),
    };
  }

  if (suggestion.view) {
    const name = suggestion.view.name.toLowerCase();
    return { ...model, views: (model.views ?? []).filter(view => view.name.toLowerCase() !== name) };
  }

  if (suggestion.trigger) {
    const name = suggestion.trigger.name.toLowerCase();
    return { ...model, triggers: (model.triggers ?? []).filter(trigger => trigger.name.toLowerCase() !== name) };
  }

  return model;
}
