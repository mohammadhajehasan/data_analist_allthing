import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Presentation, ChevronLeft, ChevronRight, FileDown, Edit3, Plus, Trash2,
  CheckCircle2, RefreshCw, Sparkles, ArrowUp, ArrowDown, X, Image as ImageIcon, FileText, FileSpreadsheet,
} from 'lucide-react';
import { WidgetConfig } from '../../types';
import { ChartFactory, getAggregationLabel } from '../../components/charts/ChartFactory';
import { captureElementToCanvas } from '../../utils/dashboardExport';

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
      const W = pptx.presLayout.width;
      const H = pptx.presLayout.height;
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
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [960, 540] });
      for (let i = 0; i < slides.length; i++) {
        setActiveSlideIndex(i);
        // مهلة كافية لإعادة رسم الشريحة (ورسم ChartFactory إن وجد)
        await new Promise(r => setTimeout(r, 350));
        const el = stageRef.current;
        if (!el) continue;
        const canvas = await captureElementToCanvas(el, { backgroundColor: '#161616', scale: 2 });
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
            onClick={handleGenerateFromDashboard}
            disabled={isGenerating}
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
                  ? '"توليد من اللوحة" يعيد بناء العرض من مؤشرات ورسوم اللوحة النشطة في أي وقت، وتعديلاتك اليدوية على النقاط تبقى قابلة للتصدير فوراً.'
                  : '"Generate from Dashboard" rebuilds the deck from the active dashboard anytime; inline edits remain exportable instantly.'}
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
    </div>
  );
};
