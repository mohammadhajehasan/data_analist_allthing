/**
 * اختبارات القدرات التحليلية المتقدمة: الصرامة، التجارب، التوضيح، الإثبات،
 * التمثيل، السيناريو، الأثر، الأتمتة، التقييم، الخصوصية، الانطباع الأول،
 * المحكّم، السرد، وتفسير النموذج.
 */
import { describe, expect, it } from 'vitest';
import { lintClaims, meanConfidenceInterval, minimumDetectableEffect, srmCheck, twoProportionTest } from '../../server/analyst/statRigor';
import { alwaysValidPValue, checkGuardrails, readExperiment } from '../../server/analyst/sequentialTest';
import { planClarification, assumptionsFooter } from '../../server/analyst/clarifier';
import { buildProofChain, proofReadiness } from '../../server/analyst/proofChain';
import { critiqueChart } from '../../server/analyst/chartCritic';
import { estimateElasticity, simulateScenario } from '../../server/analyst/scenarioSim';
import { analyzeImpact, type Artifact } from '../../server/analyst/lineageImpact';
import { explainFailure, idempotencyKey, validateWorkflow } from '../../server/analyst/workflowReliability';
import { compareRuns, routeTask, runEvaluation } from '../../server/analyst/evalHarness';
import { evaluateGate } from '../../server/analyst/piiGate';
import { buildOnboardingBrief } from '../../server/analyst/firstTenMinutes';
import { arbitrate } from '../../server/analyst/arbiter';
import { buildWeeklyReport } from '../../server/analyst/weeklyNarrative';
import { explainModel } from '../../server/analyst/modelExplanation';

describe('statRigor — الصرامة الإحصائية', () => {
  it('يعطي فترة ثقة تحتوي المتوسط ولا تنهار مع عيّنة صغيرة', () => {
    const interval = meanConfidenceInterval([10, 12, 14]);
    expect(interval.point).toBeCloseTo(12, 5);
    expect(interval.lower).toBeLessThan(12);
    expect(interval.upper).toBeGreaterThan(12);
    expect(interval.n).toBe(3);
  });

  it('يحكم بدلالة الفرق الكبير بين نسبتين', () => {
    const test = twoProportionTest(100, 1000, 200, 1000);
    expect(test.pValue).toBeLessThan(0.001);
    expect(test.significant).toBe(true);
    expect(test.interval.lower).toBeGreaterThan(0);
  });

  it('يحسب MDE موجبًا يكبر حين تصغر العيّنة', () => {
    const small = minimumDetectableEffect(0.1, 500);
    const large = minimumDetectableEffect(0.1, 5000);
    expect(small).toBeGreaterThan(large);
    expect(large).toBeGreaterThan(0);
  });

  it('يكشف اختلال توزيع العيّنة (SRM)', () => {
    expect(srmCheck([5000, 5000]).ok).toBe(true);
    expect(srmCheck([6000, 4000]).ok).toBe(false);
    expect(srmCheck([6000, 4000]).message).toContain('SRM');
  });

  it('يرفض ادّعاء «أفضل» بلا دلالة ويقترح صياغة أمينة', () => {
    const findings = lintClaims('النسخة الجديدة أفضل من القديمة.', { pValue: 0.42, n: 40 });
    expect(findings.some((f) => f.id === 'comparative-not-significant')).toBe(true);
    expect(findings[0].rewrite).toContain('الدلالة');
  });

  it('ينبّه للغة السببية في بيانات رصدية', () => {
    const findings = lintClaims('الحملة أدّت إلى زيادة المبيعات.', { design: 'observational' });
    expect(findings.some((f) => f.id === 'causal-from-observation')).toBe(true);
  });
});

describe('sequentialTest — A/B متسلسل', () => {
  it('يرفض إعلان فوز بفرق صغير', () => {
    const result = alwaysValidPValue({ name: 'c', visitors: 1000, conversions: 100 }, { name: 't', visitors: 1000, conversions: 110 });
    expect(result.significant).toBe(false);
    expect(result.pValue).toBeGreaterThan(0.05);
  });

  it('يعطي دلالة للفرق الكبير', () => {
    const result = alwaysValidPValue({ name: 'c', visitors: 1000, conversions: 100 }, { name: 't', visitors: 1000, conversions: 200 });
    expect(result.significant).toBe(true);
    expect(result.relativeLiftPct).toBeCloseTo(100, 0);
  });

  it('يوقف الإطلاق عند تدهور مقياس حارس', () => {
    const readout = readExperiment(
      { name: 'c', visitors: 5000, conversions: 400 },
      { name: 't', visitors: 5000, conversions: 560 },
      [{ name: 'زمن التحميل', control: 1.2, treatment: 1.6, maxDegradationPct: 10, betterWhen: 'lower' }]
    );
    expect(readout.verdict).toBe('stop');
    expect(readout.headline).toContain('زمن التحميل');
  });

  it('يعلن التجربة غير صالحة عند SRM قبل أي قراءة', () => {
    const readout = readExperiment({ name: 'c', visitors: 9000, conversions: 500 }, { name: 't', visitors: 1000, conversions: 100 });
    expect(readout.verdict).toBe('invalid');
  });

  it('يحدّد تدهور المقاييس الحارسة بدقة', () => {
    const results = checkGuardrails([{ name: 'الإيراد', control: 100, treatment: 96, maxDegradationPct: 2, betterWhen: 'higher' }]);
    expect(results[0].breached).toBe(true);
  });
});

