/**
 * Server-side dataset persistence — Turso (libSQL) storage for imported datasets.
 *
 * الهدف: حفظ مجموعات البيانات التي يستوردها المستخدم في قاعدة Turso السحابية
 * حتى لا تضيع عند تحديث الصفحة (F5) أو إغلاق المتصفح أو إعادة نشر الخادم:
 * - الواجهة تعمل من الذاكرة (in-memory) كما هي — لا تغيير في سرعة التفاعل.
 * - الحفظ للخادم "أحادي الاتجاه" (write-through) غير منتظر: عمليات الاستيراد
 *   لا تتباطأ — المزامنة تجري في الخلفية عبر fire-and-forget fetch.
 * - القائمة تُحمَّل مرة واحدة عند دخول المستخدم (bootstrap) بدل localStorage.
 *
 * التخزين: جدول datasets داخل قاعدة Turso الوحيدة — عمود JSON واحد لكل مجموعة
 * (صف واحد = مجموعة كاملة). الحد الأقصى لكل مجموعة يُضبط عبر
 * DATASET_SERVER_LIMIT_MB (افتراضي 10MB لكل مجموعة).
 */
import type { Client, InValue } from '@libsql/client';
import { turso, rows, one, run, ensureSchema } from './turso';

const DATASETS_TABLE_LIMIT = 200; // حد أقصى لعدد المجموعات لكل مستخدم — حماية من الامتلاء

export interface StoredDatasetRow {
  id: string;
  user_id: string;
  name: string;
  row_count: number;
  size_bytes: number;
  updated_at: string;
  payload: string; // JSON كامل لمجموعة البيانات (Dashboard-shape: src/types Dataset)
}

export interface DatasetsStore {
  listByUser(userId: string): Promise<StoredDatasetRow[]>;
  get(userId: string, datasetId: string): Promise<StoredDatasetRow | null>;
  upsert(userId: string, dataset: any, sizeBytes?: number): Promise<{ ok: boolean; error?: string }>;
  remove(userId: string, datasetId: string): Promise<boolean>;
  removeMany(userId: string, ids: string[]): Promise<number>;
  removeManyForUser(userId: string, keepIds?: string[]): Promise<number>;
  stats(): Promise<{ users: number; datasets: number; totalBytes: number }>;
  close(): void;
}

export function getDatasetSizeLimitBytes(): number {
  const mb = parseInt(process.env.DATASET_SERVER_LIMIT_MB || '', 10);
  return (Number.isFinite(mb) && mb > 0 ? mb : 10) * 1024 * 1024;
}

const UPSERT_DATASET = `INSERT INTO datasets (id, user_id, name, row_count, size_bytes, updated_at, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, id) DO UPDATE SET
       name = excluded.name,
       row_count = excluded.row_count,
       size_bytes = excluded.size_bytes,
       updated_at = excluded.updated_at,
       payload = excluded.payload`;

