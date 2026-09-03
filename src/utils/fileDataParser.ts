import * as XLSX from 'xlsx';
import { DatasetColumn } from '../types';

export interface ParsedTableResult {
  tableName: string;
  columns: DatasetColumn[];
  data: Record<string, any>[];
  totalRows: number;
  format: 'excel' | 'csv' | 'json' | 'sql' | 'sqlite';
  sizeBytes: number;
  availableSheetsOrTables?: string[];
}

export interface ParseOptions {
  selectedSheetOrTable?: string;
  maxPreviewRows?: number;
}

/**
 * Infer column type from an array of sample values
 */
export function inferColumnType(values: any[]): DatasetColumn['type'] {
  const nonNull = values.filter(v => v !== null && v !== undefined && v !== '');
  if (nonNull.length === 0) return 'string';

  let numCount = 0;
  let intCount = 0;
  let boolCount = 0;
  let dateCount = 0;

  for (const v of nonNull) {
    if (typeof v === 'boolean' || v === 'true' || v === 'false' || v === 'TRUE' || v === 'FALSE') {
      boolCount++;
      continue;
    }
    
    if (typeof v === 'number') {
      numCount++;
      if (Number.isInteger(v)) intCount++;
      continue;
    }

    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (!isNaN(Number(trimmed)) && trimmed !== '') {
        numCount++;
        if (Number.isInteger(Number(trimmed))) intCount++;
        continue;
      }

      // Check ISO date or common date formats (YYYY-MM-DD, DD/MM/YYYY)
      if (/^\d{4}-\d{2}-\d{2}/.test(trimmed) || /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(trimmed)) {
        const parsed = Date.parse(trimmed);
        if (!isNaN(parsed)) {
          dateCount++;
          continue;
        }
      }
    }
  }

  const threshold = nonNull.length * 0.7;
  if (boolCount >= threshold) return 'boolean';
  if (dateCount >= threshold) return 'date';
  if (numCount >= threshold) {
    if (intCount >= threshold) return 'integer';
    return 'float';
  }

  // Check category cardinality (if unique values are very low compared to sample)
  const uniqueCount = new Set(nonNull.map(v => String(v))).size;
  if (nonNull.length >= 10 && uniqueCount <= 7 && uniqueCount < nonNull.length * 0.4) {
    return 'category';
  }

  return 'string';
}

/**
 * Build clean DatasetColumn definitions from records
 */
export function buildColumnsFromRecords(records: Record<string, any>[]): DatasetColumn[] {
  if (!records || records.length === 0) return [];
  
  const allKeys = new Set<string>();
  const sampleLimit = Math.min(records.length, 100);
  
  for (let i = 0; i < sampleLimit; i++) {
    Object.keys(records[i] || {}).forEach(k => allKeys.add(k));
  }

  return Array.from(allKeys).map(colName => {
    const samples = records.slice(0, 50).map(r => r[colName]);
    const type = inferColumnType(samples);
    const hasNull = records.some(r => r[colName] === null || r[colName] === undefined || r[colName] === '');

    return {
      name: colName,
      type,
      nullable: hasNull,
      sampleValues: samples.slice(0, 4).map(v => (v !== undefined && v !== null ? String(v) : 'NULL')),
    };
  });
}

/**
 * Robust CSV/TSV parser compliant with RFC 4180
 */
