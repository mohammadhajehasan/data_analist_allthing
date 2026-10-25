/**
 * استعادة كلمة المرور عبر رمز تحقق (بريد أو هاتف).
 * - بريد: عبر نفس سلسلة المزودين (Brevo → Resend → SMTP) في emailInvites.ts
 *   لذا عند ضبط RESEND_API_KEY يرسل البريد عبر Resend تلقائياً؛ وبدونه يعود
 *   إلى SMTP المُعد (Gmail). الرمز لا يُعاد للعميل إطلاقاً في الإنتاج.
 * - هاتف: رقم E.164 يُتحقق عبر وحدة phoneCountries المشتركة (رمز الدولة
 *   + عدد الأرقام الوطنية + البادئة)، ويُرسل عبر Twilio REST عند ضبط
 *   TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/(TWILIO_FROM أو TWILIO_MESSAGING_SERVICE_SID).
 * التخزين: جدول pwd_resets في data/auth.db — الرمز مُهشّر SHA-256 ولا يُخزَّن
 * نصاً؛ صالح 10 دقائق، 6 محاولات كحد أقصى، فاصل 60 ثانية بين الطلبات و3 طلبات
 * منفيل العدوى كحد أقصى لكل هدف في 10 دقائق. نجاح التحقق يُصدر تذكرة
 * استخدام-واحد مُهشّرة تُستخدم مرة واحدة لتعيين كلمة المرور الجديدة.
 */
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { turso, one, run, ensureSchema } from './turso';
import { sendEmail } from './emailInvites';
import { validatePhoneNational, PHONE_COUNTRIES } from '../src/utils/phoneCountries';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS pwd_resets (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('email','sms','telegram')),
  target TEXT NOT NULL,             -- بريد مُطبّع أو +رقم E.164
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT,                 -- لحظة التحقق الناجح (يُستبدل الرمز بتذكرة)
  ticket_hash TEXT,                 -- تذكرة الاستخدام-الواحد (في الذاكرة أيضاً)
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS idx_pwd_target ON pwd_resets(channel, target)`,
];

let schemaReady: Promise<void> | null = null;
function init(): Promise<void> {
  schemaReady ??= ensureSchema(turso(), SCHEMA).catch(err => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

export type ResetChannel = 'email' | 'sms' | 'telegram';

const CODE_TTL_MS = 10 * 60 * 1000;        // صلاحية الرمز: 10 دقائق
const RESEND_COOLDOWN_MS = 60 * 1000;      // 60 ثانية أقل فاصل بين الطلبات
const MAX_REQUESTS_PER_WINDOW = 3;         // 3 طلبات / 10 دقائق لكل هدف
const REQUEST_WINDOW_MS = 10 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 6;
const TICKET_TTL_MS = 15 * 60 * 1000;      // صلاحية تذكرة تعيين كلمة المرور

export interface ResetRequestResult {
  ok: boolean;
  message: string;
  channel: ResetChannel;
  target: string;                  // مُقنّع جزئياً (ah***@gmail.com / +96399*****86)
  expiresAt?: string;
  retryAfterMs?: number;
  /** تلميح استكشافي للعميل (يبقى below الرمز سرياً على الخادم ولا يُرجع الرقم إطلاقاً) */
  hint?: string;
  /** في وضع التطوير (PASSWORD_RESET_DEV_CODE=1) يعاد الرمز صراحةً للاختبار — لا يُعاد في الإنتاج */
  devCode?: string;
}

export interface ResetVerifyResult {
  ok: boolean;
  message: string;
  ticket?: string;                 // تذكرة الاستخدام-الواحد لتعيين كلمة المرور
}

const GENERIC_NO_ACCOUNT =
  'إذا كان هذا البريد مسجّلاً لدينا فسيصلك رمز التحقق خلال دقائق — إن لم يصله خلال دقيقة تحقق من الإملاء'; // نُبدّل نصاً لاحقاً حسب القناة

function hashOf(v: string): string {
  return crypto.createHash('sha256').update(v).digest('hex');
}

/** إخفاء جزئي للعرض في الواجهة/السجلات. */
export function maskTarget(channel: ResetChannel, target: string): string {
  if (channel === 'email') {
    const [user, domain] = target.split('@');
    return `${user.slice(0, 2)}***@${domain}`;
  }
  return `${target.slice(0, 7)}*****${target.slice(-2)}`;
}

/** إيجاد المستخدم الهدف: بريد مسجّل أو هاتف E.164 (بلا مسافة/أصفار). */
async function findTargetUser(channel: ResetChannel, target: string): Promise<{ id: string; email: string; name: string } | null> {
  let row: any;
  if (channel === 'email') {
    row = await one('SELECT id, email, name FROM users WHERE email = ?', [target]);
  } else {
    // نطابق الهاتف بعد تنزيل كل الفواصل والأقواس والأصفار البادئة.
    row = await one(
      `SELECT id, email, name FROM users
       WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '-', ''), '(', ''), ')', ''), ' ', ''), '+', '')
         LIKE '%' || ?`,
      [target.replace(/[^0-9]/g, '').slice(1)] // بعد +: الرقم الوطني + رمز الدولة
    );
  }
  return row || null;
}

function buildCodeEmail(code: string, name: string, ttlMin: number): { subject: string; text: string; html: string } {
  const digits = code.split('').join(' '); // فراغ بين الأرقام لسهولة النسخ/القراءة
  return {
    // بلا إيموجي في العنوان: علامات الاستفهام/المفاجآت ترفع احتمال سقوط الرسالة في «غير المرغوب»
    subject: `رمز التحقق لتعيين كلمة المرور: ${code}`,
    text: `مرحباً ${name},\nرمز استعادة كلمة مرورك هو: ${code}\n\nهذا الرمز صالح ${ttlMin} دقائق فقط.\nإن لم تطلب استعادة كلمة مرورك تجاهل هذه الرسالة — كلمة مرورك لن تتغير.`,
    html: `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"><title>رمز استعادة كلمة المرور</title></head>
