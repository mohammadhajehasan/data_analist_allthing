/**
 * نافذة استعادة كلمة المرور — "نسيت كلمة المرور؟" في LoginPage.
 * ثلاث خطوات: (1) اختيار القناة بريد/هاتف وإدخال الهدف، (2) رمز التحقق 6 خانات،
 * (3) كلمة المرور الجديدة. الهاتف يُبنى عبر الوحدة المشتركة phoneCountries
 * (منتقي رمز الدولة + التحقق أثناء الكتابة بنمط كل دولة) ويُرسل بصيغة E.164.
 */
import React, { useMemo, useRef, useState } from 'react';
import {
  KeyRound, Mail, Smartphone, ArrowRight, Loader2, ShieldCheck, Eye, EyeOff, Copy, Check, ClipboardPaste,
} from 'lucide-react';
import { PHONE_COUNTRIES, validatePhoneNational } from '../../utils/phoneCountries';

export type ResetChannel = 'email' | 'phone';

interface ResetPasswordPanelProps {
  lang: 'ar' | 'en';
  onBack: () => void;                        // الرجوع إلى شاشة تسجيل الدخول
  onSuccess: () => void;                     // بعد تعيين كلمة المرور الجديدة
  switchToLogin?: (identifier: string) => void; // الدخول مباشرة بالهوية المستخدمة
  /** ما كتبه المستخدم في حقل البريد بشاشة الدخول — يعاد استخدام وبدون إعادة إدخاله */
  initialEmail?: string;
}

type Step = 'target' | 'code' | 'newPassword';

const inputCls = 'w-full px-3 py-2.5 text-sm bg-[var(--cds-layer-02,#262626)] text-[var(--cds-text-01,#f4f4f4)] border border-[var(--cds-border-subtle,#393939)] rounded-lg focus:border-[#0f62fe] focus:outline-hidden focus:ring-1 focus:ring-[#0f62fe]/40 transition-colors';

