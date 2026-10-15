/**
 * اختبارات مخزن مجموعات البيانات الخادمي (server/datasetsStore.ts)
 */
import { describe, it, expect } from 'vitest';
import { createDatasetsStore, getDatasetSizeLimitBytes } from '../../server/datasetsStore';
import { createTestClient, useTursoClient } from '../../server/turso';

async function makeStore() {
  useTursoClient(createTestClient());
  return createDatasetsStore();
}

function sampleDataset(id: string, name = 'مجموعة اختبار') {
  return {
    id,
    workspaceId: 'ws-main',
    name,
    description: '',
    format: 'csv',
    rowCount: 3,
    columnCount: 2,
    sizeBytes: 120,
    columns: [
      { name: 'city', type: 'string', nullable: false, sampleValues: ['الرياض'] },
      { name: 'sales', type: 'integer', nullable: false, sampleValues: [100] },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
    status: 'ready',
    tags: [],
    data: [
      { city: 'الرياض', sales: 100 },
      { city: 'جدة', sales: 200 },
      { city: 'الدمام', sales: 150 },
    ],
  };
}

describe('datasetsStore', () => {
  it('يحفظ مجموعة ويجلبها سليمة (round-trip)', async () => {
    const store = await makeStore();
    const ds = sampleDataset('ds-1', 'المبيعات');
    expect((await store.upsert('usr-a', ds)).ok).toBe(true);

    const rows = await store.listByUser('usr-a');
    expect(rows).toHaveLength(1);
    const parsed = JSON.parse(rows[0].payload);
    expect(parsed.id).toBe('ds-1');
    expect(parsed.name).toBe('المبيعات');
    expect(parsed.data).toHaveLength(3);
    expect(parsed.data[1].city).toBe('جدة');
    store.close();
  });

  it('يعزل بيانات كل مستخدم عن الآخرين', async () => {
    const store = await makeStore();
    await store.upsert('usr-a', sampleDataset('ds-shared'));
    await store.upsert('usr-b', sampleDataset('ds-shared', 'لوحة ب'));

    const a = JSON.parse((await store.get('usr-a', 'ds-shared'))!.payload);
    const b = JSON.parse((await store.get('usr-b', 'ds-shared'))!.payload);
    expect(a.name).toBe('مجموعة اختبار');
    expect(b.name).toBe('لوحة ب');
    expect(await store.listByUser('usr-a')).toHaveLength(1);
    store.close();
  });

  it('upsert يحدّث المجموعة الموجودة بدل تكرارها', async () => {
    const store = await makeStore();
    await store.upsert('usr-a', sampleDataset('ds-1', 'v1'));
    await store.upsert('usr-a', sampleDataset('ds-1', 'v2'));

    const rows = await store.listByUser('usr-a');
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].payload).name).toBe('v2');
    store.close();
  });

  it('يرفض مجموعة تتجاوز حد الحجم الخادمي', async () => {
    const store = await makeStore();
    const big = sampleDataset('ds-big');
    const result = await store.upsert('usr-a', big, 50 * 1024 * 1024); // 50MB وهمياً
    expect(result.ok).toBe(false);
    expect(result.error).toContain('حد التخزين');
    expect(await store.listByUser('usr-a')).toHaveLength(0);
    store.close();
  });

  it('يرفض تجاوز الحد الأقصى لعدد المجموعات', async () => {
    const store = await makeStore();
    for (let i = 0; i < 200; i++) {
      expect((await store.upsert('usr-a', sampleDataset(`ds-${i}`))).ok).toBe(true);
    }
    const overflow = await store.upsert('usr-a', sampleDataset('ds-overflow'));
    expect(overflow.ok).toBe(false);
    // التحديث على مجموعة موجودة لا يزال مسموحاً حتى عند بلوغ الحد
    expect((await store.upsert('usr-a', sampleDataset('ds-0', 'محدثة'))).ok).toBe(true);
    store.close();
  });

  it('يحذف مجموعة واحدة ودفعات بنجاح', async () => {
    const store = await makeStore();
    await store.upsert('usr-a', sampleDataset('ds-1'));
    await store.upsert('usr-a', sampleDataset('ds-2'));
    await store.upsert('usr-a', sampleDataset('ds-3'));

    expect(await store.remove('usr-a', 'ds-1')).toBe(true);
    expect(await store.remove('usr-a', 'ds-1')).toBe(false); // محذوفة بالفعل
    expect(await store.removeMany('usr-a', ['ds-2', 'ds-3'])).toBe(2);
    expect(await store.listByUser('usr-a')).toHaveLength(0);
    store.close();
  });

  it('keepOnlyUserDatasets يستبدل كل المحتوى عند الاستعادة', async () => {
    const store = await makeStore();
    await store.upsert('usr-a', sampleDataset('old-1'));
    await store.upsert('usr-a', sampleDataset('old-2'));

    // استعادة لقطة تحتوي مجموعة جديدة واحدة
    const replaced = await store.removeManyForUser('usr-a', ['new-1']);
    expect(replaced).toBe(2);
    await store.upsert('usr-a', sampleDataset('new-1'));
    expect(await store.listByUser('usr-a')).toHaveLength(1);

    // استعادة فارغة تمسح كل شيء
    expect(await store.removeManyForUser('usr-a', [])).toBe(1);
    expect(await store.listByUser('usr-a')).toHaveLength(0);
    store.close();
  });

  it('الإحصاءات تُجمّع عبر المستخدمين', async () => {
    const store = await makeStore();
    await store.upsert('usr-a', sampleDataset('ds-1'));
    await store.upsert('usr-b', sampleDataset('ds-2'));
    const s = await store.stats();
    expect(s.users).toBe(2);
    expect(s.datasets).toBe(2);
    expect(s.totalBytes).toBeGreaterThan(0);
    store.close();
  });

  it('يرفض payload غير صالح بسلامة', async () => {
    const store = await makeStore();
    expect((await store.upsert('usr-a', null as any)).ok).toBe(false);
    expect((await store.upsert('usr-a', {} as any)).ok).toBe(false);
    expect(await store.listByUser('usr-a')).toHaveLength(0);
    store.close();
  });
});

describe('getDatasetSizeLimitBytes', () => {
  it('يرجع 10MB افتراضياً ويحترم متغير البيئة', async () => {
    const prev = process.env.DATASET_SERVER_LIMIT_MB;
    try {
      delete process.env.DATASET_SERVER_LIMIT_MB;
      expect(getDatasetSizeLimitBytes()).toBe(10 * 1024 * 1024);
      process.env.DATASET_SERVER_LIMIT_MB = '25';
      expect(getDatasetSizeLimitBytes()).toBe(25 * 1024 * 1024);
    } finally {
      if (prev === undefined) delete process.env.DATASET_SERVER_LIMIT_MB;
      else process.env.DATASET_SERVER_LIMIT_MB = prev;
    }
  });
});