<body style="margin:0;padding:24px;background:#f4f4f4;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;box-shadow:0 2px 10px rgba(0,0,0,0.08);">
    <tr><td>
      <h1 style="margin:0 0 10px 0;font-size:20px;color:#161616;">استعادة كلمة المرور</h1>
      <p style="margin:0 0 18px 0;font-size:14px;color:#525252;line-height:1.8;">مرحباً ${name}, استخدم الرمز التالي لتعيين كلمة مرور جديدة:</p>
      <div style="text-align:center;margin:26px 0;">
        <span style="display:inline-block;background:#edf5ff;border:1px solid #0f62fe;border-radius:12px;padding:16px 34px;font-size:34px;font-weight:bold;color:#0f62fe;letter-spacing:6px;direction:ltr;">${digits}</span>
      </div>
      <p style="margin:0 0 8px 0;font-size:13px;color:#525252;">⏳ الرمز صالح ${ttlMin} دقائق فقط.</p>
      <p style="margin:0 0 8px 0;font-size:13px;color:#525252;">🔒 إن لم تطلب هذا الرمز، تجاهل الرسالة — كلمة مرورك آمنة ولن تتغير.</p>
      <p style="margin:20px 0 0 0;font-size:11px;color:#8d8d8d;">منصة تحليل البيانات — هذا بريد آلي لا ترد عليه.</p>
    </td></tr>
  </table>
