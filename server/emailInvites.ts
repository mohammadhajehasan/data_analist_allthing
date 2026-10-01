/**
 * Email invites for UNREGISTERED users.
 * - Owner enters an email -> a pending email-invite with a 128-bit code is created
 * - An invitation email is sent through the FIRST configured provider in .env:
 *   Brevo API (BREVO_API_KEY) → Resend API (RESEND_API_KEY) → SMTP
 *   (SMTP_HOST/SMTP_USER/...). The HTTP APIs work on hosts that block
 *   outbound SMTP (e.g. Render's free tier); without any provider the
 *   code/link is returned so the owner can share it manually
 * - After registering with the same email (register?invite=<code>), the new
 *   account is AUTOMATICALLY added to the group — no extra click
 * Uses nodemailer when available; falls back gracefully otherwise.
 */
import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';
import { getDiscussionRow, isMember, isModerator, addMember } from './discussions';
import { pushNotification } from './notifications';

const DATA_DIR = path.join(process.cwd(), 'data');
const db = new Database(path.join(DATA_DIR, 'auth.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS discussion_email_invites (
  code TEXT PRIMARY KEY,
  discussion_id TEXT NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  invited_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_by TEXT,
  reminded_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_einv_email ON discussion_email_invites(invited_email);
`);
// Existing databases created before the reminder feature: add the column if missing
try {
  db.exec('ALTER TABLE discussion_email_invites ADD COLUMN reminded_at TEXT');
} catch { /* column already exists */ }

export interface EmailInviteResult {
  code: string;
  expiresAt: string;
  emailSent: boolean;
  emailError?: string;
  inviteUrl: string;
}

// ---------------------------------------------------------------------------
// Email templates — table-based HTML (Gmail/Outlook-safe), inline styles only,
// platform blue (#0f62fe) on a dark footer, prominent CTA button, RTL body.
// ---------------------------------------------------------------------------
const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Default sender identity: platform name so recipients see a clean label
 * instead of the raw Gmail address. Override via SMTP_FROM in .env —
 * accepted forms: "Name <addr>" or just a custom address.
 */
const DEFAULT_FROM_NAME = 'منصة تحليل البيانات';
export function senderAddress(): string {
  const from = process.env.SMTP_FROM?.trim();
  if (from) return from; // full override, e.g. "Team <mail@x.com>"
  return `${DEFAULT_FROM_NAME} <${process.env.SMTP_USER || 'no-reply@localhost'}>`;
}

/**
 * Platform logo (public/favicon.svg — the blue bars on dark tile) embedded as
 * a base64 data URI: no external hosting needed, renders in Gmail and Outlook.
 */
const LOGO_DATA_URI =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    '<rect width="32" height="32" rx="6" fill="#161616"/>' +
    '<rect x="6" y="18" width="4" height="8" rx="1" fill="#0f62fe"/>' +
    '<rect x="14" y="12" width="4" height="14" rx="1" fill="#0f62fe"/>' +
    '<rect x="22" y="6" width="4" height="20" rx="1" fill="#4589ff"/>' +
    '</svg>'
  ).toString('base64');

/** Shared outer frame: dark header bar with brand, light body, dark footer. */
function emailFrame(title: string, innerHtml: string): string {
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.08);">
        <!-- Brand bar: logo + name -->
        <tr><td style="background:#161616;padding:16px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="width:36px;vertical-align:middle;">
              <img src="${LOGO_DATA_URI}" width="28" height="28" alt="شعار المنصة" style="display:block;border:0;border-radius:6px;" />
            </td>
            <td style="font-size:17px;font-weight:bold;color:#ffffff;padding-right:10px;vertical-align:middle;">
              منصة تحليل البيانات
            </td>
            <td align="left" style="font-size:11px;color:#8d8d8d;vertical-align:middle;">Analytics Platform</td>
          </tr></table>
        </td></tr>
        <!-- Accent line -->
        <tr><td style="height:4px;background:#0f62fe;font-size:0;line-height:0;">&nbsp;</td></tr>
        <!-- Body -->
        <tr><td style="padding:32px 28px 8px 28px;">
          ${innerHtml}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:24px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e0e0e0;">
            <tr><td style="padding-top:14px;font-size:11px;color:#8d8d8d;line-height:1.7;">
              وصلتك هذه الرسالة لأنك دُعيت إلى مجموعة مناقشة على منصة تحليل البيانات.<br/>
              إن لم تتوقع هذه الدعوة يمكنك ببساطة تجاهل هذه الرسالة.
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Prominent full-width CTA button (bulletproof: styled <a> + table padding). */
function ctaButton(url: string, label: string): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 10px 0;">
    <tr><td align="center" style="background:#0f62fe;border-radius:10px;mso-padding-alt:14px 28px;">
      <a href="${url}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
        ${label} &larr;
      </a>
    </td></tr>
  </table>
  <p style="text-align:center;margin:6px 0 0 0;">
    <a href="${url}" style="font-size:12px;color:#0f62fe;word-break:break-all;direction:ltr;unicode-bidi:embed;">${escapeHtml(url)}</a>
  </p>`;
}

/** Highlighted group-name chip. */
function groupChip(groupName: string): string {
  return `
  <div style="text-align:center;margin:18px 0;">
    <span style="display:inline-block;background:#edf5ff;border:1px solid #0f62fe;border-radius:999px;padding:8px 22px;font-size:15px;font-weight:bold;color:#0f62fe;">
      👥 ${escapeHtml(groupName)}
    </span>
  </div>`;
}

export function buildInviteEmailHtml(groupName: string, inviterName: string, inviteUrl: string, toEmail: string, expiresAt: string): string {
  const expiryDate = new Date(expiresAt).toLocaleDateString('ar', { day: 'numeric', month: 'long', year: 'numeric' });
  const inner = `
    <h1 style="margin:0 0 6px 0;font-size:21px;color:#161616;">لديك دعوة انضمام 👋</h1>
    <p style="margin:0;font-size:14px;color:#525252;line-height:1.8;">
      <b style="color:#161616;">${escapeHtml(inviterName)}</b> يدعوك للانضمام إلى مجموعة النقاش:
    </p>
    ${groupChip(groupName)}
    <p style="margin:0;font-size:14px;color:#525252;line-height:1.8;">
      سجّل حساباً بنفس هذا البريد <b dir="ltr" style="color:#161616;">(${escapeHtml(toEmail)})</b><br/>
      وستُضاف إلى المجموعة <b>تلقائياً</b> دون أي خطوات إضافية.
    </p>
    ${ctaButton(inviteUrl, 'قبول الدعوة والانضمام')}
    <p style="margin:14px 0 0 0;font-size:12px;color:#8d8d8d;text-align:center;">
      ⏳ الرابط صالح حتى ${expiryDate}
    </p>`;
  return emailFrame(`دعوة انضمام إلى مجموعة "${groupName}"`, inner);
}

export function buildReminderEmailHtml(groupName: string, inviterName: string, inviteUrl: string, toEmail: string): string {
  const inner = `
    <h1 style="margin:0 0 6px 0;font-size:21px;color:#161616;">تذكير ودّي ⏰</h1>
    <p style="margin:0;font-size:14px;color:#525252;line-height:1.8;">
      قبل ثلاثة أيام دعاك <b style="color:#161616;">${escapeHtml(inviterName)}</b> للانضمام إلى مجموعة:
    </p>
    ${groupChip(groupName)}
    <p style="margin:0;font-size:14px;color:#525252;line-height:1.8;">
      لم تسجّل بعد — الرابط لا يزال صالحاً! سجّل بنفس هذا البريد<br/>
      <b dir="ltr" style="color:#161616;">(${escapeHtml(toEmail)})</b> وستُضاف تلقائياً.
    </p>
    ${ctaButton(inviteUrl, 'إكمال الانضمام الآن')}
    <p style="margin:14px 0 0 0;font-size:12px;color:#8d8d8d;text-align:center;">
      هذه آخر تذكير ستحصل عليه لهذه الدعوة
    </p>`;
  return emailFrame(`تذكير: دعوتك لمجموعة "${groupName}" لا تزال بانتظارك`, inner);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function normalizeEmail(e: string): string {
  return e.trim().toLowerCase();
}

/** Create a pending email invite and (best-effort) send the invitation email. */
export async function createEmailInvite(
  discussionId: string,
  invitedByEmail: string,
  rawEmail: string
): Promise<EmailInviteResult> {
  const disc = getDiscussionRow(discussionId);
  if (!disc) throw new Error('المجموعة غير موجودة');
  if (!isModerator(discussionId, invitedByEmail)) throw new Error('فقط المالك أو المشرفون يمكنهم الدعوة');

  const email = normalizeEmail(rawEmail);
  if (!EMAIL_RE.test(email)) throw new Error('صيغة البريد الإلكتروني غير صالحة');

  const code = crypto.randomBytes(16).toString('base64url');
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
  db.prepare('INSERT INTO discussion_email_invites (code, discussion_id, invited_email, invited_by, created_at, expires_at) VALUES (?,?,?,?,?,?)')
    .run(code, discussionId, email, invitedByEmail, new Date().toISOString(), expiresAt);

  const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
  const inviteUrl = `${baseUrl}/join/${code}`;
  const inviter = db.prepare('SELECT name FROM users WHERE id = ?').get(invitedByEmail) as any;
  const mail = await trySendInviteEmail(email, disc.name, inviteUrl, inviter?.name || 'فريقك', expiresAt);

  return { code, expiresAt, emailSent: mail.sent, emailError: mail.error, inviteUrl };
}

/** Build the invitation payload and send it through the provider chain. */
async function trySendInviteEmail(to: string, groupName: string, inviteUrl: string, inviterName: string, expiresAt: string): Promise<SendResult> {
  return sendEmail({
    to,
    subject: `📧 ${inviterName} يدعوك إلى مجموعة "${groupName}"`,
    text: `تمت دعوتك للانضمام إلى مجموعة "${groupName}" من قبل ${inviterName}.\nافتح الرابط التالي وسجّل بنفس هذا البريد (${to}) وستُضاف للمجموعة تلقائياً:\n${inviteUrl}\nالرابط صالح لمدة 14 يوماً.`,
    html: buildInviteEmailHtml(groupName, inviterName, inviteUrl, to, expiresAt),
  });
}

/**
 * Resolve the configured sender identity into { name, email } for the HTTP
 * APIs. Accepts the same forms as senderAddress(): "Name <addr>" or an address.
 */
function parseSender(): { name: string; email: string } {
  const from = process.env.SMTP_FROM?.trim();
  if (from) {
    const m = from.match(/^(.*)<\s*([^>]+)\s*>$/);
    if (m) return { name: m[1].trim().replace(/^["']+|["']+$/g, '') || DEFAULT_FROM_NAME, email: m[2].trim() };
    return { name: DEFAULT_FROM_NAME, email: from };
  }
  return { name: DEFAULT_FROM_NAME, email: process.env.SMTP_USER || 'no-reply@localhost' };
}

// ---------------------------------------------------------------------------
// Outbound email transport: HTTP APIs first (Brevo / Resend — they work on
// hosts that block outbound SMTP like Render's free tier), classic SMTP
// (nodemailer) as fallback, in that order. Configured via .env only.
// ---------------------------------------------------------------------------

interface MailPayload { to: string; subject: string; text: string; html: string }
type SendResult = { sent: boolean; error?: string; provider: string };

/** Brevo transactional email API (free tier: 300 emails/day). */
async function sendViaBrevo(p: MailPayload): Promise<SendResult> {
  const key = process.env.BREVO_API_KEY?.trim();
  if (!key) return { sent: false, error: 'BREVO_API_KEY غير مضبوط', provider: 'brevo' };
  try {
    const sender = parseSender();
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: sender.name, email: sender.email },
        to: [{ email: p.to }],
        subject: p.subject,
        textContent: p.text,
        htmlContent: p.html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { sent: false, error: `Brevo API ${res.status}: ${body.slice(0, 200)}`, provider: 'brevo' };
    }
    return { sent: true, provider: 'brevo' };
  } catch (err: any) {
    return { sent: false, error: `Brevo API: ${err.message}`, provider: 'brevo' };
  }
}

/** Resend transactional email API (requires a verified sending domain). */
async function sendViaResend(p: MailPayload): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { sent: false, error: 'RESEND_API_KEY غير مضبوط', provider: 'resend' };
  try {
    const sender = parseSender();
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: `${sender.name} <${sender.email}>`,
        to: [p.to],
        subject: p.subject,
        text: p.text,
        html: p.html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { sent: false, error: `Resend API ${res.status}: ${body.slice(0, 200)}`, provider: 'resend' };
    }
    return { sent: true, provider: 'resend' };
  } catch (err: any) {
    return { sent: false, error: `Resend API: ${err.message}`, provider: 'resend' };
  }
}

/** Classic SMTP via nodemailer (needs outbound 465/587 — blocked on Render free). */
async function sendViaSmtp(p: MailPayload): Promise<SendResult> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    return { sent: false, error: 'SMTP غير مُعد', provider: 'smtp' };
  }
  try {
    // Dynamic import so the app still boots when nodemailer isn't installed
    const nodemailer = (await import('nodemailer')).default;
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user, pass },
    });
    await transporter.sendMail({
      from: senderAddress(),
      to: p.to,
      subject: p.subject,
      text: p.text,
      html: p.html,
    });
    return { sent: true, provider: 'smtp' };
  } catch (err: any) {
    return { sent: false, error: `فشل إرسال البريد: ${err.message}`, provider: 'smtp' };
  }
}

