import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Presentation, ChevronLeft, ChevronRight, FileDown, Edit3, Plus, Trash2,
  CheckCircle2, RefreshCw, Sparkles, ArrowUp, ArrowDown, X, Image as ImageIcon, FileText, FileSpreadsheet,
  MonitorPlay, Play, Pause, Wand2, Pen, Undo2, Eraser,
} from 'lucide-react';
import { WidgetConfig } from '../../types';
import { ChartFactory, getAggregationLabel } from '../../components/charts/ChartFactory';
import { captureElementToCanvas } from '../../utils/dashboardExport';
import { aiAuthHeaders } from '../../utils/aiAccessGuard';

interface Slide {
  id: string;
  title: string;
  titleAr: string;
  type: 'cover' | 'summary' | 'stats' | 'conclusion';
  bullets: string[];
  bulletsAr: string[];
  /** معرّف عنصر الرسم البياني في لوحة التحكم — يُعرض معاينته داخل الشريحة */
  chartWidgetId?: string;
}

// ---------- أدوات الملاحظات (الرسم على الشريحة أثناء العرض) ----------

/** خط مرسوم: إحداثيات مُطبّعة [0..1] نسبةً إلى صندوق الشريحة (يتكيف مع أي حجم شاشة) */
type Stroke = { slideId: string; color: string; width: number; points: Array<[number, number]> };
const PEN_COLORS = ['#ffd500', '#ff4d4f', '#42be65', '#33b1ff', '#ffffff'];
const PEN_WIDTHS = [2, 4, 7];

let slideSeq = 0;
function makeSlide(partial: Partial<Slide> & { type: Slide['type'] }): Slide {
  slideSeq += 1;
  return {
    id: `sl-${Date.now()}-${slideSeq}-${Math.random().toString(36).slice(2, 6)}`,
    title: partial.title || 'New Slide',
    titleAr: partial.titleAr || 'شريحة جديدة',
    type: partial.type,
    bullets: partial.bullets || [],
    bulletsAr: partial.bulletsAr || [],
    chartWidgetId: partial.chartWidgetId,
  };
}

/**
 * توليد عرض تقديمي كامل تلقائياً من لوحة التحكم النشطة:
 * غلاف → شريحة لكل مؤشر أداء (KPI) → شريحة لكل رسم بياني (مع معاينة) → خاتمة.
 */
export function generateSlidesFromDashboard(
  dash: { name?: string; nameAr?: string; description?: string; descriptionAr?: string; widgets: WidgetConfig[] },
  datasetNameOf: (w: WidgetConfig) => string,
  isAr = true
): Slide[] {
  const dashName = (isAr ? dash.nameAr || dash.name : dash.name) || (isAr ? 'لوحة تحليلات' : 'Analytics Dashboard');
  const dashDesc = (isAr ? dash.descriptionAr || dash.description : dash.description) || '';
  const kpis = dash.widgets.filter(w => w.type === 'kpi');
  const charts = dash.widgets.filter(w => w.type !== 'kpi');
  const slides: Slide[] = [];

  // 1) الغلاف
  slides.push(makeSlide({
    type: 'cover',
    title: dashName,
    titleAr: dashName,
    bullets: [
      ...(dashDesc ? [dashDesc] : []),
      isAr ? `عدد العناصر: ${dash.widgets.length} (${kpis.length} مؤشر أداء، ${charts.length} رسم بياني)` : `${dash.widgets.length} widgets (${kpis.length} KPIs, ${charts.length} charts)`,
      isAr ? `التاريخ: ${new Date().toLocaleDateString('ar-SA')}` : `Date: ${new Date().toLocaleDateString('en-US')}`,
    ],
    bulletsAr: [
      ...(dashDesc ? [dashDesc] : []),
      `عدد العناصر: ${dash.widgets.length} (${kpis.length} مؤشر أداء، ${charts.length} رسم بياني)`,
      `التاريخ: ${new Date().toLocaleDateString('ar-SA')}`,
    ],
  }));

  // 2) شريحة لكل مؤشر أداء (حد أقصى 4)
  for (const k of kpis.slice(0, 4)) {
    const m = k.kpiMetric;
    if (!m) continue;
    const trendTxt = isAr
      ? (m.trendDirection === 'up' ? `ارتفاع ${m.trendPercentage ?? 0}%` : m.trendDirection === 'down' ? `انخفاض ${m.trendPercentage ?? 0}%` : 'مستقر')
      : (m.trendDirection === 'up' ? `Up ${m.trendPercentage ?? 0}%` : m.trendDirection === 'down' ? `Down ${m.trendPercentage ?? 0}%` : 'Stable');
    slides.push(makeSlide({
      type: 'stats',
      title: (isAr ? m.label : m.label) || `KPI — ${k.title}`,
      titleAr: m.label || `مؤشر — ${k.titleAr || k.title}`,
      bullets: [`${m.value}`, trendTxt, datasetNameOf(k)],
      bulletsAr: [`${m.value}`, trendTxt, datasetNameOf(k)],
    }));
  }

  // 3) شريحة لكل رسم بياني (حد أقصى 6) مع معاينة الرسم داخل الشريحة
  for (const c of charts.slice(0, 6)) {
    const x = c.xAxis || c.categoryField || '—';
    const y = c.yAxis || '—';
    const agg = getAggregationLabel(c.aggregation || 'sum', isAr ? 'ar' : 'en');
    const dsName = datasetNameOf(c);
    slides.push(makeSlide({
      type: 'summary',
      title: c.title,
      titleAr: c.titleAr || c.title,
      bullets: [
        isAr ? `المقياس: ${y} — التصنيف: ${x}` : `Metric: ${y} by ${x}`,
        isAr ? `الدالة الإحصائية: ${agg}` : `Aggregation: ${agg}`,
        isAr ? `مصدر البيانات: ${dsName}` : `Source: ${dsName}`,
      ],
      bulletsAr: [
        `المقياس: ${y} — التصنيف: ${x}`,
        `الدالة الإحصائية: ${agg}`,
        `مصدر البيانات: ${dsName}`,
      ],
      chartWidgetId: c.id,
    }));
  }

  // 4) الخاتمة
  slides.push(makeSlide({
    type: 'conclusion',
    title: 'Next Steps',
    titleAr: 'الخطوات القادمة',
    bullets: [
      isAr ? 'مراجعة النتائج مع فريق البيانات' : 'Review findings with the data team',
      isAr ? 'تحديد مؤشرات متابعة أسبوعية' : 'Define weekly tracking KPIs',
      isAr ? 'تعميم اللوحة على أصحاب المصلحة' : 'Share the dashboard with stakeholders',
    ],
    bulletsAr: [
      'مراجعة النتائج مع فريق البيانات',
      'تحديد مؤشرات متابعة أسبوعية',
      'تعميم اللوحة على أصحاب المصلحة',
    ],
  }));

  return slides;
}

// ---------- أدوات مساعدة لتوليد الشرائح بالذكاء الاصطناعي ----------

const aiStr = (v: any, fb = ''): string => (typeof v === 'string' && v.trim() ? v.trim() : fb);
const aiStrArr = (v: any): string[] =>
  Array.isArray(v) ? v.filter((x: any) => typeof x === 'string' && x.trim()).map((x: string) => x.trim()) : [];