export async function createDatasetsStore(): Promise<DatasetsStore> {
  await ensureSchema(turso(), [
    `CREATE TABLE IF NOT EXISTS datasets (
      id          TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      name        TEXT NOT NULL,
      row_count   INTEGER NOT NULL DEFAULT 0,
      size_bytes  INTEGER NOT NULL DEFAULT 0,
      updated_at  TEXT NOT NULL,
      payload     TEXT NOT NULL,
      PRIMARY KEY (user_id, id)
    )`,
  ]);

  return {
    async listByUser(userId: string): Promise<StoredDatasetRow[]> {
      try {
        return (await rows<StoredDatasetRow>(
          'SELECT id, user_id, name, row_count, size_bytes, updated_at, payload FROM datasets WHERE user_id = ? ORDER BY updated_at DESC',
          [userId]
        )) as StoredDatasetRow[];
      } catch {
        return [];
      }
    },

    async get(userId: string, datasetId: string): Promise<StoredDatasetRow | null> {
      try {
        return (
          (await one<StoredDatasetRow>(
            'SELECT id, user_id, name, row_count, size_bytes, updated_at, payload FROM datasets WHERE user_id = ? AND id = ?',
            [userId, datasetId]
          )) || null
        );
      } catch {
        return null;
      }
    },

    async upsert(userId: string, dataset: any, sizeBytes?: number): Promise<{ ok: boolean; error?: string }> {
      try {
        if (!dataset || typeof dataset !== 'object' || !dataset.id) {
          return { ok: false, error: 'بيانات المجموعة غير صالحة' };
        }
        const count = Number(((await one<any>('SELECT COUNT(*) AS c FROM datasets WHERE user_id = ?', [userId])) as any)?.c || 0);
        const exists = !!(await one('SELECT 1 FROM datasets WHERE user_id = ? AND id = ?', [userId, dataset.id]));
        if (!exists && count >= DATASETS_TABLE_LIMIT) {
          return { ok: false, error: `وصلت الحد الأقصى لعدد المجموعات المخزنة (${DATASETS_TABLE_LIMIT})` };
        }
        const payload = JSON.stringify(dataset);
        const size = sizeBytes ?? Buffer.byteLength(payload, 'utf8');
        if (size > getDatasetSizeLimitBytes()) {
          return {
            ok: false,
            error: `حجم المجموعة (${(size / 1024 / 1024).toFixed(1)}MB) يتجاوز حد التخزين الخادمي (${(getDatasetSizeLimitBytes() / 1024 / 1024).toFixed(0)}MB) — استخدم DATASET_SERVER_LIMIT_MB`,
          };
        }
        await run(UPSERT_DATASET, [
          String(dataset.id),
          userId,
          String(dataset.name || dataset.title || dataset.id),
          Number(dataset.rowCount || dataset?.data?.length || 0),
          size,
          new Date().toISOString(),
          payload,
        ]);
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'فشل حفظ المجموعة' };
      }
    },

    async remove(userId: string, datasetId: string): Promise<boolean> {
      try {
        return (await run('DELETE FROM datasets WHERE user_id = ? AND id = ?', [userId, datasetId])) > 0;
      } catch {
        return false;
      }
    },

    async removeMany(userId: string, ids: string[]): Promise<number> {
      if (!Array.isArray(ids) || ids.length === 0) return 0;
      try {
        return await run('DELETE FROM datasets WHERE user_id = ? AND id IN (SELECT value FROM json_each(?))', [
          userId,
          JSON.stringify(ids) as InValue,
        ]);
      } catch {
        return 0;
      }
    },

    // إزالة كل مجموعات المستخدم ما عدا قائمة IDs (تُستخدم عند استعادة لقطة مشروع)
    async removeManyForUser(userId: string, keepIds?: string[]): Promise<number> {
      try {
        if (keepIds && Array.isArray(keepIds) && keepIds.length > 0) {
          return await run('DELETE FROM datasets WHERE user_id = ? AND id NOT IN (SELECT value FROM json_each(?))', [
            userId,
            JSON.stringify(keepIds) as InValue,
          ]);
        }
        return await run('DELETE FROM datasets WHERE user_id = ?', [userId]);
      } catch {
        return 0;
      }
    },

    async stats(): Promise<{ users: number; datasets: number; totalBytes: number }> {
      try {
        const row = (await one<any>(
          'SELECT COUNT(DISTINCT user_id) AS users, COUNT(*) AS datasets, COALESCE(SUM(size_bytes), 0) AS bytes FROM datasets'
        )) as any;
        return { users: Number(row?.users || 0), datasets: Number(row?.datasets || 0), totalBytes: Number(row?.bytes || 0) };
      } catch {
        return { users: 0, datasets: 0, totalBytes: 0 };
      }
    },

    close() {
      /* العميل المشترك يُغلق مع العملية */
    },
  };
}

let defaultStore: DatasetsStore | null = null;
async function getDefault(): Promise<DatasetsStore> {
  defaultStore ??= await createDatasetsStore();
  return defaultStore;
}

export async function listUserDatasets(userId: string): Promise<StoredDatasetRow[]> {
  return (await getDefault()).listByUser(userId);
}

export async function getUserDataset(userId: string, id: string): Promise<StoredDatasetRow | null> {
  return (await getDefault()).get(userId, id);
}

export async function upsertUserDataset(userId: string, dataset: any, sizeBytes?: number): Promise<{ ok: boolean; error?: string }> {
  return (await getDefault()).upsert(userId, dataset, sizeBytes);
}

export async function deleteUserDataset(userId: string, id: string): Promise<boolean> {
  return (await getDefault()).remove(userId, id);
}

export async function deleteUserDatasets(userId: string, ids: string[]): Promise<number> {
  return (await getDefault()).removeMany(userId, ids);
}

export async function keepOnlyUserDatasets(userId: string, keepIds?: string[]): Promise<number> {
  return (await getDefault()).removeManyForUser(userId, keepIds);
}

export async function getDatasetsStats() {
  return (await getDefault()).stats();
}
