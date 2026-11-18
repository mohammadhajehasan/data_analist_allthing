/**
 * #11 — محاكي السيناريوهات بافتراضات معلنة.
 *
 * لماذا: القفزة من «وصف الماضي» إلى «دعم القرار». لكن أداة تتوقّع رقمًا واحدًا
 * بلا افتراضات تصبح مصدر ثقة زائفة؛ لذلك كل ناتج هنا يحمل: الافتراضات، مصدرها
 * (مُقدَّر من بياناتك أم افتراض افتراضي)، ونطاقًا بدل رقم واحد.
 */

export interface Elasticity {
  /** المرونة: % تغيّر الطلب لكل 1% تغيّر سعر (سالبة عادة). */
  priceToDemand: number;
  /** مصدر المرونة: مُقدَّرة من بيانات أم افتراض قطاعي. */
  source: 'estimated' | 'assumed';
  confidence?: 'high' | 'medium' | 'low';
}

export interface ScenarioInput {
  baseRevenue: number;
  basePrice: number;
  baseUnits: number;
  priceChangePct: number;
  elasticity?: Elasticity;
  /** تغيّر مصاحب في التكاليف المتغيّرة (نسبة). */
  variableCostChangePct?: number;
  /** هامش المساهمة الحالي كنسبة من الإيراد. */
  contributionMarginPct?: number;
  /** تسويق إضافي بالريال (اختياري). */
  extraMarketing?: number;
}

export interface ScenarioResult {
  newPrice: number;
  newUnits: number;
  newRevenue: number;
  revenueChangePct: number;
  contribution: number;
  contributionChangePct: number;
  /** نطاق سيناريو عند مرونة أدنى/أعلى ±30%. */
  interval: { lowRevenue: number; highRevenue: number };
  assumptions: string[];
  /** تحذير إن كان السيناريو يخالف قيدًا اقتصاديًّا. */
  warnings: string[];
  narrative: string;
}

const DEFAULT_ELASTICITY: Elasticity = { priceToDemand: -1.2, source: 'assumed', confidence: 'low' };

