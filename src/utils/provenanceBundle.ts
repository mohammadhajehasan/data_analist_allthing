/**
 * Provenance bundle: everything needed to prove how a number was produced.
 *
 * The bundle is a small ZIP holding the data fingerprint, the model
 * configuration and coefficients, the forecast table, and a human-readable
 * README — so a report can be re-checked months later without guessing which
 * dataset or settings were used.
 */

import { createZip, type ZipEntry } from './zipStore';

export const PROVENANCE_SCHEMA_VERSION = 1;
export const APP_VERSION = '1.0.0';

export interface ProvenanceModel {
  type: string;
  target: string;
  features: string[];
  degree?: number;
  alpha?: number;
  intercept?: number;
  coefficients?: number[];
  metrics?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ProvenanceInput {
  datasetName: string;
  headers: string[];
  /** Raw rows as they were loaded, used only for the fingerprint and row count. */
  rows: Array<Array<string | number | null>>;
  model: ProvenanceModel;
  /** Output of buildForecastTable, when the bundle includes a forecast. */
  forecastTable?: (string | number)[][];
  /** Summary rows (R², RMSE, seasonality, ...) as printed in the report. */
  summaryRows?: Array<[string, string | number]>;
  /** Seasonality of the forecast, when one is included. */
  seasonality?: { period: number | null; kind: string | null; strength: number | null } | null;
  language: string;
  createdAt?: Date;
}

export interface ProvenanceManifest {
  schemaVersion: number;
  appVersion: string;
  createdAt: string;
  dataset: {
    name: string;
    rows: number;
    columns: string[];
    fingerprint: string;
    numericColumns: string[];
  };
  model: ProvenanceModel;
  forecast?: {
    periods: number;
    confidence: number | null;
    seasonality: { period: number | null; kind: string | null; strength: number | null } | null;
  };
  settings: { features: string[]; target: string };
}

/** 64-bit FNV-1a rendered as hex — stable across runs and platforms. */
export function hashText(text: string): string {
  let hashA = 0x811c9dc5;
  let hashB = 0x100000001b3;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    hashA ^= code;
    hashA = Math.imul(hashA, 0x01000193) >>> 0;
    hashB = (hashB ^ Math.imul(code, 0x85ebca6b)) >>> 0;
    hashB = ((hashB << 13) | (hashB >>> 19)) >>> 0;
  }
  return `${hashA.toString(16).padStart(8, '0')}${hashB.toString(16).padStart(8, '0')}`;
}

/**
 * Fingerprints the cell values, not the formatting: 12 vs "12.0" should not
 * change the fingerprint, so numbers are normalised through Number().
 */
export function fingerprintRows(headers: string[], rows: Array<Array<string | number | null>>): string {
  const parts: string[] = [];
  for (const row of rows) {
    const cells: string[] = [];
    for (const cell of row) {
      if (cell === null || cell === undefined || cell === '') {
        cells.push('');
        continue;
      }
      if (typeof cell === 'number') {
        cells.push(Number.isFinite(cell) ? String(Number(cell.toPrecision(15))) : String(cell));
        continue;
      }
      const numeric = Number(String(cell).replace(/,/g, '').trim());
      cells.push(Number.isFinite(numeric) && String(cell).trim() !== '' ? String(Number(numeric.toPrecision(15))) : String(cell).trim());
    }
    parts.push(cells.join('\u001f'));
  }
  return hashText(`${headers.join('\u001f')}\u001e${parts.join('\u001e')}`);
}

function toCsv(rows: (string | number)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const text = String(cell ?? '');
          return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(',')
    )
    .join('\r\n');
}

export function buildProvenanceManifest(input: ProvenanceInput): ProvenanceManifest {
  const createdAt = input.createdAt ?? new Date();
  const numericColumns = input.headers.filter((header, columnIndex) => {
    let seen = 0;
    let numeric = 0;
    for (const row of input.rows) {
      const cell = row[columnIndex];
      if (cell === null || cell === undefined || cell === '') continue;
      seen += 1;
      const parsed = typeof cell === 'number' ? cell : Number(String(cell).replace(/,/g, ''));
      if (Number.isFinite(parsed)) numeric += 1;
    }
    return seen > 0 && numeric / seen >= 0.8;
  });

  return {
    schemaVersion: PROVENANCE_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    createdAt: createdAt.toISOString(),
    dataset: {
      name: input.datasetName,
      rows: input.rows.length,
      columns: input.headers,
      fingerprint: fingerprintRows(input.headers, input.rows),
      numericColumns,
    },
    model: input.model,
    forecast: input.forecastTable
      ? {
          periods: Math.max(0, input.forecastTable.length - 1),
          confidence: input.model.confidence === undefined ? null : Number(input.model.confidence),
          seasonality: input.seasonality ?? null,
        }
      : undefined,
    settings: { features: input.model.features, target: input.model.target },
  };
}

