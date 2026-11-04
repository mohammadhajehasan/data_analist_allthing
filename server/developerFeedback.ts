/**
 * تواصل مع المطور — التقييمات وطلبات الاقتراحات.
 *
 * تدفق كامل:
 *   1) المستخدم يقيّم المنصّة (1..5) ويعلّق ويكتب اقتراحاً — يخزَّن في developer_feedback.
 *   2) الأدمن يرى "صفحة طلبات الاقتراحات": قائمة الاقتراحات + لوحة رضا العملاء
 *      (متوسط التقييم، توزيع النجوم، نسبة الرضا).
 *   3) الأدمن يرد على الاقتراح: يُؤرشَف السجل في developer_feedback_replies،
 *      يصل الرد للمستخدم كتنبيه، ثم يُحذَف الاقتراح نهائياً من قائمة الانتظار.
 *
 * الردود المؤرشفة تبقى مرئية للمستخدم فوراً من صفحة "تواصل مع المطور".
 */
import crypto from 'crypto';
import { rows, one, run, ensureSchema, turso } from './turso';
import { pushNotification } from './notifications';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS developer_feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  suggestion TEXT,
  created_at TEXT NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS idx_devfeedback_created ON developer_feedback(created_at)`,
  `CREATE TABLE IF NOT EXISTS developer_feedback_replies (
  id TEXT PRIMARY KEY,
  feedback_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  rating INTEGER NOT NULL,
  comment TEXT,
  suggestion TEXT,
  admin_reply TEXT NOT NULL,
  replied_at TEXT NOT NULL
)`,
  `CREATE INDEX IF NOT EXISTS idx_devreplies_user ON developer_feedback_replies(user_id, replied_at)`,
];

let schemaReady: Promise<void> | null = null;
function init(): Promise<void> {
  schemaReady ??= ensureSchema(turso(), SCHEMA).catch(err => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

export interface DeveloperFeedback {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  rating: number;
  comment: string | null;
  suggestion: string | null;
  createdAt: string;
}

export interface FeedbackReply {
  id: string;
  feedbackId: string;
  userId: string;
  userName: string;
  userEmail: string;
  rating: number;
  comment: string | null;
  suggestion: string | null;
  adminReply: string;
  repliedAt: string;
}

function uid(p: string): string {
  return `${p}-${crypto.randomUUID().slice(0, 12)}`;
}

/** مستخدم يرسل تقييماً + تعليقاً + اقتراحاً (كل حقول الاختيارية ما عدا التقييم). */
export async function submitDeveloperFeedback(
  user: { id: string; name: string; email: string },
  rating: number,
  comment?: string,
  suggestion?: string
): Promise<DeveloperFeedback> {
  await init();
  const n = Math.floor(Number(rating));
  if (!Number.isFinite(n) || n < 1 || n > 5) throw new Error('التقييم يجب أن يكون نجمة واحدة إلى خمس');
  const id = uid('dfb');
  const now = new Date().toISOString();
  await run(
    'INSERT INTO developer_feedback (id, user_id, user_name, user_email, rating, comment, suggestion, created_at) VALUES (?,?,?,?,?,?,?,?)',
    [id, user.id, user.name, user.email, n, (comment || '').trim() || null, (suggestion || '').trim() || null, now]
  );
  return { id, userId: user.id, userName: user.name, userEmail: user.email, rating: n, comment: (comment || '').trim() || null, suggestion: (suggestion || '').trim() || null, createdAt: now };
}

/** الاقتراحات المعلّقة — "صفحة طلبات الاقتراحات" عند الأدمن. */
export async function listPendingFeedback(limit = 200): Promise<DeveloperFeedback[]> {
  await init();
  const rset = await rows<any>('SELECT * FROM developer_feedback ORDER BY created_at DESC LIMIT ?', [limit]);
  return rset.map(r => ({
    id: r.id, userId: r.user_id, userName: r.user_name, userEmail: r.user_email,
    rating: Number(r.rating), comment: r.comment, suggestion: r.suggestion, createdAt: r.created_at,
  }));
}

/** اقتراحات المستخدم نفسه المعلّقة (يراها من صفحة التواصل). */
export async function listMyPendingFeedback(userId: string, limit = 50): Promise<DeveloperFeedback[]> {
  await init();
  const rset = await rows<any>('SELECT * FROM developer_feedback WHERE user_id = ? ORDER BY created_at DESC LIMIT ?', [userId, limit]);
  return rset.map(r => ({
    id: r.id, userId: r.user_id, userName: r.user_name, userEmail: r.user_email,
    rating: Number(r.rating), comment: r.comment, suggestion: r.suggestion, createdAt: r.created_at,
  }));
}

/**
 * الأدمن يرد على اقتراح: أرشفة السجل كاملاً + إشعار للمستخدم برد الإدارة +
 * حذف نهائي للاقتراح من جدول الانتظار (خيار الحذف التلقائي بعد الرد).
 */
export async function replyToFeedback(feedbackId: string, adminReply: string, adminName: string): Promise<{ userId: string }> {
  await init();
  const text = String(adminReply || '').trim();
  if (!text) throw new Error('نص الرد مطلوب');
  const fb = await one<any>('SELECT * FROM developer_feedback WHERE id = ?', [feedbackId]);
  if (!fb) throw new Error('الاقتراح غير موجود أو تم الرد عليه مسبقاً');

  const replyId = uid('drp');
  const now = new Date().toISOString();
  await run(
    'INSERT INTO developer_feedback_replies (id, feedback_id, user_id, user_name, user_email, rating, comment, suggestion, admin_reply, replied_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [replyId, fb.id, fb.user_id, fb.user_name, fb.user_email, Number(fb.rating), fb.comment, fb.suggestion, text, now]
  );
  await run('DELETE FROM developer_feedback WHERE id = ?', [feedbackId]); // حذف تلقائي نهائي

  const preview = (fb.suggestion || fb.comment || '').slice(0, 80);
  await pushNotification(
    fb.user_id,
    'info',
    'رد الإدارة على اقتراحك',
    `${adminName}: ${text.slice(0, 140)}` + (preview ? ` — عن: «${preview}»` : ''),
    { feedbackId, replyId, reply: text, rating: Number(fb.rating), suggested: fb.suggestion, comment: fb.comment }
  );
  return { userId: fb.user_id };
}

/** ردود الإدارة التي وصلت لمستخدم معيّن — تظهر في صفحة "تواصل مع المطور". */
export async function listMyFeedbackReplies(userId: string, limit = 50): Promise<FeedbackReply[]> {
  await init();
  const rset = await rows<any>('SELECT * FROM developer_feedback_replies WHERE user_id = ? ORDER BY replied_at DESC LIMIT ?', [userId, limit]);
  return rset.map(r => ({
    id: r.id, feedbackId: r.feedback_id, userId: r.user_id, userName: r.user_name, userEmail: r.user_email,
    rating: Number(r.rating), comment: r.comment, suggestion: r.suggestion, adminReply: r.admin_reply, repliedAt: r.replied_at,
  }));
}

export interface RatingStats {
  total: number;
  average: number;
  satisfactionPct: number;    // نسبة الرضا = (4..5) / الكل
  distribution: number[];    // عدد التقييمات لكل نجمة [1..5]
  pending: number;           // اقترارات بانتظار الرد
}

/** إحصاءات الرضا — من التقييمات المعلّقة + الأرشيف المؤرشف (لكل التاريخ دون تكرار). */
export async function ratingStats(): Promise<RatingStats> {
  await init();
  const [pendingRows, archivedRows] = await Promise.all([
    rows<{ rating: number }>('SELECT rating FROM developer_feedback'),
    rows<{ rating: number }>('SELECT rating FROM developer_feedback_replies'),
  ]);
  const all = [...pendingRows, ...archivedRows].map(r => Number(r.rating)).filter(r => r >= 1 && r <= 5);
  const total = all.length;
  const dist = [1, 2, 3, 4, 5].map(s => all.filter(r => r === s).length);
  const satisfied = dist[3] + dist[4];
  const pendingQty = Number((((await one<any>('SELECT COUNT(*) AS c FROM developer_feedback')) as any)?.c) || 0);
  return {
    total,
    average: total ? Math.round((all.reduce((a, b) => a + b, 0) / total) * 100) / 100 : 0,
    satisfactionPct: total ? Math.round((satisfied / total) * 100) : 0,
    distribution: dist,
    pending: pendingQty,
  };
}
