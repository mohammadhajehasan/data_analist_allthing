/**
 * #19 — تفسير النموذج باللغة الإنسانية.
 *
 * لماذا: «أهمية الميزة = 0.31» لا تُفيد صاحب القرار. تحويلها إلى جملة عن
 * **السلوك** («الاحتفاظ يقفز بعد 3 استخدامات أسبوعية») هي التي تُحوّل النموذج
 * إلى معرفة قابلة للتنفيذ، وتكشف إن كان النموذج يتعلّم شيئًا منطقيًّا أصلًا.
 */

export interface FeatureImportance {
  feature: string;
  /** أهمية نسبية (0..1 أو أي مقياس نسبي). */
  importance: number;
  direction?: 'positive' | 'negative' | 'mixed';
  /** عتبة/نقطة تحوّل مكتشفة (اختياري). */
  threshold?: number;
  unit?: string;
}

export interface ExplanationInput {
  target: string;
  task: 'classification' | 'regression';
  features: FeatureImportance[];
  /** حجم البيانات المستخدمة. */
  rows?: number;
  /** أداء النموذج (AUC/R2) إن توفر. */
  score?: { metric: string; value: number };
}

export interface Explanation {
  headline: string;
  /** فقرات جاهزة للعرض/التقرير. */
  paragraphs: string[];
  /** أهم 3 عوامل بجملة سلوكية. */
  drivers: Array<{ feature: string; sentence: string; importancePct: number }>;
  /** تحذيرات منهجية. */
  cautions: string[];
}

const DIRECTION_WORD: Record<'positive' | 'negative' | 'mixed', string> = {
  positive: 'يرفع',
  negative: 'يخفض',
  mixed: 'يغيّر',
};

function pctShare(features: FeatureImportance[], value: number): number {
  const total = features.reduce((s, f) => s + Math.abs(f.importance), 0) || 1;
  return (Math.abs(value) / total) * 100;
}

export function explainModel(input: ExplanationInput): Explanation {
  const sorted = [...input.features].sort((a, b) => Math.abs(b.importance) - Math.abs(a.importance));
  const top = sorted.slice(0, 3);
  const drivers = top.map((f) => {
    const dir = f.direction || 'mixed';
    const threshold = f.threshold !== undefined ? ` عند تجاوز ${f.threshold}${f.unit ? ` ${f.unit}` : ''}` : '';
    return {
      feature: f.feature,
      importancePct: Number(pctShare(sorted, f.importance).toFixed(1)),
      sentence:
        `«${f.feature}» ${DIRECTION_WORD[dir]} احتمال ${input.task === 'classification' ? input.target : `قيمة ${input.target}`}` +
        `${threshold} — ويساهم بـ${pctShare(sorted, f.importance).toFixed(0)}% من قدرة النموذج على التمييز.`,
    };
  });

  const paragraphs: string[] = [];
  if (drivers.length) {
    paragraphs.push(`القرار في هذا النموذج يتحدّد أساسًا بـ${drivers.map((d) => `«${d.feature}»`).join('، ')}.`);
    paragraphs.push(top.map((f) => {
      const dir = f.direction || 'mixed';
      const threshold = f.threshold !== undefined ? ` بعد ${f.threshold}${f.unit ? ` ${f.unit}` : ''}` : '';
      if (dir === 'positive') return `عندما يرتفع «${f.feature}»${threshold} يزداد ${input.target}.`;
      if (dir === 'negative') return `كلما ارتفع «${f.feature}»${threshold} قلّ ${input.target}.`;
      return `أثر «${f.feature}» غير خطّي — يزيد في نطاق ويقلّ في آخر، فلا تُقرأ علاقته كخطّ مستقيم.`;
    }).join(' '));
  } else {
    paragraphs.push('لا توجد ميزات مسجّلة — لا يمكن شرح النموذج.');
  }
  if (input.score) {
    const { metric, value } = input.score;
    const strength = metric.toLowerCase().includes('auc') ? (value >= 0.8 ? 'قوي' : value >= 0.7 ? 'مقبول' : 'ضعيف') : (value >= 0.6 ? 'جيد' : value >= 0.3 ? 'متوسط' : 'ضعيف');
    paragraphs.push(`أداء النموذج ${metric} = ${value.toFixed(3)} (${strength})${input.rows ? ` على ${input.rows.toLocaleString('en-US')} حالة` : ''}.`);
  }

  const cautions: string[] = [];
  const totalShare = drivers.reduce((s, d) => s + d.importancePct, 0);
  if (drivers.length && totalShare > 85) {
    cautions.push('ثلاث ميزات تفسّر أغلب القدرة التمييزية — النموذج هشّ: تغيّر صغير في إحداها يقلب القرارات.');
  }
  if (input.rows !== undefined && input.rows < 500) {
    cautions.push(`حجم البيانات ${input.rows} — الأهمية قد تتغيّر كثيرًا مع عيّنة أكبر؛ لا تُبنَ سياسة على هذا الترتيب بعد.`);
  }
  if (sorted.some((f) => /(id|رقم|معرف|timestamp|تاريخ)/i.test(f.feature)) && sorted.slice(0, 3).some((f) => /(id|رقم|معرف|timestamp|تاريخ)/i.test(f.feature))) {
    cautions.push('من أهم الميزات معرّف أو طابع زمني — احتمال تسريب: النموذج يتعلّم الترتيب لا الظاهرة.');
  }
  if (input.task === 'classification') {
    cautions.push('«يرفع الاحتمال» ليس «يسبّب»: هذه أهمية نموذجية على بيانات رصدية، لا أثر تدخّلي مقيس.');
  }

  return {
    headline: drivers.length
      ? `أهم ما يحرّك ${input.target}: ${drivers[0].feature}${drivers[1] ? ` ثم ${drivers[1].feature}` : ''}.`
      : `لا ميزات لشرحها في نموذج ${input.target}.`,
    paragraphs,
    drivers,
    cautions,
  };
}
