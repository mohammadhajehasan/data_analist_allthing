import { useEffect, useState } from 'react';
import type { AiQuotaInfo } from '../../services/aiQuotaService';
import { formatResetCountdown } from '../../services/aiQuotaService';

/**
 * بادج حصة الاستخدام اليومية لمفتاح المنصة:
 *   - عدّاد تقدم used/limit مع شريط لوني (أخضر→كهرماني→أحمر).
 *   - تنازلي حتى التجدد (منتصف ليل UTC) يتحدث كل دقيقة.
 *   - حالة نفاذ: شريط أحمر + CTA "أضف مفتاحك الخاص".
 *  أما المستخدم أصحاب مفاتيحهم (BYOK) أو محلي Ollama فلا يستهلكون الحصة —
 *  تظهر عليهم النقطة الفارغة عند exhaustive only.
 */

type State =
  | { kind: 'loading' }
  | { kind: 'exhausted'; quota: AiQuotaInfo }
  | { kind: 'normal'; quota: AiQuotaInfo }
  | { kind: 'unlimited'; quota: AiQuotaInfo };

function toState(quota: AiQuotaInfo | null): State {
  if (!quota) return { kind: 'loading' };
  if (quota.unlimited) return { kind: 'unlimited', quota };
  if (!quota.ok || quota.remaining <= 0) return { kind: 'exhausted', quota };
  return { kind: 'normal', quota };
}

const PROGRESS_TINT: Record<'exhausted' | 'normal', string> = {
  exhausted: 'bg-red-500/70',
  normal: 'bg-emerald-500/70',
};

interface AiQuotaBadgeProps {
  /** يفتح نافذة إدارة المفاتيح (إضافة مفتاح المستخدم) عند النقر. */
  onManageProviders: () => void;
  isAr: boolean;
  /** تمييز بصري عند استخدامه داخل قائمة المختار بدل الـ dropdown. */
  variant?: 'inline' | 'dropdown';
  quota: AiQuotaInfo | null;
  isLoading: boolean;
}

export const AiQuotaBadge: React.FC<AiQuotaBadgeProps> = ({
  onManageProviders,
  isAr,
  variant = 'inline',
  quota,
  isLoading,
}) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const state = toState(quota);
  if (state.kind === 'loading') {
    return (
      <div
        className={variant === 'dropdown' ? 'px-3 py-2' : ''}
        aria-busy="true"
      >
        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
          <span>{isAr ? 'حصة مفتاح المنصة اليومية' : 'Daily server-key quota'}</span>
          <span>···</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-700/60 animate-pulse" />
      </div>
    );
  }

  const { quota: q } = state;

  if (state.kind === 'unlimited') {
    return (
      <div className={variant === 'dropdown' ? 'px-3 py-2' : ''}>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400">
            {isAr ? 'حصة مفتاح المنصة اليومية' : 'Daily server-key quota'}
          </span>
          <span className="flex items-center gap-1 font-medium text-fuchsia-300">
            <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400" />
            {isAr ? 'غير محدود' : 'Unlimited'}
          </span>
        </div>
      </div>
    );
  }

  const remainingPct = q.limit > 0 ? Math.max(0, Math.min(100, (q.remaining / q.limit) * 100)) : 0;
  const usedPct = 100 - remainingPct;
  const tint = state.kind === 'exhausted' ? PROGRESS_TINT.exhausted : PROGRESS_TINT.normal;
  const exhausted = state.kind === 'exhausted';
  const countdown = formatResetCountdown(q.resetAt, isAr, now);

  return (
    <div className={variant === 'dropdown' ? 'px-3 py-2' : ''}>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-slate-400">
          {isAr ? 'حصة مفتاح المنصة اليومية' : 'Daily server-key quota'}
        </span>
        <span className={exhausted ? 'font-semibold text-red-400' : 'font-medium text-slate-300'}>
          {isAr ? `متبقٍ ${q.remaining}/${q.limit}` : `${q.remaining}/${q.limit} left`}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-700/60 overflow-hidden" role="progressbar"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(remainingPct)}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${tint}`}
          style={{ width: `${usedPct}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
        <span>
          {isAr ? `يتجدد بعد ${countdown}` : `resets in ${countdown}`}
        </span>
        {exhausted && (
          <button
            type="button"
            onClick={onManageProviders}
            className="text-fuchsia-300 hover:text-fuchsia-200 hover:underline font-medium"
          >
            {isAr ? 'أضف مفتاحك الخاص ←' : 'Add your own key →'}
          </button>
        )}
      </div>
      {exhausted && (
        <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
          {isAr
            ? 'الطلبات عبر مفتاحك الخاص أو Ollama المحلي لا تستهلك هذه الحصة.'
            : 'Requests via your own key or local Ollama never consume this quota.'}
        </p>
      )}
    </div>
  );
};

export default AiQuotaBadge;
