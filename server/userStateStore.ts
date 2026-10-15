/**
 * Server-side per-user workspace state — Turso (libSQL) storage for dashboards
 * and user-scoped app state (reports, data stories, scheduled refreshes, workflows).
 *
 * الهدف: خصوصية كاملة لكل مستخدم — كل ما يبنيه المستخدم محفوظ على الخادم تحت
 * معرّف حسابه فقط، ولا يظهر لأي مستخدم آخر مهما كان المتصفح مشتركاً.
 * (كانت لوحات التحكم تُخزّن في localStorage المشترك على نفس المتصفح — ثغرة
 * خصوصية: حساب جديد على نفس الجهاز كان يرى لوحات الحساب القديم.)
 *
 * البنية (داخل قاعدة Turso الوحيدة):
 * - جدول dashboards: صف JSON واحد لكل لوحة.
 * - جدول workspace_state: blob JSON واحد لكل مستخدم لكل نوع حالة
 *   (reports / data_stories / scheduled_refreshes / workflows) — كمياتها صغيرة
 *   والوصول يتم دفعة واحدة عند الدخول.
 */
import type { Client, InValue } from '@libsql/client';
import { turso, rows, one, run, ensureSchema } from './turso';

const DASHBOARDS_TABLE_LIMIT = 300; // حد أقصى لعدد اللوحات لكل مستخدم — حماية من الامتلاء

export type WorkspaceStateKind = 'reports' | 'data_stories' | 'scheduled_refreshes' | 'workflows';

const STATE_KINDS: WorkspaceStateKind[] = ['reports', 'data_stories', 'scheduled_refreshes', 'workflows'];

export function getWorkspaceStateLimitBytes(): number {
  const mb = parseInt(process.env.WORKSPACE_STATE_LIMIT_MB || '', 10);
  return (Number.isFinite(mb) && mb > 0 ? mb : 5) * 1024 * 1024;
}

