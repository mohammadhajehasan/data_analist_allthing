/**
 * SQLite-backed user notifications + invite system.
 * - notifications: typed, addressed to a single user, optional payload JSON
 * - discussion_invites (pending): owner invites a user -> PENDING notification;
 *   the invitee accepts (added as member) or rejects (owner gets a rejection
 *   notification). Membership happens only after acceptance — never before.
 * Reuses data/auth.db and the SSE fan-out from server/discussions.ts.
 */
import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';
import { addMember, getDiscussionRow, isMember, isModerator, emitToUser } from './discussions';

const DATA_DIR = path.join(process.cwd(), 'data');
const db = new Database(path.join(DATA_DIR, 'auth.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  payload TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at);

CREATE TABLE IF NOT EXISTS discussion_invites_pending (
  id TEXT PRIMARY KEY,
  discussion_id TEXT NOT NULL REFERENCES discussions(id) ON DELETE CASCADE,
  from_user TEXT NOT NULL,
  to_user TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','cancelled')),
  created_at TEXT NOT NULL,
  decided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_invpend_to ON discussion_invites_pending(to_user, status);
CREATE INDEX IF NOT EXISTS idx_invpend_disc ON discussion_invites_pending(discussion_id);
`);

export interface Notification {
  id: string;
  type: 'discussion_invite' | 'invite_accepted' | 'invite_rejected' | 'info';
  title: string;
  body: string | null;
  payload: any;
  read: boolean;
  createdAt: string;
}

function uid(p: string): string {
  return `${p}-${crypto.randomUUID().slice(0, 12)}`;
}

function emit(userId: string): void {
  // Push the fresh unread count to the user's open SSE stream(s), if any
  emitToUser(userId, countUnread(userId));
}

export function pushNotification(userId: string, type: Notification['type'], title: string, body?: string, payload?: any): Notification {
  const now = new Date().toISOString();
  const id = uid('ntf');
  db.prepare('INSERT INTO notifications (id, user_id, type, title, body, payload, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(id, userId, type, title, body || null, payload ? JSON.stringify(payload) : null, now);
  emit(userId);
  return { id, type, title, body: body || null, payload: payload || null, read: false, createdAt: now };
}

export function listNotifications(userId: string, limit = 50): Notification[] {
  const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(userId, limit) as any[];
  return rows.map(r => ({
    id: r.id, type: r.type, title: r.title, body: r.body,
    payload: r.payload ? JSON.parse(r.payload) : null,
    read: !!r.read, createdAt: r.created_at,
  }));
}

export function countUnread(userId: string): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0').get(userId) as any).c;
}

export function markNotificationRead(userId: string, id: string): void {
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').run(id, userId);
  emit(userId);
}

export function markAllNotificationsRead(userId: string): void {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(userId);
  emit(userId);
}

// ---------------------------------------------------------------------------
// Invite lifecycle: pending -> accepted | rejected
// ---------------------------------------------------------------------------

export interface PendingInvite {
  id: string; discussionId: string; discussionName: string;
  fromName: string; fromEmail: string;
  createdAt: string; status: string;
}

/** Owner invites a user: creates a PENDING record + notification. No membership yet. */
export function sendDiscussionInvite(discussionId: string, fromUserId: string, fromUserName: string, toUserId: string): { inviteId: string } {
  const disc = getDiscussionRow(discussionId);
  if (!disc) throw new Error('المجموعة غير موجودة');
  if (!isModerator(discussionId, fromUserId)) throw new Error('فقط المالك أو المشرفون يمكنهم الدعوة');

  const target = db.prepare('SELECT id, name, email FROM users WHERE id = ? OR email = ?').get(toUserId, String(toUserId).trim().toLowerCase()) as any;
  if (!target) throw new Error('المستخدم المدعو غير موجود');
  if (isMember(discussionId, target.id)) throw new Error('هذا المستخدم عضو في المجموعة بالفعل');

  const dup = db.prepare("SELECT 1 FROM discussion_invites_pending WHERE discussion_id = ? AND to_user = ? AND status = 'pending'").get(discussionId, target.id);
  if (dup) throw new Error('هناك دعوة معلقة لهذا المستخدم على المجموعة');

  const id = uid('inv');
  db.prepare('INSERT INTO discussion_invites_pending (id, discussion_id, from_user, to_user, status, created_at) VALUES (?,?,?,?,?,?)')
    .run(id, discussionId, fromUserId, target.id, 'pending', new Date().toISOString());

  pushNotification(
    target.id,
    'discussion_invite',
    'دعوة انضمام لمجموعة مناقشة',
    `${fromUserName} يدعوك للانضمام إلى مجموعة "${disc.name}"`,
    { inviteId: id, discussionId, discussionName: disc.name, fromName: fromUserName }
  );
  return { inviteId: id };
}

/** Invitee accepts: only now is membership created. Owner gets an acceptance notification. */
export function acceptDiscussionInvite(inviteId: string, byUserId: string): { discussionId: string; discussionName: string } {
  const inv = db.prepare("SELECT * FROM discussion_invites_pending WHERE id = ? AND to_user = ? AND status = 'pending'").get(inviteId, byUserId) as any;
  if (!inv) throw new Error('الدعوة غير موجودة أو تم البت فيها مسبقاً');
  const disc = getDiscussionRow(inv.discussion_id);
  if (!disc) {
    db.prepare("UPDATE discussion_invites_pending SET status = 'cancelled' WHERE id = ?").run(inviteId);
    throw new Error('المجموعة لم تعد موجودة');
  }

  db.prepare("UPDATE discussion_invites_pending SET status = 'accepted', decided_at = ? WHERE id = ?").run(new Date().toISOString(), inviteId);
  addMember(inv.discussion_id, byUserId); // membership ONLY on acceptance

  const me = db.prepare('SELECT name FROM users WHERE id = ?').get(byUserId) as any;
  pushNotification(
    inv.from_user,
    'invite_accepted',
    'تم قبول دعوتك',
    `${me?.name || 'المستخدم'} قبل الانضمام إلى مجموعة "${disc.name}"`,
    { discussionId: inv.discussion_id, discussionName: disc.name }
  );
  return { discussionId: inv.discussion_id, discussionName: disc.name };
}

/** Invitee rejects: no membership; owner gets a rejection notification. */
export function rejectDiscussionInvite(inviteId: string, byUserId: string): void {
  const inv = db.prepare("SELECT * FROM discussion_invites_pending WHERE id = ? AND to_user = ? AND status = 'pending'").get(inviteId, byUserId) as any;
  if (!inv) throw new Error('الدعوة غير موجودة أو تم البت فيها مسبقاً');
  db.prepare("UPDATE discussion_invites_pending SET status = 'rejected', decided_at = ? WHERE id = ?").run(new Date().toISOString(), inviteId);

  const disc = getDiscussionRow(inv.discussion_id);
  const me = db.prepare('SELECT name FROM users WHERE id = ?').get(byUserId) as any;
  pushNotification(
    inv.from_user,
    'invite_rejected',
    'تم رفض دعوتك',
    `${me?.name || 'المستخدم'} رفض الانضمام إلى مجموعة "${disc?.name || ''}"`,
    { discussionId: inv.discussion_id, discussionName: disc?.name }
  );
}

/** Pending invites received by the user (for the notifications UI). */
export function listPendingInvitesFor(userId: string): PendingInvite[] {
  const rows = db.prepare(`
    SELECT p.id, p.discussion_id, p.created_at, p.status,
      d.name AS discussion_name,
      u.name AS from_name, u.email AS from_email
    FROM discussion_invites_pending p
    JOIN discussions d ON d.id = p.discussion_id
    JOIN users u ON u.id = p.from_user
    WHERE p.to_user = ? AND p.status = 'pending'
    ORDER BY p.created_at DESC
  `).all(userId) as any[];
  return rows.map(r => ({
    id: r.id, discussionId: r.discussion_id, discussionName: r.discussion_name,
    fromName: r.from_name, fromEmail: r.from_email, createdAt: r.created_at, status: r.status,
  }));
}

export interface GroupPendingInvite {
  id: string; toName: string; toEmail: string;
  createdAt: string; invitedByMe: boolean;
}

/** Pending invites of ONE group — visible to group members (owners manage them). */
export function listGroupPendingInvites(discussionId: string, byUserId: string): GroupPendingInvite[] {
  if (!isMember(discussionId, byUserId)) throw new Error('يجب أن تكون عضواً لعرض دعوات المجموعة');
  const rows = db.prepare(`
    SELECT p.id, p.created_at, p.from_user,
      u.name AS to_name, u.email AS to_email
    FROM discussion_invites_pending p
    JOIN users u ON u.id = p.to_user
    WHERE p.discussion_id = ? AND p.status = 'pending'
    ORDER BY p.created_at DESC
  `).all(discussionId) as any[];
  return rows.map(r => ({
    id: r.id, toName: r.to_name, toEmail: r.to_email,
    createdAt: r.created_at, invitedByMe: r.from_user === byUserId,
  }));
}

/** Owner (or any member) cancels their own pending invite; owner cancels anyone's. */
export function cancelPendingInvite(discussionId: string, inviteId: string, byUserId: string, isAdmin: boolean): void {
  const inv = db.prepare("SELECT * FROM discussion_invites_pending WHERE id = ? AND discussion_id = ? AND status = 'pending'")
    .get(inviteId, discussionId) as any;
  if (!inv) throw new Error('الدعوة غير موجودة أو تم البت فيها مسبقاً');
  if (inv.from_user !== byUserId && !isAdmin) {
    throw new Error('فقط صاحب الدعوة أو مالك المجموعة يمكنه إلغاءها');
  }
  db.prepare("UPDATE discussion_invites_pending SET status = 'cancelled', decided_at = ? WHERE id = ?")
    .run(new Date().toISOString(), inviteId);
  // Let the invitee know the invite is gone (harmless if already decided)
  pushNotification(
    inv.to_user, 'info', 'تم إلغاء دعوة',
    'أُلغيت دعوة الانضمام إلى المجموعة من قبل المالك',
    { inviteId, discussionId, discussionName: getDiscussionRow(discussionId)?.name }
  );
}

/** Resend a pending invite: fresh notification ping to the invitee (same invite id). */
export function resendPendingInvite(discussionId: string, inviteId: string, byUserId: string, byUserName: string): void {
  const inv = db.prepare("SELECT * FROM discussion_invites_pending WHERE id = ? AND discussion_id = ? AND status = 'pending'")
    .get(inviteId, discussionId) as any;
  if (!inv) throw new Error('الدعوة غير موجودة أو تم البت فيها مسبقاً');
  if (inv.from_user !== byUserId) {
    // Only the original inviter or the group owner may resend
    const owner = isMember(discussionId, byUserId) && getOwnerName(discussionId) === byUserId;
    if (!owner) throw new Error('فقط صاحب الدعوة أو مالك المجموعة يمكنه إعادة الإرسال');
  }
  const disc = getDiscussionRow(discussionId);
  pushNotification(
    inv.to_user, 'discussion_invite', 'تذكير: دعوة انضمام لمجموعة مناقشة',
    `${byUserName} يعيد توجيه دعوته للانضمام إلى مجموعة "${disc?.name || ''}"`,
    { inviteId, discussionId, discussionName: disc?.name, fromName: byUserName, resent: true }
  );
}

function getOwnerName(discussionId: string): string | null {
  const row = db.prepare("SELECT created_by FROM discussions WHERE id = ?").get(discussionId) as any;
  return row?.created_by || null;
}
