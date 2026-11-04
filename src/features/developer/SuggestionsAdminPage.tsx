import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Inbox, Star, Send, Loader2, MessageSquareQuote, Users, TrendingUp,
  BarChart3, ShieldAlert, Clock, CheckCircle2, RotateCcw, Radar,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

/**
 * صفحة طلبات الاقتراحات — للأدمن فقط.
 *
 * • لوحة رضا العملاء: متوسط التقييم، نسبة الرضا (4..5)، توزيع النجوم، عدد المقيّمين.
 * • صندوق الاقتراحات المعلّقة: بطاقة لكل اقتراح (مستخدم + تقييم + تعليق + اقتراح)
 *   مع حقل رد — عند الإرسال يُؤرشَف السجل، يصل الرد للمستخدم كتنبيه،
 *   ويُحذَف الاقتراح نهائياً من القائمة (الحذف التلقائي بعد الرد).
 */

interface PendingFeedback {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  rating: number;
  comment: string | null;
  suggestion: string | null;
  createdAt: string;
}

interface RatingStats {
  total: number;
  average: number;
  satisfactionPct: number;
  distribution: number[]; // 1..5
  pending: number;
}

const StarRow: React.FC<{ value: number; size?: string }> = ({ value, size = 'w-3.5 h-3.5' }) => (
  <div className="flex items-center gap-0.5" dir="ltr">
    {[1, 2, 3, 4, 5].map(n => (
      <Star
        key={n}
        className={`${size} ${n <= value ? 'text-[#f1c21b] fill-[#f1c21b]' : 'text-[var(--cds-text-03)]/40'}`}
      />
    ))}
  </div>
);

