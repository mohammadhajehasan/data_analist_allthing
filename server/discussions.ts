/**
 * SQLite-backed group discussions (WhatsApp-style groups) for the platform,
 * stored in the single Turso (libSQL) cloud database.
 * - Tables: discussions, discussion_members, discussion_messages, invites, last_read
 * - Creator becomes the group owner and invites registered users by id/email.
 * - Messages are stored per group with author + timestamp (server-authoritative).
 */
import type { InValue } from '@libsql/client';
import crypto from 'crypto';
import { turso, rows, one, run, ensureSchema } from './turso';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS discussions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  topic TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  send_policy TEXT NOT NULL DEFAULT 'everyone' CHECK (send_policy IN ('everyone','moderators_only'))
)`,
  `CREATE TABLE IF NOT EXISTS discussion_members (
  discussion_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','moderator','member')),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (discussion_id, user_id)
)`,
  `CREATE TABLE IF NOT EXISTS discussion_messages (
  id TEXT PRIMARY KEY,
  discussion_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  image_data TEXT,
  snapshot_source TEXT,
  created_at TEXT NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS discussion_invites (
  code TEXT PRIMARY KEY,
  discussion_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  max_uses INTEGER,
  use_count INTEGER NOT NULL DEFAULT 0,
  revoked INTEGER NOT NULL DEFAULT 0
)`,
  `CREATE TABLE IF NOT EXISTS discussion_last_read (
  discussion_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  last_read_at TEXT NOT NULL,
  PRIMARY KEY (discussion_id, user_id)
)`,
  `CREATE INDEX IF NOT EXISTS idx_dmsg_discussion ON discussion_messages(discussion_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_dmem_user ON discussion_members(user_id)`,
];

let schemaReady: Promise<void> | null = null;
function init(): Promise<void> {
  schemaReady ??= ensureSchema(turso(), SCHEMA).catch(err => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

export interface DiscussionSummary {
  id: string;
  name: string;
  topic: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  members: { id: string; name: string; role: 'owner' | 'moderator' | 'member' }[];
  memberCount: number;
  messageCount: number;
  lastMessage: { body: string; authorName: string; createdAt: string; imageData: string | null } | null;
  isMember: boolean;
  isOwner: boolean;
  /** True when this user is a moderator of the group (invite/remove rights). */
  isModerator: boolean;
  /** 'everyone' = all members may post; 'moderators_only' = closed group (WhatsApp-style). */
  sendPolicy: 'everyone' | 'moderators_only';
  /** Messages posted after the user's last_read_at (own messages excluded). */
  unreadCount: number;
}

export interface DiscussionMessage {
  id: string;
  discussionId: string;
  authorId: string;
  authorName: string;
  body: string;
  /** Optional inline screenshot: a data URL (data:image/png;base64,...) */
  imageData: string | null;
  /** For shared snapshots only: 'dashboard' | 'reports' — powers per-tab unread badges. */
  snapshotSource?: string | null;
  createdAt: string;
}

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
}

export async function createDiscussion(name: string, topic: string, createdByUserId: string, creatorName: string): Promise<DiscussionSummary> {
  await init();
  const trimmed = name.trim();
  if (!trimmed) throw new Error('اسم المجموعة مطلوب');
  const now = new Date().toISOString();
  const id = uid('grp');
  await run('INSERT INTO discussions (id, name, topic, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?)', [
    id,
    trimmed,
    topic?.trim() || null,
    createdByUserId,
    now,
    now,
  ]);
  await run('INSERT INTO discussion_members (discussion_id, user_id, role, joined_at) VALUES (?,?,?,?)', [
    id,
    createdByUserId,
    'owner',
    now,
  ]);
  return {
    id, name: trimmed, topic: topic?.trim() || null,
    createdBy: createdByUserId, createdAt: now, updatedAt: now,
    members: [{ id: createdByUserId, name: creatorName, role: 'owner' }],
    memberCount: 1, messageCount: 0, lastMessage: null,
    isMember: true, isOwner: true, isModerator: false,
    sendPolicy: 'everyone', unreadCount: 0,
  };
}

export async function getDiscussionRow(id: string): Promise<any> {
  await init();
  return (await one<any>('SELECT * FROM discussions WHERE id = ?', [id])) ?? null;
}

export async function isMember(discussionId: string, userId: string): Promise<boolean> {
  await init();
  return !!(await one('SELECT 1 FROM discussion_members WHERE discussion_id = ? AND user_id = ?', [discussionId, userId]));
}

export async function isOwner(discussionId: string, userId: string): Promise<boolean> {
  await init();
  return !!(await one("SELECT 1 FROM discussion_members WHERE discussion_id = ? AND user_id = ? AND role = 'owner'", [discussionId, userId]));
}

/** Owner OR moderator — the management privilege level inside a group. */
export async function isModerator(discussionId: string, userId: string): Promise<boolean> {
  await init();
  return !!(await one("SELECT 1 FROM discussion_members WHERE discussion_id = ? AND user_id = ? AND role IN ('owner','moderator')", [discussionId, userId]));
}

/** Owner promotes a member to moderator (no-op if already moderator/owner). */
export async function promoteToModerator(discussionId: string, targetUserId: string, byUserId: string): Promise<void> {
  await init();
  if (!(await isOwner(discussionId, byUserId))) throw new Error('فقط مالك المجموعة يمكنه تعيين مشرفين');
  if (await isOwner(discussionId, targetUserId)) throw new Error('المالك مشرف بالفعل');
  if (!(await isMember(discussionId, targetUserId))) throw new Error('المستخدم ليس عضواً في هذه المجموعة');
  await run("UPDATE discussion_members SET role = 'moderator' WHERE discussion_id = ? AND user_id = ?", [discussionId, targetUserId]);
  await touchDiscussion(discussionId);
  await notify('members', discussionId);
}

/** Owner demotes a moderator back to plain member. */
export async function demoteModerator(discussionId: string, targetUserId: string, byUserId: string): Promise<void> {
  await init();
  if (!(await isOwner(discussionId, byUserId))) throw new Error('فقط مالك المجموعة يمكنه إلغاء إشراف عضو');
  if (await isOwner(discussionId, targetUserId)) throw new Error('لا يمكن إزالة إشراف المالك');
  if (((await one<any>('SELECT role FROM discussion_members WHERE discussion_id = ? AND user_id = ?', [discussionId, targetUserId])) as any)?.role !== 'moderator') {
    throw new Error('هذا العضو ليس مشرفاً');
  }
  await run("UPDATE discussion_members SET role = 'member' WHERE discussion_id = ? AND user_id = ?", [discussionId, targetUserId]);
  await touchDiscussion(discussionId);
  await notify('members', discussionId);
}

/**
 * Owner toggles who may post: 'everyone' (open chat) or 'moderators_only'
 * (closed/announcement group, WhatsApp-style). Members get an SSE members
 * event so their composer locks/unlocks instantly.
 */
export async function setSendPolicy(discussionId: string, byUserId: string, policy: 'everyone' | 'moderators_only'): Promise<void> {
  await init();
  if (!(await isOwner(discussionId, byUserId))) throw new Error('فقط مالك المجموعة يمكنه تغيير سياسة الإرسال');
  if (policy !== 'everyone' && policy !== 'moderators_only') throw new Error('سياسة إرسال غير صالحة');
  await run('UPDATE discussions SET send_policy = ? WHERE id = ?', [policy, discussionId]);
  await touchDiscussion(discussionId);
  await notify('members', discussionId);
}

async function touchDiscussion(discussionId: string): Promise<void> {
  await run('UPDATE discussions SET updated_at = ? WHERE id = ?', [new Date().toISOString(), discussionId]);
}

/**
 * List discussions for a user: ONLY groups they belong to. No global browsing —
 * with a platform of millions, nobody may discover groups they were not invited to.
 * The second element of the tuple is kept empty for API compatibility.
 */
export async function listDiscussionsForUser(userId: string): Promise<{ mine: DiscussionSummary[]; discoverable: DiscussionSummary[] }> {
  await init();
  const all = await rows<any>(`
    SELECT d.*,
      (SELECT COUNT(*) FROM discussion_members m WHERE m.discussion_id = d.id) AS member_count,
      (SELECT COUNT(*) FROM discussion_messages msg WHERE msg.discussion_id = d.id) AS message_count
    FROM discussions d
    ORDER BY d.updated_at DESC
  `);

  const memberRows = await rows<any>(`
    SELECT dm.discussion_id, dm.user_id, dm.role, u.name
    FROM discussion_members dm JOIN users u ON u.id = dm.user_id
  `);

  const lastMessages = await rows<any>(`
    SELECT m.discussion_id, m.body, m.author_name, m.created_at, m.image_data
    FROM discussion_messages m
    JOIN (
      SELECT discussion_id, MAX(created_at) AS max_created
      FROM discussion_messages GROUP BY discussion_id
    ) latest ON latest.discussion_id = m.discussion_id AND latest.max_created = m.created_at
  `);

  // غير المقروء كمجموعة واحدة: عدد رسائل الآخرين بعد آخر قراءة لكل مجموعة
  const unreadRows = await rows<{ discussion_id: string; c: number }>(`
    SELECT dm.discussion_id, COUNT(*) AS c
    FROM discussion_members dm
    JOIN discussion_messages m ON m.discussion_id = dm.discussion_id
    LEFT JOIN discussion_last_read lr ON lr.discussion_id = dm.discussion_id AND lr.user_id = dm.user_id
    WHERE dm.user_id = ? AND m.author_id != ?
      AND m.created_at > COALESCE(lr.last_read_at, '1970-01-01')
    GROUP BY dm.discussion_id
  `, [userId, userId]);
  const unreadByDiscussion = new Map(unreadRows.map(r => [r.discussion_id, r.c]));

  const mine: DiscussionSummary[] = [];
  const discoverable: DiscussionSummary[] = [];

  for (const row of all) {
    const members = memberRows
      .filter(m => m.discussion_id === row.id)
      .map(m => ({ id: m.user_id, name: m.name, role: m.role as 'owner' | 'moderator' | 'member' }));
    const lm = lastMessages.find(l => l.discussion_id === row.id);
    const summary: DiscussionSummary = {
      id: row.id, name: row.name, topic: row.topic, createdBy: row.created_by,
      createdAt: row.created_at, updatedAt: row.updated_at,
      memberCount: row.member_count, messageCount: row.message_count,
      members,
      lastMessage: lm
        ? { body: lm.body, authorName: lm.author_name, createdAt: lm.created_at, imageData: lm.image_data || null }
        : null,
      isMember: members.some(m => m.id === userId),
      isOwner: members.some(m => m.id === userId && m.role === 'owner'),
      isModerator: members.some(m => m.id === userId && m.role === 'moderator'),
      sendPolicy: (row.send_policy === 'moderators_only' ? 'moderators_only' : 'everyone'),
      unreadCount: unreadByDiscussion.get(row.id) || 0,
    };
    if (summary.isMember) mine.push(summary); // non-member groups are never listed
  }

  return { mine, discoverable: [] };
}

export async function addMember(discussionId: string, userId: string): Promise<void> {
  await init();
  const user = await one('SELECT id FROM users WHERE id = ?', [userId]);
  if (!user) throw new Error('المستخدم غير موجود');
  if (await isMember(discussionId, userId)) throw new Error('المستخدم عضو بالفعل في هذه المجموعة');
  await run('INSERT INTO discussion_members (discussion_id, user_id, role, joined_at) VALUES (?,?,?,?)', [
    discussionId,
    userId,
    'member',
    new Date().toISOString(),
  ]);
  await touchDiscussion(discussionId);
  // The new member can now receive events for this discussion
  await notify('members', discussionId);
}

export async function removeMember(discussionId: string, userId: string, byUserId?: string): Promise<void> {
  await init();
  if (!(await isMember(discussionId, userId))) throw new Error('المستخدم ليس عضواً في هذه المجموعة');
  if (await isOwner(discussionId, userId)) throw new Error('لا يمكن إزالة مالك المجموعة');
  // A moderator may only remove plain members — never other moderators or the owner
  if (byUserId && !(await isOwner(discussionId, byUserId)) && (await isModerator(discussionId, userId))) {
    throw new Error('المشرف لا يمكنه إزالة مشرف آخر — المالك فقط');
  }
  await run('DELETE FROM discussion_members WHERE discussion_id = ? AND user_id = ?', [discussionId, userId]);
  await touchDiscussion(discussionId);
  await notify('members', discussionId);
}

/** Owner leaves -> group is deleted (cascade removes members & messages). */
export async function deleteDiscussion(discussionId: string, byUserId: string): Promise<void> {
  await init();
  if (!(await isOwner(discussionId, byUserId))) throw new Error('فقط مالك المجموعة يمكنه حذفها');
  await run('DELETE FROM discussion_messages WHERE discussion_id = ?', [discussionId]);
  await run('DELETE FROM discussion_members WHERE discussion_id = ?', [discussionId]);
  await run('DELETE FROM discussions WHERE id = ?', [discussionId]);
  await notify('deleted', discussionId);
}

const MAX_IMAGE_BYTES = 3 * 1024 * 1024; // ~3MB decoded PNG ceiling
const ALLOWED_IMAGE_MIME = /^image\/(png|jpeg|webp)$/i;

function validateImageData(imageData: string | null | undefined): string | null {
  if (imageData == null || imageData === '') return null;
  if (typeof imageData !== 'string' || !imageData.startsWith('data:')) {
    throw new Error('الصورة يجب أن تكون بصيغة data URL');
  }
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(imageData);
  if (!match) throw new Error('صيغة الصورة غير صالحة');
  const [, mime, b64] = match;
  if (!ALLOWED_IMAGE_MIME.test(mime)) throw new Error('نوع الصورة غير مدعوم (PNG/JPEG/WEBP فقط)');
  const decodedBytes = Math.floor((b64.length * 3) / 4);
  if (decodedBytes > MAX_IMAGE_BYTES) {
    throw new Error('الصورة كبيرة جداً — الحد الأقصى 3MB');
  }
  return imageData;
}

export async function postMessage(discussionId: string, authorId: string, authorName: string, body: string, imageData?: string | null, snapshotOrigin?: string | null): Promise<DiscussionMessage> {
  await init();
  const trimmed = (body || '').trim();
  const image = validateImageData(imageData);
  if (!trimmed && !image) throw new Error('الرسالة مطلوبة (نص أو صورة)');
  if (trimmed.length > 4000) throw new Error('الرسالة طويلة جداً (الحد 4000 حرف)');
  if (!(await isMember(discussionId, authorId))) throw new Error('يجب أن تكون عضواً في المجموعة لإرسال الرسائل');
  // Closed group: only owner & moderators may post (WhatsApp-style announcement mode)
  const discRow = await getDiscussionRow(discussionId);
  if (discRow?.send_policy === 'moderators_only' && !(await isModerator(discussionId, authorId))) {
    throw new Error('المجموعة مغلقة — المالك والمشرفون فقط يمكنهم الإرسال');
  }
  const now = new Date().toISOString();
  const id = uid('msg');
  // Tag the origin of shared snapshots (dashboard/reports) for per-tab unread badges
  const snapshotSource = image && (snapshotOrigin === 'reports' || snapshotOrigin === 'dashboard') ? snapshotOrigin : null;
  await run(
    'INSERT INTO discussion_messages (id, discussion_id, author_id, author_name, body, image_data, snapshot_source, created_at) VALUES (?,?,?,?,?,?,?,?)',
    [id, discussionId, authorId, authorName, trimmed, image, snapshotSource, now]
  );
  await touchDiscussion(discussionId);
  const message: DiscussionMessage = { id, discussionId, authorId, authorName, body: trimmed, imageData: image, createdAt: now };
  await notify('message', discussionId, message);
  return message;
}

/**
 * Paginated message history. Default: latest 50 messages only.
 * `beforeIso` returns the page immediately older than that timestamp
 * (used by infinite scroll-up), so we never ship the whole history.
 */
export async function listMessages(discussionId: string, userId: string, limit = 50, beforeIso?: string): Promise<DiscussionMessage[]> {
  await init();
  if (!(await isMember(discussionId, userId))) throw new Error('غير مصرح: لست عضواً في هذه المجموعة');
  const capped = Math.min(Math.max(limit, 1), 100); // hard cap per request
  const msgs = beforeIso
    ? await rows<any>(`
        SELECT id, discussion_id, author_id, author_name, body, image_data, snapshot_source, created_at
        FROM discussion_messages WHERE discussion_id = ? AND created_at < ?
        ORDER BY created_at DESC LIMIT ?
      `, [discussionId, beforeIso, capped])
    : await rows<any>(`
        SELECT id, discussion_id, author_id, author_name, body, image_data, snapshot_source, created_at
        FROM discussion_messages WHERE discussion_id = ?
        ORDER BY created_at DESC LIMIT ?
      `, [discussionId, capped]);
  return msgs
    .map(r => ({
      id: r.id, discussionId: r.discussion_id, authorId: r.author_id,
      authorName: r.author_name, body: r.body, imageData: r.image_data || null, createdAt: r.created_at,
      snapshotSource: r.snapshot_source || null,
    }))
    .reverse();
}

/** True when older messages exist beyond the given timestamp (scroll-up hint). */
export async function hasOlderMessages(discussionId: string, beforeIso: string): Promise<boolean> {
  await init();
  return !!(await one('SELECT 1 FROM discussion_messages WHERE discussion_id = ? AND created_at < ? LIMIT 1', [discussionId, beforeIso]));
}

/** Record that a user has read a group up to `now` (unread badge resets). */
export async function markDiscussionRead(discussionId: string, userId: string): Promise<void> {
  await init();
  if (!(await isMember(discussionId, userId))) throw new Error('يجب أن تكون عضواً في المجموعة');
  await run(`
    INSERT INTO discussion_last_read (discussion_id, user_id, last_read_at)
    VALUES (?,?,?)
    ON CONFLICT(discussion_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at
  `, [discussionId, userId, new Date().toISOString()]);
}

/**
 * Mark EVERY group the user belongs to as read up to now — one click
 * zeroes the sidebar badge and all chat-list badges at once.
 * Returns how many groups had unread messages before the sweep.
 */
export async function markAllDiscussionsRead(userId: string): Promise<number> {
  await init();
  const now = new Date().toISOString();
  const affected = (await one<any>(`
    SELECT COUNT(*) AS c FROM discussion_last_read lr
    JOIN discussion_members dm ON dm.discussion_id = lr.discussion_id AND dm.user_id = lr.user_id
    WHERE lr.user_id = ?
  `, [userId])) as any;
  await run(`
    INSERT INTO discussion_last_read (discussion_id, user_id, last_read_at)
    SELECT dm.discussion_id, ?, ?
    FROM discussion_members dm
    WHERE dm.user_id = ?
    ON CONFLICT(discussion_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at
  `, [userId, now, userId]);
  return Number(affected?.c || 0);
}

/**
 * Sum of the user's unread messages across ALL their groups in one query —
 * powers the sidebar tab badge. Own messages never count as unread.
 */
export async function totalUnreadCount(userId: string): Promise<number> {
  await init();
  const row = (await one<any>(`
    SELECT COALESCE(SUM((
      SELECT COUNT(*) FROM discussion_messages m
      WHERE m.discussion_id = dm.discussion_id
        AND m.author_id != ?
        AND m.created_at > COALESCE((
          SELECT lr.last_read_at FROM discussion_last_read lr
          WHERE lr.discussion_id = dm.discussion_id AND lr.user_id = ?
        ), '1970-01-01')
    )), 0) AS total
    FROM discussion_members dm
    WHERE dm.user_id = ?
  `, [userId, userId, userId])) as any;
  return Number(row?.total || 0);
}

/**
 * Unread SHARED-SNAPSHOT counts per origin tab ('dashboard' / 'reports'):
 * snapshot messages posted after the user's last_read_at that others sent —
 * powers the mini badges on the Dashboards & Reports sidebar tabs.
 */
export async function snapshotUnreadBySource(userId: string): Promise<{ dashboard: number; reports: number }> {
  await init();
  const rset = await rows<{ src: string; c: number }>(`
    SELECT m.snapshot_source AS src, COUNT(*) AS c
    FROM discussion_messages m
    JOIN discussion_members dm ON dm.discussion_id = m.discussion_id AND dm.user_id = ?
    LEFT JOIN discussion_last_read lr ON lr.discussion_id = m.discussion_id AND lr.user_id = ?
    WHERE m.snapshot_source IS NOT NULL
      AND m.author_id != ?
      AND m.created_at > COALESCE(lr.last_read_at, '1970-01-01')
    GROUP BY m.snapshot_source
  `, [userId, userId, userId]);
  const out = { dashboard: 0, reports: 0 };
  for (const r of rset) {
    if (r.src === 'dashboard') out.dashboard = r.c;
    else if (r.src === 'reports') out.reports = r.c;
  }
  return out;
}

/** Lightweight chat-list feed: last message preview WITHOUT image payloads. */
export async function listChatSummaries(userId: string): Promise<{ mine: DiscussionSummary[]; discoverable: DiscussionSummary[] }> {
  const { mine } = await listDiscussionsForUser(userId);
  // Strip heavy image data — the list only needs a flag that an image exists
  const light = mine.map(d => ({
    ...d,
    lastMessage: d.lastMessage
      ? { ...d.lastMessage, imageData: d.lastMessage.imageData ? '__IMAGE__' : null }
      : null,
  }));
  return { mine: light, discoverable: [] };
}

/** Find a user by id or email — used for the invite flow. */
export async function findUserByIdOrEmail(idOrEmail: string): Promise<{ id: string; name: string; email: string } | null> {
  await init();
  const norm = idOrEmail.trim().toLowerCase();
  const row = await one<any>('SELECT id, name, email FROM users WHERE id = ? OR email = ?', [idOrEmail.trim(), norm]);
  return row ? { id: row.id, name: row.name, email: row.email } : null;
}

export interface ContactUser { id: string; name: string; email: string; role: string }

/**
 * Privacy-scoped directory: the user's own account plus every user who shares
 * at least one discussion group with them (direct or via ownership).
 * Deliberately excludes the global user list — with millions of accounts,
 * nobody should be able to enumerate the platform's users.
 */
export async function listContactsForUser(userId: string): Promise<ContactUser[]> {
  await init();
  const rset = await rows<any>(`
    SELECT DISTINCT u.id, u.name, u.email, u.role
    FROM users u
    WHERE u.id = ?
       OR u.id IN (
         SELECT dm2.user_id
         FROM discussion_members dm1
         JOIN discussion_members dm2 ON dm2.discussion_id = dm1.discussion_id
         WHERE dm1.user_id = ?
       )
       OR u.id IN (
         SELECT d.created_by
         FROM discussion_members dm
         JOIN discussions d ON d.id = dm.discussion_id
         WHERE dm.user_id = ?
       )
    ORDER BY (u.id = ?) DESC, u.name
  `, [userId, userId, userId, userId]);
  return rset.map(r => ({ id: r.id, name: r.name, email: r.email, role: r.role }));
}

// ---------------------------------------------------------------------------
// Real-time fan-out (Server-Sent Events)
// ---------------------------------------------------------------------------
export type DiscussionEventType = 'message' | 'members' | 'deleted' | 'updated' | 'typing';

export interface DiscussionEvent {
  type: DiscussionEventType;
  discussionId: string;
  /** For 'message' events: the full new message; otherwise null. */
  message?: DiscussionMessage | null;
  /** For 'typing' events: who is typing. */
  userId?: string;
  userName?: string;
  at: string;
}

type SseClient = { userId: string; send: (event: DiscussionEvent) => void };
const sseClients = new Set<SseClient>();

/** Push an event to every member client (member checks fan out concurrently). */
async function publishEvent(event: DiscussionEvent, excludeUserId?: string): Promise<void> {
  await Promise.all(
    [...sseClients].map(async client => {
      if (excludeUserId && client.userId === excludeUserId) return;
      try {
        if (await isMember(event.discussionId, client.userId)) client.send(event);
      } catch {
        sseClients.delete(client);
      }
    })
  );
}

export function addSseClient(userId: string, send: (event: DiscussionEvent) => void): () => void {
  const client: SseClient = { userId, send };
  sseClients.add(client);
  return () => sseClients.delete(client);
}

async function notify(type: DiscussionEventType, discussionId: string, message?: DiscussionMessage | null): Promise<void> {
  await publishEvent({ type, discussionId, message: message ?? null, at: new Date().toISOString() });
}

/** SSE channel reserved for the notifications module (per-user events). */
const userListeners = new Map<string, Set<(unreadCount: number) => void>>();
export function addUserListener(userId: string, fn: (unreadCount: number) => void): () => void {
  if (!userListeners.has(userId)) userListeners.set(userId, new Set());
  userListeners.get(userId)!.add(fn);
  return () => { userListeners.get(userId)?.delete(fn); };
}
export function emitToUser(userId: string, unreadCount: number): void {
  userListeners.get(userId)?.forEach(fn => {
    try { fn(unreadCount); } catch { /* client gone */ }
  });
}

/**
 * Ephemeral typing indicator: NOT persisted anywhere — broadcast only.
 * Sent to all group members except the typist. Clients expire it after ~3s.
 */
export async function broadcastTyping(discussionId: string, userId: string, userName: string): Promise<void> {
  await init();
  if (!(await getDiscussionRow(discussionId))) throw new Error('المجموعة غير موجودة');
  if (!(await isMember(discussionId, userId))) throw new Error('يجب أن تكون عضواً في المجموعة');
  await publishEvent(
    { type: 'typing', discussionId, userId, userName, at: new Date().toISOString() },
    userId // don't echo back to the typist
  );
}

// ---------------------------------------------------------------------------
// Invite links — the ONLY way for a non-member to reach a private group.
// Owner generates a secret code; holder may join if valid, unrevoked and
// under its usage cap. Codes can be revoked by the owner at any time.
// ---------------------------------------------------------------------------
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function createInvite(discussionId: string, byUserId: string, maxUses?: number): Promise<{ code: string; expiresAt: string }> {
  await init();
  if (!(await isModerator(discussionId, byUserId))) throw new Error('فقط المالك أو المشرفون يمكنهم إنشاء روابط دعوة');
  const code = crypto.randomBytes(16).toString('base64url'); // 128-bit secret
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();
  await run(
    'INSERT INTO discussion_invites (code, discussion_id, created_by, created_at, expires_at, max_uses) VALUES (?,?,?,?,?,?)',
    [code, discussionId, byUserId, new Date().toISOString(), expiresAt, maxUses && maxUses > 0 ? maxUses : null]
  );
  return { code, expiresAt };
}

export async function revokeInvite(discussionId: string, code: string, byUserId: string): Promise<void> {
  await init();
  if (!(await isModerator(discussionId, byUserId))) throw new Error('فقط المالك أو المشرفون يمكنهم إلغاء روابط الدعوة');
  const affected = await run('UPDATE discussion_invites SET revoked = 1 WHERE code = ? AND discussion_id = ?', [code, discussionId]);
  if (affected === 0) throw new Error('رابط الدعوة غير موجود');
}

export interface InviteInfo { discussionName: string; discussionId: string; valid: boolean; reason?: string }

/** Preview an invite code WITHOUT joining — used by the join page. */
export async function peekInvite(code: string): Promise<InviteInfo> {
  await init();
  const row = await one<any>('SELECT * FROM discussion_invites WHERE code = ?', [String(code || '')]);
  if (!row) return { discussionName: '', discussionId: '', valid: false, reason: 'رابط الدعوة غير صالح' };
  const disc = await getDiscussionRow(row.discussion_id);
  if (!disc) return { discussionName: '', discussionId: '', valid: false, reason: 'المجموعة لم تعد موجودة' };
  if (row.revoked) return { discussionName: disc.name, discussionId: disc.id, valid: false, reason: 'تم إلغاء رابط الدعوة' };
  if (new Date(row.expires_at) <= new Date()) return { discussionName: disc.name, discussionId: disc.id, valid: false, reason: 'انتهت صلاحية رابط الدعوة' };
  if (row.max_uses != null && row.use_count >= row.max_uses) return { discussionName: disc.name, discussionId: disc.id, valid: false, reason: 'تم استهلاك رابط الدعوة' };
  return { discussionName: disc.name, discussionId: disc.id, valid: true };
}

export async function joinViaInvite(code: string, userId: string, userName: string): Promise<{ discussionId: string; discussionName: string }> {
  await init();
  const info = await peekInvite(code);
  if (!info.valid) throw new Error(info.reason || 'رابط الدعوة غير صالح');
  const row = await one<any>('SELECT * FROM discussion_invites WHERE code = ?', [String(code || '')]);
  if (!(await isMember(info.discussionId, userId))) {
    await addMember(info.discussionId, userId);
    await run('UPDATE discussion_invites SET use_count = use_count + 1 WHERE code = ?', [row.code]);
    // Welcome notification to the group
    await run(
      'INSERT INTO discussion_messages (id, discussion_id, author_id, author_name, body, created_at) VALUES (?,?,?,?,?,?)',
      [uid('msg'), info.discussionId, userId, userName, 'انضم إلى المجموعة 👋', new Date().toISOString()]
    );
    await touchDiscussion(info.discussionId);
  }
  return { discussionId: info.discussionId, discussionName: info.discussionName };
}

export async function listInvites(discussionId: string, byUserId: string): Promise<{ code: string; createdAt: string; expiresAt: string; useCount: number; maxUses: number | null; revoked: boolean }[]> {
  await init();
  if (!(await isModerator(discussionId, byUserId))) throw new Error('فقط المالك أو المشرفون يمكنهم عرض روابط الدعوة');
  const rset = await rows<any>(
    'SELECT code, created_at, expires_at, use_count, max_uses, revoked FROM discussion_invites WHERE discussion_id = ? ORDER BY created_at DESC',
    [discussionId]
  );
  return rset.map(r => ({
    code: r.code, createdAt: r.created_at, expiresAt: r.expires_at,
    useCount: r.use_count, maxUses: r.max_uses, revoked: !!r.revoked,
  }));
}
