/**
 * اختبارات المخزن الخادمي لحالة المستخدم (server/userStateStore.ts)
 * يغطي: عزل اللوحات بين المستخدمين، الحفظ/الجلب/الحذف، حدود الحجم والعدد،
 * استبدال اللوحات (استعادة اللقطة)، وحالة مساحة العمل (blob لكل نوع).
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  createUserStateStore,
  getWorkspaceStateLimitBytes,
  type UserStateStore,
} from '../../server/userStateStore';

const tmpDirs: string[] = [];

function makeStore(): UserStateStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'user-state-test-'));
  tmpDirs.push(dir);
  return createUserStateStore(path.join(dir, 'state.db'));
}

function sampleDashboard(id: string, nameAr = 'لوحة اختبار', widgets = 2) {
  return {
    id,
    workspaceId: 'ws-main',
    name: nameAr,
    nameAr,
    title: nameAr,
    titleAr: nameAr,
    description: '',
    descriptionAr: '',
    widgets: Array.from({ length: widgets }, (_, i) => ({ id: `w-${i}`, type: 'kpi' })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

afterAll(() => {
  tmpDirs.forEach(d => fs.rmSync(d, { recursive: true, force: true }));
});

describe('userStateStore — dashboards', () => {
  it('يحفظ لوحة ويجلبها سليمة (round-trip)', () => {
    const store = makeStore();
    expect(store.upsertDashboard('usr-a', sampleDashboard('dash-1', 'المبيعات')).ok).toBe(true);

    const rows = store.listDashboards('usr-a');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('dash-1');
    expect(rows[0].nameAr).toBe('المبيعات');
    expect(rows[0].widgets).toHaveLength(2);
    store.close();
  });

  it('يعزل لوحات كل مستخدم عن الآخرين — جوهر إصلاح ثغرة الخصوصية', () => {
    const store = makeStore();
    store.upsertDashboard('usr-a', sampleDashboard('dash-shared', 'لوحة أ'));
    store.upsertDashboard('usr-b', sampleDashboard('dash-shared', 'لوحة ب'));

    const a = store.getDashboard('usr-a', 'dash-shared');
    const b = store.getDashboard('usr-b', 'dash-shared');
    expect(a?.nameAr).toBe('لوحة أ');
    expect(b?.nameAr).toBe('لوحة ب');
    expect(store.listDashboards('usr-a')).toHaveLength(1);
    expect(store.listDashboards('usr-b')).toHaveLength(1);
    // مستخدم ثالث لا يرى شيئاً
    expect(store.listDashboards('usr-c')).toHaveLength(0);
    store.close();
  });

  it('upsert يحدّث اللوحة الموجودة بدل تكرارها', () => {
    const store = makeStore();
    store.upsertDashboard('usr-a', sampleDashboard('dash-1', 'v1'));
    store.upsertDashboard('usr-a', sampleDashboard('dash-1', 'v2', 5));

    const rows = store.listDashboards('usr-a');
    expect(rows).toHaveLength(1);
    expect(rows[0].nameAr).toBe('v2');
    expect(rows[0].widgets).toHaveLength(5);
    store.close();
  });

  it('يرفض لوحة بلا معرف أو غير صالحة', () => {
    const store = makeStore();
    expect(store.upsertDashboard('usr-a', null as any).ok).toBe(false);
    expect(store.upsertDashboard('usr-a', {} as any).ok).toBe(false);
    expect(store.upsertDashboard('usr-a', { name: 'بلا معرف' } as any).ok).toBe(false);
    expect(store.listDashboards('usr-a')).toHaveLength(0);
    store.close();
  });

  it('يرفض لوحة تتجاوز حد الحجم الخادمي', () => {
    const store = makeStore();
    const big = sampleDashboard('dash-big');
    // نتجاوز الحد عبر حفظ payload ضخم فعلياً
    const huge = { ...big, widgets: Array.from({ length: 50000 }, (_, i) => ({ id: `w-${i}`, data: 'x'.repeat(200) })) };
    const result = store.upsertDashboard('usr-a', huge);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('حد التخزين');
    expect(store.listDashboards('usr-a')).toHaveLength(0);
    store.close();
  });

  it('يحذف لوحة واحدة ودفعات بنجاح', () => {
    const store = makeStore();
    store.upsertDashboard('usr-a', sampleDashboard('d1'));
    store.upsertDashboard('usr-a', sampleDashboard('d2'));
    store.upsertDashboard('usr-a', sampleDashboard('d3'));

    expect(store.deleteDashboard('usr-a', 'd1')).toBe(true);
    expect(store.deleteDashboard('usr-a', 'd1')).toBe(false);
    expect(store.deleteDashboardsMany('usr-a', ['d2', 'd3'])).toBe(2);
    expect(store.listDashboards('usr-a')).toHaveLength(0);
    store.close();
  });

  it('replaceDashboards يستبدل كل محتوى المستخدم (استعادة لقطة)', () => {
    const store = makeStore();
    store.upsertDashboard('usr-a', sampleDashboard('old-1'));
    store.upsertDashboard('usr-a', sampleDashboard('old-2'));

    const result = store.replaceDashboards('usr-a', [sampleDashboard('new-1'), sampleDashboard('new-2')]);
    expect(result.saved).toBe(2);
    const rows = store.listDashboards('usr-a');
    expect(rows.map(r => r.id).sort()).toEqual(['new-1', 'new-2']);

    // لا يمس لوحات مستخدم آخر
    store.upsertDashboard('usr-b', sampleDashboard('b-1'));
    store.replaceDashboards('usr-a', []);
    expect(store.listDashboards('usr-a')).toHaveLength(0);
    expect(store.listDashboards('usr-b')).toHaveLength(1);
    store.close();
  });

  it('استبدال اللوحات يتجاهل العناصر غير الصالحة ويحفظ الصالحة', () => {
    const store = makeStore();
    const result = store.replaceDashboards('usr-a', [sampleDashboard('ok-1'), null, { foo: 'bar' } as any]);
    expect(result.saved).toBe(1);
    expect(store.listDashboards('usr-a').map(r => r.id)).toEqual(['ok-1']);
    store.close();
  });
});

describe('userStateStore — workspace state', () => {
  it('يحفظ ويجلب كل نوع حالة لكل مستخدم بعزل كامل', () => {
    const store = makeStore();
    expect(store.setState('usr-a', 'reports', [{ id: 'rep-1' }]).ok).toBe(true);
    expect(store.setState('usr-a', 'data_stories', [{ id: 'story-1' }]).ok).toBe(true);
    expect(store.setState('usr-b', 'reports', [{ id: 'rep-other' }]).ok).toBe(true);

    expect(store.getState('usr-a', 'reports')).toEqual([{ id: 'rep-1' }]);
    expect(store.getState('usr-b', 'reports')).toEqual([{ id: 'rep-other' }]);
    expect(store.getState('usr-a', 'data_stories')).toEqual([{ id: 'story-1' }]);
    expect(store.getState('usr-a', 'scheduled_refreshes')).toBeNull();
    store.close();
  });

  it('upsert للحالة: آخر كتابة هي المحفوظة', () => {
    const store = makeStore();
    store.setState('usr-a', 'workflows', [{ id: 'wf-1' }]);
    store.setState('usr-a', 'workflows', [{ id: 'wf-1' }, { id: 'wf-2' }]);
    expect(store.getState('usr-a', 'workflows')).toHaveLength(2);
    store.close();
  });

  it('يرفض أنواع حالة غير مدعومة', () => {
    const store = makeStore();
    expect(store.setState('usr-a', 'hack' as any, { x: 1 }).ok).toBe(false);
    expect(store.getState('usr-a', 'hack' as any)).toBeNull();
    store.close();
  });

  it('يرفض حالة تتجاوز حد الحجم', () => {
    const store = makeStore();
    const huge = { items: Array.from({ length: 100000 }, (_, i) => `item-${i}-${'x'.repeat(100)}`) };
    const result = store.setState('usr-a', 'reports', huge);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('حد التخزين');
    expect(store.getState('usr-a', 'reports')).toBeNull();
    store.close();
  });

  it('يقبل null كقيمة صالحة (مسح الحالة)', () => {
    const store = makeStore();
    store.setState('usr-a', 'reports', [{ id: 'rep-1' }]);
    expect(store.setState('usr-a', 'reports', null).ok).toBe(true);
    expect(store.getState('usr-a', 'reports')).toBeNull();
    store.close();
  });
});

describe('userStateStore — stats & limits', () => {
  it('الإحصاءات تجمع عبر الجدولين والمستخدمين', () => {
    const store = makeStore();
    store.upsertDashboard('usr-a', sampleDashboard('d1'));
    store.upsertDashboard('usr-b', sampleDashboard('d2'));
    store.setState('usr-a', 'reports', [{ id: 1 }]);
    const s = store.stats();
    expect(s.users).toBe(2);
    expect(s.dashboards).toBe(2);
    expect(s.stateBlobs).toBe(1);
    expect(s.totalBytes).toBeGreaterThan(0);
    store.close();
  });

  it('getWorkspaceStateLimitBytes يرجع 5MB افتراضياً ويحترم متغير البيئة', () => {
    const prev = process.env.WORKSPACE_STATE_LIMIT_MB;
    try {
      delete process.env.WORKSPACE_STATE_LIMIT_MB;
      expect(getWorkspaceStateLimitBytes()).toBe(5 * 1024 * 1024);
      process.env.WORKSPACE_STATE_LIMIT_MB = '12';
      expect(getWorkspaceStateLimitBytes()).toBe(12 * 1024 * 1024);
    } finally {
      if (prev === undefined) delete process.env.WORKSPACE_STATE_LIMIT_MB;
      else process.env.WORKSPACE_STATE_LIMIT_MB = prev;
    }
  });
});
