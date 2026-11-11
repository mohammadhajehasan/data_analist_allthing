/**
 * مولّد الـBackend الكامل من نموذج السكيمّا.
 * -----------------------------------------------------------------
 * نقطة دخول واحدة: `generateBackendProject(model, options, name)`
 * تختار التقنية (يدوياً أو تلقائياً)، تُحلّل الجداول والعلاقات، ثم
 * تُعيد شجرة ملفات جاهزة للتنزيل مع إحصاءات وتحذيرات.
 *
 * القاعدة الذكية للاختيار التلقائي:
 *   MySQL      → PHP + Laravel
 *   PostgreSQL → Python + FastAPI
 *   SQLite     → Python + FastAPI
 * واختيار المستخدم اليدوي يتغلّب دائماً على هذه القاعدة.
 */

import type { ErModel } from '../drawioImporter';
import { generateDdl } from '../ddlGenerator';
import {
  analyzeBackendModel,
  BackendCodegenError,
  frameworkLabel,
  frameworkLanguage,
  resolveFramework,
  type BackendOptions,
  type BackendFramework,
} from './model';
import { generateDjango } from './django';
import { generateFastApi } from './pythonFastapi';
import { generateLaravel } from './phpLaravel';
import { generatePhpPdo } from './phpPdo';
import { slugifyProjectName, type BackendProject, type GeneratedFile } from './types';

export * from './model';
export * from './types';

export interface GenerateBackendInput {
  model: ErModel;
  options: BackendOptions;
  /** اسم الملف/المخطط — يُستخدم في README وعنوان المشروع */
  projectName?: string;
  /** رقم العملية — يُعاد للواجهة ويُطبع في رأس كل ملف وفي MANIFEST */
  operationId?: string;
  /** تاريخ التوليد ISO — قابل للتثبيت في الاختبارات */
  generatedAt?: string;
}

function newOperationId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return `gen_${cryptoApi.randomUUID()}`;
  return `gen_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function vscodeFiles(framework: BackendFramework, projectName: string): GeneratedFile[] {
  const fastapi = framework === 'fastapi';
  const django = framework === 'django';
  const pythonStack = fastapi || django;
  const extensions = pythonStack
    ? ['ms-python.python', 'ms-python.vscode-pylance', 'ms-python.debugpy', 'charliermarsh.ruff']
    : ['bmewburn.vscode-intelephense-client', 'xdebug.php-debug'];
  const tasks = django
    ? [
        { label: 'Install dependencies', type: 'shell', command: 'pip install -r requirements.txt', problemMatcher: [] },
        { label: 'Django migrate (auth tables)', type: 'shell', command: 'python manage.py migrate', problemMatcher: [] },
        { label: 'Run Django (reload)', type: 'shell', command: 'python manage.py runserver', isBackground: true, problemMatcher: [] },
      ]
    : fastapi
      ? [
          { label: 'Install dependencies', type: 'shell', command: 'pip install -r requirements.txt', problemMatcher: [] },
          { label: 'Run FastAPI (reload)', type: 'shell', command: 'uvicorn app.main:app --reload', isBackground: true, problemMatcher: [] },
        ]
      : framework === 'laravel'
        ? [
            { label: 'Composer install', type: 'shell', command: 'composer install', problemMatcher: [] },
            { label: 'Migrate database', type: 'shell', command: 'php artisan migrate', problemMatcher: [] },
            { label: 'Run Laravel (serve)', type: 'shell', command: 'php artisan serve', isBackground: true, problemMatcher: [] },
          ]
        : [
            { label: 'Run PHP dev server', type: 'shell', command: 'php -S localhost:8000 -t public', isBackground: true, problemMatcher: [] },
          ];

  const settings = {
    'files.eol': '\n',
    'files.trimTrailingWhitespace': true,
    'editor.formatOnSave': true,
  };
  const launch = django
    ? {
        version: '0.2.0',
        configurations: [
          {
            name: 'Django',
            type: 'debugpy',
            request: 'launch',
            program: '${workspaceFolder}/manage.py',
            args: ['runserver', '127.0.0.1:8000'],
            django: true,
            justMyCode: true,
          },
        ],
      }
    : fastapi
      ? {
          version: '0.2.0',
          configurations: [
            {
              name: 'FastAPI',
              type: 'debugpy',
              request: 'launch',
              module: 'uvicorn',
              args: ['app.main:app', '--reload'],
              jinja: true,
              justMyCode: true,
            },
          ],
        }
      : {
          version: '0.2.0',
          configurations: [
            { name: 'PHP', type: 'php', request: 'launch', port: 9000, program: '${workspaceFolder}/public/index.php' },
          ],
        };

  const json = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';
  return [
    { path: '.vscode/settings.json', language: 'json', content: json(settings) },
    { path: '.vscode/extensions.json', language: 'json', content: json({ recommendations: extensions }) },
    { path: '.vscode/tasks.json', language: 'json', content: json({ version: '2.0.0', tasks }) },
    { path: '.vscode/launch.json', language: 'json', content: json(launch) },
    {
      path: `${projectName}.code-workspace`,
      language: 'json',
      content: json({ folders: [{ path: '.' }], settings, extensions: { recommendations: extensions } }),
    },
  ];
}

function generationHeader(language: GeneratedFile['language'], line: string): string {
  switch (language) {
    case 'php':
      return `/**\n * ${line}\n */\n`;
    case 'python':
    case 'env':
    case 'text':
      return `# ${line}\n\n`;
    case 'sql':
      return `-- ${line}\n\n`;
    case 'markdown':
      return `<!-- ${line} -->\n\n`;
    default:
      return '';
  }
}

