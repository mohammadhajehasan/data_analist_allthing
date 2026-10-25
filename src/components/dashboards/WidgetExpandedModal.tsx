import React, { useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { ChartFactory, KpiCard } from '../charts/ChartFactory';
import { Dataset, WidgetConfig } from '../../types';
import { Maximize2, X, MousePointerClick } from 'lucide-react';

/**
 * نافذة النقر المزدوج — العرض الموسّع لعنصر من عناصر لوحة التحكم:
 *  - الطبقة تفتح بـ onDoubleClick على بطاقة الرسم أو بطاقة KPI.
 *  - الإغلاق: زر ✕، النقر على الخلفية، أو زر Escape.
 *  - الرسم يُعرض بـ ChartFactory بنمط expanded (ارتفاع مرن بدل الـ h-56 الثابت).
 */
export const WidgetExpandedModal: React.FC<{
  widget: WidgetConfig | null;
  dataset: Dataset | null;
  onClose: () => void;
}> = ({ widget, dataset, onClose }) => {
  const { language } = useApp();
  const isAr = language === 'ar';

  // زر Escape يغلق النافذة — مستمع واحد فقط طوال عمر النافذة
  useEffect(() => {
    if (!widget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [widget, onClose]);

  if (!widget) return null;
  const title = isAr ? widget.titleAr || widget.title : widget.title;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full max-w-6xl max-h-[92vh] bg-[var(--cds-layer-02)] border border-[var(--cds-border-strong)] shadow-2xl rounded-lg flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--cds-border-subtle)] px-5 py-3 shrink-0">
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#0f62fe] flex items-center gap-1.5">
              <Maximize2 className="w-3 h-3" />
              {isAr ? 'عرض موسّع للعنصر' : 'Expanded Widget View'}
            </span>
            <h3 className="text-base font-bold text-white mt-0.5 truncate">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--cds-text-02)] hover:text-white hover:bg-[#da1e28] transition-colors rounded"
            title={isAr ? 'إغلاق (Esc)' : 'Close (Esc)'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Expanded body — الرسم يملأ الارتفاع المتبقي */}
        <div className="p-4 sm:p-6 min-h-0 flex-1 flex">
          {widget.type === 'kpi' ? (
            <div className="w-full max-w-xl mx-auto my-auto">
              <KpiCard widget={widget} />
            </div>
          ) : dataset ? (
            <div className="w-full h-full min-h-[62vh]">
              <ChartFactory widget={widget} dataset={dataset} expanded />
            </div>
          ) : (
            <div className="m-auto text-xs font-mono text-[var(--cds-text-02)]">
              {isAr ? 'مجموعة البيانات المرتبطة غير متوفرة — حدّث مصدر الرسم.' : 'The linked dataset is unavailable — update the chart source.'}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div
          className="flex items-center justify-center gap-2 text-[10px] font-mono text-[var(--cds-text-03)] border-t border-[var(--cds-border-subtle)] py-2 shrink-0"
          style={{ direction: isAr ? 'rtl' : 'ltr' }}
        >
          <MousePointerClick className="w-3 h-3" />
          <span>
            {isAr ? 'اضغط Escape أو انقر على الخلفية للإغلاق' : 'Press Escape or click the backdrop to close'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default WidgetExpandedModal;
