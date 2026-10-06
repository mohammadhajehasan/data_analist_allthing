/**
 * Server-side per-user workspace state — SQLite storage for dashboards and
 * user-scoped app state (reports, data stories, scheduled refreshes, workflows).
 *
 * الهدف: خصوصية كاملة لكل مستخدم — كل ما يبنيه المستخدم محفوظ على الخادم تحت
 * معرّف حسابه فقط، ولا يظهر لأي مستخدم آخر مهما كان المتصفح مشتركاً.
 * (كانت لوحات التحكم تُخزّن في localStorage المشترك على نفس المتصفح — ثغرة
 * خصوصية: حساب جديد على نفس الجهاز كان يرى لوحات الحساب القديم.)
 *
 * البنية:
 * - جدول dashboards: صف JSON واحد لكل لوحة (نفس نمط جدول datasets في datasetsStore).
 * - جدول workspace_state: blob JSON واحد لكل مستخدم لكل نوع حالة
 *   (reports / data_stories / scheduled_refreshes / workflows) — كمياتها صغيرة
 *   والوصول يتم دفعة واحدة عند الدخول.
 *
 * الواجهة تبقى تعمل من الذاكرة للأداء؛ الخادم مجرد مخزن استمرارية مملوك للمستخدم.
 */
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DASHBOARDS_TABLE_LIMIT = 300; // حد أقصى لعدد اللوحات لكل مستخدم — حماية من الامتلاء

export type WorkspaceStateKind = 'reports' | 'data_stories' | 'scheduled_refreshes' | 'workflows';

const STATE_KINDS: WorkspaceStateKind[] = ['reports', 'data_stories', 'scheduled_refreshes', 'workflows'];

export function getWorkspaceStateLimitBytes(): number {
  const mb = parseInt(process.env.WORKSPACE_STATE_LIMIT_MB || '', 10);
  return (Number.isFinite(mb) && mb > 0 ? mb : 5) * 1024 * 1024;
}

export interface UserStateStore {
  listDashboards(userId: string): any[];
  upsertDashboard(userId: string, dashboard: any): { ok: boolean; error?: string };
  deleteDashboard(userId: string, dashboardId: string): boolean;
  deleteDashboardsMany(userId: string, ids: string[]): number;
  replaceDashboards(userId: string, dashboards: any[]): { saved: number; errors: string[] };
  getDashboard(userId: string, dashboardId: string): any | null;
  dashboardsCount(userId: string): number;
  getState(userId: string, kind: WorkspaceStateKind): any | null;
  setState(userId: string, kind: WorkspaceStateKind, value: any): { ok: boolean; error?: string };
  stats(): { users: number; dashboards: number; stateBlobs: number; totalBytes: number };
  close(): void;
}