function readmeFor(manifest: ProvenanceManifest, language: string): string {
  const ar = language === 'ar';
  const line = (label: string, value: unknown) => `| ${label} | ${value ?? '—'} |`;
  const metrics = manifest.model.metrics ?? {};
  return [
    ar ? '# حزمة دليل التحليل' : '# Analysis provenance bundle',
    '',
    ar
      ? 'كل ملف في هذه الحزمة يخص تحليلًا واحدًا؛ احتفظ بها مع التقرير الذي نُشرت فيه الأرقام.'
      : 'Every file here belongs to one analysis; keep the bundle with the report that quoted its numbers.',
    '',
    ar ? '## البيانات' : '## Dataset',
    '| | |',
    '|---|---|',
    line(ar ? 'المجموعة' : 'Dataset', manifest.dataset.name),
    line(ar ? 'الصفوف' : 'Rows', manifest.dataset.rows),
    line(ar ? 'الأعمدة' : 'Columns', manifest.dataset.columns.join(', ')),
    line(ar ? 'بصمة البيانات' : 'Data fingerprint', `\`${manifest.dataset.fingerprint}\``),
    '',
    ar ? '## النموذج' : '## Model',
    '| | |',
    '|---|---|',
    line(ar ? 'النوع' : 'Type', manifest.model.type),
    line(ar ? 'الهدف' : 'Target', manifest.model.target),
    line(ar ? 'الميزات' : 'Features', manifest.model.features.join(', ')),
    ...Object.entries(metrics).map(([key, value]) => line(key, value)),
    '',
    ar ? '## الملفات' : '## Files',
    `- \`manifest.json\` — ${ar ? 'التفاصيل الكاملة والبصمة' : 'full details and fingerprint'}`,
    `- \`model.json\` — ${ar ? 'الإعدادات والمعاملات كما استُخدمت' : 'settings and coefficients as used'}`,
    `- \`dataset.csv\` — ${ar ? 'نسخة البيانات المستخدمة' : 'the exact rows used'}`,
    ...(manifest.forecast ? [`- \`forecast.csv\` — ${ar ? 'جدول التوقع كما ظهر' : 'the forecast table as shown'}`] : []),
    '',
    ar
      ? `أُنشئت في ${manifest.createdAt} بإصدار ${manifest.appVersion} (مخطط ${manifest.schemaVersion}).`
      : `Created ${manifest.createdAt} by version ${manifest.appVersion} (schema ${manifest.schemaVersion}).`,
  ].join('\n');
}

export interface ProvenanceBundle {
  bytes: Uint8Array;
  fileName: string;
  manifest: ProvenanceManifest;
}

export function buildProvenanceBundle(input: ProvenanceInput): ProvenanceBundle {
  const manifest = buildProvenanceManifest(input);
  const entries: ZipEntry[] = [
    { path: 'manifest.json', content: `${JSON.stringify(manifest, null, 2)}\n` },
    { path: 'model.json', content: `${JSON.stringify(input.model, null, 2)}\n` },
    { path: 'dataset.csv', content: toCsv([input.headers, ...input.rows] as (string | number)[][]) },
  ];
  if (input.forecastTable) {
    entries.push({ path: 'forecast.csv', content: toCsv(input.forecastTable) });
  }
  if (input.summaryRows) {
    entries.push({ path: 'summary.csv', content: toCsv(input.summaryRows as (string | number)[][]) });
  }
  entries.push({ path: 'README.md', content: readmeFor(manifest, input.language) });

  const stamp = manifest.createdAt.replace(/[:.]/g, '-');
  const baseName = input.datasetName.replace(/\.[a-z0-9]+$/i, '');
  const safeName = baseName.replace(/[^\w\u0600-\u06FF-]+/g, '_').slice(0, 40) || 'analysis';
  return {
    bytes: createZip(entries, new Date(manifest.createdAt)),
    fileName: `provenance-${safeName}-${stamp}.zip`,
    manifest,
  };
}

/** Triggers a browser download for the bundle. */
export function downloadBytes(bytes: Uint8Array, fileName: string, mime = 'application/zip'): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
