/**
 * مراقبات الشذوذ المستمرة.
 *
 * لماذا: كشف الشذوذ كان أداة تُفتح يدويًا، أي أنه لا يعمل إلا إذا تذكّر أحدهم
 * فتح التبويب. هنا يُحوَّل إلى رقيب: مراقب على (مجموعة، عمود، دورة) يفحصه
 * الخادم دوريًا، ويُنبّه في المنصة عند ظهور نقطة شاذة جديدة — مع منع التكرار
 * بفترة تهدئة حتى لا يتحول التنبيه إلى ضجيج.
 */

import crypto from 'crypto';
import { ensureSchema, one, rows, run, turso } from '../turso';
import { getUserDataset } from '../datasetsStore';
import { detectAnomalies, type AnomalyPoint } from './anomalyAgent';
import { loadDatasetSource, seriesFromSource } from './sources';
import { pushNotification } from '../notifications';

export type MonitorSensitivity = 'normal' | 'strict';

export interface AnalystMonitor {
  id: string;
  userId: string;
  datasetId: string;
  datasetName: string;
  labelColumn: string;
  valueColumn: string;
  period: number;
  sensitivity: MonitorSensitivity;
  enabled: boolean;
  lastCheckedAt: string | null;
  lastValue: number | null;
  lastScore: number | null;
  lastTriggeredAt: string | null;
  createdAt: string;
}