describe('clarifier — سؤال توضيحي واحد', () => {
  it('يطرح سؤال النافذة الزمنية على سؤال الأداء', () => {
    const plan = planClarification('ما أداء المبيعات؟');
    expect(plan.needsClarification).toBe(true);
    expect(plan.questions[0].id).toBe('time_window');
    expect(plan.prompt).toContain('1.');
  });

  it('يُعلن الافتراضات الباقية بدل إغراق المستخدم', () => {
    const plan = planClarification('متوسط الإيراد هذا الشهر مع المرتجعات؟');
    expect(plan.questions).toHaveLength(1);
    expect(assumptionsFooter(plan)).toContain('الافتراضات المستخدمة');
  });
});

describe('proofChain — سلسلة الإثبات', () => {
  it('يبني خطوات كاملة ويعدّها جاهزة', () => {
    const card = buildProofChain({
      metricName: 'الإيراد الصافي',
      value: 128400,
      unit: 'USD',
      formula: 'SUM(net_amount)',
      grain: 'order',
      filters: [{ column: 'refunded', operator: '=', value: '0' }],
      source: { datasetName: 'sales' },
      updatedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    });
    expect(card.steps.map((s) => s.kind)).toContain('freshness');
    expect(proofReadiness(card).ready).toBe(true);
    expect(card.shareText).toContain('128,400');
  });

  it('يعلن النواقص حين تغيب الصيغة والمصدر', () => {
    const card = buildProofChain({ metricName: 'X', value: 5 });
    expect(proofReadiness(card).ready).toBe(false);
    expect(card.gaps.length).toBeGreaterThan(0);
  });

  it('يحذّر من بيانات قديمة', () => {
    const card = buildProofChain({
      metricName: 'X', value: 5, formula: 'SUM(a)', grain: 'row', source: { datasetName: 'd' },
      updatedAt: new Date(Date.now() - 60 * 24 * 3600_000).toISOString(),
    });
    expect(card.freshness.level).toBe('stale');
  });
});

describe('chartCritic — نقد التمثيل', () => {
  it('يرفض دائريًا بسبع شرائح ويقترح أعمدة', () => {
    const verdict = critiqueChart({
      type: 'pie',
      title: 'الحصص',
      categories: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      series: [{ name: 'share', values: [30, 25, 15, 12, 10, 6, 2] }],
    });
    expect(verdict.findings.some((f) => f.id === 'pie-too-many')).toBe(true);
    expect(verdict.suggestion?.type).toBe('bar');
  });

  it('يكشف خلط الوحدات والمحور الثاني', () => {
    const verdict = critiqueChart({
      type: 'line',
      title: 'اتجاه',
      categories: ['1', '2'],
      series: [
        { name: 'revenue', values: [10, 20], unit: 'USD' },
        { name: 'orders', values: [3, 5], unit: 'count', axis: 'secondary' },
      ],
    });
    expect(verdict.findings.some((f) => f.id === 'mixed-units')).toBe(true);
    expect(verdict.findings.some((f) => f.id === 'dual-axis')).toBe(true);
  });

  it('يكشف الأساس المقطوع في الأعمدة', () => {
    const verdict = critiqueChart({
      type: 'bar', title: 'x', categories: ['a', 'b'],
      series: [{ name: 'v', values: [103, 97] }], yAxis: { startsAtZero: false, min: 95 },
    });
    expect(verdict.findings.some((f) => f.id === 'bar-truncated')).toBe(true);
  });
});

describe('scenarioSim — السيناريو', () => {
  it('يعطي نطاقًا معلنًا وافتراضات مكتوبة', () => {
    const result = simulateScenario({ baseRevenue: 100000, basePrice: 50, baseUnits: 2000, priceChangePct: 5, contributionMarginPct: 40 });
    expect(result.interval.lowRevenue).not.toBe(result.interval.highRevenue);
    expect(result.assumptions.join(' ')).toContain('المرونة مفترضة');
    expect(result.narrative).toContain('النطاق الواقعي');
  });

  it('يقدّر المرونة من نقاط تاريخية', () => {
    const elasticity = estimateElasticity([
      { price: 10, units: 100 }, { price: 12, units: 84 }, { price: 14, units: 71 }, { price: 16, units: 60 },
    ]);
    expect(elasticity?.source).toBe('estimated');
    expect(elasticity!.priceToDemand).toBeLessThan(0);
  });
});

