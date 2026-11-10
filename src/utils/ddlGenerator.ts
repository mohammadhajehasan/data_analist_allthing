/**
 * DDL Generator — توليد سكيمّا SQL من نموذج ErModel المستخرج من draw.io
 * ----------------------------------------------------------------
 * الأصناف المدعومة: MySQL / PostgreSQL / SQLite / SQL Server / Oracle
 *
 * ما يولّده:
 *   • CREATE TABLE بأعمدة وأنواع مطابقة لكل محرك (mapping كامل)
 *   • PRIMARY KEY (مفرد أو مركّب)
 *   • FOREIGN KEY: 1-N → مفتاح أجنبي على الجدول الابن، 1-1 → + UNIQUE،
 *     N-M → جدول ربط (junction) بمفتاح مركّب وحذف تتابعي (اختياري)
 *   • AUTO_INCREMENT (MySQL) / SERIAL (PG) / AUTOINCREMENT (SQLite) /
 *     IDENTITY(1,1) (SQL Server) / GENERATED AS IDENTITY (Oracle)
 *   • ترتيب créations بالأولوية (Topological): الجدول الأب قبل الابن
 *   • DROP TABLE IF EXISTS اختيارياً
 */

import type { ErModel, ErTable, ErColumn, ErTrigger, ErView } from './drawioImporter';

export type SqlDialect = 'mysql' | 'postgres' | 'sqlite' | 'sqlserver' | 'oracle';

export type DdlOptions = {
  dropIfExists: boolean;
  createJunctionTables: boolean;
  /**
   * عند وجود مفاتيح أجنبية دائرية: أنشئ الجداول أولاً ثم أضف القيود بـALTER
   * (لا ينطبق على SQLite لأنها تسمح بالمراجع الأمامية ولا تدعم ADD CONSTRAINT).
   */
  deferCyclicForeignKeys: boolean;
};

export const DEFAULT_DDL_OPTIONS: DdlOptions = {
  dropIfExists: true,
  createJunctionTables: true,
  deferCyclicForeignKeys: false,
};

export type DdlResult = {
  dialect: SqlDialect;
  code: string;
  /** ملاحظات التوليد (بما فيها FKs المُعلَمة بلا جدول أم مطابق) — بوصف زائد حيث أنها تُطبع أيضًا كتذييل `-- Notes:` */
  warnings: string[];
  stats: {
    tables: number;
    columns: number;
    fks: number;
    junctionTables: number;
    /** فهارس أُصدرت فعلاً (بعد إسقاط المفقود والمكرر المضمّن في العمود) */
    indexes: number;
    views: number;
    triggers: number;
  };
};

export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// معالجة المعرّفات (Identifiers)
// ---------------------------------------------------------------------------

