/**
 * التحقق من البريد الإلكتروني عند إنشاء الحساب.
 *
 * الهدف: منع إنشاء حسابات ببريد وهمي — لا يُنشأ المستخدم إلا بعد إدخال رمز
 * تحقق من 6 أرقام أُرسل إلى البريد نفسه عبر سلسلة المزودين في emailInvites.ts
 * (Gmail/Google → Brevo → Resend → AgentMail → SMTP).
 *
 * - الرمز يُخزَّن مُهشّراً (SHA-256) في جدول signup_verifications، صلاحيته
 *   10 دقائق، 6 محاولات كحد أقصى، وفاصل 60 ثانية بين الطلبات.
 * - البريد يُطبَّع (trim + lowercase) ويُرفض إن كان بصيغة غير صالحة أو من نطاق
 *   بريد مؤقت شائع.
 * - في التطوير فقط (SIGNUP_VERIFICATION_DEV_CODE=1) يُعاد الرمز للعميل لتسهيل
 *   التجربة عندما لا يوجد مزود بريد مُعد — لا يُعاد إطلاقاً في الإنتاج.
 */
import crypto from 'crypto';
import { turso, one, run, ensureSchema, isTransientDbError } from './turso';
import { sendEmail } from './emailInvites';
import { findUserByEmail } from './auth';

/**
 * رسالة واحدة مفهومة للانقطاع المؤقت في التخزين — بدل «fetch failed» أو
 * «502» التي لا تفيد المستخدم بشيء.
 */
export const TEMPORARY_OUTAGE_MESSAGE =
  'خدمة إنشاء الحساب غير متاحة مؤقتًا ولم يُرسل أي رمز. أعد المحاولة بعد لحظات.';

const RETRY_DELAY_MS = 400;

/**
 * إعادة محاولة واحدة للأخطاء العابرة (انقطاع شبكة، 502/503، مهلة).
 * لا تُعاد المحاولة لأخطاء منطقية مثل بريد مسجّل أو فاصل إرسال.
 */
export async function retryOnceOnTransient<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isTransientDbError(error)) throw error;
    console.warn(`[signup] transient failure, retrying once: ${error instanceof Error ? error.message : String(error)}`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return operation();
  }
}

/**
 * هل فشل الإرسال نهائيًا بلا أي احتمال أن يكون البريد قد خرج؟
 * غياب المزوّد أو رفض صريح من الـ API: لا شيء أُرسل ⇒ نستطيع حذف الرمز.
 * مهلة/انقطاع: قد يكون المزوّد قبِل الرسالة ⇒ نحتفظ بالرمز حتى لا يصبح
 * الرمز الذي وصل المستخدم بلا قيمة.
 */
