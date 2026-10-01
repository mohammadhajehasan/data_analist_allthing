import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { TourStep } from '../../types';
import {
  Sparkles,
  LayoutDashboard,
  Database,
  Terminal,
  BarChart3,
  FileDown,
  Layers,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle2,
  HelpCircle,
  Zap,
  Sliders,
  FileSpreadsheet,
} from 'lucide-react';

export const OnboardingTour: React.FC = () => {
  const { isTourOpen, setIsTourOpen, completeTour, setActiveTab, language } = useApp();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const isAr = language === 'ar';

  const tourSteps: TourStep[] = [
    {
      id: 'welcome',
      title: 'Welcome to IBM Carbon Analytics & AI Hub',
      titleAr: 'مرحباً بك في منصة تحليلات البيانات والذكاء الاصطناعي',
      content:
        'A unified enterprise cockpit combining local zero-upload data processing, automated schema profiling, interactive dashboard design, and 9-layer secured NL2SQL intelligence.',
      contentAr:
        'منصة مؤسسية موحدة تجمع بين معالجة البيانات محلياً بدون خادم خارجي، وتوصيف المخططات، وبناء لوحات التحكم التفاعلية، واستوديو تحويل اللغة الطبيعية إلى SQL مع فحص أمني وتصحيح ذكي.',
      badge: 'Platform Overview',
      badgeAr: 'نظرة عامة على المنصة',
      tabToActivate: 'landing',
    },
    {
      id: 'datasets',
      title: 'Local CSV & Data Ingestion',
      titleAr: 'استيراد البيانات ومستودع الملفات',
      content:
        'Import your local CSV, Excel, and SQLite files with 100% in-browser parsing. Ensure absolute data privacy with zero external uploads.',
      contentAr:
        'استورد ملفات CSV و Excel و SQLite المحلية مع معالجة كاملة داخل المتصفح لضمان أقصى خصوصية وبدون أي رفع خارجي للبيانات.',
      badge: 'Data Engine',
      badgeAr: 'محرك البيانات المحلي',
      tabToActivate: 'datasets',
    },
    {
      id: 'datamodeling',
      title: 'Data Modeling & ERD Schema Graph',
      titleAr: 'نمذجة البيانات ومخطط العلاقات التفاعلي (ERD)',
      content:
        'Visually connect tables with primary/foreign keys using an interactive graph. Cleanse missing data, auto-heal outliers, and preview in-memory relationship joins instantly.',
      contentAr:
        'اربط الجداول بمفاتيح أساسية وأجنبية مرئياً، نظّف البيانات المفقودة، وعالج القيم الشاذة مع إمكانية معاينة عمليات الدمج في الذاكرة بشكل فوري وسريع.',
      badge: 'Modeling Studio',
      badgeAr: 'استوديو النمذجة',
      tabToActivate: 'datamodeling',
    },
    {
      id: 'profiling',
      title: 'Deep Dataset Profiling & Statistics',
      titleAr: 'التشخيص المعمق للبيانات والإحصائيات',
      content:
        'Analyze dataset health with comprehensive D3/Recharts visualizations. Inspect null frequencies, numerical distributions (Mean, Median), and categorical variance.',
      contentAr:
        'حلل صحة البيانات عبر لوحات تصوير مرئية متقدمة (D3/Recharts). اكتشف تكرارات القيم المفقودة، والتوزيعات الرقمية (المتوسط، الوسيط)، والتباين الفئوي.',
      badge: 'Data Profiler',
      badgeAr: 'التشخيص الإحصائي',
      tabToActivate: 'profiling',
    },
    {
      id: 'dashboards',
      title: 'Executive Dashboard Builder',
      titleAr: 'باني لوحات القيادة التنفيذية',
      content:
        'Craft real-time KPI cockpit cards, multidimensional charts, and custom mathematical aggregation pipelines (SUM, AVG, VARIANCE). Export pixel-perfect PDF/PNG reports.',
      contentAr:
        'صمم بطاقات مؤشرات الأداء (KPIs)، ومخططات متعددة الأبعاد، ومسارات التجميع الرياضي المتطورة. وقم بتصدير تقارير PDF/PNG عالية الجودة.',
      badge: 'Dashboard Studio',
      badgeAr: 'استوديو اللوحات',
      tabToActivate: 'dashboards',
    },
    {
      id: 'nl2sql',
      title: 'NL2SQL Studio & Smart Execution',
      titleAr: 'استوديو NL2SQL والإصلاح الذكي',
      content:
        'Ask questions in natural language to generate optimized SQL. Inspect physical SIMD columnar plans via D3.js trees, and apply AI-driven one-click syntax repairs.',
      contentAr:
        'اطرح أسئلتك لتوليد استعلامات SQL فورية. عاين خطط التنفيذ التفاعلية، واستفد من مُحسّن الذكاء الاصطناعي والإصلاح التلقائي للأخطاء.',
      badge: 'NL2SQL Sandbox',
      badgeAr: 'محرك الاستعلام',
      tabToActivate: 'nl2sql',
    },
    {
      id: 'models',
      title: 'AI Provider & Resiliency Engine',
      titleAr: 'مزود الذكاء الاصطناعي ومحرك المرونة',
      content:
        'Configure external LLM providers (Gemini, Ollama, DeepSeek). Rely on the resilient fallback engine featuring exponential backoff to handle transient 503 high-demand errors effortlessly.',
      contentAr:
        'أعد تكوين نماذج الذكاء الاصطناعي وراقب الأداء. اعتمد على محرك التراجع المرن الذي يعالج تلقائياً أخطاء الضغط (503) عبر إعادة المحاولة الذكية لتجربة سلسة.',
      badge: 'AI Configuration',
      badgeAr: 'إعدادات النماذج',
      tabToActivate: 'models',
    },
    {
      id: 'guide',
      title: 'Global Navigation & User Guide',
      titleAr: 'الاختصارات ودليل المستخدم الشامل',
      content:
        'Access the dedicated User Guide anytime to learn shortcuts (Ctrl+1 to Ctrl+6 for ultra-fast navigation), live theme preview features, and SQL formatting tips.',
      contentAr:
        'يمكنك العودة لدليل المستخدم الشامل للتعرف على اختصارات التنقل السريع (Ctrl+1 إلى Ctrl+6)، واستكشاف معاينة المظهر الحية ومحرر SQL الجديد.',
      badge: 'Help Center',
      badgeAr: 'مركز المساعدة',
      tabToActivate: 'guide',
    },
  ];

  const currentStep = tourSteps[currentStepIndex];

  // Synchronize active tab with current tour step
  useEffect(() => {
    if (isTourOpen && currentStep?.tabToActivate) {
      setActiveTab(currentStep.tabToActivate);
    }
  }, [isTourOpen, currentStepIndex, currentStep, setActiveTab]);

  // Keyboard navigation
  useEffect(() => {
    if (!isTourOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsTourOpen(false);
      } else if (e.key === 'ArrowRight') {
        if (isAr) handlePrev();
        else handleNext();
      } else if (e.key === 'ArrowLeft') {
        if (isAr) handleNext();
        else handlePrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTourOpen, currentStepIndex, isAr]);

  if (!isTourOpen) return null;

  const handleNext = () => {
    if (currentStepIndex < tourSteps.length - 1) {
      setCurrentStepIndex(prev => prev + 1);
    } else {
      completeTour();
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prev => prev - 1);
    }
  };

  const getStepIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Sparkles className="w-5 h-5 text-[#0f62fe]" />;
      case 1:
        return <FileSpreadsheet className="w-5 h-5 text-[#24a148]" />;
      case 2:
        return <LayoutDashboard className="w-5 h-5 text-[#0f62fe]" />;
      case 3:
        return <Terminal className="w-5 h-5 text-[#33b1ff]" />;
      case 4:
        return <BarChart3 className="w-5 h-5 text-[#f1c21b]" />;
      case 5:
        return <FileDown className="w-5 h-5 text-[#8a3ffc]" />;
      default:
        return <Layers className="w-5 h-5 text-[#0f62fe]" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs select-none animate-fade-in">
      <div className="bg-[var(--cds-layer-02)] border border-[#0f62fe] w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Top Header */}
        <div className="p-4 bg-[var(--cds-layer-01)] border-b border-[var(--cds-border-subtle)] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#0f62fe]/20 border border-[#0f62fe] flex items-center justify-center">
              {getStepIcon(currentStepIndex)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider bg-[#0f62fe] text-white px-2 py-0.5">
                  {isAr ? currentStep.badgeAr : currentStep.badge}
                </span>
                <span className="text-xs font-mono text-[var(--cds-text-03)]">
                  {isAr
                    ? `الخطوة ${currentStepIndex + 1} من ${tourSteps.length}`
                    : `Step ${currentStepIndex + 1} of ${tourSteps.length}`}
                </span>
              </div>
              <h3 className="text-sm font-bold text-[var(--cds-text-01)] mt-1">
                {isAr ? currentStep.titleAr : currentStep.title}
              </h3>
            </div>
          </div>

          <button
            onClick={() => setIsTourOpen(false)}
            className="p-1.5 hover:bg-[var(--cds-layer-03)] text-[var(--cds-text-03)] hover:text-[var(--cds-text-01)] transition-colors"
            title={isAr ? 'إغلاق الجولة' : 'Close Tour'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Content */}
        <div className="p-6 space-y-4">
          <p className="text-xs sm:text-sm text-[var(--cds-text-02)] font-sans leading-relaxed">
            {isAr ? currentStep.contentAr : currentStep.content}
          </p>

          {/* Feature Highlights Grid */}
          <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] space-y-2">
            <div className="flex items-center gap-2 text-[11px] font-mono text-[#33b1ff]">
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span className="font-bold">
                {isAr ? 'الميزات التفاعلية المتاحة في هذه الشاشة:' : 'Interactive Highlights in this View:'}
              </span>
            </div>
            <ul className="text-xs font-mono text-[var(--cds-text-03)] space-y-1 ps-4 list-disc">
              {currentStepIndex === 0 && (
                <>
                  <li>{isAr ? 'واجهة ثنائية اللغة (عربي / إنجليزي) مع دعم كامل للاتجاه RTL.' : 'Bilingual Arabic & English UI with full RTL support.'}</li>
                  <li>{isAr ? 'تبديل الأدوار الإدارية (Admin, Analyst, Engineer) والحوكمة.' : 'Role-based access controls and enterprise governance.'}</li>
                </>
              )}
              {currentStepIndex === 1 && (
                <>
                  <li>{isAr ? 'استيراد CSV محلياً فورياً بدون رفع للخادم مع تخصيص المخطط.' : 'Instant client-side CSV import with zero cloud upload.'}</li>
                  <li>{isAr ? 'توصيف إحصائي ورصد الشذوذ (IQR & Z-Score) بدقة عالية.' : 'Automated statistical anomaly detection & profiling.'}</li>
                </>
              )}
              {currentStepIndex === 2 && (
                <>
                  <li>{isAr ? 'تخصيص الحسابات الرياضية المتقدمة (SUM, AVG, MEDIAN, VAR).' : 'Advanced math aggregations and formula engine.'}</li>
                  <li>{isAr ? 'نظام إشعارات Toast فوري عند حفظ التخطيط أو اكتمال الحسابات.' : 'Instant Toast notifications for calculations and saves.'}</li>
                </>
              )}
              {currentStepIndex === 3 && (
                <>
                  <li>{isAr ? 'مُحسّن استعلامات الذكاء الاصطناعي (Gemini) مع اقتراحات الفهرسة.' : 'Gemini AI query optimization and index advice.'}</li>
                  <li>{isAr ? 'مخطط D3.js لمراحل التنفيذ الفعلي ومقترحات تصحيح الأخطاء بنقرة واحدة.' : 'D3.js physical execution DAG and one-click auto-fixes.'}</li>
                </>
              )}
              {currentStepIndex === 4 && (
                <>
                  <li>{isAr ? 'تشريح وتصفية متعددة الأبعاد مع الرسوم البيانية التكرارية.' : 'Multidimensional filtering with frequency histograms.'}</li>
                  <li>{isAr ? 'كشف الشذوذ الإحصائي ومقاييس جودة واكتمال السجلات.' : 'Dataset quality metrics and outlier isolation.'}</li>
                </>
              )}
              {currentStepIndex === 5 && (
                <>
                  <li>{isAr ? 'تصدير عالي الدقة بصيغتي PNG و PDF للوحة بأكملها أو لكل أداة.' : 'High-resolution PNG and PDF exports for dashboard & charts.'}</li>
                  <li>{isAr ? 'تخصيص كامل لألوان المظهر، وحفظ التفضيلات محلياً.' : 'Theme customizations and persistent preferences.'}</li>
                </>
              )}
            </ul>
          </div>

          {/* Step Dots Indicator */}
          <div className="flex items-center justify-center gap-1.5 pt-2">
            {tourSteps.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentStepIndex(idx)}
                className={`h-1.5 transition-all duration-200 ${
                  idx === currentStepIndex
                    ? 'w-6 bg-[#0f62fe]'
                    : 'w-2 bg-[var(--cds-layer-03)] hover:bg-[var(--cds-border-strong)]'
                }`}
                title={`Step ${idx + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-[var(--cds-layer-01)] border-t border-[var(--cds-border-subtle)] flex items-center justify-between">
          <button
            onClick={() => completeTour()}
            className="text-xs font-mono text-[var(--cds-text-03)] hover:text-[var(--cds-text-02)] transition-colors"
          >
            {isAr ? 'تخطي الجولة وإنهاء' : 'Skip & Finish'}
          </button>

          <div className="flex items-center gap-2">
            {currentStepIndex > 0 && (
              <button
                onClick={handlePrev}
                className="px-3 py-1.5 bg-[var(--cds-layer-03)] hover:bg-[var(--cds-border-strong)] text-[var(--cds-text-01)] text-xs font-mono flex items-center gap-1.5 transition-colors"
              >
                {isAr ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                <span>{isAr ? 'السابق' : 'Previous'}</span>
              </button>
            )}

            <button
              onClick={handleNext}
              className="carbon-btn-primary text-xs font-mono font-bold uppercase gap-2"
            >
              <span>
                {currentStepIndex === tourSteps.length - 1
                  ? isAr
                    ? 'إنهاء الجولة'
                    : 'Finish Tour'
                  : isAr
                  ? 'التالي'
                  : 'Next'}
              </span>
              {currentStepIndex === tourSteps.length - 1 ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : isAr ? (
                <ChevronLeft className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
