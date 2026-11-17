/**
 * تنبيهات القيم على مجموعات البيانات المحفوظة.
 *
 * الفكرة: بدل فتح المنصة كل صباح لترى إن تغيّر الرقم، تُعرّف تنبيهًا على عمود
 * (فوق/تحت حد، أو تغيّر نسبي)، ويفحصه الخادم دوريًا ويرسل بريدًا عند التجاوز.
 * التقييم يتم على أحدث قيمة رقمية فعلية في العمود، ويُسجَّل آخر فحص وآخر
 * تنبيه حتى لا يتكرر البريد نفسه كل ساعة.
 */
import crypto from 'crypto';
import { rows, one, run, ensureSchema, turso } from './turso';
import { getUserDataset } from './datasetsStore';
import { sendEmail } from './emailInvites';

export type AlertCondition = 'above' | 'below' | 'change_above' | 'change_below';

export interface StoredAlert {
  id: string;
  user_id: string;
  dataset_id: string;
  dataset_name: string;
  column: string;
  condition: AlertCondition;
  threshold: number;
  email: string;
  enabled: number;
  last_checked_at: string | null;
  last_value: number | null;
  last_triggered_at: string | null;
  created_at: string;
}

export interface AlertInput {
  datasetId: string;
  datasetName?: string;
  column: string;
  condition: AlertCondition;
  threshold: number;
  email: string;
}

