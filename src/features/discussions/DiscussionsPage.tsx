/**
 * Group Discussions — WhatsApp-style groups for the analytics team.
 * - Left pane: my groups (chat list with last message) + discoverable groups
 * - Right pane: message thread with polling refresh, invite members modal
 * - Group owner can invite / remove members and delete the group
 * Talks to /api/discussions/* with the Bearer session token.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageSquare, Users, Plus, Send, UserPlus, Crown, Trash2, LogOut,
  Search, X, Loader2, Inbox, ImagePlus, Mail, RefreshCw, Shield, ShieldOff, Bell, BellOff, CheckCheck,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getStoredToken } from '../auth/LoginPage';
import { InviteLinkModal } from '../../components/discussions/InviteLinkModal';
import { DISCUSSIONS_BADGE_EVENT } from '../../components/layout/DiscussionsBadge';

interface MemberRef { id: string; name: string; role: 'owner' | 'moderator' | 'member' }
interface Discussion {
  id: string; name: string; topic: string | null;
  createdBy: string; createdAt: string; updatedAt: string;
  members: MemberRef[]; memberCount: number; messageCount: number;
  lastMessage: { body: string; authorName: string; createdAt: string; imageData: string | null } | null;
  isMember: boolean; isOwner: boolean; isModerator: boolean; unreadCount: number;
  sendPolicy: 'everyone' | 'moderators_only';
}
interface Message {
  id: string; discussionId: string; authorId: string;
  authorName: string; body: string; imageData: string | null; createdAt: string;
}

const AUTH_TOKEN_KEY = 'carbon_auth_token';

function authHeaders(): Record<string, string> {
  const token = getStoredToken() || (() => { try { return localStorage.getItem(AUTH_TOKEN_KEY); } catch { return null; } })();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Nudge the sidebar unread badge to re-fetch (after read/send/delete). */
function bumpDiscussionsBadge(): void {
  try { window.dispatchEvent(new Event(DISCUSSIONS_BADGE_EVENT)); } catch { /* non-fatal */ }
}

function timeAgo(iso: string, isAr: boolean): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return isAr ? 'الآن' : 'now';
  if (mins < 60) return isAr ? `قبل ${mins} د` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return isAr ? `قبل ${hours} س` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return isAr ? `قبل ${days} ي` : `${days}d`;
}

