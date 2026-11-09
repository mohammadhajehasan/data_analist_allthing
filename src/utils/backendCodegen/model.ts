/**
 * Backend Codegen — طبقة التحليل المشتركة
 * ---------------------------------------------------------------
 * تُحوّل نموذج `ErModel` (المستورد من draw.io أو المُحرَّر في مصمّم
 * السكيمّا) إلى نموذج برمجي غنيّ يكفي لتوليد:
 *   Models · Migrations · CRUD API · Validation · DB config
 *
 * المبادئ:
 *   • نحاكي قواعد `ddlGenerator` نفسها في استنتاج علاقات 1-N وN-M
 *     وأعمدة FK المُولَّدة تلقائياً، كي يبقى كود الـBackend مطابقاً
 *     تماماً لـSQL الذي يراه المستخدم.
 *   • أسماء الجداول تُنقّى بـsanitizeIdentifier (نفس مُولّد DDL)، أما
 *     أسماء الأعمدة فتبقى كما هي لأنها تُقتبس في SQL.
 *   • لا نضيف أي تخمين خطير: كل استنتاج غير مؤكد يُسجَّل في `warnings`.
 */

import type { ErColumn, ErModel, ErTable } from '../drawioImporter';
import { parseRawType, sanitizeIdentifier } from '../ddlGenerator';

// ---------------------------------------------------------------------------
// الخيارات والأنواع العامة
// ---------------------------------------------------------------------------

export type BackendDb = 'mysql' | 'postgres' | 'sqlite';
export type BackendFramework = 'fastapi' | 'django' | 'laravel' | 'pdo';
export type BackendMode = 'full' | 'models';

export interface BackendOptions {
  db: BackendDb;
  /** 'auto' يختار Laravel لـMySQL وFastAPI لـPostgreSQL/SQLite — Django اختيار يدوي */
  framework: BackendFramework | 'auto';
  /** full = Models+Migrations+CRUD API · models = Models+Migrations فقط */
  mode: BackendMode;
  /** JWT/توكن Bearer + تسجيل/دخول (FastAPI وLaravel) أو API token (PDO) */
  auth: boolean;
  /** سبب التوجيه — يُسجَّل في README وMANIFEST */
  routingReason?: 'manual' | 'auto';
  /** صفوف بذر مولّدة بالذكاء الاصطناعي: جدول → قائمة صفوف (عمود → قيمة) */
  aiSeedRows?: AiSeedRows;
  /** ملاحظات الإثراء الذكي — تُوثَّق في README وMANIFEST */
  aiNotes?: string[];
  /** تحذيرات إضافية من طبقة التوليد (مثل تعذّر الإثراء) — تُوثَّق في README وMANIFEST */
  extraWarnings?: string[];
}

export type AiSeedValue = string | number | boolean | null;
export type AiSeedRows = Record<string, Record<string, AiSeedValue>[]>;

export type ColumnKind =
  | 'int'
  | 'bigint'
  | 'smallint'
  | 'float'
  | 'decimal'
  | 'string'
  | 'text'
  | 'bool'
  | 'date'
  | 'datetime'
  | 'time'
  | 'json'
  | 'uuid'
  | 'binary'
  | 'unknown';

export type FkRef = {
  parent: BackendTable;
  /** العمود الأب الذي يُشير إليه المفتاح (عادةً PK) */
  parentColumn: BackendColumn;
  onDelete: 'CASCADE' | 'SET NULL' | null;
};

export type BackendColumn = {
  /** اسم العمود كما سيظهر في قاعدة البيانات (يبقى كما كتبه المستخدم) */
  name: string;
  /** اسم المتغيّر في Python/PHP (snake_case) */
  codeName: string;
  kind: ColumnKind;
  rawType: string;
  length?: number;
  precision?: number;
  scale?: number;
  primaryKey: boolean;
  nullable: boolean;
  unique: boolean;
  autoIncrement: boolean;
  defaultValue?: string;
  check?: string;
  fk?: FkRef;
  /** عمود أنشأه المولّد لأن العلاقة لم تُعلن عموداً صريحاً */
  synthesized?: boolean;
};