/**
 * Send one email through the first configured provider, falling back down the
 * chain (Brevo → Resend → SMTP) if a provider errors. Returns the final status.
 */
export async function sendEmail(p: MailPayload): Promise<SendResult> {
  const providers: Array<[string, () => Promise<SendResult>]> = [];
  if (process.env.BREVO_API_KEY?.trim()) providers.push(['brevo', () => sendViaBrevo(p)]);
  if (process.env.RESEND_API_KEY?.trim()) providers.push(['resend', () => sendViaResend(p)]);
  if (process.env.SMTP_HOST?.trim() && process.env.SMTP_USER?.trim() && process.env.SMTP_PASS?.trim()) {
    providers.push(['smtp', () => sendViaSmtp(p)]);
  }
  if (providers.length === 0) {
    return { sent: false, provider: 'none', error: 'لا مزود بريد مُعد (BREVO_API_KEY أو RESEND_API_KEY أو SMTP_*) — شارك الرابط مع المدعو يدوياً' };
  }
  const errors: string[] = [];
  for (const [name, fn] of providers) {
    const r = await fn();
    if (r.sent) {
      console.log(`[email] sent via ${r.provider} to ${p.to}`);
      return r;
    }
    errors.push(`${name}: ${r.error}`);
  }
  return { sent: false, provider: 'none', error: `فشل الإرسال عبر كل المزودين — ${errors.join(' | ')}` };
}

