/**
 * Product-analytics consent banner.
 *
 * Shown once (on any screen, guests included) until the user decides, and only
 * when a PostHog key is configured. The decision is stored under
 * 'carbon_analytics_consent' and honoured by src/services/analyticsService.ts —
 * PostHog stays opted out until "Allow" is clicked.
 */
import React, { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import {
  getAnalyticsConsent,
  isAnalyticsConfigured,
  setAnalyticsConsent,
  type AnalyticsConsent,
} from '../../services/analyticsService';

function readLanguage(): 'ar' | 'en' {
  try {
    const saved = localStorage.getItem('carbon_language');
    if (saved === 'ar' || saved === 'en') return saved;
  } catch {
    /* noop */
  }
  return 'ar';
}

export const AnalyticsConsentBanner: React.FC = () => {
  const [consent, setConsent] = useState<AnalyticsConsent | null>(() => getAnalyticsConsent());
  const isAr = readLanguage() === 'ar';

  if (!isAnalyticsConfigured() || consent) return null;

  const decide = (decision: AnalyticsConsent) => {
    setAnalyticsConsent(decision);
    setConsent(decision);
  };

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      role="dialog"
      aria-label={isAr ? 'موافقة تحليلات المنتج' : 'Product analytics consent'}
      className="fixed bottom-0 inset-x-0 z-[70] bg-[var(--cds-layer-02,#262626)] border-t border-[var(--cds-border-subtle,#393939)] shadow-2xl"
    >
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-start gap-2.5 flex-1">
          <BarChart3 className="w-4 h-4 mt-0.5 shrink-0 text-[#33b1ff]" />
          <p className="text-xs font-sans leading-relaxed text-[var(--cds-text-02,#c6c6c6)]">
            {isAr
              ? 'نساعد على تحسين المنصة عبر تحليلات منتج مجهولة الهوية (PostHog): أي شاشات تُستخدم ومسارات التنقل بينها — بلا أي محتوى من مجموعات بياناتك. تبقى التحليلات متوقفة حتى موافقتك، ويمكنك تغيير رأيك في أي وقت بمسح هذا الاختيار من إعدادات المتصفح.'
              : 'Help us improve the platform with anonymous product analytics (PostHog): which screens are used and how people move between them — never the contents of your datasets. Analytics stays off until you allow it, and you can change your mind later by clearing this browser preference.'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          <button
            onClick={() => decide('denied')}
            className="px-3 py-1.5 text-xs font-mono text-[var(--cds-text-02,#c6c6c6)] border border-[var(--cds-border-subtle,#393939)] hover:bg-[var(--cds-layer-03,#393939)] transition-colors"
          >
            {isAr ? 'رفض' : 'Decline'}
          </button>
          <button
            onClick={() => decide('granted')}
            className="carbon-btn-primary text-xs font-mono font-bold uppercase"
          >
            {isAr ? 'سماح' : 'Allow analytics'}
          </button>
        </div>
      </div>
    </div>
  );
};
