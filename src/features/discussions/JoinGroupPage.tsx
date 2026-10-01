/**
 * JoinGroupPage — landing for a secret invite link (/join/:code).
 * Shows the group name (and nothing else about the private group) and,
 * if the code is valid, lets the logged-in user join in one click.
 */
import React, { useState, useEffect } from 'react';
import { Users, Loader2, CheckCircle2, XCircle, BarChart3 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getStoredToken } from '../auth/LoginPage';

interface JoinGroupPageProps {
  code: string;
  /** Called after a successful join — the app should navigate to the discussions page. */
  onJoined: (discussionId: string) => void;
}

export const JoinGroupPage: React.FC<JoinGroupPageProps> = ({ code, onJoined }) => {
  const { language } = useApp();
  const isAr = language === 'ar';
  const [state, setState] = useState<'loading' | 'valid' | 'invalid' | 'joining' | 'joined'>('loading');
  const [info, setInfo] = useState<{ discussionName: string; reason?: string }>({ discussionName: '' });

  useEffect(() => {
    if (!getStoredToken()) return; // auth gate handles login first
    let cancelled = false;
    fetch(`/api/invites/${encodeURIComponent(code)}`, {
      headers: { Authorization: `Bearer ${getStoredToken()}` },
    })
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        setInfo(data);
        setState(data.valid ? 'valid' : 'invalid');
      })
      .catch(() => { if (!cancelled) setState('invalid'); });
    return () => { cancelled = true; };
  }, [code]);

  const join = async () => {
    setState('joining');
    try {
      const res = await fetch(`/api/invites/${encodeURIComponent(code)}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getStoredToken()}` },
      });
      const data = await res.json();
      if (!res.ok) { setInfo(prev => ({ ...prev, reason: data.error })); setState('invalid'); return; }
      setState('joined');
      setTimeout(() => onJoined(data.discussionId), 900);
    } catch {
      setState('invalid');
    }
  };

  const token = getStoredToken();

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--cds-background,#161616)] p-4" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute -top-32 -start-32 w-96 h-96 rounded-full bg-[#0f62fe]/10 blur-3xl" />
        <div className="absolute -bottom-40 -end-24 w-[28rem] h-[28rem] rounded-full bg-[#33b1ff]/8 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0f62fe] shadow-lg shadow-[#0f62fe]/30 mb-3">
          <BarChart3 className="w-7 h-7 text-white" />
        </div>

        <div className="bg-[var(--cds-layer-01,#262626)] border border-[var(--cds-border-subtle,#393939)] rounded-2xl shadow-2xl p-6">
          {state === 'loading' && (
            <>
              <Loader2 className="w-8 h-8 mx-auto animate-spin text-[#0f62fe] mb-3" />
              <p className="text-xs text-[var(--cds-text-03,#8d8d8d)]">
                {isAr ? 'جاري التحقق من رابط الدعوة...' : 'Verifying invite link...'}
              </p>
            </>
          )}

          {state === 'valid' && (
            <>
              <div className="w-12 h-12 mx-auto rounded-full bg-[#0f62fe]/15 border border-[#0f62fe]/40 flex items-center justify-center mb-3">
                <Users className="w-6 h-6 text-[#78a9ff]" />
              </div>
              <h1 className="text-base font-bold text-[var(--cds-text-01,#f4f4f4)] mb-1">
                {isAr ? 'دعوة لمجموعة مناقشة' : 'Group discussion invite'}
              </h1>
              <p className="text-sm text-[#78a9ff] font-semibold mb-1">{info.discussionName}</p>
              <p className="text-[11px] text-[var(--cds-text-03,#8d8d8d)] mb-4">
                {isAr
                  ? 'المجموعة خاصة — لن ترى محتواها إلا بعد الانضمام'
                  : 'This group is private — you will see its content only after joining'}
              </p>
              <button
                onClick={join}
                className="w-full py-2.5 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {isAr ? 'قبول الدعوة والانضمام' : 'Accept invite & join'}
              </button>
            </>
          )}

          {state === 'joining' && (
            <>
              <Loader2 className="w-8 h-8 mx-auto animate-spin text-[#0f62fe] mb-3" />
              <p className="text-xs text-[var(--cds-text-03,#8d8d8d)]">
                {isAr ? 'جاري الانضمام...' : 'Joining...'}
              </p>
            </>
          )}

          {state === 'joined' && (
            <>
              <CheckCircle2 className="w-10 h-10 mx-auto text-[#42be65] mb-3" />
              <p className="text-sm font-bold text-[var(--cds-text-01,#f4f4f4)]">
                {isAr ? 'تم الانضمام إلى المجموعة 🎉' : 'Joined the group 🎉'}
              </p>
              <p className="text-[11px] text-[var(--cds-text-03,#8d8d8d)] mt-1">
                {isAr ? 'جاري فتح المناقشات...' : 'Opening discussions...'}
              </p>
            </>
          )}

          {state === 'invalid' && (
            <>
              <XCircle className="w-10 h-10 mx-auto text-[#ff8389] mb-3" />
              <p className="text-sm font-bold text-[var(--cds-text-01,#f4f4f4)] mb-1">
                {isAr ? 'رابط الدعوة غير صالح' : 'Invalid invite link'}
              </p>
              <p className="text-[11px] text-[var(--cds-text-03,#8d8d8d)]">
                {info.reason || (isAr ? 'اطلب رابطاً جديداً من مالك المجموعة' : 'Ask the group owner for a new link')}
              </p>
            </>
          )}

          {!token && state !== 'loading' && (
            <p className="text-[11px] text-[#f1c21b] mt-3">
              {isAr ? 'سجّل الدخول أولاً ثم افتح الرابط من جديد' : 'Log in first, then open the link again'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