export function parseDelimitedText(text: string, delimiter?: string): Record<string, any>[] {
  const clean = text.replace(/^\uFEFF/, '').trim(); // Remove UTF-8 BOM
  if (!clean) return [];

  // Auto-detect delimiter if not specified
  if (!delimiter) {
    const firstLines = clean.split(/\r?\n/).slice(0, 5).join('\n');
    const commaCount = (firstLines.match(/,/g) || []).length;
    const semiCount = (firstLines.match(/;/g) || []).length;
    const tabCount = (firstLines.match(/\t/g) || []).length;
    const pipeCount = (firstLines.match(/\|/g) || []).length;

    if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t';
    else if (semiCount > commaCount && semiCount > pipeCount) delimiter = ';';
    else if (pipeCount > commaCount) delimiter = '|';
    else delimiter = ',';
  }

  // Tokenize using RFC 4180 state machine
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentVal = '';
  let insideQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const nextChar = clean[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentVal += '"';
        i++; // Skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === delimiter && !insideQuotes) {
      currentRow.push(currentVal.trim());
      currentVal = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentVal.trim());
      if (currentRow.some(c => c.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }

  if (currentVal.length > 0 || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    if (currentRow.some(c => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  if (rows.length < 2) {
    if (rows.length === 1) {
      return rows[0].map((val, idx) => ({ [`col_${idx + 1}`]: val }));
    }
    return [];
  }

  // First row is headers
  const rawHeaders = rows[0].map((h, idx) => {
    let header = h.replace(/^["']|["']$/g, '').trim();
    return header || `col_${idx + 1}`;
  });

  // Ensure unique headers
  const headers: string[] = [];
  const headerCounts: Record<string, number> = {};
  rawHeaders.forEach(h => {
    if (headerCounts[h] !== undefined) {
      headerCounts[h]++;
      headers.push(`${h}_${headerCounts[h]}`);
    } else {
      headerCounts[h] = 0;
      headers.push(h);
    }
  });

  const records: Record<string, any>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length === 0 || (row.length === 1 && row[0] === '')) continue;
    const record: Record<string, any> = {};

    headers.forEach((header, colIdx) => {
      const rawVal = row[colIdx] ?? '';
      let parsedVal: any = rawVal;

      if (rawVal !== '' && !isNaN(Number(rawVal)) && !/^0\d+/.test(rawVal)) {
        parsedVal = Number(rawVal);
      } else if (rawVal.toLowerCase() === 'true') {
        parsedVal = true;
      } else if (rawVal.toLowerCase() === 'false') {
        parsedVal = false;
      } else if (rawVal.toLowerCase() === 'null' || rawVal === '') {
        parsedVal = null;
      }

      record[header] = parsedVal;
    });

    records.push(record);
  }

  return records;
}

/**
 * Excel (.xlsx, .xls, .xlsm, .ods) Parser for ALL sheets simultaneously
 */
export function parseExcelWorkbookAllSheets(buffer: ArrayBuffer | Uint8Array): ParsedTableResult[] {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, cellNF: false, cellText: false });
  const sheetNames = workbook.SheetNames;
  if (!sheetNames || sheetNames.length === 0) {
    throw new Error('No worksheets found in the Excel workbook.');
  }

  return sheetNames.map(targetSheetName => {
    const worksheet = workbook.Sheets[targetSheetName];
    if (!worksheet) {
      return {
        tableName: targetSheetName,
        columns: [],
        data: [],
        totalRows: 0,
        format: 'excel',
        sizeBytes: buffer.byteLength,
        availableSheetsOrTables: sheetNames,
      };
    }

    const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
      defval: null,
      raw: true,
    });

    const records = rawRows.map(row => {
      const cleanRow: Record<string, any> = {};
      Object.entries(row || {}).forEach(([key, val]) => {
        const cleanKey = String(key).trim();
        if (val instanceof Date) {
          cleanRow[cleanKey] = val.toISOString().split('T')[0];
        } else if (typeof val === 'number') {
          cleanRow[cleanKey] = val;
        } else if (val === null || val === undefined) {
          cleanRow[cleanKey] = null;
        } else {
          cleanRow[cleanKey] = String(val).trim();
        }
      });
      return cleanRow;
    });

    const columns = buildColumnsFromRecords(records);

    return {
      tableName: targetSheetName,
      columns,
      data: records,
      totalRows: records.length,
      format: 'excel',
      sizeBytes: buffer.byteLength,
      availableSheetsOrTables: sheetNames,
    };
  });
}

/**
 * Excel (.xlsx, .xls, .xlsm, .ods) Parser
 */
