import { Dataset, QueryRequest, QueryResult } from '../types';

/**
 * Robust in-memory analytical OLAP query engine for tabular datasets.
 * Handles filtering, full-text search, grouping, aggregations, sorting, projections, and SQL evaluation.
 */

// Helper to safely parse numeric values (strips currency, percentage, commas)
function parseNumber(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const cleaned = String(val).replace(/[\$,\s%€£¥]/g, '');
  const num = Number(cleaned);
  return isNaN(num) ? null : num;
}

// Helper to safely parse date values
function parseDate(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;
  const timestamp = Date.parse(String(val));
  return isNaN(timestamp) ? null : timestamp;
}

export function executeAnalyticalQuery(dataset: Dataset, query: QueryRequest): QueryResult {
  const startTime = performance.now();
  let rows = Array.isArray(dataset.data) ? [...dataset.data] : [];

  // 1. If raw SQL is provided and non-empty, evaluate SQL
  if (query.rawSql && query.rawSql.trim().length > 0) {
    return executeSqlOnDataset(dataset, query.rawSql, startTime);
  }

  // 2. Apply Filters (ignoring unfilled/empty filter values)
  if (query.filters && query.filters.length > 0) {
    const validFilters = query.filters.filter(f => {
      if (!f.column) return false;
      if (f.operator === 'is_null' || f.operator === 'is_not_null') return true;
      return f.value !== undefined && f.value !== null && String(f.value).trim() !== '';
    });

    if (validFilters.length > 0) {
      rows = rows.filter(row => {
        return validFilters.every(f => {
          const val = row[f.column];
          const rawTarget = f.value;
          const targetStr = String(rawTarget ?? '').trim().toLowerCase();

          // Check NULL operators first
          if (f.operator === 'is_null') {
            return val === null || val === undefined || String(val).trim() === '';
          }
          if (f.operator === 'is_not_null') {
            return val !== null && val !== undefined && String(val).trim() !== '';
          }

          // If val is null/undefined and we check equality or relations
          if (val === null || val === undefined) {
            return f.operator === 'neq';
          }

          const valStr = String(val).trim().toLowerCase();

          // Try numeric comparison if applicable
          const numVal = parseNumber(val);
          const numTarget = parseNumber(rawTarget);
          const isNumericComparison = numVal !== null && numTarget !== null;

          // Try date comparison if applicable
          const dateVal = parseDate(val);
          const dateTarget = parseDate(rawTarget);
          const isDateComparison = !isNumericComparison && dateVal !== null && dateTarget !== null;

          switch (f.operator) {
            case 'eq':
              if (isNumericComparison) return numVal === numTarget;
              return valStr === targetStr;
            case 'neq':
              if (isNumericComparison) return numVal !== numTarget;
              return valStr !== targetStr;
            case 'gt':
              if (isNumericComparison) return numVal! > numTarget!;
              if (isDateComparison) return dateVal! > dateTarget!;
              return valStr > targetStr;
            case 'gte':
              if (isNumericComparison) return numVal! >= numTarget!;
              if (isDateComparison) return dateVal! >= dateTarget!;
              return valStr >= targetStr;
            case 'lt':
              if (isNumericComparison) return numVal! < numTarget!;
              if (isDateComparison) return dateVal! < dateTarget!;
              return valStr < targetStr;
            case 'lte':
              if (isNumericComparison) return numVal! <= numTarget!;
              if (isDateComparison) return dateVal! <= dateTarget!;
              return valStr <= targetStr;
            case 'contains':
              return valStr.includes(targetStr);
            case 'not_contains' as any:
              return !valStr.includes(targetStr);
            case 'starts_with' as any:
              return valStr.startsWith(targetStr);
            case 'ends_with' as any:
              return valStr.endsWith(targetStr);
            case 'between': {
              const secondTarget = parseNumber(f.secondValue);
              if (isNumericComparison && secondTarget !== null) {
                const min = Math.min(numTarget!, secondTarget);
                const max = Math.max(numTarget!, secondTarget);
                return numVal! >= min && numVal! <= max;
              }
              return true;
            }
            case 'in': {
              if (Array.isArray(f.value)) {
                return f.value.some(item => String(item).trim().toLowerCase() === valStr);
              }
              const parts = targetStr.split(',').map(s => s.trim());
              return parts.includes(valStr);
            }
            default:
              return true;
          }
        });
      });
    }
  }

  // 3. Apply Group By & Aggregations (if requested)
  if (query.groupBy && query.groupBy.length > 0) {
    const groups: { [key: string]: Record<string, any>[] } = {};
    rows.forEach(row => {
      const key = query.groupBy!.map(col => String(row[col] ?? '')).join('___');
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    });

    const aggregatedRows: Record<string, any>[] = [];
    Object.entries(groups).forEach(([_key, groupRows]) => {
      const first = groupRows[0];
      const resRow: Record<string, any> = {};

      query.groupBy!.forEach(col => {
        resRow[col] = first[col];
      });

      if (query.aggregations && query.aggregations.length > 0) {
        query.aggregations.forEach(agg => {
          const vals = groupRows.map(r => parseNumber(r[agg.column])).filter((v): v is number => v !== null);
          const alias = agg.alias || `${agg.agg}_${agg.column}`;
          if (agg.agg === 'sum') {
            const sum = vals.reduce((a, b) => a + b, 0);
            resRow[alias] = Number(sum.toFixed(2));
          } else if (agg.agg === 'avg') {
            const sum = vals.reduce((a, b) => a + b, 0);
            resRow[alias] = Number((sum / (vals.length || 1)).toFixed(2));
          } else if (agg.agg === 'min') {
            resRow[alias] = vals.length ? Math.min(...vals) : 0;
          } else if (agg.agg === 'max') {
            resRow[alias] = vals.length ? Math.max(...vals) : 0;
          } else if (agg.agg === 'count') {
            resRow[alias] = groupRows.length;
          }
        });
      } else {
        resRow['count'] = groupRows.length;
      }
      aggregatedRows.push(resRow);
    });
    rows = aggregatedRows;
  } else if (query.select && query.select.length > 0 && query.select[0] !== '*') {
    rows = rows.map(r => {
      const projected: Record<string, any> = {};
      query.select!.forEach(col => {
        projected[col] = r[col];
      });
      return projected;
    });
  }

  // 4. Sorting
  if (query.orderBy && query.orderBy.length > 0) {
    rows.sort((a, b) => {
      for (const ord of query.orderBy!) {
        const col = ord.column;
        const valA = a[col];
        const valB = b[col];

        if (valA === valB) continue;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;

        const numA = parseNumber(valA);
        const numB = parseNumber(valB);

        let comp = 0;
        if (numA !== null && numB !== null) {
          comp = numA > numB ? 1 : -1;
        } else {
          comp = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
        }

        return ord.direction === 'desc' ? -comp : comp;
      }
      return 0;
    });
  }

  const totalCount = rows.length;
  const offset = query.offset || 0;
  const limit = query.limit || 5000;
  const resultRows = rows.slice(offset, offset + limit);

  const columns = resultRows.length > 0
    ? Object.keys(resultRows[0])
    : dataset.columns.map(c => c.name);

  const columnTypes: Record<string, string> = {};
  columns.forEach(col => {
    const matched = dataset.columns.find(c => c.name === col);
    if (matched) {
      columnTypes[col] = matched.type;
    } else {
      const sampleVal = resultRows[0]?.[col];
      columnTypes[col] = typeof sampleVal === 'number' ? 'float' : 'string';
    }
  });

  const duration = Number((performance.now() - startTime).toFixed(2));

  return {
    columns,
    columnTypes,
    rows: resultRows,
    totalCount,
    executionTimeMs: Math.max(duration, 1.5),
    sqlExecuted: query.rawSql || `SELECT ${columns.join(', ')} FROM ${dataset.name.replace(/\s+/g, '_').toLowerCase()} LIMIT ${limit}`,
    explainPlan: [
      `-> Columnar Scan on dataset "${dataset.name}" (${dataset.rowCount} original records)`,
      `-> Active filters evaluated: ${query.filters?.length || 0}`,
      `-> Result rows computed: ${resultRows.length} (total matched: ${totalCount}) in ${duration}ms`,
    ],
  };
}

