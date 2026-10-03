import type { AIProviderConfig, AIProviderId } from '../types/aiProviders';

export interface AiAccessCheck {
  ok: boolean;
  /** True when the active provider is local (Ollama) — no key needed, always allowed. */
  isLocal: boolean;
  reason?: 'no-key' | 'no-endpoint';
}

// ---------------------------------------------------------------------------
// Server-side AI providers — مزوّدو AI المفعّلون بمفاتيح بيئة الخادم.
// يُستعلم /api/health مرة واحدة لكل جلسة (ذاكرة على مستوى الوحدة) وتشترك في
// النتيجة شارة الهيدر (useAiReadiness) ونقاط الحرس كلها.
// ---------------------------------------------------------------------------

let cachedServerProviders: AIProviderId[] | null = null;
let inflight: Promise<AIProviderId[]> | null = null;

export function fetchServerAiProviders(): Promise<AIProviderId[]> {
  if (cachedServerProviders) return Promise.resolve(cachedServerProviders);
  if (!inflight) {
    inflight = fetch('/api/health', { cache: 'no-store' })
      .then(r => r.json())
      .then((d: { aiProvidersEnabled?: unknown; aiEnabled?: boolean }) => {
        cachedServerProviders = Array.isArray(d.aiProvidersEnabled)
          ? (d.aiProvidersEnabled.filter((p): p is AIProviderId => typeof p === 'string'))
          : d.aiEnabled
            ? (['gemini'] as AIProviderId[])
            : [];
        return cachedServerProviders;
      })
      .catch(() => {
        // لا نخزّن قائمة فارغة عند فشل الفحص — المحاولة التالية تعيد المحاولة
        inflight = null;
        return cachedServerProviders || [];
      });
  }
  return inflight;
}

/**
 * Single source of truth for "can this browser send AI requests?".
 * نسخة مطابقة لقاعدة الخادم (مفتاح المستخدم أولاً ثم مفتاح البيئة):
 *   1. المحركات المحلية (Ollama) — مسموحة دائماً بلا مفتاح.
 *   2. مفتاح المستخدم الحقيقي (BYOK، محفوظ في متصفحه) — مسموح.
 *   3. لا مفتاح للمستخدم لكن الخادم يُعلن عن المزوّد عبر مفاتيح بيئته
 *      (/api/health → aiProvidersEnabled) — مسموح: الطلب يمتطي مفتاح الخادم
 *      والخادم هو من يجيب نهائياً.
 *   4. غير ذلك — يُمنع برسالة إرشادية بدل رحلة شبكة بلا فائدة.
 * مرّر ناتج `await fetchServerAiProviders()` في الوسيط الثالث؛ عند إغفاله
 * تُطبَّق القواعد 1/2/4 فقط (فشل مغلق لمن لا مفتاح له).
 */
export function checkAiAccess(
  providerId: AIProviderId,
  config: AIProviderConfig | undefined,
  serverProviders?: readonly AIProviderId[]
): AiAccessCheck {
  const isLocal = providerId === 'ollama' || Boolean(config?.isLocalOnly);
  if (isLocal) return { ok: true, isLocal: true };

  const key = (config?.apiKey || '').trim();
  const looksPlaceholder = /demo|xxxx|your[_-]?api|my[_-]?gemini|placeholder/i.test(key);
  if (key && !looksPlaceholder) {
    if (providerId === 'custom_openai' && !(config?.endpointUrl || '').trim()) {
      return { ok: false, isLocal: false, reason: 'no-endpoint' };
    }
    return { ok: true, isLocal: false };
  }

  // بلا مفتاح صالح للمستخدم → يُعتمد مفتاح الخادم إن أعلن /api/health عن المزوّد
  if (serverProviders?.includes(providerId)) {
    return { ok: true, isLocal: false };
  }
  return { ok: false, isLocal: false, reason: 'no-key' };
}

/** Message + routing payload for the blocked state. */
export function aiAccessBlockMessage(
  reason: 'no-key' | 'no-endpoint',
  isAr: boolean,
  providerName: string
): { title: string; description: string } {
  if (reason === 'no-endpoint') {
    return isAr
      ? {
          title: 'عنوان نقطة النهاية مطلوب',
          description: `أضف عنوان نقطة النهاية المتوافقة مع OpenAI لمزوّد ${providerName} من صفحة النماذج ثم اضغط "حفظ واختبار".`,
        }
      : {
          title: 'Endpoint Required',
          description: `Add an OpenAI-compatible endpoint URL for ${providerName} on the Model Config page, then press "Save & Test".`,
        };
  }
  return isAr
    ? {
        title: 'مفتاح الذكاء الاصطناعي مطلوب',
        description: `أدخل مفتاح API الخاص بمزوّد ${providerName} من صفحة النماذج واضغط "حفظ واختبار" — المفتاح يُحفظ في متصفحك فقط.`,
      }
    : {
        title: 'AI API Key Required',
        description: `Add your ${providerName} API key on the Model Config page and press "Save & Test" — the key stays in your browser only.`,
      };
}

/** Standard navigation payload: the sidebar tab id for Model Config. */
export const MODEL_CONFIG_TAB = 'models';