/** لا نرسل أكثر من بريد واحد لكل تنبيه في هذه المدة. */
const COOLDOWN_MS = 6 * 60 * 60 * 1000;
/** عدد الصفوف التي تُقارن بها القيمة لحساب التغير. */
const CHANGE_LOOKBACK = 7;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS dataset_alerts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  dataset_id TEXT NOT NULL,
  dataset_name TEXT NOT NULL,
  column TEXT NOT NULL,
  condition TEXT NOT NULL CHECK (condition IN ('above','below','change_above','change_below')),
  threshold REAL NOT NULL,
  email TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_checked_at TEXT,
  last_value REAL,
  last_triggered_at TEXT,
  created_at TEXT NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS idx_alerts_user ON dataset_alerts(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_alerts_enabled ON dataset_alerts(enabled)`,
];

let schemaReady: Promise<void> | null = null;
async function init(): Promise<void> {
  schemaReady ??= ensureSchema(turso(), SCHEMA);
  await schemaReady;
}

export async function listAlerts(userId: string): Promise<StoredAlert[]> {
  await init();
  return rows<StoredAlert>(
    'SELECT * FROM dataset_alerts WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );
}

export async function createAlert(userId: string, input: AlertInput): Promise<StoredAlert> {
  await init();
  const conditions: AlertCondition[] = ['above', 'below', 'change_above', 'change_below'];
  if (!input.datasetId || !input.column) throw new Error('المجموعة والعمود مطلوبان');
  if (!conditions.includes(input.condition)) throw new Error('شرط التنبيه غير معروف');
  if (!Number.isFinite(input.threshold)) throw new Error('الحد يجب أن يكون رقمًا');
  const email = String(input.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('بريد غير صالح');

  const dataset = await getUserDataset(userId, input.datasetId);
  if (!dataset) throw new Error('المجموعة غير موجودة أو لا تخص هذا المستخدم');

  const alert: StoredAlert = {
    id: crypto.randomUUID(),
    user_id: userId,
    dataset_id: input.datasetId,
    dataset_name: input.datasetName || dataset.name,
    column: input.column,
    condition: input.condition,
    threshold: input.threshold,
    email,
    enabled: 1,
    last_checked_at: null,
    last_value: null,
    last_triggered_at: null,
    created_at: new Date().toISOString(),
  };
  await run(
    `INSERT INTO dataset_alerts
       (id, user_id, dataset_id, dataset_name, column, condition, threshold, email, enabled, last_checked_at, last_value, last_triggered_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL, NULL, ?)`,
    [
      alert.id,
      alert.user_id,
      alert.dataset_id,
      alert.dataset_name,
      alert.column,
      alert.condition,
      alert.threshold,
      alert.email,
      alert.created_at,
    ]
  );
  return alert;
}

export async function deleteAlert(userId: string, id: string): Promise<boolean> {
  await init();
  return (await run('DELETE FROM dataset_alerts WHERE id = ? AND user_id = ?', [id, userId])) > 0;
}

export async function setAlertEnabled(userId: string, id: string, enabled: boolean): Promise<boolean> {
  await init();
  return (await run('UPDATE dataset_alerts SET enabled = ? WHERE id = ? AND user_id = ?', [enabled ? 1 : 0, id, userId])) > 0;
}

/** يقرأ أحدث قيمة رقمية في العمود والقيمة المرجعية لحساب التغير. */
export function latestNumeric(data: Record<string, unknown>[], column: string): { latest: number | null; previous: number | null } {
  const values: number[] = [];
  for (let i = data.length - 1; i >= 0 && values.length <= CHANGE_LOOKBACK; i -= 1) {
    const raw = data[i]?.[column];
    const parsed = typeof raw === 'number' ? raw : Number(String(raw ?? '').replace(/,/g, '').trim());
    if (Number.isFinite(parsed)) values.push(parsed);
  }
  return {
    latest: values.length > 0 ? values[0] : null,
    previous: values.length > 1 ? values[values.length - 1] : null,
  };
}

export function shouldTrigger(
  condition: AlertCondition,
  threshold: number,
  latest: number | null,
  previous: number | null
): boolean {
  if (latest === null) return false;
  switch (condition) {
    case 'above':
      return latest > threshold;
    case 'below':
      return latest < threshold;
    case 'change_above':
    case 'change_below': {
      if (previous === null || previous === 0) return false;
      const changePct = ((latest - previous) / Math.abs(previous)) * 100;
      return condition === 'change_above' ? changePct > threshold : changePct < -Math.abs(threshold);
    }
    default:
      return false;
  }
}

function conditionText(condition: AlertCondition, threshold: number, ar: boolean): string {
  switch (condition) {
    case 'above':
      return ar ? `أعلى من ${threshold}` : `above ${threshold}`;
    case 'below':
      return ar ? `أدنى من ${threshold}` : `below ${threshold}`;
    case 'change_above':
      return ar ? `تغيّر نسبي أكبر من +${threshold}%` : `change above +${threshold}%`;
    default:
      return ar ? `تغيير نسبي أكبر من -${Math.abs(threshold)}%` : `change below -${Math.abs(threshold)}%`;
  }
}

export async function sendAlertEmail(alert: StoredAlert, latest: number, previous: number | null): Promise<{ sent: boolean; error?: string }> {
  const ar = true;
  const changeLine =
    previous !== null && previous !== 0
      ? `${ar ? 'القيمة السابقة' : 'Previous'}: ${previous} — ${(((latest - previous) / Math.abs(previous)) * 100).toFixed(2)}%`
      : '';
  const subject = ar
    ? `تنبيه: ${alert.dataset_name} — ${alert.column} عند ${latest}`
    : `Alert: ${alert.dataset_name} — ${alert.column} at ${latest}`;
  const html = `
    <div style="font-family:system-ui,Arial,sans-serif;direction:rtl;text-align:right">
      <h2 style="margin:0 0 8px">تنبيه على مجموعة بيانات</h2>
      <p style="margin:0 0 4px"><strong>${alert.dataset_name}</strong> — العمود <code>${alert.column}</code></p>
      <p style="margin:0 0 4px">الشرط: ${conditionText(alert.condition, alert.threshold, ar)}</p>
      <p style="margin:0 0 4px">القيمة الحالية: <strong>${latest}</strong></p>
      <p style="margin:0">${changeLine}</p>
      <p style="margin:12px 0 0;color:#666;font-size:12px">أُرسل من منصة التحليل — يمكنك إيقاف التنبيه من صفحة التنبيهات.</p>
    </div>`;
  const result = await sendEmail(
    {
      to: alert.email,
      subject,
      html,
      text: `${alert.dataset_name} / ${alert.column}: ${latest} (${conditionText(alert.condition, alert.threshold, false)})`,
    },
    'alert'
  );
  return result.sent ? { sent: true } : { sent: false, error: (result as { error?: string }).error };
}

export interface SweepResult {
  checked: number;
  triggered: number;
  emails: number;
  errors: string[];
}

/** فحص كل التنبيهات المفعّلة — يُستدعى من المجدول أو يدويًا من الواجهة. */
export async function runAlertSweep(now: Date = new Date()): Promise<SweepResult> {
  await init();
  const active = await rows<StoredAlert>('SELECT * FROM dataset_alerts WHERE enabled = 1');
  const result: SweepResult = { checked: 0, triggered: 0, emails: 0, errors: [] };
  const datasets = new Map<string, Record<string, unknown>[]>();

  for (const alert of active) {
    try {
      const key = `${alert.user_id}:${alert.dataset_id}`;
      let data = datasets.get(key);
      if (!data) {
        const stored = await getUserDataset(alert.user_id, alert.dataset_id);
        if (!stored) {
          result.errors.push(`${alert.id}: dataset missing`);
          continue;
        }
        const parsed = JSON.parse(stored.payload) as { data?: Record<string, unknown>[] };
        data = Array.isArray(parsed.data) ? parsed.data : [];
        datasets.set(key, data);
      }
      const { latest, previous } = latestNumeric(data, alert.column);
      result.checked += 1;
      if (latest === null) continue;

      const fire = shouldTrigger(alert.condition, alert.threshold, latest, previous);
      const lastTriggered = alert.last_triggered_at ? Date.parse(alert.last_triggered_at) : 0;
      const cooling = now.getTime() - lastTriggered < COOLDOWN_MS;

      await run('UPDATE dataset_alerts SET last_checked_at = ?, last_value = ? WHERE id = ?', [
        now.toISOString(),
        latest,
        alert.id,
      ]);

      if (fire && !cooling) {
        result.triggered += 1;
        const sent = await sendAlertEmail(alert, latest, previous);
        if (sent.sent) {
          result.emails += 1;
          await run('UPDATE dataset_alerts SET last_triggered_at = ? WHERE id = ?', [now.toISOString(), alert.id]);
        } else if (sent.error) {
          result.errors.push(`${alert.id}: ${sent.error}`);
        }
      }
    } catch (error) {
      result.errors.push(`${alert.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}

let schedulerTimer: NodeJS.Timeout | null = null;

/** يبدأ المجدول الدوري (كل ساعة) — لا يفعل شيئًا إن لم توجد تنبيهات. */
export function startAlertScheduler(intervalMs = 60 * 60 * 1000): void {
  if (schedulerTimer) return;
  const tick = async () => {
    try {
      const result = await runAlertSweep();
      if (result.triggered > 0 || result.errors.length > 0) {
        console.log(`[alerts] checked ${result.checked}, triggered ${result.triggered}, emails ${result.emails}`);
        result.errors.forEach((message) => console.warn('[alerts]', message));
      }
    } catch (error) {
      console.warn('[alerts] sweep failed:', error instanceof Error ? error.message : String(error));
    }
  };
  schedulerTimer = setInterval(() => void tick(), intervalMs);
  if (typeof schedulerTimer.unref === 'function') schedulerTimer.unref();
  // أول فحص بعد دقيقة من الإقلاع حتى لا يزاحم تحميل المخطط.
  setTimeout(() => void tick(), 60_000).unref?.();
}
