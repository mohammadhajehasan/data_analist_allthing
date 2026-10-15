/**
 * اختبارات سقف الخمول للجلسات (server/auth.ts)
 * تفترض SESSION_IDLE_MS قصيراً في نطاق الاختبار فقط — الإنتاج يستخدم 5 دقائق.
 */
import { describe, it, expect } from 'vitest';
import { createTestClient, useTursoClient } from '../../server/turso';
import {
  createUser, verifyLogin, getUserByToken, revokeSession, getSessionIdleMsStored, invalidateIdleCache,
  describeDevice, listSessionsForUser, revokeSessionForUser, revokeAllSessionsForUser,
} from '../../server/auth';
import { getSetting, setSetting } from '../../server/appSettings';

describe('auth — مدة الخمول المخزنة (إعداد المدير)', () => {
  it('القيمة المخزنة في Turso تسري بلا env، والـ env يغلبها عند وجوده', async () => {
    useTursoClient(createTestClient());
    const prevEnv = process.env.SESSION_IDLE_MS;
    delete process.env.SESSION_IDLE_MS;
    try {
      // لا قيمة مخزنة: الافتراضي 5 دقائق
      expect(await getSessionIdleMsStored()).toBe(5 * 60 * 1000);

      // المدير يخزن 3 دقائق عبر setSetting (نفس ما تفعله نقطة PUT
      // — التي تبطل خزفة القيمة فوراً كما تخطاء نفس الوحدة)
      await setSetting('session_idle_ms', String(3 * 60 * 1000));
      invalidateIdleCache();
      expect(await getSetting('session_idle_ms', '')).toBe(String(3 * 60 * 1000));
      expect(await getSessionIdleMsStored()).toBe(3 * 60 * 1000);

      // إعداد بيئة قسري يغلب المخزن (نمط الاختبار السابق)
      process.env.SESSION_IDLE_MS = '1000';
      expect(await getSessionIdleMsStored()).toBe(1000);
    } finally {
      if (prevEnv === undefined) delete process.env.SESSION_IDLE_MS;
      else process.env.SESSION_IDLE_MS = prevEnv;
      invalidateIdleCache(); // عدم تأثر الاختبارات التالية بذخفة هذه المدة
    }
  });
});

describe('auth — إدارة الجلسات النشطة', () => {
  it('describeDevice يحول User-Agent إلى وصف مقروء', () => {
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36')).toContain('Chrome');
    expect(describeDevice('Mozilla/5.0 (iPhone) Safari/605')).toContain('iOS');
    expect(describeDevice('')).toContain('غير معروف');
  });

  it('listSessionsForUser يعرض بادئات فقط ويميّز الجلسة الحالية', async () => {
    useTursoClient(createTestClient());
    await createUser('sessions@test.com', 'مستخدم الجلسات', 'secret1');
    const a = await verifyLogin('sessions@test.com', 'secret1', 'Chrome على Windows');
    const b = await verifyLogin('sessions@test.com', 'secret1', 'Safari على iOS');

    const rows = await listSessionsForUser('usr-none', a.token);
    expect(rows).toHaveLength(0); // بدون ملكية: صفر جلسات

    const mine = await listSessionsForUser((await getUserByToken(a.token))!.id, a.token);
    expect(mine).toHaveLength(2);
    expect(mine.filter(s => s.current)).toHaveLength(1);
    expect(mine[0].id.endsWith('…')).toBe(true);
    expect(mine[0].id.length).toBeLessThan(16); // بادئة فقط، لا الرمز الكامل
    expect(mine.map(s => s.device)).toContain('Chrome على Windows');
    void b;
  });

  it('revokeSessionForUser يبطل جلسة واحدة ببادئتها بلا مساس الأخرى', async () => {
    useTursoClient(createTestClient());
    await createUser('revoke-one@test.com', 'أ', 'secret1');
    const a = await verifyLogin('revoke-one@test.com', 'secret1', 'Chrome على Windows');
    const b = await verifyLogin('revoke-one@test.com', 'secret1', 'Firefox على Linux');

    const target = (await listSessionsForUser((await getUserByToken(a.token))!.id, '')).find(s => s.current === false)!;
    // نبطئ الجلسة البعيدة (b) — بعد إبطالها لا تجد بـ getUserByToken
    const before = await getUserByToken(b.token);
    expect(before).not.toBeNull();
    const bPrefix = b.token.slice(0, 8) + '…';
    expect(await revokeSessionForUser(before!.id, bPrefix)).toBe(true);
    expect(await getUserByToken(b.token)).toBeNull();
    // الجلسة الحالية (a) ما زالت صالحة
    expect((await getUserByToken(a.token))?.email).toBe('revoke-one@test.com');
    void target;
  });

  it('revokeAllSessionsForUser يبطل كل ما عدا الجلسة الحالية', async () => {
    useTursoClient(createTestClient());
    await createUser('revoke-all@test.com', 'ب', 'secret1');
    const a = await verifyLogin('revoke-all@test.com', 'secret1', 'Edge على Windows');
    const b = await verifyLogin('revoke-all@test.com', 'secret1', 'Chrome على Android');
    const c = await verifyLogin('revoke-all@test.com', 'secret1', 'Safari على macOS');
    const me = (await getUserByToken(a.token))!;

    expect(await revokeAllSessionsForUser(me.id, a.token)).toBe(2);
    expect(await getUserByToken(b.token)).toBeNull();
    expect(await getUserByToken(c.token)).toBeNull();
    expect((await getUserByToken(a.token))?.id).toBe(me.id);
  });
});

describe('auth — الجلسة تنتهي بعد الخمول', () => {
  it('getSessionIdleMsStored الافتراضي 5 دقائق ويحترم متغير البيئة (أولوية القسري)', async () => {
    const prev = process.env.SESSION_IDLE_MS;
    try {
      delete process.env.SESSION_IDLE_MS;
      expect(await getSessionIdleMsStored()).toBe(5 * 60 * 1000);
      process.env.SESSION_IDLE_MS = '1000';
      expect(await getSessionIdleMsStored()).toBe(1000);
    } finally {
      if (prev === undefined) delete process.env.SESSION_IDLE_MS;
      else process.env.SESSION_IDLE_MS = prev;
    }
  });

  it('جلسة نشطة الآن صالحة، وبعد سقف الخمول ترفض (401 فعلياً)', async () => {
    useTursoClient(createTestClient());
    const prevIdle = process.env.SESSION_IDLE_MS;
    process.env.SESSION_IDLE_MS = '1000'; // ثانية واحدة: سقف خمول مضغوط للاختبار
    try {
      await createUser('idle@test.com', 'اختبار', 'secret1');
      const { token } = await verifyLogin('idle@test.com', 'secret1');
      const active = await getUserByToken(token);
      expect(active?.email).toBe('idle@test.com');

      await new Promise(r => setTimeout(r, 1300)); // تجاوز سقف الخمول
      expect(await getUserByToken(token)).toBeNull();
    } finally {
      if (prevIdle === undefined) delete process.env.SESSION_IDLE_MS;
      else process.env.SESSION_IDLE_MS = prevIdle;
    }
  });

  it('revokeSession يبطل الرمز فوراً حتى قبل فحص الخمول', async () => {
    useTursoClient(createTestClient());
    await createUser('revoked@test.com', 'اختبار', 'secret1');
    const { token } = await verifyLogin('revoked@test.com', 'secret1');
    expect((await getUserByToken(token))?.email).toBe('revoked@test.com');
    await revokeSession(token);
    expect(await getUserByToken(token)).toBeNull();
  });
});