interface MonitorRow {
  id: string;
  user_id: string;
  dataset_id: string;
  dataset_name: string;
  label_column: string;
  value_column: string;
  period: number;
  sensitivity: string;
  enabled: number;
  last_checked_at: string | null;
  last_value: number | null;
  last_score: number | null;
  last_triggered_at: string | null;
  created_at: string;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS analyst_monitors (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    dataset_id TEXT NOT NULL,
    dataset_name TEXT NOT NULL,
    label_column TEXT NOT NULL,
    value_column TEXT NOT NULL,
    period INTEGER NOT NULL DEFAULT 7,
    sensitivity TEXT NOT NULL DEFAULT 'normal',
    enabled INTEGER NOT NULL DEFAULT 1,
    last_checked_at TEXT,
    last_value REAL,
    last_score REAL,
    last_triggered_at TEXT,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_analyst_monitors_user ON analyst_monitors(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_analyst_monitors_enabled ON analyst_monitors(enabled)`,
];

/** لا تنبيهان متتاليان لنفس المراقب خلال هذه المدة. */
const COOLDOWN_MS = 12 * 60 * 60 * 1000;

let ready: Promise<void> | null = null;
async function init(): Promise<void> {
  ready ??= ensureSchema(turso(), SCHEMA);
  await ready;
}

function toMonitor(row: MonitorRow): AnalystMonitor {
  return {
    id: row.id,
    userId: row.user_id,
    datasetId: row.dataset_id,
    datasetName: row.dataset_name,
    labelColumn: row.label_column,
    valueColumn: row.value_column,
    period: Number(row.period) || 7,
    sensitivity: row.sensitivity === 'strict' ? 'strict' : 'normal',
    enabled: Boolean(row.enabled),
    lastCheckedAt: row.last_checked_at,
    lastValue: row.last_value,
    lastScore: row.last_score,
    lastTriggeredAt: row.last_triggered_at,
    createdAt: row.created_at,
  };
}

export async function listMonitors(userId: string): Promise<AnalystMonitor[]> {
  await init();
  const result = await rows<MonitorRow>(
    'SELECT * FROM analyst_monitors WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );
  return result.map(toMonitor);
}

export interface MonitorInput {
  datasetId: string;
  labelColumn?: string;
  valueColumn: string;
  period?: number;
  sensitivity?: MonitorSensitivity;
}

export async function createMonitor(userId: string, input: MonitorInput): Promise<AnalystMonitor> {
  await init();
  if (!input?.datasetId) throw new Error('datasetId مطلوب');
  if (!input?.valueColumn) throw new Error('valueColumn مطلوب');
  const dataset = await getUserDataset(userId, input.datasetId);
  if (!dataset) throw new Error('المجموعة غير موجودة أو لا تخص هذا المستخدم');
  const source = await loadDatasetSource(userId, input.datasetId);
  if (!source) throw new Error('المجموعة فارغة — لا يمكن مراقبة عمود فيها');
  const exists = source.columns.some((c) => c.name === input.valueColumn);
  if (!exists) throw new Error(`العمود ${input.valueColumn} غير موجود في المجموعة`);

  const monitor: AnalystMonitor = {
    id: `mon-${crypto.randomUUID().slice(0, 12)}`,
    userId,
    datasetId: source.id,
    datasetName: source.name,
    labelColumn: input.labelColumn || '',
    valueColumn: input.valueColumn,
    period: Math.max(2, Math.min(Number(input.period) || 7, 60)),
    sensitivity: input.sensitivity === 'strict' ? 'strict' : 'normal',
    enabled: true,
    lastCheckedAt: null,
    lastValue: null,
    lastScore: null,
    lastTriggeredAt: null,
    createdAt: new Date().toISOString(),
  };
  await run(
    `INSERT INTO analyst_monitors
      (id, user_id, dataset_id, dataset_name, label_column, value_column, period, sensitivity, enabled, last_checked_at, last_value, last_score, last_triggered_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL, NULL, NULL, ?)`,
    [
      monitor.id, monitor.userId, monitor.datasetId, monitor.datasetName,
      monitor.labelColumn, monitor.valueColumn, monitor.period, monitor.sensitivity, monitor.createdAt,
    ]
  );
  return monitor;
}

export async function deleteMonitor(userId: string, id: string): Promise<boolean> {
  await init();
  const existing = await one<{ id: string }>('SELECT id FROM analyst_monitors WHERE id = ? AND user_id = ?', [id, userId]);
  if (!existing) return false;
  await run('DELETE FROM analyst_monitors WHERE id = ? AND user_id = ?', [id, userId]);
  return true;
}

export async function setMonitorEnabled(userId: string, id: string, enabled: boolean): Promise<boolean> {
  await init();
  const existing = await one<{ id: string }>('SELECT id FROM analyst_monitors WHERE id = ? AND user_id = ?', [id, userId]);
  if (!existing) return false;
  await run('UPDATE analyst_monitors SET enabled = ? WHERE id = ? AND user_id = ?', [enabled ? 1 : 0, id, userId]);
  return true;
}

export interface MonitorSweepResult {
  checked: number;
  triggered: number;
  skipped: number;
  errors: string[];
  alerts: Array<{ monitorId: string; datasetName: string; headline: string; point: AnomalyPoint }>;
}

/**
 * فحص كل المراقبات المفعّلة (أو مراقبات مستخدم واحد عند تمريره).
 * لا يرمي أبدًا: فشل مراقب واحد يُسجَّل ولا يُسقط البقية.
 */
export async function runMonitorSweep(userId?: string): Promise<MonitorSweepResult> {
  await init();
  const active = userId
    ? await rows<MonitorRow>('SELECT * FROM analyst_monitors WHERE enabled = 1 AND user_id = ?', [userId])
    : await rows<MonitorRow>('SELECT * FROM analyst_monitors WHERE enabled = 1', []);
  const result: MonitorSweepResult = { checked: 0, triggered: 0, skipped: 0, errors: [], alerts: [] };
  const now = new Date();

  for (const row of active) {
    const monitor = toMonitor(row);
    try {
      const source = await loadDatasetSource(monitor.userId, monitor.datasetId);
      if (!source) {
        result.errors.push(`${monitor.id}: dataset missing`);
        continue;
      }
      const series = seriesFromSource(source, monitor.labelColumn || undefined, monitor.valueColumn);
      if (series.length < Math.max(4, monitor.period + 2)) {
        result.skipped += 1;
        continue;
      }
      const report = detectAnomalies(series, monitor.period);
      result.checked += 1;
      const last = series[series.length - 1];
      await run('UPDATE analyst_monitors SET last_checked_at = ?, last_value = ? WHERE id = ?', [
        now.toISOString(), last?.value ?? null, monitor.id,
      ]);
      if (!report.points.length) continue;

      const relevant = monitor.sensitivity === 'strict'
        ? report.points
        : report.points.filter((p) => p.severity === 'high');
      if (!relevant.length) continue;

      const worst = relevant.reduce((a, b) => (Math.abs(b.score) > Math.abs(a.score) ? b : a));
      await run('UPDATE analyst_monitors SET last_score = ? WHERE id = ?', [worst.score, monitor.id]);

      const lastTriggered = monitor.lastTriggeredAt ? Date.parse(monitor.lastTriggeredAt) : 0;
      if (now.getTime() - lastTriggered < COOLDOWN_MS) {
        result.skipped += 1;
        continue;
      }

      result.triggered += 1;
      result.alerts.push({
        monitorId: monitor.id,
        datasetName: monitor.datasetName,
        headline: worst.explanation,
        point: worst,
      });
      await pushNotification(
        monitor.userId,
        'analyst_anomaly',
        `شذوذ في ${monitor.datasetName} — ${monitor.valueColumn}`,
        worst.explanation,
        {
          monitorId: monitor.id,
          datasetId: monitor.datasetId,
          valueColumn: monitor.valueColumn,
          score: worst.score,
          severity: worst.severity,
          label: worst.label,
        }
      );
      await run('UPDATE analyst_monitors SET last_triggered_at = ? WHERE id = ?', [now.toISOString(), monitor.id]);
    } catch (error) {
      result.errors.push(`${monitor.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}

let timer: NodeJS.Timeout | null = null;

/** كل ٣٠ دقيقة: تكفي لكشف مبكر بلا ضغط، والفحص رخيص حين لا مراقبات. */
export function startAnalystMonitorScheduler(intervalMs = 30 * 60 * 1000): void {
  if (timer) return;
  const tick = async () => {
    try {
      const result = await runMonitorSweep();
      if (result.triggered > 0 || result.errors.length) {
        console.log(`[analyst-monitors] checked ${result.checked}, triggered ${result.triggered}`);
        result.errors.slice(0, 5).forEach((m) => console.warn('[analyst-monitors]', m));
      }
    } catch (error) {
      console.warn('[analyst-monitors] sweep failed:', error instanceof Error ? error.message : String(error));
    }
  };
  timer = setInterval(() => void tick(), intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  setTimeout(() => void tick(), 90_000).unref?.();
}
