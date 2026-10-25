/**
 * حصة استخدام مفتاح الخادم اليومية (Quota) — طبقة الخدمة للواجهة.
 *
 * الخادم يفرض حصة يومية لكل مستخدم لكل استدعاء يمتطي مفتاح الخادم:
 *   - GET  /api/ai/quota          → رصيد المتصل الحالي (مُستخدم/حد/تجدد)
 *   - 429 + { error, quota }      → عند نفاذ الحصة في أي استدعاء AI
 *   - X-AI-Quota-Remaining عقب كل استدعاء ناجح
 *
 * الحصة لا تُخصّ:
 *   - محرك Ollama المحلي (بلا رصيد)، ولا طلبيات مفتاح المستخدم الخاص (BYOK).
 * ملتصق بالعقد نفسها التي يخدمها server.ts دون أي افتراض إضافي.
 */
import { aiAuthHeaders } from '../utils/aiAccessGuard';

export interface AiQuotaInfo {
  /** false = الحصة منتهية — الاستدعاءات التالية عبر مفتاح الخادم سترفض بـ 429 */
  ok: boolean;
  used: number;
  limit: number;
  /** -1 = غير محدود (المدير افتراضياً) */
  remaining: number;
  /** لحظة التجدد التلقائي (منتصف ليل UTC) */
  resetAt: string;
  unlimited: boolean;
  authenticated: boolean;
}

/** يجلب رصيد الحصة الحالي للمتصل (null عند تعذر الوصول — لا يُسقط الـ UI إطلاقاً). */
export async function fetchAiQuota(): Promise<AiQuotaInfo | null> {
  try {
    const res = await fetch('/api/ai/quota', {
      headers: { accept: 'application/json', ...aiAuthHeaders() },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const d = await res.json();
    if (d === null || typeof d !== 'object') return null;
    return {
      ok: Boolean(d.ok),
      used: Number(d.used) || 0,
      limit: Number(d.limit) || 0,
      remaining: Number(d.remaining) || 0,
      resetAt: typeof d.resetAt === 'string' ? d.resetAt : '',
      unlimited: Boolean(d.unlimited),
      authenticated: Boolean(d.authenticated),
    };
  } catch {
    return null;
  }
}

/**
 * يحوّل 429 أو نص/جسم خطأ يحتوي payload الحصة إلى AiQuotaExhaustedError،
 * وإلا يرجع null ليستمر التعامل مع الخطأ كخطأ عادي.
 */
export function parseQuotaPayload(payload: unknown): AiQuotaInfo | null {
  const q = (payload as any)?.quota;
  if (!q) return null;
  const limit = Number(q.limit);
  if (!Number.isFinite(limit) || limit <= 0) return null;
  return {
    ok: false,
    used: Number(q.used) || 0,
    limit,
    remaining: Number(q.remaining) || 0,
    resetAt: typeof q.resetAt === 'string' ? q.resetAt : '',
    unlimited: false,
    authenticated: true,
  };
}

/**
 * خطأ الحصة المنتهية — ترمي مواضع fetch عند 429 بمحتوى الحصة ليُعرض للـ UI
 * بفصلٍ عن بقية أخطاء الشبكة/المزود.
 */
export class AiQuotaExhaustedError extends Error {
  readonly quota: AiQuotaInfo;
  constructor(quota: AiQuotaInfo, public readonly serverMessage?: string) {
    super(serverMessage || 'AI quota exhausted');
    this.name = 'AiQuotaExhaustedError';
  }
}

/** يصنف استجابة fetch لاستدعاء AI: يرمي خطاً عند الاجتماع 429/نفاذ الحصة. */
export async function assertAiResponseQuotaOk(res: Response): Promise<Response> {
  if (res.status !== 429) return res;
  const data = await res.clone().json().catch(() => null);
  const quota = parseQuotaPayload(data);
  if (quota) throw new AiQuotaExhaustedError(quota, (data as any)?.error);
  return res;
}

/** صورة تبقّى للتجدد: "يتجدد بعد 2 س 5 د" / "resets in 2h 5m". */
export function timeUntilReset(resetAt: string, now: Date = new Date()): { hours: number; minutes: number } {
  const target = new Date(resetAt).getTime();
  if (!Number.isFinite(target)) return { hours: 0, minutes: 0 };
  const ms = Math.max(0, target - now.getTime());
  return { hours: Math.floor(ms / 3_600_000), minutes: Math.ceil((ms % 3_600_000) / 60000) };
}

export function formatResetCountdown(resetAt: string, isAr: boolean, now: Date = new Date()): string {
  const { hours, minutes } = timeUntilReset(resetAt, now);
  const h = isAr ? 'س' : 'h';
  const m = isAr ? 'د' : 'm';
  if (hours === 0 && minutes === 0) return isAr ? 'الآن' : 'now';
  if (hours === 0) return `${minutes} ${m}`;
  if (minutes === 0) return `${hours} ${h}`;
  return `${hours} ${h} ${minutes} ${m}`;
}

/** رسالة نفاذ جاهزة للشرح — Used في toast/banners المختلفة للتوحيد اللغة. */
export function formatQuotaExhaustedMessage(quota: AiQuotaInfo, isAr: boolean, now: Date = new Date()): {
  title: string;
  description: string;
} {
  const prefix = isAr ? 'يتجدد الحد تلقائياً بعد ' : 'Resets automatically in ';
  const countdown = formatResetCountdown(quota.resetAt, isAr, now);
  if (isAr) {
    return {
      title: 'انتهت حصة اليوم لاستخدام مفتاح المنصة',
      description: `استهلكت الحصة اليومية (${quota.used}/${quota.limit} طلب). ${prefix}${countdown} — أو أضف مفتاحك الخاص من إعدادات النماذج لتصبح بلا حدود (المفتاح يبقى في متصفحك فقط).`,
    };
  }
  return {
    title: 'Daily server-key quota exhausted',
    description: `You used your daily allowance (${quota.used}/${quota.limit} requests). ${prefix}${countdown} — or add your own key in model settings for unlimited use (the key stays in your browser only).`,
  };
}
