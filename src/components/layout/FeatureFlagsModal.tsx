import React from 'react';
import { useApp } from '../../context/AppContext';
import { X, Sliders, CheckCircle2, ShieldCheck, Zap, Database, FileText } from 'lucide-react';

export const FeatureFlagsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const { featureFlags, updateFeatureFlags, language, t } = useApp();

  if (!isOpen) return null;

  const flagConfigs = [
    {
      key: 'FF_AI_ENABLED',
      name: language === 'ar' ? 'تفعيل الذكاء الاصطناعي (Gemini AI Gateway)' : 'Enable AI Gateway (Gemini)',
      desc: language === 'ar' ? 'تفعيل ميزات الاستنتاج الذكي والمساعد التحليلي' : 'Enables AI model routing, tool dispatch and natural reasoning',
      icon: Zap,
    },
    {
      key: 'FF_NL2SQL_ENABLED',
      name: language === 'ar' ? 'توليد استعلامات NL2SQL' : 'NL2SQL Generation Engine',
      desc: language === 'ar' ? 'تحويل الأسئلة الطبيعية إلى استعلامات SQL متوافقة' : 'Translates conversational questions into safe SQL statements',
      icon: Database,
    },
    {
      key: 'FF_SQL_SANDBOX_STRICT',
      name: language === 'ar' ? 'ساندبوكس الأمان الصارم (9-Layers Strict)' : 'Strict 9-Layer SQL Sandbox',
      desc: language === 'ar' ? 'فرض التحقق النحوي وحظر DDL/DML والتراجع التلقائي' : 'Enforces AST checks, DDL/DML bans, and read-only isolation',
      icon: ShieldCheck,
    },
    {
      key: 'FF_ANOMALY_DETECTION',
      name: language === 'ar' ? 'كشف القيم الشاذة المتقدم (IQR + Z-Score)' : 'Advanced Anomaly Engine',
      desc: language === 'ar' ? 'فحص الانحرافات الإحصائية وحساب درجات الشذوذ' : 'Runs vectorized IQR and Z-Score outlier detection passes',
      icon: CheckCircle2,
    },
    {
      key: 'FF_PROFILING_CACHE',
      name: language === 'ar' ? 'التخزين المؤقت للإحصائيات' : 'Analytical Profiling Cache',
      desc: language === 'ar' ? 'تخزين نتائج التوصيف بالذاكرة لتسريع لوحات التحكم' : 'Caches calculated stats in-memory for instant retrieval',
      icon: Database,
    },
    {
      key: 'FF_EXPORT_PDF_ENABLED',
      name: language === 'ar' ? 'تصدير التقارير التنفيذية (PDF & JSON)' : 'Executive Reports Export Engine',
      desc: language === 'ar' ? 'توليد ملفات PDF عالية الدقة وبيانات JSON الهيكلية' : 'Generates structured JSON and printable PDF analytics stories',
      icon: FileText,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] max-w-xl w-full p-6 shadow-2xl space-y-5 rounded-none">
        <div className="flex items-center justify-between border-b border-[var(--cds-border-subtle)] pb-3">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#0f62fe]">
              GOVERNANCE & RUNTIME TOGGLES
            </span>
            <h3 className="text-base font-bold text-[var(--cds-text-01)]">{t.common.featureFlags}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--cds-text-03)] hover:text-white text-lg font-mono px-2 py-1"
          >
            ✕
          </button>
        </div>

        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {flagConfigs.map(item => {
            const isEnabled = Boolean((featureFlags as any)[item.key]);
            const Icon = item.icon;
            return (
              <div
                key={item.key}
                className="flex items-center justify-between p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] hover:border-[var(--cds-border-strong)] transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] flex items-center justify-center text-[#0f62fe] shrink-0 mt-0.5">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[var(--cds-text-01)]">{item.name}</div>
                    <div className="text-[11px] text-[var(--cds-text-03)]">{item.desc}</div>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={e => updateFeatureFlags({ [item.key]: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-[var(--cds-layer-03)] peer-focus:outline-none rounded-none peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:h-4 after:w-4 after:transition-all peer-checked:bg-[#0f62fe]" />
                </label>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end pt-3 border-t border-[var(--cds-border-subtle)]">
          <button
            onClick={onClose}
            className="carbon-btn-secondary text-xs uppercase tracking-wider"
          >
            {t.common.close}
          </button>
        </div>
      </div>
    </div>
  );
};
