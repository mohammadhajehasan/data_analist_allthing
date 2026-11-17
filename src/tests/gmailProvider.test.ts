/**
 * مزود Google (Gmail / Workspace) في سلسلة إرسال البريد:
 * - يُعدّ «مضبوطًا» فقط بـ App Password أو ثلاثية OAuth2.
 * - يرسل عبر smtp.gmail.com:465 من حساب GMAIL_USER نفسه (غوغل ترفض غيره).
 * - يأتي أولًا في السلسلة، فيُستخدم لرمز التسجيل ورابط استعادة كلمة المرور.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const sendMail = vi.fn(async (..._args: any[]) => ({ messageId: 'ok' }));
const createTransport = vi.fn((_options: any) => ({ sendMail }));

vi.mock('nodemailer', () => ({ default: { createTransport: (...args: any[]) => (createTransport as any)(...args) } }));

import { createTestClient, useTursoClient } from '../../server/turso';
import { createUser } from '../../server/auth';
import { emailProviderDiagnostics, gmailConfigured, sendEmail } from '../../server/emailInvites';
import { requestPasswordReset } from '../../server/passwordReset';

const KEYS = [
  'GMAIL_USER', 'GMAIL_APP_PASSWORD', 'GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN',
  'GMAIL_FROM_NAME', 'BREVO_API_KEY', 'RESEND_API_KEY', 'AGENTMAIL_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS',
] as const;
const saved: Record<string, string | undefined> = {};
for (const key of KEYS) saved[key] = process.env[key];

function onlyGmail(values: Record<string, string | undefined>): void {
  for (const key of KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(values)) process.env[key] = value as string;
}

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  sendMail.mockClear();
  createTransport.mockClear();
});

describe('gmail provider', () => {
  it('is configured only with an app password or a full OAuth2 triple', () => {
    onlyGmail({});
    expect(gmailConfigured()).toBe(false);

    onlyGmail({ GMAIL_APP_PASSWORD: 'abcdefghijklmnop' });
    expect(gmailConfigured()).toBe(false);

    onlyGmail({ GMAIL_USER: 'me@gmail.com', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop' });
    expect(gmailConfigured()).toBe(true);

    onlyGmail({ GMAIL_USER: 'me@gmail.com', GMAIL_CLIENT_ID: 'id', GMAIL_CLIENT_SECRET: 'secret' });
    expect(gmailConfigured()).toBe(false);

    onlyGmail({ GMAIL_USER: 'me@gmail.com', GMAIL_CLIENT_ID: 'id', GMAIL_CLIENT_SECRET: 'secret', GMAIL_REFRESH_TOKEN: 'refresh' });
    expect(gmailConfigured()).toBe(true);
  });

  it('sends through smtp.gmail.com:465 from the account itself, with the spaces stripped from the app password', async () => {
    onlyGmail({ GMAIL_USER: 'me@gmail.com', GMAIL_APP_PASSWORD: 'abcd efgh ijkl mnop', GMAIL_FROM_NAME: 'المنصة' });

    const result = await sendEmail({ to: 'user@example.com', subject: 'رمز', text: 't', html: '<p>t</p>' }, 'signup-verification');

    expect(result.sent).toBe(true);
    expect(result.provider).toBe('gmail');
    expect(createTransport).toHaveBeenCalledTimes(1);
    const options = createTransport.mock.calls[0][0] as any;
    expect(options.host).toBe('smtp.gmail.com');
    expect(options.port).toBe(465);
    expect(options.secure).toBe(true);
    expect(options.auth).toEqual({ user: 'me@gmail.com', pass: 'abcdefghijklmnop' });

    const mail = sendMail.mock.calls[0][0] as any;
    expect(mail.from).toBe('المنصة <me@gmail.com>');
    expect(mail.to).toBe('user@example.com');

    const gmail = emailProviderDiagnostics().find((p) => p.provider === 'gmail');
    expect(gmail?.configured).toBe(true);
    expect(gmail?.lastAttempt?.purpose).toBe('signup-verification');
    expect(gmail?.consecutiveFailures).toBe(0);
  });

  it('explains a rejected login instead of leaking the raw SMTP error', async () => {
    onlyGmail({ GMAIL_USER: 'me@gmail.com', GMAIL_APP_PASSWORD: 'not-an-app-password' });
    sendMail.mockRejectedValueOnce(new Error('Invalid login: 535-5.7.8 Username and Password not accepted'));

    const result = await sendEmail({ to: 'user@example.com', subject: 's', text: 't', html: '<p>t</p>' }, 'password-reset');

    expect(result.sent).toBe(false);
    expect(result.error).toContain('App Password');
    expect(result.error).not.toContain('535-5.7.8');
  });

  it('carries the password-reset code through Google when it is the configured provider', async () => {
    useTursoClient(createTestClient());
    onlyGmail({ GMAIL_USER: 'me@gmail.com', GMAIL_APP_PASSWORD: 'abcdefghijklmnop' });
    const email = `reset-${Date.now()}@example.com`;
    await createUser(email, 'مستخدم الاختبار', 'Passw0rd123', 'admin');

    const result = await requestPasswordReset('email', email);

    expect(result.ok).toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0] as any;
    expect(mail.to).toBe(email);
    expect(mail.subject).toBeTruthy();
    expect(mail.html).toMatch(/\d{6}/);
    const gmail = emailProviderDiagnostics().find((p) => p.provider === 'gmail');
    expect(gmail?.lastAttempt?.ok).toBe(true);
    expect(gmail?.lastAttempt?.purpose).toBe('password-reset');
  });
});
