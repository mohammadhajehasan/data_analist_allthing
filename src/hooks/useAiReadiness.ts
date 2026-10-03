import { useEffect, useState } from 'react';
import { fetchServerAiProviders } from '../utils/aiAccessGuard';
import type { AIModelDefinition, AISettings, AIProviderId } from '../types/aiProviders';

/**
 * جاهزية AI للهيدر: يجمع مفتاح المستخدم (localStorage) مع المزوّدين
 * المفعّلين خادمياً (/api/health → aiProvidersEnabled) في إجابة واحدة.
 * الاستعلام للخادم مرة واحدة لكل جلسة — مخزّن على مستوى الوحدة داخل
 * aiAccessGuard ومشترك مع نقاط الحرس كلها.
 */

const KEY_LOOKS_PLACEHOLDER = /demo|xxxx|your[_-]?api|my[_-]?gemini|placeholder/i;

export interface AiReadiness {
  ready: boolean;
  reason: 'user-key' | 'server-key' | 'local' | 'no-key' | 'no-endpoint';
  providerId: AIProviderId;
}

export function useAiReadiness(
  aiSettings: AISettings,
  activeModelDef: AIModelDefinition
): AiReadiness {
  const [serverProviders, setServerProviders] = useState<AIProviderId[]>([]);

  // استعلام واحد لكل جلسة لمعرفة المزوّدين المفعّلين خادمياً
  useEffect(() => {
    let mounted = true;
    fetchServerAiProviders().then(list => {
      if (mounted) setServerProviders(list);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const providerId = activeModelDef.provider;
  const cfg = aiSettings.providers[providerId];
  const key = (cfg?.apiKey || '').trim();
  const hasUserKey = Boolean(key) && !KEY_LOOKS_PLACEHOLDER.test(key);
  const isLocal = providerId === 'ollama' || Boolean(cfg?.isLocalOnly);

  let ready = false;
  let reason: AiReadiness['reason'] = 'no-key';

  if (isLocal) {
    ready = true;
    reason = 'local';
  } else if (hasUserKey) {
    const endpointOk =
      providerId !== 'custom_openai' || Boolean((cfg?.endpointUrl || '').trim());
    ready = endpointOk;
    reason = endpointOk ? 'user-key' : 'no-endpoint';
  } else if (serverProviders.includes(providerId)) {
    ready = true;
    reason = 'server-key';
  }

  return { ready, reason, providerId };
}