export interface EmailInviteInfo { valid: boolean; reason?: string; discussionName?: string; email?: string }

/** Validate an email-invite code without consuming it. */
export function peekEmailInvite(code: string): EmailInviteInfo {
  const row = db.prepare('SELECT * FROM discussion_email_invites WHERE code = ?').get(String(code || '')) as any;
  if (!row) return { valid: false, reason: 'رابط الدعوة غير صالح' };
  if (row.consumed_by === 'REVOKED') return { valid: false, reason: 'تم إلغاء رابط الدعوة من قبل المالك' };
  if (row.consumed_by) return { valid: false, reason: 'تم استخدام رابط الدعوة مسبقاً' };
  if (new Date(row.expires_at) <= new Date()) return { valid: false, reason: 'انتهت صلاحية رابط الدعوة' };
  const disc = getDiscussionRow(row.discussion_id);
  if (!disc) return { valid: false, reason: 'المجموعة لم تعد موجودة' };
  return { valid: true, discussionName: disc.name, email: row.invited_email };
}

/**
 * Called right after registration: if the new user's email matches a pending
 * email invite, they are added to the group automatically (invite consumed).
 */
export function consumeEmailInviteForNewUser(userId: string, email: string): { discussionId: string; discussionName: string } | null {
  const norm = normalizeEmail(email);
  const row = db.prepare('SELECT * FROM discussion_email_invites WHERE invited_email = ? AND consumed_by IS NULL ORDER BY created_at DESC')
    .get(norm) as any;
  if (!row) return null;
  if (new Date(row.expires_at) <= new Date()) return null;
  const disc = getDiscussionRow(row.discussion_id);
  if (!disc) return null;

  if (row.consumed_by === 'REVOKED') return null;
  db.prepare('UPDATE discussion_email_invites SET consumed_by = ? WHERE code = ?').run(userId, row.code);
  if (!isMember(row.discussion_id, userId)) {
    addMember(row.discussion_id, userId);
  }
  return { discussionId: row.discussion_id, discussionName: disc.name };
}

