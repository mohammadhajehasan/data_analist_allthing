/**
 * Daily per-user quota for SERVER-KEY AI usage.
 *
 * الهدف: حماية الرصيد المشترك (مفاتيح الخادم في .env مثل OPENROUTER_API_KEY)
 * من النفاد بفرض حد يومي على كل مستخدم/زائر عند استخدامه مفتاح الخادم
 * بدلاً من مفتاحه الخاص.
 *
 * - العدّاد يُخزَّن في data/auth.db (جدول ai_usage_daily) ويتجدد تلقائياً كل يوم UTC.
 * - الزائر غير المسجَّل يُحسب بعنوان IP الخاص به (callerId = ip:<ip>).
 * - استدعاء مفتاح المستخدم الخاص لا يُحسب إطلاقاً (رصيده هو، وليس رصيد المنصة).
 * - limit <= 0 يعني "غير محدود" (يُستخدم للمدير افتراضياً عبر AI_SERVER_ADMIN_DAILY_LIMIT=0).
 *
 * متغيرات البيئة:
 *   AI_SERVER_DAILY_LIMIT        — حد المستخدم العادي يومياً (افتراضي 100 طلب)
 *   AI_SERVER_ADMIN_DAILY_LIMIT  — حد المدير يومياً (افتراضي 0 = غير محدود)
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export interface QuotaResult {
  ok: boolean;
  used: number;
  limit: number;
  remaining: number;
  resetAt: string;
}

export function utcDay(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** بداية اليوم التالي بتوقيت UTC — لحظة تجدد الحصة */
export function nextUtcMidnight(d: Date = new Date()): string {
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
  return next.toISOString();
}

export function getUserDailyLimit(): number {
  const n = parseInt(process.env.AI_SERVER_DAILY_LIMIT || '', 10);
  return Number.isFinite(n) ? n : 100;
}

export function getAdminDailyLimit(): number {
  const n = parseInt(process.env.AI_SERVER_ADMIN_DAILY_LIMIT || '', 10);
  return Number.isFinite(n) ? n : 0; // 0 = غير محدود للمدير افتراضياً
}

export interface AiQuotaStore {
  consume(args: { callerId: string; cost?: number; limit: number; day?: string }): QuotaResult;
  status(args: { callerId: string; limit: number; day?: string }): QuotaResult;
  close(): void;
}

export function createAiQuotaStore(dbPath: string): AiQuotaStore {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_usage_daily (
      caller_id TEXT NOT NULL,
      day       TEXT NOT NULL,
      requests  INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (caller_id, day)
    )
  `);

  let lastCleanupDay = '';

  function cleanupIfNeeded(day: string) {
    if (lastCleanupDay === day) return;
    lastCleanupDay = day;
    try {
      // احتفظ بآخر 7 أيام فقط — الجدول سجل استخدام لا حاجة لتاريخه الأقدم
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      db.prepare('DELETE FROM ai_usage_daily WHERE day < ?').run(cutoff);
    } catch {
      // التنظيف تحسين فقط — لا يُسقط الطلب أبداً
    }
  }

  const getRow = db.prepare('SELECT requests FROM ai_usage_daily WHERE caller_id = ? AND day = ?');
  const insertRow = db.prepare('INSERT INTO ai_usage_daily (caller_id, day, requests) VALUES (?, ?, ?)');
  const updateRow = db.prepare('UPDATE ai_usage_daily SET requests = requests + ? WHERE caller_id = ? AND day = ?');

  const consume = db.transaction((callerId: string, cost: number, limit: number, day: string): QuotaResult => {
    cleanupIfNeeded(day);
    const resetAt = nextUtcMidnight();
    if (limit <= 0) {
      // غير محدود — لكن نُسجّل الاستخدام للشفافية
      const current = (getRow.get(callerId, day) as { requests: number } | undefined)?.requests || 0;
      if (current === 0) insertRow.run(callerId, day, cost);
      else updateRow.run(cost, callerId, day);
      return { ok: true, used: current + cost, limit, remaining: -1, resetAt }; // -1 = غير محدود
    }
    const current = (getRow.get(callerId, day) as { requests: number } | undefined)?.requests || 0;
    const projected = current + cost;
    if (projected > limit) {
      return { ok: false, used: current, limit, remaining: 0, resetAt };
    }
    if (current === 0) insertRow.run(callerId, day, cost);
    else updateRow.run(cost, callerId, day);
    const used = current + cost;
    return { ok: true, used, limit, remaining: Math.max(0, limit - used), resetAt };
  });

  return {
    consume({ callerId, cost = 1, limit, day }) {
      const d = day || utcDay();
      return consume(callerId, Math.max(1, Math.floor(cost)), limit, d);
    },
    status({ callerId, limit, day }) {
      const d = day || utcDay();
      cleanupIfNeeded(d);
      const used = (getRow.get(callerId, d) as { requests: number } | undefined)?.requests || 0;
      return {
        ok: limit <= 0 || used < limit,
        used,
        limit,
        remaining: limit <= 0 ? -1 : Math.max(0, limit - used),
        resetAt: nextUtcMidnight(),
      };
    },
    close() {
      db.close();
    },
  };
}

const defaultStore = createAiQuotaStore(path.join(process.cwd(), 'data', 'auth.db'));

export function consumeAiQuota(args: { callerId: string; cost?: number; limit: number }): QuotaResult {
  return defaultStore.consume(args);
}

export function getAiQuotaStatus(args: { callerId: string; limit: number }): QuotaResult {
  return defaultStore.status(args);
}
