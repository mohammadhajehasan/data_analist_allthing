/**
 * إدارة الجلسات النشطة: يعيد المستخدم كل أجهزته المسجلة (الجهاز + آخر نشاط)
 * ويتيح إبطال جلسة واحدة أو إبطال كل الجلسات الأخرى (ما عدا الجلسة الحالية).
 * الخادم يفرض ملكية المستخدم في كل عملية — لا تظهر الجلسات إلا لصاحبها.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, X, Smartphone, RefreshCw, LogOut, Loader2 } from 'lucide-react';

export interface ActiveSessionRow {
  /** بادئة الرمز فقط (8 خانات + …) — يُستخدم لتعيين جلسة الإبطال. */
  id: string;
  device: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
}

/** «قبل 4 دقائق» / «قبل يومين» بلغة عربية مختصرة. */
function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'الآن';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'الآن';
  if (min < 60) return `قبل ${min} دقيقة`;
  const h = Math.floor(min / 60);
  if (h < 24) return `قبل ${h} ساعة`;
  const d = Math.floor(h / 24);
  return `قبل ${d} يوم`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export const SessionsManagerModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [sessions, setSessions] = useState<ActiveSessionRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string>(''); // الجلسة قيد الإبطال
  const [revokingAll, setRevokingAll] = useState(false);
  const [error, setError] = useState('');

  const token = (): string => localStorage.getItem('carbon_auth_token') || '';

  const reload = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/sessions', { headers: { Authorization: `Bearer ${token()}` } });
      if (!res.ok) throw new Error(res.status === 401 ? 'انتهت الجلسة — سجّل الدخول من جديد' : 'تعذر جلب الجلسات');
      const data = await res.json();
      setSessions(Array.isArray(data?.sessions) ? data.sessions : []);
    } catch (e: any) {
      setError(e?.message || 'خطأ غير متوقع');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) void reload();
  }, [isOpen, reload]);

  const revokeOne = async (row: ActiveSessionRow) => {
    if (row.current) return; // الجلسة الحالية تُبطل من «تسجيل الخروج»
    setBusyId(row.id);
    setError('');
    try {
      const res = await fetch(`/api/auth/sessions/${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error('فشل إبطال الجلسة');
      await reload();
    } catch (e: any) {
      setError(e?.message || 'فشل إبطال الجلسة');
    } finally {
      setBusyId('');
    }
  };

  const revokeAllOthers = async () => {
    setRevokingAll(true);
    setError('');
    try {
      const res = await fetch('/api/auth/sessions', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token()}` },
      });
      if (!res.ok) throw new Error('فشل إبطال الجلسات');
      await reload();
    } catch (e: any) {
      setError(e?.message || 'فشل إبطال الجلسات');
    } finally {
      setRevokingAll(false);
    }
  };

  if (!isOpen) return null;

  const others = (sessions || []).filter(s => !s.current);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" dir="rtl" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* الرأس */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[var(--cds-interactive-01)]/15 text-[var(--cds-interactive-01)] flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[var(--cds-text-01)]">الجلسات النشطة</h2>
              <p className="text-[11px] text-[var(--cds-text-03)]">كُل الأجهزة المسجّلة بحسابك — يمكنك إنهاء أي جلسة أو كل الأجهزة الأخرى</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => void reload()}
              className="p-2 rounded-lg hover:bg-[var(--cds-layer-hover-01)] text-[var(--cds-text-02)]"
              title="تحديث"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--cds-layer-hover-01)] text-[var(--cds-text-02)]" title="إغلاق">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* المحتوى */}
        <div className="max-h-[60vh] overflow-y-auto">
          {error && (
            <div className="mx-4 mt-4 px-3 py-2 text-xs bg-[#da1e28]/10 text-[#ff8389] rounded-lg border border-[#da1e28]/30">
              {error}
            </div>
          )}

          {sessions === null || loading ? (
            <div className="flex flex-col items-center gap-2 py-12 text-[var(--cds-text-03)]">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--cds-interactive-01)]" />
              <p className="text-xs">جاري جلب الجلسات من الخادم…</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--cds-text-03)]">لا توجد جلسات نشطة</div>
          ) : (
            <ul className="p-4 space-y-2">
              {sessions.map(s => (
                <li
                  key={s.id}
                  className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border transition-colors ${
                    s.current
                      ? 'border-[var(--cds-interactive-01)]/40 bg-[var(--cds-interactive-01)]/5'
                      : 'border-[var(--cds-border-subtle)] hover:border-[var(--cds-border-strong)]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-[var(--cds-layer-02)] text-[var(--cds-text-02)] shrink-0">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[var(--cds-text-01)] flex items-center gap-2">
                        {s.device}
                        {s.current && (
                          <span className="carbon-tag-blue px-1.5 py-0.5 rounded text-[10px] font-bold">هذا الجهاز</span>
                        )}
                      </p>
                      <p className="text-[11px] text-[var(--cds-text-03)] truncate">
                        آخر نشاط {relativeTime(s.lastSeenAt)} · بُدئت {fmtDate(s.createdAt)} · تنتهي {fmtDate(s.expiresAt)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => void revokeOne(s)}
                    disabled={s.current || busyId === s.id || revokingAll}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
                      s.current
                        ? 'opacity-40 cursor-not-allowed text-[var(--cds-text-03)]'
                        : 'text-[#ff8389] hover:bg-[#da1e28]/15 border border-[#da1e28]/25'
                    }`}
                    title={s.current ? 'الجلسة الحالية — أخرج من الزر المخصص' : 'إنهاء هذه الجلسة'}
                  >
                    {busyId === s.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
                    إبطال
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* التذييل */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)]">
          <p className="text-[10px] text-[var(--cds-text-03)]">
            المصادقة محصورة بحسابك — إبطال الجلسة يجبر الجهاز الآخر على تسجيل الدخول من جديد
          </p>
          <button
            onClick={() => void revokeAllOthers()}
            disabled={others.length === 0 || revokingAll || loading}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
              others.length === 0
                ? 'opacity-40 cursor-not-allowed bg-[var(--cds-layer-hover-01)] text-[var(--cds-text-03)]'
                : 'bg-[#da1e28] text-white hover:bg-[#a2191f]'
            }`}
          >
            {revokingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
            إبطال كل الجلسات الأخرى ({others.length})
          </button>
        </div>
      </div>
    </div>
  );
};
