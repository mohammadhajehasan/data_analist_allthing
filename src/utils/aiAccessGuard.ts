import type { AIProviderConfig, AIProviderId } from '../types/aiProviders';

export interface AiAccessCheck {
  ok: boolean;
  /** True when the active provider is local (Ollama) — no key needed, always allowed. */
  isLocal: boolean;
  reason?: 'no-key' | 'no-endpoint';
}

/**
 * Single source of truth for "can this browser send AI requests?".
 * Cloud providers require a non-empty key that does not look like placeholder
 * text; Ollama (local) needs no key. Server-side env keys still work as a
 * fallback, so the UI mirrors the server rule: user key first, else allowed
 * (the server answers definitively and this guard avoids pointless round-trips
 * when we already know the browser has nothing to send).
 */
export function checkAiAccess(
  providerId: AIProviderId,
  config: AIProviderConfig | undefined,
  opts?: { skipServerFallbackHint?: boolean }
): AiAccessCheck {
  const isLocal = providerId === 'ollama' || Boolean(config?.isLocalOnly);
  if (isLocal) return { ok: true, isLocal: true };

  const key = (config?.apiKey || '').trim();
  const looksPlaceholder = /demo|xxxx|your[_-]?api|my[_-]?gemini|placeholder/i.test(key);
  if (!key || looksPlaceholder) {
    return { ok: false, isLocal: false, reason: 'no-key' };
  }
  if (providerId === 'custom_openai' && !(config?.endpointUrl || '').trim()) {
    return { ok: false, isLocal: false, reason: 'no-endpoint' };
  }
  return { ok: true, isLocal: false };
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
