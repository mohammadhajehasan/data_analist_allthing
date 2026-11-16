/**
 * التحقق من البريد الإلكتروني عند إنشاء الحساب.
 *
 * الهدف: منع إنشاء حسابات ببريد وهمي — لا يُنشأ المستخدم إلا بعد إدخال رمز
 * تحقق من 6 أرقام أُرسل إلى البريد نفسه عبر سلسلة المزودين في emailInvites.ts
 * (Brevo → Resend → AgentMail → SMTP).
 *
 * - الرمز يُخزَّن مُهشّراً (SHA-256) في جدول signup_verifications، صلاحيته
 *   10 دقائق، 6 محاولات كحد أقصى، وفاصل 60 ثانية بين الطلبات.
 * - البريد يُطبَّع (trim + lowercase) ويُرفض إن كان بصيغة غير صالحة أو من نطاق
 *   بريد مؤقت شائع.
 * - في التطوير فقط (SIGNUP_VERIFICATION_DEV_CODE=1) يُعاد الرمز للعميل لتسهيل
 *   التجربة عندما لا يوجد مزود بريد مُعد — لا يُعاد إطلاقاً في الإنتاج.
 */
import crypto from 'crypto';
import { turso, one, run, ensureSchema } from './turso';
import { sendEmail } from './emailInvites';
import { findUserByEmail } from './auth';

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
export async function requestSignupCode(rawEmail: string): Promise<SignupCodeResult> {
  await init();
  const validation = validateSignupEmail(rawEmail);
  if (!validation.ok) return { ok: false, message: validation.reason || 'بريد غير صالح' };
  const email = validation.normalized;

  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    return { ok: false, message: 'هذا البريد مسجّل مسبقاً — استخدم تسجيل الدخول أو استعادة كلمة المرور' };
  }

  const previous = await one<any>('SELECT created_at, expires_at FROM signup_verifications WHERE email = ?', [email]);
  if (previous) {
    const elapsed = Date.now() - new Date(previous.created_at).getTime();
    if (elapsed >= 0 && elapsed < RESEND_COOLDOWN_MS) {
      return {
        ok: false,
        message: `انتظر ${Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000)} ثانية قبل طلب رمز جديد`,
        retryAfterMs: RESEND_COOLDOWN_MS - elapsed,
        email: maskEmail(email),
      };
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

  const mail = buildCodeEmail(code, Math.round(CODE_TTL_MS / 60000));
  const sent = await sendEmail({ to: email, subject: 'رمز التحقق لإنشاء حسابك', ...mail }, 'signup-verification');
  const devMode = process.env.SIGNUP_VERIFICATION_DEV_CODE === '1';

  if (!sent.sent) {
    if (!devMode) {
      await run('DELETE FROM signup_verifications WHERE email = ?', [email]);
      return {
        ok: false,
        message: `تعذّر إرسال رمز التحقق: ${sent.error || 'لا مزود بريد مُعد'}`,
      };
    }
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
