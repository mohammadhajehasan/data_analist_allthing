import React from 'react';

/**
 * مكوّن حالة فراغ موحّد لكل الأقسام — نفس الأسلوب البصري أينما استُخدم:
 * أيقونة هادئة + عنوان عربي واضح + وصف قصير + زر CTA يوجّه للخطوة التالية.
 * يُستخدم قبل أي وصول لخصائص `activeDataset` حتى لا تنهار الصفحة ببيانات فارغة.
 */
export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  ctaLabel?: string;
  onCta?: () => void;
  /** رسالة دقيقة تظهر تحته إن وجدت (مثل اسم الخادم/المسار) */
  hint?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, ctaLabel, onCta, hint }) => (
  <div className="carbon-tile p-12 text-center space-y-3">
    <div className="w-12 h-12 mx-auto mb-1 text-[var(--cds-interactive-01)] flex items-center justify-center">
      {icon}
    </div>
    <p className="text-sm font-bold text-[var(--cds-text-01)]">{title}</p>
    {description && (
      <p className="text-xs text-[var(--cds-text-02)] leading-relaxed max-w-md mx-auto">{description}</p>
    )}
    {ctaLabel && onCta && (
      <button
        onClick={onCta}
        className="mt-2 inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-[var(--cds-interactive-01)] hover:bg-[var(--cds-interactive-01-hover)] text-white text-xs font-semibold transition-colors shadow-sm"
      >
        {ctaLabel}
      </button>
    )}
    {hint && <p className="text-[11px] font-mono text-[var(--cds-text-03)] pt-1">{hint}</p>}
  </div>
);
