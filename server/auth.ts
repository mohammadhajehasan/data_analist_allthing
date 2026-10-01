/**
 * SQLite-backed authentication: users, sessions, roles.
 * - Passwords hashed with bcryptjs (never stored in plaintext)
 * - Opaque random session tokens (crypto.randomBytes) stored server-side
 *   -> instant revocation on logout, unlike stateless JWTs
 * - Database file: data/auth.db (git-ignored)
 */
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'auth.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'analyst' CHECK (role IN ('admin','analyst','viewer')),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

export type Role = 'admin' | 'analyst' | 'viewer';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
}

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function rowToUser(row: any): AuthUser {
  return { id: row.id, email: row.email, name: row.name, role: row.role, createdAt: row.created_at };
}

export function createUser(email: string, name: string, password: string, role: Role = 'analyst'): AuthUser {
  const emailNorm = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) throw new Error('البريد الإلكتروني غير صالح');
  if (password.length < 6) throw new Error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(emailNorm);
  if (exists) throw new Error('هذا البريد مسجل مسبقاً');
  const id = `usr-${crypto.randomUUID().slice(0, 8)}`;
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (id, email, name, password_hash, role, created_at) VALUES (?,?,?,?,?,?)')
    .run(id, emailNorm, name.trim(), hash, role, new Date().toISOString());
  return { id, email: emailNorm, name: name.trim(), role, createdAt: new Date().toISOString() };
}

export function verifyLogin(email: string, password: string): { user: AuthUser; token: string; expiresAt: string } {
  const emailNorm = email.trim().toLowerCase();
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(emailNorm) as any;
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    throw new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة');
  }
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?,?,?,?)')
    .run(token, row.id, new Date().toISOString(), expiresAt);
  return { user: rowToUser(row), token, expiresAt };
}

export function getUserByToken(token: string): AuthUser | null {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?
  `).get(token, new Date().toISOString()) as any;
  return row ? rowToUser(row) : null;
}

export function revokeSession(token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function countUsers(): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM users').get() as any).c;
}

/** First registered account becomes admin automatically. */
export function roleForFirstUser(): Role {
  return countUsers() === 0 ? 'admin' : 'analyst';
}

export function listUsers(): AuthUser[] {
  return (db.prepare('SELECT id, email, name, role, created_at FROM users ORDER BY created_at').all() as any[]).map(rowToUser);
}
