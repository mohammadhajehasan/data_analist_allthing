/**
 * اختبارات حصة الاستخدام اليومي لمفتاح الخادم (server/aiQuota.ts)
 * الآن على عميل Turso في الذاكرة (file::memory:) — بلا ملفات قاعدة محلية.
 */
import { describe, it, expect } from 'vitest';
import { createAiQuotaStore, utcDay, nextUtcMidnight, type AiQuotaStore } from '../../server/aiQuota';
import { createTestClient, useTursoClient } from '../../server/turso';

let store: AiQuotaStore;

async function makeStore(): Promise<AiQuotaStore> {
  useTursoClient(createTestClient());
  return createAiQuotaStore();
}

describe('aiQuota store', () => {
  it('يسمح حتى الحد ثم يرفض الطلبات الإضافية', async () => {
    store = await makeStore();
    for (let i = 0; i < 3; i++) {
      const r = await store.consume({ callerId: 'user:a', limit: 3 });
      expect(r.ok).toBe(true);
    }
    const blocked = await store.consume({ callerId: 'user:a', limit: 3 });
    expect(blocked.ok).toBe(false);
    expect(blocked.used).toBe(3);
    expect(blocked.remaining).toBe(0);
  });

  it('يعزل عدّاد كل مستخدم عن الآخرين', async () => {
    store = await makeStore();
    await store.consume({ callerId: 'user:a', limit: 2 });
    await store.consume({ callerId: 'user:a', limit: 2 });
    const b = await store.consume({ callerId: 'user:b', limit: 2 });
    expect(b.ok).toBe(true);
    expect(b.used).toBe(1);
  });

  it('يتجدد العدّاد تلقائياً مع بداية يوم UTC جديد', async () => {
    store = await makeStore();
    await store.consume({ callerId: 'user:a', limit: 1, day: '2026-01-01' });
    const blocked = await store.consume({ callerId: 'user:a', limit: 1, day: '2026-01-01' });
    expect(blocked.ok).toBe(false);
    const nextDay = await store.consume({ callerId: 'user:a', limit: 1, day: '2026-01-02' });
    expect(nextDay.ok).toBe(true);
    expect(nextDay.used).toBe(1);
  });

  it('يحسب تكلفة الحلبة متعددة النماذج (أكثر من طلب في الاستدعاء الواحد)', async () => {
    store = await makeStore();
    const r1 = await store.consume({ callerId: 'user:a', cost: 3, limit: 5 });
    expect(r1.ok).toBe(true);
    expect(r1.remaining).toBe(2);
    const r2 = await store.consume({ callerId: 'user:a', cost: 3, limit: 5 });
    expect(r2.ok).toBe(false);
    expect(r2.used).toBe(3);
  });

  it('limit=0 يعني غير محدود مع تتبع الاستخدام', async () => {
    store = await makeStore();
    for (let i = 0; i < 5; i++) {
      const r = await store.consume({ callerId: 'user:a', limit: 0 });
      expect(r.ok).toBe(true);
      expect(r.remaining).toBe(-1);
    }
    const s = await store.status({ callerId: 'user:a', limit: 0 });
    expect(s.used).toBe(5);
    expect(s.ok).toBe(true);
  });

  it('status يعرض الاستخدام دون استهلاك إضافي', async () => {
    store = await makeStore();
    await store.consume({ callerId: 'user:a', limit: 4 });
    const s1 = await store.status({ callerId: 'user:a', limit: 4 });
    expect(s1.used).toBe(1);
    expect(s1.remaining).toBe(3);
    const s2 = await store.status({ callerId: 'user:a', limit: 4 });
    expect(s2.used).toBe(1);
  });

  it('resetAt يشير إلى منتصف ليل UTC التالي', async () => {
    store = await makeStore();
    const r = await store.consume({ callerId: 'user:a', limit: 5 });
    expect(r.resetAt).toBe(nextUtcMidnight());
    expect(r.resetAt.endsWith('T00:00:00.000Z')).toBe(true);
  });

  it('utcDay يعيد صيغة YYYY-MM-DD', () => {
    expect(utcDay(new Date('2026-10-04T09:30:00Z'))).toBe('2026-10-04');
  });
});
