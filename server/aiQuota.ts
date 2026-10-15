/**
 * Daily per-user quota for SERVER-KEY AI usage.
 *
 * الهدف: حماية الرصيد المشترك (مفاتيح الخادم في .env مثل OPENROUTER_API_KEY)
 * من النفاد بفرض حد يومي على كل مستخدم/زائر عند استخدامه مفتاح الخادم
 * بدلاً من مفتاحه الخاص.
 *
 * - العدّاد مُخزَّن في جدول ai_usage_daily داخل قاعدة Turso الوحيدة، ويجدد تلقائياً كل يوم UTC.
 * - الزائر غير المسجَّل يُحسب بعنوان IP الخاص به (callerId = ip:<ip>).
 * - استدعاء مفتاح المستخدم الخاص لا يُحسب إطلاقاً (رصيده هو، وليس رصيد المنصة).
 * - limit <= 0 يعني "غير محدود" (يُستخدم للمدير افتراضياً عبر AI_SERVER_ADMIN_DAILY_LIMIT=0).
 *
 * متغيرات البيئة:
 *   AI_SERVER_DAILY_LIMIT        — حد المستخدم العادي يومياً (افتراضي 100 طلب)
 *   AI_SERVER_ADMIN_DAILY_LIMIT  — حد المدير يومياً (افتراضي 0 = غير محدود)
 */
import type { Client, InValue } from '@libsql/client';
import { turso, one, run, ensureSchema } from './turso';

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
  consume(args: { callerId: string; cost?: number; limit: number; day?: string }): Promise<QuotaResult>;
  status(args: { callerId: string; limit: number; day?: string }): Promise<QuotaResult>;
  close(): void;
}

export async function createAiQuotaStore(): Promise<AiQuotaStore> {
  await ensureSchema(turso(), [
    `CREATE TABLE IF NOT EXISTS ai_usage_daily (
      caller_id TEXT NOT NULL,
      day       TEXT NOT NULL,
      requests  INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (caller_id, day)
    )`,
  ]);

  let lastCleanupDay = '';

  // احتفظ بآخر 7 أيام فقط — الجدول سجل استخدام لا حاجة لتاريخه الأقدم
  async function cleanupIfNeeded(day: string) {
    if (lastCleanupDay === day) return;
    lastCleanupDay = day;
    try {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await run('DELETE FROM ai_usage_daily WHERE day < ?', [cutoff]);
    } catch {
      // التنظيف تحسين فقط — لا يُسقط الطلب أبداً
    }
  }

  /** زيادة ذرّية للعداد — ترجع الرصيد الجديد (0 عند نقص الصف: مُدرج ضمن upsert). */
  async function bump(callerId: string, day: string, cost: number): Promise<number> {
    const res = await turso().execute({
      sql: `INSERT INTO ai_usage_daily (caller_id, day, requests) VALUES (?1, ?2, ?3)
            ON CONFLICT(caller_id, day) DO UPDATE SET requests = requests + excluded.requests
            RETURNING requests`,
      args: [callerId, day, cost] as InValue[],
    });
    return Number((res.rows[0] as any)?.requests || 0);
  }

  async function read(callerId: string, day: string): Promise<number> {
    const row = (await one<any>('SELECT requests FROM ai_usage_daily WHERE caller_id = ? AND day = ?', [callerId, day])) as any;
    return Number(row?.requests || 0);
  }

  return {
    async consume({ callerId, cost = 1, limit, day }) {
      const d = day || utcDay();
      const price = Math.max(1, Math.floor(cost));
      const resetAt = nextUtcMidnight();
      await cleanupIfNeeded(d);
      if (limit <= 0) {
        // غير محدود — لكن نُسجّل الاستخدام للشفافية
        const used = await bump(callerId, d, price);
        return { ok: true, used, limit, remaining: -1, resetAt }; // -1 = غير محدود
      }
      const current = await read(callerId, d);
      if (current + price > limit) {
        return { ok: false, used: current, limit, remaining: 0, resetAt };
      }
      const used = await bump(callerId, d, price);
      return { ok: true, used, limit, remaining: Math.max(0, limit - used), resetAt };
    },

    async status({ callerId, limit, day }) {
      const d = day || utcDay();
      await cleanupIfNeeded(d);
      const used = await read(callerId, d);
      return {
        ok: limit <= 0 || used < limit,
        used,
        limit,
        remaining: limit <= 0 ? -1 : Math.max(0, limit - used),
        resetAt: nextUtcMidnight(),
      };
    },

    close() {
      /* العميل المشترك يُغلق مع العملية — لا شيء هنا */
    },
  };
}

let defaultStore: AiQuotaStore | null = null;
async function getDefault(): Promise<AiQuotaStore> {
  defaultStore ??= await createAiQuotaStore();
  return defaultStore;
}

export async function consumeAiQuota(args: { callerId: string; cost?: number; limit: number }): Promise<QuotaResult> {
  return (await getDefault()).consume(args);
}

export async function getAiQuotaStatus(args: { callerId: string; limit: number }): Promise<QuotaResult> {
  return (await getDefault()).status(args);
}
