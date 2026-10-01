import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SQLValidationReport } from '../../types';
import { audio } from '../../utils/audioEngine';
import { ShieldAlert, CheckCircle2, Orbit } from 'lucide-react';

/**
 * 9-Layer Laser Gate
 * ==================
 * Renders the platform's signature 9-layer SQL security sandbox as a
 * physical event: the query becomes a glowing photon that travels
 * horizontally through nine concentric laser rings. Rings turn emerald as
 * the photon passes; a hostile ring flares crimson, shatters the photon,
 * and the offending layer code is highlighted at the impact site.
 *
 * The component is fully self-contained: it replays a "traversal" whenever
 * `runId` changes (wire it to the Execute button), and it derives everything
 * from the existing SQLValidationReport — no AI, no network, no new deps.
 */

interface NineLayerLaserGateProps {
  report: SQLValidationReport;
  /** Increment to (re)trigger the photon traversal animation. */
  runId: number;
  language?: 'ar' | 'en';
  compact?: boolean;
}

type Phase = 'idle' | 'traversing' | 'breached' | 'cleared';

export const NineLayerLaserGate: React.FC<NineLayerLaserGateProps> = ({
  report,
  runId,
  language = 'ar',
  compact = false,
}) => {
  const isAr = language === 'ar';
  const layers = report.layers.length ? report.layers : [];
  const total = Math.max(9, layers.length);
  const [phase, setPhase] = useState<Phase>('idle');
  const [crossed, setCrossed] = useState(0);
  const [breachAt, setBreachAt] = useState<number | null>(null);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach(t => window.clearTimeout(t));
    timers.current = [];
  };

  useEffect(() => clearTimers, []);

  useEffect(() => {
    if (runId <= 0 || layers.length === 0) return;
    clearTimers();
    setCrossed(0);
    setBreachAt(null);

    const firstFailIndex = layers.findIndex(l => l.status === 'failed');
    const willBreach = firstFailIndex >= 0;
    setPhase('traversing');

    // Photon crosses each layer with a rising blip; ~140ms per layer.
    for (let i = 0; i < total; i += 1) {
      const t = window.setTimeout(() => {
        if (willBreach && i === firstFailIndex) {
          setBreachAt(i);
          setPhase('breached');
          audio.gateBlocked();
        } else if (i < layers.length) {
          setCrossed(i + 1);
          audio.gateLayer(i);
        }
      }, 300 + i * 140);
      timers.current.push(t);
    }

    if (!willBreach) {
      const done = window.setTimeout(() => setPhase('cleared'), 300 + total * 140 + 200);
      timers.current.push(done);
    }

    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const ringPositions = useMemo(() => {
    // Concentric-ish spread across the corridor
    return Array.from({ length: total }, (_, i) => 10 + (i * 80) / Math.max(1, total - 1));
  }, [total]);

  const photonX = phase === 'breached' && breachAt !== null ? ringPositions[breachAt] : 96;
  const photonVisible = phase === 'traversing' || phase === 'breached';

  const failedLayer = breachAt !== null && layers[breachAt] ? layers[breachAt] : null;

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className={`relative overflow-hidden bg-[var(--cds-background)] border border-[var(--cds-border-subtle)] ${compact ? 'h-36' : 'h-52'}`}
    >
      {/* Ambient corridor glow */}
      <div
        className="absolute inset-0 pointer-events-none transition-colors duration-700"
        style={{
          background:
            phase === 'breached'
              ? 'radial-gradient(ellipse at 50% 50%, rgba(218,30,40,0.10), transparent 65%)'
              : phase === 'cleared'
              ? 'radial-gradient(ellipse at 50% 50%, rgba(36,161,72,0.10), transparent 65%)'
              : 'radial-gradient(ellipse at 50% 50%, rgba(15,98,254,0.08), transparent 65%)',
        }}
      />

      {/* Laser rings */}
      <div className="absolute inset-0 flex items-center justify-between px-[8%] pointer-events-none" dir="ltr">
        {ringPositions.map((_, i) => {
          const layer = layers[i];
          const isPassed = i < crossed && (!breachAt || i !== breachAt);
          const isBreach = breachAt === i;
          const isPending = phase === 'idle' || (i >= crossed && !isBreach);
          const color = isBreach ? '#da1e28' : isPassed ? '#24a148' : isPending ? '#334155' : '#0f62fe';
          const label = layer ? (isAr ? layer.nameAr || layer.name : layer.name) : isAr ? `الطبقة ${i + 1}` : `Layer ${i + 1}`;

          return (
            <div key={i} className="relative flex flex-col items-center" style={{ width: `${100 / total}%` }}>
              {/* Ring */}
              <motion.div
                className="rounded-full border-2 flex items-center justify-center"
                style={{
                  width: compact ? 30 : 44,
                  height: compact ? 30 : 44,
                  borderColor: color,
                  boxShadow: isBreach
                    ? '0 0 18px 4px rgba(218,30,40,0.55)'
                    : isPassed
                    ? '0 0 12px 2px rgba(36,161,72,0.35)'
                    : 'none',
                  transition: 'border-color 300ms ease, box-shadow 300ms ease',
                }}
                animate={isBreach ? { scale: [1, 1.25, 1.08] } : isPassed ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                transition={{ duration: 0.45 }}
              >
                {isPassed && <CheckCircle2 className="w-3.5 h-3.5 text-[#42be65]" />}
                {isBreach && <ShieldAlert className="w-4 h-4 text-[#ff8389]" />}
              </motion.div>

              {/* Layer index */}
              <span
                className={`mt-1.5 text-[9px] font-mono font-bold transition-colors ${
                  isBreach ? 'text-[#ff8389]' : isPassed ? 'text-[#42be65]' : 'text-[var(--cds-text-03)]'
                }`}
              >
                L{i + 1}
              </span>
              {!compact && (
                <span className="text-[8px] font-mono text-[var(--cds-text-03)] text-center leading-tight max-w-[70px] truncate">
                  {label}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Photon */}
      <AnimatePresence>
        {photonVisible && (
          <motion.div
            key={runId}
            dir="ltr"
            className="absolute top-1/2 -translate-y-1/2 pointer-events-none z-10"
            initial={{ left: '2%' }}
            animate={{ left: `${photonX}%` }}
            exit={{ opacity: 0, scale: 1.8 }}
            transition={phase === 'breached' ? { duration: 0.25 } : { duration: total * 0.14, ease: 'linear' }}
          >
            <motion.div
              className="rounded-full"
              style={{
                width: 14,
                height: 14,
                background: phase === 'breached' ? '#da1e28' : '#4589ff',
                boxShadow:
                  phase === 'breached'
                    ? '0 0 22px 8px rgba(218,30,40,0.8)'
                    : '0 0 18px 6px rgba(69,137,255,0.75)',
              }}
              animate={phase === 'breached' ? { scale: [1, 2.2, 0], opacity: [1, 1, 0] } : { scale: 1 }}
              transition={{ duration: 0.5 }}
            />
            {/* Photon trail */}
            <div
              className="absolute top-1/2 -translate-y-1/2 h-0.5"
              style={{
                right: '100%',
                width: 90,
                background:
                  phase === 'breached'
                    ? 'linear-gradient(to left, rgba(218,30,40,0.5), transparent)'
                    : 'linear-gradient(to left, rgba(69,137,255,0.5), transparent)',
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Impact site: offending layer code */}
      <AnimatePresence>
        {phase === 'breached' && failedLayer && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-2 inset-x-3 flex items-center gap-2 bg-[#da1e28]/10 border border-[#da1e28]/40 px-2.5 py-1.5 z-20"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-[#ff8389] shrink-0" />
            <span className="text-[10px] font-mono font-bold text-[#ff8389] uppercase shrink-0">
              {isAr ? `تصدي الطبقة ${breachAt! + 1}` : `Layer ${breachAt! + 1} blocked`}
            </span>
            <span className="text-[10px] font-mono text-[var(--cds-text-02)] truncate" dir="ltr">
              {isAr ? failedLayer.detailsAr || failedLayer.details : failedLayer.details}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cleared banner */}
      <AnimatePresence>
        {phase === 'cleared' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-2 inset-x-3 flex items-center gap-2 bg-[#24a148]/10 border border-[#24a148]/40 px-2.5 py-1.5 z-20"
          >
            <Orbit className="w-3.5 h-3.5 text-[#42be65] shrink-0" />
            <span className="text-[10px] font-mono font-bold text-[#42be65] uppercase">
              {isAr
                ? `عبر الجسيم الضوئي جميع الطبقات التسع بأمان — جاهز للتنفيذ (${crossed}/9)`
                : `Photon cleared all 9 layers — safe to execute (${crossed}/9)`}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Idle hint */}
      {phase === 'idle' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[10px] font-mono text-[var(--cds-text-03)] uppercase tracking-widest">
            {isAr ? 'اضغط تنفيذ لمشاهدة عبور الاستعلام عبر البوابة الليزرية' : 'Press execute to send the photon through the gate'}
          </span>
        </div>
      )}
    </div>
  );
};
