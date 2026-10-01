import React, { useState, useRef, useEffect } from 'react';
import { HelpCircle, Info } from 'lucide-react';

export interface InfoTooltipProps {
  title?: string;
  content: string;
  badge?: string;
  recommended?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  iconSize?: number;
  variant?: 'info' | 'help' | 'subtle';
  children?: React.ReactNode;
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({
  title,
  content,
  badge,
  recommended,
  position = 'top',
  className = '',
  iconSize = 14,
  variant = 'info',
  children,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsVisible(false);
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isVisible]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsVisible(false);
    };
    if (isVisible) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isVisible]);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 me-2',
    right: 'left-full top-1/2 -translate-y-1/2 ms-2',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-[var(--cds-layer-01)] border-x-transparent border-b-transparent border-t-4 border-x-4 border-b-0',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-[var(--cds-layer-01)] border-x-transparent border-t-transparent border-b-4 border-x-4 border-t-0',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-[var(--cds-layer-01)] border-y-transparent border-r-transparent border-l-4 border-y-4 border-r-0',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-[var(--cds-layer-01)] border-y-transparent border-l-transparent border-r-4 border-y-4 border-l-0',
  };

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center align-middle ${className}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children ? (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setIsVisible(!isVisible);
          }}
          className="cursor-pointer inline-flex items-center"
        >
          {children}
        </div>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsVisible(!isVisible);
          }}
          aria-label={title || 'معلومات إضافية'}
          className="inline-flex items-center justify-center p-0.5 rounded-full text-[var(--cds-text-03)] hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/40 cursor-pointer"
        >
          {variant === 'help' ? (
            <HelpCircle style={{ width: iconSize, height: iconSize }} />
          ) : (
            <Info style={{ width: iconSize, height: iconSize }} />
          )}
        </button>
      )}

      {isVisible && (
        <div
          ref={tooltipRef}
          role="tooltip"
          className={`absolute z-50 w-72 max-w-[90vw] p-3 rounded-lg bg-[var(--cds-layer-01)] text-[var(--cds-text-01)] border border-[var(--cds-border-subtle)] shadow-xl shadow-black/20 text-xs leading-relaxed pointer-events-auto transition-all animate-in fade-in zoom-in-95 duration-150 ${positionClasses[position]}`}
          style={{ textTransform: 'none' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Arrow */}
          <div
            className={`absolute w-0 h-0 pointer-events-none ${arrowClasses[position]}`}
          />

          {/* Header */}
          {(title || badge) && (
            <div className="flex items-center justify-between gap-2 mb-1.5 pb-1.5 border-b border-[var(--cds-border-subtle)]">
              {title && (
                <span className="font-bold text-[var(--cds-text-01)] text-xs flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                  {title}
                </span>
              )}
              {badge && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border border-indigo-500/20 whitespace-nowrap">
                  {badge}
                </span>
              )}
            </div>
          )}

          {/* Body Content */}
          <p className="text-[11px] text-[var(--cds-text-02)] leading-normal font-normal">
            {content}
          </p>

          {/* Recommended Tag */}
          {recommended && (
            <div className="mt-2 pt-1.5 border-t border-[var(--cds-border-subtle)]/70 flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
              <span className="font-bold">✓ القيمة الموصى بها:</span>
              <span>{recommended}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