export function parseExcelBuffer(buffer: ArrayBuffer | Uint8Array, options?: ParseOptions): ParsedTableResult {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, cellNF: false, cellText: false });
  const sheetNames = workbook.SheetNames;
  if (!sheetNames || sheetNames.length === 0) {
    throw new Error('No worksheets found in the Excel workbook.');
  }

  const targetSheetName = options?.selectedSheetOrTable && sheetNames.includes(options.selectedSheetOrTable)
    ? options.selectedSheetOrTable
    : sheetNames[0];

  const worksheet = workbook.Sheets[targetSheetName];
  if (!worksheet) {
    throw new Error(`Sheet "${targetSheetName}" could not be read.`);
  }

  // Convert to JSON
  const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
    defval: null,
    raw: true,
  });

  // Clean and format values
  const records = rawRows.map(row => {
    const cleanRow: Record<string, any> = {};
    Object.entries(row).forEach(([key, val]) => {
      const cleanKey = String(key).trim();
      if (val instanceof Date) {
        cleanRow[cleanKey] = val.toISOString().split('T')[0];
      } else if (typeof val === 'number') {
        cleanRow[cleanKey] = val;
      } else if (val === null || val === undefined) {
        cleanRow[cleanKey] = null;
      } else {
        cleanRow[cleanKey] = String(val).trim();
      }
    });
    return cleanRow;
  });

  const columns = buildColumnsFromRecords(records);

  return {
    tableName: targetSheetName,
    columns,
    data: records,
    totalRows: records.length,
    format: 'excel',
    sizeBytes: buffer.byteLength,
    availableSheetsOrTables: sheetNames,
  };
}

/**
 * JSON / JSON Lines Parser with auto-flattening
 */
export function parseJsonContent(content: string, filename = 'data.json'): ParsedTableResult {
  let parsed: any;
  const clean = content.trim();

  // Check JSON Lines (each line a JSON object)
  if (clean.includes('\n') && (!clean.startsWith('[') || clean.split('\n')[0].trim().startsWith('{'))) {
    const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
    const jsonlRows: any[] = [];
    let isJsonL = true;

    for (const line of lines.slice(0, 50)) {
      try {
        const item = JSON.parse(line);
        if (typeof item === 'object' && item !== null) {
          jsonlRows.push(item);
        } else {
          isJsonL = false;
          break;
        }
      } catch {
        isJsonL = false;
        break;
      }
    }

    if (isJsonL && jsonlRows.length > 0) {
      const fullRows = lines.map(l => {
        try { return JSON.parse(l); } catch { return null; }
      }).filter(Boolean);
      const flattened = flattenRecords(fullRows);
      const columns = buildColumnsFromRecords(flattened);
      return {
        tableName: filename.replace(/\.[^/.]+$/, ''),
        columns,
        data: flattened,
        totalRows: flattened.length,
        format: 'json',
        sizeBytes: content.length,
      };
    }
  }

  try {
    parsed = JSON.parse(clean);
  } catch (err: any) {
    throw new Error(`Invalid JSON syntax: ${err.message}`);
  }

  let arrayData: any[] = [];
  if (Array.isArray(parsed)) {
    arrayData = parsed;
  } else if (typeof parsed === 'object' && parsed !== null) {
    // Look for embedded array property like { data: [...], results: [...] }
    const potentialArrayKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
    if (potentialArrayKey) {
      arrayData = parsed[potentialArrayKey];
    } else {
      // Single object record
      arrayData = [parsed];
    }
  }

  const flattened = flattenRecords(arrayData);
  const columns = buildColumnsFromRecords(flattened);

  return {
    tableName: filename.replace(/\.[^/.]+$/, ''),
    columns,
    data: flattened,
    totalRows: flattened.length,
    format: 'json',
    sizeBytes: content.length,
  };
}

/**
 * Helper to flatten 1-level deep nested JSON objects
 */
function flattenRecords(records: any[]): Record<string, any>[] {
  return records.map(item => {
    if (typeof item !== 'object' || item === null) {
      return { value: item };
    }
    const flat: Record<string, any> = {};
    Object.entries(item).forEach(([key, val]) => {
      if (val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
        Object.entries(val).forEach(([subKey, subVal]) => {
          flat[`${key}_${subKey}`] = subVal;
        });
      } else if (Array.isArray(val)) {
        flat[key] = JSON.stringify(val);
      } else {
        flat[key] = val;
      }
    });
    return flat;
  });
}

