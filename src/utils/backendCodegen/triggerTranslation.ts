/**
 * ترجمة الـTriggers بين المحرّكات
 * -----------------------------------------------------------------
 * كان المولّد يستبعد أي Trigger كُتب لمحرّك آخر (مثلاً MySQL `SET NEW.col`
 * عند توليد مشروع SQLite) خوفاً من فشل الترحيل. هذا الملف يولّد نسخة
 * مكافئة بدل الاستبعاد عندما يكون التحويل آمناً:
 *
 *   MySQL  SET NEW.col = expr        → SQLite  AFTER ... UPDATE ... WHERE pk = NEW.pk
 *   MySQL  SET NEW.col = expr        → PostgreSQL  BEFORE ... NEW.col := expr (function + trigger)
 *   PostgreSQL  NEW.col := expr      → MySQL  BEFORE ... SET NEW.col = expr
 *
 * ولا يحاول التحويل إذا كانت الإعادة ستغيّر الدلالة: أجسام تحتوي
 * عبارات أخرى، شروط WHEN، دوال بلا مكافئ، أو جدول بلا مفتاح أساسي
 * يمكن استهداف الصف عبره. في هذه الحالات يُرجع سبباً واضحاً ليُوثَّق.
 */
import type { BackendOptions } from './model';

export type TriggerDialect = BackendOptions['db'];

export interface TriggerTableContext {
  /** اسم الجدول في القاعدة */
  name: string;
  /** أعمدة المفتاح الأساسي (بالترتيب) */
  primaryKey: string[];
}

export interface TriggerTranslationResult {
  sql?: string;
  skipped?: string;
  /** المحرّك الذي كُتب له التعريف الأصلي — يُملأ عند إعادة الكتابة */
  translatedFrom?: TriggerDialect;
  /** وصف قصير للتحويل ليُعرض للمستخدم */
  note?: string;
  /** عبارة إضافية مطلوبة في down() (دالة PostgreSQL المولّدة) */
  downExtra?: string;
}

const QUOTED = '(?:`[^`]+`|"[^"]+"|\\[[^\\]]+\\]|[A-Za-z_][\\w$]*)';
const HEADER_RE = new RegExp(
  '^CREATE\\s+(?:OR\\s+REPLACE\\s+)?TRIGGER\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(' +
    QUOTED +
    ')\\s+(?:(BEFORE|AFTER|INSTEAD\\s+OF)\\s+)?(INSERT|UPDATE|DELETE)\\s+ON\\s+(' +
    QUOTED +
    ')([\\s\\S]*)$',
  'i'
);
const ASSIGNMENT_RE = new RegExp(
  '^(?:SET\\s+)?NEW\\s*\\.\\s*(' + QUOTED + ')\\s*(?::=|=)\\s*([\\s\\S]+)$',
  'i'
);

/** دوال موجودة في MySQL وبلا مكافئ مباشر في SQLite */
const SQLITE_UNSUPPORTED = [
  'CONCAT',
  'CONCAT_WS',
  'DATE_FORMAT',
  'STR_TO_DATE',
  'SUBSTRING_INDEX',
  'UNIX_TIMESTAMP',
  'FROM_UNIXTIME',
  'LAST_INSERT_ID',
  'GROUP_CONCAT',
  'RAND',
  'UUID',
];
/** دوال/صياغات PostgreSQL لا تعمل في MySQL */
const MYSQL_UNSUPPORTED = ['to_char', 'to_date', 'nextval', 'EXTRACT', '::', 'regexp_replace'];
/** دوال MySQL ليست في PostgreSQL */
const POSTGRES_UNSUPPORTED = ['DATE_FORMAT', 'STR_TO_DATE', 'SUBSTRING_INDEX', 'LAST_INSERT_ID', 'FROM_UNIXTIME'];

