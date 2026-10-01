/**
 * DiscussionsBadge — live "total unread" badge for the sidebar's
 * Discussions tab. Fetches /api/discussions/unread-total, re-polls
 * on window focus, and light-polls every 30s so the badge stays
 * fresh anywhere in the app (no SSE dependency, one tiny request).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { getStoredToken } from '../../features/auth/LoginPage';

const AUTH_TOKEN_KEY = 'carbon_auth_token';

function authHeaders(): Record<string, string> {
  const token = getStoredToken() || (() => { try { return localStorage.getItem(AUTH_TOKEN_KEY); } catch { return null; } })();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Bumped by DiscussionsPage after read/mark-read so the badge syncs instantly. */
export const DISCUSSIONS_BADGE_EVENT = 'discussions-badge-refresh';

export const DiscussionsBadge: React.FC<{ className?: string }> = ({ className }) => {
  const [total, setTotal] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/discussions/unread-total', { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setTotal(Number(data.total) || 0);
    } catch { /* offline — keep last value */ }
  }, []);

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    const onBump = () => load();
    window.addEventListener(DISCUSSIONS_BADGE_EVENT, onBump as EventListener);
    const id = setInterval(load, 30000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(DISCUSSIONS_BADGE_EVENT, onBump as EventListener);
      clearInterval(id);
    };
  }, [load]);

  if (!total) return null; // 0 or unknown — no badge

  return (
    <span
      className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#da1e28] text-white text-[10px] font-bold leading-none shrink-0 ${className || ''}`}
      title={String(total)}
    >
      {total > 99 ? '99+' : total}
    </span>
  );
};