const aiFormatNum = (n: number): string => {
  try {
    return new Intl.NumberFormat('ar', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  } catch {
    try { return n.toLocaleString('ar'); } catch { return String(Math.round(n)); }
  }
};

/**
 * تحويل قصة البيانات المولدة من /api/reports/generate إلى شرائح تنفيذية:
 * غلاف (عنوان + ملخص تنفيذي) → شريحة لكل فصل (توصية + نقاط + رسم مرافق) → توصيات ختامية.
 * تُعيد [] إذا لم يُعد النموذج محتوى قابلاً للاستخدام (فيُبقى العرض الحالي كما هو).
 */
export function buildAiSlidesFromStory(
  dash: { name?: string; nameAr?: string; widgets: WidgetConfig[] },
  story: any,
  isAr = true
): Slide[] {
  if (!story || typeof story !== 'object') return [];
  const chapters = Array.isArray(story.chapters) ? story.chapters : [];
  const hasContent =
    aiStr(story.executiveSummaryAr, aiStr(story.executiveSummary)).length > 0 ||
    chapters.length > 0 ||
    aiStrArr(story.recommendationsAr).length > 0 ||
    aiStrArr(story.recommendations).length > 0;
  if (!hasContent) return [];

  const dashName = (isAr ? dash.nameAr || dash.name : dash.name) || (isAr ? 'لوحة تحليلات' : 'Analytics Dashboard');
  const slides: Slide[] = [];

  // 1) الغلاف — العنوان والملخص التنفيذي من النموذج
  slides.push(makeSlide({
    type: 'cover',
    title: aiStr(story.title, dashName),
    titleAr: aiStr(story.titleAr, aiStr(story.title, dashName)),
    bullets: [aiStr(story.subtitle), aiStr(story.executiveSummary)].filter(Boolean),
    bulletsAr: [
      aiStr(story.subtitleAr, aiStr(story.subtitle)),
      aiStr(story.executiveSummaryAr, aiStr(story.executiveSummary)),
    ].filter(Boolean),
  }));

  // 2) شريحة لكل فصل سردي (حد أقصى 6) — المؤشر الرقمي + التوصية + النقاط
  const chartWidgets = dash.widgets.filter(w => w.type !== 'kpi');
  const widgetByTitle = (needle: string) => {
    const n = needle.trim().toLowerCase();
    if (!n) return undefined;
    return chartWidgets.find(
      w => (w.titleAr || '').trim().toLowerCase() === n || (w.title || '').trim().toLowerCase() === n
    );
  };

  chapters.slice(0, 6).forEach((ch: any, idx: number) => {
    const insights = aiStrArr(ch?.insightsAr).length > 0 ? aiStrArr(ch.insightsAr) : aiStrArr(ch?.insights);
    const bulletsAr = [...insights];
    const takeaway = aiStr(ch?.takeawayAr, aiStr(ch?.takeaway));
    if (takeaway && !bulletsAr.includes(takeaway)) bulletsAr.unshift(takeaway);
    const km = ch?.keyMetric && typeof ch.keyMetric === 'object' ? ch.keyMetric : null;
    const kmValue = aiStr(km?.value);
    if (kmValue) {
      const kmLabel = aiStr(km?.labelAr, aiStr(km?.label, isAr ? 'مؤشر' : 'Metric'));
      const kmContext = aiStr(km?.contextAr, aiStr(km?.context));
      bulletsAr.unshift(`${kmLabel}: ${kmValue}${kmContext ? ` — ${kmContext}` : ''}`);
    }
    if (bulletsAr.length === 0) return;

    const titleAr = aiStr(ch?.titleAr, aiStr(ch?.title, isAr ? 'فصل تحليلي' : 'Chapter'));
    // ربط الرسم: مطابقة العنوان أولاً وإلا ربط موضعي (الفصل i ↔ الرسم i)
    const widget = widgetByTitle(aiStr(ch?.titleAr)) || widgetByTitle(aiStr(ch?.title)) || chartWidgets[idx];
    slides.push(makeSlide({
      type: 'summary',
      title: aiStr(ch?.title, titleAr),
      titleAr,
      bullets: bulletsAr,
      bulletsAr,
      chartWidgetId: widget?.id,
    }));
  });

  // 3) الخاتمة — التوصيات الاستراتيجية
  const recsAr = aiStrArr(story.recommendationsAr).length > 0 ? aiStrArr(story.recommendationsAr) : aiStrArr(story.recommendations);
  if (recsAr.length > 0) {
    slides.push(makeSlide({
      type: 'conclusion',
      title: 'Next Steps',
      titleAr: 'التوصيات والخطوات القادمة',
      bullets: aiStrArr(story.recommendations),
      bulletsAr: recsAr,
    }));
  }

  return slides;
}

export const SlidesExportPanel: React.FC = () => {
  const { activeDashboard, datasets, activeDataset, language, toast } = useApp();
  const isAr = language === 'ar';

  const [slides, setSlides] = useState<Slide[]>(() => generateSlidesFromDashboard(
    activeDashboard || { widgets: [] },
    (w) => datasets.find(d => d.id === w.datasetId)?.name || activeDataset?.name || '—',
    isAr
  ));
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingPptx, setIsExportingPptx] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [aiGenStep, setAiGenStep] = useState('');
  const [showEditor, setShowEditor] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);

  // عناصر الالتقاط المخفية لصور الرسوم البيانية في PPTX (خارج الشاشة)
  const hiddenCaptureRef = useRef<HTMLDivElement>(null);
  const [captureWidgetId, setCaptureWidgetId] = useState<string | null>(null);
  const captureWidget = captureWidgetId ? activeDashboard?.widgets.find(w => w.id === captureWidgetId) : undefined;
  const captureWidgetDataset = captureWidget ? datasets.find(d => d.id === captureWidget.datasetId) || activeDataset : undefined;

  const datasetNameOf = (w: WidgetConfig) =>
    datasets.find(d => d.id === w.datasetId)?.name || activeDataset?.name || '—';

  // إعادة التوليد تلقائياً عند تبديل لوحة التحكم أو تغيّر عناصرها
  useEffect(() => {
    if (!activeDashboard) return;
    setSlides(generateSlidesFromDashboard(activeDashboard, datasetNameOf, isAr));
    setActiveSlideIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDashboard?.id, activeDashboard?.widgets.length, isAr]);

  const activeSlide: Slide | undefined = slides[Math.min(activeSlideIndex, slides.length - 1)];
  const bulletCollection = activeSlide ? (isAr ? activeSlide.bulletsAr : activeSlide.bullets) : [];

  const chartWidget = activeSlide?.chartWidgetId
    ? activeDashboard?.widgets.find(w => w.id === activeSlide.chartWidgetId)
    : undefined;
  const chartWidgetDataset = chartWidget
    ? datasets.find(d => d.id === chartWidget.datasetId) || activeDataset
    : undefined;

  const clampIndex = (next: Slide[]) => {
    setActiveSlideIndex(prev => Math.min(prev, Math.max(0, next.length - 1)));
  };

  // ---------- وضع العرض بملء الشاشة (تنقل بالأسهم + مؤقت تلقائي) ----------

  const [presenting, setPresenting] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [autoplaySecs, setAutoplaySecs] = useState(8);
  const [secondsLeft, setSecondsLeft] = useState(8);
  const presentStageRef = useRef<HTMLDivElement>(null);

  // ---------- حالة القلم والرسوم (لكل شريحة رسومها المستقلة) ----------
  const [annotations, setAnnotations] = useState<Record<string, Stroke[]>>({});
  const [penArmed, setPenArmed] = useState(false);
  const [penColor, setPenColor] = useState<string>(PEN_COLORS[0]);
  const [penWidth, setPenWidth] = useState<number>(PEN_WIDTHS[1]);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const [draftStroke, setDraftStroke] = useState<Stroke | null>(null);

  const normPoint = (e: React.PointerEvent<HTMLDivElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const ny = Math.min(1, Math.max(0, (e.clientY - rect.top) / Math.max(1, rect.height)));
    return [nx, ny];
  };

  const handleAnnotationPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!penArmed || !activeSlide) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* تقاطع وهمي — نكمل */ }
    const stroke: Stroke = { slideId: activeSlide.id, color: penColor, width: penWidth, points: [normPoint(e)] };
    activeStrokeRef.current = stroke;
    setDraftStroke({ ...stroke, points: [...stroke.points] });
  };

  const handleAnnotationPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const stroke = activeStrokeRef.current;
    if (!penArmed || !stroke) return;
    const p = normPoint(e);
    const last = stroke.points[stroke.points.length - 1];
    // تجاهل الحركات الدقيقة جدًا (تنعيم + تقليل عدد النقاط)
    if (last && Math.abs(p[0] - last[0]) + Math.abs(p[1] - last[1]) < 0.004) return;
    stroke.points.push(p);
    setDraftStroke({ ...stroke, points: [...stroke.points] });
  };

  const commitActiveStroke = () => {
    const stroke = activeStrokeRef.current;
    if (!stroke) return;
    activeStrokeRef.current = null;
    setDraftStroke(null);
    if (stroke.points.length === 0) return;
    setAnnotations(prev => ({
      ...prev,
      [stroke.slideId]: [...(prev[stroke.slideId] || []), stroke],
    }));
  };

  const handleAnnotationPointerUp = () => commitActiveStroke();

  const undoLastStroke = () => {
    const key = activeSlide?.id;
    if (!key) return;
    setAnnotations(prev => {
      const arr = prev[key] || [];
      if (arr.length === 0) return prev;
      return { ...prev, [key]: arr.slice(0, -1) };
    });
  };

  const clearSlideAnnotations = () => {
    const key = activeSlide?.id;
    if (!key) return;
    setAnnotations(prev => ({ ...prev, [key]: [] }));
  };

  const gotoSlide = (idx: number) => {
    if (slides.length === 0) return;
    setActiveSlideIndex(((idx % slides.length) + slides.length) % slides.length);
  };

  const startPresenting = () => {
    setPresenting(true);
  };

  const stopPresenting = () => {
    setPresenting(false);
    setAutoplay(false);
    setPenArmed(false); // القلم يُسحب تلقائياً عند الخروج من العرض
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };

  // ملء الشاشة الحقيقي (أفضل جهد — إن رُفض يبقى الغلاف يغطي الشاشة)
  useEffect(() => {
    if (!presenting) return;
    const el = presentStageRef.current;
    if (el && el.requestFullscreen) el.requestFullscreen().catch(() => {});
  }, [presenting]);

  // التنقل بلوحة المفاتيح — الأسهم تتبع اتجاه القراءة (عربي: اليسار = التالي)
  useEffect(() => {
    if (!presenting) return;
    const nextKey = isAr ? 'ArrowLeft' : 'ArrowRight';
    const prevKey = isAr ? 'ArrowRight' : 'ArrowLeft';
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case nextKey:
        case 'PageDown':
        case ' ':
          e.preventDefault();
          gotoSlide(activeSlideIndex + 1);
          break;
        case prevKey:
        case 'PageUp':
          e.preventDefault();
          gotoSlide(activeSlideIndex - 1);
          break;
        case 'Home':
          e.preventDefault();
          gotoSlide(0);
          break;
        case 'End':
          e.preventDefault();
          gotoSlide(slides.length - 1);
          break;
        case 'p':
        case 'P':
        case 'پ':
          e.preventDefault();
          setPenArmed(v => !v);
          break;
        case 'Escape':
          stopPresenting();
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenting, activeSlideIndex, slides.length, isAr]);

  // المؤقت التلقائي: عدّاد تنازلي مرئي يتقدم شريحة كل N ثانية ويعود للأولى (نمط العرض في القاعات)
  useEffect(() => {
    if (!presenting || !autoplay || slides.length === 0) return;
    let left = autoplaySecs;
    setSecondsLeft(left);
    const id = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        left = autoplaySecs;
        setActiveSlideIndex(prev => (prev + 1) % slides.length);
      }
      setSecondsLeft(left);
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presenting, autoplay, autoplaySecs, slides.length, activeSlideIndex]);

  // ---------- إدارة الشرائح: إضافة / حذف / إعادة ترتيب ----------

  const handleAddSlide = () => {
    setSlides(prev => {
      const blank = makeSlide({
        type: 'summary',
        title: isAr ? 'شريحة جديدة' : 'New Slide',
        titleAr: 'شريحة جديدة',
        bullets: [isAr ? 'اكتب نقطة هنا…' : 'Write a bullet here…'],
        bulletsAr: ['اكتب نقطة هنا…'],
      });
      const insertAt = activeSlideIndex + 1;
      const next = [...prev.slice(0, insertAt), blank, ...prev.slice(insertAt)];
      setActiveSlideIndex(insertAt);
      return next;
    });
    setShowEditor(true);
    toast.info(
      isAr ? 'تمت إضافة شريحة' : 'Slide Added',
      isAr ? 'أُضيفت شريحة جديدة بعد الشريحة الحالية — عدّلها مباشرة.' : 'A new slide was inserted after the current one.'
    );
  };

  const handleDeleteSlide = (idx: number) => {
    if (slides.length <= 1) {
      toast.info(
        isAr ? 'لا يمكن حذف الشريحة الأخيرة' : 'Cannot delete last slide',
        isAr ? 'أنشئ شريحة بديلة أولاً بالضغط على "شريحة جديدة".' : 'Add a replacement slide first.'
      );
      return;
    }
    const removed = slides[idx];
    setSlides(prev => {
      const next = prev.filter((_, i) => i !== idx);
      clampIndex(next);
      return next;
    });
    toast.info(
      isAr ? 'تم حذف الشريحة' : 'Slide Deleted',
      isAr ? `حُذفت الشريحة "${isAr ? removed.titleAr : removed.title}".` : `Deleted "${removed.title}".`
    );
  };

  const handleMoveSlide = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= slides.length) return;
    setSlides(prev => {
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      setActiveSlideIndex(target);
      return next;
    });
  };

  // ---------- تحرير محتوى الشريحة ----------

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

  const handleAddBullet = (slideId: string) => {
    setSlides(prev =>
      prev.map(s => {
        if (s.id !== slideId) return s;
        return {
          ...s,
          bullets: [...s.bullets, isAr ? '' : ''],
          bulletsAr: [...s.bulletsAr, ''],
        };
      })
    );
  };

  const handleRemoveBullet = (slideId: string, bulletIdx: number) => {
    setSlides(prev =>
      prev.map(s => {
        if (s.id !== slideId) return s;
        return {
          ...s,
          bullets: s.bullets.filter((_, i) => i !== bulletIdx),
          bulletsAr: s.bulletsAr.filter((_, i) => i !== bulletIdx),
        };
      })
    );
  };

  const handleUpdateTitle = (slideId: string, field: 'title' | 'titleAr', val: string) => {
    setSlides(prev => prev.map(s => (s.id === slideId ? { ...s, [field]: val } : s)));
  };

  // ---------- التوليد التلقائي من لوحة التحكم ----------

  const handleGenerateFromDashboard = () => {
    if (!activeDashboard || activeDashboard.widgets.length === 0) {
      toast.info(
        isAr ? 'لوحة التحكم فارغة' : 'Empty Dashboard',
        isAr ? 'أضف مؤشرات ورسوماً إلى اللوحة النشطة أولاً ثم أعد التوليد.' : 'Add KPIs and charts to the active dashboard first.'
      );
      return;
    }
    setIsGenerating(true);
    setTimeout(() => {
      const generated = generateSlidesFromDashboard(activeDashboard, datasetNameOf, isAr);
      setSlides(generated);
      setActiveSlideIndex(0);
      setIsGenerating(false);
      toast.success(
        isAr ? 'تم توليد العرض تلقائياً!' : 'Deck Generated!',
        isAr ? `أُنشئت ${generated.length} شرائح من لوحة "${activeDashboard.nameAr || activeDashboard.name}".` : `Generated ${generated.length} slides from the active dashboard.`
      );
    }, 400);
  };

  // ---------- التوليد بالذكاء الاصطناعي: تحليل حقيقي لبيانات اللوحة عبر الخادم ----------

  /**
   * ملخص إحصائي مُجرّد من بيانات المجموعات المستخدمة في اللوحة (بدون أي صف خام):
   * أعمدة وأنواعها + إحصاءات عددية (مجموع/متوسط/أدنى/أقصى) + أعلى 5 فئات للعمود التصنيفي.
   * يُرسل فقط لما تشير إليه عناصر اللوحة (datasetId لكل عنصر) ولا يتجاوز 12 عموداً و6 مجموعات.
   */
  const buildStatSummaryPayload = () => {
    const dsIds = Array.from(new Set(activeDashboard.widgets.map(w => w.datasetId).filter(Boolean)));
    const sources = (dsIds.length > 0 ? dsIds.map(id => datasets.find(d => d.id === id)) : [activeDataset])
      .filter(Boolean)
      .slice(0, 6);

    const toNum = (v: any): number | null => {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string') {
        const n = parseFloat(v.replace(/[^0-9.-]/g, ''));
        return Number.isFinite(n) ? n : null;
      }
      return null;
    };

    return sources.map(ds => {
      const rows: any[] = Array.isArray(ds!.data) ? ds!.data.slice(0, 2000) : [];
      const cols = Array.isArray(ds!.columns) ? ds!.columns.slice(0, 12) : [];
      const colStats: any[] = [];
      for (const c of cols) {
        if (!c?.name) continue;
        if (c.type === 'float' || c.type === 'integer') {
          let sum = 0, cnt = 0, min = Infinity, max = -Infinity;
          for (const r of rows) {
            const n = toNum(r[c.name]);
            if (n !== null) { sum += n; cnt++; if (n < min) min = n; if (n > max) max = n; }
          }
          if (cnt > 0) {
            colStats.push({ name: c.name, type: c.type, sum: Number(sum.toFixed(2)), avg: Number((sum / cnt).toFixed(2)), min: Number(min.toFixed(2)), max: Number(max.toFixed(2)) });
          }
        } else if (c.type === 'string' || c.type === 'category' || c.type === 'date') {
          const freq = new Map<string, number>();
          for (const r of rows) {
            const k = String(r[c.name] ?? '').trim();
            if (k) freq.set(k, (freq.get(k) || 0) + 1);
          }
          const top = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
          if (top.length > 0) {
            colStats.push({ name: c.name, type: c.type, distinct: freq.size, top: top.map(([k, v]) => `${k} (${v})`) });
          }
        }
      }
      return { id: ds!.id, name: ds!.name, rowCount: ds!.rowCount || ds!.data?.length || rows.length, columns: colStats };
    });
  };

  const handleGenerateWithAI = async () => {
    if (!activeDashboard) return;
    if (activeDashboard.widgets.length === 0) {
      toast.info(
        isAr ? 'لوحة التحكم فارغة' : 'Empty Dashboard',
        isAr ? 'أضف مؤشرات ورسوماً إلى اللوحة النشطة أولاً ثم ولّد العرض بالذكاء الاصطناعي.' : 'Add KPIs and charts to the dashboard first, then generate with AI.'
      );
      return;
    }
    setIsGeneratingAI(true);
    setAiGenStep(isAr ? 'جاري إعداد الملخص الإحصائي لبيانات اللوحة…' : 'Preparing statistical summary…');
    const stepTimer = setTimeout(() => {
      setAiGenStep(isAr ? 'الذكاء الاصطناعي يحلل النتائج ويصيغ النقاط التنفيذية…' : 'AI is analyzing results and drafting executive bullets…');
    }, 2500);

    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...aiAuthHeaders() },
        body: JSON.stringify({
          dataset: {
            id: activeDashboard.id,
            name: isAr ? (activeDashboard.nameAr || activeDashboard.name) : (activeDashboard.name || activeDashboard.id),
            rowCount: activeDashboard.widgets.length,
            columns: [],
            data: [],
            stats: buildStatSummaryPayload(),
          },
          language: 'ar',
          focusAngle: 'comprehensive',
          tone: 'executive',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = typeof data?.error === 'string' ? data.error : (isAr ? 'تعذر توليد العرض بالذكاء الاصطناعي' : 'AI slide generation failed');
        throw new Error(errMsg);
      }
      const generated = buildAiSlidesFromStory(activeDashboard, data?.story || data, isAr);
      if (generated.length === 0) {
        toast.warning(
          isAr ? 'لم يُعد النموذج محتوى كافياً' : 'Not enough AI content',
          isAr ? 'جرّب مرة أخرى أو استخدم زر التوليد التلقائي من اللوحة.' : 'Try again or use the automatic dashboard generator instead.'
        );
        return;
      }
      setSlides(generated);
      setActiveSlideIndex(0);
      setShowEditor(false);
      toast.success(
        isAr ? 'تم توليد العرض بالذكاء الاصطناعي!' : 'AI Deck Generated!',
        isAr ? `حلل الذكاء الاصطناعي بيانات اللوحة وأعد ${generated.length} شرائح تنفيذية — يمكنك تعديل أي نقطة قبل التصدير.` : `AI analyzed the dashboard data and produced ${generated.length} executive slides.`
      );
    } catch (err: any) {
      console.error('AI slides generation error:', err);
      toast.error(
        isAr ? 'فشل التوليد بالذكاء الاصطناعي' : 'AI Generation Failed',
        err?.message || (isAr ? 'تعذر الاتصال بمزود الذكاء الاصطناعي — تأكد من المفتاح أو الحصة اليومية.' : 'Could not reach the AI provider.')
      );
    } finally {
      clearTimeout(stepTimer);
      setIsGeneratingAI(false);
      setAiGenStep('');
    }
  };

  // ---------- التصدير ----------

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const deckFilename = `executive_briefing_deck_${activeDashboard?.id || 'main'}`;

  const handleExportSlides = () => {
    setIsExporting(true);
    setTimeout(() => {
      downloadBlob(new Blob([JSON.stringify(slides, null, 2)], { type: 'application/json' }), `${deckFilename}.json`);
      setIsExporting(false);
      toast.success(
        isAr ? 'تم تصدير العرض التقديمي بنجاح!' : 'Presentation Exported!',
        isAr ? 'تم تحميل ملف العرض التقديمي التنفيذي بصيغة عرض تفاعلية.' : 'Downloaded executive briefing slide deck presentation.'
      );
    }, 900);
  };

  // PPTX قابل للتحرير في PowerPoint: النصوص عناصر أصلية (وليست صوراً) + صورة
  // الرسم البياني مضمّنة في الشرائح الرسومية. يدعم الاتجاه العربي RTL.
  const handleExportDeckPptx = async () => {
    setIsExportingPptx(true);
    try {
      const PptxGenJS = (await import('pptxgenjs')).default;
      const pptx = new PptxGenJS();
      pptx.layout = 'LAYOUT_16x9';
      pptx.rtlMode = isAr;
      // presLayout يعود بوحدات EMU — نحوّلها لبوحات كي تتوافق بقية القيم (<100 = بوصات)
      // وتُصدَّر جميع الإحداثيات كأعداد EMU صحيحة (PowerPoint يرفض الكسور)
      const W = pptx.presLayout.width / 914400;
      const H = pptx.presLayout.height / 914400;
      const BG = '161616';
      const TXT = 'f4f4f4';
      const SUB = 'a8a8a8';
      const ACC = '33b1ff';
      const bodyFont = isAr ? 'Arial' : 'Segoe UI';

      const addBackground = (slide: any) => {
        slide.background = { color: BG };
      };

      const addFooter = (slide: any, idx: number) => {
        slide.addText(
          `${isAr ? `الشريحة ${idx + 1} / ${slides.length}` : `Slide ${idx + 1} / ${slides.length}`}`,
          { x: W - 1.4, y: H - 0.42, w: 1.2, h: 0.3, fontSize: 9, fontFace: 'Consolas', color: SUB, align: 'right' }
        );
      };

      // صورة الرسم البياني للشريحة إن وُجد — من اللوحة النشطة عبر العنصر المخفي خارج الشاشة
      const captureChartImage = async (widgetId: string): Promise<string | null> => {
        const widget = activeDashboard?.widgets.find(w => w.id === widgetId);
        if (!widget) return null;
        const host = hiddenCaptureRef.current;
        if (!host) return null;
        setCaptureWidgetId(widgetId);
        await new Promise(r => setTimeout(r, 600)); // مهلة رسم ChartFactory
        try {
          const canvas = await captureElementToCanvas(host, { backgroundColor: BG, scale: 2 });
          return canvas.toDataURL('image/png');
        } catch {
          return null;
        } finally {
          setCaptureWidgetId(null);
        }
      };

      for (let i = 0; i < slides.length; i++) {
        const s = slides[i];
        const slide = pptx.addSlide();
        addBackground(slide);

        const title = isAr ? s.titleAr || s.title : s.title;
        const bullets = (isAr ? s.bulletsAr : s.bullets).filter(b => b.trim());
        const rtl = isAr;

        // شارة نوع الشريحة
        const badgeColor: Record<Slide['type'], string> = {
          cover: '8a3ffc', summary: '0f62fe', stats: '24a148', conclusion: '33b1ff',
        };
        slide.addText(s.type.toUpperCase(), {
          x: rtl ? W - 2.0 : 0.5, y: 0.45, w: 1.5, h: 0.3,
          fontSize: 9, bold: true, fontFace: 'Consolas', color: badgeColor[s.type], align: rtl ? 'right' : 'left',
        });

        // العنوان الرئيسي — نص أصلي قابل للتحرير
        slide.addText(title || ' ', {
          x: rtl ? 0.5 : 0.5, y: 0.85, w: W - 1.0, h: 0.9,
          fontSize: s.type === 'cover' ? 32 : 24, bold: true, fontFace: bodyFont, color: TXT,
          align: rtl ? 'right' : 'left', rtlMode: rtl,
        });

        // نقاط المحتوى — نصوص أصلية قابلة للتحرير
        if (bullets.length > 0) {
          const hasChart = !!s.chartWidgetId;
          const boxH = hasChart ? 1.6 : H - 2.6;
          slide.addText(
            bullets.map(b => ({ text: b, options: { bullet: { characterCode: '25AA' }, breakLine: true } })),
            {
              x: rtl ? W / 2 : 0.6, y: 1.9, w: hasChart ? W / 2 - 1.0 : W - 1.2, h: boxH,
              fontSize: 13, fontFace: bodyFont, color: SUB, align: rtl ? 'right' : 'left',
              rtlMode: rtl, lineSpacingMultiple: 1.3, valign: 'top',
            }
          );
        }

        // صورة الرسم البياني (شريحة الرسوم) — على النصف الآخر
        if (s.chartWidgetId) {
          const img = await captureChartImage(s.chartWidgetId);
          if (img) {
            slide.addImage({ data: img, x: rtl ? 0.6 : W / 2, y: 1.9, w: W / 2 - 0.6, h: 2.6, sizing: { type: 'contain', w: W / 2 - 0.6, h: 2.6 } });
          }
        }

        // شريط سفلي بلون الهوية
        slide.addShape(pptx.ShapeType.rect, { x: 0, y: H - 0.12, w: W, h: 0.12, fill: { color: '0f62fe' } });
        addFooter(slide, i);
      }

      await pptx.writeFile({ fileName: `${deckFilename}.pptx` });
      toast.success(
        isAr ? 'تم تصدير PPTX!' : 'PPTX Exported!',
        isAr ? 'عرض PowerPoint قابل للتحرير بالكامل — النصوص عناصر أصلية قابلة للتعديل.' : 'Fully editable PowerPoint — all text is native, editable content.'
      );
    } catch (err) {
      console.error('PPTX export error:', err);
      toast.error(isAr ? 'فشل تصدير PPTX' : 'PPTX Export Failed', isAr ? 'حدث خطأ أثناء بناء ملف PowerPoint.' : 'An error occurred while building the PowerPoint file.');
    } finally {
      setIsExportingPptx(false);
    }
  };

  // لقطة PNG للشريحة الحالية كما تظهر على المسرح (مع الرسم البياني إن وجد)
  const handleExportSlidePng = async () => {
    if (!stageRef.current) return;
    try {
      const canvas = await captureElementToCanvas(stageRef.current, { backgroundColor: '#161616', scale: 2 });
      downloadBlob(await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/png')), `${deckFilename}_slide-${activeSlideIndex + 1}.png`);
      toast.success(
        isAr ? 'تم تصدير الشريحة كصورة' : 'Slide Exported',
        isAr ? 'تم تنزيل لقطة الشريحة الحالية بدقة عالية.' : 'Downloaded the current slide snapshot.'
      );
    } catch (err) {
      console.error('Slide PNG export error:', err);
      toast.error(isAr ? 'فشل التصدير' : 'Export Failed', isAr ? 'تعذر التقاط الشريحة.' : 'Failed to capture the slide.');
    }
  };

  // PDF كامل: كل شريحة تُعرض على المسرح ثم تُلتقط وتُرحَّل لصفحة أفقية
  const handleExportDeckPdf = async () => {
    if (!stageRef.current) return;
    setIsExportingPdf(true);
    try {
      toast.info(
        isAr ? 'جاري بناء PDF…' : 'Building PDF…',
        isAr ? `يتم التقاط ${slides.length} شرائح — قد يستغرق ثوانٍ قليلة في أول تشغيل.` : `Capturing ${slides.length} slides — the first run may take a moment.`
      );
      const { jsPDF } = await import('jspdf');
      console.log('[pdf-export] jsPDF loaded');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [960, 540] });
      for (let i = 0; i < slides.length; i++) {
        setActiveSlideIndex(i);
        // مهلة كافية لإعادة رسم الشريحة (ورسم ChartFactory إن وجد)
        await new Promise(r => setTimeout(r, 350));
        const el = stageRef.current;
        if (!el) continue;
        console.log(`[pdf-export] capturing slide ${i + 1}/${slides.length}...`);
        const canvas = await captureElementToCanvas(el, { backgroundColor: '#161616', scale: 2 });
        console.log(`[pdf-export] slide ${i + 1} captured in ${(performance.now() / 1000).toFixed(1)}s`);
        const img = canvas.toDataURL('image/png');
        if (i > 0) pdf.addPage();
        pdf.addImage(img, 'PNG', 0, 0, 960, 540);
      }
      pdf.save(`${deckFilename}.pdf`);
      toast.success(
        isAr ? 'تم تصدير العرض كـ PDF!' : 'Deck PDF Exported!',
        isAr ? `مستند أفقي من ${slides.length} شرائح جاهز للعرض والطباعة.` : `A landscape document of ${slides.length} slides is ready.`
      );
    } catch (err) {
      console.error('Deck PDF export error:', err);
      toast.error(isAr ? 'فشل تصدير PDF' : 'PDF Export Failed', isAr ? 'حدث خطأ أثناء بناء المستند.' : 'An error occurred while building the document.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  if (!activeSlide) return null;

  const typeBadgeClass: Record<Slide['type'], string> = {
    cover: 'bg-[#8a3ffc]/20 text-[#d4bbff]',
    summary: 'bg-[#0f62fe]/20 text-[#78a9ff]',
    stats: 'bg-[#24a148]/20 text-[#42be65]',
    conclusion: 'bg-[#33b1ff]/20 text-[#33b1ff]',
  };

  // رسوم الشريحة الحالية + الخط قيد الرسم (معاينة حية أثناء السحب)
  const strokesFor: Stroke[] = activeSlide
    ? [...(annotations[activeSlide.id] || []), ...(draftStroke && draftStroke.slideId === activeSlide.id ? [draftStroke] : [])]
    : [];

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
                ? 'يُولَّد تلقائياً من اللوحة النشطة — أضف واحذف وأعد ترتيب الشرائح وعدّلها ثم صدّرها PDF/PNG'
                : 'Auto-generated from the active dashboard — add, delete, reorder, edit, then export PDF/PNG'}
            </p>
          </div>
        </div>

        {/* Primary Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={startPresenting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#24a148] hover:bg-[#1e8a3d] text-white text-xs font-mono font-bold uppercase transition-colors"
            title={isAr ? 'عرض ملء الشاشة مع تنقل بالأسهم ومؤقت تلقائي للعرض أمام الإدارة' : 'Fullscreen presentation with arrow navigation and autoplay timer'}
          >
            <MonitorPlay className="w-3.5 h-3.5" />
            <span>{isAr ? 'وضع العرض' : 'Present'}</span>
          </button>

          {/* توليد نقاط تنفيذية حقيقية بالذكاء الاصطناعي من تحليل بيانات اللوحة */}
          <button
            onClick={handleGenerateWithAI}
            disabled={isGeneratingAI || isGenerating}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-[#8a3ffc] to-[#0f62fe] hover:from-[#7c2ee6] hover:to-[#0353e9] disabled:opacity-60 text-white text-xs font-mono font-bold uppercase transition-colors"
            title={isAr ? 'يحلل الذكاء الاصطناعي بيانات اللوحة ويولّد نقاطاً تنفيذية حقيقية بدل النصوص الجاهزة' : 'AI analyzes the dashboard data and generates real executive bullets'}
          >
            {isGeneratingAI ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            <span>{isAr ? 'توليد بالذكاء الاصطناعي' : 'Generate with AI'}</span>
          </button>

          <button
            onClick={handleGenerateFromDashboard}
            disabled={isGenerating || isGeneratingAI}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#8a3ffc] hover:bg-[#7c2ee6] disabled:opacity-60 text-white text-xs font-mono font-bold uppercase transition-colors"
            title={isAr ? 'إعادة بناء العرض بالكامل من مؤشرات ورسوم اللوحة النشطة' : 'Rebuild the whole deck from the active dashboard widgets'}
          >
            {isGenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            <span>{isAr ? 'توليد من اللوحة' : 'Generate from Dashboard'}</span>
          </button>

          <button
            onClick={handleExportDeckPdf}
            disabled={isExportingPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#da1e28] hover:bg-[#c2141e] disabled:opacity-60 text-white text-xs font-mono font-bold uppercase transition-colors"
            title={isAr ? 'مستند PDF أفقي يضم كل الشرائح مع رسومها' : 'Landscape PDF with every slide incl. charts'}
          >
            {isExportingPdf ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
            <span>{isAr ? 'PDF كامل' : 'Export PDF'}</span>
          </button>

          <button
            onClick={handleExportDeckPptx}
            disabled={isExportingPptx}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#d04a02] hover:bg-[#ba4a00] disabled:opacity-60 text-white text-xs font-mono font-bold uppercase transition-colors"
            title={isAr ? 'ملف PowerPoint (.pptx) بنصوص أصلية قابلة للتحرير بالكامل' : 'Editable PowerPoint (.pptx) with native text elements'}
          >
            {isExportingPptx ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
            <span>{isAr ? 'PowerPoint (PPTX)' : 'Export PPTX'}</span>
          </button>

          <button
            onClick={handleExportSlides}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0f62fe] hover:bg-[#0353e9] disabled:opacity-60 text-white text-xs font-mono font-bold uppercase transition-colors"
          >
            {isExporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
            <span>{isAr ? 'تنزيل العرض التقديمي' : 'Export Slides'}</span>
          </button>
        </div>
      </div>

      {/* شريط حالة التوليد بالذكاء الاصطناعي */}
      {isGeneratingAI && aiGenStep && (
        <div className="flex items-center gap-2 border border-[#8a3ffc]/50 bg-[#8a3ffc]/10 px-3 py-2 text-xs text-[#d4bbff]">
          <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
          <span>{aiGenStep}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Visual Slide Presenter Stage */}
        <div className="lg:col-span-8 space-y-3">
          <div
            ref={stageRef}
            className="bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-6 flex flex-col justify-between min-h-[280px] relative"
          >
            <span className="absolute top-3 end-3 font-mono text-[9px] text-[var(--cds-text-03)]">
              SLIDE {activeSlideIndex + 1} OF {slides.length}
            </span>

            <div className="space-y-4 pt-4 text-start">
              <span className={`text-[9px] font-mono font-bold px-2 py-0.5 uppercase ${typeBadgeClass[activeSlide.type]}`}>
                {activeSlide.type} SLIDE
              </span>

              <h4 className="text-base sm:text-lg font-bold text-white leading-tight">
                {isAr ? activeSlide.titleAr : activeSlide.title}
              </h4>

              <ul className="space-y-2.5 ps-4 list-disc text-xs text-[var(--cds-text-02)] leading-relaxed">
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

              {/* معاينة الرسم البياني المرتبط بالشريحة (من اللوحة النشطة) */}
              {chartWidget && (
                <div className="border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] p-2 h-[170px]">
                  <ChartFactory widget={chartWidget} dataset={chartWidgetDataset} activeTheme="professional" />
                </div>
              )}
            </div>

            {/* Stepper Controls */}
            <div className="flex items-center justify-between border-t border-[var(--cds-border-subtle)] pt-4 mt-6">
              <button
                onClick={() => setActiveSlideIndex(prev => Math.max(0, prev - 1))}
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
                onClick={() => setActiveSlideIndex(prev => Math.min(slides.length - 1, prev + 1))}
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

          {/* Slide Editor (titles + bullet add/remove) */}
          {showEditor && (
            <div className="bg-[var(--cds-layer-01)] border border-[#0f62fe]/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-[var(--cds-text-01)] uppercase tracking-wider flex items-center gap-2">
                  <Edit3 className="w-3.5 h-3.5 text-[#0f62fe]" />
                  {isAr ? 'تحرير الشريحة الحالية' : 'Edit Current Slide'}
                </span>
                <button onClick={() => setShowEditor(false)} className="p-1 text-[var(--cds-text-03)] hover:text-white" title={isAr ? 'إغلاق المحرر' : 'Close editor'}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={activeSlide.titleAr}
                  onChange={e => handleUpdateTitle(activeSlide.id, 'titleAr', e.target.value)}
                  placeholder={isAr ? 'العنوان (عربي)' : 'Title (Arabic)'}
                  className="px-3 py-2 text-xs bg-[var(--cds-layer-02)] text-[var(--cds-text-01)] border border-[var(--cds-border-subtle)] focus:border-[#0f62fe] outline-none"
                />
                <input
                  type="text"
                  value={activeSlide.title}
                  onChange={e => handleUpdateTitle(activeSlide.id, 'title', e.target.value)}
                  placeholder={isAr ? 'العنوان (إنجليزي)' : 'Title (English)'}
                  dir="ltr"
                  className="px-3 py-2 text-xs bg-[var(--cds-layer-02)] text-[var(--cds-text-01)] border border-[var(--cds-border-subtle)] focus:border-[#0f62fe] outline-none text-left"
                />
              </div>

              <div className="space-y-1.5">
                {(isAr ? activeSlide.bulletsAr : activeSlide.bullets).map((b, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={b}
                      onChange={e => handleUpdateBullet(activeSlide.id, idx, e.target.value)}
                      className="flex-1 px-3 py-1.5 text-xs bg-[var(--cds-layer-02)] text-[var(--cds-text-01)] border border-[var(--cds-border-subtle)] focus:border-[#0f62fe] outline-none"
                    />
                    <button
                      onClick={() => handleRemoveBullet(activeSlide.id, idx)}
                      className="p-1 text-[var(--cds-text-03)] hover:text-white hover:bg-[#da1e28] transition-colors"
                      title={isAr ? 'حذف هذه النقطة' : 'Remove this bullet'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => handleAddBullet(activeSlide.id)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-mono text-[#78a9ff] border border-[var(--cds-border-subtle)] hover:border-[#0f62fe] hover:bg-[#0f62fe]/10 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  {isAr ? 'إضافة نقطة' : 'Add bullet'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Slides Deck Manager (list + add / reorder / delete) */}
        <div className="lg:col-span-4 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] p-4 space-y-3 flex flex-col justify-between">
          <div className="space-y-2">
            <div className="flex items-center justify-between border-b border-[var(--cds-border-subtle)] pb-1.5">
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--cds-text-03)]">
                {isAr ? `شرائح العرض (${slides.length})` : `Deck Overview (${slides.length})`}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleAddSlide}
                  className="p-1 text-[#78a9ff] hover:bg-[#0f62fe]/20 transition-colors"
                  title={isAr ? 'إضافة شريحة جديدة بعد الحالية' : 'Add a new slide after the current one'}
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowEditor(v => !v)}
                  className={`p-1 transition-colors ${showEditor ? 'text-[#0f62fe]' : 'text-[var(--cds-text-03)] hover:text-white'}`}
                  title={isAr ? 'تحرير الشريحة الحالية' : 'Edit current slide'}
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-[240px] overflow-y-auto pe-1">
              {slides.map((s, idx) => (
                <div
                  key={s.id}
                  className={`flex items-center gap-1 border transition-colors ${
                    activeSlideIndex === idx
                      ? 'bg-[var(--cds-layer-02)] border-[#33b1ff]'
                      : 'bg-transparent border-[var(--cds-border-subtle)] hover:bg-[var(--cds-layer-02)]'
                  }`}
                >
                  <button onClick={() => setActiveSlideIndex(idx)} className="flex-1 min-w-0 p-2 text-start flex items-center gap-2">
                    <span className="w-5 h-5 bg-[var(--cds-layer-02)] flex items-center justify-center text-[10px] font-mono shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={`text-[11px] truncate ${activeSlideIndex === idx ? 'text-white font-bold' : 'text-[var(--cds-text-03)]'}`}>
                        {s.chartWidgetId && <ImageIcon className="w-3 h-3 inline-block me-1 text-[#33b1ff]" />}
                        {isAr ? s.titleAr : s.title}
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center pe-1">
                    <button
                      onClick={() => handleMoveSlide(idx, -1)}
                      disabled={idx === 0}
                      className={`p-1 ${idx === 0 ? 'text-[var(--cds-border-subtle)] cursor-not-allowed' : 'text-[var(--cds-text-03)] hover:text-white'}`}
                      title={isAr ? 'تحريك لأعلى' : 'Move up'}
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleMoveSlide(idx, 1)}
                      disabled={idx === slides.length - 1}
                      className={`p-1 ${idx === slides.length - 1 ? 'text-[var(--cds-border-subtle)] cursor-not-allowed' : 'text-[var(--cds-text-03)] hover:text-white'}`}
                      title={isAr ? 'تحريك لأسفل' : 'Move down'}
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => handleDeleteSlide(idx)}
                      className="p-1 text-[var(--cds-text-03)] hover:text-white hover:bg-[#da1e28] transition-colors"
                      title={isAr ? 'حذف الشريحة' : 'Delete slide'}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={handleExportSlidePng}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 border border-[var(--cds-border-strong)] text-[var(--cds-text-02)] hover:text-white hover:bg-[var(--cds-layer-02)] text-[11px] font-mono font-bold uppercase transition-colors"
              title={isAr ? 'لقطة PNG عالية الدقة للشريحة الحالية كما تظهر على المسرح' : 'High-res PNG snapshot of the current stage'}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-[#42be65]" />
              {isAr ? 'تصدير الشريحة الحالية كصورة' : 'Export Current Slide as PNG'}
            </button>

            <div className="p-3 bg-[var(--cds-layer-01)] border border-[var(--cds-border-subtle)] text-[11px] font-mono text-[var(--cds-text-03)] leading-relaxed">
              <span className="font-bold text-white uppercase block mb-1">
                {isAr ? '💡 نصيحة' : '💡 Tip'}
              </span>
              <p>
                {isAr
                  ? 'أثناء العرض فعّل "قلم الملاحظات" للرسم والتشبيه على الشرائح أمام الإدارة — حرف P يبدّله، والتراجع/المسح في شريط الأدوات.'
                  : 'While presenting, enable the annotation pen to draw on slides — press P to toggle it; undo/clear live in the toolbar.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* حاضنة الالتقاط المخفية: ترسم الشريحة الرسومية مؤقتاً لالتقاطها كصورة داخل PPTX */}
      <div
        ref={hiddenCaptureRef}
        style={{ position: 'fixed', left: -10000, top: 0, width: 800, height: 480, background: '#161616' }}
        aria-hidden
      >
        {captureWidget && (
          <div style={{ width: '100%', height: '100%', padding: 16 }}>
            <ChartFactory widget={captureWidget} dataset={captureWidgetDataset} activeTheme="professional" />
          </div>
        )}
      </div>

      {/* ───────────── وضع العرض بملء الشاشة أمام الإدارة ───────────── */}
      {presenting && activeSlide && (
        <div
          ref={presentStageRef}
          className="fixed inset-0 z-[100] bg-[#161616] flex flex-col select-none"
          dir={isAr ? 'rtl' : 'ltr'}
        >
          {/* الشريط العلوي: نوع الشريحة + اسم اللوحة + خروج */}
          <div className="flex items-center justify-between px-8 pt-5 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 uppercase ${typeBadgeClass[activeSlide.type]}`}>
                {activeSlide.type}
              </span>
              <span className="text-xs font-mono text-[var(--cds-text-03)] truncate">
                {isAr ? (activeDashboard?.nameAr || activeDashboard?.name || '') : (activeDashboard?.name || '')}
              </span>
            </div>
            <button
              onClick={stopPresenting}
              className="p-2 text-[var(--cds-text-03)] hover:text-white hover:bg-[#da1e28] transition-colors"
              title={isAr ? 'خروج (Esc)' : 'Exit (Esc)'}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* محتوى الشريحة — النقر للتقدم (يتوقف أثناء تفعيل القلم حتى لا يقفز العرض مع كل خط) */}
          <div
            className="relative flex-1 min-h-0 flex flex-col justify-center px-16 py-6 cursor-pointer"
            onClick={() => { if (!penArmed) gotoSlide(activeSlideIndex + 1); }}
            title={isAr ? 'انقر للتقدم للشريحة التالية' : 'Click to advance'}
          >
            {/* طبقة الملاحظات: تلتقط حركات الفأرة عند تفعيل القلم (فوق المحتوى وتحت أزرار التحكم) */}
            <div
              className="absolute inset-0 z-10"
              style={{ cursor: penArmed ? 'crosshair' : 'default', touchAction: 'none' }}
              onPointerDown={handleAnnotationPointerDown}
              onPointerMove={handleAnnotationPointerMove}
              onPointerUp={handleAnnotationPointerUp}
              onPointerLeave={handleAnnotationPointerUp}
              onClick={(e) => { if (penArmed) e.stopPropagation(); }}
            >
              <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                {strokesFor.map((s, i) => (
                  <polyline
                    key={i}
                    points={s.points.map(([x, y]) => `${(x * 100).toFixed(2)},${(y * 100).toFixed(2)}`).join(' ')}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={s.width}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
            </div>
            <h1 className="text-4xl lg:text-5xl font-bold text-white leading-tight mb-6">
              {isAr ? activeSlide.titleAr || activeSlide.title : activeSlide.title}
            </h1>
            <ul className="space-y-4 text-xl lg:text-2xl text-[var(--cds-text-02)] leading-relaxed list-disc ps-8 max-w-4xl">
              {bulletCollection.filter(b => b.trim()).map((b, i) => (
                <li key={i} className="marker:text-[#33b1ff]">{b}</li>
              ))}
            </ul>
            {chartWidget && (
              <div className="flex-1 min-h-[200px] mt-6 border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-02)] p-3">
                <ChartFactory widget={chartWidget} dataset={chartWidgetDataset} activeTheme="professional" />
              </div>
            )}
          </div>

          {/* شريط أدوات الملاحظات: رسم حر على الشريحة أثناء العرض أمام الإدارة */}
          <div className="shrink-0 px-8 pt-2">
            <div className="flex flex-wrap items-center gap-2 border border-[var(--cds-border-subtle)] bg-[var(--cds-layer-01)] px-3 py-1.5">
              <button
                onClick={() => setPenArmed(v => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono font-bold uppercase transition-colors border ${
                  penArmed
                    ? 'bg-[#8a3ffc]/25 border-[#8a3ffc] text-[#d4bbff]'
                    : 'border-[var(--cds-border-strong)] text-[var(--cds-text-02)] hover:text-white hover:bg-[var(--cds-layer-02)]'
                }`}
                title={isAr ? 'تشغيل/إيقاف القلم (P) — عند التفعيل يرسم المؤشر على الشريحة بدل تقليب الشرائح' : 'Toggle pen (P) — the cursor draws on the slide instead of flipping slides'}
              >
                <Pen className="w-3.5 h-3.5" />
                <span>{isAr ? (penArmed ? 'القلم مفعّل' : 'قلم الملاحظات') : (penArmed ? 'Pen On' : 'Pen')}</span>
              </button>

              <div className="flex items-center gap-1" role="group" title={isAr ? 'لون الحبر' : 'Ink color'}>
                {PEN_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => { setPenColor(c); setPenArmed(true); }}
                    className={`w-5 h-5 rounded-full border-2 transition-transform ${penColor === c ? 'scale-110 border-white' : 'border-transparent opacity-70 hover:opacity-100'}`}
                    style={{ backgroundColor: c }}
                    title={isAr ? 'اختيار هذا اللون' : 'Use this color'}
                  />
                ))}
              </div>

              <div className="flex items-center gap-1" role="group" title={isAr ? 'سماكة الخط' : 'Stroke width'}>
                {PEN_WIDTHS.map(w => (
                  <button
                    key={w}
                    onClick={() => { setPenWidth(w); setPenArmed(true); }}
                    className={`w-7 h-6 flex items-center justify-center border transition-colors ${
                      penWidth === w ? 'border-[#33b1ff] bg-[#33b1ff]/15' : 'border-[var(--cds-border-subtle)] hover:border-[var(--cds-border-strong)]'
                    }`}
                    title={isAr ? `سماكة ${w}` : `Width ${w}`}
                  >
                    <span className="rounded-full block" style={{ width: w + 2, height: w + 2, backgroundColor: 'var(--cds-text-02, #a8a8a8)' }} />
                  </button>
                ))}
              </div>

              <button
                onClick={undoLastStroke}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono text-[var(--cds-text-02)] border border-[var(--cds-border-strong)] hover:text-white hover:bg-[var(--cds-layer-02)] transition-colors"
                title={isAr ? 'تراجع عن آخر خط على هذه الشريحة' : 'Undo the last stroke on this slide'}
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>{isAr ? 'تراجع' : 'Undo'}</span>
              </button>
              <button
                onClick={clearSlideAnnotations}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono text-[var(--cds-text-02)] border border-[var(--cds-border-strong)] hover:text-white hover:bg-[#da1e28] transition-colors"
                title={isAr ? 'مسح كل الملاحظات على هذه الشريحة' : 'Clear all annotations on this slide'}
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>{isAr ? 'مسح' : 'Clear'}</span>
              </button>

              <span className="ms-auto text-[10px] font-mono text-[var(--cds-text-03)] hidden xl:inline">
                {isAr ? 'الملاحظات لعرضٍ فقط ولا تُصدَّر مع الملفات • اختصار القلم: P' : 'Annotations are view-only and not exported • Pen shortcut: P'}
              </span>
            </div>
          </div>

          {/* شريط التحكم السفلي */}
          <div className="shrink-0 border-t border-[var(--cds-border-subtle)] px-8 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => gotoSlide(activeSlideIndex - 1)}
                disabled={activeSlideIndex === 0}
                className="p-2 border border-[var(--cds-border-strong)] text-[var(--cds-text-02)] hover:text-white hover:bg-[var(--cds-layer-02)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title={isAr ? 'الشريحة السابقة' : 'Previous slide'}
              >
                <ChevronRight className="w-5 h-5 rtl:rotate-180" />
              </button>
              <span className="font-mono text-sm text-[var(--cds-text-02)] px-2">
                {isAr ? `الشريحة ${activeSlideIndex + 1} من ${slides.length}` : `Slide ${activeSlideIndex + 1} of ${slides.length}`}
              </span>
              <button
                onClick={() => gotoSlide(activeSlideIndex + 1)}
                disabled={activeSlideIndex === slides.length - 1}
                className="p-2 border border-[var(--cds-border-strong)] text-[var(--cds-text-02)] hover:text-white hover:bg-[var(--cds-layer-02)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title={isAr ? 'الشريحة التالية' : 'Next slide'}
              >
                <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setAutoplay(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-bold uppercase transition-colors border ${
                  autoplay
                    ? 'bg-[#24a148]/20 border-[#24a148] text-[#42be65]'
                    : 'border-[var(--cds-border-strong)] text-[var(--cds-text-02)] hover:text-white hover:bg-[var(--cds-layer-02)]'
                }`}
                title={isAr ? 'تشغيل تلقائي: تتقدم الشرائح كل N ثانية وتعود للأولى' : 'Autoplay: slides advance every N seconds and loop'}
              >
                {autoplay ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span>{isAr ? (autoplay ? 'إيقاف التلقائي' : 'عرض تلقائي') : (autoplay ? 'Pause' : 'Autoplay')}</span>
              </button>

              {autoplay && (
                <>
                  <select
                    value={autoplaySecs}
                    onChange={e => setAutoplaySecs(Number(e.target.value))}
                    className="bg-[var(--cds-layer-02)] border border-[var(--cds-border-subtle)] text-[var(--cds-text-01)] text-xs font-mono py-1.5 px-2 outline-none cursor-pointer"
                    title={isAr ? 'مدة بقاء كل شريحة' : 'Seconds per slide'}
                  >
                    {[3, 5, 8, 10, 15, 30].map(s => (
                      <option key={s} value={s}>{s} ث</option>
                    ))}
                  </select>
                  <span
                    className="font-mono text-lg text-[#42be65] w-9 text-center tabular-nums"
                    title={isAr ? 'العدّاد للشريحة التالية' : 'Countdown to next slide'}
                  >
                    {secondsLeft}
                  </span>
                </>
              )}

              <span className="text-[10px] font-mono text-[var(--cds-text-03)] hidden xl:inline">
                {isAr ? 'الأسهم للتنقل • Esc للخروج' : 'Arrow keys navigate • Esc to exit'}
              </span>
            </div>
          </div>

          {/* شريط التقدم الكلي */}
          <div className="h-1 bg-[var(--cds-layer-02)] shrink-0">
            <div
              className="h-full bg-[#0f62fe] transition-all duration-300"
              style={{ width: `${((activeSlideIndex + 1) / Math.max(1, slides.length)) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
