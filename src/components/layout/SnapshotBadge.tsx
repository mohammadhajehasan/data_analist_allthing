/**
 * SnapshotBadge — mini unread badge for sidebar tabs that receive shared
 * snapshots (Dashboards & Reports). Counts snapshot messages from other
 * users that arrived after the user's last read, per snapshot source.
 * Shares the same polling/nudge cadence as DiscussionsBadge.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { getStoredToken } from '../../features/auth/LoginPage';
import { DISCUSSIONS_BADGE_EVENT } from './DiscussionsBadge';

const AUTH_TOKEN_KEY = 'carbon_auth_token';

function authHeaders(): Record<string, string> {
  const token = getStoredToken() || (() => { try { return localStorage.getItem(AUTH_TOKEN_KEY); } catch { return null; } })();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export const SnapshotBadge: React.FC<{ source: 'dashboard' | 'reports'; className?: string }> = ({ source, className }) => {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/discussions/snapshot-badges', { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      setCount(source === 'dashboard' ? Number(data.dashboard) || 0 : Number(data.reports) || 0);
    } catch { /* offline — keep last value */ }
  }, [source]);

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

  if (!count) return null;

  return (
    <span
      className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#8a3800] text-white text-[10px] font-bold leading-none shrink-0 ${className || ''}`}
      title={String(count)}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
};
