/**
 * المصادقة: المستخدمون والجلسات والأدوار — مدعومة بقاعدة Turso (libSQL) السحابية.
 * - كلمات المرور مُهشّرة بـ bcryptjs (لا نص صريح يُخزَّن إطلاقاً)
 * - جلسات برموز عشوائية (crypto.randomBytes) مخزنة على الخادم
 *   -> إبطال فوري عند الخروج، بخلاف JWT عديم الحالة
 * - قاعدة البيانات: Turso عبر TURSO_DATABASE_URL (لا مخزن محلي بعد الآن)
 * - ذاكرة تخزين مؤقت صغيرة للجلسة (20 ثانية) لتفادي رحلة شبكة لكل طلب HTTP —
 *   تُهلك فوراً عند revokeSession (الخروج يظل سريعاً على نفس النسخة)،
 *   ويمكن تعطيلها بـ SESSION_CACHE_TTL_MS=0.
 */
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { turso, rows, one, run, ensureSchema } from './turso';
import { getSetting, APP_SETTING_KEYS } from './appSettings';
import { parseE164 } from './passwordReset';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** سقف الخمول: الجلسة تُلغى بعد هذه المدة دون أي طلب من المستخدم.
 *  ترتيب الأولوية: SESSION_IDLE_MS من البيئة (ضبط قسري/اختبارات) ← ثم القيمة
 *  المخزنة في Turso من لوحة المدير (session_idle_ms) ← ثم 5 دقائق افتراضياً.
 *  الذاكرة المؤقتة 30 ثانية حتى تعتاد لوحة المدير بسرعة دون استعلام كل طلب.
 */
let idleMsCache: { ms: number; at: number } | null = null;
export function invalidateIdleCache(): void {
  idleMsCache = null;
}
export async function getSessionIdleMsStored(): Promise<number> {
  const envMs = parseInt(process.env.SESSION_IDLE_MS || '', 10);
  if (Number.isFinite(envMs) && envMs > 0) return envMs; // أولوية الضبط القسري
  if (idleMsCache && Date.now() - idleMsCache.at < 30_000) return idleMsCache.ms;
  let ms = 5 * 60 * 1000;
  try {
    const stored = parseInt(await getSetting(APP_SETTING_KEYS.SESSION_IDLE_MS, ''), 10);
    if (Number.isFinite(stored) && stored >= 60_000) ms = stored; // أدنى سقف: دقيقة واحدة
  } catch { /* قاعدة غير متاحة: الافتراضي */ }
  idleMsCache = { ms, at: Date.now() };
  return ms;
}
const SESSION_CACHE_TTL_MS = (() => {
  const n = parseInt(process.env.SESSION_CACHE_TTL_MS || '', 10);
  return Number.isFinite(n) && n >= 0 ? n : 20000;
})();

// المخطط: نفس بنية auth.db القديمة لكن داخل Turso
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'analyst' CHECK (role IN ('admin','analyst','viewer')),
  created_at TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  device TEXT,
  last_seen_at TEXT NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
];

let schemaReady: Promise<void> | null = null;
let lastInitClient: unknown = null;
function init(): Promise<void> {
  // عميل جديد (اختبار أو غيره) ⇒ إعادة تهيئة المخطط عليه، لا مشكلة من تقاعس الذاكرة
  const client = turso();
  if (lastInitClient !== null && lastInitClient !== client) schemaReady = null;
  lastInitClient = client;
  schemaReady ??= ensureSchema(turso(), SCHEMA)
    // ترحيل قاعدة Turso قديمة: أعمدة أضافتها لاحقاً (الإبطال الصامت عند الوجود)
    .then(async () => {
      try { await run('ALTER TABLE sessions ADD COLUMN last_seen_at TEXT', []); } catch { /* العمود موجود */ }
      try { await run('ALTER TABLE sessions ADD COLUMN device TEXT', []); } catch { /* العمود موجود */ }
      // قواعد أنشأتها المرآة القديمة (authMirror): users بلا عمود phone
      try { await run('ALTER TABLE users ADD COLUMN phone TEXT', []); } catch { /* العمود موجود */ }
    })
    .catch(err => {
      schemaReady = null;
      throw err;
    });
  return schemaReady;
}

export type Role = 'admin' | 'analyst' | 'viewer';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// ذاكرة تخزين الجلسة (token -> {user, until})
// ---------------------------------------------------------------------------
const sessionCache = new Map<string, { user: AuthUser; until: number }>();

function cacheGet(token: string): AuthUser | null {
  if (SESSION_CACHE_TTL_MS <= 0) return null;
  const hit = sessionCache.get(token);
  if (!hit) return null;
  if (hit.until < Date.now()) {
    sessionCache.delete(token);
    return null;
  }
  return hit.user;
}

