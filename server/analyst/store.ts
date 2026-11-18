/**
 * تخزين ذكاء المحلل: المقاييس المعتمدة، الذاكرة، المجموعة الذهبية، والأثراء.
 *
 * لماذا في Turso لا في ذاكرة العملية: هذه الطبقة يجب أن تبقى بين الجلسات —
 * ذاكرة المحلل التي تُفقد عند إعادة تشغيل الخادم ليست ذاكرة. كل صف مرتبط
 * بـuser_id لأن المقاييس والذاكرة خاصة بكل فريق/مستخدم.
 */

import crypto from 'crypto';
import { ensureSchema, one, rows, run, turso } from '../turso';
import type { MetricDefinition } from './metricSemantics';
import type { MemoryEntry } from './analystMemory';
import type { GoldenCase, TaskKind } from './evalHarness';
import type { Artifact, ArtifactKind } from './lineageImpact';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS analyst_metrics (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_analyst_metrics_user ON analyst_metrics(user_id)`,
  `CREATE TABLE IF NOT EXISTS analyst_memory (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    sql TEXT,
    dataset_id TEXT,
    dataset_name TEXT,
    outcome TEXT,
    tags TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_analyst_memory_user ON analyst_memory(user_id)`,
  `CREATE TABLE IF NOT EXISTS analyst_golden (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    question TEXT NOT NULL,
    expected TEXT NOT NULL,
    actual TEXT,
    task TEXT,
    tags TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_analyst_golden_user ON analyst_golden(user_id)`,
  `CREATE TABLE IF NOT EXISTS analyst_artifacts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    reads TEXT NOT NULL,
    owner TEXT,
    schedule TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_analyst_artifacts_user ON analyst_artifacts(user_id)`,
  `CREATE TABLE IF NOT EXISTS analyst_runs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    tool TEXT NOT NULL,
    status INTEGER NOT NULL DEFAULT 200,
    summary TEXT NOT NULL,
    payload TEXT,
    latency_ms INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_analyst_runs_user ON analyst_runs(user_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS analyst_proofs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    value REAL NOT NULL,
    card TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_analyst_proofs_user ON analyst_proofs(user_id)`,
  `CREATE TABLE IF NOT EXISTS analyst_eval_snapshots (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    accuracy REAL NOT NULL,
    cases INTEGER NOT NULL,
    failures INTEGER NOT NULL,
    detail TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_analyst_eval_user ON analyst_eval_snapshots(user_id, created_at)`,
];

let ready: Promise<void> | null = null;
async function init(): Promise<void> {
  ready ??= ensureSchema(turso(), SCHEMA);
  await ready;
}

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 12)}`;

// ---------------------------------------------------------------------------
// المقاييس
// ---------------------------------------------------------------------------

interface MetricRow {
  id: string;
  user_id: string;
  name: string;
  payload: string;
  created_at: string;
}

export async function listMetrics(userId: string): Promise<MetricDefinition[]> {
  await init();
  const result = await rows<MetricRow>('SELECT * FROM analyst_metrics WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  const parsed: Array<MetricDefinition | null> = result.map((r) => {
    try {
      return { ...(JSON.parse(r.payload) as MetricDefinition), id: r.id, createdAt: r.created_at };
    } catch {
      return null;
    }
  });
  return parsed.filter((m): m is MetricDefinition => m !== null);
}

export async function saveMetric(userId: string, metric: MetricDefinition): Promise<MetricDefinition> {
  await init();
  const id = metric.id && metric.id.startsWith('metric-') ? `${metric.id}` : newId('metric');
  const record: MetricDefinition = { ...metric, id };
  await run(
    `INSERT INTO analyst_metrics (id, user_id, name, payload, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, payload = excluded.payload`,
    [id, userId, metric.name, JSON.stringify(record), new Date().toISOString()]
  );
  return record;
}

export async function deleteMetric(userId: string, id: string): Promise<boolean> {
  await init();
  const existing = await one<{ id: string }>('SELECT id FROM analyst_metrics WHERE id = ? AND user_id = ?', [id, userId]);
  if (!existing) return false;
  await run('DELETE FROM analyst_metrics WHERE id = ? AND user_id = ?', [id, userId]);
  return true;
}

// ---------------------------------------------------------------------------
// الذاكرة
// ---------------------------------------------------------------------------

interface MemoryRow {
  id: string;
  user_id: string;
  question: string;
  answer: string;
  sql: string | null;
  dataset_id: string | null;
  dataset_name: string | null;
  outcome: string | null;
  tags: string | null;
  created_at: string;
}

function toEntry(row: MemoryRow): MemoryEntry {
  return {
    id: row.id,
    userId: row.user_id,
    question: row.question,
    answer: row.answer,
    sql: row.sql || undefined,
    datasetId: row.dataset_id || undefined,
    datasetName: row.dataset_name || undefined,
    outcome: (row.outcome as MemoryEntry['outcome']) || 'inconclusive',
    tags: row.tags ? (JSON.parse(row.tags) as string[]) : [],
    createdAt: row.created_at,
  };
}

export async function listMemory(userId: string, limit = 200): Promise<MemoryEntry[]> {
  await init();
  const result = await rows<MemoryRow>('SELECT * FROM analyst_memory WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [userId, limit]);
  return result.map(toEntry);
}

export async function addMemory(userId: string, entry: Omit<MemoryEntry, 'id' | 'createdAt'>): Promise<MemoryEntry> {
  await init();
  const id = newId('mem');
  const createdAt = new Date().toISOString();
  await run(
    `INSERT INTO analyst_memory (id, user_id, question, answer, sql, dataset_id, dataset_name, outcome, tags, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, entry.question, entry.answer, entry.sql || null, entry.datasetId || null, entry.datasetName || null, entry.outcome || 'inconclusive', JSON.stringify(entry.tags || []), createdAt]
  );
  return { ...entry, id, createdAt };
}

export async function deleteMemory(userId: string, id: string): Promise<boolean> {
  await init();
  const existing = await one<{ id: string }>('SELECT id FROM analyst_memory WHERE id = ? AND user_id = ?', [id, userId]);
  if (!existing) return false;
  await run('DELETE FROM analyst_memory WHERE id = ? AND user_id = ?', [id, userId]);
  return true;
}

// ---------------------------------------------------------------------------
// المجموعة الذهبية
// ---------------------------------------------------------------------------

interface GoldenRow {
  id: string;
  user_id: string;
  question: string;
  expected: string;
  actual: string | null;
  task: string | null;
  tags: string | null;
  created_at: string;
}

export async function listGolden(userId: string): Promise<GoldenCase[]> {
  await init();
  const result = await rows<GoldenRow>('SELECT * FROM analyst_golden WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  return result.map((r) => ({
    id: r.id,
    question: r.question,
    expected: r.expected,
    actual: r.actual || undefined,
    task: (r.task as TaskKind) || 'reasoning',
    tags: r.tags ? (JSON.parse(r.tags) as string[]) : [],
  }));
}

export async function upsertGolden(userId: string, input: GoldenCase): Promise<GoldenCase> {
  await init();
  const id = input.id || newId('gold');
  await run(
    `INSERT INTO analyst_golden (id, user_id, question, expected, actual, task, tags, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET question = excluded.question, expected = excluded.expected, actual = excluded.actual, task = excluded.task, tags = excluded.tags`,
    [id, userId, input.question, input.expected, input.actual || null, input.task || 'reasoning', JSON.stringify(input.tags || []), new Date().toISOString()]
  );
  return { ...input, id };
}

export async function deleteGolden(userId: string, id: string): Promise<boolean> {
  await init();
  const existing = await one<{ id: string }>('SELECT id FROM analyst_golden WHERE id = ? AND user_id = ?', [id, userId]);
  if (!existing) return false;
  await run('DELETE FROM analyst_golden WHERE id = ? AND user_id = ?', [id, userId]);
  return true;
}

// ---------------------------------------------------------------------------
// الأثراء (lineage)
// ---------------------------------------------------------------------------

interface ArtifactRow {
  id: string;
  user_id: string;
  name: string;
  kind: string;
  reads: string;
  owner: string | null;
  schedule: string | null;
  created_at: string;
}

export async function listArtifacts(userId: string): Promise<Artifact[]> {
  await init();
  const result = await rows<ArtifactRow>('SELECT * FROM analyst_artifacts WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  return result.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind as ArtifactKind,
    reads: JSON.parse(r.reads) as Artifact['reads'],
    owner: r.owner || undefined,
    schedule: (r.schedule as Artifact['schedule']) || undefined,
  }));
}

export async function saveArtifact(userId: string, artifact: Artifact): Promise<Artifact> {
  await init();
  const id = artifact.id || newId('art');
  const record = { ...artifact, id };
  await run(
    `INSERT INTO analyst_artifacts (id, user_id, name, kind, reads, owner, schedule, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, kind = excluded.kind, reads = excluded.reads, owner = excluded.owner, schedule = excluded.schedule`,
    [id, userId, artifact.name, artifact.kind, JSON.stringify(artifact.reads), artifact.owner || null, artifact.schedule || null, new Date().toISOString()]
  );
  return record;
}

export async function deleteArtifact(userId: string, id: string): Promise<boolean> {
  await init();
  const existing = await one<{ id: string }>('SELECT id FROM analyst_artifacts WHERE id = ? AND user_id = ?', [id, userId]);
  if (!existing) return false;
  await run('DELETE FROM analyst_artifacts WHERE id = ? AND user_id = ?', [id, userId]);
  return true;
}

/**
 * سجل التشغيل: ماذا شُغّل، متى، وبأي نتيجة.
 *
 * لماذا لا يكفي سجل الخادم: هذا سجل يُقرأ داخل المنتج (المستخدم يرى ما حُسب
 * على بياناته)، وهو أساس التدقيق لاحقًا — ومصدر حقيقي لأي تقييم مستقبلي.
 */
export interface AnalystRun {
  id: string;
  tool: string;
  status: number;
  summary: string;
  latencyMs: number;
  createdAt: string;
  payload?: unknown;
}

interface RunRow {
  id: string;
  user_id: string;
  tool: string;
  status: number;
  summary: string;
  payload: string | null;
  latency_ms: number;
  created_at: string;
}

/** يُبقي السجل مفيدًا: آخر ٥٠٠ تشغيل لكل مستخدم، وما قبلها يُحذف. */
const MAX_RUNS_PER_USER = 500;

export async function recordRun(
  userId: string,
  input: { tool: string; status?: number; summary: string; latencyMs?: number; payload?: unknown }
): Promise<AnalystRun> {
  await init();
  const id = newId('run');
  const createdAt = new Date().toISOString();
  const status = Number(input.status) || 200;
  const summary = String(input.summary || '').slice(0, 400);
  const payload = input.payload === undefined ? null : JSON.stringify(input.payload).slice(0, 8000);
  await run(
    `INSERT INTO analyst_runs (id, user_id, tool, status, summary, payload, latency_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, input.tool, status, summary, payload, Math.max(0, Math.round(input.latencyMs || 0)), createdAt]
  );
  // تقليم دوري: حذف الأقدم حين يتجاوز السقف (استعلام واحد رخيص).
  try {
    await run(
      `DELETE FROM analyst_runs WHERE user_id = ? AND id NOT IN (
         SELECT id FROM analyst_runs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
       )`,
      [userId, userId, MAX_RUNS_PER_USER]
    );
  } catch {
    // التقليم تحسين لا شرط: فشله لا يُفشل تسجيل التشغيل.
  }
  return { id, tool: input.tool, status, summary, latencyMs: input.latencyMs || 0, createdAt };
}

export async function listRuns(userId: string, limit = 50, tool?: string): Promise<AnalystRun[]> {
  await init();
  const capped = Math.max(1, Math.min(limit, 200));
  const result = tool
    ? await rows<RunRow>(
        'SELECT * FROM analyst_runs WHERE user_id = ? AND tool = ? ORDER BY created_at DESC LIMIT ?',
        [userId, tool, capped]
      )
    : await rows<RunRow>('SELECT * FROM analyst_runs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [userId, capped]);
  return result.map((r) => ({
    id: r.id,
    tool: r.tool,
    status: Number(r.status),
    summary: r.summary,
    latencyMs: Number(r.latency_ms),
    createdAt: r.created_at,
  }));
}

// ---------------------------------------------------------------------------
// بطاقات الإثبات المحفوظة
// ---------------------------------------------------------------------------

interface ProofRow {
  id: string;
  user_id: string;
  metric_name: string;
  value: number;
  card: string;
  created_at: string;
}

export interface StoredProof {
  id: string;
  metricName: string;
  value: number;
  card: unknown;
  createdAt: string;
}

export async function saveProof(
  userId: string,
  input: { metricName: string; value: number; card: unknown }
): Promise<StoredProof> {
  await init();
  const id = newId('proof');
  const createdAt = new Date().toISOString();
  await run(
    `INSERT INTO analyst_proofs (id, user_id, metric_name, value, card, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, String(input.metricName || 'مقياس').slice(0, 200), Number(input.value) || 0, JSON.stringify(input.card ?? null), createdAt]
  );
  return { id, metricName: input.metricName, value: Number(input.value) || 0, card: input.card, createdAt };
}

export async function listProofs(userId: string, limit = 20): Promise<StoredProof[]> {
  await init();
  const result = await rows<ProofRow>(
    'SELECT * FROM analyst_proofs WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [userId, Math.max(1, Math.min(limit, 100))]
  );
  return result.map((r) => {
    let card: unknown = null;
    try { card = JSON.parse(r.card); } catch { card = null; }
    return { id: r.id, metricName: r.metric_name, value: Number(r.value), card, createdAt: r.created_at };
  });
}

export async function deleteProof(userId: string, id: string): Promise<boolean> {
  await init();
  const existing = await one<{ id: string }>('SELECT id FROM analyst_proofs WHERE id = ? AND user_id = ?', [id, userId]);
  if (!existing) return false;
  await run('DELETE FROM analyst_proofs WHERE id = ? AND user_id = ?', [id, userId]);
  return true;
}

// ---------------------------------------------------------------------------
// لقطات التقييم (لاكتشاف الانحدار لا للتوثيق فقط)
// ---------------------------------------------------------------------------

export interface EvalSnapshot {
  id: string;
  accuracy: number;
  cases: number;
  failures: number;
  createdAt: string;
}

export async function saveEvalSnapshot(
  userId: string,
  input: { accuracy: number; cases: number; failures: number; detail?: unknown }
): Promise<EvalSnapshot> {
  await init();
  const id = newId('eval');
  const createdAt = new Date().toISOString();
  await run(
    `INSERT INTO analyst_eval_snapshots (id, user_id, accuracy, cases, failures, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, Number(input.accuracy) || 0, Number(input.cases) || 0, Number(input.failures) || 0,
      input.detail === undefined ? null : JSON.stringify(input.detail).slice(0, 4000), createdAt]
  );
  return { id, accuracy: Number(input.accuracy) || 0, cases: Number(input.cases) || 0, failures: Number(input.failures) || 0, createdAt };
}

export async function listEvalSnapshots(userId: string, limit = 20): Promise<EvalSnapshot[]> {
  await init();
  const result = await rows<{ id: string; accuracy: number; cases: number; failures: number; created_at: string }>(
    'SELECT id, accuracy, cases, failures, created_at FROM analyst_eval_snapshots WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    [userId, Math.max(1, Math.min(limit, 100))]
  );
  return result.map((r) => ({ id: r.id, accuracy: Number(r.accuracy), cases: Number(r.cases), failures: Number(r.failures), createdAt: r.created_at }));
}

/**
 * تعبئة الإجابة الفعلية لحالة ذهبية بعد ردّ المساعد — بلا هذا يبقى التقييم
 * يدويًا، ومقياس لا يُغذّى لا يقيس شيئًا.
 * المطابقة على السؤال المطبَّع (بعد إزالة التشكيل وال التعريف) بحدّ تشابه عالٍ.
 */
export async function fillGoldenActual(userId: string, question: string, actual: string): Promise<string | null> {
  await init();
  const cases = await listGolden(userId);
  if (!cases.length) return null;
  const norm = (s: string) => String(s || '')
    .toLowerCase()
    .replace(/[\u064B-\u0652]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const target = norm(question);
  if (!target) return null;
  const best = cases.find((c) => norm(c.question) === target);
  if (!best) return null;
  await run('UPDATE analyst_golden SET actual = ? WHERE id = ? AND user_id = ?', [actual.slice(0, 500), best.id, userId]);
  return best.id;
}

/** عدّادات للعرض في صفحة واحدة. */
export async function analystOverview(userId: string): Promise<{ metrics: number; memory: number; golden: number; artifacts: number; runs: number }> {
  await init();
  const [metrics, memory, golden, artifacts, runs] = await Promise.all([
    one<{ c: number }>('SELECT COUNT(*) AS c FROM analyst_metrics WHERE user_id = ?', [userId]),
    one<{ c: number }>('SELECT COUNT(*) AS c FROM analyst_memory WHERE user_id = ?', [userId]),
    one<{ c: number }>('SELECT COUNT(*) AS c FROM analyst_golden WHERE user_id = ?', [userId]),
    one<{ c: number }>('SELECT COUNT(*) AS c FROM analyst_artifacts WHERE user_id = ?', [userId]),
    one<{ c: number }>('SELECT COUNT(*) AS c FROM analyst_runs WHERE user_id = ?', [userId]),
  ]);
  return {
    metrics: Number(metrics?.c || 0),
    memory: Number(memory?.c || 0),
    golden: Number(golden?.c || 0),
    artifacts: Number(artifacts?.c || 0),
    runs: Number(runs?.c || 0),
  };
}