export interface EmailInviteRow {
  code: string;
  invitedEmail: string;
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'consumed' | 'expired' | 'revoked';
  consumedByName?: string;
}

/** All email invites of one group — owner & moderators. */
export function listGroupEmailInvites(discussionId: string, byUserId: string): EmailInviteRow[] {
  if (!isModerator(discussionId, byUserId)) throw new Error('فقط المالك أو المشرفون يمكنهم عرض دعوات المجموعة');
  const rows = db.prepare(`
    SELECT e.code, e.invited_email, e.created_at, e.expires_at, e.consumed_by,
      u.name AS consumed_by_name
    FROM discussion_email_invites e
    LEFT JOIN users u ON u.id = e.consumed_by
    WHERE e.discussion_id = ?
    ORDER BY e.created_at DESC
  `).all(discussionId) as any[];
  const now = new Date();
  return rows.map(r => {
    let status: EmailInviteRow['status'];
    if (r.consumed_by === 'REVOKED') status = 'revoked';
    else if (r.consumed_by) status = 'consumed';
    else if (new Date(r.expires_at) <= now) status = 'expired';
    else status = 'pending';
    return {
      code: r.code,
      invitedEmail: r.invited_email,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      status,
      consumedByName: r.consumed_by_name || undefined,
    };
  });
}

