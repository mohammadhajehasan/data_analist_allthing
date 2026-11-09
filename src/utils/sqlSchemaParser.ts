/**
 * SQL DDL Parser — لصق SQL أو رفع ملف .sql ثم تحويله إلى ErModel
 * -------------------------------------------------------------------
 * الهدف في PRD «توليد الكود الخلفي من SQL»:
 *   • قراءة CREATE TABLE / ALTER TABLE / CREATE INDEX دون تنفيذ أي SQL.
 *   • استخراج الجداول والأعمدة والمفاتيح والعلاقات والقيود والفهارس.
 *   • اكتشاف اللهجة (MySQL / PostgreSQL / SQLite) مع أسباب ودرجة ثقة.
 *   • إرجاع تحذيرات بدل الفشل الكامل: نُحلّل ما أمكن ونشرح ما تعذّر.
 *
 * المحلل نصّي بالكامل ولا يفتح أي اتصال بقاعدة بيانات ولا ينفّذ مدخل المستخدم.
 */

import type {
  ErColumn,
  ErIndex,
  ErModel,
  ErRelationship,
  ErTable,
  ErTrigger,
  ErView,
} from './drawioImporter';

export type SqlBackendDialect = 'mysql' | 'postgres' | 'sqlite';
export type UnsupportedDialect = 'sqlserver' | 'oracle';

export type DialectSignal = {
  dialect: SqlBackendDialect;
  weight: number;
  reason: string;
};

export type DialectCandidate = {
  dialect: SqlBackendDialect;
  score: number;
  signals: DialectSignal[];
};

export type DialectDetection = {
  dialect: SqlBackendDialect;
  confidence: number; // 0..1
  candidates: DialectCandidate[];
  reasons: string[];
  conflicts: string[];
  /** عند اكتشاف لهجة غير مدعومة في الإصدار الأول */
  unsupported?: UnsupportedDialect;
  /** true عندما لا توجد إشارة حاسمة ويُطلب تأكيد صريح من المستخدم */
  needsConfirmation: boolean;
};

export type SqlParseIssue = {
  line: number;
  statementIndex: number;
  message: string;
  severity: 'warning' | 'error';
  excerpt?: string;
};

export type ParsedSqlSchema = {
  ok: boolean;
  model: ErModel;
  dialect: DialectDetection;
  issues: SqlParseIssue[];
  /** أخطاء قاتلة مثل عدم وجود أي جدول */
  errors: string[];
  stats: {
    statements: number;
    tables: number;
    columns: number;
    relationships: number;
    indexes: number;
    views: number;
    triggers: number;
  };
  /** نص مصدر بعد إزالة التعليقات — للمعاينة فقط */
  normalizedSql?: string;
};

export class SqlSchemaParseError extends Error {
  code: string;
  details?: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

// ---------------------------------------------------------------------------
// أدوات نصية
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function unquoteIdentifier(raw: string): string {
  const text = raw.trim();
  if (text.length >= 2) {
    const first = text[0];
    const last = text[text.length - 1];
    if (first === '`' && last === '`') return text.slice(1, -1).replace(/``/g, '`');
    if (first === '"' && last === '"') return text.slice(1, -1).replace(/""/g, '"');
    if (first === '[' && last === ']') return text.slice(1, -1).replace(/]]/g, ']');
    if (first === "'" && last === "'") return text.slice(1, -1).replace(/''/g, "'");
    return text;
  }
  return text;
}

function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text[i] === '\n') line += 1;
  }
  return line;
}

/** يستبدل التعليقات بمسافات مع الحفاظ على عدد الأسطر — لا يمس النصوص المقتبسة. */
export function stripSqlComments(text: string): string {
  const out: string[] = [];
  let i = 0;
  let quote: "'" | '"' | '`' | null = null;
  let dollarTag: string | null = null;

  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];

    if (dollarTag) {
      if (text.startsWith(dollarTag, i)) {
        out.push(dollarTag);
        i += dollarTag.length;
        dollarTag = null;
      } else {
        out.push(ch);
        i += 1;
      }
      continue;
    }

    if (quote) {
      out.push(ch);
      if (ch === '\\' && quote !== '`' && i + 1 < text.length) {
        out.push(next);
        i += 2;
        continue;
      }
      if (ch === quote) {
        if (text[i + 1] === quote) {
          out.push(text[i + 1]);
          i += 2;
          continue;
        }
        quote = null;
      }
      i += 1;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      out.push(ch);
      i += 1;
      continue;
    }

    if (ch === '$') {
      const match = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(text.slice(i));
      if (match) {
        dollarTag = match[0];
        out.push(dollarTag);
        i += dollarTag.length;
        continue;
      }
    }

    if (ch === '-' && next === '-') {
      while (i < text.length && text[i] !== '\n') {
        out.push(' ');
        i += 1;
      }
      continue;
    }

    if (ch === '#') {
      while (i < text.length && text[i] !== '\n') {
        out.push(' ');
        i += 1;
      }
      continue;
    }

    if (ch === '/' && next === '*') {
      out.push('  ');
      i += 2;
      let close = text.indexOf('*/', i);
      if (close === -1) close = text.length;
      for (; i < close; i += 1) out.push(text[i] === '\n' ? '\n' : ' ');
      if (text[i] === '*' && text[i + 1] === '/') {
        out.push('  ');
        i += 2;
      }
      continue;
    }

    out.push(ch);
    i += 1;
  }

  return out.join('');
}

type Statement = {
  text: string;
  index: number;
  start: number;
  line: number;
};

