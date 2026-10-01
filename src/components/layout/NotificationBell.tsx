/**
 * NotificationBell — live notification center in the header.
 * - Unread badge updated in real time via SSE 'notification' events
 * - Discussion-invite cards show inviter + group with Accept / Reject
 * - Accepting joins the group (server adds membership only on accept)
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Bell, Users, Check, X, UserPlus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getStoredToken } from '../../features/auth/LoginPage';
import { DISCUSSIONS_BADGE_EVENT } from './DiscussionsBadge';

interface Notif {
  id: string; type: string; title: string; body: string | null;
  payload: any; read: boolean; createdAt: string;
}
interface PendingInvite {
  id: string; discussionId: string; discussionName: string;
  fromName: string; fromEmail: string; createdAt: string;
}

export const NotificationBell: React.FC = () => {
  const { language, toast } = useApp();
  const isAr = language === 'ar';
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const prevUnreadRef = useRef<number>(-1);

  const load = useCallback(async () => {
    const token = getStoredToken();
    if (!token) return;
    try {
      const [nRes, pRes] = await Promise.all([
        fetch('/api/notifications', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/invites/pending', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const nData = await nRes.json();
      const pData = await pRes.json();
      setItems(nData.notifications || []);
      setUnread(nData.unread || 0);
      setPending(pData.invites || []);
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refresh whenever the user returns to the tab/window
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [load]);

  // In-app actions elsewhere (accept/reject/read-all/badge nudges) ping this event
  useEffect(() => {
    const onBump = () => load();
    window.addEventListener(DISCUSSIONS_BADGE_EVENT, onBump as EventListener);
    return () => window.removeEventListener(DISCUSSIONS_BADGE_EVENT, onBump as EventListener);
  }, [load]);

  // Live unread badge via the same SSE stream the discussions page uses
  const sseRetry = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;
    let es: EventSource | null = null;
    let closed = false;
    const connect = () => {
      es = new EventSource(`/api/discussions/stream?token=${encodeURIComponent(token)}`);
      es.addEventListener('notification', (ev: MessageEvent) => {
        try {
          const { unreadCount } = JSON.parse(ev.data);
          if (typeof unreadCount === 'number') {
            if (unreadCount > prevUnreadRef.current && prevUnreadRef.current >= 0) {
              load(); // something new arrived — refresh the list
            }
            prevUnreadRef.current = unreadCount;
            setUnread(unreadCount);
          }
        } catch { /* ignore */ }
      });
      es.onerror = () => {
        es?.close();
        if (!closed) sseRetry.current = setTimeout(connect, 5000);
      };
    };
    connect();
    return () => {
      closed = true;
      if (sseRetry.current) clearTimeout(sseRetry.current);
      es?.close();
    };
  }, [load]);

  // Safety net while the stream is down: light poll every 30s
  // (same cadence as the sidebar badge — one tiny request)
  useEffect(() => {
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const decide = async (invite: PendingInvite, accept: boolean) => {
    setBusy(invite.id);
    try {
      const res = await fetch(`/api/invites/pending/${invite.id}/${accept ? 'accept' : 'reject'}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getStoredToken()}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تنفيذ الإجراء');
      toast.success(
        accept ? (isAr ? 'تم القبول' : 'Joined') : (isAr ? 'تم الرفض' : 'Declined'),
        accept
          ? (isAr ? `أصبحت عضواً في "${invite.discussionName}"` : `You are now a member of "${invite.discussionName}"`)
          : (isAr ? 'أُرسل إشعار بالرفض لصاحب الدعوة' : 'The inviter has been notified')
      );
      // Sidebar unread badge may change (new group's history) — nudge it too
      try { window.dispatchEvent(new Event(DISCUSSIONS_BADGE_EVENT)); } catch { /* non-fatal */ }
      await load();
    } catch (err: any) {
      toast.error(isAr ? 'خطأ' : 'Error', err.message);
    } finally {
      setBusy(null);
    }
  };

  /** Notifications with a discussionId navigate straight to that group. */
  const openNotification = async (n: Notif) => {
    const gid = n.payload?.discussionId;
    // Mark read in the background (badge drops even without navigation)
    if (!n.read) {
      fetch(`/api/notifications/${n.id}/read`, {
        method: 'POST', headers: { Authorization: `Bearer ${getStoredToken()}` },
      }).then(() => load()).catch(() => {});
      setItems(prev => prev.map(x => (x.id === n.id ? { ...x, read: true } : x)));
    }
    if (!gid) return;
    // Switch to the discussions tab, then open the specific group
    try { window.dispatchEvent(new Event('carbon-open-discussions')); } catch { /* non-fatal */ }
    // Wait a tick so the tab mounts DiscussionsPage before the deep-link fires
    setTimeout(() => {
      try { window.dispatchEvent(new CustomEvent('carbon-open-discussion', { detail: gid })); } catch { /* non-fatal */ }
    }, 50);
    setOpen(false);
  };

  const markAllRead = async () => {
    await fetch('/api/notifications/read-all', {
      method: 'POST', headers: { Authorization: `Bearer ${getStoredToken()}` },
    }).catch(() => {});
    await load();
  };

  const pendingIds = new Set(pending.map(p => p.id));

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => { setOpen(v => !v); if (!open) load(); }}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center bg-[var(--cds-layer-01)] hover:bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)] border border-[var(--cds-border-subtle)] transition-colors"
        title={isAr ? 'الإشعارات' : 'Notifications'}
        aria-label={isAr ? 'الإشعارات' : 'Notifications'}
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span
            className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#da1e28] text-white text-[10px] font-bold flex items-center justify-center leading-none"
            title={String(unread)}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`absolute top-full mt-1.5 w-80 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-lg shadow-2xl z-50 animate-in fade-in duration-100 ${
            language === 'ar' ? 'left-0' : 'right-0'
          }`}
          dir={isAr ? 'rtl' : 'ltr'}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--cds-border-subtle)]">
            <p className="text-xs font-bold text-[var(--cds-text-01)]">
              {isAr ? 'الإشعارات' : 'Notifications'}
              {unread > 0 && <span className="ms-1.5 text-[10px] text-[#ff8389]">({unread})</span>}
            </p>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-[10px] text-[#78a9ff] hover:underline">
                {isAr ? 'تعليم الكل كمقروء' : 'Mark all read'}
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto p-1.5 space-y-1.5">
            {items.length === 0 && (
              <p className="text-[11px] text-[var(--cds-text-03)] text-center py-6">
                {isAr ? 'لا إشعارات بعد' : 'No notifications yet'}
              </p>
            )}

            {items.map(n => {
              const isInvite = n.type === 'discussion_invite' && n.payload?.inviteId && pendingIds.has(n.payload.inviteId);
              const clickable = !!n.payload?.discussionId;
              return (
                <div
                  key={n.id}
                  onClick={clickable ? () => openNotification(n) : undefined}
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onKeyDown={clickable ? (e => { if (e.key === 'Enter') openNotification(n); }) : undefined}
                  title={clickable ? (isAr ? 'انقر لفتح المجموعة' : 'Click to open the group') : undefined}
                  className={`rounded-lg p-2.5 border transition-colors ${
                    clickable ? 'cursor-pointer hover:border-[#0f62fe]/60' : ''
                  } ${!n.read ? 'bg-[#0f62fe]/10 border-[#0f62fe]/30' : 'bg-[var(--cds-layer-02)] border-[var(--cds-border-subtle)]'}`}
                >
                  <div className="flex items-start gap-2">
                    {n.type === 'discussion_invite' ? (
                      <UserPlus className="w-4 h-4 text-[#78a9ff] shrink-0 mt-0.5" />
                    ) : n.type === 'invite_accepted' ? (
                      <Check className="w-4 h-4 text-[#42be65] shrink-0 mt-0.5" />
                    ) : n.type === 'invite_rejected' ? (
                      <X className="w-4 h-4 text-[#ff8389] shrink-0 mt-0.5" />
                    ) : (
                      <Bell className="w-4 h-4 text-[var(--cds-text-03)] shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-[var(--cds-text-01)]">{n.title}</p>
                      {n.body && <p className="text-[11px] text-[var(--cds-text-03)] mt-0.5 leading-relaxed">{n.body}</p>}

                      {/* Accept / Reject for pending invites */}
                      {isInvite && (
                        <div className="flex items-center gap-1.5 mt-2" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => decide(pending.find(p => p.id === n.payload.inviteId)!, true)}
                            disabled={busy === n.payload.inviteId}
                            className="px-2.5 py-1 bg-[#24a148] hover:bg-[#198038] disabled:opacity-60 text-white text-[10px] font-bold rounded-md flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" />
                            {isAr ? 'قبول' : 'Accept'}
                          </button>
                          <button
                            onClick={() => decide(pending.find(p => p.id === n.payload.inviteId)!, false)}
                            disabled={busy === n.payload.inviteId}
                            className="px-2.5 py-1 text-[#ff8389] border border-[#da1e28]/50 hover:bg-[#da1e28]/15 text-[10px] font-bold rounded-md flex items-center gap-1"
                          >
                            <X className="w-3 h-3" />
                            {isAr ? 'رفض' : 'Reject'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
