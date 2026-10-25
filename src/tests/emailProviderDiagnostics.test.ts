/**
 * تشخيص مزودي البريد — سلسلة الإرسال تسجّل كل محاولة (نجاح/إخفاق) لكل مزود
 * مع أسباب الإخفاق الأخيرة، وتعرض في لوحة الإدارة عبر /api/admin/email-providers.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sendEmail, emailProviderDiagnostics, resetAgentMailInboxForTests } from '../../server/emailInvites';

const ENV_KEYS = ['BREVO_API_KEY', 'RESEND_API_KEY', 'AGENTMAIL_API_KEY', 'AGENTMAIL_INBOX_ID', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'] as const;
const savedEnv: Record<string, string | undefined> = {};

function setEnv(values: Record<string, string | undefined>): void {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    if (values[k] === undefined) delete process.env[k];
    else process.env[k] = values[k];
  }
}

const mockFetch = (impl: () => Promise<unknown>) => vi.stubGlobal('fetch', vi.fn(impl));

const payload = { to: 'a@b.com', subject: 's', text: 't', html: '<p>t</p>' };

describe('email provider diagnostics', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    resetAgentMailInboxForTests();
    delete (process.env as any).AGENTMAIL_INBOX_ID;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  });

  it('لا مزود مضبوط ⇒ sendEmail يفشل وجميع المزودين تظهر «غير مُعدين»', async () => {
    setEnv({});
    const r = await sendEmail(payload, 'invite');
    expect(r.sent).toBe(false);
    for (const p of emailProviderDiagnostics()) expect(p.configured).toBe(false);
  });

  it('إخفاق Brevo يُسجَّل مع السبب والغرض، ثم تتراجع متتالية الفشل بعد النجاح', async () => {
    setEnv({ BREVO_API_KEY: 'k', RESEND_API_KEY: undefined, SMTP_HOST: undefined, SMTP_USER: undefined, SMTP_PASS: undefined });

    // فشل بنمط Resend/Brevo المألوف: 403 نطاق غير مُتحقَّق
    mockFetch(async () => ({ ok: false, status: 403, text: async () => 'domain not verified' }));
    const fail = await sendEmail(payload, 'password-reset');
    expect(fail.sent).toBe(false);

    let [brevo] = emailProviderDiagnostics();
    expect(brevo.provider).toBe('brevo');
    expect(brevo.configured).toBe(true);
    expect(brevo.totalAttempts).toBe(1);
    expect(brevo.consecutiveFailures).toBe(1);
    expect(brevo.lastAttempt?.ok).toBe(false);
    expect(brevo.lastAttempt?.purpose).toBe('password-reset');
    expect(brevo.lastAttempt?.error).toContain('403');
    expect(brevo.recentFailures).toHaveLength(1);

    // نجاح لاحق ⇒ يتوقف العدّاد التتالي لكن تاريخ الإخفاقات يبقى معروضاً
    mockFetch(async () => ({ ok: true, status: 200 }));
    const ok = await sendEmail(payload, 'invite');
    expect(ok.sent).toBe(true);

    [brevo] = emailProviderDiagnostics();
    expect(brevo.totalAttempts).toBe(2);
    expect(brevo.totalFailures).toBe(1);
    expect(brevo.consecutiveFailures).toBe(0);
    expect(brevo.lastAttempt?.ok).toBe(true);
    expect(brevo.lastAttempt?.purpose).toBe('invite');
    expect(brevo.lastSuccessAt).toBeTruthy();
    expect(brevo.recentFailures).toHaveLength(1);
  });

  it('قائمة أسباب الإخفاق الأخيرة محدودة بـ 8 عناصر والأحدث أولاً', async () => {
    setEnv({ BREVO_API_KEY: 'k', RESEND_API_KEY: undefined, SMTP_HOST: undefined, SMTP_USER: undefined, SMTP_PASS: undefined });
    mockFetch(async () => {
      throw new Error('network down');
    });
    for (let i = 0; i < 10; i++) {
      await sendEmail(payload, 'reminder');
    }
    const [brevo] = emailProviderDiagnostics();
    expect(brevo.totalAttempts).toBeGreaterThanOrEqual(10);
    expect(brevo.recentFailures.length).toBeLessThanOrEqual(8);
    expect(brevo.recentFailures[0]?.error).toContain('network down');
    expect(brevo.recentFailures[0]?.purpose).toBe('reminder');
    expect(new Date(brevo.recentFailures[0].at).getTime()).toBeGreaterThanOrEqual(
      new Date(brevo.recentFailures[1].at).getTime()
    );
  });

  it('AgentMail كمرتبة ثالثة: يُنشئ صندوقاً ثم يرسل منه ويُسجَّل ناجحاً في التشخيص', async () => {
    setEnv({ BREVO_API_KEY: undefined, RESEND_API_KEY: undefined, AGENTMAIL_API_KEY: 'am_test', SMTP_HOST: undefined, SMTP_USER: undefined, SMTP_PASS: undefined });
    vi.stubGlobal('fetch', vi.fn(async (url: any, init?: any) => {
      const u = String(url);
      if (u.endsWith('/v0/inboxes') && !init?.method) {
        return { ok: true, status: 200, json: async () => [] };
      }
      if (u.endsWith('/v0/inboxes') && init?.method === 'POST') {
        return { ok: true, status: 201, json: async () => ({ inbox_id: 'inbox_t', email: 't@agentmail.to' }) };
      }
      if (u.includes('/messages/send')) {
        return { ok: true, status: 200, json: async () => ({ message_id: 'm1' }) };
      }
      throw new Error('unexpected fetch ' + u);
    }));

    const r = await sendEmail(payload, 'password-reset');
    expect(r.sent).toBe(true);
    expect(r.provider).toBe('agentmail');

    const am = emailProviderDiagnostics().find((p) => p.provider === 'agentmail');
    expect(am?.configured).toBe(true);
    expect(am?.totalAttempts).toBe(1);
    expect(am?.lastAttempt?.ok).toBe(true);
    expect(am?.lastAttempt?.purpose).toBe('password-reset');
  });

  it('فشل إنشاء صندوق AgentMail يُسجَّل ويُنهي السلسلة بذره في الرسالة النهائية', async () => {
    setEnv({ BREVO_API_KEY: undefined, RESEND_API_KEY: undefined, AGENTMAIL_API_KEY: 'am_test', SMTP_HOST: undefined, SMTP_USER: undefined, SMTP_PASS: undefined });
    vi.stubGlobal('fetch', vi.fn(async (url: any, init?: any) => {
      const u = String(url);
      if (u.endsWith('/v0/inboxes') && !init?.method) {
        return { ok: true, status: 200, json: async () => [] };
      }
      return { ok: false, status: 500, text: async () => 'boom', json: async () => ({}) };
    }));

    const r = await sendEmail(payload, 'reminder');
    expect(r.sent).toBe(false);
    expect(r.error).toContain('agentmail');
    expect(r.error).toContain('500');

    const am = emailProviderDiagnostics().find((p) => p.provider === 'agentmail');
    expect(am?.consecutiveFailures).toBe(1);
    expect(am?.recentFailures[0]?.purpose).toBe('reminder');
  });
});
