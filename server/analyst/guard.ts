/**
 * حدود استخدام مسارات المحلل.
 *
 * لماذا: كل مسارات /api/analyst محميّة بالجلسة فقط، وجسم الطلب يصل إلى 50MB،
 * والمحرّكات تمرّ على مصفوفات عشوائية بتعقيد خطّي. مستخدم واحد مسجَّل يستطيع
 * إشغال المعالج بطلب واحد. هنا سقف نافذة زمنية بسيط لكل مستخدم، مرتّب بحسب
 * نوع العمل (حساب ثقيل ← نافذة أضيق)، مع رؤوس Retry-After صريحة.
 */

interface Bucket {
  tokens: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface BudgetResult {
  ok: boolean;
  retryAfterMs: number;
  remaining: number;
}

/**
 * نافذة منزلقة مبسّطة (ثابتة). تكفي لمنع الإساءة العادية، ولا تحتاج مخزنًا
 * خارجيًا — التوزيع على عدّة عمليات يبقى مقبولًا لأن السقف حماية لا فوترة.
 */
export function consumeAnalystBudget(
  userId: string,
  scope: string,
  cost = 1,
  limit = 120,
  windowMs = 60_000
): BudgetResult {
  if (!userId) return { ok: false, retryAfterMs: windowMs, remaining: 0 };
  const key = `${userId}:${scope}`;
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { tokens: limit, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  if (bucket.tokens < cost) {
    return { ok: false, retryAfterMs: Math.max(0, bucket.resetAt - now), remaining: bucket.tokens };
  }
  bucket.tokens -= cost;
  return { ok: true, retryAfterMs: 0, remaining: bucket.tokens };
}

/** تنظيف دوري بسيط كي لا تتضخّم الخريطة في عملية طويلة. */
export function pruneAnalystBudgets(now = Date.now()): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** للاختبارات فقط. */
export function resetAnalystBudgets(): void {
  buckets.clear();
}