export function isDefinitiveSendFailure(error?: string): boolean {
  const text = String(error || '');
  if (!text) return false;
  return /لا مزود بريد مُعد|no provider|not configured|missing api key|invalid api key|unauthorized|401|403/i.test(text);
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS signup_verifications (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
)`,
];

let schemaReady: Promise<void> | null = null;
function init(): Promise<void> {
  schemaReady ??= ensureSchema(turso(), SCHEMA).catch(err => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

export const CODE_TTL_MS = 10 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 6;

/** نطاقات بريد مؤقت/وهمي شائعة — لا تُقبل لحسابات جديدة. */
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'tempmail.com', 'temp-mail.org', '10minutemail.com', 'guerrillamail.com',
  'sharklasers.com', 'yopmail.com', 'trashmail.com', 'dispostable.com', 'fakeinbox.com',
  'getnada.com', 'maildrop.cc', 'throwawaymail.com', 'mintemail.com', 'mailnesia.com',
]);

export interface EmailValidation {
  ok: boolean;
  normalized: string;
  reason?: string;
}

export function validateSignupEmail(email: string): EmailValidation {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return { ok: false, normalized, reason: 'البريد الإلكتروني مطلوب' };
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(normalized)) {
    return { ok: false, normalized, reason: 'صيغة البريد الإلكتروني غير صحيحة' };
  }
  const [local, domain] = normalized.split('@');
  if (!local || local.length > 64 || domain.length > 255) {
    return { ok: false, normalized, reason: 'البريد الإلكتروني غير صالح' };
  }
  if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) {
    return { ok: false, normalized, reason: 'نطاق البريد غير صالح' };
  }
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { ok: false, normalized, reason: 'لا تُقبل نطاقات البريد المؤقت — استخدم بريداً حقيقياً' };
  }
  return { ok: true, normalized };
}

function hashOf(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function generateCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  return `${user.slice(0, 2)}***@${domain}`;
}

export interface SignupCodeResult {
  ok: boolean;
  message: string;
  email?: string;
  expiresAt?: string;
  retryAfterMs?: number;
  /** هل أُرسل البريد فعلاً عبر مزود مُعد؟ */
  delivered?: boolean;
  /**
   * فشل إرسال غير قاطع (مهلة/انقطاع): الرمز قد يكون وصل بالفعل، ولذلك يُبقى
   * صالحًا في قاعدة البيانات ويمكن للمستخدم تجربته.
   */
  deliveryUncertain?: boolean;
  /** في التطوير فقط — الرمز صراحةً للاختبار */
  devCode?: string;
}

function buildCodeEmail(code: string, ttlMinutes: number): { text: string; html: string } {
  const text = `رمز التحقق لإنشاء حسابك هو: ${code}\n\nصالح لمدة ${ttlMinutes} دقائق. إن لم تطلب إنشاء حساب تجاهل هذه الرسالة.`;
  const html = `<!doctype html><html dir="rtl" lang="ar"><body style="margin:0;padding:24px;background:#f4f4f4;font-family:Segoe UI,Tahoma,Arial,sans-serif;color:#161616">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e0e0e0">
    <tr><td style="background:#0f62fe;padding:18px 24px;color:#ffffff;font-size:16px;font-weight:bold">تحقق من بريدك الإلكتروني</td></tr>
    <tr><td style="padding:24px">
      <p style="margin:0 0 16px;font-size:14px;line-height:1.7">أدخل هذا الرمز لإكمال إنشاء حسابك:</p>
      <div style="font-family:Consolas,monospace;font-size:32px;letter-spacing:8px;text-align:center;font-weight:bold;color:#0f62fe;background:#edf5ff;border:1px solid #a6c8ff;padding:14px 8px;margin:0 0 18px">${code}</div>
      <p style="margin:0 0 8px;font-size:13px;color:#525252">الرمز صالح لمدة ${ttlMinutes} دقائق ويُستخدم مرة واحدة.</p>
      <p style="margin:0;font-size:12px;color:#8d8d8d">إن لم تطلب إنشاء حساب، تجاهل هذه الرسالة ولن يُنشأ أي حساب.</p>
    </td></tr>
  </table></body></html>`;
  return { text, html };
}

/**
 * ينشئ رمزاً جديداً ويرسله. يرفض البريد المسجّل مسبقاً، ويحترم فاصل الإرسال.
 */
/** رفض منطقي (بريد مسجّل، فاصل إرسال) لا يستحق إعادة محاولة. */
class SignupRejection extends Error {
  constructor(message: string, readonly retryAfterMs?: number) {
    super(message);
    this.name = 'SignupRejection';
  }
}

function friendlySendReason(error?: string): string {
  const text = String(error || '');
  if (/لا مزود بريد مُعد|no provider|not configured/i.test(text)) {
    return 'لا يوجد مزود بريد مُعد على الخادم';
  }
  if (/invalid api key|unauthorized|401|403/i.test(text)) {
    return 'مزود البريد يرفض المفتاح الحالي';
  }
  return 'تعذّر الإرسال من مزود البريد';
}

export async function requestSignupCode(rawEmail: string): Promise<SignupCodeResult> {
  const validation = validateSignupEmail(rawEmail);
  if (!validation.ok) return { ok: false, message: validation.reason || 'بريد غير صالح' };
  const email = validation.normalized;

  // كل ما يسبق الإرسال قابل لإعادة المحاولة: لا بريد خرج بعد، فلا خطر من
  // تكرار العمل نفسه. أي فشل عابر يُترجم إلى رسالة مفهومة بدل الخطأ الخام.
  let prepared: { code: string; expiresAt: string };
  try {
    prepared = await retryOnceOnTransient(async () => {
      await init();
      const existingUser = await findUserByEmail(email);
      if (existingUser) {
        throw new SignupRejection('هذا البريد مسجّل مسبقاً — استخدم تسجيل الدخول أو استعادة كلمة المرور');
      }

      const previous = await one<any>('SELECT created_at, expires_at FROM signup_verifications WHERE email = ?', [email]);
      if (previous) {
        const elapsed = Date.now() - new Date(previous.created_at).getTime();
        if (elapsed >= 0 && elapsed < RESEND_COOLDOWN_MS) {
          throw new SignupRejection(
            `انتظر ${Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000)} ثانية قبل طلب رمز جديد`,
            RESEND_COOLDOWN_MS - elapsed
          );
        }
      }

      const code = generateCode();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + CODE_TTL_MS).toISOString();
      await run(
        `INSERT INTO signup_verifications (email, code_hash, attempts, created_at, expires_at)
         VALUES (?,?,?,?,?)
         ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, attempts = 0, created_at = excluded.created_at, expires_at = excluded.expires_at`,
        [email, hashOf(code), 0, now.toISOString(), expiresAt]
      );
      return { code, expiresAt };
    });
  } catch (error) {
    if (error instanceof SignupRejection) {
      return {
        ok: false,
        message: error.message,
        retryAfterMs: error.retryAfterMs,
        email: maskEmail(email),
      };
    }
    console.error(
      `[signup] request-code failed before sending: ${error instanceof Error ? error.message : String(error)}`
    );
    return { ok: false, message: TEMPORARY_OUTAGE_MESSAGE };
  }

  const { code, expiresAt } = prepared;
  const mail = buildCodeEmail(code, Math.round(CODE_TTL_MS / 60000));
  let sent: { sent: boolean; provider: string; error?: string };
  try {
    sent = await sendEmail({ to: email, subject: 'رمز التحقق لإنشاء حسابك', ...mail }, 'signup-verification');
  } catch (error) {
    // استثناء غير متوقع من المزود: قد تكون الرسالة قُبلت قبل الانقطاع، فنتعامل
    // معه كفشل غير قاطع بدل اعتباره رفضًا.
    console.error(`[signup] send threw: ${error instanceof Error ? error.message : String(error)}`);
    sent = { sent: false, provider: 'none', error: error instanceof Error ? error.message : String(error) };
  }
  const devMode = process.env.SIGNUP_VERIFICATION_DEV_CODE === '1';

  if (!sent.sent && !devMode) {
    // لا نحذف الرمز إلا إذا كان الفشل قاطعًا (لا مزود/رفض صريح). إن كان انقطاعًا
    // فقد وصل البريد فعلًا، وحذف الصف يجعل الرمز الذي في بريد المستخدم بلا قيمة.
    const definitive = isDefinitiveSendFailure(sent.error);
    if (definitive) {
      await run('DELETE FROM signup_verifications WHERE email = ?', [email]).catch((error) =>
        console.warn(`[signup] cleanup after failed send skipped: ${error instanceof Error ? error.message : String(error)}`)
      );
      return {
        ok: false,
        message: `تعذّر إرسال رمز التحقق: ${friendlySendReason(sent.error)}. لم يُحفظ أي رمز.`,
      };
    }
    return {
      ok: false,
      deliveryUncertain: true,
      email: maskEmail(email),
      expiresAt,
      message:
        'تعذّر تأكيد إرسال البريد من مزودنا. قد تكون الرسالة وصلت فعلًا — إن وجدتها، فالرمز صالح. إن لم تصل، أعد طلب رمز بعد دقيقة.',
    };
  }

  if (!sent.sent && devMode) {
    console.warn(`[signup] email delivery failed (${sent.error}) — returning dev code because SIGNUP_VERIFICATION_DEV_CODE=1`);
  }

  return {
    ok: true,
    message: sent.sent
      ? `أرسلنا رمز التحقق إلى ${maskEmail(email)}`
      : `لم يُرسل البريد (لا مزود مُعد) — الرمز التجريبي ظاهر أدناه`,
    email: maskEmail(email),
    expiresAt,
    delivered: sent.sent,
    devCode: devMode ? code : undefined,
  };
}

export interface SignupVerifyResult {
  ok: boolean;
  message: string;
}

/** يتحقق من الرمز ويستهلكه (حذف الصف) عند النجاح. */
export async function verifySignupCode(rawEmail: string, rawCode: string): Promise<SignupVerifyResult> {
  try {
    return await retryOnceOnTransient(() => verifySignupCodeOnce(rawEmail, rawCode));
  } catch (error) {
    console.error(
      `[signup] verify failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return { ok: false, message: TEMPORARY_OUTAGE_MESSAGE };
  }
}