</body></html>`,
  };
}

/**
 * إرسال رمز SMS — سلسلة مزوّدات REST بلا SDK بالترتيب:
 * 1) OTP.dev (api.otp.dev) — مُتحقق منه فعليًا لسوريا: مرسِل معتمد SY + قالب SMS،
 *    ونمرّر الكود الذي نولّده محليًا (فرض تحقق محلي بهشاشة SHA-256 كما قبل)
 * 2) BudgetSMS (يصرّح بتغطية سوريا لكل الشبكات: Syriatel/MTN/... بسعر معلن وقيد ترشيح مجاني)
 * 3) Vonage (سوريا محفوظة عنده رسميًا مما في مقالة 2026-01 لكن بلا تسعير عام مُتحقق منه من عام المستخدم)
 * 4) Twilio (أوقف سوريا منذ 2025-09 — لباقي الدول فقط)
 * بلا مزوّد: محليًا نكمل (الرمز في السجل فقط) — وفي الإنتاج نرفض.
 */
const SMS_TEXT = (code: string) => `رمز استعادة كلمة مرورك: ${code} (صالح 10 دقائق)`;

/** إرسال OTP عبر OTP.dev: مرسِل معتمد + قالب يحوي {code} — المفتاح X-OTP-Key. */
async function sendSmsOtpDev(to: string, code: string): Promise<{ attempted: boolean; sent: boolean; error?: string }> {
  const KEY = process.env.OTP_DEV_API_KEY?.trim();
  const TEMPLATE = process.env.OTP_DEV_TEMPLATE?.trim();
  if (!KEY || !TEMPLATE) return { attempted: false, sent: false };
  try {
    const res = await fetch('https://api.otp.dev/v1/verifications', {
      method: 'POST',
      headers: { 'X-OTP-Key': KEY, 'accept': 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        data: {
          channel: 'sms',
          sender: process.env.OTP_DEV_SENDER?.trim() || 'OTP Dev',
          phone: to.replace(/\+/g, ''),   // أرقام فقط مع رمز الدولة (مثال 963991758886)
          template: TEMPLATE,
          code: code,                     // كودنا يُولّد محليًا — التحقق يبقى هشهًا عندنا
        },
      }),
    });
    const j: any = await res.json().catch(() => null);
    const messageId = j?.data?.message_id;
    if (!res.ok || !messageId) {
      const msg = j?.errors?.[0]?.message || `HTTP ${res.status}`;
      return { attempted: true, sent: false, error: `OTP.dev ${j?.errors?.[0]?.code || res.status}: ${msg}` };
    }
    console.log(`[pwd-reset] SMS sent via OTP.dev to ${to} (message_id: ${messageId}, expires: ${j?.data?.expire_date})`);
    return { attempted: true, sent: true };
  } catch (err: any) {
    return { attempted: true, sent: false, error: `OTP.dev: ${err.message}` };
  }
}

/** إرسال OTP عبر قناة Telegram لخدمة OTP.dev — بلا قالب/مرسِل (نص الرسالة منهم) + صلاحية مطابقة لنا. */
async function sendTelegramCode(to: string, code: string): Promise<{ attempted: boolean; sent: boolean; error?: string }> {
  const KEY = process.env.OTP_DEV_API_KEY?.trim();
  if (!KEY) return { attempted: false, sent: false };
  try {
    const res = await fetch('https://api.otp.dev/v1/verifications', {
      method: 'POST',
      headers: { 'X-OTP-Key': KEY, 'accept': 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        data: {
          channel: 'telegram',
          phone: to.replace(/\+/g, ''),        // E.164 بأرقام فقط (مثال 963991758886)
          code: code,                          // كودنا يُولّد محليًا — التحقق يبقى مُهشّرًا عندنا
          ttl_in_seconds: Math.floor(CODE_TTL_MS / 1000), // مطابقة صلاحيتنا (10 دقائق = 600)
        },
      }),
    });
    const j: any = await res.json().catch(() => null);
    const messageId = j?.data?.message_id;
    if (!res.ok || !messageId) {
      const msg = j?.errors?.[0]?.message || `HTTP ${res.status}`;
      return { attempted: true, sent: false, error: `OTP.dev-telegram ${j?.errors?.[0]?.code || res.status}: ${msg}` };
    }
    console.log(`[pwd-reset] Telegram sent via OTP.dev to ${to} (message_id: ${messageId}, expires: ${j?.data?.expire_date})`);
    return { attempted: true, sent: true };
  } catch (err: any) {
    return { attempted: true, sent: false, error: `OTP.dev-telegram: ${err.message}` };
  }
}

/** إرسل SMS عبر BudgetSMS HTTP API (أسعار مصرح بها لسوريا: Syriatel €0.249 / MTN €0.21). */
async function sendSmsBudgetsms(to: string, code: string): Promise<{ attempted: boolean; sent: boolean; error?: string }> {
  const USER = process.env.BUDGETSMS_USERNAME?.trim();
  const USERID = process.env.BUDGETSMS_USERID?.trim();
  const HANDLE = process.env.BUDGETSMS_HANDLE?.trim();
  if (!USER || !USERID || !HANDLE) return { attempted: false, sent: false };
  try {
    const params = new URLSearchParams({
      username: USER, userid: USERID, handle: HANDLE,
      msg: SMS_TEXT(code),
      from: process.env.BUDGETSMS_FROM?.trim() || 'Data-Analytics',
      to: to.replace(/\+/g, ''),     // E.164 بلا + (مثال 963991758886)
      price: '1', mccmnc: '1', credit: '1', // في الاستجابة: السعر والمشغّل (إثبات شبكة Syriatel/MTN) والرصيد المتبقي
    });
    const res = await fetch('https://api.budgetsms.net/sendsms/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: params.toString() });
    const text = (await res.text()).trim();
    // النجاح يبذّل msgid → SMS msgid=Forty; الفشل يأتي باروف بخطأ ورمز رقمي (مثل 23001 خطأ بيانات دخول)
    const okLine = text.match(/msgid[=: ]*([A-Za-z0-9]+)/i);
    if (!res.ok || !okLine) {
      return { attempted: true, sent: false, error: `BudgetSMS ${res.status}: ${text.slice(0, 200)}` };
    }
    console.log(`[pwd-reset] SMS sent via BudgetSMS to ${to} (msgid: ${okLine[1]})\n${text}`);
    return { attempted: true, sent: true };
  } catch (err: any) {
    return { attempted: true, sent: false, error: `BudgetSMS: ${err.message}` };
  }
}

async function sendSmsVonage(to: string, code: string): Promise<{ attempted: boolean; sent: boolean; error?: string }> {
  const key = process.env.VONAGE_API_KEY?.trim();
  const secret = process.env.VONAGE_API_SECRET?.trim();
  if (!key || !secret) return { attempted: false, sent: false };
  try {
    const from = process.env.VONAGE_FROM?.trim() || 'Data-Analytics'; // معرف مرسل أبجدي — قد تُستبدله شبكات سوريا للتوصيل
    const params = new URLSearchParams({
      api_key: key, api_secret: secret, from,
      to: to.replace(/\+/g, ''),           // Vonage: E.164 بلا + (مثال 963991758886)
      text: SMS_TEXT(code),
      type: 'unicode',                     // النص عربي
    });
    const res = await fetch('https://rest.nexmo.com/sms/json', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data: any = await res.json().catch(() => null);
    // الاستجابة: { message_count, messages: [{ status: '0' } | { status: '1..', error-text }] }
    const msg = data?.messages?.[0];
    const status = String(msg?.status ?? '-1');
    if (!res.ok || status !== '0') {
      return { attempted: true, sent: false, error: `Vonage status=${status}: ${msg?.['error-text'] || `HTTP ${res.status}`}` };
    }
    console.log(`[pwd-reset] SMS sent via Vonage to ${to} (message-id: ${msg?.['message-id']}, remaining-balance: ${msg?.['remaining-balance']})`);
    return { attempted: true, sent: true };
  } catch (err: any) {
    return { attempted: true, sent: false, error: `Vonage: ${err.message}` };
  }
}

async function sendSmsTwilio(to: string, code: string): Promise<{ attempted: boolean; sent: boolean; error?: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token) return { attempted: false, sent: false };
  try {
    const params = new URLSearchParams({ To: to, Body: SMS_TEXT(code) });
    if (process.env.TWILIO_MESSAGING_SERVICE_SID?.trim()) {
      params.set('MessagingServiceSid', process.env.TWILIO_MESSAGING_SERVICE_SID.trim());
    } else if (process.env.TWILIO_FROM?.trim()) {
      params.set('From', process.env.TWILIO_FROM.trim());
    } else {
      return { attempted: true, sent: false, error: 'اضبط TWILIO_FROM أو TWILIO_MESSAGING_SERVICE_SID' };
    }
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { attempted: true, sent: false, error: `Twilio API ${res.status}: ${body.slice(0, 200)}` };
    }
    return { attempted: true, sent: true };
  } catch (err: any) {
    return { attempted: true, sent: false, error: `SMS: ${err.message}` };
  }
}

/** منسّق سلسلة المزوّدات: Vonage (سوريا) ثم Twilio ثم السقوط المحلي. */
async function sendSmsCode(to: string, code: string): Promise<{ sent: boolean; error?: string }> {
  const otpdev = await sendSmsOtpDev(to, code);
  if (otpdev.attempted && otpdev.sent) return { sent: true };
  const budget = await sendSmsBudgetsms(to, code);
  if (budget.attempted && budget.sent) return { sent: true };
  const vonage = await sendSmsVonage(to, code);
  if (vonage.attempted && vonage.sent) return { sent: true };
  const twilio = await sendSmsTwilio(to, code);
  if (twilio.attempted && twilio.sent) return { sent: true };
  if (!otpdev.attempted && !budget.attempted && !vonage.attempted && !twilio.attempted) {
    // لا مزوّد SMS مضبوط: محلياً نكمل (الرمز في السجل فقط) — وفي الإنتاج نرفض.
  if (process.env.NODE_ENV === 'production') {
      return { sent: false, error: 'OTP_DEV_API_KEY أو BUDGETSMS_* أو VONAGE_* أو TWILIO_* غير مضبوطين — لا يمكن إرسال SMS' };
    }
    console.log(`[pwd-reset][dev][sms] code for ${to}: ${code} (no SMS provider configured)`);
    return { sent: true };
  }
  // حاولنا ولم يصل: أعد سبب أول مزوّد فشل
  return { sent: false, error: otpdev.error || budget.error || vonage.error || twilio.error };
}

/** ترجمة رقم E.164 خام إلى تحقق وطني عبر الوحدة المشتركة (أطول رمز دولي يفوز). */
export function parseE164(target: string) {
  const trimmed = String(target || '').trim().replace(/[\s\-().]/g, '');
  if (!trimmed.startsWith('+')) {
    return { ok: false as const, message: 'أدخل الرقم بصيغة دولية تبدأ بـ + (مثال +963991758886)' };
  }
  const e164 = `+${trimmed.slice(1).replace(/[^0-9]/g, '')}`;
  // نرشّح الرموز الدولية المطابقة للبادئة ونرتبها من الأطول للأقصر
  // (يمنع اختطاف بادئات قصيرة مثل 1 أو 7 رموزاً أطول مثل 963).
  const candidates = PHONE_COUNTRIES
    .filter((c) => e164.startsWith(`+${c.dial}`))
    .sort((a, b) => b.dial.length - a.dial.length);
  if (candidates.length === 0) {
    return { ok: false as const, message: 'رمز الدولة غير مدعوم — اختره من القائمة' };
  }
  let fallback = candidates[0];
  for (const c of candidates) {
    const nat = e164.slice(1 + c.dial.length);
    const v = validatePhoneNational(c.dial, nat);
    if (v.valid) {
      return { ok: true as const, e164, dial: c.dial, national: v.nationalDigits, country: c };
    }
  }
  return { ok: false as const, message: `الرقم الوطني لا يطابق نمط ${fallback.nameAr} (مثال: ${fallback.example})` };
}

/** طلب رمز إعادة التعيين (بريد أو هاتف) مع حدود معدل وصلاحية. */
export async function requestPasswordReset(
  channel: ResetChannel,
  targetRaw: string
): Promise<ResetRequestResult> {
  if (channel !== 'email' && channel !== 'sms' && channel !== 'telegram') {
    return { ok: false, channel, target: '', message: 'قناة غير مدعومة' };
  }

  // 1) تحديد الهدف ومطابقته: بريد مسجّل أو هاتف E.164 بنمط الدولة الحقيقي.
  let target = '';
  let user: { id: string; email: string; name: string } | null = null;
  if (channel === 'email') {
    target = String(targetRaw || '').trim().toLowerCase();
    user = await findTargetUser('email', target);
  } else {
    const p = parseE164(targetRaw);
    if (!p.ok) {
      return { ok: false, channel, target: String(targetRaw || ''), message: p.message };
    }
    target = p.e164;
    user = await findTargetUser('sms', target);
  }
  if (!user) {
    // رسالة محايدة تمنع استخراج قائمة الحسابات المسجلة.
    const hint = channel === 'email'
      ? 'إذا كان هذا البريد مسجلاً لدينا فسيصلك رمز التحقق خلال دقيقة'
      : 'إذا كان هذا الرقم مسجلاً لدينا فسيصلك رمز التحقق خلال دقيقة — تأكد من رمز الدولة';
    return { ok: false, channel, target: maskTarget(channel, target), message: hint };
  }

  // 2) حدود المعدل: 60 ثانية بين الطلبات + 3 طلبات / 10 دقائق لكل هدف.
  await init();
  const now = Date.now();
  const last = await one<any>(
    'SELECT created_at FROM pwd_resets WHERE channel = ? AND target = ? ORDER BY created_at DESC LIMIT 1',
    [channel, target]
  );
  if (last) {
    const since = now - new Date(last.created_at).getTime();
    if (since < RESEND_COOLDOWN_MS) {
      return { ok: false, channel, target: maskTarget(channel, target), message: 'الرجاء الانتظار دقيقة قبل إعادة الطلب', retryAfterMs: RESEND_COOLDOWN_MS - since };
    }
  }
  const windowStart = new Date(now - REQUEST_WINDOW_MS).toISOString();
  const inWindow = await one<any>(
    'SELECT COUNT(*) AS c FROM pwd_resets WHERE channel = ? AND target = ? AND created_at > ?',
    [channel, target, windowStart]
  );
  if (Number(inWindow?.c || 0) >= MAX_REQUESTS_PER_WINDOW) {
    return { ok: false, channel, target: maskTarget(channel, target), message: 'تجاوزت عدد الطلبات المسموح — حاول بعد 10 دقائق', retryAfterMs: REQUEST_WINDOW_MS };
  }

  // 3) توليد رمز 6 خانات وتخزين هشه فقط (لا رمز نصي في القاعدة).
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const id = `rst-${crypto.randomUUID().slice(0, 8)}`;
  const expiresAt = new Date(now + CODE_TTL_MS).toISOString();
  await run(
    'INSERT INTO pwd_resets (id, channel, target, user_id, code_hash, created_at, expires_at) VALUES (?,?,?,?,?,?,?)',
    [id, channel, target, user.id, hashOf(code), new Date().toISOString(), expiresAt]
  );

  // 4) إرسال الرمز عبر قناة الهدف.
  // في وضع التطوير (PASSWORD_RESET_DEV_CODE=1) يُعرض الرمز في السجل
  // دون الاعتماد على مزود البريد (مفيد لاختبار القالب محلياً).
  let sent = false; let err: string | undefined;
  if (process.env.PASSWORD_RESET_DEV_CODE === '1') {
    console.log(`[pwd-reset][dev] code for ${channel} ${target}: ${code}`);
    sent = true;
  }
  if (channel === 'email') {
    const mail = buildCodeEmail(code, user.name, CODE_TTL_MS / 60000);
    // purpose='password-reset' → يُسجَّل في تشخيص مزودي البريد بلوحة الإدارة
    const r = await sendEmail({ to: target, subject: mail.subject, text: mail.text, html: mail.html }, 'password-reset');
    sent = r.sent; err = r.error;
  } else if (channel === 'telegram') {
    const r = await sendTelegramCode(target, code);
    sent = r.sent; err = r.error;
  } else {
    const r = await sendSmsCode(target, code);
    sent = r.sent; err = r.error;
  }
  if (!sent) {
    // نحذف المحاولة الفاشلة حتى لا تستهلك نصيب الحدود مع رسالة سبب واضحة.
    await run('DELETE FROM pwd_resets WHERE id = ?', [id]);
    return { ok: false, channel, target: maskTarget(channel, target), message: `فشل إرسال الرمز: ${err || 'لا مزود بريد مضبوط'}` };
  }

  return {
    ok: true, channel, target: maskTarget(channel, target), expiresAt,
    message: channel === 'email'
      ? 'أُرسل رمز التحقق إلى بريدك'
      : channel === 'telegram'
        ? 'أُرسل رمز التحقق إلى حسابك في Telegram'
        : 'أُرسل رمز التحقق إلى هاتفك',
    // لا يُعاد الرمز في الاستجابة إطلاقاً (حتى محلياً) — ظهر سابقًا عبر PASSWORD_RESET_DEV_CODE
    // وكان يسمح لأي طالب بقراءة الرمز دون صندوق بريد؛ رمز التطوير الآن في سجل الخادم فقط.
    hint: channel === 'telegram'
      ? 'يحتاج Telegram إلى أن يكون معرفًا برقم هاتفك — تأكد أن حسابك في Telegram مربوط بالرقم نفسه وأنه يسمح بإيجاده بالرقم'
      : channel === 'email'
      ? 'إن لم يصلك البريد خلال دقيقة فافحص مجلد «الرسائل غير المرغوبة/الترقيات» ثم اضغط «ليس بريداً غير مرغوباً» دفعة تالية'
      : 'قد تصل الرسالة باسم مُرسِل مختلف — لا تشارك الرمز مع أحد إطلاقاً',
    ...(process.env.PASSWORD_RESET_DEV_CODE === '1' ? { devCode: code } : {}),
  };
}

// تذكرة التحقق في الذاكرة (يُشترط أن يبقى الخادم حياً بين التحقق والتعيين —
// عملياً دائماً هو نفس عملية إعادة التعيين) — لا تخزين إضافي في القاعدة.
const ticketMetaByHash = new Map<string, { userId: string; rowId: string; expiresAt: string }>();

/** تحقق الرمز وإصدار تذكرة استخدام-واحد لتعيين كلمة المرور. */
export async function verifyPasswordResetCode(channel: ResetChannel, target: string, code: string): Promise<ResetVerifyResult> {
  const t = channel === 'email'
    ? String(target || '').trim().toLowerCase()
    : (() => { const p = parseE164(target); return p.ok ? p.e164 : String(target || ''); })();
  const normCode = String(code || '').replace(/[^0-9]/g, '');
  if (!t || normCode.length !== 6) return { ok: false, message: 'الرمز غير مكتمل (6 أرقام)' };
  await init();
  const row = await one<any>(
    'SELECT * FROM pwd_resets WHERE channel = ? AND target = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1',
    [channel, t]
  );
  if (!row) return { ok: false, message: 'اطلب رمزاً أولاً' };
  if (new Date(row.expires_at) <= new Date()) return { ok: false, message: 'انتهت صلاحية الرمز — اطلب رمزاً جديداً' };
  if (row.attempts >= MAX_VERIFY_ATTEMPTS) {
    await run('UPDATE pwd_resets SET consumed_at = ? WHERE id = ?', [new Date().toISOString(), row.id]);
    return { ok: false, message: 'تجاوزت المحاولات المتاحة — اطلب رمزاً جديداً' };
  }
  await run('UPDATE pwd_resets SET attempts = attempts + 1 WHERE id = ?', [row.id]);
  if (row.code_hash !== hashOf(normCode)) {
    const remaining = MAX_VERIFY_ATTEMPTS - (row.attempts + 1);
    return { ok: false, message: `الرمز غير صحيح${remaining > 0 ? ` — بقي ${remaining} محاولات` : ''}` };
  }
  // نجاح: يُستهلك الرمز ويُصدر توكن استخدام-واحد.
  await run('UPDATE pwd_resets SET consumed_at = ? WHERE id = ?', [new Date().toISOString(), row.id]);
  const ticket = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TICKET_TTL_MS).toISOString();
  await run('UPDATE pwd_resets SET ticket_hash = ? WHERE id = ?', [hashOf(ticket), row.id]);
  ticketMetaByHash.set(hashOf(ticket), { userId: row.user_id, rowId: row.id, expiresAt });
  return { ok: true, message: 'تم التحقق من الرمز', ticket };
}

/** تعيين كلمة المرور الجديدة عبر تذكرة الاستخدام-الواحد. */
export async function confirmPasswordResetWithTicket(ticket: string, newPassword: string): Promise<{ ok: boolean; message: string }> {
  if (!ticket || typeof newPassword !== 'string') return { ok: false, message: 'بيانات ناقصة' };
  if (newPassword.length < 6) return { ok: false, message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' };
  const h = hashOf(ticket);
  const meta = ticketMetaByHash.get(h);
  if (!meta) return { ok: false, message: 'تذكرة غير صالحة أو مستخدمة مسبقاً — أعد التحقق من الرمز' };
  if (new Date(meta.expiresAt) <= new Date()) {
    ticketMetaByHash.delete(h);
    return { ok: false, message: 'انتهت صلاحية التذكرة — أعد طلب الرمز' };
  }
  await init();
  const row = await one<any>('SELECT * FROM pwd_resets WHERE id = ?', [meta.rowId]);
  if (!row) return { ok: false, message: 'طلب غير موجود' };

  // استخدام واحد: تُحذف تذكرة لحظة النجاح (لا يمكن تعيين كلمة مرور مرتين بنفس التذكرة.
  ticketMetaByHash.delete(h);
  const hash = bcrypt.hashSync(newPassword, 10);
  await run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, meta.userId]);
  await run('UPDATE pwd_resets SET ticket_hash = NULL WHERE id = ?', [meta.rowId]);
  console.log(`[pwd-reset] password updated via ${row.channel} for user ${meta.userId}`);
  return { ok: true, message: 'تم تعيين كلمة المرور الجديدة — سجّل الدخول بها الآن' };
}
