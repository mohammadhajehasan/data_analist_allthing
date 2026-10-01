import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { useApp } from '../../context/AppContext';
import { audio } from '../../utils/audioEngine';
import { Volume2, VolumeX } from 'lucide-react';

/**
 * Sonification toggle — enables the ambient data drone + interaction cues.
 * Reflects live dataset quality: the drone retunes as the active dataset
 * changes (pure harmony for pristine data, subtle dissonance for decay).
 */
export const SonificationToggle: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { language, activeDataset } = useApp();
  const isAr = language === 'ar';
  const [enabled, setEnabled] = useState(audio.enabled);

  useEffect(() => audio.onEnabledChange(setEnabled), []);

  useEffect(() => {
    if (enabled && activeDataset) {
      audio.startAmbient(activeDataset.profile?.quality?.overallScore ?? 95);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, activeDataset?.id]);

  const toggle = () => {
    const next = !enabled;
    audio.setEnabled(next, activeDataset?.profile?.quality?.overallScore ?? 95);
    setEnabled(next);
  };

  return (
    <button
      onClick={toggle}
      className={`h-9 flex items-center gap-1.5 px-2.5 rounded-lg border text-xs font-semibold transition-colors ${
        enabled
          ? 'bg-[#0f62fe]/15 border-[#0f62fe]/50 text-[#78a9ff]'
          : 'bg-[var(--cds-layer-01)] hover:bg-[var(--cds-layer-02)] border-[var(--cds-border-subtle)] text-[var(--cds-text-02)] hover:text-[var(--cds-text-01)]'
      }`}
      title={
        isAr
          ? enabled
            ? 'التناغم السمعي مفعّل — البيانات تغني جودتها'
            : 'تفعيل التناغم السمعي للبيانات (أصوات محيطة هادئة تعبر عن جودة البيانات)'
          : enabled
          ? 'Sonification on — your data sings its health'
          : 'Enable ambient data sonification'
      }
      aria-pressed={enabled}
    >
      {enabled ? (
        <motion.span
          className="flex items-center"
          initial={false}
        >
          <Volume2 className="w-4 h-4 text-[#78a9ff]" />
        </motion.span>
      ) : (
        <VolumeX className="w-4 h-4" />
      )}
      {!compact && (
        <span className="hidden lg:inline">
          {isAr ? 'تناغم' : 'Sonify'}
        </span>
      )}
    </button>
  );
};
