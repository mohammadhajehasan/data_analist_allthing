import React, { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { useApp } from '../../context/AppContext';
import { audio } from '../../utils/audioEngine';
import { Sparkles } from 'lucide-react';

/**
 * Liquid Copilot Orb
 * ==================
 * The AI copilot as a living droplet of liquid metal that floats in the
 * corner of the workspace. It breathes continuously; its color and demeanor
 * reflect live analytical context (healthy SQL → serene cyan, detected
 * errors → warm amber and a slight sympathetic shrink). Clicking it opens
 * the Copilot Drawer; on error states it gently nudges toward the eye.
 *
 * Physical feel via springs: position follows the cursor with elastic lag,
 * and the blob wobbles with organic keyframes rather than linear loops.
 */

type OrbMood = 'calm' | 'happy' | 'wary';

const MOOD_COLORS: Record<OrbMood, { core: string; glow: string; label: string; labelAr: string }> = {
  calm: { core: '#4589ff', glow: 'rgba(69,137,255,0.55)', label: 'Copilot ready', labelAr: 'المساعد جاهز' },
  happy: { core: '#42be65', glow: 'rgba(66,190,101,0.55)', label: 'All clear', labelAr: 'كل شيء سليم' },
  wary: { core: '#f1c21b', glow: 'rgba(241,194,27,0.6)', label: 'Needs attention', labelAr: 'يحتاج انتباهك' },
};

export const LiquidCopilotOrb: React.FC = () => {
  const { language, isCopilotOpen, setIsCopilotOpen, toast, activeDataset } = useApp();
  const isAr = language === 'ar';

  const [mood, setMood] = useState<OrbMood>('calm');
  const [hint, setHint] = useState(false);
  const hoverCount = useRef(0);

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const x = useSpring(mx, { stiffness: 160, damping: 14 });
  const y = useSpring(my, { stiffness: 160, damping: 14 });

  // Watch global error toasts → the orb sympathizes (wary mood)
  useEffect(() => {
    if (!toast) return;
    const check = () => {
      // ToastContainer exposes window-level counter we can't reach; instead
      // listen for the app-level error events via audit-free heuristic:
      // any error toast triggers a temporary wary state.
    };
    check();
  }, [toast]);

  useEffect(() => {
    const onError = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail || '';
      setMood('wary');
      setHint(true);
      if (detail) audio.chimeError();
      const t = window.setTimeout(() => setMood('calm'), 8000);
      return () => window.clearTimeout(t);
    };
    window.addEventListener('carbon-analytical-error', onError as EventListener);
    return () => window.removeEventListener('carbon-analytical-error', onError as EventListener);
  }, []);

  useEffect(() => {
    const onOk = () => {
      setMood('happy');
      const t = window.setTimeout(() => setMood('calm'), 4000);
      return () => window.clearTimeout(t);
    };
    window.addEventListener('carbon-analytical-success', onOk as EventListener);
    return () => window.removeEventListener('carbon-analytical-success', onOk as EventListener);
  }, []);

  if (isCopilotOpen) return null;

  const c = MOOD_COLORS[mood];

  return (
    <motion.div
      className="fixed bottom-6 end-6 z-[70] select-none"
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 18, delay: 1.2 }}
      onMouseMove={e => {
        const rect = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - rect.left - rect.width / 2) * 0.18);
        my.set((e.clientY - rect.top - rect.height / 2) * 0.18);
      }}
      onMouseLeave={() => {
        mx.set(0);
        my.set(0);
        hoverCount.current = 0;
        setHint(false);
      }}
      style={{ x, y }}
    >
      <button
        onClick={() => {
          audio.magneticSnap();
          setIsCopilotOpen(true);
        }}
        className="relative block outline-none focus-visible:ring-2 focus-visible:ring-[#4589ff] rounded-full"
        title={isAr ? c.labelAr : c.label}
        aria-label={isAr ? c.labelAr : c.label}
      >
        {/* Halo */}
        <motion.div
          className="absolute -inset-4 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${c.glow}, transparent 70%)` }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0.9, 0.6] }}
          transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Liquid blob */}
        <motion.div
          className="relative w-14 h-14 rounded-full flex items-center justify-center"
          style={{
            background: `radial-gradient(circle at 32% 28%, #ffffff33, transparent 42%), radial-gradient(circle at 68% 72%, ${c.core}cc, ${c.core})`,
            boxShadow: `0 6px 30px ${c.glow}, inset 0 -4px 10px rgba(0,0,0,0.25), inset 0 3px 8px rgba(255,255,255,0.28)`,
          }}
          animate={
            mood === 'wary'
              ? { scale: [1, 0.9, 0.96], borderRadius: ['48% 52% 55% 45%', '55% 45% 48% 52%'] }
              : {
                  scale: [1, 1.04, 0.98, 1],
                  borderRadius: [
                    '48% 52% 55% 45% / 52% 48% 55% 45%',
                    '55% 45% 48% 52% / 45% 55% 48% 52%',
                    '50% 50% 45% 55% / 55% 45% 52% 48%',
                    '48% 52% 55% 45% / 52% 48% 55% 45%',
                  ],
                }
          }
          transition={
            mood === 'wary'
              ? { duration: 0.9, repeat: Infinity }
              : { duration: 7, repeat: Infinity, ease: 'easeInOut' }
          }
        >
          <Sparkles className="w-5 h-5 text-white drop-shadow" style={{ opacity: 0.92 }} />
        </motion.div>

        {/* Context hint on hover */}
        {hint && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute bottom-full mb-3 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 whitespace-nowrap bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] text-[11px] font-mono px-3 py-1.5 rounded-lg shadow-xl"
          >
            {isAr ? 'انقر لفتح المساعد واطلب حلاً' : 'Click to ask the copilot'}
          </motion.div>
        )}
      </button>

      {/* Dataset pulse dot: shows the orb is context-aware */}
      {activeDataset && (
        <motion.span
          className="absolute -top-0.5 -end-0.5 w-3 h-3 rounded-full border-2 border-[var(--cds-background)]"
          style={{ backgroundColor: c.core }}
          animate={{ scale: [1, 1.3, 1] }}
          transition={{ duration: 2.4, repeat: Infinity }}
        />
      )}
    </motion.div>
  );
};