export type BelongsToRelation = {
  parent: BackendTable;
  fkColumn: BackendColumn;
  /** اسم الخاصية في الابن: customer / billing_customer */
  attr: string;
  /** اسم الخاصية المعاكسة في الأب */
  backAttr: string;
  /** أكثر من FK من نفس الابن إلى نفس الأب → يلزم foreign_keys */
  ambiguous: boolean;
};

export type HasManyRelation = {
  child: BackendTable;
  fkColumn: BackendColumn;
  attr: string;
  backAttr: string;
  ambiguous: boolean;
};

export type BackendIndex = {
  name: string;
  columns: string[];
  unique: boolean;
};

export type BackendTable = {
  id: string;
  /** اسم الجدول في قاعدة البيانات بعد التنقية */
  name: string;
  /** الاسم الأصلي في المخطط — للعرض والرسائل */
  rawName: string;
  /** PascalCase مفرد للـClass */
  className: string;
  /** snake_case للـmodule/router */
  moduleName: string;
  columns: BackendColumn[];
  primaryKey: BackendColumn[];
  isJunction: boolean;
  junctionEndpoints?: [string, string];
  belongsTo: BelongsToRelation[];
  hasMany: HasManyRelation[];
  /** فهارس/قيود UNIQUE على مستوى الجدول */
  indexes: BackendIndex[];
  /** تعبيرات CHECK على مستوى الجدول */
  tableChecks: string[];
};

export type BackendModel = {
  tables: BackendTable[];
  /** جداول المخطط الأصلية بلا جداول الربط */
  baseTables: BackendTable[];
  /** ترتيب إنشاء آمن (الأب قبل الابن ثم جداول الربط) */
  order: BackendTable[];
  warnings: string[];
  source: ErModel;
};

export class BackendCodegenError extends Error {}

// ---------------------------------------------------------------------------
// مفردات مساعدة
// ---------------------------------------------------------------------------

const PY_RESERVED = new Set([
  'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del',
  'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in',
  'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while',
  'with', 'yield', 'match', 'case', 'self', 'cls', 'None', 'True', 'False',
  // أسماء محجوزة في SQLAlchemy Declarative — تُجنَّب كأسماء أعمدة
  'metadata', 'registry',
]);

const PHP_RESERVED = new Set([
  'abstract', 'and', 'array', 'as', 'break', 'callable', 'case', 'catch', 'class',
  'clone', 'const', 'continue', 'declare', 'default', 'do', 'echo', 'else', 'elseif',
  'empty', 'enddeclare', 'endfor', 'endforeach', 'endif', 'endswitch', 'endwhile',
  'eval', 'exit', 'extends', 'final', 'finally', 'fn', 'for', 'foreach', 'function',
  'global', 'goto', 'if', 'implements', 'include', 'include_once', 'instanceof',
  'insteadof', 'interface', 'isset', 'list', 'match', 'namespace', 'new', 'or',
  'print', 'private', 'protected', 'public', 'readonly', 'require', 'require_once',
  'return', 'static', 'switch', 'throw', 'trait', 'try', 'unset', 'use', 'var',
  'while', 'xor', 'yield', 'int', 'float', 'bool', 'string', 'true', 'false', 'null',
  'void', 'iterable', 'object', 'mixed', 'never', 'enum', 'parent', 'self', 'static',
]);

const IRREGULAR_SINGULAR: Record<string, string> = {
  people: 'person',
  men: 'man',
  women: 'woman',
  children: 'child',
  teeth: 'tooth',
  feet: 'foot',
  mice: 'mouse',
  geese: 'goose',
  data: 'datum',
  media: 'medium',
  analyses: 'analysis',
  diagnoses: 'diagnosis',
  theses: 'thesis',
  criteria: 'criterion',
  phenomena: 'phenomenon',
  indices: 'index',
  matrices: 'matrix',
  vertices: 'vertex',
  statuses: 'status',
  aliases: 'alias',
  octopuses: 'octopus',
  viruses: 'virus',
  addresses: 'address',
  businesses: 'business',
  classes: 'class',
  processes: 'process',
  boxes: 'box',
  taxes: 'tax',
  quizzes: 'quiz',
  buses: 'bus',
  crises: 'crisis',
};