function cacheSet(token: string, user: AuthUser, idleMs: number): void {
  if (SESSION_CACHE_TTL_MS <= 0) return;
  // لا تُطيل الذاكرة عن سقف الخمول — وإلا جلسة منتهية بالخمول تعيش 20 ثانية إضافية
  const ttl = Math.min(SESSION_CACHE_TTL_MS, idleMs);
  // سقف بسيط للذاكرة: تنظيف دوري عند تجاوز حجم معقول
  if (sessionCache.size > 5000) {
    const now = Date.now();
    for (const [t, v] of sessionCache) {
      if (v.until < now) sessionCache.delete(t);
    }
  }
  sessionCache.set(token, { user, until: Date.now() + ttl });
}

function rowToUser(row: any): AuthUser {
  return { id: row.id, email: row.email, name: row.name, role: row.role, createdAt: row.created_at };
}

export async function createUser(email: string, name: string, password: string, role: Role = 'analyst', phone?: string): Promise<AuthUser> {
  await init();
  const emailNorm = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) throw new Error('البريد الإلكتروني غير صالح');
  // سياسة كلمة مرور أقوى من "6 أحرف فقط": 8+ أحرف مع حرف ورقم، ورفض الكلمات الشهيرة.
  // (سُجن الدخول لا يعيد التحقق القوي — التغيير لا يعطّل الحسابات الموجودة)
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
  }
  if (!/[a-zA-Z\u0600-\u06FF]/.test(password) || !/\d/.test(password)) {
    throw new Error('كلمة المرور يجب أن تتضمن حرفاً واحداً ورقماً واحداً على الأقل');
  }
  const COMMON_PASSWORDS = new Set(['password', 'password1', '12345678', '123456789', '1234567890', 'qwerty123', '11111111', 'iloveyou', 'admin123', 'abc12345']);
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    throw new Error('كلمة المرور شائعة جداً — اختر كلمة مرور أقوى');
  }
  // الهاتف اختياري لكن إن جاء فلا بُد أن يكون E.164 صالحاً حسب نمط دولته
  let phoneE164: string | null = null;
  if (phone && String(phone).trim()) {
    const p = parseE164(phone);
    if (!p.ok) throw new Error(p.message);
    phoneE164 = p.e164;
    const dup = await one('SELECT id FROM users WHERE phone = ?', [phoneE164]);
    if (dup) throw new Error('هذا الرقم مسجل مسبقاً');
  }
  const exists = await one('SELECT id FROM users WHERE email = ?', [emailNorm]);
  if (exists) throw new Error('هذا البريد مسجل مسبقاً');
  const id = `usr-${crypto.randomUUID().slice(0, 8)}`;
  const hash = bcrypt.hashSync(password, 10);
  const createdAt = new Date().toISOString();
  await run(
    'INSERT INTO users (id, email, name, password_hash, phone, role, created_at) VALUES (?,?,?,?,?,?,?)',
    [id, emailNorm, name.trim(), hash, phoneE164, role, createdAt]
  );
  return { id, email: emailNorm, name: name.trim(), role, createdAt };
}

/** تحويل User-Agent إلى وصف جهاز مقروء (المتصفح + نظام التشغيل). */
export function describeDevice(userAgent?: string): string {
  const ua = String(userAgent || '');
  if (!ua.trim()) return 'جهاز غير معروف';
  const browser = (/Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : 'متصفح') as string;
  const os = (/Windows NT/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'نظام غير معروف') as string;
  return `${browser} على ${os}`;
}

export async function verifyLogin(email: string, password: string, device?: string): Promise<{ user: AuthUser; token: string; expiresAt: string }> {
  await init();
  const emailNorm = email.trim().toLowerCase();
  let row = await one<any>('SELECT * FROM users WHERE email = ? AND email IS NOT NULL', [emailNorm]);
  // يُسمح أيضاً بالدخول برقم الهاتف (E.164) — مصدر ثانٍ للتسجيل.
  if (!row && String(email).trim().startsWith('+')) {
    const p = parseE164(email);
    if (p.ok) {
      row = await one<any>(
        `SELECT * FROM users
         WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, '-', ''), '(', ''), ')', ''), ' ', ''), '+', '')
           LIKE '%' || ?`,
        [p.e164.slice(1)]
      );
    }
  }
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    throw new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة');
  }
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  const nowIso = new Date().toISOString();
  await run(
    'INSERT INTO sessions (token, user_id, created_at, expires_at, device, last_seen_at) VALUES (?,?,?,?,?,?)',
    [token, row.id, nowIso, expiresAt, device?.trim() || null, nowIso]
  );
  const user = rowToUser(row);
  cacheSet(token, user, await getSessionIdleMsStored());
  return { user, token, expiresAt };
}