async function verifySignupCodeOnce(rawEmail: string, rawCode: string): Promise<SignupVerifyResult> {
  await init();
  const validation = validateSignupEmail(rawEmail);
  if (!validation.ok) return { ok: false, message: validation.reason || 'بريد غير صالح' };
  const email = validation.normalized;
  const code = String(rawCode || '').replace(/\D/g, '');
  if (code.length !== 6) return { ok: false, message: 'أدخل الرمز المكوّن من 6 أرقام' };

  const row = await one<any>('SELECT * FROM signup_verifications WHERE email = ?', [email]);
  if (!row) return { ok: false, message: 'اطلب رمز تحقق جديداً أولاً' };
  if (new Date(row.expires_at) <= new Date()) {
    await run('DELETE FROM signup_verifications WHERE email = ?', [email]);
    return { ok: false, message: 'انتهت صلاحية الرمز — اطلب رمزاً جديداً' };
  }
  if (Number(row.attempts) >= MAX_VERIFY_ATTEMPTS) {
    await run('DELETE FROM signup_verifications WHERE email = ?', [email]);
    return { ok: false, message: 'تجاوزت عدد المحاولات المسموح — اطلب رمزاً جديداً' };
  }

  if (row.code_hash !== hashOf(code)) {
    await run('UPDATE signup_verifications SET attempts = attempts + 1 WHERE email = ?', [email]);
    return { ok: false, message: 'الرمز غير صحيح' };
  }

  await run('DELETE FROM signup_verifications WHERE email = ?', [email]);
  return { ok: true, message: 'تم التحقق من البريد' };
}