/** يقسّم إلى عبارات عند الفواصل المنقوطة خارج الأقواس/النصوص. */
export function splitSqlStatements(text: string): Statement[] {
  const statements: Statement[] = [];
  let start = 0;
  let depth = 0;
  let quote: "'" | '"' | '`' | null = null;
  let dollarTag: string | null = null;

  const push = (end: number): void => {
    const raw = text.slice(start, end);
    const clean = raw.trim();
    if (clean) {
      const offset = raw.indexOf(clean);
      statements.push({
        text: clean,
        index: statements.length,
        start: start + Math.max(0, offset),
        line: lineAt(text, start + Math.max(0, offset)),
      });
    }
    start = end + 1;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (dollarTag) {
      if (text.startsWith(dollarTag, i)) {
        i += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }

    if (quote) {
      if (ch === '\\' && quote !== '`') {
        i += 1;
        continue;
      }
      if (ch === quote) {
        if (text[i + 1] === quote) {
          i += 1;
          continue;
        }
        quote = null;
      }
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch === '$') {
      const match = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(text.slice(i));
      if (match) {
        dollarTag = match[0];
        i += dollarTag.length - 1;
        continue;
      }
    }

    if (ch === '(') depth += 1;
    else if (ch === ')' && depth > 0) depth -= 1;
    else if (ch === ';' && depth === 0) push(i);
  }

  if (start < text.length) push(text.length);
  return statements;
}

/**
 * يحوّل تعليمات DELIMITER المخصّصة (MySQL) إلى فواصل منقوطة عادية
 * مع الحفاظ على عدد الأسطر — ضروري لالتقاط Triggers ذات جسم BEGIN…END.
 */
export function normalizeSqlDelimiters(text: string): string {
  const chars = text.split('');
  let i = 0;
  let active: string | null = null;
  let quote: "'" | '"' | '`' | null = null;
  let dollarTag: string | null = null;

  while (i < text.length) {
    const ch = text[i];

    if (dollarTag) {
      if (text.startsWith(dollarTag, i)) {
        i += dollarTag.length;
        dollarTag = null;
      } else {
        i += 1;
      }
      continue;
    }

    if (quote) {
      if (ch === '\\' && quote !== '`') {
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      i += 1;
      continue;
    }

    if (ch === '$') {
      const match = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(text.slice(i));
      if (match) {
        dollarTag = match[0];
        i += match[0].length;
        continue;
      }
    }

    const lineStart = text.lastIndexOf('\n', i - 1) + 1;
    const atLineStart = text.slice(lineStart, i).trim() === '';
    if (atLineStart && /^DELIMITER[ \t]+/i.test(text.slice(i))) {
      const match = /^DELIMITER[ \t]+(\S+)[^\n]*/i.exec(text.slice(i));
      if (match) {
        const end = i + match[0].length;
        for (let k = i; k < end; k += 1) if (chars[k] !== '\n') chars[k] = ' ';
        active = match[1];
        i = end;
        continue;
      }
    }

    if (active && text.startsWith(active, i)) {
      chars[i] = ';';
      for (let k = 1; k < active.length; k += 1) chars[i + k] = ' ';
      i += active.length;
      continue;
    }

    i += 1;
  }

  return chars.join('');
}

function nextSqlWord(text: string, index: number): string {
  let i = index;
  while (i < text.length && /\s/.test(text[i])) i += 1;
  if (i >= text.length) return '';
  if (!/[A-Za-z_]/.test(text[i])) return text[i];
  let end = i + 1;
  while (end < text.length && /[A-Za-z0-9_$]/.test(text[end])) end += 1;
  return text.slice(i, end).toUpperCase();
}

/** نهاية CREATE TRIGGER: أول فاصلة منقوطة خارج الأقواس/النصوص وبعد إغلاق كل BEGIN/END. */
function findTriggerEnd(text: string, start: number): number {
  let i = start;
  let depth = 0;
  let quote: "'" | '"' | '`' | null = null;
  let dollarTag: string | null = null;
  const blocks: string[] = [];

  while (i < text.length) {
    const ch = text[i];

    if (dollarTag) {
      if (text.startsWith(dollarTag, i)) {
        i += dollarTag.length;
        dollarTag = null;
      } else {
        i += 1;
      }
      continue;
    }

    if (quote) {
      if (ch === '\\' && quote !== '`') {
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      i += 1;
      continue;
    }

    if (ch === '$') {
      const match = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(text.slice(i));
      if (match) {
        dollarTag = match[0];
        i += match[0].length;
        continue;
      }
    }

    if (ch === '(') depth += 1;
    else if (ch === ')' && depth > 0) depth -= 1;
    else if (ch === ';' && depth === 0 && blocks.length === 0) return i + 1;

    if (/[A-Za-z_]/.test(ch)) {
      let end = i + 1;
      while (end < text.length && /[A-Za-z0-9_$]/.test(text[end])) end += 1;
      const token = text.slice(i, end).toUpperCase();
      if (token === 'BEGIN') blocks.push('begin');
      else if (token === 'CASE') blocks.push('case');
      else if (token === 'LOOP') blocks.push('loop');
      else if (token === 'WHILE') blocks.push('while');
      else if (token === 'REPEAT') blocks.push('repeat');
      else if (token === 'IF') {
        const next = nextSqlWord(text, end);
        // IF NOT EXISTS / IF(...) ليست كتلاً منطقية
        if (next !== '(' && !/^\s+NOT\s+EXISTS\b/i.test(text.slice(end))) blocks.push('if');
      } else if (token === 'END') {
        const next = nextSqlWord(text, end);
        if (['IF', 'LOOP', 'WHILE', 'REPEAT'].includes(next)) {
          const idx = blocks.lastIndexOf(next.toLowerCase());
          if (idx >= 0) blocks.splice(idx, 1);
        } else if (next === 'CASE') {
          const idx = blocks.lastIndexOf('case');
          if (idx >= 0) blocks.splice(idx, 1);
        } else {
          const idx = blocks.lastIndexOf('begin');
          if (idx >= 0) blocks.splice(idx, 1);
          else blocks.pop();
        }
      }
      i = end;
      continue;
    }

    i += 1;
  }

  return text.length;
}

function isInsideQuotedText(text: string, index: number): boolean {
  let quote: "'" | '"' | '`' | null = null;
  let dollarTag: string | null = null;
  for (let i = 0; i < index; i += 1) {
    const ch = text[i];
    if (dollarTag) {
      if (text.startsWith(dollarTag, i)) {
        i += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }
    if (quote) {
      if (ch === '\\' && quote !== '`') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === '$') {
      const match = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(text.slice(i));
      if (match) {
        dollarTag = match[0];
        i += match[0].length - 1;
      }
    }
  }
  return quote !== null || dollarTag !== null;
}

/** يستخرج Triggers قبل تقسيم العبارات، ويستبدلها بمسافات للحفاظ على أرقام الأسطر. */
export function extractSqlTriggers(text: string): { text: string; triggers: Array<{ rawSql: string; line: number }> } {
  const triggers: Array<{ rawSql: string; line: number }> = [];
  const chars = text.split('');
  const pattern = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:DEFINER\s*=\s*(?:`[^`]*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\S+)(?:\s*@\s*(?:`[^`]*`|'(?:[^'\\]|\\.)*'|"[^"]*"|\S+))?\s+)?TRIGGER\b/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text))) {
    if (isInsideQuotedText(text, match.index)) continue;
    const end = findTriggerEnd(text, match.index);
    const rawSql = text.slice(match.index, end).trim().replace(/;\s*$/, '').trim();
    if (!rawSql) continue;
    triggers.push({ rawSql, line: lineAt(text, match.index) });
    for (let i = match.index; i < end; i += 1) if (chars[i] !== '\n') chars[i] = ' ';
    pattern.lastIndex = end;
  }

  return { text: chars.join(''), triggers };
}

function parseViewStatement(text: string, line: number): ErView | null {
  const head = /^CREATE\s+(?:OR\s+REPLACE\s+)?(?:ALGORITHM\s*=\s*\w+\s+)?(?:DEFINER\s*=\s*(?:\S+|'[^']*')\s+)?(?:SQL\s+SECURITY\s+\w+\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?/i.exec(text);
  if (!head) return null;
  const after = text.slice(head[0].length);
  const ident = readQualifiedIdentifier(after);
  if (!ident) return null;
  let rest = after.slice(ident.end).trim();
  let columns: string[] | undefined;
  if (rest.startsWith('(')) {
    const close = findMatchingParen(rest, 0);
    if (close < 0) return null;
    columns = splitTopLevelList(rest.slice(1, close)).map(column => unquoteIdentifier(column.trim())).filter(Boolean);
    rest = rest.slice(close + 1).trim();
  }
  if (!/^AS\b/i.test(rest)) return null;
  const query = rest.replace(/^AS\b/i, '').trim().replace(/;\s*$/, '').trim();
  if (!query) return null;
  return { name: ident.name, columns, query, rawSql: text.trim(), line };
}

function parseTriggerDefinition(rawSql: string, line: number): ErTrigger {
  const nameMatch = /TRIGGER\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"\[\]\w.$]+)/i.exec(rawSql);
  const rawName = nameMatch?.[1] ?? `trigger_${line}`;
  const name = unquoteIdentifier(rawName.split('.').pop() || rawName);
  const meta = /(BEFORE|AFTER|INSTEAD\s+OF)\s+(INSERT|UPDATE|DELETE)(?:\s+OR\s+(?:REPLACE|IGNORE))?(?:\s+OF\s+[^\s]+)?\s+ON\s+([`"\[\]\w.$]+)/i.exec(rawSql);
  const table = meta?.[3] ? unquoteIdentifier(meta[3].split('.').pop() || meta[3]) : undefined;
  const bodyIndex = rawSql.search(/\bFOR\s+EACH\s+ROW\b/i);
  const body = (bodyIndex >= 0 ? rawSql.slice(bodyIndex).replace(/^FOR\s+EACH\s+ROW\b/i, '') : '').trim();
  return {
    name,
    table,
    timing: meta?.[1]?.replace(/\s+/g, ' ').toUpperCase(),
    event: meta?.[2]?.toUpperCase(),
    body: body || undefined,
    rawSql,
    line,
  };
}

/** يجزّئ قائمة (أعمدة/فهرس/جسم جدول) عند الفواصل في المستوى الأعلى. */
export function splitTopLevelList(text: string, delimiter = ','): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote: "'" | '"' | '`' | null = null;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\' && quote !== '`') i += 1;
      else if (ch === quote) {
        if (text[i + 1] === quote) i += 1;
        else quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')' && depth > 0) depth -= 1;
    else if (ch === delimiter && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map(part => part.trim()).filter(Boolean);
}

/** يبحث عن مطابق القوس مع تجاهل النصوص. */
function findMatchingParen(text: string, openIndex: number): number {
  let depth = 0;
  let quote: "'" | '"' | '`' | null = null;
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\' && quote !== '`') i += 1;
      else if (ch === quote) {
        if (text[i + 1] === quote) i += 1;
        else quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** يقرأ معرّفاً (مقتبساً أو عادياً) من بداية النص ويعيد اسمه وآخر موضع. */
function readIdentifier(text: string): { raw: string; name: string; end: number } | null {
  const trimmedStart = text.search(/\S/);
  if (trimmedStart === -1) return null;
  const start = trimmedStart;
  const first = text[start];
  if (first === '"' || first === '`' || first === '[') {
    const close = first === '[' ? ']' : first;
    let i = start + 1;
    while (i < text.length) {
      if (text[i] === close) {
        if (text[i + 1] === close) {
          i += 2;
          continue;
        }
        const raw = text.slice(start, i + 1);
        return { raw, name: unquoteIdentifier(raw), end: i + 1 };
      }
      i += 1;
    }
    return null;
  }
  const match = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(text.slice(start));
  if (!match) return null;
  return { raw: match[0], name: match[0], end: start + match[0].length };
}

/** يقرأ اسماً مؤهّلاً schema.table ويعيد الاسم النهائي. */
function readQualifiedIdentifier(text: string): { raw: string; name: string; end: number } | null {
  const first = readIdentifier(text);
  if (!first) return null;
  let end = first.end;
  let name = first.name;
  const rest = text.slice(end);
  const dot = /^\s*\.\s*/.exec(rest);
  if (dot) {
    const second = readIdentifier(rest.slice(dot[0].length));
    if (second) {
      name = second.name;
      end += dot[0].length + second.end;
    }
  }
  return { raw: text.slice(0, end), name, end };
}

/** يقرأ نوع العمود حتى أول كلمة مفتاحية على المستوى الأعلى. */
const COLUMN_FLAGS = [
  'NOT', 'NULL', 'DEFAULT', 'PRIMARY', 'UNIQUE', 'AUTO_INCREMENT', 'AUTOINCREMENT',
  'REFERENCES', 'CHECK', 'COLLATE', 'COMMENT', 'GENERATED', 'IDENTITY', 'CONSTRAINT',
  'ON', 'KEY', 'CHARSET',
];

function readTypeAndFlags(rest: string): { type: string; flags: string } {
  let i = 0;
  let depth = 0;
  let quote: "'" | '"' | '`' | null = null;
  let flagStart = -1;

  while (i < rest.length) {
    const ch = rest[i];
    if (quote) {
      if (ch === '\\' && quote !== '`') i += 1;
      else if (ch === quote) {
        if (rest[i + 1] === quote) i += 1;
        else quote = null;
      }
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === '(') {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === ')') {
      if (depth > 0) depth -= 1;
      i += 1;
      continue;
    }
    if (depth === 0 && /[A-Za-z_]/.test(ch)) {
      const wordMatch = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest.slice(i));
      const word = (wordMatch?.[0] || '').toUpperCase();
      if (COLUMN_FLAGS.includes(word)) {
        // NULL بعد NOT ليس بداية مستقلة
        if (word === 'NULL' && /NOT\s+$/i.test(rest.slice(0, i))) {
          const notStart = rest.slice(0, i).search(/NOT\s+$/i);
          flagStart = notStart >= 0 ? notStart : i;
          break;
        }
        flagStart = i;
        break;
      }
      i += word.length;
      continue;
    }
    i += 1;
  }

  if (flagStart === -1) return { type: rest.trim(), flags: '' };
  return {
    type: rest.slice(0, flagStart).trim(),
    flags: rest.slice(flagStart).trim(),
  };
}

/** يخفي النصوص والأقواس كي نبحث عن الكلمات المفتاحية دون إنذارات كاذبة. */
function maskQuotedAndNested(text: string): string {
  const out: string[] = [];
  let quote: "'" | '"' | '`' | null = null;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      out.push(' ');
      if (ch === '\\' && quote !== '`') {
        if (i + 1 < text.length) {
          out.push(' ');
          i += 1;
        }
      } else if (ch === quote) {
        if (text[i + 1] === quote) {
          out.push(' ');
          i += 1;
        } else quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      out.push(' ');
      continue;
    }
    if (ch === '(') {
      depth += 1;
      out.push(' ');
      continue;
    }
    if (ch === ')') {
      if (depth > 0) depth -= 1;
      out.push(' ');
      continue;
    }
    out.push(depth > 0 ? ' ' : ch);
  }
  return out.join('');
}

const NEXT_FLAG_RE = /\b(?:NOT\s+NULL|NULL|PRIMARY\s+KEY|UNIQUE|AUTO_INCREMENT|AUTOINCREMENT|REFERENCES|CHECK|COLLATE|COMMENT|GENERATED|IDENTITY|ON\s+UPDATE|ON\s+DELETE|CONSTRAINT|CHARACTER\s+SET|CHARSET)\b/gi;

function findClauseEnd(flags: string, from: number): number {
  const masked = maskQuotedAndNested(flags);
  NEXT_FLAG_RE.lastIndex = from;
  const match = NEXT_FLAG_RE.exec(masked);
  return match ? match.index : flags.length;
}

function findClause(flags: string, keyword: RegExp): string | undefined {
  const masked = maskQuotedAndNested(flags);
  const match = keyword.exec(masked);
  if (!match) return undefined;
  const start = match.index + match[0].length;
  const end = findClauseEnd(flags, start);
  return flags.slice(start, end).trim();
}

function normalizeSqlType(raw: string): string {
  const text = (raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s+CHARACTER\s+SET\s+\S+/gi, '')
    .replace(/\s+CHARSET\s+\S+/gi, '')
    .replace(/\s+COLLATE\s+\S+/gi, '')
    .trim();
  if (!text) return '';
  const lower = text.toLowerCase();
  const withLength = (name: string): string => {
    const m = /(\([^)]*\))\s*$/.exec(text);
    return m ? `${name}${m[1]}` : name;
  };

  if (/^character varying/.test(lower)) return withLength('VARCHAR');
  if (/^varchar/.test(lower)) return withLength('VARCHAR');
  if (/^character\b/.test(lower) && !/varying/.test(lower)) return withLength('CHAR');
  if (/^timestamp\b/.test(lower)) return text.replace(/^timestamp\s+(?:with|without)\s+time\s+zone/i, 'TIMESTAMP').replace(/^timestamp/i, 'TIMESTAMP');
  if (/^double precision/.test(lower)) return 'DOUBLE';
  if (/^numeric\b/.test(lower)) return withLength('DECIMAL');
  if (/^decimal\b/.test(lower)) return withLength('DECIMAL');
  if (lower === 'bytea') return 'BLOB';
  if (lower === 'jsonb') return 'JSON';
  if (lower === 'uuid') return 'UUID';
  if (/^int(?:eger)?4$/.test(lower)) return 'INT';
  if (/^int(?:eger)?8$/.test(lower)) return 'BIGINT';
  if (lower === 'integer') return 'INT';
  if (lower === 'bool') return 'BOOLEAN';
  if (lower === 'double') return 'DOUBLE';
  if (lower === 'real') return 'FLOAT';
  if (lower === 'bigserial') return 'BIGSERIAL';
  if (lower === 'serial') return 'SERIAL';
  if (lower === 'tinyint' || /^tinyint\s*\(/.test(lower)) return text.replace(/^tinyint/i, 'TINYINT');
  if (lower === 'mediumint' || /^mediumint\s*\(/.test(lower)) return text.replace(/^mediumint/i, 'MEDIUMINT');
  if (lower === 'number' || /^number\s*\(/.test(lower)) return withLength('DECIMAL');
  if (lower === 'nvarchar' || /^nvarchar\s*\(/.test(lower)) return withLength('VARCHAR');
  if (lower === 'varchar2' || /^varchar2\s*\(/.test(lower)) return withLength('VARCHAR');
  return text;
}

function normalizeOnDelete(raw: string | undefined): ErRelationship['onDelete'] {
  if (!raw) return undefined;
  const match = /\bON\s+DELETE\s+(CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION)\b/i.exec(raw);
  if (!match) return undefined;
  const value = match[1].toUpperCase().replace(/\s+/g, ' ');
  if (value === 'CASCADE') return 'CASCADE';
  if (value === 'SET NULL') return 'SET NULL';
  if (value === 'RESTRICT') return 'RESTRICT';
  if (value === 'NO ACTION') return 'NO ACTION';
  return undefined;
}

// ---------------------------------------------------------------------------
// اكتشاف اللهجة
// ---------------------------------------------------------------------------

export function detectSqlDialect(sql: string): DialectDetection {
  const candidates: Record<SqlBackendDialect, DialectCandidate> = {
    mysql: { dialect: 'mysql', score: 0, signals: [] },
    postgres: { dialect: 'postgres', score: 0, signals: [] },
    sqlite: { dialect: 'sqlite', score: 0, signals: [] },
  };

  const add = (dialect: SqlBackendDialect, weight: number, reason: string): void => {
    candidates[dialect].score += weight;
    candidates[dialect].signals.push({ dialect, weight, reason });
  };

  const count = (pattern: RegExp, cap = 4): number => {
    const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
    return Math.min(cap, (sql.match(new RegExp(pattern.source, flags)) || []).length);
  };

  const mysqlBackticks = count(/`[^`\r\n]+`/g, 3);
  if (mysqlBackticks > 0) add('mysql', 2 + Math.min(2, mysqlBackticks), 'backtick-quoted identifiers');
  if (/\bENGINE\s*=\s*\w+/i.test(sql)) add('mysql', 3, 'ENGINE= table option');
  if (/\bAUTO_INCREMENT\b/i.test(sql)) add('mysql', 4, 'AUTO_INCREMENT keyword');
  if (/\bUNSIGNED\b/i.test(sql)) add('mysql', 2, 'UNSIGNED numeric type');
  if (/\bTINYINT\s*\(\s*1\s*\)/i.test(sql)) add('mysql', 2, 'TINYINT(1) boolean convention');
  if (/\bON\s+UPDATE\s+CURRENT_TIMESTAMP\b/i.test(sql)) add('mysql', 2, 'ON UPDATE CURRENT_TIMESTAMP');
  if (/\/\*!\d+/.test(sql)) add('mysql', 1, 'MySQL conditional dump comment');
  if (/\bENUM\s*\(/i.test(sql)) add('mysql', 1, 'inline ENUM definition');
  if (/\bDATETIME\b/i.test(sql)) add('mysql', 1, 'DATETIME type');

  if (/\b(?:BIG)?SERIAL\b/i.test(sql)) add('postgres', 4, 'SERIAL/BIGSERIAL type');
  if (/\bJSONB\b/i.test(sql)) add('postgres', 4, 'JSONB type');
  if (/\bUUID\b/i.test(sql)) add('postgres', 2, 'UUID type');
  if (/\bTIMESTAMPTZ\b/i.test(sql)) add('postgres', 3, 'TIMESTAMPTZ type');
  if (/\bBYTEA\b/i.test(sql)) add('postgres', 3, 'BYTEA type');
  if (/::/.test(sql)) add('postgres', 2, 'PostgreSQL :: cast operator');
  if (/\bGENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY\b/i.test(sql)) add('postgres', 3, 'GENERATED AS IDENTITY');
  if (/\bCREATE\s+EXTENSION\b/i.test(sql)) add('postgres', 2, 'CREATE EXTENSION');
  if (/\$[A-Za-z_0-9]*\$/.test(sql)) add('postgres', 2, 'dollar-quoted string');
  if (/\bnextval\s*\(/i.test(sql)) add('postgres', 3, 'nextval() sequence default');
  if (/\bpg_catalog\b/i.test(sql)) add('postgres', 2, 'pg_catalog reference');

  if (/\bAUTOINCREMENT\b/i.test(sql) && !/\bAUTO_INCREMENT\b/i.test(sql)) add('sqlite', 4, 'AUTOINCREMENT keyword');
  if (/\bWITHOUT\s+ROWID\b/i.test(sql)) add('sqlite', 4, 'WITHOUT ROWID table');
  if (/\bPRAGMA\b/i.test(sql)) add('sqlite', 2, 'PRAGMA statement');
  if (/\bsqlite_[a-z_]+/i.test(sql)) add('sqlite', 3, 'sqlite_* internal table');
  if (/\bINTEGER\s+PRIMARY\s+KEY\b/i.test(sql)) add('sqlite', 2, 'INTEGER PRIMARY KEY rowid alias');
  if (/\bSTRICT\b/i.test(sql)) add('sqlite', 1, 'STRICT table option');

  const ranked = Object.values(candidates).sort((a, b) => b.score - a.score);
  const total = ranked.reduce((sum, candidate) => sum + candidate.score, 0);
  const top = ranked[0];
  const second = ranked[1];
  const chosen = total === 0 ? 'mysql' : top.dialect;
  const chosenScore = candidates[chosen].score;

  let confidence = 0.15;
  if (total > 0) {
    confidence = clamp(0.1 + 0.11 * chosenScore + 0.15 * (chosenScore / total), 0.15, 0.99);
  }
  const reasons = candidates[chosen].signals.map(signal => signal.reason);
  if (total === 0) reasons.push('لا توجد علامة لهجة حاسمة — اعتماد MySQL كافتراضي');

  const conflicts: string[] = [];
  if (/\bJSONB\b/i.test(sql) && /\bENGINE\s*=\s*\w+/i.test(sql)) {
    conflicts.push('JSONB (PostgreSQL) ظهر مع ENGINE= (MySQL) — تحقّق من صحة السكيما.');
  }
  if (/\bAUTO_INCREMENT\b/i.test(sql) && /\bAUTOINCREMENT\b/i.test(sql)) {
    conflicts.push('AUTO_INCREMENT وAUTOINCREMENT معاً — لهجتان مختلطتان.');
  }
  if (/\bTINYINT\s*\(\s*1\s*\)/i.test(sql) && /\bBOOLEAN\b/i.test(sql) && chosen !== 'mysql') {
    conflicts.push('TINYINT(1) عادةً MySQL بينما BOOLEAN يشير لغيرها.');
  }

  const needsConfirmation =
    total === 0 || confidence < 0.45 || (second.score > 0 && top.score - second.score <= 1 && confidence < 0.65);

  let unsupported: UnsupportedDialect | undefined;
  const sqlServerSignals =
    (/\bNVARCHAR\b/i.test(sql) ? 2 : 0) +
    (/\bIDENTITY\s*\(/i.test(sql) ? 3 : 0) +
    (/\bDATETIME2\b/i.test(sql) ? 2 : 0) +
    (/\bUNIQUEIDENTIFIER\b/i.test(sql) ? 3 : 0) +
    (/\[dbo\]/i.test(sql) ? 3 : 0) +
    (/^\s*GO\s*$/im.test(sql) ? 3 : 0);
  const oracleSignals =
    (/\bVARCHAR2\b/i.test(sql) ? 3 : 0) +
    (/\bNUMBER\s*\(\s*\d+/i.test(sql) ? 2 : 0) +
    (/\bNVL\s*\(/i.test(sql) ? 2 : 0) +
    (/\bSYSDATE\b/i.test(sql) ? 2 : 0);
  if (sqlServerSignals >= 4 && chosenScore <= 2) unsupported = 'sqlserver';
  else if (oracleSignals >= 3 && chosenScore <= 2) unsupported = 'oracle';

  return {
    dialect: chosen,
    confidence: Number(confidence.toFixed(2)),
    candidates: ranked,
    reasons,
    conflicts,
    unsupported,
    needsConfirmation,
  };
}

// ---------------------------------------------------------------------------
// تحليل العبارات
// ---------------------------------------------------------------------------

type TableBuild = ErTable & {
  _indexNames: Set<string>;
  _pendingRelations: ErRelationship[];
};

type PendingIndex = {
  table: string;
  index: ErIndex;
  line: number;
};

type PendingAlter = {
  statement: string;
  line: number;
};

const CONSTRAINT_HEAD_RE = /^(?:CONSTRAINT\s+((?:"(?:[^"]|"")*"|`(?:[^`]|``)*`|\[[^\]]+\]|[A-Za-z_][\w$]*))\s+)?(PRIMARY\s+KEY|UNIQUE(?:\s+(?:KEY|INDEX))?|FOREIGN\s+KEY|CHECK|KEY|INDEX)\b/i;

function isTableConstraint(item: string): boolean {
  const trimmed = item.trim();
  if (/^CONSTRAINT\b/i.test(trimmed)) return true;
  if (/^(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK)\b/i.test(trimmed)) return true;
  if (/^(KEY|INDEX)\b/i.test(trimmed)) return /\(/.test(trimmed);
  return false;
}

function parseColumnList(raw: string): string[] {
  const inner = raw.trim().replace(/^\(/, '').replace(/\)$/, '');
  return splitTopLevelList(inner)
    .map(part => {
      const ident = readIdentifier(part);
      return ident ? ident.name : '';
    })
    .filter(Boolean);
}

function addIndex(build: TableBuild, index: ErIndex, warnings: { line: number; message: string }[]): void {
  const columns = index.columns.filter(Boolean);
  if (columns.length === 0) return;
  const baseName = index.name || `${index.unique ? 'uq' : 'ix'}_${build.name}_${columns.join('_')}`;
  let name = baseName;
  let n = 2;
  while (build._indexNames.has(name.toLowerCase())) name = `${baseName}_${n++}`;
  build._indexNames.add(name.toLowerCase());
  const existing = build.indexes!.find(
    item => item.unique === index.unique && item.columns.join(',') === columns.join(',')
  );
  if (existing) return;
  build.indexes!.push({ ...index, name, columns });
  if (index.unique && columns.length === 1) {
    const col = build.columns.find(c => c.name.toLowerCase() === columns[0].toLowerCase());
    if (col && !col.isPrimaryKey) col.isUnique = true;
  }
  if (index.columns.length !== columns.length) {
    warnings.push({ line: 0, message: `تم تجاهل عنصر تعبيري في الفهرس "${name}" — الفهارس التعبيرية غير مدعومة.` });
  }
}

function parseReferences(raw: string): { table: string; columns: string[]; onDelete?: ErRelationship['onDelete'] } | null {
  const match = /\bREFERENCES\s+/i.exec(raw);
  if (!match) return null;
  const after = raw.slice(match.index + match[0].length);
  const tableIdent = readQualifiedIdentifier(after);
  if (!tableIdent) return null;
  const rest = after.slice(tableIdent.end);
  const paren = /^\s*\(/.exec(rest);
  let columns: string[] = [];
  if (paren) {
    const open = paren[0].length - 1;
    const close = findMatchingParen(rest, open);
    if (close > open) columns = parseColumnList(rest.slice(open, close + 1));
  }
  return {
    table: tableIdent.name,
    columns,
    onDelete: normalizeOnDelete(raw.slice(match.index)),
  };
}

function parseTableBody(
  build: TableBuild,
  body: string,
  warnings: { line: number; message: string }[]
): void {
  for (const item of splitTopLevelList(body)) {
    if (isTableConstraint(item)) {
      parseTableConstraint(build, item, warnings);
    } else {
      parseColumnDefinition(build, item, warnings);
    }
  }
}

function parseTableConstraint(
  build: TableBuild,
  item: string,
  warnings: { line: number; message: string }[]
): void {
  let text = item.trim();
  let constraintName = '';
  const constraintHead = /^CONSTRAINT\s+((?:"(?:[^"]|"")*"|`(?:[^`]|``)*`|\[[^\]]+\]|[A-Za-z_][\w$]*))\s+/i.exec(text);
  if (constraintHead) {
    constraintName = unquoteIdentifier(constraintHead[1]);
    text = text.slice(constraintHead[0].length).trim();
  }

  const kind = CONSTRAINT_HEAD_RE.exec(text)?.[2]?.toUpperCase() || '';
  if (kind === 'PRIMARY KEY') {
    const open = text.indexOf('(');
    const close = open >= 0 ? findMatchingParen(text, open) : -1;
    if (open >= 0 && close > open) {
      for (const name of parseColumnList(text.slice(open, close + 1))) {
        const col = build.columns.find(c => c.name.toLowerCase() === name.toLowerCase());
        if (col) {
          col.isPrimaryKey = true;
          col.isNullable = false;
        }
      }
    }
    return;
  }

  if (kind.startsWith('UNIQUE')) {
    const open = text.indexOf('(');
    const close = open >= 0 ? findMatchingParen(text, open) : -1;
    if (open >= 0 && close > open) {
      addIndex(
        build,
        {
          name: constraintName,
          columns: parseColumnList(text.slice(open, close + 1)),
          unique: true,
        },
        warnings
      );
    }
    return;
  }

  if (kind === 'FOREIGN KEY') {
    const open = text.indexOf('(');
    const close = open >= 0 ? findMatchingParen(text, open) : -1;
    if (open < 0 || close <= open) return;
    const childColumns = parseColumnList(text.slice(open, close + 1));
    const refs = parseReferences(text.slice(close + 1));
    if (!refs || refs.columns.length === 0) {
      warnings.push({ line: 0, message: `المفتاح الأجنبي في "${build.name}" بلا جدول/عمود مرجعي واضح — تم تجاهله.` });
      return;
    }
    childColumns.forEach((childCol, index) => {
      const parentCol = refs.columns[index] || refs.columns[0];
      addRelationship(build, refs.table, parentCol, childCol, refs.onDelete);
    });
    return;
  }

  if (kind === 'CHECK') {
    const open = text.indexOf('(');
    const close = open >= 0 ? findMatchingParen(text, open) : -1;
    if (open >= 0 && close > open) {
      build.tableChecks!.push(text.slice(open + 1, close).trim());
    }
    return;
  }

  if (kind === 'KEY' || kind === 'INDEX') {
    const open = text.indexOf('(');
    const close = open >= 0 ? findMatchingParen(text, open) : -1;
    if (open >= 0 && close > open) {
      addIndex(
        build,
        {
          name: constraintName,
          columns: parseColumnList(text.slice(open, close + 1)),
          unique: false,
        },
        warnings
      );
    }
  }
}

function addRelationship(
  childBuild: TableBuild,
  parentTable: string,
  parentColumn: string,
  childColumn: string,
  onDelete?: ErRelationship['onDelete']
): void {
  const childCol = childBuild.columns.find(c => c.name.toLowerCase() === childColumn.toLowerCase());
  if (childCol) childCol.isForeignKey = true;
  const key = `${childBuild.name}.${childColumn}->${parentTable}.${parentColumn}`;
  if (childBuild._pendingRelations.some(rel => `${rel.targetTable}.${rel.targetColumn}->${rel.sourceTable}.${rel.sourceColumn}` === key)) {
    return;
  }
  childBuild._pendingRelations.push({
    id: `fk:${key}`,
    sourceTable: parentTable,
    targetTable: childBuild.name,
    sourceColumn: parentColumn,
    targetColumn: childColumn,
    cardinality: '1-N',
    onDelete,
  });
}

function parseColumnDefinition(
  build: TableBuild,
  item: string,
  warnings: { line: number; message: string }[]
): void {
  const ident = readIdentifier(item);
  if (!ident) {
    warnings.push({ line: 0, message: `تعذّر قراءة اسم عمود من: ${item.slice(0, 80)}` });
    return;
  }
  const name = ident.name;
  if (build.columns.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    warnings.push({ line: 0, message: `عمود مكرر "${name}" في "${build.name}" — تم الاحتفاظ بالأول.` });
    return;
  }

  const rest = item.slice(ident.end).trim();
  const { type: rawType, flags } = readTypeAndFlags(rest);
  const type = normalizeSqlType(rawType);
  const upperFlags = flags.toUpperCase();

  const notNull = /\bNOT\s+NULL\b/.test(upperFlags);
  const primaryKey = /\bPRIMARY\s+KEY\b/.test(upperFlags);
  const unique = /\bUNIQUE\b/.test(upperFlags);
  const references = parseReferences(flags);
  const rawCheck = findClause(flags, /\bCHECK\b/i);
  const checkClause = rawCheck ? rawCheck.replace(/^\s*\(([\s\S]*)\)\s*$/, '$1').trim() : undefined;
  const defaultClause = findClause(flags, /\bDEFAULT\b/i);

  let defaultValue = defaultClause || undefined;
  if (defaultClause && /^NULL$/i.test(defaultClause)) defaultValue = 'NULL';
  if (defaultClause && /^'[^']*'\s*$/.test(defaultClause) === false && /^\d+$/.test(defaultClause)) {
    // القيم الرقمية تُترك كما هي
  }

  if (rawType && !type) {
    warnings.push({ line: 0, message: `نوع غير معروف للعمود "${name}" — سيُعامَل كنص.` });
  }

  const column: ErColumn = {
    name,
    type: type || 'TEXT',
    isPrimaryKey: primaryKey,
    isNullable: primaryKey ? false : !notNull,
    isUnique: unique || undefined,
    ...(references ? { isForeignKey: true } : {}),
    ...(defaultValue ? { defaultValue } : {}),
    ...(checkClause ? { check: checkClause } : {}),
  };
  build.columns.push(column);

  if (references) {
    if (references.columns.length === 0) {
      warnings.push({ line: 0, message: `FK "${build.name}.${name}" بلا عمود مرجعي صريح — الاعتماد على مفتاح الجدول الأب.` });
    }
    addRelationship(build, references.table, references.columns[0] || 'id', name, references.onDelete);
  }
}

function applyPendingIndex(pending: PendingIndex, tables: Map<string, TableBuild>, warnings: { line: number; message: string }[]): void {
  const build = tables.get(pending.table.toLowerCase());
  if (!build) {
    warnings.push({ line: 0, message: `فهرس لجدول غير موجود: ${pending.table}` });
    return;
  }
  addIndex(build, pending.index, warnings);
}

function parseCreateIndex(
  statement: string,
  pendingIndexes: PendingIndex[],
  line: number,
  warnings: { line: number; message: string }[]
): void {
  const unique = /^CREATE\s+UNIQUE\s+INDEX\b/i.test(statement);
  const match = /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?/i.exec(statement);
  if (!match) return;
  const after = statement.slice(match[0].length);
  const nameIdent = readQualifiedIdentifier(after);
  if (!nameIdent) return;
  const onMatch = /\bON\s+/i.exec(after.slice(nameIdent.end));
  if (!onMatch) {
    warnings.push({ line, message: 'CREATE INDEX بلا ON — تم تجاهله.' });
    return;
  }
  const afterOn = after.slice(nameIdent.end + onMatch.index + onMatch[0].length);
  const tableIdent = readQualifiedIdentifier(afterOn);
  if (!tableIdent) return;
  const rest = afterOn.slice(tableIdent.end);
  const open = rest.indexOf('(');
  const close = open >= 0 ? findMatchingParen(rest, open) : -1;
  if (open < 0 || close <= open) return;
  const columns = parseColumnList(rest.slice(open, close + 1));
  if (columns.length === 0) return;
  if (/\bWHERE\b/i.test(rest.slice(close + 1))) {
    warnings.push({ line, message: `الفهرس "${nameIdent.name}" جزئي (WHERE) — الفهارس الجزئية غير مدعومة في المولّد.` });
    return;
  }
  pendingIndexes.push({
    table: tableIdent.name,
    line,
    index: { name: nameIdent.name, columns, unique },
  });
}

function parseAlterTable(
  statement: string,
  pendingAlters: PendingAlter[],
  line: number
): void {
  pendingAlters.push({ statement, line });
}

function applyAlter(
  alter: PendingAlter,
  tables: Map<string, TableBuild>,
  warnings: { line: number; message: string }[]
): void {
  const match = /^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?/i.exec(alter.statement);
  if (!match) return;
  const after = alter.statement.slice(match[0].length);
  const tableIdent = readQualifiedIdentifier(after);
  if (!tableIdent) return;
  const build = tables.get(tableIdent.name.toLowerCase());
  if (!build) {
    warnings.push({ line: alter.line, message: `ALTER TABLE لجدول غير موجود: ${tableIdent.name}` });
    return;
  }
  const rest = after.slice(tableIdent.end).trim();
  const actionMatch = /^(ADD|MODIFY|ALTER|DROP|RENAME)\b/i.exec(rest);
  if (!actionMatch) return;
  const action = actionMatch[1].toUpperCase();
  const body = rest.slice(actionMatch[0].length).trim();

  if (action === 'ADD') {
    const addMatch = /^(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?/i.exec(body);
    const added = body.slice(addMatch?.[0].length || 0).trim();
    if (isTableConstraint(added)) parseTableConstraint(build, added, warnings);
    else parseColumnDefinition(build, added, warnings);
    return;
  }

  if (action === 'ALTER' || action === 'MODIFY') {
    // ALTER COLUMN ... SET NOT NULL / SET DEFAULT — نحدّث الحالة إن أمكن
    const colMatch = /^(?:COLUMN\s+)?/i.exec(body);
    const ident = readIdentifier(body.slice(colMatch?.[0].length || 0));
    if (!ident) return;
    const col = build.columns.find(c => c.name.toLowerCase() === ident.name.toLowerCase());
    if (!col) return;
    if (/\bSET\s+NOT\s+NULL\b/i.test(body)) col.isNullable = false;
    if (/\bDROP\s+NOT\s+NULL\b/i.test(body)) col.isNullable = true;
    const def = findClause(body, /\bSET\s+DEFAULT\b/i);
    if (def) col.defaultValue = def;
    return;
  }

  if (action === 'DROP') {
    const col = /^(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?/i.exec(body);
    const ident = readIdentifier(body.slice(col?.[0].length || 0));
    if (!ident) return;
    const exists = build.columns.some(c => c.name.toLowerCase() === ident.name.toLowerCase());
    if (exists) {
      // تعديل مؤجل: الحذف الفعلي يتم بعد اكتمال القراءة كي لا نكسر FK لاحقاً
      warnings.push({ line: alter.line, message: `حذف العمود "${ident.name}" من "${build.name}" غير مطبّق تلقائياً — عدّل السكيما يدوياً.` });
    }
  }
}

// ---------------------------------------------------------------------------
// نقطة الدخول
// ---------------------------------------------------------------------------

export function parseSqlSchema(sql: string, options?: { maxTables?: number }): ParsedSqlSchema {
  const source = (sql || '').replace(/\r\n?/g, '\n');
  const dialect = detectSqlDialect(source);
  const issues: SqlParseIssue[] = [];
  const localWarnings: { line: number; message: string }[] = [];
  const errors: string[] = [];

  const masked = stripSqlComments(source);
  const normalized = normalizeSqlDelimiters(masked);
  const triggerExtraction = extractSqlTriggers(normalized);
  const statements = splitSqlStatements(triggerExtraction.text);
  const builds = new Map<string, TableBuild>();
  const pendingIndexes: PendingIndex[] = [];
  const pendingAlters: PendingAlter[] = [];
  const allRelations: ErRelationship[] = [];
  const views: ErView[] = [];
  const triggers: ErTrigger[] = [];

  for (const extracted of triggerExtraction.triggers) {
    const trigger = parseTriggerDefinition(extracted.rawSql, extracted.line);
    if (triggers.some(existing => existing.name.toLowerCase() === trigger.name.toLowerCase())) {
      issues.push({
        line: extracted.line,
        statementIndex: 0,
        severity: 'warning',
        message: `Trigger مكرر "${trigger.name}" — تم تجاهل التعريف الثاني.`,
        excerpt: extracted.rawSql.slice(0, 120),
      });
      continue;
    }
    triggers.push(trigger);
    if (/EXECUTE\s+(?:FUNCTION|PROCEDURE)/i.test(trigger.rawSql)) {
      issues.push({
        line: extracted.line,
        statementIndex: 0,
        severity: 'warning',
        message: `Trigger "${trigger.name}" يعتمد على دالة — الترحيل المولَّد يحتوي تعريف Trigger فقط؛ أضف CREATE FUNCTION يدوياً.`,
        excerpt: extracted.rawSql.slice(0, 120),
      });
    }
  }

  for (const statement of statements) {
    const text = statement.text.trim();
    const line = statement.line;
    const upper = text.toUpperCase();

    if (!text || /^(SET|USE|BEGIN|COMMIT|START TRANSACTION|LOCK TABLES|UNLOCK TABLES|DELIMITER|INSERT|UPDATE|DELETE|DROP)\b/i.test(text)) {
      continue;
    }
    if (/^CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\b/i.test(text)) {
      const view = parseViewStatement(text, line);
      if (!view) {
        issues.push({ line, statementIndex: statement.index, severity: 'error', message: 'تعريف CREATE VIEW غير مفهوم — تحقّق من الصيغة AS SELECT.', excerpt: text.slice(0, 120) });
      } else if (views.some(existing => existing.name.toLowerCase() === view.name.toLowerCase())) {
        issues.push({ line, statementIndex: statement.index, severity: 'warning', message: `عرض مكرر "${view.name}" — تم تجاهل التعريف الثاني.`, excerpt: text.slice(0, 120) });
      } else {
        views.push(view);
      }
      continue;
    }
    if (/^CREATE\s+(?:DEFINER\s*=\s*\S+\s+)?TRIGGER\b/i.test(text)) {
      issues.push({ line, statementIndex: statement.index, severity: 'warning', message: 'تعذّر استخراج تعريف Trigger منفصل — تحقّق من الفاصلة المنقوطة أو DELIMITER.', excerpt: text.slice(0, 120) });
      continue;
    }
    if (/^CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\b/i.test(text)) {
      issues.push({ line, statementIndex: statement.index, severity: 'warning', message: 'CREATE FUNCTION/PROCEDURE غير مدعوم — أضف تعريف الدالة يدوياً عند استخدام Triggers في PostgreSQL.', excerpt: text.slice(0, 120) });
      continue;
    }
    if (/^CREATE\s+(?:UNIQUE\s+)?INDEX\b/i.test(text)) {
      parseCreateIndex(text, pendingIndexes, line, localWarnings);
      continue;
    }
    if (/^ALTER\s+TABLE\b/i.test(text)) {
      parseAlterTable(text, pendingAlters, line);
      continue;
    }
    if (!/^CREATE\s+(?:TEMPORARY\s+|UNLOGGED\s+)?TABLE\b/i.test(text)) {
      if (/^CREATE\b/.test(upper)) {
        issues.push({ line, statementIndex: statement.index, severity: 'warning', message: 'عبارة CREATE غير معروفة — تم تجاهلها.', excerpt: text.slice(0, 120) });
      }
      continue;
    }

    const tableMatch = /^CREATE\s+(?:TEMPORARY\s+|UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/i.exec(text);
    if (!tableMatch) continue;
    const after = text.slice(tableMatch[0].length);
    const tableIdent = readQualifiedIdentifier(after);
    if (!tableIdent) {
      issues.push({ line, statementIndex: statement.index, severity: 'error', message: 'اسم جدول غير صالح.', excerpt: text.slice(0, 120) });
      continue;
    }
    const rest = after.slice(tableIdent.end).trim();
    if (!rest.startsWith('(')) {
      issues.push({ line, statementIndex: statement.index, severity: 'warning', message: `CREATE TABLE ... AS SELECT غير مدعوم (${tableIdent.name}).`, excerpt: text.slice(0, 120) });
      continue;
    }
    const close = findMatchingParen(rest, 0);
    if (close < 0) {
      issues.push({ line, statementIndex: statement.index, severity: 'error', message: `قوس CREATE TABLE غير مغلق في "${tableIdent.name}".`, excerpt: text.slice(0, 120) });
      continue;
    }
    const body = rest.slice(1, close);
    const tableName = tableIdent.name;
    if (builds.has(tableName.toLowerCase())) {
      issues.push({ line, statementIndex: statement.index, severity: 'warning', message: `جدول مكرر "${tableName}" — تم تجاهل التعريف الثاني.`, excerpt: text.slice(0, 120) });
      continue;
    }
    const build: TableBuild = {
      id: tableName,
      name: tableName,
      columns: [],
      indexes: [],
      tableChecks: [],
      _indexNames: new Set<string>(),
      _pendingRelations: [],
    };
    parseTableBody(build, body, localWarnings);
    builds.set(tableName.toLowerCase(), build);
  }

  // فهارس CREATEd قبل/بعد الجدول
  for (const pending of pendingIndexes) {
    applyPendingIndex(pending, builds, localWarnings);
  }
  // ALTER TABLE بعد اكتمال كل الجداول
  for (const alter of pendingAlters) {
    applyAlter(alter, builds, localWarnings);
  }

  const tables: ErTable[] = [];
  for (const build of builds.values()) {
    const { _indexNames, _pendingRelations, ...table } = build;
    void _indexNames;
    table.indexes = table.indexes ?? [];
    table.tableChecks = table.tableChecks ?? [];
    if (table.columns.length === 0) {
      issues.push({ line: 1, statementIndex: 0, severity: 'warning', message: `الجدول "${table.name}" بلا أعمدة — سيُستبعد.` });
      continue;
    }
    tables.push(table);
    allRelations.push(..._pendingRelations);
  }

  // التحقق من العلاقات: الأب والعمود المرجعي
  const byName = new Map(tables.map(t => [t.name.toLowerCase(), t]));
  const validRelations: ErRelationship[] = [];
  for (const rel of allRelations) {
    const parent = byName.get(rel.sourceTable.toLowerCase());
    const child = byName.get(rel.targetTable.toLowerCase());
    if (!parent || !child) {
      issues.push({ line: 1, statementIndex: 0, severity: 'warning', message: `علاقة تشير لجدول غير موجود: ${rel.sourceTable} → ${rel.targetTable}` });
      continue;
    }
    if (rel.sourceColumn && !parent.columns.some(c => c.name.toLowerCase() === rel.sourceColumn!.toLowerCase())) {
      issues.push({ line: 1, statementIndex: 0, severity: 'warning', message: `عمود مرجعي غير موجود: ${parent.name}.${rel.sourceColumn}` });
    }
    validRelations.push(rel);
  }

  const maxTables = options?.maxTables ?? 200;
  if (tables.length > maxTables) {
    errors.push(`عدد الجداول ${tables.length} يتجاوز الحد الأقصى ${maxTables}.`);
  }
  if (tables.length === 0) {
    errors.push('لم يُعثر على أي جدول قابل للتحليل في SQL — تأكد من وجود CREATE TABLE صالح.');
  }

  for (const issue of localWarnings) {
    issues.push({
      line: issue.line || 1,
      statementIndex: 0,
      severity: 'warning',
      message: issue.message,
    });
  }
  for (const conflict of dialect.conflicts) {
    issues.push({ line: 1, statementIndex: 0, severity: 'warning', message: conflict });
  }

  const model: ErModel = {
    diagramNames: ['SQL import'],
    tables,
    relationships: validRelations,
    warnings: [
      ...issues.filter(issue => issue.severity === 'warning').map(issue => issue.message),
      ...(dialect.needsConfirmation ? ['درجة ثقة اكتشاف اللهجة منخفضة — يلزم تأكيد المستخدم.'] : []),
    ],
    ...(views.length > 0 ? { views } : {}),
    ...(triggers.length > 0 ? { triggers } : {}),
  };

  const columnCount = tables.reduce((sum, table) => sum + table.columns.length, 0);
  const indexCount = tables.reduce((sum, table) => sum + (table.indexes?.length || 0), 0);

  return {
    ok: errors.length === 0 && tables.length > 0,
    model,
    dialect,
    issues,
    errors,
    stats: {
      statements: statements.length,
      tables: tables.length,
      columns: columnCount,
      relationships: validRelations.length,
      indexes: indexCount,
      views: views.length,
      triggers: triggers.length,
    },
    normalizedSql: triggerExtraction.text,
  };
}

/** واجهة مختصرة للمعاينة قبل التوليد. */
export function summarizeParsedSchema(parsed: ParsedSqlSchema): {
  dialect: SqlBackendDialect;
  confidence: number;
  tables: Array<{
    name: string;
    columns: Array<{ name: string; type: string; primaryKey: boolean; nullable: boolean; unique: boolean; foreignKey: boolean }>;
    indexes: number;
    relations: number;
  }>;
  views: Array<{ name: string; columns: string[]; query: string }>;
  triggers: Array<{ name: string; table?: string; timing?: string; event?: string }>;
} {
  return {
    dialect: parsed.dialect.dialect,
    confidence: parsed.dialect.confidence,
    views: (parsed.model.views ?? []).map(view => ({
      name: view.name,
      columns: view.columns ?? [],
      query: view.query,
    })),
    triggers: (parsed.model.triggers ?? []).map(trigger => ({
      name: trigger.name,
      table: trigger.table,
      timing: trigger.timing,
      event: trigger.event,
    })),
    tables: parsed.model.tables.map(table => ({
      name: table.name,
      columns: table.columns.map(col => ({
        name: col.name,
        type: col.type,
        primaryKey: col.isPrimaryKey,
        nullable: col.isNullable,
        unique: col.isUnique === true,
        foreignKey: col.isForeignKey === true,
      })),
      indexes: table.indexes?.length || 0,
      relations: parsed.model.relationships.filter(rel => rel.targetTable === table.name).length,
    })),
  };
}