export const ResetPasswordPanel: React.FC<ResetPasswordPanelProps> = ({ lang, onBack, onSuccess, switchToLogin, initialEmail }) => {
  const isAr = lang === 'ar';
  const [step, setStep] = useState<Step>('target');
  const [channel, setChannel] = useState<ResetChannel>('email');
  // مستوى إرسال الرمز عبر الهاتف: SMS أو Telegram (واتساب غيرُ متاح — قيود Meta على سوريا)
  const [phoneChannel, setPhoneChannel] = useState<'sms' | 'telegram'>('sms');
  const [email, setEmail] = useState(initialEmail || '');
  // الهاتف: طرية بادئات الخليج — سوريا افتراضياً (SY · 963 · 9 أرقام)
  const [country, setCountry] = useState(PHONE_COUNTRIES[0]); // SY
  const [national, setNational] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  // تذكرة التحقق (يصدرها الخادم عند نجاح الرمز) — لا تظهر إلا في الذاكرة
  const [ticket, setTicket] = useState<string>('');
  const [verifiedTarget, setVerifiedTarget] = useState('');
  // تلميح الخادم (فحص المجلد غير المرغوب...) يُعرض بدل النص الثابت إن ورد
  const [hint, setHint] = useState<string>('');
  const [devCode, setDevCode] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);

  const T = isAr
    ? {
        title: 'استعادة كلمة المرور', back: 'رجوع',
        how: 'اختر طريقة استلام رمز التحقق (6 أرقام)',
        email: 'البريد الإلكتروني', phone: 'رقم الهاتف',
        target: 'الهدف', info: 'سنرسل رمزاً إلى هذا الهدف',
        via: 'استلام الرمز عبر', segSms: 'SMS', segTelegram: 'Telegram', segWhatsApp: 'WhatsApp',
        whatsUnavailable: 'غير متاح: لا مزوّد موثوق يوصل OTP للواتساب في سوريا (قيود Meta) — اختر SMS أو Telegram',
        send: 'إرسال الرمز', sending: 'جاري الإرسال...',
        resending: 'إعادة الإرسال بعد', seconds: 'ثانية',
        resend: 'إعادة إرسال الرمز', resendNow: 'لم يصل الرمز؟ أرسله مجدداً',
        enterCode: 'رمز التحقق', codeHint: 'تصل الرسالة خلال دقائق — تحقق من مجلد البريد غير المرغوب',
        verify: 'تحقق من الرمز', verifying: 'جاري التحقق...',
        newPass: 'كلمة المرور الجديدة', confirm: 'تأكيد كلمة المرور',
        save: 'تعيين كلمة المرور', saving: 'جاري التعيين...',
        mismatch: 'كلمتا المرور غير متطابقتين', short: 'كلمة المرور قصيرة (6 أحرف على الأقل)',
        invalidPhone: 'رقم الهاتف لا يطابق نمط هذه الدولة', done: 'تم تعيين كلمة المرور! سجّل الدخول بالجديدة.',
      }
    : {
        title: 'Reset your password', back: 'Back',
        how: 'Choose how to receive the 6-digit code',
        email: 'Email address', phone: 'Phone number',
        target: 'Target', info: "We'll send the code to this destination",
        via: 'Receive the code via', segSms: 'SMS', segTelegram: 'Telegram', segWhatsApp: 'WhatsApp',
        whatsUnavailable: 'Unavailable: no trusted provider delivers WhatsApp OTP to Syria (Meta restrictions) — use SMS or Telegram',
        send: 'Send code', sending: 'Sending...', resending: 'Retry in', seconds: 's',
        resend: 'Resend code', resendNow: "Didn't get the code? Resend it",
        enterCode: 'Verification code', codeHint: 'It can take a minute — check your spam folder too',
        verify: 'Verify code', verifying: 'Verifying...',
        newPass: 'New password', confirm: 'Confirm password',
        save: 'Set new password', saving: 'Setting...',
        mismatch: "Passwords don't match", short: 'Password too short (min 6 chars)',
        invalidPhone: "Number doesn't match this country's format", done: 'Password set! Sign in with it now.',
      };

  const targetString = useMemo(() => {
    if (channel === 'email') return email.trim();
    const v = validatePhoneNational(country.dial, national);
    if (!v.valid) return null;
    return v.country ? `+${country.dial}${v.nationalDigits}` : null;
  }, [channel, email, country, national]);

  const post = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(`/api/auth/password-reset/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || (isAr ? 'فشل الطلب' : 'Request failed'));
    return data;
  };

  const request = async () => {
    setError(null); setBusy(true);
    try {
      const res = await post('request', { channel: channel === 'email' ? 'email' : phoneChannel, target: targetString });
      setVerifiedTarget(String(res.target || ''));
      setHint(String(res.hint || ''));
      setDevCode(String(res.devCode || ''));
      setCooldown(60);
      const t = setInterval(() => setCooldown(c => {
        if (c <= 1) { clearInterval(t); return 0; }
        return c - 1;
      }), 1000);
      setStep('code');
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };

  const verify = async () => {
    setError(null); setBusy(true);
    try {
      const data = await post('verify', { channel: channel === 'email' ? 'email' : phoneChannel, target: targetString, code: code.replace(/[^0-9]/g, '') });
      if (!data.ticket) throw new Error(isAr ? 'لم تُستلم تذكرة التحقق' : 'Verification ticket missing');
      setTicket(String(data.ticket));
      setStep('newPassword');
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    setError(null);
    if (password.length < 6) { setError(T.short); return; }
    if (password !== confirmPassword) { setError(T.mismatch); return; }
    // الهوية التي سنعيدها لشاشة الدخول: الهدف نفسي (بريد أو +هاتف) — الخادم يقبل الاثنين.
    const identity = channel === 'email' ? email.trim() : targetString || '';
    setBusy(true);
    try {
      await post('confirm', { ticket, password });
      onSuccess();
      setError(null);
      if (switchToLogin && identity) switchToLogin(identity);
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  };

  // ---- Render: خطوات ⇒ target / code / newPassword --------------------------------
  return (
    <div className="space-y-4">
      <button
        type="button" onClick={onBack} dir="rtl"
        className="flex items-center gap-1.5 text-xs text-[var(--cds-text-03,#8d8d8d)] hover:text-[var(--cds-text-01,#f4f4f4)]"
      >
        <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
        {T.back}
      </button>

      {step !== 'newPassword' && (
        <>
          {/* اختيار القناة — يظهر في الخطوتين الأولى والثانية لتسهيل التبديل */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-[var(--cds-layer-02,#161616)] rounded-lg">
            {(['email', 'phone'] as const).map((c) => (
              <button
                key={c} type="button"
                onClick={() => { if (step === 'target') { setChannel(c); setError(null); } }}
                className={`py-2 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${
                  channel === c ? 'bg-[#0f62fe] text-white shadow-sm' : 'text-[var(--cds-text-03,#8d8d8d)] hover:text-[var(--cds-text-01,#f4f4f4)]'
                }`}
              >
                {c === 'email' ? <Mail className="w-3.5 h-3.5" /> : <Smartphone className="w-3.5 h-3.5" />}
                <span>{c === 'email' ? T.email : T.phone}</span>
              </button>
            ))}
          </div>

          {step === 'target' && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--cds-text-03,#8d8d8d)]">{T.how}</p>
              {channel === 'email' ? (
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr"
                  placeholder={T.email} required
                  className={`${inputCls} text-left`}
                />
              ) : (
                <>
                  <PhoneWithCountryCode
                    isAr={isAr} country={country} setCountry={setCountry}
                    national={national} setNational={setNational}
                    invalidMsg={targetString === null && national ? T.invalidPhone : null}
                  />
                  {/* منتقي قناة التوصيل: SMS / Telegram / واتساب-غير متاح */}
                  <div>
                    <label className="text-[11px] text-[var(--cds-text-03,#8d8d8d)]">{T.via}</label>
                    <div className="grid grid-cols-3 gap-1 mt-1.5 p-1 bg-[var(--cds-layer-02,#161616)] rounded-lg">
                      {(['sms', 'telegram', 'whatsapp'] as const).map((c) => {
                        const isWhats = c === 'whatsapp';
                        const active = isWhats ? false : phoneChannel === c;
                        return (
                          <button
                            key={c} type="button"
                            disabled={isWhats}
                            onClick={() => { if (!isWhats) { setPhoneChannel(c); setError(null); } }}
                            title={isWhats ? T.whatsUnavailable : undefined}
                            className={`py-1.5 text-[11px] font-semibold rounded-md transition-all ${
                              active
                                ? 'bg-[#0f62fe] text-white shadow-sm'
                                : isWhats
                                  ? 'text-[var(--cds-text-03,#8d8d8d)] opacity-50 cursor-not-allowed line-through'
                                  : 'text-[var(--cds-text-03,#8d8d8d)] hover:text-[var(--cds-text-01,#f4f4f4)]'
                            }`}
                          >
                            {c === 'sms' ? T.segSms : c === 'telegram' ? T.segTelegram : T.segWhatsApp}
                          </button>
                        );
                      })}
                    </div>
                    {channel === 'phone' && null}
                  </div>
                </>
              )}
              <button
                type="button" disabled={busy || !targetString} onClick={request}
                className="w-full py-2.5 bg-[#0f62fe] hover:bg-[#0353e9] disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                {busy ? T.sending : T.send}
              </button>
            </div>
          )}

          {step === 'code' && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--cds-text-03,#8d8d8d)]">
                <span dir="ltr">{verifiedTarget}</span> — {hint || T.codeHint}
              </p>
              {devCode && (
                <p className="text-xs text-[#f0b429] font-mono">
                  <span>{isAr ? '【وضع التطوير】الرمز:' : '[DEV] Code:'}</span>
                  <span dir="ltr" className="mr-1 font-bold">{devCode}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(devCode);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded bg-[#393939] hover:bg-[#4a4a4a] text-[var(--cds-text-01)]"
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? (isAr ? 'تم النسخ' : 'Copied') : (isAr ? 'نسخ' : 'Copy')}
                  </button>
                </p>
              )}
              <div className="flex gap-2 items-center">
                <input
                  ref={codeRef} value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                  inputMode="numeric" maxLength={6} dir="ltr" placeholder="•• •• ••"
                  className={`${inputCls} text-center tracking-[8px] font-mono text-lg flex-1`}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    try {
                      const v = await navigator.clipboard.readText();
                      const digits = v.replace(/[^0-9]/g, '').slice(0, 6);
                      if (digits.length >= 6) setCode(digits);
                    } catch { /* clipboard denied */ }
                  }}
                  title={isAr ? 'لصق من الحافظة' : 'Paste from clipboard'}
                  className="p-2.5 bg-[var(--cds-layer-02,#262626)] hover:bg-[#393939] border border-[var(--cds-border-subtle,#393939)] rounded-lg text-[var(--cds-text-03,#8d8d8d)] hover:text-[var(--cds-text-01)] transition-colors"
                >
                  <ClipboardPaste className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button" disabled={busy || code.replace(/[^0-9]/g, '').length < 6} onClick={verify}
                className="w-full py-2.5 bg-[#0f62fe] hover:bg-[#0353e9] disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {busy ? T.verifying : T.verify}
              </button>
              <button
                type="button" disabled={busy || cooldown > 0 || !targetString}
                onClick={request}
                className="w-full py-2 text-xs text-[var(--cds-text-03,#8d8d8d)] hover:text-[#78a9ff] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cooldown > 0 ? `${T.resending} ${cooldown} ${T.seconds}` : T.resendNow}
              </button>
            </div>
          )}
        </>
      )}

      {step === 'newPassword' && (
        <div className="space-y-3">
          <p className="text-xs text-[#42be65] flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> {T.done}
          </p>
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'} value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder={T.newPass} dir="ltr" required minLength={6}
              className={`${inputCls} pe-10`}
            />
            <button
              type="button" onClick={() => setShowPass(v => !v)}
              className="absolute top-2.5 end-3 text-[var(--cds-text-03,#8d8d8d)] hover:text-[var(--cds-text-01,#f4f4f4)]"
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <input
            type={showPass ? 'text' : 'password'} value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)} placeholder={T.confirm} dir="ltr" required minLength={6}
            className={inputCls}
          />
          <button
            type="button" disabled={busy || password.length < 6 || password !== confirmPassword}
            onClick={confirm}
            className="w-full py-2.5 bg-[#0f62fe] hover:bg-[#0353e9] disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            {busy ? T.saving : T.save}
          </button>
        </div>
      )}

      {error && (
        <div className="text-xs text-[#ff8389] bg-[#da1e28]/15 border border-[#da1e28]/40 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
};

/** إدخال الهاتف: منتقي رمز الدولة + خانة الرقم مع التحقق الحيّ بنمط الدولة. */
export const PhoneWithCountryCode: React.FC<{
  isAr: boolean;
  country: (typeof PHONE_COUNTRIES)[number];
  setCountry: (c: (typeof PHONE_COUNTRIES)[number]) => void;
  national: string;
  setNational: (s: string) => void;
  invalidMsg?: string | null;
}> = ({ isAr, country, setCountry, national, setNational, invalidMsg }) => {
  const ok = validatePhoneNational(country.dial, national).valid;
  return (
    <div className="flex gap-2 items-stretch" dir="ltr">
      <select
        value={country.code} onChange={(e) => setCountry(PHONE_COUNTRIES.find(c => c.code === e.target.value) || PHONE_COUNTRIES[0])}
        className="w-40 shrink-0 px-2 py-2.5 text-sm bg-[var(--cds-layer-02,#262626)] text-[var(--cds-text-01,#f4f4f4)] border border-[var(--cds-border-subtle,#393939)] rounded-lg focus:border-[#0f62fe] focus:outline-hidden"
        aria-label={isAr ? 'رمز الدولة' : 'Country code'}
      >
        {PHONE_COUNTRIES.map(c => (
          <option key={c.code} value={c.code}>
            {c.flag} +{c.dial} {isAr ? c.nameAr : c.name}
          </option>
        ))}
      </select>
      <div className="relative flex-1">
        <span className="absolute top-2.5 start-3 text-[var(--cds-text-03,#8d8d8d)] text-sm font-mono">+{country.dial}</span>
        <input
          value={national} onChange={(e) => setNational(e.target.value.replace(/[^0-9]/g, '').slice(0, 12))}
          inputMode="numeric" dir="ltr" placeholder={country.example}
          className={`${invalidMsg ? 'border-[#da1e28]' : national ? 'border-[#42be65]' : ''} ${inputCls} ps-14 text-left`}
          aria-invalid={!!invalidMsg || !ok}
        />
      </div>
    </div>
  );
};