export function sanitizeIdentifier(raw: string): string {
  const cleaned = (raw || '').trim().replace(/\s+/g, '_').replace(/[^\w$]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'unnamed';
}

function quoteIdent(name: string, dialect: SqlDialect): string {
  switch (dialect) {
    case 'mysql':
      return '`' + name + '`';
    case 'postgres':
    case 'sqlite':
      return '"' + name + '"';
    case 'sqlserver':
      return '[' + name + ']';
    case 'oracle': {
      if (/^[A-Za-z][A-Za-z0-9_$#]*$/.test(name)) return name.toUpperCase();
      return '"' + name.toUpperCase() + '"';
    }
  }
}

// ---------------------------------------------------------------------------
// تحليل الأنواع
// ---------------------------------------------------------------------------

export interface ParsedType {
  base: string;       // نمط أساسي منقّى من "unsigned"
  params: number[];   // (p[, s])
  unsigned: boolean;
}

export function parseRawType(raw: string): ParsedType {
  const text = (raw || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const m = text.match(/^([a-z][a-z ]*?)(?:\s*\(\s*([\d]+)(?:\s*,\s*([\d]+))?\))?$/);
  if (!m) return { base: 'varchar', params: [255], unsigned: false };
  return {
    base: m[1].trim().replace(/unsigned/g, '').replace(/\s+/g, ' ').trim(),
    params: [m[2] ? parseInt(m[2], 10) : NaN, m[3] ? parseInt(m[3], 10) : NaN].filter(n => Number.isFinite(n)),
    unsigned: /unsigned/.test(text),
  };
}

const NUMERIC_BASES = new Set(['int', 'integer', 'bigint', 'tinyint', 'smallint', 'mediumint', 'serial', 'bigserial', 'int8', 'int4', 'int2', 'int3']);

export function isNumericType(col: ErColumn): boolean {
  return NUMERIC_BASES.has(parseRawType(col.type).base);
}

// ---------------------------------------------------------------------------
// خريطة الأنواع — الناتج المناسب لكل محرك
// ---------------------------------------------------------------------------

export function mapType(col: ErColumn, dialect: SqlDialect): string {
  const { base, params, unsigned } = parseRawType(col.type);
  const p0 = () => String(params[0] ?? 255);
  const p1 = () => String(params[1] ?? 0);
  const uSuffixMysql = () => (unsigned ? ' UNSIGNED' : '');

  switch (dialect) {
    case 'mysql':
      switch (base) {
        case 'int': case 'integer': case 'int4': case 'serial': return 'INT' + uSuffixMysql();
        case 'bigint': case 'bigserial': case 'int8': return 'BIGINT' + uSuffixMysql();
        case 'tinyint': case 'int2': case 'int3': return 'TINYINT' + uSuffixMysql();
        case 'smallint': return 'SMALLINT' + uSuffixMysql();
        case 'mediumint': return 'MEDIUMINT' + uSuffixMysql();
        case 'varchar': case 'nvarchar': case 'character varying': return `VARCHAR(${p0()})`;
        case 'char': case 'nchar': case 'character': return `CHAR(${params.length ? String(params[0]) : '1'})`;
        case 'text': return 'TEXT';
        case 'string': return 'VARCHAR(255)';
        case 'boolean': case 'bool': case 'bit': return 'TINYINT(1)';
        case 'float': case 'real': return 'FLOAT';
        case 'double': case 'double precision': return 'DOUBLE';
        case 'decimal': case 'numeric': case 'number': return params.length >= 2 ? `DECIMAL(${p0()},${p1()})` : 'DECIMAL(10,0)';
        case 'money': return 'DECIMAL(19,4)';
        case 'date': return 'DATE';
        case 'time': return 'TIME';
        case 'datetime': return 'DATETIME';
        case 'timestamp': case 'timestamptz': return 'TIMESTAMP';
        case 'uuid': return 'CHAR(36)';
        case 'json': case 'jsonb': return 'JSON';
        case 'blob': case 'bytea': case 'binary': case 'varbinary': case 'image': return 'BLOB';
        case 'clob': return 'LONGTEXT';
        case 'enum': return 'VARCHAR(64)';
        default: return 'VARCHAR(255)';
      }

    case 'postgres':
      switch (base) {
        case 'int': case 'integer': case 'int4': case 'mediumint': case 'serial': return 'INTEGER';
        case 'bigint': case 'bigserial': case 'int8': return 'BIGINT';
        case 'tinyint': case 'smallint': case 'int2': case 'int3': return 'SMALLINT';
        case 'varchar': case 'nvarchar': case 'character varying': return `VARCHAR(${p0()})`;
        case 'char': case 'nchar': case 'character': return `CHAR(${params.length ? String(params[0]) : '1'})`;
        case 'text': case 'string': case 'clob': return 'TEXT';
        case 'boolean': case 'bool': return 'BOOLEAN';
        case 'bit': return 'BIT';
        case 'float': case 'double': case 'double precision': return 'DOUBLE PRECISION';
        case 'real': return 'REAL';
        case 'decimal': case 'numeric': case 'number': return params.length >= 2 ? `NUMERIC(${p0()},${p1()})` : 'NUMERIC';
        case 'money': return 'MONEY';
        case 'date': return 'DATE';
        case 'time': return 'TIME';
        case 'datetime': case 'timestamp': return 'TIMESTAMP';
        case 'timestamptz': return 'TIMESTAMPTZ';
        case 'uuid': return 'UUID';
        case 'json': return 'JSON';
        case 'jsonb': return 'JSONB';
        case 'blob': case 'bytea': case 'binary': case 'varbinary': case 'image': return 'BYTEA';
        case 'enum': return 'VARCHAR(64)';
        default: return 'TEXT';
      }

    case 'sqlite':
      switch (base) {
        case 'int': case 'integer': case 'int4': case 'int8': case 'bigint': case 'tinyint': case 'smallint': case 'mediumint': return 'INTEGER';
        case 'varchar': case 'nvarchar': case 'char': case 'nchar': case 'character': case 'text': case 'string': case 'clob':
        case 'uuid': case 'date': case 'time': case 'datetime': case 'timestamp': case 'timestamptz': case 'json': case 'jsonb': case 'enum': return 'TEXT';
        case 'float': case 'real': case 'double': case 'double precision': return 'REAL';
        case 'decimal': case 'numeric': case 'number': case 'money': return params.length >= 2 ? `NUMERIC(${p0()},${p1()})` : 'NUMERIC';
        case 'boolean': case 'bool': case 'bit': return 'INTEGER_CHECK01';
        case 'blob': case 'bytea': case 'binary': case 'varbinary': case 'image': return 'BLOB';
        default: return 'TEXT';
      }

    case 'sqlserver':
      switch (base) {
        case 'int': case 'integer': case 'int4': case 'mediumint': case 'serial': return 'INT';
        case 'bigint': case 'bigserial': case 'int8': return 'BIGINT';
        case 'tinyint': case 'smallint': case 'int2': case 'int3': return 'SMALLINT';
        case 'varchar': case 'character varying': {
          const len = params[0] ?? 255;
          return len > 8000 ? 'NVARCHAR(MAX)' : `NVARCHAR(${len})`;
        }
        case 'nvarchar': {
          const len = params[0] ?? 4000;
          return len > 4000 ? 'NVARCHAR(MAX)' : `NVARCHAR(${len})`;
        }
        case 'char': case 'nchar': case 'character': return `NCHAR(${params.length ? p0() : '1'})`;
        case 'text': case 'clob': case 'string': case 'json': case 'jsonb': return 'NVARCHAR(MAX)';
        case 'boolean': case 'bool': case 'bit': return 'BIT';
        case 'float': case 'double': case 'double precision': return 'FLOAT(53)';
        case 'real': return 'REAL';
        case 'decimal': case 'numeric': case 'number': return params.length >= 2 ? `DECIMAL(${p0()},${p1()})` : 'DECIMAL(10,0)';
        case 'money': return 'MONEY';
        case 'date': return 'DATE';
        case 'time': return 'TIME';
        case 'datetime': case 'timestamp': case 'timestamptz': return 'DATETIME2';
        case 'uuid': return 'UNIQUEIDENTIFIER';
        case 'blob': case 'bytea': case 'binary': case 'varbinary': case 'image': return 'VARBINARY(MAX)';
        case 'enum': return 'NVARCHAR(64)';
        default: return 'NVARCHAR(255)';
      }

    case 'oracle':
      switch (base) {
        case 'int': case 'integer': case 'int4': case 'tinyint': case 'smallint': case 'mediumint': case 'serial': return 'NUMBER(10)';
        case 'bigint': case 'bigserial': case 'int8': return 'NUMBER(19)';
        case 'varchar': case 'nvarchar': case 'character varying': case 'string': {
          const len = Math.min(params[0] ?? 255, 4000);
          return `VARCHAR2(${len})`;
        }
        case 'char': case 'nchar': case 'character': return `CHAR(${params.length ? p0() : '1'})`;
        case 'text': case 'clob': case 'string': case 'json': case 'jsonb': return 'CLOB';
        case 'boolean': case 'bool': case 'bit': return 'NUMBER(1)';
        case 'float': case 'double': case 'double precision': return 'BINARY_DOUBLE';
        case 'real': return 'BINARY_FLOAT';
        case 'decimal': case 'numeric': case 'number': return params.length >= 2 ? `NUMBER(${p0()},${p1()})` : 'NUMBER';
        case 'money': return 'NUMBER(19,4)';
        case 'date': case 'time': return 'DATE';
        case 'datetime': case 'timestamp': return 'TIMESTAMP';
        case 'timestamptz': return 'TIMESTAMP WITH TIME ZONE';
        case 'uuid': return 'CHAR(36)';
        case 'blob': case 'bytea': case 'binary': case 'varbinary': case 'image': return 'BLOB';
        case 'enum': return 'VARCHAR2(64)';
        default: return 'VARCHAR2(255)';
      }
  }
}

// ---------------------------------------------------------------------------
// مواصفات المفاتيح الأجنبية وإحالة العلاقات
// ---------------------------------------------------------------------------

interface FkSpec {
  childTableId: string;
  childColumn: string;
  parentTableId: string;
  parentColumn: string;
  isUnique: boolean;      // علاقة 1-1 → عمود FK UNIQUE
  isCascade: boolean;     // جداول الربط: ON DELETE CASCADE
  /** العمود الابن موجود فعلاً في المخطط — لا تضف عموداً جديداً */
  columnPreexisting?: boolean;
}

interface JunctionPlan {
  name: string;
  leftTableId: string;
  rightTableId: string;
}

/**
 * يقترح اسم عمود FK تلق诣اً إذا كان الجدول الابن يحتوي فعلاً على عمود بنمط
 * `reason_id` — مثلاً "orders" ↔ عمود "order_id" المُصرّح به في order_items —
 * فيُعاد استخدام العمود الموجود بدل إنشاء عمود مكرر.
 */
function resolveAutoFkColumn(child: ErTable, parent: ErTable): string {
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

function firstPkColumn(table: ErTable): ErColumn | undefined {
  return table.columns.find(c => c.isPrimaryKey);
}
function resolveParentKeyName(parent: ErTable, warnings: string[]): string {
  const pk = firstPkColumn(parent);
  if (pk) return pk.name;
  if (parent.columns.length === 1) return parent.columns[0].name;
  warnings.push(`Table "${parent.name}" has no explicit primary key — assuming "id" for foreign keys.`);
  return 'id';
}

function processRelationships(
  model: ErModel,
  tables: ErTable[],
  options: DdlOptions,
  warnings: string[]
): { fks: FkSpec[]; junctions: JunctionPlan[] } {
  const byId = new Map<string, ErTable>(tables.map(tbl => [tbl.id, tbl]));
  const fks: FkSpec[] = [];
  const junctions: JunctionPlan[] = [];
  const junctionSeen = new Set<string>();

  for (const rel of model.relationships) {
    const source = byId.get(rel.sourceTable);
    const target = byId.get(rel.targetTable);
    if (!source || !target) continue;

    if (rel.cardinality === 'N-M') {
      if (!options.createJunctionTables) {
        warnings.push(`Skipping N-M relation without a junction table (${source.name} ↔ ${target.name}) — set "createJunctionTables" to generate one.`);
        continue;
      }
      const a = sanitizeIdentifier(source.name);
      const b = sanitizeIdentifier(target.name);
      const key = [a, b].sort().join('__');
      if (junctionSeen.has(key)) continue;
      junctionSeen.add(key);
      junctions.push({
        name: sanitizeIdentifier(`${a}_${b}_junction`.slice(0, 60)),
        leftTableId: source.id,
        rightTableId: target.id,
      });
      continue;
    }

    // 1-N: parent = المصدر (side one) والابن = الهدف (side many) — وفق أسهم ER في draw.io
    // N-1: user-flipped direction — parent = الهدف (side one) والابن = المصدر (side many)
    const isOneToMany = rel.cardinality === '1-N';
    const parentTable = isOneToMany ? source : target;
    const childTable = isOneToMany ? target : source;
    if (!parentTable || !childTable) continue;
    const isSelfReferential = parentTable.id === childTable.id;

    let parentKeyName = isOneToMany
      ? (rel.sourceColumn || resolveParentKeyName(parentTable, warnings))
      : (rel.targetColumn || resolveParentKeyName(parentTable, warnings));
    if (isSelfReferential && rel.cardinality === 'N-1' && rel.sourceColumn) {
      // عمود FK الذاتي يُسمّى من الابن (parent_id) وعمود الأب يُست злيد حين يُضّح
      parentKeyName = resolveParentKeyName(parentTable, warnings) || parentKeyName;
    }

    // عمود FK صريح متصل بالحافة؟ إن وُجد وموجود في الجدول الابن نستخدمه كما هو.
    let childColName = isOneToMany
      ? (rel.targetColumn || resolveAutoFkColumn(childTable, parentTable))
      : (rel.sourceColumn || resolveAutoFkColumn(childTable, parentTable));
    if (isSelfReferential && rel.cardinality === 'N-1') {
      const resolved = rel.sourceColumn || resolveAutoFkColumn(childTable, parentTable);
      if (resolved) childColName = resolved;
    }
    const preexisting =
      Boolean(rel.sourceColumn || rel.targetColumn) ||
      childTable.columns.some(col => col.name.toLowerCase() === childColName.toLowerCase());
    if (preexisting && (rel.targetColumn || rel.sourceColumn)) {
      childColName = (isOneToMany ? rel.targetColumn : rel.sourceColumn) || childColName;
    }
    if (preexisting && !rel.targetColumn && !rel.sourceColumn && !childColName) continue;

    fks.push({
      childTableId: childTable.id,
      childColumn: childColName,
      parentTableId: parentTable.id,
      parentColumn: parentKeyName,
      isUnique: rel.cardinality === '1-1',
      isCascade: false,
      columnPreexisting: preexisting,
    });
  }

  return { fks, junctions };
}

/**
 * مطابقة الجدول الأم لعمود FK مُعلَم (isForeignKey) من اسم العمود نفسه:
 *   student_id → students | student (إزالة اللاحقة _id + صيغ الجمع/التفريد)؛
 * وإذا لم يُطابق أي جدول آخر، تُقبل مطابقة الجدول الابن نفسه (مرجع ذاتي مثل parent_id).
 */
function matchParentTableForFk(columnName: string, child: ErTable, tables: ErTable[]): ErTable | undefined {
  let base = columnName.toLowerCase().trim();
  base = base.replace(/_(id|no|nr|num|number|ref|key|fk|code)$/g, '');
  if (!base || base.length < 2) return undefined;
  const candidates = new Set<string>([base, `${base}s`, `${base}es`]);
  if (base.endsWith('y')) candidates.add(`${base.slice(0, -1)}ies`);
  const matches = (t: ErTable) => candidates.has((t.name || '').toLowerCase().trim());
  let selfHit: ErTable | undefined;
  for (const t of tables) {
    if (!matches(t)) continue;
    if (t.id !== child.id) return t; // أولوية لجدول آخر مطابق
    selfHit = t;
  }
  if (selfHit) return selfHit;
  // احتياط الزراعة الذاتية: صيغ تعيش تسلسل هرمي (parent_id داخل categories) → الجدول الابن نفسه
  const selfRefTerms = /^(parent|sup|ancestor|root|boss|manager|superior|head|chief|super)$/i;
  if (selfRefTerms.test(base)) return child;
  return undefined;
}

/**
 * FK من أعمدة مكتشَفة بالعلم isForeignKey بلا علاقة مرسومة تغطيها:
 *   1) نُطابق الجدول الأم من اسم عمود _id (matchParentTableForFk).
 *   2) نولّد REFERENCES نحو مفتاحه الأساسي تلقائياً في buildTableDdl.
 * لا تكرار مع FKs صريحة من العلاقات (حماية (childTable, childColumn))،
 * وتُسجّل تحذيراً إذا لم يُعثر على الجدول الأم.
 */
function processInferredForeignKeys(tables: ErTable[], fks: FkSpec[], warnings: string[]): FkSpec[] {
  const covered = new Set(fks.map(fk => `${fk.childTableId}:${fk.childColumn.toLowerCase()}`));
  const inferred: FkSpec[] = [];
  for (const table of tables) {
    for (const col of table.columns) {
      if (!col.isForeignKey || col.isPrimaryKey) continue;
      const key = `${table.id}:${col.name.toLowerCase()}`;
      if (covered.has(key)) continue;
      const parent = matchParentTableForFk(col.name, table, tables);
      if (!parent) {
        warnings.push(`Column "${col.name}" in "${table.name}" is flagged FOREIGN KEY but no matching parent table was found — REFERENCES skipped.`);
        continue;
      }
      const parentColumn = resolveParentKeyName(parent, warnings);
      // مرجع ذاتي لعمود PK نفسه (id → id) بلا معنى — تجاهله
      if (parent.id === table.id && parentColumn.toLowerCase() === col.name.toLowerCase()) continue;
      covered.add(key);
      inferred.push({
        childTableId: table.id,
        childColumn: col.name,
        parentTableId: parent.id,
        parentColumn,
        isUnique: false,
        isCascade: false,
        columnPreexisting: true,
      });
    }
  }
  return [...fks, ...inferred];
}

// ---------------------------------------------------------------------------
// ترتيب باحث (Topological) — الجدول الأب قبل الابن
// ---------------------------------------------------------------------------

function topoOrder(tables: ErTable[], fks: FkSpec[], junctions: JunctionPlan[]): { ordered: ErTable[]; junctionsInOrder: JunctionPlan[] } {
  const byId = new Map<string, ErTable>(tables.map(tbl => [tbl.id, tbl]));
  const deps = new Map<string, Set<string>>();
  for (const tbl of tables) deps.set(tbl.id, new Set());
  for (const fk of fks) {
    if (fk.childTableId !== fk.parentTableId) deps.get(fk.childTableId)?.add(fk.parentTableId);
  }

  const ordered: ErTable[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const visit = (id: string) => {
    if (visited.has(id) || visiting.has(id)) return;
    visiting.add(id);
    for (const dep of deps.get(id) ?? []) visit(dep);
    visiting.delete(id);
    visited.add(id);
    const tbl = byId.get(id);
    if (tbl) ordered.push(tbl);
  };
  for (const tbl of tables) visit(tbl.id);
  // حلقات التبعية: البقية بالترتيب المبدئي
  for (const tbl of tables) if (!visited.has(tbl.id)) { ordered.push(tbl); visited.add(tbl.id); }

  const pos = new Map<string, number>(ordered.map((tbl, i) => [tbl.id, i]));
  const junctionsInOrder = [...junctions].sort((a, b) => (pos.get(b.leftTableId) ?? 0) - (pos.get(a.leftTableId) ?? 0));
  return { ordered, junctionsInOrder };
}

/**
 * يحدّد المفاتيح الأجنبية التي تقع داخل حلقة تبعية (child → parent → … → child).
 * هذه القيود لا يمكن إعلانها ضمن CREATE TABLE إذا أُنشئ الجدول قبل الطرف الآخر.
 */
function findCyclicFks(fks: FkSpec[]): Set<FkSpec> {
  const deps = new Map<string, Set<string>>();
  for (const fk of fks) {
    if (fk.childTableId === fk.parentTableId) continue;
    const set = deps.get(fk.childTableId) ?? new Set<string>();
    set.add(fk.parentTableId);
    deps.set(fk.childTableId, set);
  }

  const reaches = (from: string, target: string, seen: Set<string>): boolean => {
    if (from === target) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    for (const next of deps.get(from) ?? []) {
      if (reaches(next, target, seen)) return true;
    }
    return false;
  };

  const cyclic = new Set<FkSpec>();
  for (const fk of fks) {
    if (fk.childTableId === fk.parentTableId) continue;
    // الحافة child→parent دورية إذا كان parent يعتمد على child عبر سلسلة من الحواف.
    if (reaches(fk.parentTableId, fk.childTableId, new Set())) cyclic.add(fk);
  }
  return cyclic;
}

function deferredFkStatement(fk: FkSpec, child: ErTable, parent: ErTable, dialect: SqlDialect): string {
  const q = (x: string) => quoteIdent(x, dialect);
  const childName = sanitizeIdentifier(child.name || child.id);
  const parentName = sanitizeIdentifier(parent.name || parent.id);
  // أسماء القيود محدودة الطول في MySQL/PostgreSQL — نقطعها بأمان
  const constraint = sanitizeIdentifier(`fk_${childName}_${fk.childColumn}`).slice(0, 60);
  const suffix = fk.isCascade ? ' ON DELETE CASCADE' : '';
  return `ALTER TABLE ${q(childName)} ADD CONSTRAINT ${q(constraint)} FOREIGN KEY (${q(fk.childColumn)}) REFERENCES ${q(parentName)}(${q(fk.parentColumn)})${suffix};`;
}

// ---------------------------------------------------------------------------
// توليد DDL لكل جدول
// ---------------------------------------------------------------------------

interface ColLine {
  name: string;
  type: string;
  notNull: boolean;
  isPk: boolean;
  /** UNIQUE منعكس (رسمياً من التسمية/المحرّر) — يُهمل على PK (كسر كافي أضراط) */
  unique: boolean;
  /** DEFAULT <قيمة> خامة كما وتحت المُستورد */
  defaultValue?: string;
  /** CHECK خام لعمود — يُلفّ بـْ CHECK ( expr ) في الإصدار */
  check?: string;
  /** SQLite خاصية: مفتاح أساسي autoincrement في سطر واحد */
  sqliteInlineAutoIncrement?: boolean;
}

function extractAutoFlag(table: ErTable): ErColumn | undefined {
  // auto increment يُفعل على PK الوحيدة ذات النوع الرقمي فقط
  const pks = table.columns.filter(c => c.isPrimaryKey);
  if (pks.length !== 1) return undefined;
  const candidate = pks[0];
  return isNumericType(candidate) ? candidate : undefined;
}

function buildColumnLine(col: ErColumn, table: ErTable, dialect: SqlDialect, q: (x: string) => string): ColLine {
  const pkCols = table.columns.filter(c => c.isPrimaryKey);
  const isPk = col.isPrimaryKey && pkCols.length === 1;
  const autoCol = extractAutoFlag(table);
  const isAuto = isPk && autoCol === col;

  let sqliteInlineAutoIncrement = false;
  let type: string;
  if (dialect === 'sqlite' && parseRawType(col.type).base === 'boolean') {
    type = 'INTEGER_CHECK01';
  } else if (dialect === 'postgres' && isAuto) {
    type = parseRawType(col.type).base === 'bigint' ? 'BIGSERIAL' : 'SERIAL';
  } else {
    type = mapType(col, dialect);
    if (isAuto) {
      if (dialect === 'mysql') type += ' AUTO_INCREMENT';
      else if (dialect === 'sqlserver') type += ' IDENTITY(1,1)';
      else if (dialect === 'oracle') type += ' GENERATED BY DEFAULT AS IDENTITY';
      // SQLite: AUTOINCREMENT يعمل فقط مع INTEGER PRIMARY KEY — نُطبّع كل السلالات الرقمية
      else if (
        dialect === 'sqlite' &&
        ['integer', 'int', 'int2', 'int3', 'int4', 'int8', 'smallint', 'tinyint', 'mediumint', 'bigint', 'serial', 'bigserial'].includes(
          parseRawType(col.type).base
        )
      ) {
        type = 'INTEGER';
        sqliteInlineAutoIncrement = true;
      }
    }
  }
  // SQLite: قيمة DEFAULT لعمود BOOLEAN على شكل حرفية (Y/yes/true…)
  // تنهار أمام قيد CHECK (col IN (0,1)) — نُترجم التناظر المنطقي إلى 1/0 كي يبقى الكود منفذاً
  let defaultValue = col.defaultValue;
  if (dialect === 'sqlite' && parseRawType(col.type).base === 'boolean' && defaultValue) {
    const truthy = /^[\'\"]?(?:yes|true|y|on|1|false|no|n|off|0)[\'\"]?$/i.test(defaultValue.trim());
    if (truthy) defaultValue = /^(?:yes|true|y|on|1)$/i.test(defaultValue.trim()) ? "'1'" : "'0'";
  }
  return {
    name: col.name,
    type,
    notNull: !col.isNullable || col.isPrimaryKey,
    isPk,
    unique: col.isUnique === true && !isPk,
    defaultValue,
    check: col.check,
    sqliteInlineAutoIncrement,
  };
}

function columnLineText(line: ColLine, dialect: SqlDialect, q: (x: string) => string): string {
  if (line.sqliteInlineAutoIncrement) {
    return `  ${q(line.name)} INTEGER PRIMARY KEY AUTOINCREMENT${line.notNull ? ' NOT NULL' : ''}`;
  }
  const parts = [`  ${q(line.name)} ${line.type}`];
  if (line.notNull) parts.push('NOT NULL');
  if (line.isPk) parts.push('PRIMARY KEY');
  if (line.defaultValue && line.defaultValue.trim() !== '') parts.push(`DEFAULT ${line.defaultValue}`);
  if (line.unique) parts.push('UNIQUE');
  if (line.check && line.check.trim() !== '') parts.push(`CHECK (${line.check})`);
  return parts.join(' ');
}

/** CHECK لعمود boolean في SQLite — صيغة `CHECK (col IN (0,1))` على الجدول */
function sqliteBooleanChecks(table: ErTable, q: (x: string) => string): string[] {
  return table.columns
    .filter(c => parseRawType(c.type).base === 'boolean')
    .map(c => `CHECK (${q(c.name)} IN (0,1))`);
}

interface TableEmitContext {
  dialect: SqlDialect;
  fks: FkSpec[];
  tablesById: Map<string, ErTable>;
  warnings: string[];
  /** قيود دائرية تُضاف في مرحلة ثانية بعد إنشاء كل الجداول */
  deferredFks?: Set<FkSpec>;
}

function buildTableDdl(table: ErTable, ctx: TableEmitContext): string {
  const { dialect, tablesById } = ctx;
  const q = (x: string) => quoteIdent(x, dialect);
  const rawName = sanitizeIdentifier(table.name || table.id);
  const tableName = rawName;

  const pkCols = table.columns.filter(c => c.isPrimaryKey);
  const existingCols = new Set<string>(table.columns.map(c => c.name.toLowerCase()));
  const colLines: ColLine[] = table.columns.map(c => buildColumnLine(c, table, dialect, q));

  // ---- FK specs الخاص بهذا الجدول
  const tableConstraints: string[] = [];
  const tableFks = ctx.fks.filter(fk => fk.childTableId === table.id);

  for (const fk of tableFks) {
    const parent = tablesById.get(fk.parentTableId);
    if (!parent) continue;
    const deferred = ctx.deferredFks?.has(fk) ?? false;

    const colName = fk.childColumn;
    if (fk.columnPreexisting) {
      // العمود مصرّح به في المخطط (مثل order_id في order_items) — القيد يكفي
      if (!deferred) {
        tableConstraints.push(`FOREIGN KEY (${q(colName)}) REFERENCES ${q(sanitizeIdentifier(parent.name))}(${q(fk.parentColumn)})${fk.isCascade ? ' ON DELETE CASCADE' : ''}`);
      }
      if (fk.isUnique) tableConstraints.push(`UNIQUE (${q(colName)})`);
      continue;
    }

    let nextName = colName;
    let attempt = 2;
    while (existingCols.has(nextName.toLowerCase())) nextName = `${colName}_${attempt++}`;
    existingCols.add(nextName.toLowerCase());

    // نوع عمود الابن = نوع عمود الأب
    const parentCol = parent.columns.find(c0 => c0.name.toLowerCase() === fk.parentColumn.toLowerCase());
    const protoCol: ErColumn = parentCol
      ? { ...parentCol }
      : { name: fk.parentColumn, type: 'int', isPrimaryKey: true, isNullable: false };
    const childLine: ColLine = {
      name: nextName,
      type:
        dialect === 'sqlite'
          ? parseRawType(protoCol.type).base === 'boolean'
            ? 'INTEGER'
            : mapType(protoCol, dialect)
          : mapType(protoCol, dialect),
      notNull: fk.isCascade,
      isPk: false,
      // UNIQUE على مستوى الجدول يغطي 1-1 أدناه — لا تكرراه في السطر نفسه
      unique: false,
    };
    colLines.push(childLine);

    if (!deferred) {
      tableConstraints.push(`FOREIGN KEY (${q(nextName)}) REFERENCES ${q(sanitizeIdentifier(parent.name))}(${q(fk.parentColumn)})${fk.isCascade ? ' ON DELETE CASCADE' : ''}`);
    }
    if (fk.isUnique) tableConstraints.push(`UNIQUE (${q(nextName)})`);
  }

  // ---- PRIMARY KEY مركّب (أكثر من عمود) — إن لم يُولّد ضمن العمود الوحيد
  if (pkCols.length > 1) {
    const cols = pkCols.map(c0 => q(c0.name)).join(', ');
    tableConstraints.unshift(`PRIMARY KEY (${cols})`);
  }

  // ---- تحقّقات bool لصيغة SQLite
  if (dialect === 'sqlite') {
    for (const chk of sqliteBooleanChecks(table, q)) tableConstraints.push(chk);
  }

  const linesText = colLines.map(l => columnLineText(l, dialect, q)).join(',\n');
  const constraintsText = tableConstraints.length ? `,\n  ${tableConstraints.join(',\n  ')}` : '';

  let body = `CREATE TABLE ${q(tableName)} (\n${linesText}${constraintsText}\n);`;
  if (dialect === 'mysql') body = body.replace(/\n\);$/, '\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;');
  return body;
}

/** CREATE INDEX واحد — يتجاهل الأعمدة المفقودة والـUNIQUE المضمّن في العمود. */
export function schemaIndexStatement(
  table: ErTable,
  index: { name?: string; columns: string[]; unique?: boolean },
  dialect: SqlDialect,
  usedNames: Set<string>
): string | null {
  const columns = (index.columns || []).filter(column =>
    table.columns.some(source => source.name.toLowerCase() === column.toLowerCase())
  );
  if (columns.length === 0) return null;
  if (columns.length === 1 && index.unique) {
    const column = table.columns.find(source => source.name.toLowerCase() === columns[0].toLowerCase());
    if (column?.isUnique) return null;
  }
  const q = (x: string) => quoteIdent(x, dialect);
  const base = sanitizeIdentifier(index.name || `ix_${table.name}_${columns.join('_')}`);
  let name = base;
  let n = 2;
  while (usedNames.has(name.toLowerCase())) name = `${base}_${n++}`;
  usedNames.add(name.toLowerCase());
  return `CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX ${q(name)} ON ${q(sanitizeIdentifier(table.name || table.id))} (${columns.map(q).join(', ')});`;
}

/** CREATE VIEW — يُعاد بناؤه من الاسم والأعمدة والاستعلام ليكون محمولاً بين اللهجات. */
export function schemaViewStatement(view: ErView, dialect: SqlDialect): string {
  const q = (x: string) => quoteIdent(x, dialect);
  const name = sanitizeIdentifier(view.name);
  const columns = view.columns && view.columns.length > 0
    ? ` (${view.columns.map(column => q(sanitizeIdentifier(column))).join(', ')})`
    : '';
  const query = (view.query || '').trim().replace(/;\s*$/, '');
  if (!query) return (view.rawSql || '').trim().replace(/;\s*$/, '') + ';';
  return `CREATE VIEW ${q(name)}${columns} AS\n${query};`;
}

/** Trigger يُنقل حرفياً لأنه يعتمد على صياغة المحرك المصدر. */
export function schemaTriggerStatement(trigger: ErTrigger): string {
  return `${trigger.rawSql.trim().replace(/;\s*$/, '')};`;
}

/** DROP INDEX بصياغة اللهجة — يُستخدم في معاينة فرق تنظيف الفهارس */
export function schemaDropIndexStatement(table: ErTable, indexName: string, dialect: SqlDialect): string {
  const q = (x: string) => quoteIdent(x, dialect);
  const name = q(sanitizeIdentifier(indexName));
  const tableName = q(sanitizeIdentifier(table.name || table.id));
  if (dialect === 'mysql' || dialect === 'sqlserver') return `DROP INDEX ${name} ON ${tableName};`;
  if (dialect === 'postgres' || dialect === 'sqlite') return `DROP INDEX IF EXISTS ${name};`;
  return `DROP INDEX ${name};`;
}

export function schemaDropViewStatement(view: ErView, dialect: SqlDialect): string {
  return `DROP VIEW IF EXISTS ${quoteIdent(sanitizeIdentifier(view.name), dialect)};`;
}

export function schemaDropTriggerStatement(trigger: ErTrigger, dialect: SqlDialect): string {
  const name = quoteIdent(sanitizeIdentifier(trigger.name), dialect);
  if (dialect === 'postgres' && trigger.table) {
    return `DROP TRIGGER IF EXISTS ${name} ON ${quoteIdent(sanitizeIdentifier(trigger.table), dialect)};`;
  }
  return `DROP TRIGGER IF EXISTS ${name};`;
}

function junctionDdl(junction: JunctionPlan, tablesById: Map<string, ErTable>, allFks: FkSpec[], dialect: SqlDialect, options: DdlOptions): { table: ErTable; fk: FkSpec[] } {
  const left = tablesById.get(junction.leftTableId);
  const right = tablesById.get(junction.rightTableId);
  if (!left || !right) throw new Error('Junction endpoint missing');
  const leftPk = firstPkColumn(left);
  const rightPk = firstPkColumn(right);
  const leftPkName = leftPk?.name ?? resolveParentKeyName(left, []);
  const rightPkName = rightPk?.name ?? resolveParentKeyName(right, []);
  const leftCol = sanitizeIdentifier(`${left.name}_id` || 'left_id');
  const rightCol = sanitizeIdentifier(`${right.name}_id` || 'right_id');
  const leftTypeRaw = (leftPk?.type || 'int').trim();
  const rightTypeRaw = (rightPk?.type || 'int').trim();

  const table: ErTable = {
    id: `junction:${junction.name}`,
    name: junction.name,
    columns: [
      { name: leftCol, type: leftTypeRaw, isPrimaryKey: true, isNullable: false },
      { name: rightCol, type: rightTypeRaw, isPrimaryKey: true, isNullable: false },
    ],
  };

  const fk: FkSpec[] = [
    {
      childTableId: table.id,
      childColumn: leftCol,
      parentTableId: junction.leftTableId,
      parentColumn: leftPkName,
      isUnique: false,
      isCascade: true,
      // عمود FK معلن فعلاً في أعمدة جداول الربط أعلاه — لا يُضاعف عمود آخر بنفسه
      columnPreexisting: true,
    },
    {
      childTableId: table.id,
      childColumn: rightCol,
      parentTableId: junction.rightTableId,
      parentColumn: rightPkName,
      isUnique: false,
      isCascade: true,
      columnPreexisting: true,
    },
  ];
  void allFks; void options;
  return { table, fk };
}

// ---------------------------------------------------------------------------
// نقطة الدخول العامة — يجمع الكل
// ---------------------------------------------------------------------------

export function generateDdl(model: ErModel, dialect: SqlDialect, options: Partial<DdlOptions> = {}): DdlResult {
  const opts: DdlOptions = { ...DEFAULT_DDL_OPTIONS, ...options };
  const warnings: string[] = [];

  // جداول بلا أعمدة لا يمكن إنشاؤها
  const tables = model.tables.filter(tbl => tbl.columns.length > 0);
  for (const tbl of model.tables) {
    if (tbl.columns.length === 0) warnings.push(`Table "${tbl.name}" skipped — no columns discovered.`);
  }

  const { fks: relFks, junctions } = processRelationships(model, tables, opts, warnings);
  // FKs إضافية من أعمدة مسوَمة isForeignKey بلا علاقة مرسومة
  const fks = processInferredForeignKeys(tables, relFks, warnings);
  const tablesById = new Map<string, ErTable>(tables.map(tbl => [tbl.id, tbl]));

  // جداول الربط المعتمدة على الجداول المصدر
  const junctionResults = junctions.map(jn => junctionDdl(jn, tablesById, fks, dialect, opts));
  const junctionTables = junctionResults.map(jr => jr.table);
  const junctionFks = junctionResults.flatMap(jr => jr.fk);

  const { ordered } = topoOrder(tables, fks, junctions);

  // الجدول الأب أولاً ثم الجدول الابن (من الأسفل: junction يأتي نظراً لاعتماده على كلا الطرفين)
  const emitSequence = [...ordered, ...junctionTables];
  const allFks = [...fks, ...junctionFks];
  const tablesByIdAll = new Map<string, ErTable>([...tables, ...junctionTables].map(tbl => [tbl.id, tbl]));
  // SQLite تسمح بالمراجع الأمامية ولا تدعم ALTER TABLE ADD CONSTRAINT
  const deferredFks = opts.deferCyclicForeignKeys && dialect !== 'sqlite'
    ? findCyclicFks(allFks)
    : new Set<FkSpec>();

  const q = (x: string) => quoteIdent(x, dialect);

  const dropStatements: string[] = [];
  const createStatements: string[] = [];

  for (const tbl of emitSequence) {
    if (opts.dropIfExists) dropStatements.push(dropStatementFor(tbl, dialect, q));
    createStatements.push(`-- Table: ${sanitizeIdentifier(tbl.name)} (${tbl.columns.length} columns)`);
    createStatements.push(buildTableDdl(tbl, { dialect, fks: allFks, tablesById: tablesByIdAll, warnings, deferredFks }));
    createStatements.push('');
  }

  // الفهارس بعد إنشاء الجداول (قبل القيود المؤجّلة)
  const usedIndexNames = new Set<string>();
  const indexStatements: string[] = [];
  for (const tbl of emitSequence) {
    for (const index of tbl.indexes ?? []) {
      const statement = schemaIndexStatement(tbl, index, dialect, usedIndexNames);
      if (statement) indexStatements.push(statement);
    }
  }
  if (indexStatements.length > 0) {
    createStatements.push('-- Indexes', '', ...indexStatements, '');
  }

  // المرحلة الثانية: القيود الدائرية بعد وجود كل الجداول
  if (deferredFks.size > 0) {
    createStatements.push('-- Phase 2: cyclic foreign keys deferred until all tables exist', '');
    for (const fk of allFks) {
      if (!deferredFks.has(fk)) continue;
      const child = tablesByIdAll.get(fk.childTableId);
      const parent = tablesByIdAll.get(fk.parentTableId);
      if (!child || !parent) continue;
      createStatements.push(deferredFkStatement(fk, child, parent, dialect));
    }
    createStatements.push('');
  }

  // العروض والـTriggers بعد اكتمال الجداول والقيود
  const viewStatements = (model.views ?? []).map(view => schemaViewStatement(view, dialect));
  if (viewStatements.length > 0) {
    createStatements.push('-- Views', '', ...viewStatements, '');
  }
  const triggerStatements = (model.triggers ?? []).map(schemaTriggerStatement);
  if (triggerStatements.length > 0) {
    createStatements.push('-- Triggers', '');
    // mysql CLI يحتاج DELIMITER للـTriggers ذات أجسام BEGIN…END
    if (dialect === 'mysql' && triggerStatements.some(statement => /\bBEGIN\b/i.test(statement))) {
      createStatements.push('DELIMITER $$', '');
      for (const statement of triggerStatements) {
        createStatements.push(statement.replace(/;\s*$/, () => '$$'));
      }
      createStatements.push('', 'DELIMITER ;', '');
    } else {
      createStatements.push(...triggerStatements, '');
    }
  }

  const notes = warnings.length ? ['', '-- Notes:', ...warnings.map(w => `-- • ${w}`)] : [];

  // trigger واحد قد يحمل عدة عبارات CREATE TRIGGER (تدقيق على الأحداث الثلاثة)
  const triggerCount = triggerStatements.reduce(
    (sum, statement) => sum + (statement.match(/CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER/gi)?.length ?? 0),
    0
  );

  // ترويسة الترحيل تُبنى بعد جمع العبارات حتى تعدّ ما أُصدر فعلاً لا ما طُلب فقط
  const header = [
    '-- ================================================================',
    '--  SQL migration generated from a draw.io ER diagram',
    `--  Dialect: ${dialect}   ·   Tables: ${emitSequence.length}   ·   FKs: ${allFks.length}   ·   Junction tables: ${junctionTables.length}`,
    `--  Indexes: ${indexStatements.length}   ·   Views: ${viewStatements.length}   ·   Triggers: ${triggerCount}`,
    `--  Generated: ${todayStamp()} by Schema Studio (draw.io → SQL)`,
    '-- ================================================================',
    '',
  ];

  const code = [...header, ...(opts.dropIfExists ? dropStatements : []), ...(opts.dropIfExists ? [''] : []), ...createStatements, ...notes].join('\n');

  const totalColumns = emitSequence.reduce((sum, tbl) => sum + tbl.columns.length, 0);
  return {
    dialect,
    code,
    warnings: [...warnings],
    stats: {
      tables: emitSequence.length,
      columns: totalColumns,
      fks: allFks.length,
      junctionTables: junctionTables.length,
      indexes: indexStatements.length,
      views: viewStatements.length,
      triggers: triggerCount,
    },
  };
}

function dropStatementFor(tbl: ErTable, dialect: SqlDialect, q: (x: string) => string): string {
  const name = sanitizeIdentifier(tbl.name || tbl.id);
  if (dialect === 'mysql' || dialect === 'postgres' || dialect === 'sqlite') {
    return `DROP TABLE IF EXISTS ${q(name)};`;
  }
  if (dialect === 'sqlserver') {
    return `IF OBJECT_ID(N'${name}', N'U') IS NOT NULL DROP TABLE ${q(name)};`;
  }
  // Oracle لا يدعم IF EXISTS — نعطي DROP معلّقة
  return `-- DROP TABLE ${q(name)} CASCADE;  -- uncomment if the table already exists`;
}
