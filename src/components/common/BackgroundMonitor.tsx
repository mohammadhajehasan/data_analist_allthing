import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { AlertTriangle, Activity, Database, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const BackgroundMonitor: React.FC = () => {
  const { activeDataset, addAuditLog, language } = useApp();
  const [alerts, setAlerts] = useState<any[]>([]);

  useEffect(() => {
    if (!activeDataset) return;

    // Simulate a background agent scanning the dataset periodically
    const interval = setInterval(() => {
      // 5% chance every 15 seconds to "detect schema drift or anomaly" for demonstration
      if (Math.random() < 0.05) {
        const newAlert = {
          id: Date.now(),
          type: 'drift',
          message: language === 'ar' 
            ? `اكتشف الوكيل الذكي انحرافاً محتملاً في النمط المتوقع لبيانات (${activeDataset.name}). نوصي بإعادة التحليل الإحصائي.` 
            : `Background Agent detected potential schema drift in (${activeDataset.name}). Re-profiling recommended.`
        };
        
        setAlerts(prev => [...prev, newAlert]);
        
        addAuditLog({
          action: 'SCHEMA_DRIFT_DETECTED',
          resourceType: 'background_agent',
          status: 'WARNING',
          durationMs: 15,
          payloadSummary: newAlert.message
        });

        // Auto dismiss after 15 seconds
        setTimeout(() => {
          setAlerts(prev => prev.filter(a => a.id !== newAlert.id));
        }, 15000);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [activeDataset, language, addAuditLog]);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {alerts.map(alert => (
          <motion.div
            key={alert.id}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            className="pointer-events-auto w-80 bg-[color-mix(in_srgb,var(--cds-layer-01)_90%,transparent)] backdrop-blur-xl border border-[var(--cds-warning)] rounded-xl p-4 shadow-2xl flex items-start gap-3"
          >
            <div className="p-2 bg-[var(--cds-warning)]/10 rounded-lg text-[var(--cds-warning)] shrink-0 mt-0.5">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-[var(--cds-text-01)] mb-1">
                {language === 'ar' ? 'تنبيه الوكيل الذكي' : 'Agent Alert'}
              </h4>
              <p className="text-xs text-[var(--cds-text-02)] leading-relaxed">
                {alert.message}
              </p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
