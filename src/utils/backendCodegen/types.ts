import type { BackendDb, BackendFramework } from './model';

export type GeneratedFileLanguage = 'python' | 'php' | 'sql' | 'markdown' | 'env' | 'json' | 'text';

export type GeneratedFile = {
  /** مسار نسبي لجذر المشروع، بفواصل مائلة */
  path: string;
  content: string;
  language: GeneratedFileLanguage;
  /** مصدر الملف: قالب حتمي أو إثراء ذكي — يُوثَّق في MANIFEST */
  source?: 'template' | 'ai';
};

export type BackendProject = {
  framework: BackendFramework;
  language: 'python' | 'php';
  db: BackendDb;
  label: string;
  projectName: string;
  files: GeneratedFile[];
  warnings: string[];
  generation: {
    operationId: string;
    generatedAt: string;
    routingReason: 'manual' | 'auto';
    aiEnrichment: boolean;
    aiNotes: string[];
  };
  stats: {
    tables: number;
    baseTables: number;
    columns: number;
    relationships: number;
    junctionTables: number;
    indexes: number;
    views: number;
    triggers: number;
    endpoints: number;
    files: number;
  };
};

export function slugifyProjectName(raw: string): string {
  const cleaned = (raw || '')
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return cleaned || 'schema-api';
}