function detectDialect(sql: string): TriggerDialect | null {
  if (/\b(LANGUAGE\s+(plpgsql|sql)|RETURNS\s+TRIGGER|EXECUTE\s+(FUNCTION|PROCEDURE)|\$\$)/i.test(sql)) {
    return 'postgres';
  }
  if (/NEW\s*\.[\w"`]+\s*:=/i.test(sql)) return 'postgres';
  if (/\bDEFINER\s*=|`|\bDELIMITER\b|\bSET\s+NEW\./i.test(sql)) return 'mysql';
  return null;
}

function unquoteIdent(value: string): string {
  const trimmed = value.trim();
  const pairs: [string, string][] = [
    ['`', '`'],
    ['"', '"'],
    ['[', ']'],
  ];
  for (const [open, close] of pairs) {
    if (trimmed.startsWith(open) && trimmed.endsWith(close)) return trimmed.slice(1, -1);
  }
  return trimmed;
}

function quoteIdent(name: string, dialect: TriggerDialect): string {
  const inner = name.replace(/[`"]/g, '');
  return dialect === 'mysql' ? `\`${inner}\`` : `"${inner}"`;
}

function safeName(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_]/g, '_').replace(/^(\d)/, '_$1');
  return cleaned || 'trigger';
}

/** يقسّم جسم Trigger إلى عبارات مع احترام علامات الاقتباس */
function splitStatements(body: string): string[] {
  const statements: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      current += char;
      continue;
    }
    if (char === ';') {
      statements.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  statements.push(current);
  return statements.map(statement => statement.trim()).filter(Boolean);
}

interface Assignment {
  column: string;
  expression: string;
}

function parseAssignments(rest: string): { assignments: Assignment[] } | { reason: string } {
  let body = rest.trim();
  if (/^FOR\s+EACH\s+ROW\b/i.test(body)) body = body.replace(/^FOR\s+EACH\s+ROW\b/i, '').trim();
  if (/^EXECUTE\s+(FUNCTION|PROCEDURE)\b/i.test(body)) {
    return { reason: 'it calls a trigger function that is defined separately, so the body cannot be translated' };
  }
  if (/\bWHEN\s*\(/i.test(body)) {
    return { reason: 'it declares a WHEN condition that the target engine cannot carry over' };
  }
  const beginEnd = body.match(/^BEGIN\b([\s\S]*)\bEND$/i);
  if (beginEnd) body = beginEnd[1];

  const assignments: Assignment[] = [];
  for (const statement of splitStatements(body)) {
    if (/^RETURN\s+(NEW|OLD)\s*$/i.test(statement)) continue;
    if (/^END\s*$/i.test(statement)) continue;
    const match = statement.match(ASSIGNMENT_RE);
    if (!match) {
      return {
        reason: `its body contains a statement other than NEW.column assignments (\`${statement.replace(/\s+/g, ' ').slice(0, 60)}\`)`,
      };
    }
    assignments.push({ column: unquoteIdent(match[1]), expression: match[2].trim() });
  }
  if (assignments.length === 0) return { reason: 'it has no NEW.column assignments to translate' };
  return { assignments };
}

/** يحوّل تعبير القيمة إلى صياغة المحرّك الهدف */
function translateExpression(
  expression: string,
  source: TriggerDialect,
  target: TriggerDialect
): { expression?: string; unsupported?: string } {
  let value = expression.trim().replace(/;+$/, '');

  // NEW.col / OLD.col → صياغة الهدف
  value = value.replace(
    new RegExp('\\b(NEW|OLD)\\s*\\.\\s*(' + QUOTED + ')', 'gi'),
    (_match, ref: string, column: string) => `${ref.toUpperCase()}.${quoteIdent(unquoteIdent(column), target)}`
  );

  // أسماء أخرى بين backticks
  if (target !== 'mysql') value = value.replace(/`([^`]+)`/g, '"$1"');

  // دوال شائعة لها مكافئ مباشر
  value = value
    .replace(/\bNOW\s*\(\s*\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/\bCURDATE\s*\(\s*\)/gi, 'CURRENT_DATE')
    .replace(/\bCURRENT_TIMESTAMP\s*\(\s*\)/gi, 'CURRENT_TIMESTAMP')
    .replace(/\bLCASE\s*\(/gi, 'LOWER(')
    .replace(/\bUCASE\s*\(/gi, 'UPPER(');

  if (target === 'postgres') value = value.replace(/\bIFNULL\s*\(/gi, 'COALESCE(');

  const blocked =
    target === 'sqlite' ? SQLITE_UNSUPPORTED : target === 'mysql' ? MYSQL_UNSUPPORTED : POSTGRES_UNSUPPORTED;
  const upper = value.toUpperCase();
  for (const token of blocked) {
    const needle = token.toUpperCase();
    const found = token === '::' ? value.includes('::') : upper.includes(needle + (needle.endsWith('(') ? '' : '('));
    if (found) return { unsupported: `${token}() has no safe equivalent on ${target}` };
  }

  if (source === 'postgres' && target === 'mysql' && value.includes('::')) {
    return { unsupported: 'PostgreSQL type casts (::) have no MySQL equivalent' };
  }

  return { expression: value };
}

function buildSqliteTrigger(
  name: string,
  table: TriggerTableContext,
  event: string,
  assignments: { column: string; expression: string }[]
): TriggerTranslationResult {
  if (event.toUpperCase() === 'DELETE') {
    return { skipped: 'a DELETE trigger cannot assign NEW columns on any engine' };
  }
  if (table.primaryKey.length === 0) {
    return { skipped: 'the table has no primary key, so the equivalent UPDATE cannot target the affected row' };
  }
  const setClause = assignments
    .map(assignment => `${quoteIdent(assignment.column, 'sqlite')} = ${assignment.expression}`)
    .join(', ');
  const whereClause = table.primaryKey
    .map(column => `${quoteIdent(column, 'sqlite')} = NEW.${quoteIdent(column, 'sqlite')}`)
    .join(' AND ');
  const sql = [
    `CREATE TRIGGER ${quoteIdent(name, 'sqlite')} AFTER ${event.toUpperCase()} ON ${quoteIdent(table.name, 'sqlite')}`,
    'FOR EACH ROW BEGIN',
    `    UPDATE ${quoteIdent(table.name, 'sqlite')} SET ${setClause} WHERE ${whereClause};`,
    'END',
  ].join('\n');
  return {
    sql,
    note: 'NEW.column assignments were rewritten as an AFTER trigger UPDATE because SQLite cannot mutate NEW directly.',
  };
}

function buildPostgresTrigger(
  name: string,
  tableName: string,
  timing: string,
  event: string,
  assignments: { column: string; expression: string }[]
): TriggerTranslationResult {
  if (timing === 'INSTEAD OF') {
    return { skipped: 'INSTEAD OF triggers are only supported on views' };
  }
  const functionName = safeName(`fn_${name}`).slice(0, 60);
  const assignLines = assignments.map(
    assignment => `    NEW.${quoteIdent(assignment.column, 'postgres')} := ${assignment.expression};`
  );
  const sql = [
    `CREATE OR REPLACE FUNCTION ${quoteIdent(functionName, 'postgres')}() RETURNS trigger AS $$`,
    'BEGIN',
    ...assignLines,
    '    RETURN NEW;',
    'END;',
    '$$ LANGUAGE plpgsql;',
    '',
    `CREATE TRIGGER ${quoteIdent(name, 'postgres')} ${timing} ${event.toUpperCase()} ON ${quoteIdent(tableName, 'postgres')}`,
    `FOR EACH ROW EXECUTE FUNCTION ${quoteIdent(functionName, 'postgres')}();`,
  ].join('\n');
  return {
    sql,
    note: 'NEW.column assignments were rewritten as a PostgreSQL trigger function returning NEW.',
    downExtra: `DROP FUNCTION IF EXISTS ${quoteIdent(functionName, 'postgres')}();`,
  };
}

function buildMysqlTrigger(
  name: string,
  tableName: string,
  timing: string,
  event: string,
  assignments: { column: string; expression: string }[]
): TriggerTranslationResult {
  const timingKeyword = timing === 'AFTER' ? 'AFTER' : 'BEFORE';
  const setLines = assignments.map(
    assignment => `    SET NEW.${quoteIdent(assignment.column, 'mysql')} = ${assignment.expression};`
  );
  const sql = [
    `CREATE TRIGGER ${quoteIdent(name, 'mysql')} ${timingKeyword} ${event.toUpperCase()} ON ${quoteIdent(tableName, 'mysql')}`,
    'FOR EACH ROW BEGIN',
    ...setLines,
    'END',
  ].join('\n');
  return { sql, note: 'NEW.column assignments were rewritten as MySQL SET NEW statements.' };
}

/**
 * يُرجع تعريف Trigger بصياغة المحرّك الهدف.
 * - نفس المحرّك: يُعاد التعريف كما هو (بعد تنظيف DEFINER/backticks عند الحاجة).
 * - محرّك مختلف وقابل للترجمة: نسخة مكافئة + note.
 * - محرّك مختلف وغير قابل للترجمة بأمان: skipped مع السبب.
 */
export function translateTrigger(
  rawSql: string,
  target: TriggerDialect,
  table?: TriggerTableContext
): TriggerTranslationResult {
  const trimmed = rawSql.trim().replace(/;\s*$/, '');
  if (!trimmed) return { skipped: 'it has an empty definition' };

  const source = detectDialect(trimmed);

  if (source && source !== target) {
    // إزالة DEFINER حتى يُقرأ رأس التعريف
    const withoutDefiner = trimmed.replace(/\bDEFINER\s*=\s*\S+(?:\s*@\s*\S+)?\s+/i, '');
    const header = withoutDefiner.match(HEADER_RE);
    if (!header) {
      return { skipped: `it is written for ${source} in a form this generator cannot parse` };
    }
    const [, rawName, rawTiming, rawEvent, rawTable, rest] = header;
    const name = safeName(unquoteIdent(rawName));
    const tableName = unquoteIdent(rawTable);
    const timing = (rawTiming ?? 'BEFORE').toUpperCase().replace(/\s+/g, ' ');
    const event = rawEvent.toUpperCase();

    const parsed = parseAssignments(rest);
    if ('reason' in parsed) return { skipped: parsed.reason };

    const translated: { column: string; expression: string }[] = [];
    for (const assignment of parsed.assignments) {
      const value = translateExpression(assignment.expression, source, target);
      if (value.unsupported) return { skipped: value.unsupported };
      translated.push({ column: assignment.column, expression: value.expression! });
    }

    let built: TriggerTranslationResult;
    if (target === 'sqlite') {
      const context: TriggerTableContext = table ?? { name: tableName, primaryKey: [] };
      built = buildSqliteTrigger(name, { name: tableName, primaryKey: context.primaryKey }, event, translated);
    } else if (target === 'postgres') {
      if (event === 'DELETE') return { skipped: 'a DELETE trigger cannot assign NEW columns on any engine' };
      built = buildPostgresTrigger(name, tableName, timing, event, translated);
    } else {
      if (event === 'DELETE') return { skipped: 'a DELETE trigger cannot assign NEW columns on any engine' };
      if (timing === 'INSTEAD OF') return { skipped: 'MySQL does not support INSTEAD OF triggers' };
      built = buildMysqlTrigger(name, tableName, timing, event, translated);
    }

    if (built.sql) {
      return { ...built, sql: `${built.sql};`, translatedFrom: source };
    }
    return built;
  }

  // نفس المحرّك (أو لا يمكن تحديد المحرّك): نقل حرفي مع تنظيف آمن
  let sql = trimmed;
  if (target !== 'mysql') {
    sql = sql.replace(
      /\bDEFINER\s*=\s*(?:`[^`]*`|'(?:[^'\\]|\\.)*'|"[^"\\]*"|\S+)(?:\s*@\s*(?:`[^`]*`|'(?:[^'\\]|\\.)*'|"[^"\\]*"|\S+))?\s+/i,
      ''
    );
    sql = sql.replace(/`([^`]+)`/g, '"$1"');
  }
  return { sql: `${sql};` };
}