/**
 * SQL Dump Parser (.sql)
 * Extracts CREATE TABLE schema and INSERT INTO rows
 */
export function parseSqlDump(sqlText: string, options?: ParseOptions): ParsedTableResult {
  const clean = sqlText.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  
  // Find all CREATE TABLE statements
  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`]?([a-zA-Z0-9_]+)["`]?\s*\(([\s\S]*?)\);/gi;
  const tables: { [tableName: string]: { columns: DatasetColumn[]; rows: Record<string, any>[] } } = {};
  
  let match;
  while ((match = createTableRegex.exec(clean)) !== null) {
    const tableName = match[1];
    const columnDefs = match[2];
    const columns: DatasetColumn[] = [];

    // Parse column definitions
    const colLines = columnDefs.split(',').map(l => l.trim()).filter(Boolean);
    colLines.forEach(line => {
      if (/^(PRIMARY\s+KEY|FOREIGN\s+KEY|CONSTRAINT|KEY|UNIQUE|INDEX)/i.test(line)) return;
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const colName = parts[0].replace(/["`]/g, '');
        const colType = parts[1].toUpperCase();
        let type: DatasetColumn['type'] = 'string';
        if (colType.includes('INT') || colType.includes('SERIAL')) type = 'integer';
        else if (colType.includes('FLOAT') || colType.includes('DOUBLE') || colType.includes('DECIMAL') || colType.includes('NUMERIC')) type = 'float';
        else if (colType.includes('DATE') || colType.includes('TIME')) type = 'date';
        else if (colType.includes('BOOL')) type = 'boolean';

        columns.push({
          name: colName,
          type,
          nullable: !line.toUpperCase().includes('NOT NULL'),
          sampleValues: [],
        });
      }
    });

    tables[tableName] = { columns, rows: [] };
  }

  // Parse INSERT INTO statements
  const insertRegex = /INSERT\s+INTO\s+["`]?([a-zA-Z0-9_]+)["`]?\s*(?:\(([^)]+)\))?\s*VALUES\s*([\s\S]+?);/gi;
  while ((match = insertRegex.exec(clean)) !== null) {
    const tableName = match[1];
    const rawCols = match[2];
    const rawValues = match[3];

    let tableCols: string[] = [];
    if (rawCols) {
      tableCols = rawCols.split(',').map(c => c.replace(/["`]/g, '').trim());
    } else if (tables[tableName]) {
      tableCols = tables[tableName].columns.map(c => c.name);
    }

    // Split multiple value tuples: (1, 'A'), (2, 'B')
    const tupleRegex = /\(([^)]+)\)/g;
    let tupleMatch;
    while ((tupleMatch = tupleRegex.exec(rawValues)) !== null) {
      const valStr = tupleMatch[1];
      const parsedValues = parseSqlValueList(valStr);
      const row: Record<string, any> = {};

      if (tableCols.length > 0) {
        tableCols.forEach((col, idx) => {
          row[col] = parsedValues[idx] ?? null;
        });
      } else {
        parsedValues.forEach((v, idx) => {
          row[`col_${idx + 1}`] = v;
        });
      }

      if (!tables[tableName]) {
        tables[tableName] = { columns: [], rows: [] };
      }
      tables[tableName].rows.push(row);
    }
  }

  const detectedTableNames = Object.keys(tables);
  if (detectedTableNames.length === 0) {
    throw new Error('No SQL CREATE TABLE or INSERT INTO statements could be parsed from the .sql file.');
  }

  const targetTableName = options?.selectedSheetOrTable && detectedTableNames.includes(options.selectedSheetOrTable)
    ? options.selectedSheetOrTable
    : detectedTableNames[0];

  const selectedTable = tables[targetTableName];
  const columns = selectedTable.columns.length > 0
    ? selectedTable.columns
    : buildColumnsFromRecords(selectedTable.rows);

  return {
    tableName: targetTableName,
    columns,
    data: selectedTable.rows,
    totalRows: selectedTable.rows.length,
    format: 'sql',
    sizeBytes: sqlText.length,
    availableSheetsOrTables: detectedTableNames,
  };
}

