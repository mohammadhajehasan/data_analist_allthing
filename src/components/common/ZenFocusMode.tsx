import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../../context/AppContext';
import { executeAnalyticalQuery } from '../../utils/analyticsEngine';
import { audio } from '../../utils/audioEngine';
import { QueryResult } from '../../types';
import { X, CornerDownLeft, Loader2, Moon } from 'lucide-react';

/**
 * Zen Focus Mode
 * ==============
 * A distraction-free analytical sanctuary: everything fades to a dark expanse
 * with a single neon command line floating at the center. The analyst types
 * a natural-language or SQL question; the local engine answers and the
 * results *grow organically* out of the line — table first, chart-ready —
 * showing only what the question actually needs.
 *
 * Fully local: NL parsing is a deterministic heuristic over the active
 * dataset schema (group-by + aggregation + optional top-N), so it works with
 * zero AI keys and zero latency. Esc exits at any time.
 */

interface ZenFocusModeProps {
  isOpen: boolean;
  onClose: () => void;
}

type ParsedIntent = {
  agg: 'sum' | 'avg' | 'count' | 'min' | 'max';
  metric?: string;
  dimension?: string;
  limit: number;
  desc: boolean;
};

const AGG_WORDS: Record<string, ParsedIntent['agg']> = {
  'total': 'sum', 'sum': 'sum', 'مجموع': 'sum', 'إجمالي': 'sum', 'اجمالي': 'sum',
  'average': 'avg', 'avg': 'avg', 'mean': 'avg', 'متوسط': 'avg',
  'count': 'count', 'number': 'count', 'عدد': 'count',
  'max': 'max', 'highest': 'max', 'أقصى': 'max', 'اكبر': 'max', 'أكبر': 'max',
  'min': 'min', 'lowest': 'min', 'أدنى': 'min', 'اصغر': 'min', 'أصغر': 'min',
};

// Arabic/English synonyms so the NL parser maps prompts like
// "التصنيف" -> category, "المنطقة" -> region, "الإيرادات" -> revenue…
const COLUMN_SYNONYMS: Record<string, string[]> = {
  category: ['تصنيف', 'التصنيف', 'فئة', 'الفئة', 'category'],
  region: ['منطقة', 'المنطقة', 'المناطق', 'region'],
  country: ['بلد', 'دولة', 'الدولة', 'البلد', 'country'],
  product: ['منتج', 'المنتج', 'المنتجات', 'product'],
  revenue: ['إيراد', 'إيرادات', 'الإيرادات', 'ايرادات', 'مبيعات', 'revenue', 'sales'],
  profit: ['ربح', 'أرباح', 'ارباح', 'الأرباح', 'profit', 'margin'],
  cost: ['تكلفة', 'التكلفة', 'تكاليف', 'cost'],
  date: ['تاريخ', 'التاريخ', 'date'],
  rating: ['تقييم', 'التقييم', 'rating'],
};

