/**
 * عميل Turso (libSQL) المشترك — قاعدة البيانات الوحيدة للمنصة من الآن فصاعداً.
 *
 * لماذا؟ بعد الانتقال الكامل من better-sqlite3 المحلي إلى Turso:
 * - لا يوجد أي ملف قاعدة محلي في التخزين (لا data/auth.db ولا غيره).
 * - كل وحدات التخزين (المصادقة، الجلسات، المجموعات، التنبيهات، الدعوات،
 *   استخدام الذكاء الاصطناعي، مجموعات البيانات، حالة مساحة العمل)
 *   تكتب وتقرأ من نفس قاعدة Turso السحابية عبر هذا العميل الواحد.
 * - وصول بعيد libSQL فقط (@libsql/client) — عنوان القاعدة والتوكن من
 *   متغيرات البيئة TURSO_DATABASE_URL و TURSO_AUTH_TOKEN.
 */
import { createClient, type Client, type InValue, type ResultSet } from '@libsql/client';

let _client: Client | null = null;

/** true عند توفر إعدادات Turso في البيئة (تُستخدم للرسائل التشخيصية فقط). */
export function hasTursoConfig(): boolean {
  return !!(process.env.TURSO_DATABASE_URL || '').trim();
}

/** العميل الفعّال (عميل Turso السحابي إلا إذا كان قد حُلّ بعميل اختبار). */
export function turso(): Client {
  if (_client) return _client;
  const url = (process.env.TURSO_DATABASE_URL || '').trim();
  if (!url) {
    throw new Error(
      'TURSO_DATABASE_URL غير مضبوط — لا يوجد أي مخزن محلي بعد الآن. ' +
        'أضف TURSO_DATABASE_URL و TURSO_AUTH_TOKEN إلى ملف .env (أنشئ قاعدة مجانية على https://turso.tech)'
    );
  }
  const token = (process.env.TURSO_AUTH_TOKEN || '').trim();
  _client = token ? createClient({ url, authToken: token }) : createClient({ url });
  return _client;
}

/** عميل قاعدة In-memory — للاختبارات الوحدة (دون ذُكر قاعدة حقيقية للرياضيات). */
export function createTestClient(): Client {
  return createClient({ url: 'file::memory:' });
}

/** تسجيل عميل ستّعمله عمليات الاختبار بدلاً من عميل Turso السحابي. */
export function useTursoClient(c: Client): void { 
  _client = c;
}

// ---------------------------------------------------------------------------
// مساعدات عملية — كلها async (الأصلي كان better-sqlite3 متزامن)
// ---------------------------------------------------------------------------

/**
 * حالة الاتصال بقاعدة البيانات — تُقرأ من /api/health ومن الواجهة.
 * Turso يُرجع 502/503 عابرةً أثناء إعادة تشغيل الخادم البعيد أو عند نفاد
 * اتصالات الحوض؛ إعادة محاولة قصيرة تُنقذ الطلب بدل إسقاط الخادم كله.
 */
export interface DbHealth {
  configured: boolean;
  healthy: boolean;
  lastError: string | null;
  lastErrorAt: string | null;
  lastOkAt: string | null;
  retries: number;
  /** Round-trip of the health ping, when one was just made. */
  latencyMs?: number;
}

const dbHealth: DbHealth = {
  configured: hasTursoConfig(),
  healthy: hasTursoConfig(),
  lastError: null,
  lastErrorAt: null,
  lastOkAt: null,
  retries: 0,
};

export function getDbHealth(): DbHealth {
  return { ...dbHealth, configured: hasTursoConfig() };
}

/** أخطاء تستحق إعادة المحاولة؛ خطأ SQL حقيقي لا يستحقها. */
export function isTransientDbError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return /(502|503|504|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|fetch failed|network|socket hang up|LibsqlError: SERVER_ERROR)/i.test(
    message
  );
}

const RETRY_DELAYS_MS = [150, 450, 1200];

/** تنفيذ عبارة وإرجاع صفوفها (SELECT) أو التأثير (بقية العبارات). */
export async function q<T = any>(sql: string, args: InValue[] = []): Promise<ResultSet> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const result = await turso().execute({ sql, args });
      dbHealth.healthy = true;
      dbHealth.lastOkAt = new Date().toISOString();
      return result;
    } catch (error) {
      lastError = error;
      dbHealth.healthy = false;
      dbHealth.lastError = error instanceof Error ? error.message : String(error);
      dbHealth.lastErrorAt = new Date().toISOString();
      if (attempt === RETRY_DELAYS_MS.length || !isTransientDbError(error)) break;
      dbHealth.retries += 1;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
  throw lastError;
}

/** إرجاع كل صفوف SELECT كـ objects جاهزة. */
export async function rows<T = any>(sql: string, args: InValue[] = []): Promise<T[]> {
  return (await q(sql, args)).rows as unknown as T[];
}

/** إرجاع أول صف (undefined إن لا صفوف). */
export async function one<T = any>(sql: string, args: InValue[] = []): Promise<T | undefined> {
  const rset = await q(sql, args);
  return (rset.rows[0] ?? undefined) as T | undefined;
}

/** تنفيذ INSERT/UPDATE/DELETE وإرجاع عدد الصفوف المتأثرة. */
export async function run(sql: string, args: InValue[] = []): Promise<number> {
  const rset = await q(sql, args);
  return rset.rowsAffected;
}

/** إنشاء المخطط idempotently — كل عبارة على حدة (execute لا يقبل دفعات متعددة). */
export async function ensureSchema(client: Client, statements: string[]): Promise<void> {
  const batch = statements.map(sql => ({ sql, args: [] as InValue[] }));
  await client.batch(batch, 'write');
}
