import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../server/emailInvites', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/emailInvites')>();
  return { ...actual, sendEmail: vi.fn() };
});

import { createTestClient, useTursoClient, one } from '../../server/turso';
import { sendEmail } from '../../server/emailInvites';
import {
  requestSignupCode,
  retryOnceOnTransient,
  TEMPORARY_OUTAGE_MESSAGE,
} from '../../server/signupVerification';

const mockSend = vi.mocked(sendEmail);

const storedRow = (email: string) =>
  one<{ email: string }>('SELECT email FROM signup_verifications WHERE email = ?', [email]);

let counter = 0;
const freshEmail = () => `user${Date.now()}-${counter++}@example.com`;

describe('signup code request', () => {
  beforeAll(() => {
    useTursoClient(createTestClient());
  });

  beforeEach(() => {
    mockSend.mockReset();
  });

  it('deletes the code when the provider is definitively missing', async () => {
    const email = freshEmail();
    mockSend.mockResolvedValue({
      sent: false,
      provider: 'none',
      error: 'لا مزود بريد مُعد (BREVO_API_KEY أو RESEND_API_KEY أو SMTP_*) — شارك الرابط مع المدعو يدوياً',
    });

    const result = await requestSignupCode(email);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('تعذّر إرسال رمز التحقق');
    expect(result.message).not.toMatch(/fetch failed|ECONNRESET|502/i);
    expect(await storedRow(email)).toBeUndefined();
  });

  it('keeps the code when delivery is uncertain, because the mail may have arrived', async () => {
    const email = freshEmail();
    mockSend.mockResolvedValue({
      sent: false,
      provider: 'brevo',
      error: 'فشل الإرسال عبر كل المزودين — brevo: fetch failed',
    });

    const result = await requestSignupCode(email);

    expect(result.deliveryUncertain).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.email).toMatch(/\*\*\*@/);
    expect(result.message).toContain('قد تكون الرسالة وصلت');
    // الصف يبقى: الرمز الذي في بريد المستخدم لا يزال صالحًا.
    expect(await storedRow(email)).toBeDefined();
  });

  it('keeps the code when the mailer throws unexpectedly', async () => {
    const email = freshEmail();
    mockSend.mockRejectedValue(new Error('socket hang up'));

    const result = await requestSignupCode(email);

    expect(result.deliveryUncertain).toBe(true);
    expect(await storedRow(email)).toBeDefined();
  });

  it('reports a friendly message instead of a raw database error', async () => {
    const email = freshEmail();
    const original = createTestClient;
    // Simulate an unreachable Turso for the whole request.
    useTursoClient({
      execute: async () => {
        throw new Error('LibsqlError: Server returned HTTP status 502: Bad Gateway');
      },
      batch: async () => {
        throw new Error('LibsqlError: Server returned HTTP status 502: Bad Gateway');
      },
    } as never);

    const result = await requestSignupCode(email);

    expect(result.ok).toBe(false);
    expect(result.message).toBe(TEMPORARY_OUTAGE_MESSAGE);
    expect(result.message).not.toMatch(/502|LibsqlError|fetch failed/i);

    useTursoClient(original());
    expect(createTestClient).toBe(original);
  });

  it('retries a transient failure exactly once', async () => {
    let calls = 0;
    const value = await retryOnceOnTransient(async () => {
      calls += 1;
      if (calls === 1) throw new Error('LibsqlError: Server returned HTTP status 502');
      return 'ok';
    });

    expect(value).toBe('ok');
    expect(calls).toBe(2);
  });

  it('does not retry a logical rejection', async () => {
    let calls = 0;
    await expect(
      retryOnceOnTransient(async () => {
        calls += 1;
        throw new Error('UNIQUE constraint failed');
      })
    ).rejects.toThrow('UNIQUE constraint failed');
    expect(calls).toBe(1);
  });
});
