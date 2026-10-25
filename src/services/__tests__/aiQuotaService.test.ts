import { describe, it, expect, vi } from 'vitest';
import {
  parseQuotaPayload,
  timeUntilReset,
  formatResetCountdown,
  formatQuotaExhaustedMessage,
  fetchAiQuota,
} from '../aiQuotaService';

describe('parseQuotaPayload', () => {
  it('parse 429 quota payload from the server contract', () => {
    const quota = parseQuotaPayload({
      error: 'وصلت الحد اليومي لاستخدام مفتاح الخادم (100/100 طلب)',
      quota: { used: 100, limit: 100, remaining: 0, resetAt: '2026-10-26T00:00:00Z' },
    });
    expect(quota).not.toBeNull();
    expect(quota!.ok).toBe(false);
    expect(quota!.used).toBe(100);
    expect(quota!.limit).toBe(100);
    expect(quota!.remaining).toBe(0);
  });

  it('returns null for a payload without quota or with invalid limit', () => {
    expect(parseQuotaPayload({ error: 'quota exceeded' })).toBeNull();
    expect(parseQuotaPayload({ quota: { used: 5, limit: 0, remaining: 5 } })).toBeNull();
    expect(parseQuotaPayload(null)).toBeNull();
  });
});

describe('timeUntilReset / formatResetCountdown', () => {
  const now = new Date('2026-10-25T20:00:00Z');
  const resetAt = new Date('2026-10-26T00:00:00Z').toISOString();

  it('counts full hours and minutes until reset', () => {
    const { hours, minutes } = timeUntilReset(resetAt, now);
    expect(hours).toBe(4);
    expect(minutes).toBe(0);
  });

  it('formats countdown in Arabic and English', () => {
    expect(formatResetCountdown(resetAt, true, now)).toBe('4 س');
    expect(formatResetCountdown(resetAt, false, now)).toBe('4 h');
  });

  it('clamps to zero for a past reset', () => {
    const past = new Date('2026-10-25T00:00:00Z').toISOString();
    const { hours, minutes } = timeUntilReset(past, now);
    expect(hours).toBe(0);
    expect(minutes).toBe(0);
  });
});

describe('formatQuotaExhaustedMessage', () => {
  const quota = {
    ok: false, used: 100, limit: 100, remaining: 0,
    resetAt: new Date('2026-10-26T00:00:00Z').toISOString(),
    unlimited: false, authenticated: true,
  };

  it('mentions used/limit and the reset countdown in Arabic', () => {
    const { title, description } = formatQuotaExhaustedMessage(quota, true, new Date('2026-10-25T20:00:00Z'));
    expect(title).toContain('انتهت حصة');
    expect(description).toContain('100/100');
    expect(description).toContain('يتجدد الحد تلقائياً بعد');
    expect(description).toContain('مفتاحك الخاص');
  });
});

describe('fetchAiQuota', () => {
  it('maps the /api/ai/quota response contract', async () => {
    const response = {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true, used: 3, limit: 100, remaining: 97,
        resetAt: '2026-10-26T00:00:00Z', unlimited: false, authenticated: true,
      }),
    };
    vi.stubGlobal('fetch', vi.fn(async () => response));
    const quota = await fetchAiQuota();
    expect(quota).not.toBeNull();
    expect(quota!.remaining).toBe(97);
    vi.unstubAllGlobals();
  });

  it('returns null when the endpoint fails instead of throwing to the UI', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const quota = await fetchAiQuota();
    expect(quota).toBeNull();
    vi.unstubAllGlobals();
  });
});