describe('lineageImpact — أثر تغيير المخطط', () => {
  const artifacts: Artifact[] = [
    { id: 'a1', name: 'لوحة المبيعات', kind: 'dashboard', reads: [{ table: 'orders', columns: ['net_amount', 'city'] }], owner: 'finance' },
    { id: 'a2', name: 'نموذج التسرّب', kind: 'model', reads: [{ table: 'orders', columns: ['net_amount'] }] },
    { id: 'a3', name: 'تقرير المدن', kind: 'report', reads: [{ table: 'cities', columns: ['name'] }] },
  ];

  it('يعطي حكمًا مانعًا حين يُكسر أثر', () => {
    const report = analyzeImpact({ table: 'orders', column: 'net_amount', change: 'drop-column' }, artifacts);
    expect(report.verdict).toBe('blocking');
    expect(report.impacted).toHaveLength(2);
    expect(report.owners).toContain('finance');
    expect(report.remediation.join(' ')).toContain('expand');
  });

  it('يقول «آمن» حين لا أثر', () => {
    const report = analyzeImpact({ table: 'orders', column: 'unused_col', change: 'drop-column' }, artifacts);
    expect(report.verdict).toBe('safe');
  });
});

describe('workflowReliability — الأتمتة', () => {
  const spec = {
    id: 'wf',
    nodes: [
      { id: 'src', kind: 'source' as const, label: 'مصدر', inputs: [] },
      { id: 'agg', kind: 'sql' as const, label: 'تجميع', inputs: ['src'] },
      { id: 'send', kind: 'notify' as const, label: 'إرسال', inputs: ['agg'], sideEffect: true },
    ],
    edges: [{ from: 'src', to: 'agg' }, { from: 'agg', to: 'send' }],
  };

  it('يقبل مسارًا صالحًا ويعطي ترتيبًا وتكلفة', () => {
    const plan = validateWorkflow(spec);
    expect(plan.valid).toBe(true);
    expect(plan.order[0]).toBe('src');
    expect(plan.confirmations.length).toBeGreaterThan(0);
  });

  it('يرفض الدورة', () => {
    const cyclic = { ...spec, edges: [...spec.edges, { from: 'send', to: 'src' }] };
    const plan = validateWorkflow(cyclic);
    expect(plan.valid).toBe(false);
    expect(plan.issues.some((i) => i.id === 'cycle')).toBe(true);
  });

  it('مفتاح منع التكرار ثابت لنفس المدخلات', () => {
    expect(idempotencyKey('wf', '2026-11-18', { a: 1, b: 2 })).toBe(idempotencyKey('wf', '2026-11-18', { b: 2, a: 1 }));
    expect(idempotencyKey('wf', '2026-11-18', { a: 1 })).not.toBe(idempotencyKey('wf', '2026-11-19', { a: 1 }));
  });

  it('يفسّر 401 بأن إعادة المحاولة لن تُصلحها', () => {
    const explanation = explainFailure(spec, 'send: 401 unauthorized');
    expect(explanation.retrySafe).toBe(false);
    expect(explanation.fix).toContain('المفتاح');
  });
});

describe('evalHarness — التقييم', () => {
  const cases = [
    { id: 'a', question: 'q1', expected: '12,400', actual: '12410', task: 'reasoning' as const },
    { id: 'b', question: 'q2', expected: 'دمشق', actual: 'حلب', task: 'reasoning' as const },
  ];

  it('يقيس الدقة ويعزل الفشل', () => {
    const report = runEvaluation(cases);
    expect(report.total).toBe(2);
    expect(report.accuracy).toBeGreaterThan(40);
    expect(report.failures.map((f) => f.caseId)).toContain('b');
  });

  it('يكشف التراجع بين نسختين', () => {
    const improved = [{ ...cases[1], actual: 'دمشق' }, cases[0]];
    const report = compareRuns(cases, improved);
    expect(report.verdict).toBe('improved');
    expect(report.improvedCases).toContain('b');
  });

  it('يوجّه المهام البسيطة إلى نموذج رخيص', () => {
    expect(routeTask('extract').model).toBe('cheap');
    expect(routeTask('codegen', 0.9).model).toBe('strong');
  });
});

