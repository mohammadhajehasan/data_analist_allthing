import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { Presentation, ChevronLeft, ChevronRight, FileDown, Edit3, Plus, Trash2, CheckCircle2, RefreshCw } from 'lucide-react';

interface Slide {
  id: string;
  title: string;
  titleAr: string;
  type: 'cover' | 'summary' | 'stats' | 'conclusion';
  bullets: string[];
  bulletsAr: string[];
}

export const SlidesExportPanel: React.FC = () => {
  const { activeDashboard, language, toast } = useApp();
  const isAr = language === 'ar';

  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  // Default multi-slide deck representation
  const [slides, setSlides] = useState<Slide[]>([
    {
      id: 'slide-1',
      title: 'Executive Performance Briefing',
      titleAr: 'الموجز التنفيذي لمؤشرات الأداء المالي',
      type: 'cover',
      bullets: [
        'Prepared by: Ahmad Al-Farahat',
        'Confidential - Internal Strategy Board Only',
        'Date: September 2026',
      ],
      bulletsAr: [
        'إعداد: أحمد الفرحات',
        'سري للغاية - للعرض على مجلس الإدارة فقط',
        'التاريخ: سبتمبر ٢٠٢٦',
      ],
    },
    {
      id: 'slide-2',
      title: 'Gross Revenue & Performance Highlights',
      titleAr: 'أبرز إنجازات الإيرادات والأداء المالي',
      type: 'summary',
      bullets: [
        'Gross revenue registers strong +18.4% growth to reach $23,450',
        'Net Operating Profit stabilized at $7,840 yielding a robust 33.4% profit margin',
        'Western and Central regions represent over 60% of total revenue share',
      ],
      bulletsAr: [
        'تسجيل نمو قوي في الإيرادات الإجمالية بنسبة +١٨.٤٪ لتصل إلى ٢٣,٤٥٠ دولار',
        'استقرار صافي الأرباح التشغيلية عند ٧,٨٤٠ دولار محققاً هامش ربح بنسبة ٣٣.٤٪',
        'تستحوذ المنطقة الغربية والوسطى على أكثر من ٦٠٪ من إجمالي حصة الإيرادات',
      ],
    },
    {
      id: 'slide-3',
      title: 'Data Governance & Operational Health',
      titleAr: 'حوكمة البيانات والجاهزية التشغيلية للمنصة',
      type: 'stats',
      bullets: [
        'Overall Data Health is maintained at an exceptional 98.5% score',
        'Automated IQRs identified minor skews in Electronics category',
        'Action recommended: Apply outlier cap normalizations before launching predictive models',
      ],
      bulletsAr: [
        'تم الحفاظ على مؤشر جودة وصحة البيانات العام عند درجة ممتازة تبلغ ٩٨.٥٪',
        'حددت خوارزميات IQR انحرافات طفيفة في تصنيف الإلكترونيات',
        'الإجراء الموصى به: تطبيق حدود قصوى لتنظيف القيم الشاذة قبل تشغيل نماذج التنبؤ',
      ],
    },
    {
      id: 'slide-4',
      title: 'Strategic Roadmap & Next Steps',
      titleAr: 'خارطة الطريق الاستراتيجية والخطوات القادمة',
      type: 'conclusion',
      bullets: [
        'Deploy Holt-Winters forecasting models to predict Q4 seasonal spikes',
        'Integrate live cloud database connectors to ensure continuous synchronization',
        'Distribute PDF summary report to division leads on a weekly schedule',
      ],
      bulletsAr: [
        'اعتماد نماذج التنبؤ التلقائية لرصد الطفرات الموسمية للربع الرابع',
        'ربط مستودع البيانات الحية لضمان التزامن الفوري والمستمر',
        'توزيع التقارير التحليلية والملخصات على مدراء الأقسام بصفة دورية',
      ],
    },
  ]);

  const handleNextSlide = () => {
    setActiveSlideIndex(prev => Math.min(prev + 1, slides.length - 1));
  };

  const handlePrevSlide = () => {
    setActiveSlideIndex(prev => Math.max(prev - 1, 0));
  };

  const handleUpdateBullet = (slideId: string, bulletIdx: number, newVal: string) => {
    setSlides(prev =>
      prev.map(s => {
        if (s.id !== slideId) return s;
        const targetBullets = isAr ? [...s.bulletsAr] : [...s.bullets];
        targetBullets[bulletIdx] = newVal;
        return {
          ...s,
          bullets: isAr ? s.bullets : targetBullets,
          bulletsAr: isAr ? targetBullets : s.bulletsAr,
        };
      })
    );
  };

  const handleExportSlides = () => {
    setIsExporting(true);
    setTimeout(() => {
      setIsExporting(false);
      
      // Synthesize simulated file download
      const blob = new Blob([JSON.stringify(slides, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `executive_briefing_deck_${activeDashboard?.id || 'main'}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success(
        isAr ? 'تم تصدير العرض التقديمي بنجاح!' : 'Presentation Exported!',
        isAr ? 'تم تحميل ملف العرض التقديمي التنفيذي بصيغة عرض تفاعلية.' : 'Downloaded executive briefing slide deck presentation.'
      );
    }, 1200);
  };

  const activeSlide = slides[activeSlideIndex];
  const bulletCollection = isAr ? activeSlide.bulletsAr : activeSlide.bullets;

  return (
    <div className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--cds-border-subtle)] pb-3">
        <div className="flex items-center gap-2">
          <Presentation className="w-5 h-5 text-[#33b1ff]" />
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              {isAr ? 'استوديو العروض التقديمية التنفيذية' : 'Executive Presentation Slides Builder'}
            </h3>
            <p className="text-[11px] text-[var(--cds-text-02)] mt-0.5">
              {isAr
                ? 'حول لوحة التحكم الحالية إلى شرائح عرض تقديمية احترافية جاهزة لاجتماعات الإدارة العليا'
                : 'Transpose dashboards into a structured slide presentation deck for board-room meetings'}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <button
          onClick={handleExportSlides}
          disabled={isExporting}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-xs font-mono font-bold uppercase transition-colors"
        >
          {isExporting ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <FileDown className="w-3.5 h-3.5" />
          )}
          <span>{isAr ? 'تنزيل العرض التقديمي' : 'Export Slides'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Visual Slide Presenter Stage (Left/Top) */}
        <div className="lg:col-span-8 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-6 flex flex-col justify-between min-h-[250px] relative">
          <span className="absolute top-3 right-3 font-mono text-[9px] text-[var(--cds-text-03)]">
            SLIDE {activeSlideIndex + 1} OF {slides.length}
          </span>

          <div className="space-y-4 pt-4 text-start">
            {/* Slide Type / Category Indicator */}
            <span className="text-[9px] font-mono font-bold bg-[#33b1ff]/20 text-[#33b1ff] px-2 py-0.5 uppercase">
              {activeSlide.type} SLIDE
            </span>

            {/* Slide Title */}
            <h4 className="text-base sm:text-lg font-bold text-white leading-tight">
              {isAr ? activeSlide.titleAr : activeSlide.title}
            </h4>

            {/* Bullet List */}
            <ul className="space-y-2.5 pl-4 list-disc text-xs text-[var(--cds-text-02)] leading-relaxed">
              {bulletCollection.map((bullet, idx) => (
                <li key={idx} className="marker:text-[#33b1ff]">
                  <input
                    type="text"
                    value={bullet}
                    onChange={e => handleUpdateBullet(activeSlide.id, idx, e.target.value)}
                    className="bg-transparent border-b border-transparent hover:border-[var(--cds-border-subtle)] focus:border-[#33b1ff] text-white focus:text-[#33b1ff] text-xs font-sans outline-none w-full transition-all py-0.5"
                  />
                </li>
              ))}
            </ul>
          </div>

          {/* Stepper Controls */}
          <div className="flex items-center justify-between border-t border-[var(--cds-border-subtle)] pt-4 mt-6">
            <button
              onClick={handlePrevSlide}
              disabled={activeSlideIndex === 0}
              className={`p-1.5 border flex items-center justify-center transition-colors ${
                activeSlideIndex === 0
                  ? 'border-[var(--cds-border-subtle)] text-[var(--cds-text-03)] cursor-not-allowed'
                  : 'border-[var(--cds-border-strong)] text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-02)] hover:text-white'
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="font-mono text-[10px] text-[var(--cds-text-03)]">
              {isAr ? `الشريحة ${activeSlideIndex + 1}` : `Slide ${activeSlideIndex + 1}`}
            </span>

            <button
              onClick={handleNextSlide}
              disabled={activeSlideIndex === slides.length - 1}
              className={`p-1.5 border flex items-center justify-center transition-colors ${
                activeSlideIndex === slides.length - 1
                  ? 'border-[var(--cds-border-subtle)] text-[var(--cds-text-03)] cursor-not-allowed'
                  : 'border-[var(--cds-border-strong)] text-[var(--cds-text-02)] hover:bg-[var(--cds-layer-02)] hover:text-white'
              }`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Slides Deck Navigation (Right/Bottom) */}
        <div className="lg:col-span-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-4 space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--cds-text-03)] block border-b border-[var(--cds-border-subtle)] pb-1.5">
              {isAr ? 'قائمة شرائح العرض' : 'Deck Overview'}
            </span>

            <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
              {slides.map((s, idx) => (
                <button
                  key={s.id}
                  onClick={() => setActiveSlideIndex(idx)}
                  className={`w-full p-2 text-start flex items-center gap-3 border transition-colors ${
                    activeSlideIndex === idx
                      ? 'bg-[var(--cds-layer-01)] border-[#33b1ff] text-white font-bold'
                      : 'bg-transparent border-[var(--cds-border-subtle)] text-[var(--cds-text-03)] hover:text-white hover:bg-[var(--cds-layer-01)]'
                  }`}
                >
                  <span className="w-5 h-5 bg-[var(--cds-layer-02)] flex items-center justify-center text-[10px] font-mono shrink-0">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] truncate">
                      {isAr ? s.titleAr : s.title}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] text-[11px] font-mono text-[var(--cds-text-03)] leading-relaxed">
            <span className="font-bold text-white uppercase block mb-1">
              {isAr ? '💡 نصيحة التعديل السريع' : '💡 Live Inline Editing'}
            </span>
            <p>
              {isAr
                ? 'يمكنك التعديل والكتابة بمرونة على رءوس الأقلام داخل الشريحة الحالية وستحفظ التغييرات تلقائياً قبل التصدير.'
                : 'Simply click any slide point to rewrite. All inline changes are captured in real-time.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
