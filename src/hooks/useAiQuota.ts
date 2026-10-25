import { useState, useEffect, useCallback } from 'react';
import { fetchAiQuota, type AiQuotaInfo } from '../services/aiQuotaService';

/**
 * حالة حصة AI على مستوى الواجهة:
 *   - جلب أولي + تجديد كل 60 ثانية.
 *   - أي "ai-activity" على window (استدعاء AI ناجح/429) يعيد الجلب فوراً
 *     ليبقى العدّاد صادقاً بعد كل استهلاك.
 * لا يُستخدم في النفاذ أو الضبط — عرض/إشعار فقط.
 */
export function useAiQuota() {
  const [quota, setQuota] = useState<AiQuotaInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await fetchAiQuota();
    if (next) setQuota(next);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      const next = await fetchAiQuota();
      if (mounted && next) setQuota(next);
      setIsLoading(false);
    };
    run();
    const onActivity = () => { void run(); };
    window.addEventListener('ai-activity', onActivity);
    const t = setInterval(run, 60_000);
    return () => {
      mounted = false;
      window.removeEventListener('ai-activity', onActivity);
      clearInterval(t);
    };
  }, []);

  return { quota, isLoading, refresh };
}

/** يدوياً: يستدعى بعد كل نجاح/فشل استدعاء AI لتحديث البادج فوراً. آمن في بيئة غير DOM. */
export function notifyAiActivity(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('ai-activity'));
}
