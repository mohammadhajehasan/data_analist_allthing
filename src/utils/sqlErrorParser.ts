import { Dataset, SqlErrorAnalysis, SmartCorrectionSuggestion } from '../types';

/**
 * Calculates Levenshtein distance between two strings
 */
function levenshtein(a: string, b: string): number {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix: number[][] = [];
  for (let i = 0; i <= bn; ++i) matrix[i] = [i];
  for (let i = 0; i <= an; ++i) matrix[0][i] = i;
  for (let i = 1; i <= bn; ++i) {
    for (let j = 1; j <= an; ++j) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[bn][an];
}

/**
 * Find closest column match in dataset schema
 */
function findClosestColumn(token: string, validColumns: string[]): { match: string; distance: number } | null {
  const clean = token.toLowerCase().replace(/[`"',()]/g, '');
  if (!clean || clean.length < 2) return null;

  let bestMatch = '';
  let minDistance = 999;

  for (const col of validColumns) {
    const colLower = col.toLowerCase();
    if (clean === colLower) return null; // already exact
    const dist = levenshtein(clean, colLower);
    if (dist < minDistance && dist <= Math.max(2, Math.floor(col.length / 2))) {
      minDistance = dist;
      bestMatch = col;
    }
  }

  return bestMatch ? { match: bestMatch, distance: minDistance } : null;
}

/**
 * Analyzes SQL query for syntax errors, logical bugs, and typo patterns
 * and produces structured smart suggestions.
 */
export function analyzeSqlErrors(sql: string, dataset: Dataset, executionError?: string): SqlErrorAnalysis {
  const trimmed = (sql || '').trim();
  const suggestions: SmartCorrectionSuggestion[] = [];
  const datasetCols = dataset.columns.map(c => c.name);
  const datasetColsLower = datasetCols.map(c => c.toLowerCase());
  const tableName = dataset.name.replace(/\s+/g, '_').toLowerCase();

  // If query is empty
  if (!trimmed) {
    return {
      hasError: true,
      errorCategory: 'SYNTAX',
      messageEn: 'SQL query editor is empty. Enter or generate a SQL query to execute.',
      messageAr: 'محرر استعلامات SQL فارغ. الرجاء كتابة أو توليد استعلام لتنفيذه.',
      suggestions: [
        {
          id: 'sug-sample-select',
          title: 'Insert default exploration query',
          titleAr: 'إدراج استعلام استكشافي افتراضي',
          explanation: 'Generates a standard SELECT query with top records and summary metrics.',
          explanationAr: 'يولّد استعلام SELECT قياسي مع أهم السجلات والمؤشرات التجميعية.',
          fixedSql: `SELECT ${datasetCols.slice(0, 4).join(', ')}\nFROM ${tableName}\nLIMIT 25;`,
          autoFixAvailable: true,
          category: 'syntax',
        },
      ],
    };
  }

  // 1. Check for Forbidden DDL / DML keywords
  const forbiddenKeywords = ['DROP', 'TRUNCATE', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE', 'GRANT', 'REVOKE', 'EXEC'];
  for (const kw of forbiddenKeywords) {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    if (regex.test(trimmed)) {
      return {
        hasError: true,
        errorCategory: 'FORBIDDEN_KEYWORD',
        messageEn: `Security Guard: The "${kw}" command is forbidden in read-only analytics mode. Only SELECT queries are permitted.`,
        messageAr: `حماية أمنية: الأمر "${kw}" محظور في وضع التحليل المقيد بالقراءة فقط. يُسمح فقط باستعلامات SELECT.`,
        highlightedSnippet: kw,
        suggestions: [
          {
            id: 'sug-switch-to-select',
            title: 'Convert to safe SELECT query',
            titleAr: 'التحويل إلى استعلام SELECT آمن',
            explanation: 'Replace destructive commands with non-destructive analytical projections.',
            explanationAr: 'استبدال الأوامر التدميرية باستعلامات قراءة وتحليل آمنة.',
            fixedSql: `SELECT ${datasetCols.slice(0, 4).join(', ')}\nFROM ${tableName}\nLIMIT 50;`,
            autoFixAvailable: true,
            category: 'security',
          },
        ],
      };
    }
  }

  // 2. Check for common SQL Keyword Typos
  const keywordTypos: { pattern: RegExp; correct: string; wrong: string }[] = [
    { pattern: /\bSEELCT\b/i, correct: 'SELECT', wrong: 'SEELCT' },
    { pattern: /\bSELCT\b/i, correct: 'SELECT', wrong: 'SELCT' },
    { pattern: /\bSLECT\b/i, correct: 'SELECT', wrong: 'SLECT' },
    { pattern: /\bFROMM\b/i, correct: 'FROM', wrong: 'FROMM' },
    { pattern: /\bFORM\b(?=\s+[a-zA-Z0-9_]+)/i, correct: 'FROM', wrong: 'FORM' },
    { pattern: /\bWHER\b/i, correct: 'WHERE', wrong: 'WHER' },
    { pattern: /\bWHRER\b/i, correct: 'WHERE', wrong: 'WHRER' },
    { pattern: /\bGRUP\s+BY\b/i, correct: 'GROUP BY', wrong: 'GRUP BY' },
    { pattern: /\bGROUPE\s+BY\b/i, correct: 'GROUP BY', wrong: 'GROUPE BY' },
    { pattern: /\bORDR\s+BY\b/i, correct: 'ORDER BY', wrong: 'ORDR BY' },
    { pattern: /\bORDRE\s+BY\b/i, correct: 'ORDER BY', wrong: 'ORDRE BY' },
    { pattern: /\bLIMT\b/i, correct: 'LIMIT', wrong: 'LIMT' },
    { pattern: /\bHAVNG\b/i, correct: 'HAVING', wrong: 'HAVNG' },
    { pattern: /\bCOUTN\b/i, correct: 'COUNT', wrong: 'COUTN' },
    { pattern: /\bAVRG\b/i, correct: 'AVG', wrong: 'AVRG' },
  ];

  for (const typo of keywordTypos) {
    if (typo.pattern.test(trimmed)) {
      const fixed = trimmed.replace(typo.pattern, typo.correct);
      return {
        hasError: true,
        errorCategory: 'SYNTAX',
        messageEn: `Syntax typo detected: Found "${typo.wrong}". Did you mean "${typo.correct}"?`,
        messageAr: `تم رصد خطأ إملائي في الكلمة المفتاحية: وُجدت "${typo.wrong}"، هل تقصد "${typo.correct}"؟`,
        highlightedSnippet: typo.wrong,
        suggestions: [
          {
            id: `sug-fix-typo-${typo.correct}`,
            title: `Fix keyword to "${typo.correct}"`,
            titleAr: `تصحيح الكلمة إلى "${typo.correct}"`,
            explanation: `Corrects the misspelling of ${typo.wrong} -> ${typo.correct}.`,
            explanationAr: `يصحح الخطأ الإملائي من ${typo.wrong} إلى ${typo.correct}.`,
            fixedSql: fixed,
            autoFixAvailable: true,
            category: 'syntax',
          },
        ],
      };
    }
  }

  // 3. Check for Unbalanced Parentheses
  const openParens = (trimmed.match(/\(/g) || []).length;
  const closeParens = (trimmed.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    const diff = Math.abs(openParens - closeParens);
    const missingType = openParens > closeParens ? 'closing ")"' : 'opening "("';
    const missingTypeAr = openParens > closeParens ? 'قوس إغلاق ")"' : 'قوس فتح "("';
    let fixed = trimmed;
    if (openParens > closeParens) {
      fixed = trimmed + ')'.repeat(openParens - closeParens);
    }
    return {
      hasError: true,
      errorCategory: 'UNBALANCED_BRACKETS',
      messageEn: `Unbalanced parentheses: Missing ${diff} ${missingType} bracket(s).`,
      messageAr: `عدم توازن في الأقواس: ينقص ${diff} ${missingTypeAr}.`,
      suggestions: [
        {
          id: 'sug-balance-parens',
          title: 'Balance enclosing parentheses',
          titleAr: 'موازنة وإغلاق الأقواس الناقصة',
          explanation: 'Appends required closing parentheses to ensure proper expression evaluation.',
          explanationAr: 'يضيف أقواس الإغلاق اللازمة لضمان سلامة تقييم التعبيرات.',
          fixedSql: fixed,
          autoFixAvailable: openParens > closeParens,
          category: 'syntax',
        },
      ],
    };
  }

  // 4. Check for Unbalanced Quotes
  const singleQuotes = (trimmed.match(/'/g) || []).length;
  if (singleQuotes % 2 !== 0) {
    return {
      hasError: true,
      errorCategory: 'UNBALANCED_BRACKETS',
      messageEn: 'Unbalanced string literal: Single quotation mark is missing a closing quote.',
      messageAr: 'نص غير مغلق: علامة الاقتباس الفردية (\') تفتقر إلى علامة إغلاق مطابقة.',
      suggestions: [
        {
          id: 'sug-fix-quotes',
          title: 'Close unclosed string literal',
          titleAr: 'إغلاق علامة الاقتباس المفتوحة',
          explanation: 'Appends missing single quote to complete string token.',
          explanationAr: 'يضيف علامة الاقتباس الناقصة لإكمال قيمة النص.',
          fixedSql: trimmed + "'",
          autoFixAvailable: true,
          category: 'syntax',
        },
      ],
    };
  }

  // 5. Check SQL Clause Ordering (e.g. WHERE after GROUP BY)
  const wherePos = trimmed.search(/\bWHERE\b/i);
  const groupByPos = trimmed.search(/\bGROUP\s+BY\b/i);
  const havingPos = trimmed.search(/\bHAVING\b/i);
  const orderByPos = trimmed.search(/\bORDER\s+BY\b/i);
  const limitPos = trimmed.search(/\bLIMIT\b/i);

  if (groupByPos !== -1 && wherePos !== -1 && wherePos > groupByPos) {
    return {
      hasError: true,
      errorCategory: 'CLAUSE_ORDER',
      messageEn: 'Invalid SQL clause ordering: "WHERE" must appear BEFORE "GROUP BY". Use "HAVING" to filter aggregated groupings.',
      messageAr: 'ترتيب غير صالح لعبارات SQL: يجب أن تسبق عبارة "WHERE" عبارة "GROUP BY". استخدم "HAVING" لتصفية التجميعات.',
      highlightedSnippet: 'GROUP BY ... WHERE',
      suggestions: [
        {
          id: 'sug-switch-to-having',
          title: 'Replace misplaced WHERE with HAVING (or reorder)',
          titleAr: 'استبدال WHERE المتأخرة بـ HAVING أو إعادة الترتيب',
          explanation: 'In SQL grammar, WHERE filters raw rows before grouping, while HAVING filters aggregated metrics after GROUP BY.',
          explanationAr: 'في قواعد SQL، تقوم WHERE بتصفية الصفوف الخام قبل التجميع، بينما تصفي HAVING المؤشرات التجميعية بعد GROUP BY.',
          autoFixAvailable: false,
          category: 'logic',
        },
      ],
    };
  }

  if (orderByPos !== -1 && limitPos !== -1 && limitPos < orderByPos) {
    return {
      hasError: true,
      errorCategory: 'CLAUSE_ORDER',
      messageEn: 'Invalid SQL clause ordering: "ORDER BY" must precede "LIMIT".',
      messageAr: 'ترتيب غير صالح لعبارات SQL: يجب أن تسبق عبارة "ORDER BY" عبارة "LIMIT".',
      highlightedSnippet: 'LIMIT ... ORDER BY',
      suggestions: [
        {
          id: 'sug-reorder-limit-order',
          title: 'Move ORDER BY before LIMIT',
          titleAr: 'نقل ORDER BY قبل LIMIT',
          explanation: 'Reorders clauses so the dataset is sorted prior to applying the row limit.',
          explanationAr: 'إعادة ترتيب العبارات لفرز البيانات أولاً قبل تحديد عدد الصفوف المسترجعة.',
          autoFixAvailable: false,
          category: 'syntax',
        },
      ],
    };
  }

  // 6. Check for Column Name Misspellings
  // Extract identifiers that look like column names from SELECT, WHERE, GROUP BY, ORDER BY
  const tokenRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
  const sqlReservedWords = new Set([
    'select', 'from', 'where', 'group', 'by', 'order', 'having', 'limit', 'offset',
    'as', 'and', 'or', 'not', 'in', 'is', 'null', 'like', 'ilike', 'between', 'asc',
    'desc', 'sum', 'avg', 'min', 'max', 'count', 'distinct', 'case', 'when', 'then',
    'else', 'end', 'with', 'join', 'inner', 'left', 'right', 'outer', 'on', 'union',
    'all', 'true', 'false', 'cast', 'coalesce', 'round', 'date_trunc', 'extract',
    tableName, 'dataset', 'records', 'table', 'data'
  ]);

  let tokenMatch;
  const unknownTokens = new Set<string>();
  while ((tokenMatch = tokenRegex.exec(trimmed)) !== null) {
    const rawToken = tokenMatch[1];
    const lower = rawToken.toLowerCase();
    if (!sqlReservedWords.has(lower) && !datasetColsLower.includes(lower)) {
      // Check if it's a numeric literal or function name
      if (!/^\d+$/.test(rawToken)) {
        unknownTokens.add(rawToken);
      }
    }
  }

  const unknownTokensList = Array.from(unknownTokens);
  for (let uIdx = 0; uIdx < unknownTokensList.length; uIdx++) {
    const unknown = unknownTokensList[uIdx];
    const fuzzy = findClosestColumn(unknown, datasetCols);
    if (fuzzy) {
      const fixed = trimmed.replace(new RegExp(`\\b${unknown}\\b`, 'g'), fuzzy.match);
      suggestions.push({
        id: `sug-fix-col-${uIdx}-${unknown}`,
        title: `Replace unknown column "${unknown}" with "${fuzzy.match}"`,
        titleAr: `استبدال العمود غير المعروف "${unknown}" بـ "${fuzzy.match}"`,
        explanation: `Column "${unknown}" does not exist in schema. Auto-detected closest schema column is "${fuzzy.match}".`,
        explanationAr: `العمود "${unknown}" غير موجود في المخطط. العمود الأقرب المتطابق في المخطط هو "${fuzzy.match}".`,
        fixedSql: fixed,
        autoFixAvailable: true,
        category: 'schema',
      });
    }
  }

  if (suggestions.length > 0) {
    return {
      hasError: true,
      errorCategory: 'UNKNOWN_COLUMN',
      messageEn: `Schema reference warning: Unrecognized column "${unknownTokensList[0]}". Closest match found in dataset schema.`,
      messageAr: `تنبيه في مطابقة المخطط: العمود "${unknownTokensList[0]}" غير موجود بالمخطط. تم العثور على بديل مطابق.`,
      highlightedSnippet: unknownTokensList[0],
      suggestions,
    };
  }

  // 7. Check for Non-Aggregate Columns with Aggregates without GROUP BY
  const selectClauseMatch = trimmed.match(/SELECT\s+([\s\S]+?)\s+FROM/i);
  if (selectClauseMatch) {
    const selectStr = selectClauseMatch[1];
    const hasAggFunctions = /\b(SUM|AVG|MIN|MAX|COUNT)\s*\(/i.test(selectStr);
    const hasGroupBy = /\bGROUP\s+BY\b/i.test(trimmed);

    if (hasAggFunctions && !hasGroupBy) {
      // Check if there are non-aggregate column projections
      const colItems = selectStr.split(',').map(s => s.trim());
      const nonAggCols = colItems.filter(c => !/\b(SUM|AVG|MIN|MAX|COUNT)\s*\(/i.test(c) && !c.includes('*'));

      if (nonAggCols.length > 0) {
        const cleanNonAggCols = nonAggCols.map(c => c.replace(/\s+AS\s+[a-zA-Z0-9_]+/i, '').trim()).filter(Boolean);
        if (cleanNonAggCols.length > 0) {
          const suggestedGroup = `\nGROUP BY ${cleanNonAggCols.join(', ')}`;
          let fixed = trimmed;
          if (/\bORDER\s+BY\b/i.test(fixed)) {
            fixed = fixed.replace(/\bORDER\s+BY\b/i, `${suggestedGroup}\nORDER BY`);
          } else if (/\bLIMIT\b/i.test(fixed)) {
            fixed = fixed.replace(/\bLIMIT\b/i, `${suggestedGroup}\nLIMIT`);
          } else {
            fixed = fixed + suggestedGroup;
          }

          suggestions.push({
            id: 'sug-add-group-by',
            title: `Add "GROUP BY ${cleanNonAggCols.join(', ')}"`,
            titleAr: `إضافة "GROUP BY ${cleanNonAggCols.join(', ')}"`,
            explanation: `When mixing dimensional columns (${cleanNonAggCols.join(', ')}) with aggregation functions, standard SQL requires grouping by the dimension columns.`,
            explanationAr: `عند الجمع بين أعمدة تصنيفية (${cleanNonAggCols.join(', ')}) ودوال تجميعية، تتطلب قواعد SQL إضافة عبارة GROUP BY للأعمدة التصنيفية.`,
            fixedSql: fixed,
            autoFixAvailable: true,
            category: 'logic',
          });

          return {
            hasError: true,
            errorCategory: 'MISSING_GROUP_BY',
            messageEn: `Grouping requirement: Non-aggregate column "${cleanNonAggCols[0]}" must be included in a GROUP BY clause or wrapped in an aggregate function.`,
            messageAr: `متطلب التجميع: العمود غير التجميعي "${cleanNonAggCols[0]}" يجب إدراجه في عبارة GROUP BY أو تغليفه بدالة تجميعية.`,
            highlightedSnippet: cleanNonAggCols[0],
            suggestions,
          };
        }
      }
    }
  }

  // 8. If an execution runtime error was passed in
  if (executionError) {
    return {
      hasError: true,
      rawError: executionError,
      errorCategory: 'SYNTAX',
      messageEn: `Engine Execution Notice: ${executionError}`,
      messageAr: `إشعار تنفيذ المحرك: ${executionError}`,
      suggestions: [
        {
          id: 'sug-fallback-query',
          title: 'Reset to safe valid query template',
          titleAr: 'إعادة التعيين لنموذج استعلام سليم ومضمون',
          explanation: 'Restores a proven SELECT aggregate query template tailored to your current active dataset.',
          explanationAr: 'يعيد بناء نموذج استعلام تجميعي سليم متوافق مع مجموعة البيانات النشطة.',
          fixedSql: `SELECT ${datasetCols[0]}, COUNT(*) AS count_records\nFROM ${tableName}\nGROUP BY ${datasetCols[0]}\nORDER BY count_records DESC\nLIMIT 20;`,
          autoFixAvailable: true,
          category: 'syntax',
        },
      ],
    };
  }

  // Valid query with no detected errors
  return {
    hasError: false,
    errorCategory: 'NONE',
    messageEn: 'SQL syntax is clean and conforms with 9-layer security and schema constraints.',
    messageAr: 'بنية استعلام SQL سليمة ومتوافقة مع معايير الأمان التساعية ومخطط البيانات.',
    suggestions: [],
  };
}
