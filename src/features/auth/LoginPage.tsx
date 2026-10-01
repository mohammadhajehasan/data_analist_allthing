/**
 * Login / Register page — gate for the whole platform.
 * Talks to /api/auth/*; stores the session token in localStorage ('carbon_auth_token').
 * The first registered account automatically becomes admin (server-side rule).
 */
import React, { useState } from 'react';
import { Lock, Mail, User as UserIcon, LogIn, UserPlus, ShieldCheck, Database, BarChart3, Eye, EyeOff } from 'lucide-react';

interface LoginPageProps {
  onAuthSuccess: (user: { id: string; email: string; name: string; role: string }) => void;
}

const AUTH_TOKEN_KEY = 'carbon_auth_token';

export function getStoredToken(): string | null {
  try { return localStorage.getItem(AUTH_TOKEN_KEY); } catch { return null; }
}
export function clearStoredToken(): void {
  try { localStorage.removeItem(AUTH_TOKEN_KEY); } catch { /* noop */ }
}

export const LoginPage: React.FC<LoginPageProps> = ({ onAuthSuccess }) => {
  const isAr = true; // platform default is Arabic; header language toggle applies after login
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'login' ? { email, password } : { email, name, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل الطلب');
      localStorage.setItem(AUTH_TOKEN_KEY, data.token);
      onAuthSuccess(data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const inputCls = 'w-full ps-9 pe-3 py-2.5 text-sm bg-[var(--cds-layer-02,#262626)] text-[var(--cds-text-01,#f4f4f4)] border border-[var(--cds-border-subtle,#393939)] rounded-lg focus:border-[#0f62fe] focus:outline-hidden focus:ring-1 focus:ring-[#0f62fe]/40 transition-colors';

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--cds-background,#161616)] p-4" dir="rtl">
      {/* Ambient background accents */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
        <div className="absolute -top-32 -start-32 w-96 h-96 rounded-full bg-[#0f62fe]/10 blur-3xl" />
        <div className="absolute -bottom-40 -end-24 w-[28rem] h-[28rem] rounded-full bg-[#33b1ff]/8 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0f62fe] shadow-lg shadow-[#0f62fe]/30 mb-3">
            <BarChart3 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--cds-text-01,#f4f4f4)]">
            منصة تحليل البيانات الذكية
          </h1>
          <p className="text-xs text-[var(--cds-text-03,#8d8d8d)] mt-1.5">
            Enterprise Analytics Hub — سجّل الدخول للوصول إلى مساحة عملك
          </p>
        </div>

        {/* Card */}
        <div className="bg-[var(--cds-layer-01,#262626)] border border-[var(--cds-border-subtle,#393939)] rounded-2xl shadow-2xl p-6">
          {/* Mode tabs */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-[var(--cds-layer-02,#161616)] rounded-lg mb-5">
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null); }}
                className={`py-2 text-xs font-semibold rounded-md transition-all ${
                  mode === m
                    ? 'bg-[#0f62fe] text-white shadow-sm'
                    : 'text-[var(--cds-text-03,#8d8d8d)] hover:text-[var(--cds-text-01,#f4f4f4)]'
                }`}
              >
                {m === 'login' ? 'تسجيل الدخول' : 'حساب جديد'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3.5">
            {mode === 'register' && (
              <div className="relative">
                <UserIcon className="w-4 h-4 absolute top-3 start-3 text-[var(--cds-text-03,#8d8d8d)]" />
                <input
                  type="text" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="الاسم الكامل" required minLength={2}
                  className={inputCls}
                />
              </div>
            )}
            <div className="relative">
              <Mail className="w-4 h-4 absolute top-3 start-3 text-[var(--cds-text-03,#8d8d8d)]" />
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="البريد الإلكتروني" required dir="ltr"
                className={`${inputCls} text-left`}
              />
            </div>
            <div className="relative">
              <Lock className="w-4 h-4 absolute top-3 start-3 text-[var(--cds-text-03,#8d8d8d)]" />
              <input
                type={showPassword ? 'text' : 'password'} value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="كلمة المرور" required minLength={6} dir="ltr"
                className={`${inputCls} text-left pe-10`}
              />
              <button
                type="button" onClick={() => setShowPassword(v => !v)}
                className="absolute top-2.5 end-3 text-[var(--cds-text-03,#8d8d8d)] hover:text-[var(--cds-text-01,#f4f4f4)]"
                aria-label="إظهار كلمة المرور"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {error && (
              <div className="text-xs text-[#ff8389] bg-[#da1e28]/15 border border-[#da1e28]/40 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit" disabled={busy}
              className="w-full py-2.5 bg-[#0f62fe] hover:bg-[#0353e9] disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg shadow-[#0f62fe]/25"
            >
              {mode === 'login' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              {busy ? 'جاري المعالجة...' : mode === 'login' ? 'دخول' : 'إنشاء الحساب'}
            </button>
          </form>

          {/* First-user admin hint */}
          {mode === 'register' && (
            <div className="mt-4 text-[11px] text-[var(--cds-text-03,#8d8d8d)] bg-[var(--cds-layer-02,#161616)] border border-[var(--cds-border-subtle,#393939)] rounded-lg p-3 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-[#42be65] shrink-0 mt-0.5" />
              <span>أول حساب يُسجَّل في النظام يحصل تلقائياً على صلاحية <b className="text-[var(--cds-text-01,#f4f4f4)]">مدير (admin)</b>، والحسابات التالية تنضم كمحللين.</span>
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-center gap-4 text-[10px] text-[var(--cds-text-03,#8d8d8d)]">
          <span className="flex items-center gap-1"><Database className="w-3 h-3" /> بياناتكم محلية 100%</span>
          <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> كلمات المرور مشفرة bcrypt</span>
        </div>
      </div>
    </div>
  );
};
