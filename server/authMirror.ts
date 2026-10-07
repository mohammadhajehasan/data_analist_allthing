/**
 * مرآة حسابات المصادقة إلى قاعدة libSQL سحابية (Turso).
 *
 * لماذا؟ قرص Render المجاني ephemeral: يمسح data/auth.db عند كل نشر/سكون،
 * فيفقد المستخدمون حساباتهم ("البريد أو كلمة المرور غير صحيحة" رغم صحتها).
 * الحل: عند توفر TURSO_DATABASE_URL (و TURSO_AUTH_TOKEN لقاعدة سحابية):
 *  1) عند الإقلاع: نسخ كل المستخدمين والجلسات من القاعدة السحابية إلى المحلية (hydrate)
 *  2) عند كل كتابة حرجة: إرسال فوري (write-through) — تسجيل مستخدم، إنشاء جلسة، إبطال جلسة
 * الجداول الصغيرة فقط (users/sessions) — بقية البيانات تبقى محلية كما هي.
 * بدون المتغيرات البيئية يعمل النظام محلياً كما كان تماماً (لا كسر لأي بيئة).
 */
import { createClient, type Client } from '@libsql/client';
import type Database from 'better-sqlite3';

export interface AuthMirror {
  /** نسخ users/sessions من السحابة إلى المحلية (تُستدعى مرة عند الإقلاع) */
  hydrate: () => Promise<void>;
  /** إرسال صف مستخدم إلى السحابة */
  mirrorUser: (row: { id: string; email: string; name: string; password_hash: string; role: string; created_at: string }) => Promise<void>;
  /** إرسال جلسة جديدة */
  mirrorSession: (row: { token: string; user_id: string; created_at: string; expires_at: string }) => Promise<void>;
  /** حذف جلسة من السحابة (تسجيل خروج) */
  mirrorRevoke: (token: string) => Promise<void>;
  /** هل المرآة فعّالة؟ */
  enabled: boolean;
}

const MIRROR_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'analyst' CHECK (role IN ('admin','analyst','viewer')),
  created_at TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS idx_mirror_sessions_user ON sessions(user_id)`,
];

export function createAuthMirror(localDb: Database.Database): AuthMirror | null {
  const url = (process.env.TURSO_DATABASE_URL || '').trim();
  if (!url) return null; // لا إعدادات — تشغيل محلي خالص

  const config: Parameters<typeof createClient>[0] = { url };
  const token = (process.env.TURSO_AUTH_TOKEN || '').trim();
  if (token) config.authToken = token;

  let remote: Client;
  try {
    remote = createClient(config);
  } catch (err) {
    console.error('[authMirror] فشل إنشاء عميل libSQL — العمل محلياً فقط:', err instanceof Error ? err.message : err);
    return null;
  }

  // execute() لا يقبل عبارات متعددة — كل عبارة على حدة عبر batch
  let schemaReady = remote
    .batch(MIRROR_SCHEMA_STATEMENTS.map(sql => ({ sql, args: [] })), 'write')
    .then(() => {});

  /** تنفيذ على السحابة مع ضمان الجدول الجاهز (لا يرمي — يعطل نفسه عند فشل متكرر) */
  async function run(sql: string, args: any[]): Promise<void> {
    try {
      await schemaReady;
      await remote.execute({ sql, args });
    } catch (err) {
      console.error('[authMirror] فشل إرسال إلى القاعدة السحابية:', err instanceof Error ? err.message : err);
    }
  }

  return {
    enabled: true,
    async hydrate() {
      try {
        await schemaReady;
        const users = await remote.execute('SELECT id, email, name, password_hash, role, created_at FROM users');
        const sessions = await remote.execute('SELECT token, user_id, created_at, expires_at FROM sessions');
        // جلسات لمستخدمين غير موجودين في السحابة (سُجلت قبل تفعيل المرآة) تُتجاهل
        // — وإلا فشلت المعاملة كاملة بقيود المفتاح الأجنبي
        const knownUserIds = new Set(users.rows.map(r => String(r.id)));
        const validSessions = sessions.rows.filter(r => knownUserIds.has(String(r.user_id)));
        const tx = localDb.transaction(() => {
          for (const r of users.rows) {
            localDb.prepare(
              'INSERT OR REPLACE INTO users (id, email, name, password_hash, role, created_at) VALUES (?,?,?,?,?,?)'
            ).run(r.id, r.email, r.name, r.password_hash, r.role, r.created_at);
          }
          for (const r of validSessions) {
            // جلسة منتهية لا تُستعاد
            if (String(r.expires_at) > new Date().toISOString()) {
              localDb.prepare('INSERT OR REPLACE INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)')
                .run(r.token, r.user_id, r.created_at, r.expires_at);
            }
          }
        });
        tx();
        console.log(`[authMirror] hydrate: ${users.rows.length} مستخدم، ${validSessions.length}/${sessions.rows.length} جلسة من Turso`);
      } catch (err) {
        console.error('[authMirror] فشل الاستعادة من السحابة (يستمر محلياً):', err instanceof Error ? err.message : err);
      }
    },
    async mirrorUser(row) {
      await run(
        'INSERT OR REPLACE INTO users (id, email, name, password_hash, role, created_at) VALUES (?,?,?,?,?,?)',
        [row.id, row.email, row.name, row.password_hash, row.role, row.created_at]
      );
    },
    async mirrorSession(row) {
      await run('INSERT OR REPLACE INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)', [
        row.token, row.user_id, row.created_at, row.expires_at,
      ]);
    },
    async mirrorRevoke(token) {
      await run('DELETE FROM sessions WHERE token = ?', [token]);
    },
  };
}