/** Owner or moderator revokes (cancels) a pending email invite so its link stops working. */
export function revokeEmailInvite(discussionId: string, code: string, byUserId: string): void {
  if (!isModerator(discussionId, byUserId)) throw new Error('فقط المالك أو المشرفون يمكنهم إلغاء الدعوات');
  const row = db.prepare('SELECT * FROM discussion_email_invites WHERE code = ? AND discussion_id = ?').get(code, discussionId) as any;
  if (!row) throw new Error('رابط الدعوة غير موجود');
  if (row.consumed_by) throw new Error('لا يمكن إلغاء دعوة مستهلكة — المدعو انضم بالفعل');
  // Revocation = consume without a user (the link stops working everywhere).
  // peekEmailInvite/consumeEmailInviteForNewUser both treat any consumed_by as used.
  db.prepare("UPDATE discussion_email_invites SET consumed_by = 'REVOKED' WHERE code = ?").run(code);
}

// ---------------------------------------------------------------------------
// Automatic reminder — after 3 days, pending invitees get ONE reminder email
// (and the owner gets an in-app notification). Never repeats.
// ---------------------------------------------------------------------------
const REMINDER_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
const REMINDER_SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly sweep

/** Reminder send goes through the same provider chain (Brevo → Resend → SMTP). */
async function trySendReminderEmail(to: string, groupName: string, inviterName: string, inviteUrl: string): Promise<{ sent: boolean; error?: string }> {
  const r = await sendEmail({
    to,
    subject: `⏰ تذكير: دعوتك لمجموعة "${groupName}" لا تزال بانتظارك`,
    text: `مرحباً،\nقبل 3 أيام دعاك ${inviterName} للانضمام إلى مجموعة "${groupName}" ولم تسجّل بعد.\nالرابط لا يزال صالحاً — سجّل بنفس هذا البريد (${to}) وستُضاف تلقائياً:\n${inviteUrl}`,
    html: buildReminderEmailHtml(groupName, inviterName, inviteUrl, to),
  });
  return { sent: r.sent, error: r.error };
}

