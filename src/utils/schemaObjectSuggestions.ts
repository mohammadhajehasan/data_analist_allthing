/**
 * اقتراحات ذكية لكائنات السكيمّا — فهارس وعروض وTriggers.
 *
 * كلها استنتاجات حتمية من النموذج نفسه (لا ذكاء اصطناعي، لا تخمين خارج السكيما):
 *   • فهرس على كل عمود مفتاح أجنبي لا يغطيه فهرس/PK/UNIQUE — أهم مكسب أداء للـJOIN.
 *   • فهرس UNIQUE لأعمدة المفاتيح الطبيعية (email / username / slug / SKU …) غير المفروضة.
 *   • عرض «السجلات النشطة» للجداول التي فيها status أو is_active.
 *   • Trigger لتحديث updated_at تلقائياً — بصياغة كل محرك مدعوم.
 *   • تنظيف الفهارس: كشف التكرار التام، والبادئات البيسارية المغطاة بفهرس أطول،
 *     والفهرس الزائد على PK/UNIQUE، والفهرس المرتبط بأعمدة محذوفة أو غير المخدوم
 *     بأي علاقة/عرض معلن في النموذج — ويُقترح حذفه لا إضافته.
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
const STATUS_COLUMN_TOKENS = ['status', 'state'];
const BOOLEAN_ACTIVE_COLUMNS = ['is_active', 'active', 'is_enabled', 'enabled'];

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

/** هل يذكر استعلام عرض معلن أعمدة هذا الفهرس؟ (SELECT * يعتبر تغطية لتفادي ادعاء عدم الاستخدام) */
function viewUsesColumns(model: ErModel, table: ErTable, columns: string[]): boolean {
  const tableName = table.name.toLowerCase();
  const wanted = new Set(columns);
  return (model.views ?? []).some(view => {
    const query = (view.query ?? '').toLowerCase();
    if (!query.trim()) return true;
    if (!query.includes(tableName)) return false;
    if (/\bselect\s+\*/.test(query)) return true;
    const tokens = query.split(/[^a-z0-9_\u0600-\u06FF]+/).filter(Boolean);
    return tokens.some(token => wanted.has(token));
  });
}

function updatedColumn(table: ErTable): ErColumn | null {
  const column = table.columns.find(item => UPDATED_COLUMN_TOKENS.includes(item.name.toLowerCase()));
  if (!column) return null;
  const base = typeBase(column.type);
  if (!['timestamp', 'timestamptz', 'datetime', 'date'].includes(base)) return null;
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

function triggerSql(table: ErTable, column: ErColumn, dialect: SqlDialect, triggerName: string, pk?: ErColumn): string | null {
  const tableName = table.name;
  if (dialect === 'mysql') {
    return `CREATE TRIGGER ${triggerName} BEFORE UPDATE ON ${tableName}\nFOR EACH ROW\nSET NEW.${column.name} = CURRENT_TIMESTAMP`;
  }
  if (dialect === 'sqlite') {
    if (!pk) return null;
    return `CREATE TRIGGER ${triggerName} AFTER UPDATE ON ${tableName}\nFOR EACH ROW\nWHEN NEW.${column.name} = OLD.${column.name}\nBEGIN\n  UPDATE ${tableName} SET ${column.name} = CURRENT_TIMESTAMP WHERE ${pk.name} = NEW.${pk.name};\nEND`;
  }
  if (dialect === 'postgres') {
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
      const column = updatedColumn(table);
      if (!column) continue;
      if ((model.triggers ?? []).some(trigger => (trigger.table ?? '').toLowerCase() === table.name.toLowerCase())) continue;
      const primaryKeys = table.columns.filter(item => item.isPrimaryKey);
      const pk = primaryKeys.length === 1 ? primaryKeys[0] : undefined;
      const triggerName = uniqueName(usedTriggerNames, `trg_${table.name}_touch`);
      const rawSql = triggerSql(table, column, dialect, triggerName, pk);
      if (!rawSql) continue;
      suggestions.push({
        id: `trigger:${table.id}:${column.name.toLowerCase()}`,
        kind: 'trigger',
        name: triggerName,
        titleAr: `Trigger تحديث ${column.name}`,
        titleEn: `Trigger for ${column.name}`,
        detailAr: `الجدول فيه ${column.name} لكن لا شيء يحدّثه تلقائياً — القيمة ستبقى وقت الإنشاء فقط.`,
        detailEn: `The table has ${column.name} but nothing updates it — it will keep the insert-time value forever.`,
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
