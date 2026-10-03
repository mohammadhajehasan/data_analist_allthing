import type { AIProviderId } from '../types/aiProviders';

/**
 * آلية "انتقال عميق" لحقل مفتاح مزوّد في صفحة النماذج:
 * الصفحة تُحمَّل بشكل كسول، لذا يُخزَّن الطلبPending وينطلق حدث window —
 * من كانت الصفحة مفتوحة استجابت فوراً (وتستهلك الطلب)، وإلا يستقبلها
 * مستمع التحميل في consumePendingAiKeyFocus.
 */

export const AI_KEY_FOCUS_EVENT = 'ai-focus-key-field';

let pendingProvider: AIProviderId | null = null;

/** اطلب فتح مزوّد محدد وتركيز حقل مفتاحه في صفحة النماذج. */
export function requestAiKeyFocus(providerId: AIProviderId): void {
  pendingProvider = providerId;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AI_KEY_FOCUS_EVENT, { detail: providerId }));
  }
}

/** تستخدمه صفحة النماذج عند التحميل: تعيد آخر طلب معلق (إن وجد) وتستهلكه. */
export function consumePendingAiKeyFocus(): AIProviderId | null {
  const p = pendingProvider;
  pendingProvider = null;
  return p;
}
