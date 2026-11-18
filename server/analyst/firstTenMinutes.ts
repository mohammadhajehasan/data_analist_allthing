/**
 * #16 — «أول 10 دقائق»: الانطباع الأول من مجموعة بيانات جديدة.
 *
 * لماذا: أفضل تسويق للمنصة ليس شرح الميزات بل أن يقول النظام — بعد الاستيراد
 * مباشرة — ثلاثة أشياء صحيحة عن بياناتك لم تكن تراها، ثم يقترح السؤال التالي.
 * هذا يحوّل مستخدمًا متردّدًا إلى مستخدم مقتنع قبل أن يفتح قائمة الأدوات.
 */

import { ColumnProfile } from './dataDossier';

export interface Insight {
  id: string;
  headline: string;
  detail: string;
  /** القيمة الرقمية التي تسند الجملة. */
  evidence: string;
  nextQuestion: string;
}

export interface OnboardingBrief {
  headline: string;
  insights: Insight[];
  suggestedDashboard: { title: string; chart: 'line' | 'bar' | 'scatter'; x: string; y: string; reason: string };
  firstQuestions: string[];
  /** جملة تحفيزية قصيرة تُعرض أعلى الصفحة. */
  greeting: string;
}

/** أكبر عمود رقمي «مقياسًا» وأفضل عمود زمني — أساس الاقتراحات. */
function pickMeasures(columns: ColumnProfile[]): { measure?: ColumnProfile; time?: ColumnProfile; dimension?: ColumnProfile } {
  const numeric = columns.filter((c) => c.kind === 'numeric' && (c.sd ?? 0) > 0);
  const measure = numeric.slice().sort((a, b) => (b.sd ?? 0) - (a.sd ?? 0))[0];
  const time = columns.find((c) => c.kind === 'date');
  const dimension = columns
    .filter((c) => c.kind === 'categorical' && c.distinct >= 2 && c.distinct <= 20)
    .sort((a, b) => a.distinct - b.distinct)[0];
  return { measure, time, dimension };
}

export function buildOnboardingBrief(profile: { rowCount: number; columns: ColumnProfile[]; qualityScore?: number; datasetName?: string }): OnboardingBrief {
  const { measure, time, dimension } = pickMeasures(profile.columns);
  const insights: Insight[] = [];

  if (measure) {
    const skew = measure.mean && measure.median !== undefined && Math.abs(measure.mean - measure.median) / Math.max(1e-9, Math.abs(measure.median)) > 0.3;
    insights.push({
      id: 'main-measure',
      headline: `${measure.name} يتوزّع بشكل ${skew ? 'غير متماثل' : 'متوازن'}`,
      detail: skew
        ? `المتوسط ${measure.mean} يبتعد عن الوسيط ${measure.median} — القيم الكبيرة تسحب المتوسط، فاستخدم الوسيط أو افحص الشواذ قبل أي قرار.`
        : `المتوسط ${measure.mean} والوسيط ${measure.median} متقاربان، فالمتوسط ممثّل للمجموعة.`,
      evidence: `n=${measure.count - measure.missing}، sd=${measure.sd}، مدى ${measure.min}–${measure.max}`,
      nextQuestion: `كيف تغيّر ${measure.name} خلال الفترة، وأي شريحة صنعت التغيّر؟`,
    });
  }

  if (time) {
    insights.push({
      id: 'time-span',
      headline: 'البُعد الزمني جاهز للاتجاه',
      detail: `العمود «${time.name}» يغطّي فترة كاملة — يمكن رسم الاتجاه وكشف الشذوذ فورًا.`,
      evidence: `${time.count - time.missing} تاريخًا صالحًا`,
      nextQuestion: `أظهر لي اتجاه ${measure?.name || 'الرقم الأساسي'} شهريًّا مع النقاط الشاذة.`,
    });
  }

  if (dimension) {
    const top = dimension.topValues[0];
    if (top) {
      const share = (top.count / profile.rowCount) * 100;
      insights.push({
        id: 'concentration',
        headline: `${dimension.name} مركّز`,
        detail: `«${top.value}» وحدها تمثّل ${share.toFixed(1)}% من الصفوف — أي مقارنة عامة ستكون في الحقيقة مقارنة بها.`,
        evidence: `${top.count.toLocaleString('en-US')} من ${profile.rowCount.toLocaleString('en-US')} صفًّا`,
        nextQuestion: `قارن ${measure?.name || 'المقياس'} بين ${dimension.name} بعد استبعاد «${top.value}».`,
      });
    }
  }

  if ((profile.qualityScore ?? 100) < 70) {
    insights.push({
      id: 'quality',
      headline: 'جودة البيانات تحتاج نظرة قبل التحليل',
      detail: `درجة الجودة ${profile.qualityScore}/100 — راجع قائمة المشكلات المرتبة بالخطورة قبل بناء نموذج.`,
      evidence: `الملف: ${profile.datasetName || 'المستورد'}`,
      nextQuestion: 'أصلح المشكلات الحرجة فقط وأعد التقرير.',
    });
  }

  const suggestedDashboard = time && measure
    ? { title: `اتجاه ${measure.name}`, chart: 'line' as const, x: time.name, y: measure.name, reason: 'الزمن أول ما يُرسم: يكشف الاتجاه والموسمية والشذوذ في نظرة واحدة.' }
    : dimension && measure
      ? { title: `${measure.name} حسب ${dimension.name}`, chart: 'bar' as const, x: dimension.name, y: measure.name, reason: 'مقارنة فئات بأعمدة مرتّبة هي أوضح تمثيل.' }
      : { title: 'توزيع الصفوف', chart: 'bar' as const, x: profile.columns[0]?.name || '—', y: profile.columns[1]?.name || '—', reason: 'لا يوجد مقياس واضح — ابدأ باستكشاف الأعمدة.' };

  const firstQuestions = [
    insights[0]?.nextQuestion,
    measure && dimension ? `ما أعلى وأدنى 5 قيم في ${dimension.name} حسب ${measure.name}؟` : null,
    'هل توجد قيم شاذة أو تكرارات تؤثر على الأرقام؟',
    'ما أكبر عامل مرتبط بالنتيجة، وهل الارتباط يسمح بالاستنتاج السببي؟',
  ].filter((q): q is string => Boolean(q));

  return {
    headline:
      insights.length
        ? `${insights.length} أشياء تستحق انتباهك في ${profile.datasetName || 'بياناتك'}`
        : 'بياناتك جاهزة — لنبدأ بسؤال واحد.',
    insights,
    suggestedDashboard,
    firstQuestions,
    greeting: `استلمت ${profile.rowCount.toLocaleString('en-US')} صفًّا و${profile.columns.length} عمودًا. هذه أول ثلاث ملاحظات — وليست تقريرًا نهائيًّا.`,
  };
}