function parseSqlValueList(str: string): any[] {
  const results: any[] = [];
  let cur = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if ((c === "'" || c === '"') && (i === 0 || str[i - 1] !== '\\')) {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = c;
      } else if (quoteChar === c) {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === ',' && !inQuotes) {
      results.push(formatSqlScalar(cur.trim()));
      cur = '';
    } else {
      cur += c;
    }
  }
  if (cur.length > 0) {
    results.push(formatSqlScalar(cur.trim()));
  }
  return results;
}

function formatSqlScalar(val: string): any {
  if (val.toUpperCase() === 'NULL') return null;
  if (val.toUpperCase() === 'TRUE') return true;
  if (val.toUpperCase() === 'FALSE') return false;
  if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
    return val.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"');
  }
  if (!isNaN(Number(val)) && val !== '') {
    return Number(val);
  }
  return val;
}

/**
 * SQLite (.db, .sqlite, .sqlite3) Parser
 * Uses sql.js or direct binary SQLite extraction
 */
export async function parseSqliteBuffer(buffer: ArrayBuffer | Uint8Array, options?: ParseOptions): Promise<ParsedTableResult> {
  const uint8 = new Uint8Array(buffer);
  
  // Verify SQLite 3 header magic string: "SQLite format 3\0"
  const header = String.fromCharCode(...uint8.slice(0, 16));
  if (!header.startsWith('SQLite format 3')) {
    throw new Error('Invalid SQLite database file: Header magic number mismatch.');
  }

  try {
    // Dynamic import sql.js
    // @ts-ignore
    const initSqlJs = (await import('sql.js')).default || (window as any).initSqlJs;
    let SQL: any;
    
    try {
      SQL = await initSqlJs({
        locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
      });
    } catch {
      SQL = await initSqlJs();
    }

    const db = new SQL.Database(uint8);
    
    // Get all user tables
    const tablesQuery = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'android_%' ORDER BY name ASC;");
    const tableNames: string[] = [];

    if (tablesQuery.length > 0 && tablesQuery[0].values) {
      tablesQuery[0].values.forEach((v: any[]) => {
        if (v[0]) tableNames.push(String(v[0]));
      });
    }

    if (tableNames.length === 0) {
      throw new Error('SQLite database contains no user tables.');
    }

    const targetTable = options?.selectedSheetOrTable && tableNames.includes(options.selectedSheetOrTable)
      ? options.selectedSheetOrTable
      : tableNames[0];

    // Fetch table rows
    const dataQuery = db.exec(`SELECT * FROM "${targetTable}";`);
    const records: Record<string, any>[] = [];
    const columns: DatasetColumn[] = [];

    if (dataQuery.length > 0 && dataQuery[0].columns) {
      const colNames = dataQuery[0].columns;
      const rows = dataQuery[0].values || [];

      rows.forEach((r: any[]) => {
        const rowObj: Record<string, any> = {};
        colNames.forEach((c: string, idx: number) => {
          rowObj[c] = r[idx];
        });
        records.push(rowObj);
      });

      // Fetch schema types via PRAGMA
      try {
        const pragma = db.exec(`PRAGMA table_info("${targetTable}");`);
        if (pragma.length > 0 && pragma[0].values) {
          pragma[0].values.forEach((info: any[]) => {
            const cName = info[1];
            const cType = String(info[2] || '').toUpperCase();
            let type: DatasetColumn['type'] = 'string';
            if (cType.includes('INT')) type = 'integer';
            else if (cType.includes('REAL') || cType.includes('FLOAT') || cType.includes('DOUB') || cType.includes('NUM')) type = 'float';
            else if (cType.includes('BOOL')) type = 'boolean';
            else if (cType.includes('DATE') || cType.includes('TIME')) type = 'date';

            columns.push({
              name: cName,
              type,
              nullable: info[3] === 0,
              sampleValues: records.slice(0, 4).map(rec => String(rec[cName] ?? 'NULL')),
            });
          });
        }
      } catch {
        // Fallback to inferring columns
      }

      if (columns.length === 0) {
        columns.push(...buildColumnsFromRecords(records));
      }
    }

    db.close();

    return {
      tableName: targetTable,
      columns,
      data: records,
      totalRows: records.length,
      format: 'sqlite',
      sizeBytes: buffer.byteLength,
      availableSheetsOrTables: tableNames,
    };
  } catch (err: any) {
    console.error('sql.js error:', err);
    throw new Error(`Failed to load SQLite file: ${err.message}`);
  }
}