function stampFile(file: GeneratedFile, line: string): GeneratedFile {
  if (file.path === 'MANIFEST.json') return file;
  // ملفات فارغة (مثل database/database.sqlite) يجب أن تبقى فارغة تماماً
  if (file.content === '') return file;
  const header = generationHeader(file.language, line);
  if (!header) return file;
  if (file.language === 'php' && file.content.startsWith('<?php')) {
    return {
      ...file,
      content: `<?php\n\n${header}\n${file.content.slice(5).replace(/^\n+/, '')}`,
    };
  }
  return { ...file, content: header + file.content };
}

function manifestFile(input: {
  projectName: string;
  framework: BackendFramework;
  language: string;
  db: BackendOptions['db'];
  options: BackendOptions;
  operationId: string;
  generatedAt: string;
  routingReason: 'manual' | 'auto';
  files: GeneratedFile[];
  warnings: string[];
  stats: BackendProject['stats'];
}): GeneratedFile {
  const payload = {
    schemaVersion: 1,
    project: {
      name: input.projectName,
      language: input.language,
      framework: input.framework,
      frameworkLabel: frameworkLabel(input.framework, input.db),
      database: input.db,
      mode: input.options.mode,
      auth: input.options.auth,
    },
    generation: {
      operationId: input.operationId,
      generatedAt: input.generatedAt,
      routingReason: input.routingReason,
      aiEnrichment: input.files.some(file => file.source === 'ai'),
      aiNotes: input.options.aiNotes ?? [],
    },
    stats: input.stats,
    warnings: input.warnings,
    files: input.files.map(file => ({
      path: file.path,
      language: file.language,
      source: file.source ?? 'template',
      bytes: new TextEncoder().encode(file.content).length,
    })),
  };
  return {
    path: 'MANIFEST.json',
    language: 'json',
    content: JSON.stringify(payload, null, 2) + '\n',
    source: 'template',
  };
}

function endpointCount(framework: BackendFramework, tables: { primaryKey: unknown[] }[], mode: BackendOptions['mode']): number {
  if (mode !== 'full') return 0;
  // PDO/Laravel/FastAPI: 5 مسارات للجدول ذي المفتاح، و2 بلا مفتاح (list + create)
  void framework;
  return tables.reduce((sum, table) => sum + (table.primaryKey.length > 0 ? 5 : 2), 0);
}