export async function getUserByToken(token: string): Promise<AuthUser | null> {
  if (!token) return null;
  const cached = cacheGet(token);
  if (cached) return cached;
  await init();
  const nowIso = new Date().toISOString();
  const idleMs = await getSessionIdleMsStored();
  const row = await one<any>(
    `SELECT u.*, s.last_seen_at FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?
       AND COALESCE(s.last_seen_at, s.created_at) > ?`,
    [token, nowIso, new Date(Date.now() - idleMs).toISOString()]
  );
  if (!row) return null;
  // تحديث ختم النشاط (بدّان معدل: كل 60 ثانية على الأكثر) — الجلسة لا تموت ما.
  const lastBump = sessionBumps.get(token);
  if (!lastBump || Date.now() - lastBump > 60_000) {
    sessionBumps.set(token, Date.now());
    void run('UPDATE sessions SET last_seen_at = ? WHERE token = ?', [nowIso, token]).catch(() => {});
  }
  const user = rowToUser(row);
  cacheSet(token, user, idleMs);
  return user;
}

// ختم آخر تحديث last_seen لكل رمز — للحد من رحلات شبكة التحويل
const sessionBumps = new Map<string, number>();

export async function revokeSession(token: string): Promise<void> {
  await init();
  await run('DELETE FROM sessions WHERE token = ?', [token]);
  sessionCache.delete(token);
  sessionBumps.delete(token);
}

// ---------------------------------------------------------------------------
// إدارة الجلسات النشطة: قائمة ما للملف الصالح للأجهزة الأخرى + إبطال فردي/جماعي.
// مجال الأمان كامل: كل العمليات مقيدة بملكية المستخدم (user_id) ولن تمس أي حساب آخر،
// ومعرفات الرموز المعروضة مقصوصة (بادئة 8) فلا يخرج الرمز كاملاً أبداً.
// ---------------------------------------------------------------------------

export interface UserSessionRow {
  /** بادئة الرمز فقط (8 خانات + ...) — للعرض والتعيّن، لا الرمز الكامل. */
  id: string;
  device: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  /** هل هذه الجلسة التي يقف عليها الطلب الحالي؟ */
  current: boolean;
}

export async function listSessionsForUser(userId: string, currentToken?: string): Promise<UserSessionRow[]> {
  await init();
  const rset = await rows<any>(
    'SELECT token, created_at, expires_at, device, last_seen_at FROM sessions WHERE user_id = ? AND expires_at > ? ORDER BY last_seen_at DESC',
    [userId, new Date().toISOString()]
  );
  return rset.map(r => ({
    id: `${String(r.token || '').slice(0, 8)}…`,
    device: r.device || 'جهاز غير معروف',
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at || r.created_at,
    expiresAt: r.expires_at,
    current: !!currentToken && r.token === currentToken,
  }));
}

/** إبطال جلسة واحدة ببادئة رمزها — فقط لجلسات المستخدم الذي يملكها. */
export async function revokeSessionForUser(userId: string, sessionId: string): Promise<boolean> {
  await init();
  const prefix = String(sessionId || '').split('…')[0].trim();
  if (prefix.length < 4) throw new Error('معرّف الجلسة غير صالح');
  const affected = await run(
    'DELETE FROM sessions WHERE user_id = ? AND token LIKE ? || \'%\'',
    [userId, prefix]
  );
  // نفس النسخة قد تحمل الرمز الكامل في الذاكرة — نهله ضمريمهامًا
  if (affected > 0) {
    for (const t of [...sessionCache.keys()]) {
      if (t.startsWith(prefix)) { sessionCache.delete(t); sessionBumps.delete(t); }
    }
  }
  return affected > 0;
}

/** إبطال كل جلسات المستخدم ما عدا الجلسة الحالية (اختيارياً). */
export async function revokeAllSessionsForUser(userId: string, exceptToken?: string): Promise<number> {
  await init();
  let affected: number;
  if (exceptToken) {
    const stale = await rows<{ token: string }>('SELECT token FROM sessions WHERE user_id = ? AND token != ?', [userId, exceptToken]);
    affected = await run('DELETE FROM sessions WHERE user_id = ? AND token != ?', [userId, exceptToken]);
    for (const r of stale) { sessionCache.delete(r.token); sessionBumps.delete(r.token); }
  } else {
    const stale = await rows<{ token: string }>('SELECT token FROM sessions WHERE user_id = ?', [userId]);
    affected = await run('DELETE FROM sessions WHERE user_id = ?', [userId]);
    for (const r of stale) { sessionCache.delete(r.token); sessionBumps.delete(r.token); }
  }
  return affected;
}

export async function countUsers(): Promise<number> {
  await init();
  return Number(((await one<any>('SELECT COUNT(*) AS c FROM users')) as any)?.c || 0);
}

/** أول حساب مسجّل يصبح مديراً تلقائياً. */
export async function roleForFirstUser(): Promise<Role> {
  return (await countUsers()) === 0 ? 'admin' : 'analyst';
}

export async function listUsers(): Promise<AuthUser[]> {
  await init();
  const all = await rows('SELECT id, email, name, role, created_at FROM users ORDER BY created_at');
  return all.map(rowToUser);
}