/**
 * Sweep pending email invites older than 3 days that were never reminded:
 * sends a reminder email to the invitee (best-effort) and an in-app
 * notification to the owner, then stamps reminded_at so it never repeats.
 * Expired invites are marked handled without sending anything.
 * Returns how many invites were processed (exported for tests/CLI).
 */
export async function remindStaleEmailInvites(): Promise<number> {
  const cutoff = new Date(Date.now() - REMINDER_AFTER_MS).toISOString();
  const stale = db.prepare(`
    SELECT e.code, e.discussion_id, e.invited_email, e.invited_by, e.expires_at,
      u.name AS inviter_name
    FROM discussion_email_invites e
    JOIN users u ON u.id = e.invited_by
    WHERE e.consumed_by IS NULL AND e.reminded_at IS NULL AND e.created_at < ?
  `).all(cutoff) as any[];

  for (const row of stale) {
    const stampHandled = () =>
      db.prepare('UPDATE discussion_email_invites SET reminded_at = ? WHERE code = ? AND reminded_at IS NULL')
        .run(new Date().toISOString(), row.code);

    // Expired or vanished group: nothing worth reminding — just mark handled
    if (new Date(row.expires_at) <= new Date() || !getDiscussionRow(row.discussion_id)) {
      stampHandled();
      continue;
    }

    const disc = getDiscussionRow(row.discussion_id)!;
    const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
    const inviteUrl = `${baseUrl}/join/${row.code}`;
    const mail = await trySendReminderEmail(row.invited_email, disc.name, row.inviter_name || 'فريقك', inviteUrl);

    // Stamp FIRST so a crash mid-loop never double-sends the reminder
    stampHandled();

    // In-app nudge to the owner so they know the invite is still unanswered
    pushNotification(
      row.invited_by,
      'info',
      'تذكير تلقائي أُرسل للمدعو',
      `مرّت 3 أيام على دعوتك لـ ${row.invited_email} لمجموعة "${disc.name}" ولم يسجّل بعد${mail.sent ? ' — أُرسل بريد تذكير' : ' — لم يُرسل بريد تذكير (لا مزود مُعد أو فشل الإرسال)'}`,
      { code: row.code, discussionId: row.discussion_id, discussionName: disc.name, invitedEmail: row.invited_email }
    );
    console.log(`[email-invites] reminder ${mail.sent ? 'sent' : 'skipped'} for ${row.invited_email} (group: ${disc.name})`);
  }
  return stale.length;
}

/** Start the hourly reminder sweeper. Called once from server startup. */
export function startEmailInviteReminderScheduler(): void {
  // First sweep shortly after boot, then hourly. unref() so it never blocks exit.
  const run = () => remindStaleEmailInvites().catch(err => console.error('[email-invites] reminder sweep failed:', err?.message || err));
  setTimeout(run, 15 * 1000).unref();
  setInterval(run, REMINDER_SWEEP_INTERVAL_MS).unref();
}