export function generateBackendProject(input: GenerateBackendInput): BackendProject {
  const { model, options } = input;
  if (!model.tables.some(table => table.columns.length > 0)) {
    throw new BackendCodegenError(
      'The schema has no table with columns — upload or build a schema before generating a backend.'
    );
  }

  const analysis = analyzeBackendModel(model);
  const framework = resolveFramework(options.db, options.framework);
  const language = frameworkLanguage(framework);
  const projectName = slugifyProjectName(input.projectName || 'schema-api');
  const operationId = input.operationId || newOperationId();
  const generatedAt = input.generatedAt || new Date().toISOString();
  const routingReason: 'manual' | 'auto' = options.routingReason ?? (options.framework === 'auto' ? 'auto' : 'manual');
  const effectiveOptions: BackendOptions = { ...options, routingReason, aiNotes: options.aiNotes ?? [] };

  let files: GeneratedFile[];
  if (framework === 'fastapi') files = generateFastApi(analysis, effectiveOptions, projectName);
  else if (framework === 'django') files = generateDjango(analysis, effectiveOptions, projectName);
  else if (framework === 'laravel') files = generateLaravel(analysis, effectiveOptions, projectName);
  else files = generatePhpPdo(analysis, effectiveOptions, projectName);

  // إعدادات محرّر محمولة: يتعرّف VS Code على المهام والإضافات فور فتح المجلد
  files = files.map(file => file.path === 'README.md'
    ? {
        ...file,
        content: `${file.content.trimEnd()}\n\n---\n\n## Open in VS Code / الفتح في VS Code\n\n` +
          'This bundle includes `.vscode/` tasks and a `.code-workspace` file. Open the folder (or the workspace file) in VS Code, then run **Terminal → Run Task** and pick the install/run task for this stack.\n\n' +
          'تتضمّن الحزمة مهام `.vscode/` وملف `.code-workspace`. افتح المجلد (أو ملف الـworkspace) في VS Code ثم **Terminal → Run Task** واختر مهمة التثبيت/التشغيل المناسبة.\n',
      }
    : file);
  files = [...files, ...vscodeFiles(framework, projectName)];

  // تحذيرات محرّك DDL نفسه (مفاتيح أب مفقودة، جداول فارغة…)
  const ddlWarnings = generateDdl(model, options.db, { dropIfExists: false, createJunctionTables: true, deferCyclicForeignKeys: true }).warnings;
  const warnings = Array.from(new Set([
    ...analysis.warnings,
    ...ddlWarnings,
    ...(effectiveOptions.extraWarnings ?? []),
  ]));

  // حماية من مسارات مكرّرة إن أضاف مولّدٌ ملفاً مرتين
  const seen = new Set<string>();
  const uniqueFiles: GeneratedFile[] = [];
  for (const file of files) {
    if (seen.has(file.path)) continue;
    seen.add(file.path);
    uniqueFiles.push(file);
  }

  const columns = analysis.tables.reduce((sum, table) => sum + table.columns.length, 0);
  const stats: BackendProject['stats'] = {
    tables: analysis.tables.length,
    baseTables: analysis.baseTables.length,
    columns,
    relationships: model.relationships.length,
    junctionTables: analysis.tables.length - analysis.baseTables.length,
    indexes: analysis.tables.reduce((sum, table) => sum + table.indexes.length, 0),
    views: model.views?.length ?? 0,
    triggers: model.triggers?.length ?? 0,
    endpoints: endpointCount(framework, analysis.tables, options.mode),
    files: 0,
  };

  const headerLine =
    `Generated automatically by Schema Studio · project=${projectName} · operation=${operationId} · generatedAt=${generatedAt}`;
  const stamped = uniqueFiles.map(file => stampFile(file, headerLine));

  const aiNotes = effectiveOptions.aiNotes ?? [];
  if (aiNotes.length > 0) {
    stamped.push(stampFile({
      path: 'docs/AI_NOTES.md',
      language: 'markdown',
      source: 'ai',
      content: [
        '# AI enrichment notes',
        '',
        '> Seed data and documentation suggestions produced by the optional AI layer.',
        '> Rows are validated against the schema and treated as plain data; review before production use.',
        '',
        ...aiNotes.map(note => `- ${note}`),
        '',
      ].join('\n'),
    }, headerLine));
  }

  stats.files = stamped.length + 1;
  const manifest = manifestFile({
    projectName,
    framework,
    language,
    db: options.db,
    options: effectiveOptions,
    operationId,
    generatedAt,
    routingReason,
    files: stamped,
    warnings,
    stats,
  });

  return {
    framework,
    language,
    db: options.db,
    label: frameworkLabel(framework, options.db),
    projectName,
    files: [...stamped, manifest],
    warnings,
    generation: {
      operationId,
      generatedAt,
      routingReason,
      aiEnrichment: stamped.some(file => file.source === 'ai'),
      aiNotes: effectiveOptions.aiNotes ?? [],
    },
    stats,
  };
}

/** فهرس ملفات الشجرة (مجلد → ملفات) لعرضه في الواجهة */
export function groupFilesByDirectory(files: GeneratedFile[]): { directory: string; files: GeneratedFile[] }[] {
  const map = new Map<string, GeneratedFile[]>();
  for (const file of files) {
    const parts = file.path.split('/');
    const directory = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
    const list = map.get(directory) ?? [];
    list.push(file);
    map.set(directory, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([directory, grouped]) => ({
      directory,
      files: grouped.sort((a, b) => a.path.localeCompare(b.path)),
    }));
}
