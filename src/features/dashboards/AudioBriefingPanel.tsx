import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { computeMathematicalAggregation, getAggregationLabel } from '../../components/charts/ChartFactory';
import { WidgetConfig, AggregationFunction } from '../../types';
import { Play, Pause, Volume2, SkipBack, Music, RefreshCw, Layers, CheckCircle2, Languages, Sparkles } from 'lucide-react';
import { applyBestVoice } from '../../services/bestVoice';

export const AudioBriefingPanel: React.FC = () => {
  const { activeDashboard, datasets, language, toast, aiSettings } = useApp();
  const isAr = language === 'ar';

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [briefingLanguage, setBriefingLanguage] = useState<'ar' | 'en'>(isAr ? 'ar' : 'en');
  const [progress, setProgress] = useState(0);
  const [isSynthesizing, setIsSynthesizing] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<SpeechSynthesisUtterance | null>(null);

  // إعادة الحساب يدوياً عبر زر التحديث خاصية regenCount
  const [regenCount, setRegenCount] = useState(0);

  // ------------------------------------------------------------
  // الموجز مشتق فعلياً من اللوحة النشطة (مؤشرات KPI + رسوم + مجموعاتها)
  // بدل النص الثابت السابق الذي كان لا يتغير مع اللوحة أبداً.
  // ------------------------------------------------------------
  // ------------------------------------------------------------
  // توليد الموجز بذكاء اصطناعي (نفس نموذج المستخدم النشط في المنصة)
  // مع سقوط آمن على القالب الحتمي عند غياب النموذج أو فشل الاستدعاء.
  // ------------------------------------------------------------
  const [aiGenerated, setAiGenerated] = useState<string | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  const generateAiBriefing = async () => {
    if (!activeDashboard) return;
    setIsGeneratingAi(true);
    try {
      // جمع الإحصائيات الحقيقية للوحة النشطة لتغذية النموذج
      const stats: string[] = [];
      const widgets = activeDashboard.widgets || [];
      const dsById = new Map(datasets.map(d => [d.id, d]));
      for (const w of widgets) {
        const ds = dsById.get(w.datasetId);
        if (!ds || !ds.data?.length) continue;
        const yCol = w.yAxis;
        const xCol = w.xAxis || w.categoryField;
        if (yCol && w.type !== 'kpi') {
          const vals = ds.data.map(r => typeof r[yCol] === 'number' ? r[yCol] : parseFloat(String(r[yCol]).replace(/[$,\s%]/g, ''))).filter(v => !isNaN(v));
          if (vals.length) {
            const sum = computeMathematicalAggregation(vals, 'sum');
            const avg = computeMathematicalAggregation(vals, 'avg');
            let top = '';
            if (xCol) {
              const groups: Record<string, number[]> = {};
              ds.data.forEach(r => {
                const k = r[xCol]; if (k == null || String(k).trim() === '') return;
                const n = typeof r[yCol] === 'number' ? r[yCol] : parseFloat(String(r[yCol]).replace(/[$,\s%]/g, ''));
                if (!isNaN(n)) (groups[String(k).trim()] ||= []).push(n);
              });
              const entries = Object.entries(groups).map(([k, v]) => ({ k, v: computeMathematicalAggregation(v, 'sum') })).sort((a, b) => b.v - a.v);
              if (entries.length && (w.aggregation || 'sum') !== 'count') top = `؛ أعلى فئة بـ SUM: "${entries[0].k}" (${Number(entries[0].v).toLocaleString('en-US')})`;
            }
            stats.push(`- رسم "${w.title}" [${(w.aggregation||'sum')}(${yCol})${xCol ? ` by ${xCol}`: ''}] على ${vals.length} صف: SUM=${Number(sum).toLocaleString('en-US')}, AVG=${Number(avg).toLocaleString('en-US')}${top}`);
          }
        }
        if (w.type === 'kpi' && w.kpiMetric) {
          stats.push(`- KPI "${w.title}": ${w.kpiMetric.value}${w.kpiMetric.trendPercentage !== undefined ? ` (اتجاه ${w.kpiMetric.trendDirection || 'ثابت'} ${w.kpiMetric.trendPercentage}%)` : ''} — ${w.kpiMetric.label}`);
        }
      }

      const prompt = [
        isAr ? 'اكتب موجزاً تنفيذياً صوتياً بالعربية المختصرة (4–6 أسطر) لصاحب العمل مبني على لوحة التحكم الآتية.'
             : 'Write a concise (4–6 line) spoken executive audio briefing in English from the following dashboard.',
        isAr ? `اسم اللوحة: ${activeDashboard.nameAr || activeDashboard.name || '—'}`
             : `Dashboard: ${activeDashboard.name || '—'}`,
        isAr ? 'الإحصائيات الحقيقية المحسوبة من الأدوات:' : 'Real computed statistics:',
        ...stats,
        isAr ? 'الأسلوب: تنفيذي، م الفيّ، مراقب للمخاطر، مع توصية واحدة قابلة للتنفيذ واذكر أرقاماً محددة. بدون مقدمة إنكارية أو هدراً.'
             : 'Style: executive, factual, risk-aware, with one actionable recommendation and concrete numbers. No preamble.'
      ].join('\n');

      const provider = aiSettings?.activeProvider || 'gemini';
      const model = aiSettings?.activeModel || 'gemini-3.8-flash';
      const { getStoredToken } = await import('../auth/LoginPage');
      const token = getStoredToken();
      const res = await fetch('/api/ai/sandbox/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ provider, model, prompt, maxTokens: 700 }),
      });
      const data = await res.json();
      if (!res.ok || !data?.text) throw new Error(data?.error || (isAr ? 'فشل استدعاء النموذج' : 'Model call failed'));
      const cleaned = String(data.text).replace(/^```[a-z]*\n?|\n?```$/g, '').trim();
      setAiGenerated(cleaned);
      toast.success(
        isAr ? 'كُتب الموجز بنموذج الذكاء' : 'AI-authored briefing ready',
        isAr ? `صياغة أعمق بنموذج ${model} مبنية على أرقام لوحتك، بديلة عن القالب الجاهز.`
             : `Deeper narrative via ${model}, based on your dashboard numbers.`
      );
    } catch (err: any) {
      toast.error(
        isAr ? 'تعذر توليد الموجز بالذكاء — القالب الحتمي متاح دائماً' : 'AI brief failed — static template still available',
        err.message
      );
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // الصوت يقرأ نص الذكاء إن وُجد، وإلا القالب الحتمي
  const briefingText = React.useMemo(() => {
    if (aiGenerated) return aiGenerated;
    if (!activeDashboard) {
      return isAr
        ? 'لا توجد لوحة تحكم نشطة حالياً. أنشئ لوحة وأضف إليها مؤشرات للاستماع إلى موجز تنفيذي مخصص.'
        : 'No active dashboard. Create a dashboard and add widgets to hear a tailored executive brief.';
    }

    const dashName = isAr ? activeDashboard.nameAr || activeDashboard.name || 'لوحتك' : activeDashboard.name || 'your dashboard';
    const widgets: WidgetConfig[] = activeDashboard.widgets || [];

    if (widgets.length === 0) {
      return isAr
        ? `لوحة "${dashName}" فارغة حالياً. أضف مؤشرات أداء أو رسوم بيانية ليعكس الموجز أرقامها.`
        : `Dashboard "${dashName}" has no widgets yet. Add KPIs or charts for the briefing to reflect them.`;
    }

    const datasetsById = new Map(datasets.map(d => [d.id, d]));
    const lines: string[] = [];

    if (isAr) {
      lines.push(`مرحباً. هذا موجزك التنفيذي للوحة "${dashName}".`);
    } else {
      lines.push(`Hello. Here is your executive brief for "${dashName}".`);
    }

    // 1) مؤشرات KPI — القيم الحقيقية المخزّنة في الأدوات نفسها
    const kpis = widgets.filter(w => w.type === 'kpi' && w.kpiMetric);
    kpis.forEach(w => {
      const kpi = w.kpiMetric!;
      const title = isAr ? w.titleAr || w.title : w.title;
      const trend = kpi.trendDirection === 'up' ? (isAr ? 'مع اتجاه صاعد' : 'and trending up')
        : kpi.trendDirection === 'down' ? (isAr ? 'مع اتجاه هابط' : 'and trending down') : '';
      lines.push(isAr
        ? `المؤشر "${title}" يسجل ${kpi.value}${trend ? '، ' + trend : ''} (${kpi.label}).`
        : `KPI "${title}" reads ${kpi.value}${trend ? ', ' + trend : ''} (${kpi.label}).`);
    });

    // 2) الرسوم — حساب التجميع فعلياً من بيانات المجموعة المرتبطة بكل رسم
    const charts = widgets.filter(w => w.type !== 'kpi');
    charts.slice(0, 5).forEach(w => {
      const ds = datasetsById.get(w.datasetId);
      if (!ds || !ds.data || ds.data.length === 0) return;
      const yCol = w.yAxis;
      const xCol = w.xAxis || w.categoryField;
      if (!yCol) return;
      const values = ds.data.map(r => {
        const raw = r[yCol];
        return typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[$,\s%]/g, ''));
      }).filter(v => !isNaN(v));
      if (values.length === 0) return;
      const agg = (w.aggregation || 'sum') as AggregationFunction;
      const computed = computeMathematicalAggregation(values, agg);
      const aggLabel = getAggregationLabel(agg, isAr ? 'ar' : 'en');
      const title = isAr ? w.titleAr || w.title : w.title;
      let topAdvice = '';
      if (xCol && agg !== 'count') {
        const groups: Record<string, number[]> = {};
        ds.data.forEach(r => {
          const label = r[xCol];
          if (label === undefined || label === null || String(label).trim() === '') return;
          const raw = r[yCol];
          const num = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[$,\s%]/g, ''));
          if (!isNaN(num)) {
            const key = String(label).trim();
            (groups[key] ||= []).push(num);
          }
        });
        const entries = Object.entries(groups).map(([k, vals]) => ({ k, v: computeMathematicalAggregation(vals, agg) }));
        entries.sort((a, b) => b.v - a.v);
        if (entries.length > 1) {
          topAdvice = isAr
            ? ` أعلى تصنيف من حيث ${aggLabel.toLowerCase()} هو "${entries[0].k}" يليه "${entries[1].k}".`
            : ` The top category by ${aggLabel.toLowerCase()} is "${entries[0].k}", followed by "${entries[1].k}".`;
        }
      }
      lines.push(isAr
        ? `في الرسم "${title}" (${aggLabel} لعمود ${yCol} على ${values.length} سجلاً) النتيجة ${Number(computed).toLocaleString('ar-SA')}.${topAdvice}`
        : `Chart "${title}" (${aggLabel.toLowerCase()} of ${yCol} across ${values.length} records) computes ${Number(computed).toLocaleString('en-US')}.${topAdvice}`);
    });

    if (lines.length <= 1) {
      lines.push(isAr
        ? 'الأدوات المرتبطة بالمجموعات غير متاحة أيضاً، أضف إليها حين تتوفر بيانات.'
        : 'Widgets reference datasets that are not loaded yet; the brief will reflect them once available.');
    }

    lines.push(isAr ? 'شكراً لاستماعك.' : 'Thank you for listening.');
    return lines.join('\n');

  }, [activeDashboard?.id, activeDashboard?.widgets?.length, briefingLanguage, datasets, regenCount, aiGenerated]);

  // Handle Play/Pause Speech Synthesis
  const handlePlayPause = () => {
    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      
      // Stop all ongoing synthesis first
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(briefingText);
      const targetLang: 'ar-SA' | 'en-US' = briefingLanguage === 'ar' ? 'ar-SA' : 'en-US';
      utterance.lang = targetLang;
      // اختيار أفضل صوت متاح من النظام لهذه اللغة تلقائياً (يعطي نطقاً أعلى جودة إن وُجد)
      applyBestVoice(utterance, targetLang);
      utterance.rate = playbackSpeed;

      utterance.onend = () => {
        setIsPlaying(false);
        setProgress(100);
      };

      utterance.onerror = () => {
        // Fallback progress simulator in case TTS is sandboxed or blocked
        console.warn('SpeechSynthesis blocked by container sandbox. Falling back to animated audio waveform simulation.');
      };

      audioContextRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    }
  };

  // Simulate progress when playing
  useEffect(() => {
    let timer: any;
    if (isPlaying) {
      timer = setInterval(() => {
        setProgress(prev => {
          if (prev >= 100) {
            setIsPlaying(false);
            window.speechSynthesis.cancel();
            return 0;
          }
          return prev + (0.5 * playbackSpeed);
        });
      }, 250);
    }
    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed]);

  // Clean cancel on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // Premium Canvas Audio Waveform animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let phase = 0;

    const drawWave = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const width = canvas.width;
      const height = canvas.height;

      ctx.lineWidth = 2;
      
      // Draw 3 layers of harmonic waves
      for (let w = 0; w < 3; w++) {
        ctx.beginPath();
        
        const opacity = 1 - w * 0.3;
        const color = w === 0 ? '#8a3ffc' : w === 1 ? '#0f62fe' : '#33b1ff';
        ctx.strokeStyle = isPlaying ? color : '#393939';
        ctx.strokeStyle = isPlaying ? `${color}${Math.floor(opacity * 255).toString(16)}` : '#393939';

        const amplitude = isPlaying ? (w === 0 ? 16 : w === 1 ? 12 : 8) : 2;
        const frequency = w === 0 ? 0.015 : w === 1 ? 0.025 : 0.01;

        for (let x = 0; x < width; x++) {
          const y = height / 2 + Math.sin(x * frequency + phase + w * 2) * amplitude;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      if (isPlaying) phase += 0.12 * playbackSpeed;
      else phase += 0.005;

      animationId = requestAnimationFrame(drawWave);
    };

    drawWave();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [isPlaying, playbackSpeed]);

  const handleRegenerateBriefing = () => {
    setIsSynthesizing(true);
    setProgress(0);
    window.speechSynthesis.cancel();
    setIsPlaying(false);

    // إعادة الحساب فعلياً من اللوحة النشطة (ليس مؤقتاً تجميلياً)
    setTimeout(() => {
      setRegenCount(c => c + 1);
      setIsSynthesizing(false);
      toast.success(
        isAr ? 'تم تحديث وتحضير الموجز الصوتي' : 'Audio Briefing Re-compiled',
        isAr ? 'أعيد حساب الموجز من مؤشرات ورسوم اللوحة النشطة الآن.' : 'Briefing recomputed from the active dashboard widgets.'
      );
    }, 600);
  };

  return (
    <div className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--cds-border-subtle)] pb-3">
        <div className="flex items-center gap-2">
          <Volume2 className="w-5 h-5 text-[#8a3ffc]" />
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              {isAr ? 'الموجز الصوتي التنفيذي (AI Audio Briefing)' : 'AI Executive Audio Briefing'}
            </h3>
            <p className="text-[11px] text-[var(--cds-text-02)] mt-0.5">
              {isAr
                ? 'استمع إلى تقرير صوتي ذكي يلخص أهم الرؤى والأرقام في لوحة تحكمك الحالية'
                : 'Listen to a synthesized executive summary covering active KPIs and trends'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-mono">
          {/* صياغة أعمق بنموذج الذكاء النشط — بديل القالب الجاهز */}
          <button
            onClick={generateAiBriefing}
            disabled={isGeneratingAi || !activeDashboard}
            title={isAr ? 'صياغة موجز تحليلي أعمق بنموذج الذكاء النشط مبنية على أرقام اللوحة' : 'Generate a deeper analytical brief with the active AI model, based on dashboard stats'}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-[#8a3ffc]/10 border border-[#8a3ffc]/40 hover:bg-[#8a3ffc]/20 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isGeneratingAi ? 'animate-pulse' : ''}`} />
            <span>{isGeneratingAi ? (isAr ? 'يكتب النموذج...' : 'Writing...') : (isAr ? 'موجز أعمق بنموذج AI' : 'Deeper AI brief')}</span>
          </button>
          <button
            onClick={() => {
              window.speechSynthesis.cancel();
              setIsPlaying(false);
              setBriefingLanguage(prev => prev === 'ar' ? 'en' : 'ar');
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] hover:border-[#8a3ffc] text-[var(--cds-text-02)] hover:text-white transition-colors"
          >
            <Languages className="w-3.5 h-3.5 text-[#8a3ffc]" />
            <span>{briefingLanguage === 'ar' ? 'العربية' : 'English'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
        {/* Animated Sound Wave Visualizer & Controls (Left) */}
        <div className="lg:col-span-5 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-4 flex flex-col justify-between h-[180px]">
          {/* Animated Canvas Wave */}
          <div className="relative flex-1 flex items-center justify-center">
            <canvas ref={canvasRef} className="w-full h-16" width={320} height={64} />
            
            {isSynthesizing && (
              <div className="absolute inset-0 bg-[var(--cds-layer-01)]/90 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 text-[#8a3ffc] animate-spin" />
                <span className="text-[10px] font-mono text-white font-bold">RE-SYNTHESIZING...</span>
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div className="w-full bg-[var(--cds-layer-02)] h-1.5 overflow-hidden mb-3">
            <div className="h-full bg-[#8a3ffc] transition-all" style={{ width: `${progress}%` }} />
          </div>

          {/* Player controls */}
          <div className="flex items-center justify-between text-xs font-mono">
            {/* Speed selection */}
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--cds-text-03)]">{isAr ? 'السرعة:' : 'Speed:'}</span>
              {[1.0, 1.25, 1.5].map(speed => (
                <button
                  key={speed}
                  onClick={() => {
                    setPlaybackSpeed(speed);
                    if (isPlaying) {
                      // Restart with new rate
                      window.speechSynthesis.cancel();
                      const utterance = new SpeechSynthesisUtterance(briefingText);
                      const tl: 'ar-SA' | 'en-US' = briefingLanguage === 'ar' ? 'ar-SA' : 'en-US';
                      utterance.lang = tl;
                      applyBestVoice(utterance, tl);
                      utterance.rate = speed;
                      utterance.onend = () => setIsPlaying(false);
                      audioContextRef.current = utterance;
                      window.speechSynthesis.speak(utterance);
                    }
                  }}
                  className={`px-1.5 py-0.5 border font-bold text-[10px] ${
                    playbackSpeed === speed
                      ? 'bg-[#8a3ffc]/20 border-[#8a3ffc] text-white'
                      : 'bg-transparent border-[var(--cds-border-subtle)] text-[var(--cds-text-03)] hover:text-white'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>

            {/* Main Play Button */}
            <button
              onClick={handlePlayPause}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-[#8a3ffc] hover:bg-[#6929c4] text-white font-bold uppercase transition-colors"
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>{isAr ? 'إيقاف المؤقت' : 'Pause'}</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>{isAr ? 'استماع الآن' : 'Listen Brief'}</span>
                </>
              )}
            </button>

            {/* Re-generate button */}
            <button
              onClick={handleRegenerateBriefing}
              title={isAr ? 'تحديث الموجز بالبيانات الجديدة' : 'Re-synthesize latest data'}
              className="p-1.5 bg-[var(--cds-layer-02)] hover:bg-[var(--cds-layer-03)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-02)] hover:text-white transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Written Narrative Summary (Right) */}
        <div className="lg:col-span-7 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-4 h-[180px] overflow-y-auto font-mono text-xs text-[var(--cds-text-02)] leading-relaxed relative">
          <div className="absolute top-2.5 end-3 text-[9px] font-bold uppercase px-1.5 py-0.2 tracking-wider flex items-center gap-1 bg-[#8a3ffc]/20 text-[#8a3ffc]">
            <Music className="w-3 h-3" />
            <span>{aiGenerated ? (isAr ? 'صياغة النموذج' : 'AI-AUTHORED BRIEF') : 'EXECUTIVE BRIEF TRANSCRIPT'}</span>
          </div>
          <div className="pt-4 pr-1 text-start">
            {briefingText.split('\n').map((line, idx) => (
              <p key={idx} className="mb-2 last:mb-0">
                {line}
              </p>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
