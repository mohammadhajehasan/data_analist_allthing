/**
 * إعدادات المنصة المخزنة في قاعدة Turso (جدول app_settings) — زوج مفتاح/قيمة.
 * تستخدمها ميزات قابلة للضبط من لوحة المدير بدلاً من التعديل اليدوي في .env،
 * ومنها حالياً: مدة خمول الجلسة (المفتاح session_idle_ms بالمللي ثانية).
 */
import type { Client } from '@libsql/client';
import { turso, one, run, ensureSchema } from './turso';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`,
];

let schemaReady: Promise<void> | null = null;
let lastInitClient: unknown = null;
function init(): Promise<void> {
  // عميل جديد (اختبار) ⇒ إعادة تهيئة المخطط عليه
  const client = turso();
  if (lastInitClient !== null && lastInitClient !== client) schemaReady = null;
  lastInitClient = client;
  schemaReady ??= ensureSchema(turso(), SCHEMA).catch(err => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

/** قراءة إعداد كنص، ويعيد defaultValue عند غيابه. */
export async function getSetting(key: string, defaultValue = ''): Promise<string> {
  await init();
  const row = await one<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [key]);
  return row?.value ?? defaultValue;
}

/** كتابة/تحديث إعداد (upsert) مع ختم زمني. */
export async function setSetting(key: string, value: string): Promise<void> {
  await init();
  await run(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?,?,?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, new Date().toISOString()]
  );
}

/** إعدادات التطبيق المعروفة — مفاتيح ثابتة لتفادي الأخطاء الإملائية. */
export const APP_SETTING_KEYS = {
  SESSION_IDLE_MS: 'session_idle_ms',
} as const;