export interface UserStateStore {
  listDashboards(userId: string): Promise<any[]>;
  upsertDashboard(userId: string, dashboard: any): Promise<{ ok: boolean; error?: string }>;
  deleteDashboard(userId: string, dashboardId: string): Promise<boolean>;
  deleteDashboardsMany(userId: string, ids: string[]): Promise<number>;
  replaceDashboards(userId: string, dashboards: any[]): Promise<{ saved: number; errors: string[] }>;
  getDashboard(userId: string, dashboardId: string): Promise<any | null>;
  dashboardsCount(userId: string): Promise<number>;
  getState(userId: string, kind: WorkspaceStateKind): Promise<any | null>;
  setState(userId: string, kind: WorkspaceStateKind, value: any): Promise<{ ok: boolean; error?: string }>;
  stats(): Promise<{ users: number; dashboards: number; stateBlobs: number; totalBytes: number }>;
  close(): void;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS dashboards (
      id          TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      name        TEXT NOT NULL,
      widget_count INTEGER NOT NULL DEFAULT 0,
      size_bytes  INTEGER NOT NULL DEFAULT 0,
      updated_at  TEXT NOT NULL,
      payload     TEXT NOT NULL,
      PRIMARY KEY (user_id, id)
    )`,
  `CREATE TABLE IF NOT EXISTS workspace_state (
      user_id     TEXT NOT NULL,
      kind        TEXT NOT NULL CHECK (kind IN ('reports','data_stories','scheduled_refreshes','workflows')),
      size_bytes  INTEGER NOT NULL DEFAULT 0,
      updated_at  TEXT NOT NULL,
      payload     TEXT NOT NULL,
      PRIMARY KEY (user_id, kind)
    )`,
];

const UPSERT_DASH = `INSERT INTO dashboards (id, user_id, name, widget_count, size_bytes, updated_at, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, id) DO UPDATE SET
       name = excluded.name,
       widget_count = excluded.widget_count,
       size_bytes = excluded.size_bytes,
       updated_at = excluded.updated_at,
       payload = excluded.payload`;

export async function createUserStateStore(): Promise<UserStateStore> {
  await ensureSchema(turso(), SCHEMA);

  return {
    async listDashboards(userId: string): Promise<any[]> {
      try {
        return (await rows<{ payload: string }>('SELECT payload FROM dashboards WHERE user_id = ? ORDER BY updated_at DESC', [userId]))
          .map(r => {
            try {
              return JSON.parse(r.payload);
            } catch {
              return null;
            }
          })
          .filter(Boolean);
      } catch {
        return [];
      }
    },

    async getDashboard(userId: string, dashboardId: string): Promise<any | null> {
      try {
        const row = await one<{ payload: string }>('SELECT payload FROM dashboards WHERE user_id = ? AND id = ?', [userId, dashboardId]);
        if (!row) return null;
        return JSON.parse(row.payload);
      } catch {
        return null;
      }
    },

    async dashboardsCount(userId: string): Promise<number> {
      try {
        return Number(((await one<any>('SELECT COUNT(*) AS c FROM dashboards WHERE user_id = ?', [userId])) as any)?.c || 0);
      } catch {
        return 0;
      }
    },

    async upsertDashboard(userId: string, dashboard: any): Promise<{ ok: boolean; error?: string }> {
      try {
        if (!dashboard || typeof dashboard !== 'object' || !dashboard.id) {
          return { ok: false, error: 'بيانات اللوحة غير صالحة' };
        }
        const count = await this.dashboardsCount(userId);
        const exists = !!(await one('SELECT 1 FROM dashboards WHERE user_id = ? AND id = ?', [userId, dashboard.id]));
        if (!exists && count >= DASHBOARDS_TABLE_LIMIT) {
          return { ok: false, error: `وصلت الحد الأقصى لعدد اللوحات المخزنة (${DASHBOARDS_TABLE_LIMIT})` };
        }
        const payload = JSON.stringify(dashboard);
        const size = Buffer.byteLength(payload, 'utf8');
        if (size > getWorkspaceStateLimitBytes()) {
          return {
            ok: false,
            error: `حجم اللوحة (${(size / 1024).toFixed(0)}KB) يتجاوز حد التخزين الخادمي — استخدم WORKSPACE_STATE_LIMIT_MB`,
          };
        }
        const now = new Date().toISOString();
        await run(UPSERT_DASH, [
          String(dashboard.id),
          userId,
          String(dashboard.nameAr || dashboard.name || dashboard.titleAr || dashboard.title || dashboard.id),
          Number(Array.isArray(dashboard.widgets) ? dashboard.widgets.length : 0),
          size,
          String(dashboard.updatedAt || now),
          payload,
        ]);
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'فشل حفظ اللوحة' };
      }
    },

    async deleteDashboard(userId: string, dashboardId: string): Promise<boolean> {
      try {
        return (await run('DELETE FROM dashboards WHERE user_id = ? AND id = ?', [userId, dashboardId])) > 0;
      } catch {
        return false;
      }
    },

    async deleteDashboardsMany(userId: string, ids: string[]): Promise<number> {
      if (!Array.isArray(ids) || ids.length === 0) return 0;
      try {
        return await run('DELETE FROM dashboards WHERE user_id = ? AND id IN (SELECT value FROM json_each(?))', [
          userId,
          JSON.stringify(ids) as InValue,
        ]);
      } catch {
        return 0;
      }
    },

    async replaceDashboards(userId: string, dashboards: any[]): Promise<{ saved: number; errors: string[] }> {
      try {
        const items = Array.isArray(dashboards) ? dashboards : [];
        // معاملة واحدة: حذف ثم إعادة إدخال — إما كله أو لا شيء (batch write)
        const statements: { sql: string; args: InValue[] }[] = [
          { sql: 'DELETE FROM dashboards WHERE user_id = ?', args: [userId] },
        ];
        const now = new Date().toISOString();
        for (const d of items) {
          if (!d || typeof d !== 'object' || !d.id) continue;
          const payload = JSON.stringify(d);
          statements.push({
            sql: UPSERT_DASH,
            args: [
              String(d.id),
              userId,
              String(d.nameAr || d.name || d.titleAr || d.title || d.id),
              Number(Array.isArray(d.widgets) ? d.widgets.length : 0),
              Buffer.byteLength(payload, 'utf8'),
              String(d.updatedAt || now),
              payload,
            ],
          });
        }
        await turso().batch(statements, 'write');
        return { saved: statements.length - 1, errors: [] };
      } catch (err: any) {
        return { saved: 0, errors: [err?.message || 'فشل استبدال اللوحات'] };
      }
    },

    async getState(userId: string, kind: WorkspaceStateKind): Promise<any | null> {
      try {
        const row = await one<{ payload: string }>('SELECT payload FROM workspace_state WHERE user_id = ? AND kind = ?', [userId, kind]);
        if (!row) return null;
        return JSON.parse(row.payload);
      } catch {
        return null;
      }
    },

    async setState(userId: string, kind: WorkspaceStateKind, value: any): Promise<{ ok: boolean; error?: string }> {
      try {
        if (!STATE_KINDS.includes(kind)) {
          return { ok: false, error: 'نوع الحالة غير مدعوم' };
        }
        const payload = JSON.stringify(value ?? null);
        const size = Buffer.byteLength(payload, 'utf8');
        if (size > getWorkspaceStateLimitBytes()) {
          return {
            ok: false,
            error: `حجم الحالة (${(size / 1024 / 1024).toFixed(1)}MB) يتجاوز حد التخزين الخادمي — استخدم WORKSPACE_STATE_LIMIT_MB`,
          };
        }
        await run(
          `INSERT INTO workspace_state (user_id, kind, size_bytes, updated_at, payload)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(user_id, kind) DO UPDATE SET
             size_bytes = excluded.size_bytes,
             updated_at = excluded.updated_at,
             payload = excluded.payload`,
          [userId, kind, size, new Date().toISOString(), payload]
        );
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'فشل حفظ الحالة' };
      }
    },

    async stats(): Promise<{ users: number; dashboards: number; stateBlobs: number; totalBytes: number }> {
      try {
        const d = (await one<any>(
          'SELECT COUNT(DISTINCT user_id) AS users, COUNT(*) AS dashboards, COALESCE(SUM(size_bytes),0) AS bytes FROM dashboards'
        )) as any;
        const s = (await one<any>(
          'SELECT COUNT(DISTINCT user_id) AS users, COUNT(*) AS blobs, COALESCE(SUM(size_bytes),0) AS bytes FROM workspace_state'
        )) as any;
        const unionUsers = Number((((await one<any>(
          "SELECT COUNT(DISTINCT user_id) AS u FROM (SELECT user_id FROM dashboards UNION SELECT user_id FROM workspace_state)"
        )) as any)?.u) || 0);
        return {
          users: Number(unionUsers || Math.max(d?.users || 0, s?.users || 0)),
          dashboards: Number(d?.dashboards || 0),
          stateBlobs: Number(s?.blobs || 0),
          totalBytes: Number(d?.bytes || 0) + Number(s?.bytes || 0),
        };
      } catch {
        return { users: 0, dashboards: 0, stateBlobs: 0, totalBytes: 0 };
      }
    },

    close() {
      /* العميل المشترك يُغلق مع العملية */
    },
  };
}

let defaultStore: UserStateStore | null = null;
async function getDefault(): Promise<UserStateStore> {
  defaultStore ??= await createUserStateStore();
  return defaultStore;
}

export async function listUserDashboards(userId: string): Promise<any[]> {
  return (await getDefault()).listDashboards(userId);
}
export async function getUserDashboard(userId: string, id: string): Promise<any | null> {
  return (await getDefault()).getDashboard(userId, id);
}
export async function upsertUserDashboard(userId: string, dashboard: any) {
  return (await getDefault()).upsertDashboard(userId, dashboard);
}
export async function deleteUserDashboard(userId: string, id: string): Promise<boolean> {
  return (await getDefault()).deleteDashboard(userId, id);
}
export async function deleteUserDashboards(userId: string, ids: string[]): Promise<number> {
  return (await getDefault()).deleteDashboardsMany(userId, ids);
}
export async function replaceUserDashboards(userId: string, dashboards: any[]) {
  return (await getDefault()).replaceDashboards(userId, dashboards);
}
export async function getUserWorkspaceState(userId: string, kind: WorkspaceStateKind): Promise<any | null> {
  return (await getDefault()).getState(userId, kind);
}
export async function setUserWorkspaceState(userId: string, kind: WorkspaceStateKind, value: any) {
  return (await getDefault()).setState(userId, kind, value);
}
export async function getUserStateStats() {
  return (await getDefault()).stats();
}