export function simulateScenario(input: ScenarioInput): ScenarioResult {
  const elasticity = input.elasticity ?? DEFAULT_ELASTICITY;
  const assumptions: string[] = [];
  const warnings: string[] = [];

  if (elasticity.source === 'assumed') {
    assumptions.push(`المرونة مفترضة ${elasticity.priceToDemand} (طلب عادي): لم تُقدَّر من بياناتك، فهي فرضية قطاعية لا قياس.`);
  } else {
    assumptions.push(`المرونة مقدّرة من بياناتك: ${elasticity.priceToDemand} (ثقة ${elasticity.confidence || 'medium'}).`);
  }
  assumptions.push('الطلب يستجيب للسعر بمرونة ثابتة، ولا تتغيّر المنافسة ولا التفضيلات خلال الفترة.');
  if (input.extraMarketing) assumptions.push(`تسويق إضافي ${input.extraMarketing.toLocaleString('en-US')} يُفترض أن يغطي تكلفته ولا يغيّر الطلب في هذا النموذج.`);

  const newPrice = input.basePrice * (1 + input.priceChangePct / 100);
  const unitChangePct = elasticity.priceToDemand * input.priceChangePct;
  const newUnits = Math.max(0, input.baseUnits * (1 + unitChangePct / 100));
  const newRevenue = newPrice * newUnits;
  const revenueChangePct = input.baseRevenue ? ((newRevenue - input.baseRevenue) / input.baseRevenue) * 100 : 0;

  const marginPct = input.contributionMarginPct ?? 40;
  if (input.contributionMarginPct === undefined) assumptions.push(`هامش المساهمة مفترض ${marginPct}% — عدّله ليصبح الناتج واقعيًّا.`);
  const costChange = input.variableCostChangePct ?? 0;
  const variableCostPerUnit = input.basePrice * (1 - marginPct / 100) * (1 + costChange / 100);
  const contribution = (newPrice - variableCostPerUnit) * newUnits;
  const baseContribution = input.basePrice * (marginPct / 100) * input.baseUnits;
  const contributionChangePct = baseContribution ? ((contribution - baseContribution) / Math.abs(baseContribution)) * 100 : 0;

  const lowElasticity = { ...elasticity, priceToDemand: elasticity.priceToDemand * 0.7 };
  const highElasticity = { ...elasticity, priceToDemand: elasticity.priceToDemand * 1.3 };
  const revenueAt = (e: number) => newPrice * Math.max(0, input.baseUnits * (1 + (e * input.priceChangePct) / 100));
  const lowRevenue = revenueAt(lowElasticity.priceToDemand);
  const highRevenue = revenueAt(highElasticity.priceToDemand);

  if (contribution < baseContribution && revenueChangePct > 0) {
    warnings.push('الإيراد يرتفع بينما هامش المساهمة ينخفض — النمو يُشترى بخصم مخفي؛ قرار الإطلاق يجب أن يعتمد على الهامش لا الإيراد.');
  }
  if (Math.abs(elasticity.priceToDemand) < 1 && input.priceChangePct > 0) {
    warnings.push('المرونة أقل من 1 (طلب غير مرن) — تحقّق أنها مقدّرة من بياناتك فعلًا؛ الافتراض القطاعي غالبًا أعلى.');
  }
  if (newUnits <= 0) warnings.push('السعر الجديد يُصفّر الطلب في هذا النموذج — السيناريو خارج نطاق المعقول.');

  const narrative =
    `رفع السعر ${input.priceChangePct > 0 ? '+' : ''}${input.priceChangePct}% يعطي سعرًا ${newPrice.toFixed(2)} وطلبًا ${newUnits.toFixed(0)} وحدة ` +
    `(الإيراد ${newRevenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}، ${revenueChangePct > 0 ? '+' : ''}${revenueChangePct.toFixed(1)}%). ` +
    `هامش المساهمة ${contribution.toLocaleString('en-US', { maximumFractionDigits: 0 })} (${contributionChangePct > 0 ? '+' : ''}${contributionChangePct.toFixed(1)}%). ` +
    `النطاق الواقعي ${lowRevenue.toLocaleString('en-US', { maximumFractionDigits: 0 })} — ${highRevenue.toLocaleString('en-US', { maximumFractionDigits: 0 })} حسب مرونة ±30%.`;

  return {
    newPrice: Number(newPrice.toFixed(2)),
    newUnits: Number(newUnits.toFixed(2)),
    newRevenue: Number(newRevenue.toFixed(2)),
    revenueChangePct: Number(revenueChangePct.toFixed(2)),
    contribution: Number(contribution.toFixed(2)),
    contributionChangePct: Number(contributionChangePct.toFixed(2)),
    interval: { lowRevenue: Number(lowRevenue.toFixed(2)), highRevenue: Number(highRevenue.toFixed(2)) },
    assumptions,
    warnings,
    narrative,
  };
}

/**
 * تقدير مرونة من نقاط سعر/كمية تاريخية (انحدار log-log).
 * هذا ما يرفع السيناريو من تخمين إلى قياس حين تتوفّر البيانات.
 */
export function estimateElasticity(points: Array<{ price: number; units: number }>): Elasticity | null {
  const clean = points.filter((p) => p.price > 0 && p.units > 0);
  if (clean.length < 3) return null;
  const xs = clean.map((p) => Math.log(p.price));
  const ys = clean.map((p) => Math.log(p.units));
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i += 1) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (!den) return null;
  const slope = num / den;
  return {
    priceToDemand: Number(slope.toFixed(3)),
    source: 'estimated',
    confidence: clean.length >= 12 ? 'high' : clean.length >= 6 ? 'medium' : 'low',
  };
}
