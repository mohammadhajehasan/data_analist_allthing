/**
 * Server-side dataset persistence — SQLite storage for imported datasets.
 *
 * الهدف: حفظ مجموعات البيانات التي يستوردها المستخدم في data/auth.db على الخادم
 * حتى لا تضيع عند تحديث الصفحة (F5) أو إغلاق المتصفح، مع بقاء الأداء الحالي:
 * - الواجهة تعمل من الذاكرة (in-memory) كما هي — لا تغيير في سرعة التفاعل.
 * - الحفظ للخادم "أحادي الاتجاه" (write-through) غير منتظر: عمليات الاستيراد
 *   لا تتباطأ — المزامنة تجري في الخلفية عبر fire-and-forget fetch.
 * - القائمة تُحمَّل مرة واحدة عند دخول المستخدم (bootstrap) بدل localStorage.
 *
 * التخزين: جدول datasets في data/auth.db — نفس قاعدة جلسات الدخول، عمود واحد
 * JSON لكل مجموعة (صف واحد = مجموعة كاملة). الحد الأقصى لكل مجموعة يُضبط عبر
 * DATASET_SERVER_LIMIT_MB (افتراضي 10MB لكل مجموعة، ومناسب لخطة Render المجانية).
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

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
  listByUser(userId: string): StoredDatasetRow[];
  get(userId: string, datasetId: string): StoredDatasetRow | null;
  upsert(userId: string, dataset: any, sizeBytes?: number): { ok: boolean; error?: string };
  remove(userId: string, datasetId: string): boolean;
  removeMany(userId: string, ids: string[]): number;
  removeManyForUser(userId: string, keepIds?: string[]): number;
  stats(): { users: number; datasets: number; totalBytes: number };
  close(): void;
}

export function getDatasetSizeLimitBytes(): number {
  const mb = parseInt(process.env.DATASET_SERVER_LIMIT_MB || '', 10);
  return (Number.isFinite(mb) && mb > 0 ? mb : 10) * 1024 * 1024;
}

export function createDatasetsStore(dbPath: string): DatasetsStore {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS datasets (
      id          TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      name        TEXT NOT NULL,
      row_count   INTEGER NOT NULL DEFAULT 0,
      size_bytes  INTEGER NOT NULL DEFAULT 0,
      updated_at  TEXT NOT NULL,
      payload     TEXT NOT NULL,
      PRIMARY KEY (user_id, id)
    )
  `);

  const stmtList = db.prepare(
    'SELECT id, user_id, name, row_count, size_bytes, updated_at, payload FROM datasets WHERE user_id = ? ORDER BY updated_at DESC'
  );
  const stmtGet = db.prepare(
    'SELECT id, user_id, name, row_count, size_bytes, updated_at, payload FROM datasets WHERE user_id = ? AND id = ?'
  );
  const stmtCount = db.prepare('SELECT COUNT(*) AS c FROM datasets WHERE user_id = ?');
  const stmtInsert = db.prepare(
    `INSERT INTO datasets (id, user_id, name, row_count, size_bytes, updated_at, payload)
     VALUES (@id, @user_id, @name, @row_count, @size_bytes, @updated_at, @payload)
     ON CONFLICT(user_id, id) DO UPDATE SET
       name = excluded.name,
       row_count = excluded.row_count,
       size_bytes = excluded.size_bytes,
       updated_at = excluded.updated_at,
       payload = excluded.payload`
  );
  const stmtDelete = db.prepare('DELETE FROM datasets WHERE user_id = ? AND id = ?');
  const stmtDeleteMany = db.prepare('DELETE FROM datasets WHERE user_id = ? AND id IN (SELECT value FROM json_each(?))');

  return {
    listByUser(userId: string): StoredDatasetRow[] {
      try {
        return stmtList.all(userId) as StoredDatasetRow[];
      } catch {
        return [];
      }
    },

    get(userId: string, datasetId: string): StoredDatasetRow | null {
      try {
        return (stmtGet.get(userId, datasetId) as StoredDatasetRow) || null;
      } catch {
        return null;
    }
    },

    upsert(userId: string, dataset: any, sizeBytes?: number): { ok: boolean; error?: string } {
      try {
        if (!dataset || typeof dataset !== 'object' || !dataset.id) {
          return { ok: false, error: 'بيانات المجموعة غير صالحة' };
        }
        // الحد الأقصى لعدد المجموعات لكل مستخدم
        const count = (stmtCount.get(userId) as { c: number }).c;
        const exists = !!stmtGet.get(userId, dataset.id);
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
        const now = new Date().toISOString();
        stmtInsert.run({
          id: String(dataset.id),
          user_id: userId,
          name: String(dataset.name || dataset.title || dataset.id),
          row_count: Number(dataset.rowCount || dataset?.data?.length || 0),
          size_bytes: size,
          updated_at: now,
          payload,
        });
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'فشل حفظ المجموعة' };
      }
    },

    remove(userId: string, datasetId: string): boolean {
      try {
        const r = stmtDelete.run(userId, datasetId);
        return r.changes > 0;
      } catch {
        return false;
      }
    },

    removeMany(userId: string, ids: string[]): number {
      if (!Array.isArray(ids) || ids.length === 0) return 0;
      try {
        return stmtDeleteMany.run(userId, JSON.stringify(ids)).changes;
      } catch {
        return 0;
      }
    },

    // إزالة كل مجموعات المستخدم ما عدا قائمة IDs (تُستخدم عند استعادة لقطة مشروع)
    removeManyForUser(userId: string, keepIds?: string[]): number {
      try {
        if (keepIds && Array.isArray(keepIds) && keepIds.length > 0) {
          return db
            .prepare('DELETE FROM datasets WHERE user_id = ? AND id NOT IN (SELECT value FROM json_each(?))')
            .run(userId, JSON.stringify(keepIds)).changes;
        }
        return db.prepare('DELETE FROM datasets WHERE user_id = ?').run(userId).changes;
      } catch {
        return 0;
    }
    },

    stats(): { users: number; datasets: number; totalBytes: number } {
      try {
        const row = db
          .prepare('SELECT COUNT(DISTINCT user_id) AS users, COUNT(*) AS datasets, COALESCE(SUM(size_bytes), 0) AS bytes FROM datasets')
          .get() as { users: number; datasets: number; bytes: number };
        return { users: row.users, datasets: row.datasets, totalBytes: row.bytes };
      } catch {
        return { users: 0, datasets: 0, totalBytes: 0 };
      }
    },

    close() {
      db.close();
    },
  };
}

const defaultStore = createDatasetsStore(path.join(process.cwd(), 'data', 'auth.db'));

export function listUserDatasets(userId: string): StoredDatasetRow[] {
  return defaultStore.listByUser(userId);
}

export function getUserDataset(userId: string, id: string): StoredDatasetRow | null {
  return defaultStore.get(userId, id);
}

export function upsertUserDataset(userId: string, dataset: any, sizeBytes?: number): { ok: boolean; error?: string } {
  return defaultStore.upsert(userId, dataset, sizeBytes);
}

export function deleteUserDataset(userId: string, id: string): boolean {
  return defaultStore.remove(userId, id);
}

export function deleteUserDatasets(userId: string, ids: string[]): number {
  return defaultStore.removeMany(userId, ids);
}

export function keepOnlyUserDatasets(userId: string, keepIds?: string[]): number {
  return defaultStore.removeManyForUser(userId, keepIds);
}

export function getDatasetsStats() {
  return defaultStore.stats();
}