/** مفرد إنجليزي عملي لأسماء الجداول: categories → category، order_items → order_item */
export function singularWord(word: string): string {
  const lower = word.toLowerCase();
  if (IRREGULAR_SINGULAR[lower]) return IRREGULAR_SINGULAR[lower];
  if (/ies$/.test(lower) && lower.length > 3) return lower.slice(0, -3) + 'y';
  if (/(ss|us|is)$/.test(lower)) return lower;
  if (/(ch|sh|x|z|s)es$/.test(lower)) return lower.slice(0, -2);
  if (/s$/.test(lower) && !/ss$/.test(lower)) return lower.slice(0, -1);
  return lower;
}

export function toPascal(text: string): string {
  return text
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export function singularTableName(name: string): string {
  const parts = name.split('_').filter(Boolean);
  if (parts.length === 0) return name || 'record';
  const last = singularWord(parts[parts.length - 1]);
  return [...parts.slice(0, -1), last].join('_');
}

export function pluralize(name: string): string {
  const lower = name.toLowerCase();
  if (/(s|x|z|ch|sh|us|is)$/.test(lower)) return lower + 'es';
  if (/[^aeiou]y$/.test(lower)) return lower.slice(0, -1) + 'ies';
  return lower + 's';
}

export function snakeCase(text: string): string {
  const cleaned = sanitizeIdentifier(text)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
  let out = cleaned || 'field';
  if (/^\d/.test(out)) out = 'f_' + out;
  if (PY_RESERVED.has(out)) out += '_';
  return out;
}

export function camelCase(text: string): string {
  const pascal = toPascal(text);
  return pascal ? pascal.charAt(0).toLowerCase() + pascal.slice(1) : 'relation';
}

export function phpIdentifier(text: string, fallback = 'item'): string {
  const cleaned = sanitizeIdentifier(text);
  let out = cleaned || fallback;
  if (/^\d/.test(out)) out = 'x' + out;
  if (PHP_RESERVED.has(out.toLowerCase())) out += 'Model';
  return out;
}

function pythonIdentifier(text: string, fallback = 'value'): string {
  const cleaned = sanitizeIdentifier(text);
  let out = cleaned || fallback;
  if (/^\d/.test(out)) out = 'v_' + out;
  if (PY_RESERVED.has(out.toLowerCase())) out += '_';
  return out;
}

function uniqueName(base: string, used: Set<string>): string {
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) candidate = `${base}${n++}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

// ---------------------------------------------------------------------------
// تحليل الأنواع
// ---------------------------------------------------------------------------

export function classifyColumn(rawType: string): Pick<BackendColumn, 'kind' | 'rawType' | 'length' | 'precision' | 'scale'> {
  const raw = (rawType || '').trim();
  const parsed = parseRawType(raw);
  const base = parsed.base;
  const length = parsed.params[0];
  const precision = parsed.params[0];
  const scale = parsed.params[1];

  if (/^enum\b/i.test(raw) || /^set\b/i.test(raw)) {
    const values = raw.match(/'([^']*)'/g)?.map(v => v.slice(1, -1)) ?? [];
    return {
      kind: 'string',
      rawType: raw,
      length: Math.max(1, ...values.map(v => v.length)),
    };
  }

  const kind: ColumnKind = (() => {
    switch (base) {
      case 'int':
      case 'integer':
      case 'int4':
      case 'mediumint':
        return 'int';
      case 'bigint':
      case 'int8':
      case 'bigserial':
        return 'bigint';
      case 'smallint':
      case 'int2':
      case 'tinyint':
      case 'int3':
        return base === 'tinyint' && length === 1 ? 'bool' : 'smallint';
      case 'serial':
        return 'int';
      case 'decimal':
      case 'numeric':
      case 'number':
      case 'money':
        return 'decimal';
      case 'float':
      case 'real':
      case 'double':
      case 'double precision':
        return 'float';
      case 'boolean':
      case 'bool':
      case 'bit':
        return 'bool';
      case 'date':
        return 'date';
      case 'datetime':
      case 'timestamp':
      case 'timestamptz':
      case 'datetime2':
        return 'datetime';
      case 'time':
      case 'timetz':
        return 'time';
      case 'json':
      case 'jsonb':
        return 'json';
      case 'uuid':
        return 'uuid';
      case 'blob':
      case 'binary':
      case 'varbinary':
      case 'bytea':
      case 'image':
        return 'binary';
      case 'varchar':
      case 'nvarchar':
      case 'char':
      case 'nchar':
      case 'character':
      case 'character varying':
      case 'string':
        return 'string';
      case 'text':
      case 'tinytext':
      case 'mediumtext':
      case 'longtext':
      case 'clob':
        return 'text';
      default:
        return raw ? 'unknown' : 'string';
    }
  })();

  return { kind, rawType: raw, length, precision, scale };
}

export function isNumericKind(kind: ColumnKind): boolean {
  return kind === 'int' || kind === 'bigint' || kind === 'smallint' || kind === 'float' || kind === 'decimal';
}

export function looksLikeEmail(columnName: string): boolean {
  return /(^|_)(e?mail|email_address)($|_)/i.test(columnName) || /^email/i.test(columnName);
}

// ---------------------------------------------------------------------------
// بناء الأعمدة/الجداول
// ---------------------------------------------------------------------------

function makeColumn(col: ErColumn, index: number): BackendColumn {
  const name = (col.name || '').trim() || `column_${index + 1}`;
  const info = classifyColumn(col.type);
  return {
    name,
    codeName: '', // يُحسب في النهاية بعد استقرار الأعمدة
    ...info,
    primaryKey: col.isPrimaryKey === true,
    nullable: col.isPrimaryKey ? false : col.isNullable !== false,
    unique: col.isUnique === true && col.isPrimaryKey !== true,
    autoIncrement: false,
    defaultValue: col.defaultValue,
    check: col.check,
    ...(col.isForeignKey ? { synthesized: false } : {}),
  };
}

function makeTable(source: ErTable, usedNames: Set<string>, usedClasses: Set<string>): BackendTable {
  const rawName = source.name || source.id;
  const name = uniqueName(sanitizeIdentifier(rawName), usedNames);
  const singular = singularTableName(name);
  const className = uniqueName(
    (() => {
      const pascal = toPascal(singular) || 'Record';
      return PHP_RESERVED.has(pascal.toLowerCase()) ? `${pascal}Model` : pascal;
    })(),
    usedClasses
  );
  return {
    id: source.id,
    name,
    rawName,
    className,
    moduleName: snakeCase(name),
    columns: source.columns.map(makeColumn),
    primaryKey: [],
    isJunction: false,
    belongsTo: [],
    hasMany: [],
    indexes: (source.indexes ?? [])
      .map(index => ({
        name: index.name || `ix_${sanitizeIdentifier(rawName)}_${index.columns.join('_')}`,
        columns: index.columns.filter(column =>
          source.columns.some(sourceCol => sourceCol.name.toLowerCase() === column.toLowerCase())
        ),
        unique: index.unique,
      }))
      .filter(index => index.columns.length > 0),
    tableChecks: (source.tableChecks ?? []).filter(check => (check || '').trim().length > 0),
  };
}

function findColumn(table: BackendTable, name: string): BackendColumn | undefined {
  const target = name.toLowerCase();
  return table.columns.find(c => c.name.toLowerCase() === target);
}

function firstPk(table: BackendTable): BackendColumn | undefined {
  return table.columns.find(c => c.primaryKey);
}

/** مفتاح الأب: أول PK، أو العمود الوحيد، أو "id" مع تحذير */
function resolveParentKey(table: BackendTable, warnings: string[]): BackendColumn {
  const pk = firstPk(table);
  if (pk) return pk;
  if (table.columns.length === 1) {
    warnings.push(
      `Table "${table.name}" has no explicit primary key — using its only column "${table.columns[0].name}" as the referenced key.`
    );
    return table.columns[0];
  }
  warnings.push(`Table "${table.name}" has no explicit primary key — assuming an "id" key for foreign keys.`);
  const synthetic: BackendColumn = {
    name: 'id',
    codeName: 'id',
    kind: 'int',
    rawType: 'INT',
    primaryKey: false,
    nullable: false,
    unique: false,
    autoIncrement: false,
    synthesized: true,
  };
  return synthetic;
}

function autoFkColumnName(child: BackendTable, parent: BackendTable): string {
  const base = sanitizeIdentifier(parent.name).toLowerCase();
  const variants = new Set<string>([
    `${base}_id`,
    `${base.replace(/ies$/, 'y')}_id`,
    `${base.replace(/s$/, '')}_id`,
  ]);
  for (const col of child.columns) {
    if (variants.has(col.name.toLowerCase())) return col.name;
  }
  return sanitizeIdentifier(`${parent.name}_id`);
}

function matchParentForFlaggedFk(columnName: string, child: BackendTable, tables: BackendTable[]): BackendTable | undefined {
  let base = columnName.toLowerCase().trim();
  base = base.replace(/_(id|no|nr|num|number|ref|key|fk|code)$/g, '');
  if (!base || base.length < 2) return undefined;
  const candidates = new Set<string>([base, `${base}s`, `${base}es`]);
  if (base.endsWith('y')) candidates.add(`${base.slice(0, -1)}ies`);
  let selfHit: BackendTable | undefined;
  for (const table of tables) {
    if (!candidates.has(table.name.toLowerCase().trim())) continue;
    if (table.id !== child.id) return table;
    selfHit = table;
  }
  if (selfHit) return selfHit;
  if (/^(parent|sup|ancestor|root|boss|manager|superior|head|chief|super)$/i.test(base)) return child;
  return undefined;
}

function addSynthesizedFkColumn(
  child: BackendTable,
  parent: BackendTable,
  parentColumn: BackendColumn,
  columnName: string,
  unique: boolean,
  onDelete: FkRef['onDelete']
): BackendColumn {
  const existing = findColumn(child, columnName);
  if (existing) {
    existing.fk = { parent, parentColumn, onDelete };
    if (unique) existing.unique = true;
    return existing;
  }
  const column: BackendColumn = {
    name: columnName,
    codeName: '',
    kind: parentColumn.kind,
    rawType: parentColumn.rawType,
    length: parentColumn.length,
    precision: parentColumn.precision,
    scale: parentColumn.scale,
    primaryKey: false,
    // مطابقة لـddlGenerator: العمود المُولَّد nullable إلا لو كان حذفاً تتابعياً
    nullable: onDelete !== 'CASCADE',
    unique,
    autoIncrement: false,
    fk: { parent, parentColumn, onDelete },
    synthesized: true,
  };
  child.columns.push(column);
  return column;
}

function ensureJunction(
  left: BackendTable,
  right: BackendTable,
  tables: BackendTable[],
  usedNames: Set<string>,
  usedClasses: Set<string>,
  seen: Set<string>,
  warnings: string[]
): BackendTable | undefined {
  const key = [left.name, right.name].sort().join('__');
  if (seen.has(key)) return undefined;
  seen.add(key);

  const leftPk = resolveParentKey(left, warnings);
  const rightPk = resolveParentKey(right, warnings);
  const baseName = sanitizeIdentifier(`${left.name}_${right.name}_junction`.slice(0, 60));
  const name = uniqueName(baseName, usedNames);
  if (name !== baseName) {
    warnings.push(`Junction table name "${baseName}" collided with an existing table — renamed to "${name}".`);
  }
  const singular = singularTableName(name);
  const className = uniqueName(toPascal(singular) || 'Junction', usedClasses);

  const leftCol: BackendColumn = {
    name: uniqueName(sanitizeIdentifier(`${left.name}_id`), new Set<string>()),
    codeName: '',
    kind: leftPk.kind,
    rawType: leftPk.rawType,
    length: leftPk.length,
    primaryKey: true,
    nullable: false,
    unique: false,
    autoIncrement: false,
    fk: { parent: left, parentColumn: leftPk, onDelete: 'CASCADE' },
  };
  const rightCol: BackendColumn = {
    name: sanitizeIdentifier(`${right.name}_id`),
    codeName: '',
    kind: rightPk.kind,
    rawType: rightPk.rawType,
    length: rightPk.length,
    primaryKey: true,
    nullable: false,
    unique: false,
    autoIncrement: false,
    fk: { parent: right, parentColumn: rightPk, onDelete: 'CASCADE' },
  };
  // عمودان بنفس الاسم عند علاقة ذاتية N-M
  if (rightCol.name.toLowerCase() === leftCol.name.toLowerCase()) {
    rightCol.name = sanitizeIdentifier(`${right.name}_id_2`);
  }

  const table: BackendTable = {
    id: `junction:${name}`,
    name,
    rawName: name,
    className,
    moduleName: snakeCase(name),
    columns: [leftCol, rightCol],
    primaryKey: [leftCol, rightCol],
    isJunction: true,
    junctionEndpoints: [left.id, right.id],
    belongsTo: [],
    hasMany: [],
    indexes: [],
    tableChecks: [],
  };
  tables.push(table);
  return table;
}

// ---------------------------------------------------------------------------
// الترتيب الطوبولوجي
// ---------------------------------------------------------------------------

function topologicalOrder(tables: BackendTable[], warnings: string[]): BackendTable[] {
  const byId = new Map(tables.map(t => [t.id, t]));
  const deps = new Map<string, Set<string>>();
  for (const table of tables) {
    const set = new Set<string>();
    for (const col of table.columns) {
      const parent = col.fk?.parent;
      if (parent && parent.id !== table.id && byId.has(parent.id)) set.add(parent.id);
    }
    deps.set(table.id, set);
  }

  const ordered: BackendTable[] = [];
  const placed = new Set<string>();
  const remaining = [...tables];

  while (remaining.length > 0) {
    const index = remaining.findIndex(t => [...(deps.get(t.id) ?? [])].every(id => placed.has(id)));
    if (index === -1) {
      warnings.push('Circular foreign-key dependency detected — cyclic constraints are deferred to a second migration phase.');
      ordered.push(...remaining);
      break;
    }
    const [table] = remaining.splice(index, 1);
    ordered.push(table);
    placed.add(table.id);
  }

  // جداول الربط دائماً في النهاية كي يجد الأبُ مكانه أولاً
  return [...ordered.filter(t => !t.isJunction), ...ordered.filter(t => t.isJunction)];
}

// ---------------------------------------------------------------------------
// بناء العلاقات (الاسم المباشر والمعاكس)
// ---------------------------------------------------------------------------

function buildRelations(tables: BackendTable[]): void {
  for (const table of tables) {
    table.belongsTo = [];
    table.hasMany = [];
  }

  for (const child of tables) {
    const fks = child.columns.filter(c => c.fk);
    const perParent = new Map<string, number>();
    for (const col of fks) perParent.set(col.fk!.parent.id, (perParent.get(col.fk!.parent.id) ?? 0) + 1);

    const usedAttrs = new Set<string>(child.columns.map(c => c.codeName.toLowerCase()));
    for (const col of fks) {
      const parent = col.fk!.parent;
      const rawBase = col.name.replace(/_(id|no|nr|num|number|ref|key|fk|code)$/i, '');
      let attr = snakeCase(rawBase || singularTableName(parent.name));
      if (attr === 'id' || attr === '') attr = snakeCase(singularTableName(parent.name));
      attr = uniqueName(attr, usedAttrs);
      if (PY_RESERVED.has(attr)) attr += '_';

      const selfRef = parent.id === child.id;
      const backBase = selfRef ? 'children' : snakeCase(pluralize(singularTableName(child.name)));
      const ambiguous = (perParent.get(parent.id) ?? 0) > 1;
      child.belongsTo.push({
        parent,
        fkColumn: col,
        attr,
        backAttr: backBase,
        ambiguous,
      });
    }
  }

  // الآن نوزّع hasMany على الآباء ونضبط الأسماء الفريدة + back_populates
  for (const parent of tables) {
    const usedAttrs = new Set<string>(parent.columns.map(c => c.codeName.toLowerCase()));
    const incoming: { child: BackendTable; rel: BelongsToRelation }[] = [];
    for (const child of tables) {
      for (const rel of child.belongsTo) {
        if (rel.parent.id === parent.id) incoming.push({ child, rel });
      }
    }
    incoming.sort((a, b) => a.rel.fkColumn.name.localeCompare(b.rel.fkColumn.name));
    for (const { child, rel } of incoming) {
      let attr = rel.backAttr;
      if (usedAttrs.has(attr.toLowerCase())) attr = `${rel.attr}_${attr}`;
      attr = uniqueName(attr, usedAttrs);
      rel.backAttr = attr;
      parent.hasMany.push({
        child,
        fkColumn: rel.fkColumn,
        attr,
        backAttr: rel.attr,
        ambiguous: rel.ambiguous,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// نقطة الدخول
// ---------------------------------------------------------------------------

export function analyzeBackendModel(model: ErModel): BackendModel {
  // تحذيرات الاستيراد/التحليل (علاقات مفقودة، Triggers تعتمد على دوال…) تصل إلى README وMANIFEST
  const warnings: string[] = [...(model.warnings ?? [])];
  const usedNames = new Set<string>();
  // أسماء محجوزة في طبقة الـORM كي لا يصطدم اسم جدول مع Base/Model
  const usedClasses = new Set<string>(['base', 'model', 'session', 'engine']);

  const baseTables: BackendTable[] = [];
  for (const source of model.tables) {
    const usable = source.columns.filter(c => (c.name || '').trim().length > 0);
    if (usable.length === 0) {
      warnings.push(`Table "${source.name || source.id}" was skipped — it has no columns.`);
      continue;
    }
    baseTables.push(makeTable({ ...source, columns: usable }, usedNames, usedClasses));
  }

  if (baseTables.length === 0) {
    throw new BackendCodegenError(
      'The schema has no table with columns — upload or build a schema before generating a backend.'
    );
  }

  const tables: BackendTable[] = [...baseTables];
  const byId = new Map<string, BackendTable>(baseTables.map(t => [t.id, t]));
  const junctionSeen = new Set<string>();

  const upsertFk = (child: BackendTable, parent: BackendTable, parentColumn: BackendColumn, columnName: string, unique: boolean, onDelete: FkRef['onDelete']): void => {
    const existing = findColumn(child, columnName);
    if (existing) {
      // SET NULL لا يصلح لعمود NOT NULL — نترك السلوك الافتراضي بدل توليد DDL يفشل
      const safeOnDelete = onDelete === 'SET NULL' && !existing.nullable ? null : onDelete;
      existing.fk = { parent, parentColumn, onDelete: safeOnDelete };
      if (unique) existing.unique = true;
      return;
    }
    addSynthesizedFkColumn(child, parent, parentColumn, columnName, unique, onDelete);
  };

  for (const rel of model.relationships) {
    const source = byId.get(rel.sourceTable);
    const target = byId.get(rel.targetTable);
    if (!source || !target) continue;

    if (rel.cardinality === 'N-M') {
      ensureJunction(source, target, tables, usedNames, usedClasses, junctionSeen, warnings);
      continue;
    }

    const isOneToMany = rel.cardinality === '1-N';
    const parent = isOneToMany ? source : target;
    const child = isOneToMany ? target : source;
    const declaredParentCol = isOneToMany ? rel.sourceColumn : rel.targetColumn;
    const parentColumn =
      (declaredParentCol && findColumn(parent, declaredParentCol)) || resolveParentKey(parent, warnings);
    const declaredChildCol = isOneToMany ? rel.targetColumn : rel.sourceColumn;
    const childColumnName = declaredChildCol || autoFkColumnName(child, parent);
    const onDelete: FkRef['onDelete'] =
      rel.onDelete === 'CASCADE' || rel.onDelete === 'SET NULL'
        ? rel.onDelete
        : rel.cardinality === '1-1'
          ? 'SET NULL'
          : null;
    upsertFk(child, parent, parentColumn, childColumnName, rel.cardinality === '1-1', onDelete);
  }

  // أعمدة FK معلَّمة نصياً بلا علاقة مرسومة
  const covered = new Set(
    tables.flatMap(t => t.columns.filter(c => c.fk).map(c => `${t.id}:${c.name.toLowerCase()}`))
  );
  for (const table of baseTables) {
    for (const col of table.columns) {
      const sourceCol = model.tables.find(t => t.id === table.id)?.columns.find(c => c.name === col.name);
      if (!sourceCol?.isForeignKey || col.primaryKey) continue;
      const key = `${table.id}:${col.name.toLowerCase()}`;
      if (covered.has(key)) continue;
      const parent = matchParentForFlaggedFk(col.name, table, baseTables);
      if (!parent) {
        warnings.push(`Column "${col.name}" in "${table.name}" is flagged FOREIGN KEY but no matching parent table was found.`);
        continue;
      }
      const parentColumn = resolveParentKey(parent, warnings);
      if (parent.id === table.id && parentColumn.name.toLowerCase() === col.name.toLowerCase()) continue;
      col.fk = { parent, parentColumn, onDelete: null };
      covered.add(key);
    }
  }

  // Auto-increment: PK رقمية وحيدة — نفس قاعدة ddlGenerator
  for (const table of tables) {
    if (table.isJunction) continue;
    const pks = table.columns.filter(c => c.primaryKey);
    if (pks.length === 1 && isNumericKind(pks[0].kind)) pks[0].autoIncrement = true;
  }

  // أسماء المتغيّرات مع منع التكرار داخل الجدول
  for (const table of tables) {
    const used = new Set<string>();
    for (const col of table.columns) {
      if (!col.codeName) col.codeName = uniqueName(pythonIdentifier(col.name), used);
      else used.add(col.codeName.toLowerCase());
    }
    table.primaryKey = table.columns.filter(c => c.primaryKey);
  }

  for (const table of tables) {
    if (table.primaryKey.length === 0) {
      warnings.push(
        `Table "${table.name}" has no primary key — list/create endpoints are generated, but detail/update/delete are omitted.`
      );
    }
    for (const col of table.columns) {
      if (col.kind === 'unknown') {
        warnings.push(
          `Column "${table.name}.${col.name}" has unsupported SQL type "${col.rawType}" — mapped to TEXT.`
        );
      }
    }
  }

  buildRelations(tables);
  const order = topologicalOrder(tables, warnings);

  return {
    tables,
    baseTables,
    order,
    warnings,
    source: model,
  };
}

// ---------------------------------------------------------------------------
// اختيار التقنية — القاعدة الذكية
// ---------------------------------------------------------------------------

export function resolveFramework(db: BackendDb, requested: BackendFramework | 'auto'): BackendFramework {
  if (requested !== 'auto') return requested;
  return db === 'mysql' ? 'laravel' : 'fastapi';
}

export function frameworkLanguage(framework: BackendFramework): 'python' | 'php' {
  return framework === 'fastapi' || framework === 'django' ? 'python' : 'php';
}

export function frameworkLabel(framework: BackendFramework, db: BackendDb): string {
  if (framework === 'fastapi') return `FastAPI · SQLAlchemy · Pydantic · ${dbLabel(db)}`;
  if (framework === 'django') return `Django · DRF · Django ORM · ${dbLabel(db)}`;
  if (framework === 'laravel') return `Laravel · Eloquent · ${dbLabel(db)}`;
  return `PHP 8 · PDO · ${dbLabel(db)}`;
}

export function dbLabel(db: BackendDb): string {
  return db === 'mysql' ? 'MySQL' : db === 'postgres' ? 'PostgreSQL' : 'SQLite';
}

/** اسم ملف الـmigration الموحّد لكل محرّكات SQL المدعومة */
export function migrationFilename(): string {
  return '001_init.sql';
}

/** صياغة نص PHP بعلامات اقتباس مفردة آمنة */
export function phpSingleQuote(value: string): string {
  return "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}
