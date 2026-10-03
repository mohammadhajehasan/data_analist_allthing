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
  /** جاهزية كل مزوّد على حدة — لقائمة الهيدر المنسدلة. */
  providers: ProviderReadiness[];
}

export interface ProviderReadiness {
  providerId: AIProviderId;
  ready: boolean;
  reason: AiReadiness['reason'];
}

/** ترتيب العرض في القائمة: السحابية أولاً (حيث المفاتيح) ثم المحلي. */
export const AI_PROVIDER_ORDER: AIProviderId[] = [
  'gemini',
  'openrouter',
  'deepseek',
  'qwen',
  'custom_openai',
  'ollama',
];

/** قاعدة واحدة للمزوّد الواحد: مفتاح المستخدم ← مفتاح الخادم ← محلي. */
export function computeProviderReadiness(
  providerId: AIProviderId,
  aiSettings: AISettings,
  serverProviders: readonly AIProviderId[]
): ProviderReadiness {
  const cfg = aiSettings.providers[providerId];
  const key = (cfg?.apiKey || '').trim();
  const hasUserKey = Boolean(key) && !KEY_LOOKS_PLACEHOLDER.test(key);
  const isLocal = providerId === 'ollama' || Boolean(cfg?.isLocalOnly);

  if (isLocal) {
    return { providerId, ready: true, reason: 'local' };
  }
  if (hasUserKey) {
    const endpointOk =
      providerId !== 'custom_openai' || Boolean((cfg?.endpointUrl || '').trim());
    return { providerId, ready: endpointOk, reason: endpointOk ? 'user-key' : 'no-endpoint' };
  }
  if (serverProviders.includes(providerId)) {
    return { providerId, ready: true, reason: 'server-key' };
  }
  return { providerId, ready: false, reason: 'no-key' };
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

  const providers = AI_PROVIDER_ORDER.map(id =>
    computeProviderReadiness(id, aiSettings, serverProviders)
  );

  // جاهزية المزوّد النشط تأتي من نفس الحساب لضمان التطابق مع القائمة
  const active = computeProviderReadiness(activeModelDef.provider, aiSettings, serverProviders);

  return {
    ready: active.ready,
    reason: active.reason,
    providerId: active.providerId,
    providers,
  };
}
