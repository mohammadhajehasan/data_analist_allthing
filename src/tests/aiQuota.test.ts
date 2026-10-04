/**
 * اختبارات حصة الاستخدام اليومي لمفتاح الخادم (server/aiQuota.ts)
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createAiQuotaStore, utcDay, nextUtcMidnight } from '../../server/aiQuota';

const tmpDirs: string[] = [];

function makeStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-quota-test-'));
  tmpDirs.push(dir);
  return createAiQuotaStore(path.join(dir, 'quota.db'));
}

afterAll(() => {
  tmpDirs.forEach(d => fs.rmSync(d, { recursive: true, force: true }));
});

describe('aiQuota store', () => {
  it('يسمح حتى الحد ثم يرفض الطلبات الإضافية', () => {
    const store = makeStore();
    for (let i = 0; i < 3; i++) {
      const r = store.consume({ callerId: 'user:a', limit: 3 });
      expect(r.ok).toBe(true);
    }
    const blocked = store.consume({ callerId: 'user:a', limit: 3 });
    expect(blocked.ok).toBe(false);
    expect(blocked.used).toBe(3);
    expect(blocked.remaining).toBe(0);
    store.close();
  });

  it('يعزل عدّاد كل مستخدم عن الآخرين', () => {
    const store = makeStore();
    store.consume({ callerId: 'user:a', limit: 2 });
    store.consume({ callerId: 'user:a', limit: 2 });
    const b = store.consume({ callerId: 'user:b', limit: 2 });
    expect(b.ok).toBe(true);
    expect(b.used).toBe(1);
    store.close();
  });

  it('يتجدد العدّاد تلقائياً مع بداية يوم UTC جديد', () => {
    const store = makeStore();
    store.consume({ callerId: 'user:a', limit: 1, day: '2026-01-01' });
    const blocked = store.consume({ callerId: 'user:a', limit: 1, day: '2026-01-01' });
    expect(blocked.ok).toBe(false);
    const nextDay = store.consume({ callerId: 'user:a', limit: 1, day: '2026-01-02' });
    expect(nextDay.ok).toBe(true);
    expect(nextDay.used).toBe(1);
    store.close();
  });

  it('يحسب تكلفة الحلبة متعددة النماذج (أكثر من طلب في الاستدعاء الواحد)', () => {
    const store = makeStore();
    const r1 = store.consume({ callerId: 'user:a', cost: 3, limit: 5 });
    expect(r1.ok).toBe(true);
    expect(r1.remaining).toBe(2);
    const r2 = store.consume({ callerId: 'user:a', cost: 3, limit: 5 });
    expect(r2.ok).toBe(false);
    expect(r2.used).toBe(3);
    store.close();
  });

  it('limit=0 يعني غير محدود مع تتبع الاستخدام', () => {
    const store = makeStore();
    for (let i = 0; i < 5; i++) {
      const r = store.consume({ callerId: 'user:a', limit: 0 });
      expect(r.ok).toBe(true);
      expect(r.remaining).toBe(-1);
    }
    const s = store.status({ callerId: 'user:a', limit: 0 });
    expect(s.used).toBe(5);
    expect(s.ok).toBe(true);
    store.close();
  });

  it('status يعرض الاستخدام دون استهلاك إضافي', () => {
    const store = makeStore();
    store.consume({ callerId: 'user:a', limit: 4 });
    const s1 = store.status({ callerId: 'user:a', limit: 4 });
    expect(s1.used).toBe(1);
    expect(s1.remaining).toBe(3);
    const s2 = store.status({ callerId: 'user:a', limit: 4 });
    expect(s2.used).toBe(1);
    store.close();
  });

  it('resetAt يشير إلى منتصف ليل UTC التالي', () => {
    const store = makeStore();
    const r = store.consume({ callerId: 'user:a', limit: 5 });
    expect(r.resetAt).toBe(nextUtcMidnight());
    expect(r.resetAt.endsWith('T00:00:00.000Z')).toBe(true);
    store.close();
  });

  it('utcDay يعيد صيغة YYYY-MM-DD', () => {
    expect(utcDay(new Date('2026-10-04T09:30:00Z'))).toBe('2026-10-04');
  });
});
