import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, ServerCrash } from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface HealthDb {
  configured?: boolean;
  healthy?: boolean;
  lastError?: string | null;
  lastErrorAt?: string | null;
  latencyMs?: number;
}

const POLL_MS = 60_000;

/**
 * شريط حالة التخزين: يقول بصراحة متى تكون القاعدة غير متاحة بدل أن تفشل كل
 * شاشة على حدة برسالة غامضة. التحليل على الملفات المحمّلة يبقى يعمل.
 */
export const SystemStatusBanner: React.FC = () => {
  const { language } = useApp();
  const ar = language === 'ar';
  const [db, setDb] = useState<HealthDb | null>(null);
  const [checking, setChecking] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const response = await fetch('/api/health', { credentials: 'include' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      setDb(payload?.db ?? null);
    } catch {
      setDb({ configured: true, healthy: false, lastError: 'تعذّر الوصول إلى الخادم / server unreachable' });
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check();
    const timer = window.setInterval(() => void check(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [check]);

  // يظهر فقط عند وجود مشكلة فعلية، ويُخفى تلقائيًا عند التعافي.
  const broken = db !== null && (db.configured === false || db.healthy === false);
  useEffect(() => {
    if (!broken) setDismissed(false);
  }, [broken]);

  if (!broken || dismissed) return null;

  const notConfigured = db?.configured === false;

  return (
    <div
      className="mx-4 mt-3 flex flex-wrap items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-700 dark:text-rose-200"
      role="status"
      dir={ar ? 'rtl' : 'ltr'}
    >
      {notConfigured ? (
        <ServerCrash className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      ) : (
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className="font-bold">
          {notConfigured
            ? ar
              ? 'التخزين السحابي غير مضبوط'
              : 'Cloud storage is not configured'
            : ar
              ? 'قاعدة البيانات غير متاحة حاليًا'
              : 'The database is temporarily unavailable'}
        </div>
        <div className="opacity-90">
          {ar
            ? 'تسجيل الدخول والحفظ والمزامنة معطّلة الآن. يمكنك متابعة العمل على الملفات المحمّلة في الاستوديو والتحليل، لكن الحفظ في مساحة العمل سيفشل حتى يعود الاتصال.'
            : 'Sign-in, saving and sync are offline right now. You can keep working on loaded files in the studio and analysis, but workspace saves will fail until the connection returns.'}
          {db?.lastError ? <span className="block mt-0.5 font-mono opacity-70">{db.lastError.slice(0, 160)}</span> : null}
        </div>
      </div>
      <button
        type="button"
        onClick={() => void check()}
        className="flex items-center gap-1.5 rounded-md border border-rose-500/40 bg-rose-500/15 px-2 py-1 font-semibold hover:bg-rose-500/25"
      >
        <RefreshCw className={`h-3 w-3 ${checking ? 'animate-spin' : ''}`} />
        {ar ? 'إعادة الفحص' : 'Re-check'}
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="rounded-md px-2 py-1 font-semibold underline decoration-dotted opacity-80 hover:opacity-100"
      >
        {ar ? 'إخفاء' : 'Dismiss'}
      </button>
    </div>
  );
};

export default SystemStatusBanner;