export const ZenFocusMode: React.FC<ZenFocusModeProps> = ({ isOpen, onClose }) => {
  const { language, activeDataset } = useApp();
  const isAr = language === 'ar';
  const [prompt, setPrompt] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [usedIntent, setUsedIntent] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 250);
    } else {
      setPrompt('');
      setResult(null);
      setIsThinking(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const numericColumns = useMemo(
    () => (activeDataset?.columns || []).filter(c => ['NUMBER', 'FLOAT', 'INT', 'INTEGER', 'DECIMAL'].includes((c.type || '').toUpperCase())),
    [activeDataset]
  );
  const dimensionColumns = useMemo(
    () => (activeDataset?.columns || []).filter(c => !['NUMBER', 'FLOAT', 'INT', 'INTEGER', 'DECIMAL'].includes((c.type || '').toUpperCase())),
    [activeDataset]
  );

  const parseIntent = (text: string): ParsedIntent => {
    const lower = text.toLowerCase();
    let agg: ParsedIntent['agg'] = 'sum';
    for (const [w, a] of Object.entries(AGG_WORDS)) {
      if (lower.includes(w)) { agg = a; break; }
    }
    // Match a column either by its literal name or by Arabic/English synonyms
    const matchColumn = (cols: { name: string }[]): string | undefined =>
      cols.find(c => lower.includes(c.name.toLowerCase()))?.name ||
      cols.find(c =>
        (COLUMN_SYNONYMS[c.name.toLowerCase()] || []).some(syn => lower.includes(syn))
      )?.name;

    const metric: string | undefined =
      matchColumn(numericColumns) ||
      (agg === 'count' ? undefined : numericColumns[0]?.name);
    const dimension: string | undefined =
      matchColumn(dimensionColumns) || dimensionColumns[0]?.name;
    const limitMatch = lower.match(/top\s+(\d+)|أفضل\s+(\d+)|اعلى\s+(\d+)|أعلى\s+(\d+)/);
    const limit = limitMatch ? parseInt(limitMatch[1] || limitMatch[2] || limitMatch[3] || limitMatch[4], 10) : 8;
    const desc = !/asc|تصاعدي/.test(lower);
    return { agg, metric, dimension, limit, desc };
  };

  const run = () => {
    if (!activeDataset || !prompt.trim()) return;
    setIsThinking(true);
    const intent = parseIntent(prompt);

    window.setTimeout(() => {
      try {
        const result = executeAnalyticalQuery(activeDataset, {
          datasetId: activeDataset.id,
          aggregations: intent.metric
            ? [{ column: intent.metric, agg: intent.agg, alias: `${intent.agg}_${intent.metric}` }]
            : [{ column: '*', agg: 'count', alias: 'count' }],
          groupBy: intent.dimension ? [intent.dimension] : undefined,
          orderBy: intent.dimension
            ? undefined
            : undefined,
          limit: intent.limit,
        });
        setResult(result);
        setUsedIntent(
          isAr
            ? `${intent.agg.toUpperCase()}(${intent.metric || 'الصفوف'})${intent.dimension ? ` حسب ${intent.dimension}` : ''}`
            : `${intent.agg.toUpperCase()}(${intent.metric || 'rows'})${intent.dimension ? ` by ${intent.dimension}` : ''}`
        );
        audio.chimeSuccess();
        window.dispatchEvent(new CustomEvent('carbon-analytical-success'));
      } catch {
        audio.chimeError();
        window.dispatchEvent(new CustomEvent('carbon-analytical-error', { detail: 'zen query failed' }));
      }
      setIsThinking(false);
    }, 650);
  };

  const resultTable = useMemo(() => {
    if (!result || result.rows.length === 0) return null;
    const cols = result.columns.slice(0, 4);
    const rows = result.rows.slice(0, 8);
    return { cols, rows };
  }, [result]);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[95] bg-[#05070c]/98 backdrop-blur-md flex flex-col items-center justify-center overflow-y-auto"
    >
      {/* Stars — faint twinkling backdrop */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        {Array.from({ length: 40 }, (_, i) => (
          <motion.span
            key={i}
            className="absolute w-0.5 h-0.5 rounded-full bg-white/60"
            style={{ left: `${(i * 97) % 100}%`, top: `${(i * 53) % 100}%` }}
            animate={{ opacity: [0.1, 0.7, 0.1] }}
            transition={{ duration: 2 + (i % 5), repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </div>

      {/* Exit */}
      <button
        onClick={onClose}
        className="absolute top-5 end-5 p-2 text-white/40 hover:text-white transition-colors z-10"
        title="Esc"
      >
        <X className="w-5 h-5" />
      </button>
      <div className="absolute top-6 start-6 flex items-center gap-2 text-white/30 z-10" dir={isAr ? 'rtl' : 'ltr'}>
        <Moon className="w-3.5 h-3.5" />
        <span className="text-[10px] font-mono uppercase tracking-widest">
          {isAr ? 'نمط الزن — مساحة تحليلية هادئة' : 'Zen Mode — quiet analytical space'}
        </span>
      </div>

      {/* Central command line */}
      <div className="w-full max-w-2xl px-6 relative z-10">
        <motion.div
          layout
          className="flex items-center gap-3 bg-transparent border-b-2 pb-3"
          style={{ borderColor: '#4589ff' }}
          dir={isAr ? 'rtl' : 'ltr'}
        >
          <motion.span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: '#4589ff', boxShadow: '0 0 14px 4px rgba(69,137,255,0.6)' }}
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 2.2, repeat: Infinity }}
          />
          <input
            ref={inputRef}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !isThinking) run(); }}
            placeholder={
              isAr
                ? 'اسأل بياناتك بحرية… (مثال: إجمالي الإيرادات حسب التصنيف، أفضل 5)'
                : 'Ask your data anything… (e.g. total revenue by category, top 5)'
            }
            className="flex-1 bg-transparent text-white/95 text-lg sm:text-xl font-light outline-none placeholder:text-white/30 tracking-wide"
          />
          {isThinking ? (
            <Loader2 className="w-5 h-5 text-[#4589ff] animate-spin shrink-0" />
          ) : (
            <CornerDownLeft className="w-5 h-5 text-white/30 shrink-0" />
          )}
        </motion.div>

        {/* Organic result growth */}
        <AnimatePresence>
          {usedIntent && result && (
            <motion.div
              initial={{ opacity: 0, y: -14, scaleY: 0.6 }}
              animate={{ opacity: 1, y: 0, scaleY: 1 }}
              transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
              className="origin-top mt-10 space-y-5"
              dir={isAr ? 'rtl' : 'ltr'}
            >
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-[11px] font-mono text-[#4589ff]/80 uppercase tracking-widest"
              >
                {usedIntent} • {result.executionTimeMs}ms
              </motion.p>

              {resultTable && (
                <motion.div
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45, duration: 0.8 }}
                  className="border border-white/10 bg-white/[0.03] rounded-lg overflow-hidden"
                >
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        {resultTable.cols.map(c => (
                          <th key={c} className="px-5 py-3 text-start text-[11px] font-mono uppercase tracking-wider text-white/50">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {resultTable.rows.map((r, i) => (
                        <motion.tr
                          key={i}
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.6 + i * 0.08 }}
                          className="border-b border-white/5 last:border-0 hover:bg-white/[0.04] transition-colors"
                        >
                          {resultTable.cols.map(c => (
                            <td key={c} className="px-5 py-2.5 text-white/85 font-light">
                              {typeof r[c] === 'number' ? r[c].toLocaleString() : String(r[c] ?? '—')}
                            </td>
                          ))}
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Gentle suggestions when idle */}
        {!result && !isThinking && activeDataset && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, y: [0, -4, 0] }}
            transition={{ opacity: { delay: 0.8 }, y: { duration: 4, repeat: Infinity } }}
            className="mt-12 flex flex-wrap items-center justify-center gap-2"
            dir={isAr ? 'rtl' : 'ltr'}
          >
            {(isAr
              ? ['إجمالي الإيرادات حسب التصنيف', 'متوسط الأرباح حسب المنطقة', 'أعلى 5 منتجات']
              : ['total revenue by category', 'average profit by region', 'top 5 products']
            ).map(s => (
              <button
                key={s}
                onClick={() => { setPrompt(s); }}
                className="px-3 py-1.5 text-xs font-mono text-white/40 hover:text-[#4589ff] border border-white/10 hover:border-[#4589ff]/40 rounded-full transition-colors"
              >
                {s}
              </button>
            ))}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};