export const DiscussionsPage: React.FC = () => {
  const { user, toast, language } = useApp();
  const isAr = language === 'ar';

  // Privacy-scoped directory: self + users who share a group with me
  const [contacts, setContacts] = useState<{ id: string; name: string; email: string; role: string }[]>([]);

  const [discussions, setDiscussions] = useState<{ mine: Discussion[]; discoverable: Discussion[] }>({ mine: [], discoverable: [] }); // discoverable always empty — members-only model
  // Suppress unused warning while keeping the shape for API compatibility
  void discussions.discoverable;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Create-group modal state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTopic, setNewTopic] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // Invite-members modal state
  const [showInvite, setShowInvite] = useState(false);

  // Load the group's pending invites whenever the invite modal opens
  useEffect(() => {
    if (showInvite) loadGroupPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInvite]);
  const [inviteSelected, setInviteSelected] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);

  // Secret invite-links modal (owner)
  const [showInviteLinks, setShowInviteLinks] = useState(false);

  // Direct invite by email (typed into the invite modal)
  const [inviteEmail, setInviteEmail] = useState('');
  const [sendingEmailInvite, setSendingEmailInvite] = useState(false);

  // Pending (unanswered) invites of the open group — owner manages them
  const [groupPending, setGroupPending] = useState<{ id: string; toName: string; toEmail: string; createdAt: string; invitedByMe: boolean }[]>([]);
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null);

  const loadGroupPending = useCallback(async () => {
    if (!activeIdRef.current) { setGroupPending([]); return; }
    try {
      const res = await fetch(`/api/discussions/${activeIdRef.current}/pending-invites`, { headers: authHeaders() });
      const data = await res.json();
      setGroupPending(res.ok ? (data.invites || []) : []);
    } catch { setGroupPending([]); }
  }, []);

  const cancelPendingInvite = async (inviteId: string) => {
    if (!activeIdRef.current) return;
    setBusyInviteId(inviteId);
    try {
      const res = await fetch(`/api/discussions/${activeIdRef.current}/pending-invites/${inviteId}/cancel`, {
        method: 'POST', headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل الإلغاء');
      toast.success(isAr ? 'أُلغيت الدعوة' : 'Invite cancelled');
      await loadGroupPending();
    } catch (err: any) {
      toast.error(isAr ? 'خطأ' : 'Error', err.message);
    } finally {
      setBusyInviteId(null);
    }
  };

  const resendPendingInvite = async (inviteId: string) => {
    if (!activeIdRef.current) return;
    setBusyInviteId(inviteId);
    try {
      const res = await fetch(`/api/discussions/${activeIdRef.current}/pending-invites/${inviteId}/resend`, {
        method: 'POST', headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إعادة الإرسال');
      toast.success(isAr ? 'أُعيد إرسال الدعوة' : 'Invite resent',
        isAr ? 'وصل المدعو تذكير جديد بالدعوة' : 'The invitee received a fresh reminder');
    } catch (err: any) {
      toast.error(isAr ? 'خطأ' : 'Error', err.message);
    } finally {
      setBusyInviteId(null);
    }
  };

  /** Invite a specific account by email — sends a pending invite notification. */
  const inviteByEmail = async () => {
    const email = inviteEmail.trim();
    if (!email || !active) return;
    setSendingEmailInvite(true);
    try {
      const res = await fetch(`/api/discussions/${active.id}/invite-user`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إرسال الدعوة');
      toast.success(
        isAr ? 'أُرسلت الدعوة' : 'Invite sent',
        isAr ? `وُجّه إشعار دعوة إلى ${email} — يُضاف للمجموعة بعد قبوله` : `An invite notification was sent to ${email}`
      );
      setInviteEmail('');
      await refresh();
      await refreshContacts();
    } catch (err: any) {
      toast.error(isAr ? 'خطأ' : 'Error', err.message);
    } finally {
      setSendingEmailInvite(false);
    }
  };

  /** Invite an UNREGISTERED person by email: SMTP if configured, manual link otherwise. */
  const inviteNewUserByEmail = async () => {
    const email = inviteEmail.trim();
    if (!email || !active) return;
    setSendingEmailInvite(true);
    try {
      const res = await fetch(`/api/discussions/${active.id}/invite-email`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إنشاء الدعوة');
      if (data.emailSent) {
        toast.success(
          isAr ? 'أُرسل البريد' : 'Email sent',
          isAr ? `أُرسلت دعوة إلى ${email} — يسجّل بنفس البريد ويُضاف تلقائياً` : `Invitation emailed to ${email} — they join automatically on signup`
        );
      } else {
        toast.info(
          isAr ? 'رابط الدعوة جاهز' : 'Invite link ready',
          (isAr ? 'بريد SMTP غير مُعد — شارك الرابط: ' : 'SMTP not configured — share this link: ') + data.inviteUrl
        );
      }
      setInviteEmail('');
      await refresh();
      await refreshContacts();
    } catch (err: any) {
      toast.error(isAr ? 'خطأ' : 'Error', err.message);
    } finally {
      setSendingEmailInvite(false);
    }
  };

  const [filter, setFilter] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Mirror of activeId so the stable SSE subscription always sees the open group
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  const active = discussions.mine.find(d => d.id === activeId) || null;

  const refresh = useCallback(async () => {
    try {
      // light=1: no image payloads in lastMessage → fast chat list
      const res = await fetch('/api/discussions?light=1', { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تحميل المناقشات');
      setDiscussions(data);
    } catch (err: any) {
      toast.error(isAr ? 'خطأ' : 'Error', err.message);
    }
  }, [toast, isAr]);

  /** Mark the open group as read — resets its unread badge instantly. */
  const markActiveRead = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/discussions/${id}/read`, { method: 'POST', headers: authHeaders() });
      const data = await res.json();
      if (res.ok && data.unreadByGroup) {
        // Patch badges locally (no refetch needed)
        setDiscussions(prev => ({
          ...prev,
          mine: prev.mine.map(g => ({ ...g, unreadCount: data.unreadByGroup[g.id] ?? 0 })),
        }));
      }
      bumpDiscussionsBadge();
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const refreshContacts = useCallback(async () => {
    try {
      const res = await fetch('/api/users/contacts', { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تحميل جهات الاتصال');
      setContacts(data.contacts || []);
    } catch { /* non-fatal — pickers simply stay empty */ }
  }, []);

  useEffect(() => { refreshContacts(); }, [refreshContacts]);

  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const messagesScrollRef = useRef<HTMLDivElement>(null);

  /** Load the latest page of messages (fast: 50 messages max). */
  const loadMessages = useCallback(async (id: string) => {
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/discussions/${id}/messages?limit=50`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تحميل الرسائل');
      setMessages(data.messages || []);
      setHasOlder(!!data.hasOlder);
    } catch (err: any) {
      toast.error(isAr ? 'خطأ' : 'Error', err.message);
    } finally {
      setLoadingMessages(false);
    }
  }, [toast, isAr]);

  /** Infinite scroll-up: prepend the next older page, preserving scroll position. */
  // Deep-link: notification clicks / sidebar badges dispatch this event
  // with a group id — open that group's conversation directly.
  useEffect(() => {
    const openGroup = (e: Event) => {
      const gid = (e as CustomEvent<string>).detail;
      if (!gid) return;
      setActiveId(gid);
      loadMessages(gid);
      markActiveRead(gid);
    };
    window.addEventListener('carbon-open-discussion', openGroup as EventListener);
    return () => window.removeEventListener('carbon-open-discussion', openGroup as EventListener);
  }, [loadMessages, markActiveRead]);

  const loadOlderMessages = useCallback(async () => {
    const id = activeIdRef.current;
    const oldest = messages[0];
    if (!id || !oldest || loadingOlder || !hasOlder) return;
    setLoadingOlder(true);
    const el = messagesScrollRef.current;
    const prevHeight = el?.scrollHeight || 0;
    const prevTop = el?.scrollTop || 0;
    try {
      const res = await fetch(`/api/discussions/${id}/messages?limit=50&before=${encodeURIComponent(oldest.createdAt)}`, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تحميل الرسائل الأقدم');
      setMessages(prev => {
        const known = new Set(prev.map(m => m.id));
        return [...(data.messages || []).filter((m: Message) => !known.has(m.id)), ...prev];
      });
      setHasOlder(!!data.hasOlder);
      // Keep the viewport anchored on the same content after prepend
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight + prevTop;
      });
    } catch (err: any) {
      toast.error(isAr ? 'خطأ' : 'Error', err.message);
    } finally {
      setLoadingOlder(false);
    }
  }, [messages, loadingOlder, hasOlder, toast, isAr]);

  // ---- Typing indicator state ----
  const [typingUsers, setTypingUsers] = useState<Record<string, { name: string; since: number }>>({});
  const lastTypingSentRef = useRef(0);
  const typingTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  /** Fire-and-forget typing signal, throttled to once per 3s while typing. */
  const signalTyping = useCallback(() => {
    if (!activeIdRef.current) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 3000) return;
    lastTypingSentRef.current = now;
    const token = getStoredToken();
    fetch(`/api/discussions/${activeIdRef.current}/typing`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).catch(() => {});
  }, []);

  // Clean up typing-expiry timers on unmount
  useEffect(() => () => {
    Object.values(typingTimeoutsRef.current).forEach(clearTimeout);
  }, []);

  const markUserTyping = useCallback((userId: string, name: string) => {
    setTypingUsers(prev => ({ ...prev, [userId]: { name, since: Date.now() } }));
    // Auto-expire after 3.5s of silence
    const prevTimer = typingTimeoutsRef.current[userId];
    if (prevTimer) clearTimeout(prevTimer);
    typingTimeoutsRef.current[userId] = setTimeout(() => {
      setTypingUsers(prev => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    }, 3500);
  }, []);

  // ---- Real-time stream (SSE) — replaces the old 5s polling ----
  const sseReconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markUserTypingRef = useRef(markUserTyping);
  useEffect(() => { markUserTypingRef.current = markUserTyping; }, [markUserTyping]);
  // True while the realtime stream is down — a visible fallback poller takes over
  const [streamDown, setStreamDown] = useState(false);
  const [manualRefreshing, setManualRefreshing] = useState(false);

  /** Manual refresh button: instantly reloads messages + chat list. */
  const manualRefresh = useCallback(async () => {
    setManualRefreshing(true);
    try {
      await Promise.all([refresh(), activeIdRef.current ? loadMessages(activeIdRef.current) : Promise.resolve()]);
    } finally {
      // Brief spin so the user sees the action happened even on instant responses
      setTimeout(() => setManualRefreshing(false), 400);
    }
  }, [refresh, loadMessages]);

  useEffect(() => {
    let es: EventSource | null = null;
    let closed = false;

    const connect = () => {
      const token = getStoredToken();
      if (!token) return;
      es = new EventSource(`/api/discussions/stream?token=${encodeURIComponent(token)}`);

      es.addEventListener('connected', () => {
        setStreamDown(false);
        // Backfill anything missed while disconnected
        refresh();
        refreshContacts();
        if (activeIdRef.current) loadMessages(activeIdRef.current);
      });

      es.addEventListener('message', (ev: MessageEvent) => {
        try {
          const event = JSON.parse(ev.data);
          const msg = event.message as Message | undefined;
          if (!msg) return;
          if (msg.discussionId === activeIdRef.current) {
            // Open group: append + mark read immediately (badge stays at 0)
            setMessages(prev => (prev.some(m => m.id === msg.id) ? prev : [...prev, msg]));
            markActiveRead(msg.discussionId);
          } else {
            // Background group: bump its badge locally, no request needed
            setDiscussions(prev => ({
              ...prev,
              mine: prev.mine.map(g =>
                g.id === msg.discussionId
                  ? { ...g, unreadCount: g.unreadCount + 1, lastMessage: { body: msg.body, authorName: msg.authorName, createdAt: msg.createdAt, imageData: msg.imageData } }
                  : g
              ),
            }));
          }
          // Refresh chat list (last message preview + ordering) for all cases
          refresh();
        } catch { /* malformed event — ignore */ }
      });

      es.addEventListener('members', () => {
        // Membership changed (invite/remove) — reload header + lists + contacts
        refresh();
        refreshContacts();
        if (activeIdRef.current) loadMessages(activeIdRef.current);
      });

      es.addEventListener('typing', (ev: MessageEvent) => {
        try {
          const event = JSON.parse(ev.data);
          if (event.discussionId === activeIdRef.current && event.userId) {
            markUserTypingRef.current(event.userId, event.userName || '...');
          }
        } catch { /* malformed event — ignore */ }
      });

      es.addEventListener('deleted', () => {
        refresh();
        setActiveId(null);
      });

      es.onerror = () => {
        es?.close();
        setStreamDown(true);
        if (!closed) {
          // Bounded exponential-ish backoff reconnect
          sseReconnectTimer.current = setTimeout(connect, 3000);
        }
      };
    };

    connect();
    return () => {
      closed = true;
      if (sseReconnectTimer.current) clearTimeout(sseReconnectTimer.current);
      es?.close();
    };
  }, [refresh, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ---- Safety net while the stream is down: lightweight polling ----
  // (only chat list + message page — both are fast, no image-heavy full refetch)
  useEffect(() => {
    if (!streamDown) return;
    const id = setInterval(() => {
      refresh();
      if (activeIdRef.current) loadMessages(activeIdRef.current);
    }, 5000);
    return () => clearInterval(id);
  }, [streamDown, refresh, loadMessages]);

  // Tab focus / visibility: backfill immediately when the user returns
  useEffect(() => {
    const onFocus = () => { if (!streamDown) manualRefresh(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [streamDown, manualRefresh]);

  const send = async () => {
    const body = draft.trim();
    if ((!body && !pendingImage) || !activeId) return;
    setSending(true);
    try {
      const res = await fetch(`/api/discussions/${activeId}/messages`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, imageData: pendingImage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل الإرسال');
      // Optimistic append; the SSE 'message' event is de-duplicated by id
      setMessages(prev => (prev.some(m => m.id === data.message.id) ? prev : [...prev, data.message]));
      setDraft('');
      setPendingImage(null);
      bumpDiscussionsBadge();
    } catch (err: any) {
      toast.error(isAr ? 'خطأ' : 'Error', err.message);
    } finally {
      setSending(false);
    }
  };

  /** Read a picked image file, downscale to ≤1280px wide PNG, stage as pendingImage. */
  const onPickImage = async (file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.warning(isAr ? 'تنبيه' : 'Warning', isAr ? 'الملف ليس صورة' : 'Not an image file');
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('فشل قراءة الملف'));
        reader.readAsDataURL(file);
      });
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('صورة غير صالحة'));
        img.src = dataUrl;
      });
      const maxW = 1280;
      const scale = Math.min(1, maxW / img.naturalWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      setPendingImage(canvas.toDataURL('image/png'));
    } catch (err: any) {
      toast.error(isAr ? 'خطأ' : 'Error', err.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const createGroup = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/discussions', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, topic: newTopic, memberIds: selectedUsers }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إنشاء المجموعة');
      setShowCreate(false);
      setNewName(''); setNewTopic(''); setSelectedUsers([]);
      if (data.failed?.length) {
        toast.warning(isAr ? 'تنبيه' : 'Warning',
          isAr ? `تم الإنشاء، لكن تعذّرت دعوة: ${data.failed.map((f: any) => f.target).join(', ')}` : `Created, but invites failed for: ${data.failed.map((f: any) => f.target).join(', ')}`);
      } else {
        toast.success(isAr ? 'تم الإنشاء' : 'Created', isAr ? 'تم إنشاء المجموعة ودعوة الأعضاء' : 'Group created and members invited');
      }
      await refresh();
      await refreshContacts(); // new members are now contacts
      if (data.discussion?.id) setActiveId(data.discussion.id);
    } catch (err: any) {
      toast.error(isAr ? 'خطأ' : 'Error', err.message);
    } finally {
      setCreating(false);
    }
  };

  const inviteMembers = async () => {
    if (!active || inviteSelected.length === 0) return;
    setInviting(true);
    try {
      // Send a PENDING invitation per selected contact — they accept/reject
      // from their notification; membership happens only on acceptance.
      const results = await Promise.allSettled(
        inviteSelected.map(uid =>
          fetch(`/api/discussions/${active.id}/invite-user`, {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: uid }),
          }).then(r => r.json().then(d => ({ ok: r.ok, d })))
        )
      );
      const sent = results.filter(r => r.status === 'fulfilled' && r.value.ok).length;
      const failed = results.filter(r => r.status === 'rejected' || !(r as any).value?.ok);
      setShowInvite(false);
      setInviteSelected([]);
      if (sent > 0) {
        toast.success(
          isAr ? 'أُرسلت الدعوات' : 'Invites sent',
          isAr ? `أُرسل ${sent} إشعار دعوة — يضاف العضو بعد قبوله` : `${sent} invite notification(s) sent — they join after accepting`
        );
      }
      if (failed.length > 0) {
        const f: any = failed[0];
        const firstErr = f?.value?.d?.error || f?.reason?.message || 'خطأ';
        toast.warning(isAr ? 'بعض الدعوات فشلت' : 'Some invites failed', firstErr);
      }
      await refresh();
      await refreshContacts();
    } catch (err: any) {
      toast.error(isAr ? 'خطأ' : 'Error', err.message);
    } finally {
      setInviting(false);
    }
  };

  const removeMember = async (userId: string) => {
    if (!active) return;
    try {
      const res = await fetch(`/api/discussions/${active.id}/members/${userId}`, { method: 'DELETE', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل الإزالة');
      toast.success(isAr ? 'تمت الإزالة' : 'Removed');
      await refresh();
    } catch (err: any) {
      toast.error(isAr ? 'خطأ' : 'Error', err.message);
    }
  };

  const leaveGroup = async () => {
    if (!active) return;
    try {
      const res = await fetch(`/api/discussions/${active.id}/leave`, { method: 'POST', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل المغادرة');
      setActiveId(null);
      await refresh();
    } catch (err: any) {
      toast.error(isAr ? 'خطأ' : 'Error', err.message);
    }
  };

  /** Owner promotes a member to moderator (invite/manage rights). */
  const promoteMember = async (userId: string) => {
    if (!active) return;
    try {
      const res = await fetch(`/api/discussions/${active.id}/moderators/${userId}`, { method: 'POST', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل التعيين');
      toast.success(isAr ? 'تم تعيين مشرف' : 'Promoted to moderator');
      await refresh();
    } catch (err: any) {
      toast.error(isAr ? 'خطأ' : 'Error', err.message);
    }
  };

  /** One-click: mark every group as read — zeroes the sidebar badge instantly. */
  const markAllRead = async () => {
    const hadUnread = discussions.mine.some(g => g.unreadCount > 0);
    if (!hadUnread) return;
    try {
      const res = await fetch('/api/discussions/read-all', { method: 'POST', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل التعليم');
      // Zero the badges locally — no refetch needed
      setDiscussions(prev => ({
        ...prev,
        mine: prev.mine.map(g => ({ ...g, unreadCount: 0 })),
      }));
      bumpDiscussionsBadge();
      toast.success(isAr ? 'تم تعليم كل الرسائل كمقروءة' : 'All messages marked as read');
    } catch (err: any) {
      toast.error(isAr ? 'خطأ' : 'Error', err.message);
    }
  };

  /** Owner toggles closed-group mode (only owner & moderators can post). */
  const toggleSendPolicy = async () => {
    if (!active) return;
    const next = active.sendPolicy === 'everyone' ? 'moderators_only' : 'everyone';
    try {
      const res = await fetch(`/api/discussions/${active.id}/send-policy`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ policy: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل التبديل');
      toast.success(
        next === 'moderators_only'
          ? (isAr ? 'أُغلقت المجموعة — المشرفون فقط يمكنهم الإرسال' : 'Group closed — only moderators can post')
          : (isAr ? 'فُتحت المجموعة — الجميع يمكنهم الإرسال' : 'Group opened — everyone can post')
      );
      await refresh();
    } catch (err: any) {
      toast.error(isAr ? 'خطأ' : 'Error', err.message);
    }
  };

  /** Owner demotes a moderator back to plain member. */
  const demoteMember = async (userId: string) => {
    if (!active) return;
    try {
      const res = await fetch(`/api/discussions/${active.id}/moderators/${userId}`, { method: 'DELETE', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إلغاء الإشراف');
      toast.success(isAr ? 'أُلغي الإشراف' : 'Moderator removed');
      await refresh();
    } catch (err: any) {
      toast.error(isAr ? 'خطأ' : 'Error', err.message);
    }
  };

  const deleteGroup = async () => {
    if (!active) return;
    try {
      const res = await fetch(`/api/discussions/${active.id}`, { method: 'DELETE', headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل الحذف');
      toast.success(isAr ? 'تم الحذف' : 'Deleted');
      setActiveId(null);
      await refresh();
    } catch (err: any) {
      toast.error(isAr ? 'خطأ' : 'Error', err.message);
    }
  };

  // Invitable contacts: my contact list minus current members of the open group
  const invitableUsers = active
    ? contacts.filter(u => u.id !== user.id && !active.members.some(m => m.id === u.id))
    : contacts.filter(u => u.id !== user.id);

  const filterFn = (d: Discussion) =>
    d.name.toLowerCase().includes(filter.toLowerCase()) ||
    (d.topic || '').toLowerCase().includes(filter.toLowerCase());

  const mine = discussions.mine.filter(filterFn);

  const chatListRow = (d: Discussion) => (
    <button
      key={d.id}
      onClick={() => { setActiveId(d.id); markActiveRead(d.id); }}
      className={`w-full text-start px-3 py-3 rounded-lg transition-colors border ${
        activeId === d.id
          ? 'bg-[#0f62fe]/15 border-[#0f62fe]/50'
          : 'bg-[var(--cds-layer-01,#262626)] border-transparent hover:bg-[var(--cds-layer-02,#161616)] hover:border-[var(--cds-border-subtle,#393939)]'
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 shrink-0 rounded-lg bg-[#0f62fe]/20 border border-[#0f62fe]/40 flex items-center justify-center">
          <Users className="w-4 h-4 text-[#78a9ff]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className={`text-xs truncate ${d.unreadCount > 0 ? 'font-extrabold text-[var(--cds-text-01,#f4f4f4)]' : 'font-bold text-[var(--cds-text-01,#f4f4f4)]'}`}>{d.name}</p>
            <div className="flex items-center gap-1.5 shrink-0">
              {d.unreadCount > 0 && (
                <span
                  className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#da1e28] text-white text-[10px] font-bold flex items-center justify-center"
                  title={isAr ? `${d.unreadCount} رسالة غير مقروءة` : `${d.unreadCount} unread`}
                >
                  {d.unreadCount > 99 ? '99+' : d.unreadCount}
                </span>
              )}
              <span className="text-[10px] text-[var(--cds-text-03,#8d8d8d)]">
                {d.lastMessage ? timeAgo(d.lastMessage.createdAt, isAr) : ''}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {/* Thumbnail of the latest shared image, if any */}
            {d.lastMessage?.imageData && (
              <img
                src={d.lastMessage.imageData}
                alt=""
                className="w-8 h-8 rounded-md object-cover border border-[var(--cds-border-subtle,#393939)] shrink-0"
                loading="lazy"
              />
            )}
            <p className="text-[11px] text-[var(--cds-text-03,#8d8d8d)] truncate flex-1">
              {d.lastMessage
                ? `${d.lastMessage.authorName}: ${
                    d.lastMessage.body || (d.lastMessage.imageData ? (isAr ? '📷 صورة' : '📷 Photo') : '')
                  }`
                : (d.topic || (isAr ? 'لا رسائل بعد' : 'No messages yet'))}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[var(--cds-layer-02,#161616)] text-[var(--cds-text-03,#8d8d8d)]">
              {d.memberCount} {isAr ? 'عضو' : 'members'}
            </span>
            {d.isOwner && (
              <span title={isAr ? 'أنت المالك' : 'You are the owner'}>
                <Crown className="w-3 h-3 text-[#f1c21b]" />
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );

  return (
    <div className="space-y-4" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--cds-text-01,#f4f4f4)] flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[#0f62fe]" />
            {isAr ? 'المناقشات الجماعية' : 'Group Discussions'}
          </h1>
          <p className="text-xs text-[var(--cds-text-03,#8d8d8d)] mt-1">
            {isAr
              ? 'أنشئ مجموعات مثل غروبات واتساب، وادعُ مستخدمي المنصة للنقاش حول البيانات والتقارير'
              : 'Create WhatsApp-style groups and invite platform users to discuss data and reports'}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="h-9 px-4 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-xs font-semibold rounded-lg flex items-center gap-2 shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          {isAr ? 'مجموعة جديدة' : 'New Group'}
        </button>
      </div>

      {/* Main two-pane layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 h-[calc(100vh-280px)] min-h-[480px]">
        {/* Chat list pane */}
        <div className="bg-[var(--cds-layer-02,#161616)] border border-[var(--cds-border-subtle,#393939)] rounded-xl flex flex-col overflow-hidden">
          <div className="p-3 border-b border-[var(--cds-border-subtle,#393939)]">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute top-2.5 start-3 text-[var(--cds-text-03,#8d8d8d)]" />
                <input
                  value={filter} onChange={e => setFilter(e.target.value)}
                  placeholder={isAr ? 'ابحث في المجموعات...' : 'Search groups...'}
                  className="w-full ps-9 pe-3 py-2 text-xs bg-[var(--cds-layer-01,#262626)] text-[var(--cds-text-01,#f4f4f4)] border border-[var(--cds-border-subtle,#393939)] rounded-lg focus:border-[#0f62fe] focus:outline-hidden"
                />
              </div>
              {discussions.mine.some(g => g.unreadCount > 0) && (
                <button
                  onClick={markAllRead}
                  title={isAr ? 'تعليم كل الرسائل كمقروءة' : 'Mark all as read'}
                  className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-[#78a9ff] hover:bg-[#0f62fe]/15 border border-[var(--cds-border-subtle,#393939)]"
                >
                  <CheckCheck className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {mine.length === 0 && (
              <div className="text-center py-10 px-4">
                <Inbox className="w-8 h-8 mx-auto text-[var(--cds-text-03,#8d8d8d)] mb-2" />
                <p className="text-xs text-[var(--cds-text-03,#8d8d8d)]">
                  {isAr ? 'لا توجد مجموعات بعد — أنشئ مجموعة وادعُ من تريد عبر رابط دعوة خاص' : 'No groups yet — create one and invite people via a private invite link'}
                </p>
              </div>
            )}
            {mine.length > 0 && (
              <>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--cds-text-03,#8d8d8d)] px-2 pt-1 pb-0.5">
                  {isAr ? 'مجموعاتي' : 'My Groups'} ({mine.length})
                </p>
                {mine.map(chatListRow)}
              </>
            )}
          </div>
        </div>

        {/* Conversation pane */}
        <div className="bg-[var(--cds-layer-02,#161616)] border border-[var(--cds-border-subtle,#393939)] rounded-xl flex flex-col overflow-hidden">
          {!active ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <MessageSquare className="w-12 h-12 text-[var(--cds-layer-01,#262626)] mb-3" />
              <p className="text-sm font-semibold text-[var(--cds-text-02,#c6c6c6)]">
                {isAr ? 'اختر مجموعة لبدء المناقشة' : 'Select a group to start discussing'}
              </p>
              <p className="text-xs text-[var(--cds-text-03,#8d8d8d)] mt-1 max-w-xs">
                {isAr ? 'أو أنشئ مجموعة جديدة من الزر أعلاه وادعُ أعضاء الفريق' : 'Or create a new group from the button above and invite team members'}
              </p>
            </div>
          ) : (
            <>
              {/* Conversation header */}
              <div className="px-4 py-3 border-b border-[var(--cds-border-subtle,#393939)] flex items-center justify-between gap-3 bg-[var(--cds-layer-01,#262626)]">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[var(--cds-text-01,#f4f4f4)] flex items-center gap-1.5 truncate">
                    {active.name}
                    {active.isOwner && <Crown className="w-3.5 h-3.5 text-[#f1c21b]" />}
                  </p>
                  <p className="text-[11px] text-[var(--cds-text-03,#8d8d8d)] truncate">
                    {active.members
                      .map(m => `${m.name}${m.role === 'owner' ? ' 👑' : m.role === 'moderator' ? ' 🛡' : ''}`)
                      .join('، ')}
                    {active.topic ? ` — ${active.topic}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={manualRefresh}
                    disabled={manualRefreshing}
                    title={isAr ? 'تحديث الرسائل الآن' : 'Refresh messages now'}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-[#78a9ff] hover:bg-[#0f62fe]/15 border border-[var(--cds-border-subtle,#393939)]"
                  >
                    <RefreshCw className={`w-4 h-4 ${manualRefreshing ? 'animate-spin' : ''}`} />
                  </button>
                  {streamDown && (
                    <span
                      title={isAr ? 'الاتصال المباشر منقطع — جارٍ التحديث كل 5 ثوانٍ' : 'Live stream down — polling every 5s'}
                      className="flex items-center gap-1 text-[10px] text-[#f1c21b] px-2 py-1 rounded-md bg-[#f1c21b]/10 border border-[#f1c21b]/30"
                    >
                      <span className="w-1.5 h-1.5 bg-[#f1c21b] rounded-full animate-pulse" />
                      {isAr ? 'وضع التخزين المؤقت' : 'fallback'}
                    </span>
                  )}
                  {active.isOwner && (
                    <button
                      onClick={toggleSendPolicy}
                      title={
                        active.sendPolicy === 'everyone'
                          ? (isAr ? 'إغلاق المجموعة: المشرفون فقط يمكنهم الإرسال' : 'Close group: only moderators can post')
                          : (isAr ? 'فتح المجموعة: الجميع يمكنهم الإرسال' : 'Open group: everyone can post')
                      }
                      className={`h-8 px-3 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 border transition-colors ${
                        active.sendPolicy === 'moderators_only'
                          ? 'bg-[#f1c21b]/15 text-[#f1c21b] border-[#f1c21b]/40'
                          : 'text-[var(--cds-text-02,#c6c6c6)] border-[var(--cds-border-subtle,#393939)] hover:bg-[var(--cds-layer-02,#161616)]'
                      }`}
                    >
                      {active.sendPolicy === 'moderators_only' ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                      {active.sendPolicy === 'moderators_only' ? (isAr ? 'مغلقة' : 'Closed') : (isAr ? 'مفتوحة' : 'Open')}
                    </button>
                  )}
                  {active.isOwner && (
                    <button
                      onClick={deleteGroup}
                      title={isAr ? 'حذف المجموعة' : 'Delete group'}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-[#ff8389] hover:bg-[#da1e28]/15 border border-transparent hover:border-[#da1e28]/40"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  {(active.isOwner || active.isModerator) && (
                    <button
                      onClick={() => setShowInviteLinks(true)}
                      className="h-8 px-3 text-[11px] font-semibold rounded-lg bg-[#0f62fe] hover:bg-[#0353e9] text-white flex items-center gap-1.5"
                      title={isAr ? 'دعوة أعضاء / إدارة الدعوات' : 'Invite members / manage invites'}
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      {isAr ? 'توجيه دعوة' : 'Invite'}
                    </button>
                  )}
                  {active.isMember && !active.isOwner && (
                    <button
                      onClick={leaveGroup}
                      title={isAr ? 'مغادرة المجموعة' : 'Leave group'}
                      className="h-8 px-3 text-[11px] font-semibold rounded-lg text-[#ff8389] hover:bg-[#da1e28]/15 border border-[var(--cds-border-subtle,#393939)] flex items-center gap-1.5"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      {isAr ? 'مغادرة' : 'Leave'}
                    </button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div
                ref={messagesScrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-3"
                onScroll={e => {
                  const el = e.currentTarget;
                  if (el.scrollTop < 60 && hasOlder && !loadingOlder) loadOlderMessages();
                }}
              >
                {loadingOlder && (
                  <div className="flex justify-center py-2">
                    <Loader2 className="w-4 h-4 animate-spin text-[#78a9ff]" />
                  </div>
                )}
                {loadingMessages && messages.length === 0 && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin text-[#0f62fe]" />
                  </div>
                )}
                {!loadingMessages && messages.length === 0 && (
                  <p className="text-center text-xs text-[var(--cds-text-03,#8d8d8d)] py-8">
                    {isAr ? 'لا رسائل بعد — ابدأ النقاش!' : 'No messages yet — start the discussion!'}
                  </p>
                )}
                {messages.map(msg => {
                  const isMine = msg.authorId === user.id;
                  return (
                    <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl ${
                          isMine
                            ? 'bg-[#0f62fe] text-white rounded-te-sm'
                            : 'bg-[var(--cds-layer-01,#262626)] text-[var(--cds-text-01,#f4f4f4)] border border-[var(--cds-border-subtle,#393939)] rounded-ts-sm'
                        }`}
                      >
                        {!isMine && (
                          <p className="text-[10px] font-bold text-[#78a9ff] mb-1">{msg.authorName}</p>
                        )}
                        {msg.imageData && (
                          <img
                            src={msg.imageData}
                            alt={msg.body || (isAr ? 'لقطة شاشة' : 'screenshot')}
                            loading="lazy"
                            decoding="async"
                            className="rounded-lg mb-1.5 max-h-56 w-auto cursor-zoom-in border border-white/10"
                            onClick={() => window.open(msg.imageData!, '_blank')}
                          />
                        )}
                        {msg.body && (
                          <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">{msg.body}</p>
                        )}
                        <p className={`text-[9px] mt-1 text-end ${isMine ? 'text-white/60' : 'text-[var(--cds-text-03,#8d8d8d)]'}`}>
                          {timeAgo(msg.createdAt, isAr)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Typing indicator strip */}
              {active.isMember && Object.keys(typingUsers).length > 0 && (
                <div className="px-4 py-1.5 text-[11px] text-[#78a9ff] flex items-center gap-2" aria-live="polite">
                  <span className="flex items-center gap-0.5">
                    <span className="w-1.5 h-1.5 bg-[#78a9ff] rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 bg-[#78a9ff] rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 bg-[#78a9ff] rounded-full animate-bounce [animation-delay:300ms]" />
                  </span>
                  <span>
                    {(() => {
                      const names = Object.values(typingUsers).map(u => u.name);
                      if (names.length === 1) return isAr ? `${names[0]} يكتب الآن...` : `${names[0]} is typing...`;
                      if (names.length === 2) return isAr ? `${names[0]} و ${names[1]} يكتبان الآن...` : `${names[0]} and ${names[1]} are typing...`;
                      return isAr ? `${names.length} أعضاء يكتبون الآن...` : `${names.length} people are typing...`;
                    })()}
                  </span>
                </div>
              )}

              {/* Composer */}
              {active.isMember && active.sendPolicy === 'moderators_only' && !active.isOwner && !active.isModerator ? (
                <div className="p-3 border-t border-[var(--cds-border-subtle,#393939)] bg-[var(--cds-layer-01,#262626)] text-center">
                  <p className="text-[11px] text-[#f1c21b] flex items-center justify-center gap-1.5">
                    <BellOff className="w-3.5 h-3.5" />
                    {isAr ? 'المجموعة مغلقة — الإعلانات من المالك والمشرفين فقط' : 'Group is closed — announcements from owner & moderators only'}
                  </p>
                </div>
              ) : active.isMember ? (
                <div className="p-3 border-t border-[var(--cds-border-subtle,#393939)] bg-[var(--cds-layer-01,#262626)]">
                  {pendingImage && (
                    <div className="mb-2 flex items-center gap-2 px-2">
                      <div className="relative">
                        <img src={pendingImage} alt="" className="h-14 rounded-lg border border-[var(--cds-border-subtle,#393939)]" />
                        <button
                          onClick={() => setPendingImage(null)}
                          title={isAr ? 'إزالة الصورة' : 'Remove image'}
                          className="absolute -top-1.5 -end-1.5 w-5 h-5 rounded-full bg-[#da1e28] text-white flex items-center justify-center shadow"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="text-[10px] text-[var(--cds-text-03,#8d8d8d)]">
                        {isAr ? 'سيتم إرسال الصورة مع رسالتك' : 'Image will be sent with your message'}
                      </span>
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={e => onPickImage(e.target.files?.[0])}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      title={isAr ? 'إرفاق لقطة شاشة' : 'Attach a screenshot'}
                      className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-[var(--cds-text-02,#c6c6c6)] hover:text-[#78a9ff] hover:bg-[var(--cds-layer-02,#161616)] border border-[var(--cds-border-subtle,#393939)] transition-colors"
                    >
                      <ImagePlus className="w-4 h-4" />
                    </button>
                    <textarea
                      value={draft}
                      onChange={e => { setDraft(e.target.value); signalTyping(); }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          send();
                        }
                      }}
                      rows={1}
                      placeholder={isAr ? 'اكتب رسالة...' : 'Type a message...'}
                      className="flex-1 resize-none max-h-32 px-3 py-2.5 text-xs bg-[var(--cds-layer-02,#161616)] text-[var(--cds-text-01,#f4f4f4)] border border-[var(--cds-border-subtle,#393939)] rounded-lg focus:border-[#0f62fe] focus:outline-hidden"
                    />
                    <button
                      onClick={send} disabled={(!draft.trim() && !pendingImage) || sending}
                      className="w-10 h-10 shrink-0 rounded-full bg-[#0f62fe] hover:bg-[#0353e9] disabled:opacity-50 text-white flex items-center justify-center transition-colors"
                      aria-label={isAr ? 'إرسال' : 'Send'}
                    >
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 rtl:-scale-x-100" />}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 border-t border-[var(--cds-border-subtle,#393939)] bg-[var(--cds-layer-01,#262626)] text-center">
                  <p className="text-[11px] text-[var(--cds-text-03,#8d8d8d)]">
                    {isAr ? 'أنت لست عضواً في هذه المجموعة — اطلب من المالك دعوتك للمشاركة' : 'You are not a member — ask the owner to invite you to participate'}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Create-group modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowCreate(false)}>
          <div
            className="w-full max-w-md bg-[var(--cds-layer-01,#262626)] border border-[var(--cds-border-subtle,#393939)] rounded-2xl shadow-2xl p-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[var(--cds-text-01,#f4f4f4)] flex items-center gap-2">
                <Users className="w-4 h-4 text-[#0f62fe]" />
                {isAr ? 'إنشاء مجموعة مناقشة' : 'Create Discussion Group'}
              </h3>
              <button onClick={() => setShowCreate(false)} className="text-[var(--cds-text-03,#8d8d8d)] hover:text-[var(--cds-text-01,#f4f4f4)]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={newName} onChange={e => setNewName(e.target.value)}
                placeholder={isAr ? 'اسم المجموعة *' : 'Group name *'}
                className="w-full px-3 py-2.5 text-xs bg-[var(--cds-layer-02,#161616)] text-[var(--cds-text-01,#f4f4f4)] border border-[var(--cds-border-subtle,#393939)] rounded-lg focus:border-[#0f62fe] focus:outline-hidden"
              />
              <input
                value={newTopic} onChange={e => setNewTopic(e.target.value)}
                placeholder={isAr ? 'الموضوع (اختياري) — مثال: تحليل بيانات الربع الثالث' : 'Topic (optional) — e.g., Q3 data review'}
                className="w-full px-3 py-2.5 text-xs bg-[var(--cds-layer-02,#161616)] text-[var(--cds-text-01,#f4f4f4)] border border-[var(--cds-border-subtle,#393939)] rounded-lg focus:border-[#0f62fe] focus:outline-hidden"
              />
              <div>
                <p className="text-[11px] font-semibold text-[var(--cds-text-02,#c6c6c6)] mb-1.5">
                  {isAr ? 'دعوة أعضاء:' : 'Invite members:'}
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1 border border-[var(--cds-border-subtle,#393939)] rounded-lg p-2 bg-[var(--cds-layer-02,#161616)]">
                  {invitableUsers.length === 0 && (
                    <p className="text-[11px] text-[var(--cds-text-03,#8d8d8d)] text-center py-2">
                      {isAr ? 'لا جهات اتصال بعد — أنشئ المجموعة وستظهر جهات اتصالك هنا' : 'No contacts yet — create the group and your contacts will appear here'}
                    </p>
                  )}
                  {invitableUsers.map(u => (
                    <label
                      key={u.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--cds-layer-01,#262626)] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedUsers.includes(u.id)}
                        onChange={e => setSelectedUsers(prev =>
                          e.target.checked ? [...prev, u.id] : prev.filter(id => id !== u.id)
                        )}
                        className="accent-[#0f62fe]"
                      />
                      <span className="text-xs text-[var(--cds-text-01,#f4f4f4)]">{u.name}</span>
                      <span className="text-[10px] text-[var(--cds-text-03,#8d8d8d)] font-mono truncate">{u.email}</span>
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-[var(--cds-text-03,#8d8d8d)] mt-1">
                  {isAr
                    ? 'تظهر هنا جهات اتصالك فقط: حسابك ومن شاركك مجموعة — ويمكن للمدعوين دعوة غيرهم بموافقة مالك المجموعة'
                    : 'Only your contacts appear here: your account and people who share a group with you'}
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={createGroup} disabled={!newName.trim() || creating}
                className="flex-1 py-2.5 bg-[#0f62fe] hover:bg-[#0353e9] disabled:opacity-60 text-white text-xs font-semibold rounded-lg"
              >
                {creating ? (isAr ? 'جاري الإنشاء...' : 'Creating...') : (isAr ? 'إنشاء المجموعة' : 'Create Group')}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2.5 text-xs font-semibold text-[var(--cds-text-02,#c6c6c6)] border border-[var(--cds-border-subtle,#393939)] rounded-lg hover:bg-[var(--cds-layer-02,#161616)]"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Secret invite-links modal (owner) */}
      {showInviteLinks && active && (
        <InviteLinkModal
          isOpen={showInviteLinks}
          onClose={() => setShowInviteLinks(false)}
          discussionId={active.id}
          discussionName={active.name}
        />
      )}

      {/* Invite-members modal */}
      {showInvite && active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowInvite(false)}>
          <div
            className="w-full max-w-sm bg-[var(--cds-layer-01,#262626)] border border-[var(--cds-border-subtle,#393939)] rounded-2xl shadow-2xl p-5"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[var(--cds-text-01,#f4f4f4)] flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-[#0f62fe]" />
                {isAr ? `دعوة أعضاء إلى ${active.name}` : `Invite to ${active.name}`}
              </h3>
              <button onClick={() => setShowInvite(false)} className="text-[var(--cds-text-03,#8d8d8d)] hover:text-[var(--cds-text-01,#f4f4f4)]">
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Direct invite by email */}
            <div className="mb-3">
              <p className="text-[11px] font-semibold text-[var(--cds-text-02,#c6c6c6)] mb-1.5">
                {isAr ? 'دعوة عبر البريد الإلكتروني:' : 'Invite by email:'}
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="email" dir="ltr"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); inviteByEmail(); } }}
                  placeholder="user@company.com"
                  className="flex-1 px-3 py-2 text-xs bg-[var(--cds-layer-02,#161616)] text-[var(--cds-text-01,#f4f4f4)] border border-[var(--cds-border-subtle,#393939)] rounded-lg focus:border-[#0f62fe] focus:outline-hidden text-left"
                />
                <button
                  onClick={inviteByEmail}
                  disabled={!inviteEmail.trim() || sendingEmailInvite}
                  title={isAr ? 'دعوة حساب مسجل — تصل له إشعار داخل النظام' : 'Invite a registered account — they get an in-app notification'}
                  className="px-3 py-2 bg-[#0f62fe] hover:bg-[#0353e9] disabled:opacity-60 text-white text-[11px] font-semibold rounded-lg flex items-center gap-1.5 shrink-0"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  {sendingEmailInvite ? (isAr ? '...' : '...') : (isAr ? 'توجيه دعوة' : 'Invite')}
                </button>
                <button
                  onClick={inviteNewUserByEmail}
                  disabled={!inviteEmail.trim() || sendingEmailInvite}
                  title={isAr ? 'دعوة شخص غير مسجل — يصله بريد بالرابط وينضم تلقائياً بعد التسجيل (يتطلب SMTP)' : 'Invite an unregistered person — emails them a link, auto-joins after signup (needs SMTP)'}
                  className="px-3 py-2 border border-[#0f62fe] text-[#78a9ff] hover:bg-[#0f62fe]/15 disabled:opacity-60 text-[11px] font-semibold rounded-lg flex items-center gap-1.5 shrink-0"
                >
                  <Mail className="w-3.5 h-3.5" />
                  {isAr ? 'دعوة بالبريد' : 'Email invite'}
                </button>
              </div>
              <p className="text-[10px] text-[var(--cds-text-03,#8d8d8d)] mt-1">
                {isAr
                  ? '"توجيه دعوة" لحساب مسجل (يصل إشعار داخل النظام) — "دعوة بالبريد" لشخص غير مسجل (يرسل بريد بالرابط وينضم تلقائياً بعد التسجيل)'
                  : '"Invite" targets a registered account (in-app notification) — "Email invite" sends a link to an unregistered person who auto-joins on signup'}
              </p>
            </div>

            {/* Pending invites (unanswered) — resend / cancel */}
            {groupPending.length > 0 && (
              <div className="mb-3">
                <p className="text-[11px] font-semibold text-[var(--cds-text-02,#c6c6c6)] mb-1.5">
                  {isAr ? `دعوات معلقة بانتظار الرد (${groupPending.length}):` : `Pending invites (${groupPending.length}):`}
                </p>
                <div className="max-h-36 overflow-y-auto space-y-1">
                  {groupPending.map(p => (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-[#f1c21b]/10 border border-[#f1c21b]/30"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-[var(--cds-text-01,#f4f4f4)] truncate">{p.toName}</p>
                        <p className="text-[10px] text-[var(--cds-text-03,#8d8d8d)] font-mono truncate" dir="ltr">{p.toEmail}</p>
                      </div>
                      <button
                        onClick={() => resendPendingInvite(p.id)}
                        disabled={busyInviteId === p.id}
                        title={isAr ? 'إعادة إرسال الدعوة (تذكير)' : 'Resend invite (reminder)'}
                        className="p-1.5 rounded-md text-[#78a9ff] hover:bg-[#0f62fe]/20 disabled:opacity-50"
                      >
                        {busyInviteId === p.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Send className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => cancelPendingInvite(p.id)}
                        disabled={busyInviteId === p.id}
                        title={isAr ? 'إلغاء الدعوة' : 'Cancel invite'}
                        className="p-1.5 rounded-md text-[#ff8389] hover:bg-[#da1e28]/15 disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] font-semibold text-[var(--cds-text-02,#c6c6c6)] mb-1.5">
              {isAr ? 'أو اختر من جهات اتصالك:' : 'Or pick from your contacts:'}
            </p>
            <div className="max-h-40 overflow-y-auto space-y-1 border border-[var(--cds-border-subtle,#393939)] rounded-lg p-2 bg-[var(--cds-layer-02,#161616)]">
              {invitableUsers.length === 0 && (
                <p className="text-[11px] text-[var(--cds-text-03,#8d8d8d)] text-center py-3">
                  {isAr ? 'لا جهات اتصال متاحة للدعوة' : 'No contacts available to invite'}
                </p>
              )}
              {invitableUsers.map(u => (
                <label key={u.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--cds-layer-01,#262626)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inviteSelected.includes(u.id)}
                    onChange={e => setInviteSelected(prev =>
                      e.target.checked ? [...prev, u.id] : prev.filter(id => id !== u.id)
                    )}
                    className="accent-[#0f62fe]"
                  />
                  <span className="text-xs text-[var(--cds-text-01,#f4f4f4)]">{u.name}</span>
                  <span className="text-[10px] text-[var(--cds-text-03,#8d8d8d)] font-mono truncate">{u.email}</span>
                </label>
              ))}
            </div>
            {/* Owner & moderators: manage existing members */}
            {active.members.filter(m => m.id !== user.id).length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] font-semibold text-[var(--cds-text-02,#c6c6c6)] mb-1">
                  {active.isOwner
                    ? (isAr ? 'الأعضاء الحاليون (إزالة / تعيين مشرف):' : 'Members (remove / promote to moderator):')
                    : (isAr ? 'الأعضاء الحاليون (يمكنك إزالة الأعضاء العاديين):' : 'Members (you can remove plain members):')}
                </p>
                <div className="space-y-1">
                  {active.members.filter(m => m.id !== user.id).map(m => (
                    <div key={m.id} className="flex items-center justify-between px-2 py-1 rounded-md bg-[var(--cds-layer-02,#161616)]">
                      <span className="text-xs text-[var(--cds-text-01,#f4f4f4)] flex items-center gap-1.5">
                        {m.name}
                        {m.role === 'owner' && <span title={isAr ? 'المالك' : 'Owner'}><Crown className="w-3 h-3 text-[#f1c21b]" /></span>}
                        {m.role === 'moderator' && <span title={isAr ? 'مشرف' : 'Moderator'}><Shield className="w-3 h-3 text-[#42be65]" /></span>}
                      </span>
                      <span className="flex items-center gap-0.5">
                        {active.isOwner && m.role === 'member' && (
                          <button
                            onClick={() => promoteMember(m.id)}
                            title={isAr ? 'تعيين كمشرف' : 'Promote to moderator'}
                            className="text-[#42be65] hover:bg-[#42be65]/15 rounded p-1"
                          >
                            <Shield className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {active.isOwner && m.role === 'moderator' && (
                          <button
                            onClick={() => demoteMember(m.id)}
                            title={isAr ? 'إلغاء الإشراف' : 'Remove moderator'}
                            className="text-[#f1c21b] hover:bg-[#f1c21b]/15 rounded p-1"
                          >
                            <ShieldOff className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {m.role !== 'owner' && (active.isOwner || m.role === 'member') && (
                          <button
                            onClick={() => removeMember(m.id)}
                            title={isAr ? 'إزالة العضو' : 'Remove member'}
                            className="text-[#ff8389] hover:bg-[#da1e28]/15 rounded p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <button
                onClick={inviteMembers} disabled={inviteSelected.length === 0 || inviting}
                className="flex-1 py-2.5 bg-[#0f62fe] hover:bg-[#0353e9] disabled:opacity-60 text-white text-xs font-semibold rounded-lg"
              >
                {inviting ? (isAr ? 'جاري الدعوة...' : 'Inviting...') : (isAr ? 'دعوة المحددين' : 'Invite Selected')}
              </button>
              <button
                onClick={() => setShowInvite(false)}
                className="px-4 py-2.5 text-xs font-semibold text-[var(--cds-text-02,#c6c6c6)] border border-[var(--cds-border-subtle,#393939)] rounded-lg hover:bg-[var(--cds-layer-02,#161616)]"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
