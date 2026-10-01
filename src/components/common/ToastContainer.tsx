import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { ToastNotification, ToastType } from '../../types';
import {
  CheckCircle2,
  Info,
  AlertTriangle,
  XCircle,
  X,
  ArrowUpRight,
} from 'lucide-react';

interface ToastItemProps {
  toast: ToastNotification;
  onClose: () => void;
  language: 'ar' | 'en';
}

const ToastItem: React.FC<ToastItemProps> = ({ toast, onClose, language }) => {
  const isAr = language === 'ar';
  const duration = toast.duration || 4500;
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        onClose();
      }
    }, 50);

    return () => clearInterval(interval);
  }, [duration, onClose]);

  const getTypeStyles = (type: ToastType) => {
    switch (type) {
      case 'success':
        return {
          border: 'border-s-4 border-s-[#24a148] border-t border-b border-e border-[var(--cds-border-subtle)]',
          icon: <CheckCircle2 className="w-4 h-4 text-[#42be65] shrink-0" />,
          barBg: 'bg-[#24a148]',
          badgeText: isAr ? 'نجاح' : 'Success',
          badgeStyle: 'bg-[#24a148]/20 text-[#42be65]',
        };
      case 'warning':
        return {
          border: 'border-s-4 border-s-[#f1c21b] border-t border-b border-e border-[var(--cds-border-subtle)]',
          icon: <AlertTriangle className="w-4 h-4 text-[#f1c21b] shrink-0" />,
          barBg: 'bg-[#f1c21b]',
          badgeText: isAr ? 'تنبيه' : 'Warning',
          badgeStyle: 'bg-[#f1c21b]/20 text-[#f1c21b]',
        };
      case 'error':
        return {
          border: 'border-s-4 border-s-[#da1e28] border-t border-b border-e border-[var(--cds-border-subtle)]',
          icon: <XCircle className="w-4 h-4 text-[#ff8389] shrink-0" />,
          barBg: 'bg-[#da1e28]',
          badgeText: isAr ? 'خطأ' : 'Error',
          badgeStyle: 'bg-[#da1e28]/20 text-[#ff8389]',
        };
      case 'info':
      default:
        return {
          border: 'border-s-4 border-s-[#0f62fe] border-t border-b border-e border-[var(--cds-border-subtle)]',
          icon: <Info className="w-4 h-4 text-[#78a9ff] shrink-0" />,
          barBg: 'bg-[#0f62fe]',
          badgeText: isAr ? 'معلومات' : 'Info',
          badgeStyle: 'bg-[#0f62fe]/20 text-[#78a9ff]',
        };
    }
  };

  const style = getTypeStyles(toast.type);

  return (
    <div
      role="alert"
      className={`relative bg-[var(--cds-layer-02)] ${style.border} shadow-2xl p-3.5 w-84 sm:w-96 text-xs font-mono select-none overflow-hidden transition-all duration-200 transform translate-y-0 opacity-100 hover:shadow-black/60`}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 flex-1 min-w-0">
          <div className="mt-0.5">{style.icon}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-bold text-[var(--cds-text-01)] text-xs truncate">
                {isAr ? toast.titleAr || toast.title : toast.title}
              </span>
              <span className={`text-[9px] px-1.5 py-0.2 font-bold uppercase ${style.badgeStyle}`}>
                {style.badgeText}
              </span>
            </div>
            {(toast.message || toast.messageAr) && (
              <p className="text-[11px] text-[var(--cds-text-02)] font-sans leading-relaxed line-clamp-3">
                {isAr ? toast.messageAr || toast.message : toast.message}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {toast.action && (
            <button
              onClick={() => {
                toast.action?.onClick();
                onClose();
              }}
              className="px-2 py-0.5 bg-[var(--cds-layer-03)] hover:bg-[#0f62fe] text-white text-[10px] font-mono flex items-center gap-1 transition-colors"
            >
              <span>{isAr ? toast.action.labelAr || toast.action.label : toast.action.label}</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          )}

          <button
            onClick={onClose}
            className="p-1 text-[var(--cds-text-03)] hover:text-[var(--cds-text-01)] hover:bg-[var(--cds-layer-03)] transition-colors"
            aria-label="Close notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Countdown Progress Bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--cds-layer-03)]">
        <div
          className={`h-full ${style.barBg} transition-all duration-75`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast, language } = useApp();

  if (!toasts || toasts.length === 0) return null;

  const isAr = language === 'ar';

  return (
    <div
      className={`fixed bottom-4 z-50 flex flex-col gap-2.5 max-h-[90vh] pointer-events-none ${
        isAr ? 'left-4 items-start' : 'right-4 items-end'
      }`}
    >
      {toasts.map(toast => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem
            toast={toast}
            onClose={() => removeToast(toast.id)}
            language={language}
          />
        </div>
      ))}
    </div>
  );
};
