import React, { useCallback, useEffect, useState } from 'react';
import {
  UserRound, Mail, Phone, Linkedin, MessageCircle, Star, Send,
  ShieldCheck, Loader2, CheckCircle2, Inbox, Clock,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

/**
 * تواصل مع المطور — معلومات المطوّر وقنوات التواصل + التقييم والاقتراحات.
 *
 * • بطاقة تعريف بالمطوّر (مهندس علوم حاسب — تطوير برمجيات وتحليل بيانات وأنظمة ذكاء اصطناعي).
 * • قنوات نفسية واتساب/هاتف + بريد إلكتروني + LinkedIn.
 * • تقييم المنصّة (نجوم 1..5) + تعليق + اقتراح — يُرسل إلى "صفحة طلبات الاقتراحات" عند الأدمن.
 * • ردود الإدارة الواردة تصل للمستخدم هنا (تنبيه + قائمة الردود المؤرشفة).
 */

interface FeedbackReply {
  id: string;
  rating: number;
  comment: string | null;
  suggestion: string | null;
  adminReply: string;
  repliedAt: string;
}

interface PendingFeedback {
  id: string;
  rating: number;
  comment: string | null;
  suggestion: string | null;
  createdAt: string;
}

const DEVELOPER = {
  name: 'Ahmad Al Farahat',
  nameAr: 'أحمد الفراحات',
  titleAr: 'مهندس علوم حاسب — تطوير برمجيات، تحليل وعلوم بيانات، وأنظمة الذكاء الاصطناعي',
  titleEn: 'Computer Science Engineer — Software Development, Data Analytics & Engineering, AI Systems',
  phone: '+963991758886',
  whatsapp: 'https://wa.me/963991758886',
  email: 'ahmadalfarahat099175@gmail.com',
  linkedinProfile: 'www.linkedin.com/in/ahmad-al-farahat-3b6a4226a',
  linkedinUrl: 'https://www.linkedin.com/in/ahmad-al-farahat-3b6a4226a',
  linkedinHandle: 'ahmad-al-farahat',
  linkedinEmail: 'ahmadalfarahat099175@gmail.com',
};

const StarRow: React.FC<{ value: number; onPick?: (n: number) => void; size?: string }> = ({ value, onPick, size = 'w-8 h-8' }) => (
  <div className="flex items-center gap-1" dir="ltr">
    {[1, 2, 3, 4, 5].map(n => (
      <button
        key={n}
        type="button"
        disabled={!onPick}
        onClick={() => onPick?.(n)}
        aria-label={`${n} / 5`}
        className={`${onPick ? 'hover:scale-110 transition-transform cursor-pointer' : 'cursor-default'}`}
      >
        <Star
          className={`${size} ${n <= value ? 'text-[#f1c21b] fill-[#f1c21b]' : 'text-[var(--cds-text-03)]'} ${onPick ? 'stroke-1' : ''}`}
        />
      </button>
    ))}
  </div>
);

const ContactChannel: React.FC<{ icon: React.ReactNode; label: string; value: string; href?: string; onCopy?: boolean; isAr: boolean }> = ({
  icon, label, value, href, onCopy, isAr,
}) => {
  const { toast } = useApp();
  return (
    <a
      href={href}
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel="noreferrer"
      onClick={() => {
        if (onCopy) {
          navigator.clipboard?.writeText(value).catch(() => void 0);
          toast.success(isAr ? 'تم النسخ' : 'Copied');
        }
      }}
      className="flex items-center gap-3 rounded-xl border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] hover:border-[var(--cds-interactive-01)] hover:bg-[var(--cds-layer-02)] px-4 py-3 transition-colors"
    >
      <span className="w-9 h-9 rounded-lg bg-[var(--cds-interactive-01)]/10 text-[var(--cds-interactive-01)] flex items-center justify-center shrink-0">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-mono uppercase tracking-wider text-[var(--cds-text-03)]">{label}</span>
        <span className="block text-xs font-medium text-[var(--cds-text-01)] truncate" dir="ltr">{value}</span>
      </span>
    </a>
  );
};

export const ContactDeveloperPage: React.FC = () => {
  const { user, language, t, toast } = useApp();
  const isAr = language === 'ar';
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [replies, setReplies] = useState<FeedbackReply[]>([]);
  const [pending, setPending] = useState<PendingFeedback[]>([]);

  const loadMine = useCallback(async () => {
    try {
      const res = await fetch('/api/developer/feedback/my', {
        headers: { Authorization: `Bearer ${localStorage.getItem('carbon_auth_token') || ''}` },
      });
      if (res.ok) {
        const data = await res.json();
        setReplies(data.replies || []);
        setPending(data.pending || []);
      }
    } catch { /* غير خطير — الواجهة تعمل دون الردود */ }
  }, []);

  useEffect(() => { loadMine(); }, [loadMine]);

  const submit = async (): Promise<void> => {
    if (!rating) {
      toast.warning(isAr ? 'اختر تقييماً' : 'Pick a rating', isAr ? 'حدد من 1 إلى 5 نجوم أولاً' : 'Select 1 to 5 stars first');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/developer/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('carbon_auth_token') || ''}`,
        },
        body: JSON.stringify({ rating, comment, suggestion }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t.common.error);
      setSent(true);
      setRating(0);
      setComment('');
      setSuggestion('');
      toast.success(isAr ? 'شكراً لتقييمك!' : 'Thanks for your feedback!', isAr ? 'وصل تقييمك واقتراحك إلى الإدارة' : 'Your rating and suggestion reached the administration');
      loadMine();
    } catch (err: any) {
      toast.error(t.common.error, err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* بطاقة تعريف المطوّر */}
      <section className="rounded-2xl border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] overflow-hidden">
        <div className="relative px-6 py-6 bg-[var(--cds-layer-02)] border-b border-[var(--cds-border-subtle)]">
          <div className="absolute -top-24 -start-24 w-64 h-64 rounded-full bg-[var(--cds-interactive-01)] opacity-10 blur-3xl pointer-events-none" />
          <div className="flex items-start gap-4 relative">
            <div className="w-16 h-16 rounded-2xl bg-[var(--cds-interactive-01)] text-white flex items-center justify-center shrink-0 shadow-lg">
              <UserRound className="w-8 h-8" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-[var(--cds-text-01)]" dir="ltr">{DEVELOPER.name}</h1>
              <p className="text-sm text-[var(--cds-interactive-01)] font-semibold mt-0.5">{DEVELOPER.nameAr}</p>
              <p className="text-xs text-[var(--cds-text-02)] mt-2 leading-relaxed max-w-2xl">
                {isAr ? DEVELOPER.titleAr : DEVELOPER.titleEn}
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <h2 className="text-[11px] font-mono font-bold uppercase tracking-widest text-[var(--cds-text-03)]">
            {isAr ? 'قنوات التواصل المباشر' : 'Direct contact channels'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <ContactChannel
              isAr={isAr} icon={<MessageCircle className="w-4 h-4" />}
              label={isAr ? 'واتساب' : 'WhatsApp'} value={DEVELOPER.phone} href={DEVELOPER.whatsapp}
            />
            <ContactChannel
              isAr={isAr} icon={<Phone className="w-4 h-4" />}
              label={isAr ? 'هاتف وتس' : 'Phone'} value={DEVELOPER.phone}
              onCopy
            />
            <ContactChannel
              isAr={isAr} icon={<Mail className="w-4 h-4" />}
              label={isAr ? 'البريد الإلكتروني' : 'Email'} value={DEVELOPER.email} href={`mailto:${DEVELOPER.email}`}
            />
            <ContactChannel
              isAr={isAr} icon={<Linkedin className="w-4 h-4" />}
              label={isAr ? 'LinkedIn — ملف عام' : 'LinkedIn — public profile'}
              value={DEVELOPER.linkedinUrl} href={DEVELOPER.linkedinUrl}
            />
          </div>

          {/* تفاصيل LinkedIn */}
          <div className="rounded-xl border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] p-4 space-y-2">
            <div className="flex items-center gap-2 text-[var(--cds-interactive-01)]">
              <Linkedin className="w-4 h-4" />
              <span className="text-xs font-bold">{isAr ? 'معلومات ملف LinkedIn' : 'LinkedIn profile details'}</span>
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-xs">
              <div className="flex gap-1.5">
                <dt className="text-[var(--cds-text-03)] shrink-0">{isAr ? 'اسم العرض:' : 'Display name:'}</dt>
                <dd className="font-mono text-[var(--cds-text-01)]" dir="ltr">{DEVELOPER.name}</dd>
              </div>
              <div className="flex gap-1.5 min-w-0">
                <dt className="text-[var(--cds-text-03)] shrink-0">{isAr ? 'معرّف الملف:' : 'Profile handle:'}</dt>
                <dd className="font-mono text-[var(--cds-text-01)] truncate" dir="ltr">{DEVELOPER.linkedinHandle}</dd>
              </div>
              <div className="flex gap-1.5 min-w-0">
                <dt className="text-[var(--cds-text-03)] shrink-0">{isAr ? 'البريد:' : 'Email:'}</dt>
                <dd className="font-mono text-[var(--cds-text-01)] truncate" dir="ltr">{DEVELOPER.linkedinEmail}</dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      {/* نموذج التقييم والاقتراح */}
      <section className="rounded-2xl border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Star className="w-4 h-4 text-[#f1c21b]" />
          <h2 className="text-sm font-bold text-[var(--cds-text-01)]">
            {isAr ? 'قيّم المنصّة وأرسل اقتراحك' : 'Rate the platform & send a suggestion'}
          </h2>
          <span className="ms-auto text-[10px] font-mono text-[var(--cds-text-03)]">
            {isAr ? 'الاقتراحات تصل مباشرة إلى صفحة طلبات الاقتراحات عند الإدارة' : 'Suggestions go straight to the admin suggestions inbox'}
          </span>
        </div>

        {sent && (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--cds-interactive-01)]/40 bg-[var(--cds-interactive-01)]/10 px-4 py-2.5 text-xs text-[var(--cds-interactive-01)]">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {isAr
              ? 'تم إرسال تقييمك — عندما يرد فريق الإدارة على اقتراحك سيصلك رده هنا وكتنبيه.'
              : 'Feedback sent — when the team replies, the response reaches you here and as a notification.'}
          </div>
        )}

        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-xs text-[var(--cds-text-02)]">{isAr ? 'تقييمك من 5 نجوم:' : 'Your rating (1-5 stars):'}</span>
          <StarRow value={rating} onPick={n => { setRating(n); setSent(false); }} />
          <span className="text-[10px] font-mono text-[var(--cds-text-03)]">{rating ? `${rating}/5` : '—'}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--cds-text-02)]">
              {isAr ? 'تعليق على تجربتك (اختياري)' : 'Comment on your experience (optional)'}
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder={isAr ? 'ماذا يعجبك في المنصّة؟ وما الذي نقصده تحسيناً؟' : 'What do you like? What should we improve?'}
              className="w-full rounded-xl border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] px-3 py-2 text-xs text-[var(--cds-text-01)] placeholder:text-[var(--cds-text-03)] focus:outline-none focus:border-[var(--cds-interactive-01)] resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-[var(--cds-text-02)]">
              {isAr ? 'اقتراحك للتحسين (اختياري)' : 'Improvement suggestion (optional)'}
            </label>
            <textarea
              value={suggestion}
              onChange={e => setSuggestion(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder={isAr ? 'ميزة جديدة، تحسين في الأداء، فكرة تقرير…' : 'New feature, performance, reporting idea…'}
              className="w-full rounded-xl border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] px-3 py-2 text-xs text-[var(--cds-text-01)] placeholder:text-[var(--cds-text-03)] focus:outline-none focus:border-[var(--cds-interactive-01)] resize-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={sending || !user?.id}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--cds-interactive-01)] text-white px-5 py-2.5 text-xs font-bold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {isAr ? 'إرسال التقييم والاقتراح' : 'Send rating & suggestion'}
          </button>
          {user?.id && (
            <span className="text-[10px] font-mono text-[var(--cds-text-03)]">
              {isAr ? 'بصفتك' : 'as'} {user.name}
            </span>
          )}
        </div>
      </section>

      {/* اقتراحاتي قيد الانتظار */}
      {pending.length > 0 && (
        <section className="rounded-2xl border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[var(--cds-text-02)]" />
            <h2 className="text-sm font-bold text-[var(--cds-text-01)]">
              {isAr ? `اقتراحاتك بانتظار الرد (${pending.length})` : `Your pending suggestions (${pending.length})`}
            </h2>
          </div>
          {pending.map(p => (
            <div key={p.id} className="rounded-xl border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] px-4 py-3 space-y-1">
              <div className="flex items-center gap-2">
                <StarRow value={p.rating} size="w-3.5 h-3.5" />
                <span className="text-[10px] font-mono text-[var(--cds-text-03)] ms-auto" dir="ltr">
                  {new Date(p.createdAt).toLocaleString(isAr ? 'ar' : 'en')}
                </span>
              </div>
              {p.comment && <p className="text-xs text-[var(--cds-text-02)]">{p.comment}</p>}
              {p.suggestion && <p className="text-xs text-[var(--cds-text-01)]">💭 {p.suggestion}</p>}
            </div>
          ))}
        </section>
      )}

      {/* ردود الإدارة الواردة */}
      <section className="rounded-2xl border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] p-6 space-y-3">
        <div className="flex items-center gap-2">
          <Inbox className="w-4 h-4 text-[var(--cds-interactive-01)]" />
          <h2 className="text-sm font-bold text-[var(--cds-text-01)]">
            {isAr ? 'ردود الإدارة على اقتراحاتك' : 'Administration replies to your suggestions'}
          </h2>
          <span className="ms-auto inline-flex items-center gap-1 text-[10px] font-mono text-[var(--cds-text-03)]">
            <ShieldCheck className="w-3 h-3" />
            {isAr ? 'كل اقتراح مُرَدّ عليه يُحذَف تلقائياً من قائمة الانتظار بعد أرشفة الرد' : 'Replied suggestions are auto-archived & removed from the queue'}
          </span>
        </div>
        {replies.length === 0 ? (
          <p className="text-xs text-[var(--cds-text-03)] py-4 text-center">
            {isAr ? 'لا ردود بعد — أرسل اقتراحك الأول وسنرد عليه هنا.' : 'No replies yet — send your first suggestion and we will answer here.'}
          </p>
        ) : (
          replies.map(r => (
            <div key={r.id} className="rounded-xl border border-[var(--cds-interactive-01)]/30 bg-[var(--cds-interactive-01)]/5 px-4 py-3 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <StarRow value={r.rating} size="w-3.5 h-3.5" />
                <span className="text-[10px] font-mono text-[var(--cds-text-03)] ms-auto" dir="ltr">
                  {new Date(r.repliedAt).toLocaleString(isAr ? 'ar' : 'en')}
                </span>
              </div>
              {r.comment && <p className="text-[11px] text-[var(--cds-text-03)]">「{r.comment}」</p>}
              {r.suggestion && <p className="text-xs text-[var(--cds-text-02)]">💭 {r.suggestion}</p>}
              <div className="rounded-lg bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] px-3 py-2 space-y-1">
                <span className="block text-[10px] font-mono uppercase tracking-wider text-[var(--cds-interactive-01)]">
                  {isAr ? 'رد الإدارة' : 'Administration reply'}
                </span>
                <p className="text-xs text-[var(--cds-text-01)] leading-relaxed">{r.adminReply}</p>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
};

export default ContactDeveloperPage;