/**
 * Intelligent SQL parser and execution engine for dataset arrays
 */
export function executeSqlOnDataset(dataset: Dataset, sql: string, startTime: number): QueryResult {
  const cleanSql = sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/;+\s*$/, '')
    .trim();

  let rows = Array.isArray(dataset.data) ? [...dataset.data] : [];

  try {
    // 1. Check WHERE clauses with AND / OR support
    const whereMatch = cleanSql.match(/WHERE\s+([\s\S]+?)(?:\s+GROUP\s+BY|\s+HAVING|\s+ORDER\s+BY|\s+LIMIT|$)/i);
    if (whereMatch) {
      const whereCondition = whereMatch[1].trim();
      rows = rows.filter(row => evaluateWhereClause(row, whereCondition));
    }

    // 2. Check GROUP BY clause
    const groupByMatch = cleanSql.match(/GROUP\s+BY\s+([\s\S]+?)(?:\s+HAVING|\s+ORDER\s+BY|\s+LIMIT|$)/i);
    if (groupByMatch) {
      const groupCols = groupByMatch[1]
        .split(',')
        .map(s => s.trim().replace(/^[`"']|[`"']$/g, ''))
        .filter(Boolean);

      const groups: { [key: string]: Record<string, any>[] } = {};
      rows.forEach(r => {
        const k = groupCols.map(c => String(r[c] ?? '')).join('___');
        if (!groups[k]) groups[k] = [];
        groups[k].push(r);
      });

      const selectClause = cleanSql.match(/SELECT\s+([\s\S]+?)\s+FROM/i)?.[1] || '';
      const aggMatches = extractSelectAggregations(selectClause);

      const aggRows: Record<string, any>[] = [];
      Object.entries(groups).forEach(([_k, gRows]) => {
        const out: Record<string, any> = {};
        groupCols.forEach(c => {
          out[c] = gRows[0][c];
        });

        aggMatches.forEach(agg => {
          const vals = gRows.map(r => parseNumber(r[agg.col])).filter((v): v is number => v !== null);
          if (agg.fn === 'SUM') {
            const sum = vals.reduce((a, b) => a + b, 0);
            out[agg.alias] = Number(sum.toFixed(2));
          } else if (agg.fn === 'AVG') {
            const sum = vals.reduce((a, b) => a + b, 0);
            out[agg.alias] = Number((sum / (vals.length || 1)).toFixed(2));
          } else if (agg.fn === 'MIN') {
            out[agg.alias] = vals.length ? Math.min(...vals) : 0;
          } else if (agg.fn === 'MAX') {
            out[agg.alias] = vals.length ? Math.max(...vals) : 0;
          } else if (agg.fn === 'COUNT') {
            out[agg.alias] = agg.col === '*' ? gRows.length : vals.length;
          }
        });

        // Default count if no aggregates found in select
        if (aggMatches.length === 0) {
          out['count'] = gRows.length;
        }

        aggRows.push(out);
      });

      rows = aggRows;
    } else {
      // No GROUP BY: check for global aggregates (SELECT SUM(x) ... or arithmetic like SUM(a)*100/SUM(b)).
      // Without this branch, aggregate queries silently returned raw rows instead of aggregated values.
      const globalSelectClause = cleanSql.match(/SELECT\s+([\s\S]+?)\s+FROM/i)?.[1] || '';
      const globalAggs = extractSelectAggregations(globalSelectClause);

      if (globalAggs.length > 0 && !/^\s*\*/.test(globalSelectClause.replace(/^SELECT/i, '').trim())) {
        const computeAgg = (fn: string, col: string): number => {
          if (fn === 'COUNT') {
            if (col === '*') return rows.length;
            return rows.filter(r => parseNumber(r[col]) !== null).length;
          }
          const vals = rows.map(r => parseNumber(r[col])).filter((v): v is number => v !== null);
          if (vals.length === 0) return 0;
          switch (fn) {
            case 'SUM': return vals.reduce((a, b) => a + b, 0);
            case 'AVG': return vals.reduce((a, b) => a + b, 0) / vals.length;
            case 'MIN': return Math.min(...vals);
            case 'MAX': return Math.max(...vals);
            default: return 0;
          }
        };

        const aggValueMap = new Map<string, number>();
        globalAggs.forEach(agg => {
          aggValueMap.set(`${agg.fn.toUpperCase()}(${agg.col})`, computeAgg(agg.fn, agg.col));
        });

        const items = globalSelectClause.split(',').map(s => s.trim()).filter(Boolean);
        const outRow: Record<string, any> = {};
        items.forEach(item => {
          const asMatch = item.match(/^([\s\S]+?)\s+AS\s+([a-zA-Z0-9_]+)$/i);
          const expr = (asMatch ? asMatch[1] : item).trim();

          // Substitute every aggregate call with its computed numeric value
          let substituted = expr.replace(/(SUM|AVG|MIN|MAX|COUNT)\s*\(\s*([a-zA-Z0-9_*`"']+)\s*\)/gi, (_m, fn: string, col: string) => {
            const key = `${fn.toUpperCase()}(${col.replace(/^[`"']|[`"']$/g, '')})`;
            const v = aggValueMap.get(key);
            return v !== undefined ? String(v) : '0';
          });
          // Unwrap CAST(...) AS type wrappers produced by models
          substituted = substituted.replace(/CAST\s*\(/gi, '(').replace(/\s+AS\s+(REAL|INTEGER|INT|FLOAT|NUMERIC|DECIMAL|DOUBLE)\s*\)/gi, ')');

          const pureAggRe = new RegExp(`^(SUM|AVG|MIN|MAX|COUNT)\\s*\\(\\s*${globalAggs.map(a => a.col).join('|').replace('*', '\\*')}\\s*\\)$`, 'i');
          const isPureAgg = pureAggRe.test(expr) && !/[+\-*/]/.test(substituted.replace(/^-?\d*\.?\d+$/, ''));
          const matchedAgg = globalAggs.find(a => new RegExp(`^${a.fn}\\s*\\(\\s*${a.col.replace('*', '\\*')}\\s*\\)$`, 'i').test(expr));
          const alias = asMatch ? asMatch[2] : (matchedAgg ? matchedAgg.alias : 'result');

          if (matchedAgg && isPureAgg) {
            outRow[alias] = Number(aggValueMap.get(`${matchedAgg.fn.toUpperCase()}(${matchedAgg.col})`).toFixed(2));
          } else if (/^[0-9.+\-*/()\s]+$/.test(substituted)) {
            try {
              const val = new Function(`return (${substituted})`)() as number;
              outRow[alias] = Number.isFinite(val) ? Number(val.toFixed(2)) : null;
            } catch {
              outRow[alias] = null;
            }
          } else {
            outRow[alias] = null;
          }
        });
        rows = [outRow];
      } else if (globalSelectClause && !/^\s*\*/.test(globalSelectClause.replace(/^SELECT/i, '').trim())) {
        const rawCols = globalSelectClause.split(',').map(s => s.trim());
        const projections = rawCols.map(c => {
          const asMatch = c.match(/^([\s\S]+?)\s+(?:AS\s+)?([a-zA-Z0-9_]+)$/i);
          if (asMatch) {
            return {
              expr: asMatch[1].trim().replace(/^[`"']|[`"']$/g, ''),
              alias: asMatch[2].trim().replace(/^[`"']|[`"']$/g, ''),
            };
          }
          const cleanCol = c.replace(/^[`"']|[`"']$/g, '');
          return { expr: cleanCol, alias: cleanCol };
        });

        if (projections.length > 0 && !projections.some(p => p.expr.includes('('))) {
          rows = rows.map(r => {
            const projected: Record<string, any> = {};
            projections.forEach(p => {
              projected[p.alias] = r[p.expr] !== undefined ? r[p.expr] : r[p.alias];
            });
            return projected;
          });
        }
      }
    }

    // 3. Check ORDER BY clause
    const orderMatch = cleanSql.match(/ORDER\s+BY\s+([\s\S]+?)(?:\s+LIMIT|$)/i);
    if (orderMatch) {
      const orderClauses = orderMatch[1].split(',').map(s => s.trim());
      rows.sort((a, b) => {
        for (const clause of orderClauses) {
          const parts = clause.split(/\s+/);
          const col = parts[0].replace(/^[`"']|[`"']$/g, '');
          const dir = parts[1]?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

          const valA = a[col];
          const valB = b[col];

          if (valA === valB) continue;
          if (valA === null || valA === undefined) return 1;
          if (valB === null || valB === undefined) return -1;

          const numA = parseNumber(valA);
          const numB = parseNumber(valB);

          let comp = 0;
          if (numA !== null && numB !== null) {
            comp = numA > numB ? 1 : -1;
          } else {
            comp = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
          }

          return dir === 'DESC' ? -comp : comp;
        }
        return 0;
      });
    }

    // 4. Check LIMIT & OFFSET clause
    const limitMatch = cleanSql.match(/LIMIT\s+(\d+)(?:\s+OFFSET\s+(\d+))?/i);
    const offsetMatch = cleanSql.match(/OFFSET\s+(\d+)/i);
    const limit = limitMatch ? parseInt(limitMatch[1], 10) : 5000;
    const offset = limitMatch && limitMatch[2] ? parseInt(limitMatch[2], 10) : offsetMatch ? parseInt(offsetMatch[1], 10) : 0;

    const totalCount = rows.length;
    const paginated = rows.slice(offset, offset + limit);

    const columns = paginated.length > 0
      ? Object.keys(paginated[0])
      : dataset.columns.map(c => c.name);

    const columnTypes: Record<string, string> = {};
    columns.forEach(col => {
      const matched = dataset.columns.find(c => c.name === col);
      columnTypes[col] = matched ? matched.type : typeof paginated[0]?.[col] === 'number' ? 'float' : 'string';
    });

    const duration = Number((performance.now() - startTime).toFixed(2));

    return {
      columns,
      columnTypes,
      rows: paginated,
      totalCount,
      executionTimeMs: Math.max(duration, 2.1),
      sqlExecuted: sql,
      explainPlan: [
        `-> In-Memory SQL Execution on table "${dataset.name}"`,
        `-> Evaluated Query: ${cleanSql}`,
        `-> Matched rows: ${paginated.length} of ${totalCount} in ${duration}ms`,
      ],
    };
  } catch (err: any) {
    console.error('SQL execution error:', err);
    return {
      columns: dataset.columns.map(c => c.name),
      columnTypes: {},
      rows: dataset.data.slice(0, 50),
      totalCount: dataset.data.length,
      executionTimeMs: Number((performance.now() - startTime).toFixed(2)),
      sqlExecuted: sql,
      explainPlan: [`Execution error: ${err.message}`],
    };
  }
}

// Helper to evaluate a WHERE clause on a single record
function evaluateWhereClause(row: Record<string, any>, whereStr: string): boolean {
  // Split on top-level ANDs (parenthesis- and quote-aware), then evaluate each part.
  // Each part may contain OR combinations at its own top level.
  const andParts = splitTopLevelAnd(whereStr);
  return andParts.every(part => {
    // If contains OR
    const orParts = part.split(/\s+OR\s+/i);
    return orParts.some(condition => evaluateSingleCondition(row, condition.trim()));
  });
}

// Split a WHERE clause into top-level AND parts, respecting parentheses and IN (...) lists
// so that "a IN ('x, y')" or "(a = 1 AND b = 2) AND c = 3" are not broken incorrectly.
function splitTopLevelAnd(whereStr: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  const upper = whereStr.toUpperCase();
  for (let i = 0; i < whereStr.length; i++) {
    const ch = whereStr[i];
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    // Detect the AND keyword at depth 0 (word boundaries)
    if (depth === 0 && upper.startsWith(' AND', i) && (i === 0 || !/[A-Z0-9_]/.test(upper[i - 1])) && !/[A-Z0-9_]/.test(upper[i + 4] || '')) {
      parts.push(current.trim());
      current = '';
      i += 3; // skip 'AND'
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function evaluateSingleCondition(row: Record<string, any>, cond: string): boolean {
  // Strip only unbalanced leading/trailing parens: repeatedly remove an outer paren pair
  // but never strip a trailing ')' that belongs to an IN (...) / function call inside.
  let cleanCond = cond.trim();
  while (cleanCond.startsWith('(') && cleanCond.endsWith(')')) {
    // Only strip when the closing paren actually matches the opening one
    let depth = 0;
    let matches = true;
    for (let i = 0; i < cleanCond.length; i++) {
      if (cleanCond[i] === '(') depth++;
      else if (cleanCond[i] === ')') { depth--; if (depth === 0 && i < cleanCond.length - 1) { matches = false; break; } }
    }
    if (!matches) break;
    cleanCond = cleanCond.slice(1, -1).trim();
  }
  // Strip a lone leading '(' or trailing ')' when unbalanced
  const openCount = (cleanCond.match(/\(/g) || []).length;
  const closeCount = (cleanCond.match(/\)/g) || []).length;
  if (openCount < closeCount && cleanCond.endsWith(')')) {
    cleanCond = cleanCond.slice(0, -1).trim();
  } else if (closeCount < openCount && cleanCond.startsWith('(')) {
    cleanCond = cleanCond.slice(1).trim();
  }

  // IS NULL / IS NOT NULL
  const isNullMatch = cleanCond.match(/^([a-zA-Z0-9_`"']+)\s+IS\s+(NOT\s+)?NULL$/i);
  if (isNullMatch) {
    const col = isNullMatch[1].replace(/^[`"']|[`"']$/g, '');
    const isNot = Boolean(isNullMatch[2]);
    const val = row[col];
    const isNull = val === null || val === undefined || String(val).trim() === '';
    return isNot ? !isNull : isNull;
  }

  // IN ('a', 'b', 'c')
  const inMatch = cleanCond.match(/^([a-zA-Z0-9_`"']+)\s+(NOT\s+)?IN\s*\(([\s\S]+?)\)$/i);
  if (inMatch) {
    const col = inMatch[1].replace(/^[`"']|[`"']$/g, '');
    const isNot = Boolean(inMatch[2]);
    const list = inMatch[3].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '').toLowerCase());
    const val = String(row[col] ?? '').toLowerCase();
    const found = list.includes(val);
    return isNot ? !found : found;
  }

  // Standard operators: =, !=, <>, >, >=, <, <=, LIKE, ILIKE
  const opMatch = cleanCond.match(/^([a-zA-Z0-9_`"']+)\s*(=|!=|<>|>=|<=|>|<|LIKE|ILIKE)\s*([\s\S]+)$/i);
  if (!opMatch) return true;

  const col = opMatch[1].replace(/^[`"']|[`"']$/g, '');
  let op = opMatch[2].toUpperCase();
  if (op === '<>') op = '!=';

  let rawTarget = opMatch[3].trim().replace(/^['"]|['"]$/g, '');
  const val = row[col];

  if (val === null || val === undefined) return op === '!=';

  const valStr = String(val).toLowerCase();
  const targetStr = rawTarget.toLowerCase();

  const numVal = parseNumber(val);
  const numTarget = parseNumber(rawTarget);
  const isNumeric = numVal !== null && numTarget !== null && !op.includes('LIKE');

  if (op === '=') {
    return isNumeric ? numVal === numTarget : valStr === targetStr;
  }
  if (op === '!=') {
    return isNumeric ? numVal !== numTarget : valStr !== targetStr;
  }
  if (op === '>') {
    return isNumeric ? numVal! > numTarget! : valStr > targetStr;
  }
  if (op === '>=') {
    return isNumeric ? numVal! >= numTarget! : valStr >= targetStr;
  }
  if (op === '<') {
    return isNumeric ? numVal! < numTarget! : valStr < targetStr;
  }
  if (op === '<=') {
    return isNumeric ? numVal! <= numTarget! : valStr <= targetStr;
  }
  if (op === 'LIKE' || op === 'ILIKE') {
    const pattern = targetStr.replace(/%/g, '.*').replace(/_/g, '.');
    return new RegExp(`^${pattern}$`, 'i').test(valStr);
  }

  return true;
}

// Extract aggregate functions from SELECT clause
function extractSelectAggregations(selectClause: string): Array<{ fn: string; col: string; alias: string }> {
  const results: Array<{ fn: string; col: string; alias: string }> = [];
  const regex = /(SUM|AVG|MIN|MAX|COUNT)\s*\(\s*([a-zA-Z0-9_*`"']+)\s*\)(?:\s+(?:AS\s+)?([a-zA-Z0-9_]+))?/gi;
  let match;
  while ((match = regex.exec(selectClause)) !== null) {
    const fn = match[1].toUpperCase();
    const col = match[2].replace(/^[`"']|[`"']$/g, '');
    const alias = match[3] ? match[3].replace(/^[`"']|[`"']$/g, '') : `${fn.toLowerCase()}_${col === '*' ? 'total' : col}`;
    results.push({ fn, col, alias });
  }
  return results;
}