/**
 * Universal Multi-format File Parser Entry Point (Single Active Table)
 */
export async function parseUploadedFile(file: File, options?: ParseOptions): Promise<ParsedTableResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const buffer = await file.arrayBuffer();

  if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm' || ext === 'xlsb' || ext === 'ods') {
    return parseExcelBuffer(buffer, options);
  }

  if (ext === 'db' || ext === 'sqlite' || ext === 'sqlite3') {
    return await parseSqliteBuffer(buffer, options);
  }

  const textContent = new TextDecoder('utf-8').decode(buffer);

  if (ext === 'sql') {
    return parseSqlDump(textContent, options);
  }

  if (ext === 'json' || ext === 'jsonl' || ext === 'ndjson') {
    return parseJsonContent(textContent, file.name);
  }

  // Default Delimited (CSV, TSV, TXT)
  const delimiter = ext === 'tsv' ? '\t' : ext === 'psv' ? '|' : undefined;
  const records = parseDelimitedText(textContent, delimiter);
  const columns = buildColumnsFromRecords(records);

  return {
    tableName: file.name.replace(/\.[^/.]+$/, ''),
    columns,
    data: records,
    totalRows: records.length,
    format: 'csv',
    sizeBytes: file.size,
  };
}

/**
 * Universal Parser that extracts ALL tables/worksheets from a file simultaneously
 */
export async function parseAllTablesFromFile(file: File): Promise<ParsedTableResult[]> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const buffer = await file.arrayBuffer();

  // Excel: Parse all worksheets
  if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm' || ext === 'xlsb' || ext === 'ods') {
    return parseExcelWorkbookAllSheets(buffer);
  }

  // SQLite: Parse all tables
  if (ext === 'db' || ext === 'sqlite' || ext === 'sqlite3') {
    const single = await parseSqliteBuffer(buffer);
    if (single.availableSheetsOrTables && single.availableSheetsOrTables.length > 1) {
      const all: ParsedTableResult[] = [];
      for (const tName of single.availableSheetsOrTables) {
        try {
          const tRes = await parseSqliteBuffer(buffer, { selectedSheetOrTable: tName });
          all.push(tRes);
        } catch (e) {
          console.error(`Failed to parse sqlite table ${tName}:`, e);
        }
      }
      return all.length > 0 ? all : [single];
    }
    return [single];
  }

  const textContent = new TextDecoder('utf-8').decode(buffer);

  // SQL Dump: Parse all tables
  if (ext === 'sql') {
    const single = parseSqlDump(textContent);
    if (single.availableSheetsOrTables && single.availableSheetsOrTables.length > 1) {
      const all: ParsedTableResult[] = [];
      for (const tName of single.availableSheetsOrTables) {
        try {
          const tRes = parseSqlDump(textContent, { selectedSheetOrTable: tName });
          all.push(tRes);
        } catch (e) {
          console.error(`Failed to parse sql table ${tName}:`, e);
        }
      }
      return all.length > 0 ? all : [single];
    }
    return [single];
  }

  // JSON
  if (ext === 'json' || ext === 'jsonl' || ext === 'ndjson') {
    return [parseJsonContent(textContent, file.name)];
  }

  // CSV / TSV / Delimited
  const delimiter = ext === 'tsv' ? '\t' : ext === 'psv' ? '|' : undefined;
  const records = parseDelimitedText(textContent, delimiter);
  const columns = buildColumnsFromRecords(records);

  return [{
    tableName: file.name.replace(/\.[^/.]+$/, ''),
    columns,
    data: records,
    totalRows: records.length,
    format: 'csv',
    sizeBytes: file.size,
  }];
}
