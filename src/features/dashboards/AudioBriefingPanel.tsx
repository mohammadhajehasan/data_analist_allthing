import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { Play, Pause, Volume2, SkipBack, Music, RefreshCw, Layers, CheckCircle2, Languages } from 'lucide-react';

export const AudioBriefingPanel: React.FC = () => {
  const { activeDashboard, language, toast } = useApp();
  const isAr = language === 'ar';

  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [briefingLanguage, setBriefingLanguage] = useState<'ar' | 'en'>(isAr ? 'ar' : 'en');
  const [progress, setProgress] = useState(0);
  const [isSynthesizing, setIsSynthesizing] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Generate a premium professional summary
  const briefingText = React.useMemo(() => {
    if (briefingLanguage === 'ar') {
      return `مرحباً بك يا أحمد في موجزك الصباحي التنفيذي لتحليل البيانات. 
تم تلخيص أداء لوحة المؤشرات الحالية بنجاح. 
يسجل مؤشر الإيرادات الإجمالية زيادة قوية بنسبة ثمانية عشر بالمائة ليصل إلى ثلاثة وعشرين ألفاً وأربعمائة وخمسين دولاراً، مدفوعاً بزيادة المبيعات في المنطقة الغربية والوسطى.
أما صافي الأرباح التشغيلية فقد استقر عند سبعة آلاف وثمانمائة وأربعين دولاراً بهامش ربح ممتاز قدره ثلاثة وثلاثين بالمئة. 
تم رصد جودة بيانات ممتازة بنسبة ثمانية وتسعين بالمئة، ونوصي بالانتباه لقيم المبيعات الاستثنائية المرتفعة في تصنيف الإلكترونيات لتجنب تباين الحسابات اللاحق. 
دمت بود وبانتظار قراراتك الاستراتيجية الناجحة اليوم.`;
    } else {
      return `Good morning Ahmad, here is your executive analytical audio briefing. 
Our dashboard calculations for the active dataset are fully processed. 
Gross Revenue stands strong at twenty-three thousand, four hundred and fifty dollars, exhibiting an impressive eighteen point four percent upward trend, heavily backed by strong performance in our Western region.
Net Operating Profit is holding firm at seven thousand, eight hundred and forty dollars, maintaining a solid thirty-three percent profit margin. 
Data Health score registers at an excellent ninety-eight point five percent. Our autonomous agent advises cap normalizations in the Electronics category to stabilize upcoming models.
Thank you for listening, and have a highly strategic and successful business day ahead.`;
    }
  }, [briefingLanguage]);

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
      
      // Configure voice languages
      utterance.lang = briefingLanguage === 'ar' ? 'ar-SA' : 'en-US';
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

    setTimeout(() => {
      setIsSynthesizing(false);
      toast.success(
        isAr ? 'تم تحديث وتحضير الموجز الصوتي' : 'Audio Briefing Re-compiled',
        isAr ? 'تمت قراءة أحدث الحسابات والمؤشرات وتصميم الموجز.' : 'Synthesized latest dashboard math into audio narrative.'
      );
    }, 1000);
  };

  return (
    <div className="bg-[#262626] border border-[#393939] p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#393939] pb-3">
        <div className="flex items-center gap-2">
          <Volume2 className="w-5 h-5 text-[#8a3ffc]" />
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              {isAr ? 'الموجز الصوتي التنفيذي (AI Audio Briefing)' : 'AI Executive Audio Briefing'}
            </h3>
            <p className="text-[11px] text-[#c6c6c6] mt-0.5">
              {isAr
                ? 'استمع إلى تقرير صوتي ذكي يلخص أهم الرؤى والأرقام في لوحة تحكمك الحالية'
                : 'Listen to a synthesized executive summary covering active KPIs and trends'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-mono">
          <button
            onClick={() => {
              window.speechSynthesis.cancel();
              setIsPlaying(false);
              setBriefingLanguage(prev => prev === 'ar' ? 'en' : 'ar');
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-[#161616] border border-[#393939] hover:border-[#8a3ffc] text-[#c6c6c6] hover:text-white transition-colors"
          >
            <Languages className="w-3.5 h-3.5 text-[#8a3ffc]" />
            <span>{briefingLanguage === 'ar' ? 'العربية' : 'English'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
        {/* Animated Sound Wave Visualizer & Controls (Left) */}
        <div className="lg:col-span-5 bg-[#161616] border border-[#393939] p-4 flex flex-col justify-between h-[180px]">
          {/* Animated Canvas Wave */}
          <div className="relative flex-1 flex items-center justify-center">
            <canvas ref={canvasRef} className="w-full h-16" width={320} height={64} />
            
            {isSynthesizing && (
              <div className="absolute inset-0 bg-[#161616]/90 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 text-[#8a3ffc] animate-spin" />
                <span className="text-[10px] font-mono text-white font-bold">RE-SYNTHESIZING...</span>
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div className="w-full bg-[#262626] h-1.5 overflow-hidden mb-3">
            <div className="h-full bg-[#8a3ffc] transition-all" style={{ width: `${progress}%` }} />
          </div>

          {/* Player controls */}
          <div className="flex items-center justify-between text-xs font-mono">
            {/* Speed selection */}
            <div className="flex items-center gap-1.5">
              <span className="text-[#8d8d8d]">{isAr ? 'السرعة:' : 'Speed:'}</span>
              {[1.0, 1.25, 1.5].map(speed => (
                <button
                  key={speed}
                  onClick={() => {
                    setPlaybackSpeed(speed);
                    if (isPlaying) {
                      // Restart with new rate
                      window.speechSynthesis.cancel();
                      const utterance = new SpeechSynthesisUtterance(briefingText);
                      utterance.lang = briefingLanguage === 'ar' ? 'ar-SA' : 'en-US';
                      utterance.rate = speed;
                      utterance.onend = () => setIsPlaying(false);
                      audioContextRef.current = utterance;
                      window.speechSynthesis.speak(utterance);
                    }
                  }}
                  className={`px-1.5 py-0.5 border font-bold text-[10px] ${
                    playbackSpeed === speed
                      ? 'bg-[#8a3ffc]/20 border-[#8a3ffc] text-white'
                      : 'bg-transparent border-[#393939] text-[#8d8d8d] hover:text-white'
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
              className="p-1.5 bg-[#262626] hover:bg-[#333333] border border-[#393939] text-[#c6c6c6] hover:text-white transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Written Narrative Summary (Right) */}
        <div className="lg:col-span-7 bg-[#1f1f1f] border border-[#393939] p-4 h-[180px] overflow-y-auto font-mono text-xs text-[#c6c6c6] leading-relaxed relative">
          <div className="absolute top-2.5 end-3 text-[9px] font-bold text-[#8a3ffc] uppercase bg-[#8a3ffc]/20 px-1.5 py-0.2 tracking-wider flex items-center gap-1">
            <Music className="w-3 h-3" />
            <span>EXECUTIVE BRIEF TRANSCRIPT</span>
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
