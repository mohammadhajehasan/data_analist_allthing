import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../../context/AppContext';
import { WidgetConfig, Dataset } from '../../types';
import { ChartFactory, KpiCard } from '../charts/ChartFactory';
import { audio } from '../../utils/audioEngine';
import {
  X,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Type,
  Volume2,
  VolumeX,
} from 'lucide-react';

/**
 * Data Cinema — Story Mode
 * ========================
 * Turns a static dashboard into a guided cinematic reel: the screen dims,
 * each widget takes the stage full-bleed, the camera (container) performs a
 * slow Ken-Burns zoom-and-pan, and an analytical narration line types itself
 * beneath the chart — like a documentary for executives who refuse to read.
 *
 * Narration is generated deterministically from widget config + live data
 * statistics (no AI key required). Optional glass chimes mark scene changes.
 */

interface DataCinemaModeProps {
  isOpen: boolean;
  onClose: () => void;
  widgets: WidgetConfig[];
  datasets: Dataset[];
  activeTheme?: string;
}

const SCENE_MS = 7000;

export const DataCinemaMode: React.FC<DataCinemaModeProps> = ({
  isOpen,
  onClose,
  widgets,
  datasets,
  activeTheme,
}) => {
  const { language } = useApp();
  const isAr = language === 'ar';
  const [sceneIndex, setSceneIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [typedText, setTypedText] = useState('');
  const [withSound, setWithSound] = useState(false);
  const timerRef = useRef<number | null>(null);

  const ordered = useMemo(() => {
    // KPIs first (exec summary), then charts in dashboard order
    return [...widgets].sort((a, b) => (a.type === 'kpi' ? -1 : 0) - (b.type === 'kpi' ? -1 : 0));
  }, [widgets]);

  const current = ordered[sceneIndex];
  const widgetDataset = useMemo(
    () => (current ? datasets.find(d => d.id === current.datasetId) : undefined),
    [current, datasets]
  );

  // Deterministic narration computed from the widget's real aggregation
  const narration = useMemo((): string => {
    if (!current) return '';
    const rows = (widgetDataset?.data || []) as Record<string, any>[];
    const metric = current.yAxis;
    const dim = current.xAxis || current.categoryField;
    const agg = (current.aggregation || 'sum').toUpperCase();

    const num = (v: any) => {
      const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[$,\s%]/g, ''));
      return Number.isFinite(n) ? n : 0;
    };
    const fmt = (n: number) =>
      Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : n.toFixed(1);

    if (current.type === 'kpi') {
      const k = current.kpiMetric;
      return isAr
        ? `المؤشر الحالي: ${k?.label || 'مقياس رئيسي'} بقيمة ${k?.value || '—'}${k?.trendPercentage !== undefined ? `، باتجاه ${k.trendPercentage > 0 ? 'إيجابي' : 'سلبي'} بنسبة ${Math.abs(k.trendPercentage)}%` : ''}.`
        : `Current KPI: ${k?.label || 'metric'} at ${k?.value || '—'}${k?.trendPercentage !== undefined ? `, trending ${k.trendPercentage > 0 ? 'up' : 'down'} ${Math.abs(k.trendPercentage)}%` : ''}.`;
    }

    if (rows.length && metric) {
      const grouped = new Map<string, number[]>();
      rows.forEach(r => {
        const key = String(r[dim] ?? '—');
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(num(r[metric]));
      });
      const aggOf = (xs: number[]) => {
        switch ((current.aggregation || 'sum')) {
          case 'avg': return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
          case 'count': return xs.length;
          case 'min': return Math.min(...xs);
          case 'max': return Math.max(...xs);
          default: return xs.reduce((a, b) => a + b, 0);
        }
      };
      const entries = [...grouped.entries()].map(([k, xs]) => [k, aggOf(xs)] as [string, number]);
      if (entries.length) {
        const sorted = [...entries].sort((a, b) => b[1] - a[1]);
        const top = sorted[0];
        const share = sorted.reduce((s, [, v]) => s + Math.abs(v), 0);
        const pct = share ? ((Math.abs(top[1]) / share) * 100).toFixed(0) : '0';
        return isAr
          ? `${agg}(${metric}) حسب ${dim}: يتصدّر «${top[0]}» بقيمة ${fmt(top[1])} أي نحو ${pct}% من إجمالي المشهد، تليه ${sorted[1]?.[0] || '—'}.`
          : `${agg}(${metric}) by ${dim}: “${top[0]}” leads at ${fmt(top[1])} — roughly ${pct}% of the scene, followed by ${sorted[1]?.[0] || '—'}.`;
      }
    }

    return isAr
      ? `مشهد تحليلي: ${current.titleAr || current.title}.`
      : `Analytical scene: ${current.title}.`;
  }, [current, widgetDataset, isAr]);

  // Typewriter effect
  useEffect(() => {
    if (!isOpen || !narration) return;
    setTypedText('');
    let i = 0;
    const iv = window.setInterval(() => {
      i += 1;
      setTypedText(narration.slice(0, i));
      if (i >= narration.length) window.clearInterval(iv);
    }, 26);
    return () => window.clearInterval(iv);
  }, [isOpen, narration]);

  // Auto-advance
  useEffect(() => {
    if (!isOpen || !isPlaying || ordered.length <= 1) return;
    if (withSound) audio.chimeSuccess();
    timerRef.current = window.setTimeout(() => {
      setSceneIndex(i => (i + 1) % ordered.length);
    }, SCENE_MS);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isPlaying, sceneIndex, ordered.length, withSound]);

  // Esc to exit
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) setSceneIndex(0);
  }, [isOpen]);

  if (!isOpen || !current) return null;

  const kenBurns =
    sceneIndex % 2 === 0
      ? { scale: [1.02, 1.12], x: [0, -14], y: [0, -8] }
      : { scale: [1.12, 1.02], x: [-14, 0], y: [-8, 0] };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[90] bg-black/95 backdrop-blur-sm flex flex-col"
    >
      {/* Letterbox bars */}
      <div className="h-10 bg-black border-b border-[#262626] flex items-center justify-between px-4 shrink-0" dir={isAr ? 'rtl' : 'ltr'}>
        <div className="flex items-center gap-2">
          <Clapperboard className="w-4 h-4 text-[#f1c21b]" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#f1c21b]">
            {isAr ? 'سينما البيانات — وضع الحكاية' : 'Data Cinema — Story Mode'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setWithSound(s => !s)}
            className="p-1.5 text-[var(--cds-text-03)] hover:text-white transition-colors"
            title={isAr ? 'نغمات المشاهد' : 'Scene chimes'}
          >
            {withSound ? <Volume2 className="w-4 h-4 text-[#42be65]" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setIsPlaying(p => !p)}
            className="p-1.5 text-white/70 hover:text-white transition-colors"
            title={isAr ? 'تشغيل/إيقاف' : 'Play/Pause'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            onClick={() => setSceneIndex(i => (i - 1 + ordered.length) % ordered.length)}
            className="p-1.5 text-white/70 hover:text-white transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setSceneIndex(i => (i + 1) % ordered.length)}
            className="p-1.5 text-white/70 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-1.5 text-white/70 hover:text-white transition-colors" title="Esc">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scene stage */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.04 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="w-full max-w-5xl"
          >
            <motion.div
              animate={kenBurns}
              transition={{ duration: SCENE_MS / 1000, ease: 'linear' }}
              className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] shadow-2xl p-5 rounded-lg overflow-hidden"
            >
              {current.type === 'kpi' ? (
                <div className="h-64 flex items-center justify-center">
                  <KpiCard widget={current} />
                </div>
              ) : (
                <div className="h-[52vh]">
                  <ChartFactory widget={current} dataset={widgetDataset} activeTheme={activeTheme} />
                </div>
              )}
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Narration subtitle */}
      <div className="shrink-0 bg-gradient-to-t from-black via-black/85 to-transparent px-8 pb-8 pt-10">
        <div className="max-w-4xl mx-auto text-center min-h-[3.2rem] flex items-end justify-center" dir={isAr ? 'rtl' : 'ltr'}>
          <p className="text-base sm:text-lg text-white/95 font-medium leading-relaxed">
            {typedText}
            <span className="inline-block w-0.5 h-5 bg-[#4589ff] ms-0.5 animate-pulse align-middle" />
          </p>
        </div>
        {/* Reel progress */}
        <div className="flex items-center justify-center gap-1.5 mt-5">
          {ordered.map((w, i) => (
            <button
              key={w.id}
              onClick={() => setSceneIndex(i)}
              className={`h-1 rounded-full transition-all ${i === sceneIndex ? 'w-8 bg-[#4589ff]' : 'w-4 bg-white/25 hover:bg-white/50'}`}
              title={isAr ? w.titleAr || w.title : w.title}
            />
          ))}
        </div>
        <div className="flex items-center justify-center gap-2 mt-3 text-[10px] font-mono text-white/40 uppercase tracking-widest">
          <Type className="w-3 h-3" />
          <span>{isAr ? `المشهد ${sceneIndex + 1} من ${ordered.length}` : `Scene ${sceneIndex + 1} of ${ordered.length}`}</span>
        </div>
      </div>
    </motion.div>
  );
};