export const SuggestionsAdminPage: React.FC = () => {
  const { language, toast, t } = useApp();
  const isAr = language === 'ar';
  const [pending, setPending] = useState<PendingFeedback[]>([]);
  const [stats, setStats] = useState<RatingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sendingId, setSendingId] = useState<string | null>(null);

  const authHeaders = useCallback((): Record<string, string> => ({
    Authorization: `Bearer ${localStorage.getItem('carbon_auth_token') || ''}`,
  }), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/developer/feedback', { headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t.common.error);
      setPending(data.pending || []);
      setStats(data.stats || null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, t]);

  useEffect(() => { load(); }, [load]);

  const reply = async (fb: PendingFeedback): Promise<void> => {
    const text = (replyDrafts[fb.id] || '').trim();
    if (!text) {
      toast.warning(isAr ? 'اكتب الرد أولاً' : 'Write a reply first');
      return;
    }
    setSendingId(fb.id);
    try {
      const res = await fetch(`/api/developer/feedback/${fb.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ reply: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t.common.error);
      toast.success(isAr ? 'أُرسل الرد' : 'Reply sent', isAr ? 'وصل الرد للمستخدم كتنبيه وحُذف الاقتراح من القائمة' : 'The user was notified and the suggestion was removed');
      setPending(prev => prev.filter(x => x.id !== fb.id));
      setStats(null);
      load();
    } catch (err: any) {
      toast.error(t.common.error, err.message);
    } finally {
      setSendingId(null);
    }
  };

  const distMax = useMemo(() => Math.max(1, ...(stats?.distribution || [0, 0, 0, 0, 0])), [stats]);

  return (
    <div className="space-y-6" dir="rtl">
      {/* عنوان */}
      <section className="rounded-2xl border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] px-6 py-4 flex items-center gap-3 flex-wrap">
        <span className="w-10 h-10 rounded-xl bg-[var(--cds-interactive-01)]/10 text-[var(--cds-interactive-01)] flex items-center justify-center">
          <Inbox className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-base font-bold text-[var(--cds-text-01)]">
            {isAr ? 'صفحة طلبات الاقتراحات' : 'Suggestions Inbox'}
          </h1>
          <p className="text-[11px] text-[var(--cds-text-03)]">
            {isAr
              ? 'اقتراحات المستخدمين وتقييماتهم على المنصّة — الرد يصل للمستخدم فوراً ثم يُحذَف الاقتراح نهائياً'
              : 'User suggestions & ratings — a reply notifies the user, then the suggestion is permanently removed'}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="ms-auto inline-flex items-center gap-2 rounded-xl border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] px-4 py-2 text-xs font-semibold hover:border-[var(--cds-interactive-01)] disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
          {isAr ? 'تحديث' : 'Refresh'}
        </button>
      </section>

      {/* لوحة رضا العملاء */}
      <section className="rounded-2xl border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] p-6 space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[var(--cds-interactive-01)]" />
          <h2 className="text-sm font-bold text-[var(--cds-text-01)]">
            {isAr ? 'رضا العملاء عن المنصّة' : 'Customer satisfaction'}
          </h2>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-[#da1e28]/40 bg-[#da1e28]/10 px-4 py-2.5 text-xs text-[#fa4d56]">
            <ShieldAlert className="w-4 h-4 shrink-0" /> {error}
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* المؤشرات */}
            <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] p-4">
                <span className="block text-[10px] font-mono uppercase tracking-wider text-[var(--cds-text-03)]">
                  {isAr ? 'متوسط التقييم' : 'Average rating'}
                </span>
                <span className="block text-2xl font-bold text-[var(--cds-text-01)] mt-1" dir="ltr">
                  {stats.average.toFixed(2)}
                  <span className="text-sm text-[var(--cds-text-03)]">/5</span>
                </span>
                <StarRow value={Math.round(stats.average)} />
              </div>
              <div className="rounded-xl border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] p-4">
                <span className="block text-[10px] font-mono uppercase tracking-wider text-[var(--cds-text-03)]">
                  {isAr ? 'نسبة الرضا' : 'Satisfaction'}
                </span>
                <span className="block text-2xl font-bold text-[#24a148] mt-1" dir="ltr">{stats.satisfactionPct}%</span>
                <span className="block text-[10px] text-[var(--cds-text-03)]">
                  {isAr ? 'الذين قيّموا 4 أو 5 نجوم' : 'rated 4 or 5 stars'}
                </span>
              </div>
              <div className="rounded-xl border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] p-4">
                <span className="block text-[10px] font-mono uppercase tracking-wider text-[var(--cds-text-03)]">
                  {isAr ? 'عدد المقيّمين' : 'Ratings count'}
                </span>
                <span className="flex items-center gap-1.5 text-2xl font-bold text-[var(--cds-text-01)] mt-1" dir="ltr">
                  <Users className="w-4 h-4 text-[var(--cds-text-03)]" />
                  {stats.total}
                </span>
              </div>
              <div className="rounded-xl border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] p-4">
                <span className="block text-[10px] font-mono uppercase tracking-wider text-[var(--cds-text-03)]">
                  {isAr ? 'بانتظار الرد' : 'Pending replies'}
                </span>
                <span className="flex items-center gap-1.5 text-2xl font-bold text-[#f1c21b] mt-1" dir="ltr">
                  <Clock className="w-4 h-4" />
                  {stats.pending}
                </span>
              </div>
            </div>

            {/* توزيع النجوم */}
            <div className="rounded-xl border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] p-4 lg:col-span-2">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-3.5 h-3.5 text-[var(--cds-text-02)]" />
                <span className="text-xs font-bold text-[var(--cds-text-02)]">
                  {isAr ? 'توزيع التقييمات على النجوم' : 'Rating distribution by stars'}
                </span>
              </div>
              <div className="space-y-2" dir="rtl">
                {[5, 4, 3, 2, 1].map(s => {
                  const count = stats.distribution[s - 1] || 0;
                  const pct = stats.total ? Math.round((count / stats.total) * 100) : 0;
                  return (
                    <div key={s} className="flex items-center gap-3">
                      <span className="flex items-center gap-1 text-[10px] font-mono text-[var(--cds-text-03)] w-10" dir="ltr">
                        {s} <Star className="w-3 h-3 text-[#f1c21b] fill-[#f1c21b]" />
                      </span>
                      <div className="flex-1 h-3 rounded-full bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[var(--cds-interactive-01)] transition-all"
                          style={{ width: `${count ? Math.max(pct, 4) : 0}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-[var(--cds-text-02)] w-16 text-end" dir="ltr">
                        {count} · {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* صندوق الاقتراحات */}
      <section className="rounded-2xl border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] p-6 space-y-3">
        <div className="flex items-center gap-2">
          <MessageSquareQuote className="w-4 h-4 text-[var(--cds-interactive-01)]" />
          <h2 className="text-sm font-bold text-[var(--cds-text-01)]">
            {isAr ? `الاقتراحات المعلّقة (${pending.length})` : `Pending suggestions (${pending.length})`}
          </h2>
          {pending.length > 0 && !stats && <Radar className="w-3.5 h-3.5 text-[#f1c21b] animate-pulse" />}
        </div>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-[var(--cds-text-03)]">
            <Loader2 className="w-4 h-4 animate-spin" /> {t.common.loading}
          </div>
        )}

        {!loading && pending.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <CheckCircle2 className="w-8 h-8 text-[#24a148]" />
            <p className="text-xs text-[var(--cds-text-03)]">
              {isAr ? 'لا اقتراحات معلّقة — كل الطلبات مُرَدّ عليها ✓' : 'No pending suggestions — all have been replied to ✓'}
            </p>
          </div>
        )}

        {pending.map(fb => (
          <div key={fb.id} className="rounded-xl border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] p-4 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="w-8 h-8 rounded-lg bg-[var(--cds-interactive-01)]/10 text-[var(--cds-interactive-01)] flex items-center justify-center text-[11px] font-bold shrink-0" dir="ltr">
                {(fb.userName || '?').slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <span className="block text-xs font-bold text-[var(--cds-text-01)]">{fb.userName}</span>
                <span className="block text-[10px] font-mono text-[var(--cds-text-03)] truncate" dir="ltr">{fb.userEmail}</span>
              </div>
              <StarRow value={fb.rating} />
              <span className="ms-auto text-[10px] font-mono text-[var(--cds-text-03)]" dir="ltr">
                {new Date(fb.createdAt).toLocaleString(isAr ? 'ar' : 'en')}
              </span>
            </div>

            {fb.comment && (
              <p className="text-xs text-[var(--cds-text-02)] leading-relaxed border-s-2 border-[var(--cds-border-subtle)] ps-3">
                {fb.comment}
              </p>
            )}
            {fb.suggestion && (
              <p className="text-xs text-[var(--cds-text-01)] leading-relaxed rounded-lg bg-[var(--cds-interactive-01)]/5 border border-[var(--cds-interactive-01)]/20 px-3 py-2">
                💡 {fb.suggestion}
              </p>
            )}

            {/* نموذج الرد */}
            <div className="flex items-end gap-2">
              <textarea
                value={replyDrafts[fb.id] || ''}
                onChange={e => setReplyDrafts(prev => ({ ...prev, [fb.id]: e.target.value }))}
                rows={2}
                maxLength={1000}
                placeholder={isAr ? 'اكتب ردك للمستخدم… سيصل كتنبيه فوري ويتأرشَف الاقتراح تلقائياً بعد الرد' : 'Write your reply… it reaches the user instantly and the suggestion archives itself'}
                className="flex-1 rounded-xl border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] px-3 py-2 text-xs text-[var(--cds-text-01)] placeholder:text-[var(--cds-text-03)] focus:outline-none focus:border-[var(--cds-interactive-01)] resize-none"
              />
              <button
                type="button"
                onClick={() => reply(fb)}
                disabled={sendingId === fb.id}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--cds-interactive-01)] text-white px-4 py-2.5 text-xs font-bold hover:opacity-90 disabled:opacity-50 shrink-0"
              >
                {sendingId === fb.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                {isAr ? 'أرسل الرد' : 'Send reply'}
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
};

export default SuggestionsAdminPage;