export function createUserStateStore(dbPath: string): UserStateStore {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS dashboards (
      id          TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      name        TEXT NOT NULL,
      widget_count INTEGER NOT NULL DEFAULT 0,
      size_bytes  INTEGER NOT NULL DEFAULT 0,
      updated_at  TEXT NOT NULL,
      payload     TEXT NOT NULL,
      PRIMARY KEY (user_id, id)
    );
    CREATE TABLE IF NOT EXISTS workspace_state (
      user_id     TEXT NOT NULL,
      kind        TEXT NOT NULL CHECK (kind IN ('reports','data_stories','scheduled_refreshes','workflows')),
      size_bytes  INTEGER NOT NULL DEFAULT 0,
      updated_at  TEXT NOT NULL,
      payload     TEXT NOT NULL,
      PRIMARY KEY (user_id, kind)
    )
  `);

  const stmtListDash = db.prepare(
    'SELECT payload FROM dashboards WHERE user_id = ? ORDER BY updated_at DESC'
  );
  const stmtGetDash = db.prepare(
    'SELECT payload FROM dashboards WHERE user_id = ? AND id = ?'
  );
  const stmtCountDash = db.prepare('SELECT COUNT(*) AS c FROM dashboards WHERE user_id = ?');
  const stmtInsertDash = db.prepare(
    `INSERT INTO dashboards (id, user_id, name, widget_count, size_bytes, updated_at, payload)
     VALUES (@id, @user_id, @name, @widget_count, @size_bytes, @updated_at, @payload)
     ON CONFLICT(user_id, id) DO UPDATE SET
       name = excluded.name,
       widget_count = excluded.widget_count,
       size_bytes = excluded.size_bytes,
       updated_at = excluded.updated_at,
       payload = excluded.payload`
  );
  const stmtDeleteDash = db.prepare('DELETE FROM dashboards WHERE user_id = ? AND id = ?');
  const stmtDeleteDashMany = db.prepare(
    'DELETE FROM dashboards WHERE user_id = ? AND id IN (SELECT value FROM json_each(?))'
  );
  const stmtGetState = db.prepare(
    'SELECT payload FROM workspace_state WHERE user_id = ? AND kind = ?'
  );
  const stmtSetState = db.prepare(
    `INSERT INTO workspace_state (user_id, kind, size_bytes, updated_at, payload)
     VALUES (@user_id, @kind, @size_bytes, @updated_at, @payload)
     ON CONFLICT(user_id, kind) DO UPDATE SET
       size_bytes = excluded.size_bytes,
       updated_at = excluded.updated_at,
       payload = excluded.payload`
  );

  return {
    listDashboards(userId: string): any[] {
      try {
        return (stmtListDash.all(userId) as Array<{ payload: string }>).map(r => {
          try { return JSON.parse(r.payload); } catch { return null; }
        }).filter(Boolean);
      } catch {
        return [];
      }
    },

    getDashboard(userId: string, dashboardId: string): any | null {
      try {
        const row = stmtGetDash.get(userId, dashboardId) as { payload: string } | undefined;
        if (!row) return null;
        return JSON.parse(row.payload);
      } catch {
        return null;
      }
    },

    dashboardsCount(userId: string): number {
      try {
        return (stmtCountDash.get(userId) as { c: number }).c;
      } catch {
        return 0;
      }
    },

    upsertDashboard(userId: string, dashboard: any): { ok: boolean; error?: string } {
      try {
        if (!dashboard || typeof dashboard !== 'object' || !dashboard.id) {
          return { ok: false, error: 'بيانات اللوحة غير صالحة' };
        }
        const count = this.dashboardsCount(userId);
        const exists = !!stmtGetDash.get(userId, dashboard.id);
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
        stmtInsertDash.run({
          id: String(dashboard.id),
          user_id: userId,
          name: String(dashboard.nameAr || dashboard.name || dashboard.titleAr || dashboard.title || dashboard.id),
          widget_count: Number(Array.isArray(dashboard.widgets) ? dashboard.widgets.length : 0),
          size_bytes: size,
          updated_at: String(dashboard.updatedAt || now),
          payload,
        });
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'فشل حفظ اللوحة' };
      }
    },

    deleteDashboard(userId: string, dashboardId: string): boolean {
      try {
        return stmtDeleteDash.run(userId, dashboardId).changes > 0;
      } catch {
        return false;
      }
    },

    deleteDashboardsMany(userId: string, ids: string[]): number {
      if (!Array.isArray(ids) || ids.length === 0) return 0;
      try {
        return stmtDeleteDashMany.run(userId, JSON.stringify(ids)).changes;
      } catch {
        return 0;
      }
    },

    replaceDashboards(userId: string, dashboards: any[]): { saved: number; errors: string[] } {
      try {
        let saved = 0;
        const tx = db.transaction((items: any[]) => {
          db.prepare('DELETE FROM dashboards WHERE user_id = ?').run(userId);
          const now = new Date().toISOString();
          for (const d of items) {
            if (!d || typeof d !== 'object' || !d.id) continue;
            const payload = JSON.stringify(d);
            stmtInsertDash.run({
              id: String(d.id),
              user_id: userId,
              name: String(d.nameAr || d.name || d.titleAr || d.title || d.id),
              widget_count: Number(Array.isArray(d.widgets) ? d.widgets.length : 0),
              size_bytes: Buffer.byteLength(payload, 'utf8'),
              updated_at: String(d.updatedAt || now),
              payload,
            });
            saved++;
          }
        });
        tx(Array.isArray(dashboards) ? dashboards : []);
        return { saved, errors: [] };
      } catch (err: any) {
        return { saved: 0, errors: [err?.message || 'فشل استبدال اللوحات'] };
      }
    },

    getState(userId: string, kind: WorkspaceStateKind): any | null {
      try {
        const row = stmtGetState.get(userId, kind) as { payload: string } | undefined;
        if (!row) return null;
        return JSON.parse(row.payload);
      } catch {
        return null;
      }
    },

    setState(userId: string, kind: WorkspaceStateKind, value: any): { ok: boolean; error?: string } {
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
        stmtSetState.run({
          user_id: userId,
          kind,
          size_bytes: size,
          updated_at: new Date().toISOString(),
          payload,
        });
        return { ok: true };
      } catch (err: any) {
        return { ok: false, error: err?.message || 'فشل حفظ الحالة' };
      }
    },

    stats(): { users: number; dashboards: number; stateBlobs: number; totalBytes: number } {
      try {
        const d = db
          .prepare('SELECT COUNT(DISTINCT user_id) AS users, COUNT(*) AS dashboards, COALESCE(SUM(size_bytes),0) AS bytes FROM dashboards')
          .get() as { users: number; dashboards: number; bytes: number };
        const s = db
          .prepare('SELECT COUNT(DISTINCT user_id) AS users, COUNT(*) AS blobs, COALESCE(SUM(size_bytes),0) AS bytes FROM workspace_state')
          .get() as { users: number; blobs: number; bytes: number };
        const unionUsers = (
          db
            .prepare("SELECT COUNT(DISTINCT user_id) AS u FROM (SELECT user_id FROM dashboards UNION SELECT user_id FROM workspace_state)")
            .get() as { u: number }
        ).u;
        return {
          users: unionUsers || Math.max(d.users, s.users),
          dashboards: d.dashboards,
          stateBlobs: s.blobs,
          totalBytes: d.bytes + s.bytes,
        };
      } catch {
        return { users: 0, dashboards: 0, stateBlobs: 0, totalBytes: 0 };
      }
    },

    close() {
      db.close();
    },
  };
}

const defaultStore = createUserStateStore(path.join(process.cwd(), 'data', 'auth.db'));

export function listUserDashboards(userId: string): any[] {
  return defaultStore.listDashboards(userId);
}
export function getUserDashboard(userId: string, id: string): any | null {
  return defaultStore.getDashboard(userId, id);
}
export function upsertUserDashboard(userId: string, dashboard: any) {
  return defaultStore.upsertDashboard(userId, dashboard);
}
export function deleteUserDashboard(userId: string, id: string): boolean {
  return defaultStore.deleteDashboard(userId, id);
}
export function deleteUserDashboards(userId: string, ids: string[]): number {
  return defaultStore.deleteDashboardsMany(userId, ids);
}
export function replaceUserDashboards(userId: string, dashboards: any[]) {
  return defaultStore.replaceDashboards(userId, dashboards);
}
export function getUserWorkspaceState(userId: string, kind: WorkspaceStateKind): any | null {
  return defaultStore.getState(userId, kind);
}
export function setUserWorkspaceState(userId: string, kind: WorkspaceStateKind, value: any) {
  return defaultStore.setState(userId, kind, value);
}
export function getUserStateStats() {
  return defaultStore.stats();
}