describe('piiGate — حاجز الخصوصية', () => {
  it('يقنّع ويستبعد الأعمدة الشخصية افتراضيًّا', () => {
    const decision = evaluateGate([
      { name: 'أحمد', email: 'ahmad@example.com', amount: 120 },
      { name: 'سارة', email: 'sara@example.com', amount: 80 },
    ]);
    expect(decision.findings.map((f) => f.kind)).toContain('email');
    expect(decision.sanitizedRows[0].email).toContain('***');
    expect(decision.droppedColumns).toContain('name');
    expect(decision.requiredAction).toContain('المحلي');
  });

  it('يسمح ببيانات بلا PII', () => {
    const decision = evaluateGate([{ amount: 10, city: 'دمشق' }]);
    expect(decision.allowed).toBe(true);
    expect(decision.findings).toHaveLength(0);
  });
});

describe('firstTenMinutes — الانطباع الأول', () => {
  it('يلتقط التركّز الزمني والقياس ويقترح السؤال التالي', () => {
    const brief = buildOnboardingBrief({
      rowCount: 1000,
      qualityScore: 82,
      datasetName: 'sales',
      columns: [
        { name: 'date', kind: 'date', count: 1000, missing: 0, missingPct: 0, distinct: 90, topValues: [], sentinelHits: 0 },
        { name: 'revenue', kind: 'numeric', count: 1000, missing: 10, missingPct: 1, distinct: 400, topValues: [], sentinelHits: 0, mean: 120, median: 80, sd: 50, min: 0, max: 900 },
        { name: 'city', kind: 'categorical', count: 1000, missing: 0, missingPct: 0, distinct: 3, topValues: [{ value: 'دمشق', count: 700 }], sentinelHits: 0 },
      ],
    });
    expect(brief.insights.length).toBeGreaterThanOrEqual(3);
    expect(brief.suggestedDashboard.chart).toBe('line');
    expect(brief.firstQuestions.length).toBeGreaterThan(0);
  });
});

describe('arbiter — الحكم بين تحليلين', () => {
  it('يفسّر الفرق باختلاف الفلاتر', () => {
    const result = arbitrate(
      { id: 'a', value: 128400, filters: ['بلا مرتجعات'], grain: 'order', period: 'نوفمبر' },
      { id: 'b', value: 132900, filters: ['مع المرتجعات'], grain: 'order', period: 'نوفمبر' }
    );
    expect(result.verdict).toBe('explainable');
    expect(result.explanations.length).toBeGreaterThan(0);
  });

  it('يعلن التناقض حين تتطابق التعريفات', () => {
    const result = arbitrate({ id: 'a', value: 100, filters: [], grain: 'order' }, { id: 'b', value: 130, filters: [], grain: 'order' });
    expect(result.verdict).toBe('contradiction');
    expect(result.resolution).toContain('المسار المزدوج');
  });

  it('يعتبر الفرق الصغير تقريبًا لا خلافًا', () => {
    const result = arbitrate({ id: 'a', value: 1000 }, { id: 'b', value: 1002 });
    expect(result.verdict).toBe('equivalent');
  });

  it('يعلن عدم القابلية للمقارنة عند اختلاف الحبيبية', () => {
    const result = arbitrate({ id: 'a', value: 10, grain: 'day' }, { id: 'b', value: 300, grain: 'month' });
    expect(result.verdict).toBe('not-comparable');
  });
});

describe('weeklyNarrative — السرد الأسبوعي', () => {
  it('يرتّب التوصيات حسب الأثر ويُعلن ما لا يُحكم فيه', () => {
    const report = buildWeeklyReport(
      [
        { name: 'الإيراد', current: 128400, previous: 120000, betterWhen: 'higher' },
        { name: 'الطلبات', current: 1840, previous: 1950, betterWhen: 'higher' },
      ],
      [{ date: '2026-11-10', label: 'إطلاق', kind: 'launch' }]
    );
    expect(report.headline).toContain('الطلبات');
    expect(report.recommendations[0].expectedImpact).toBe('medium');
    expect(report.eventLinks[0].likelyEffect).toContain('إطلاق');
    expect(report.narrative.length).toBeGreaterThan(20);
  });
});

describe('modelExplanation — تفسير النموذج', () => {
  it('يحوّل الأهمية إلى سلوك قابل للتنفيذ ويحذّر', () => {
    const explanation = explainModel({
      target: 'الاحتفاظ',
      task: 'classification',
      rows: 200,
      features: [
        { feature: 'عدد الاستخدامات الأسبوعية', importance: 0.4, direction: 'positive', threshold: 3, unit: 'استخدام' },
        { feature: 'شكاوى الدعم', importance: 0.3, direction: 'negative' },
      ],
    });
    expect(explanation.drivers[0].sentence).toContain('3');
    expect(explanation.cautions.some((c) => c.includes('رصدية') || c.includes('حجم البيانات'))).toBe(true);
  });
});
