/**
 * اختبارات قلب «الذكاء التحليلي»: المقاييس، تحقّق SQL المزدوج، تدقيق البيانات،
 * الذاكرة، وكشف الشذوذ. كل اختبار يوثّق السلوك الذي يُبنى عليه قرار المستخدم.
 */
import { describe, expect, it } from 'vitest';
import {
  detectMetricConflicts,
  metricSqlPreamble,
  normalizeMetric,
  resolveQuestion,
  validateMetric,
  type MetricDefinition,
} from '../../server/analyst/metricSemantics';
import { crossCheckResults } from '../../server/analyst/sqlCrossCheck';
import { buildDossier } from '../../server/analyst/dataDossier';
import { memoryContextBlock, memoryWarnings, rankMemory, type MemoryEntry } from '../../server/analyst/analystMemory';
import { attributeChange, detectAnomalies, decomposeSeries } from '../../server/analyst/anomalyAgent';

const revenue: MetricDefinition = normalizeMetric({
  id: 'metric-revenue',
  name: 'الإيراد الصافي',
  aliases: ['revenue', 'إيراد', 'المبيعات'],
  formula: 'SUM(net_amount)',
  grain: 'order',
  requiredFilters: ['refunded = 0'],
  currency: 'USD',
  caveats: ['لا يشمل الضريبة'],
  sourceTables: ['orders'],
});

const grossRevenue: MetricDefinition = normalizeMetric({
  id: 'metric-revenue-gross',
  name: 'الإيراد الصافي',
  aliases: ['gross revenue'],
  formula: 'SUM(gross_amount)',
  grain: 'order',
  requiredFilters: [],
  caveats: [],
  sourceTables: ['orders'],
});

describe('metricSemantics — الطبقة الدلالية', () => {
  it('يرفض تعريفًا بلا دالة تجميع', () => {
    const errors = validateMetric({ name: 'الجلسات', formula: 'session_id', grain: 'row' } as Partial<MetricDefinition>);
    expect(errors.join(' ')).toContain('دالة تجميع');
  });

  it('يطابق السؤال العربي باللقب ويعيد المقياس مع تحذيراته', () => {
    const resolution = resolveQuestion('كم إيراد هذا الشهر؟', [revenue]);
    expect(resolution.chosen?.id).toBe('metric-revenue');
    expect(resolution.caveats).toEqual(['لا يشمل الضريبة']);
    expect(resolution.clarifyingQuestion).toBeNull();
  });

  it('يطلب توضيحًا بدل التخمين حين يتقارب مقياسان', () => {
    const resolution = resolveQuestion('ما الإيراد الصافي؟', [revenue, grossRevenue]);
    expect(resolution.matches.length).toBe(2);
    expect(resolution.chosen).toBeNull();
    expect(resolution.clarifyingQuestion).toContain('SUM(net_amount)');
  });

  it('يكشف تعارضًا بين تعريفين لنفس الاسم', () => {
    const conflicts = detectMetricConflicts([revenue, grossRevenue, { ...grossRevenue, id: 'm3', formula: 'SUM(gross_amount)', grain: 'day' }]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].differingFields).toContain('الصيغة');
    expect(conflicts[0].severity).toBe('high');
  });

  it('يُلصق هوية المقياس أعلى SQL المولّد', () => {
    const preamble = metricSqlPreamble(revenue);
    expect(preamble).toContain('grain: order');
    expect(preamble).toContain('refunded = 0');
  });
});

describe('sqlCrossCheck — تحقّق ذاتي', () => {
  const a = { columns: ['city', 'total'], rows: [{ city: 'دمشق', total: 120 }, { city: 'حلب', total: 80 }] };

  it('يتفق مع نتيجتين متطابقتين', () => {
    const report = crossCheckResults(a, JSON.parse(JSON.stringify(a)));
    expect(report.status).toBe('agree');
    expect(report.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it('يكشف مضاعفة الصفوف الناتجة عن JOIN', () => {
    const doubled = { columns: ['city', 'total'], rows: [...a.rows, ...a.rows] };
    const report = crossCheckResults(a, doubled);
    expect(report.status).toBe('disagree');
    expect(report.findings.some((f) => f.id === 'rowcount' && f.severity === 'critical')).toBe(true);
  });

  it('لا يعتبر تطابق الصفر دليلًا', () => {
    const empty = { columns: ['city', 'total'], rows: [] };
    const report = crossCheckResults(empty, empty);
    expect(report.status).toBe('inconclusive');
    expect(report.verdict).toContain('فارغتان');
  });
});

describe('dataDossier — تدقيق البيانات', () => {
  const rows = [
    { city: 'دمشق', sales: 1200, visits: 40, segment: 'A' },
    { city: 'دمشق', sales: 1200, visits: 40, segment: 'A' },
    { city: 'حلب', sales: -999, visits: 31, segment: 'B' },
    { city: 'حمص', sales: 500, visits: 12, segment: 'B' },
  ];

  it('يكشف الصفوف المكرّرة والرمز المخفي ويشرح الأثر', () => {
    const dossier = buildDossier(rows);
    const ids = dossier.issues.map((i) => i.id);
    expect(ids).toContain('duplicate-rows');
    expect(ids.some((id) => id.startsWith('sentinel-sales'))).toBe(true);
    expect(dossier.qualityScore).toBeLessThan(100);
  });

  it('يكشف تسريب الهدف عند ارتباط شبه تام', () => {
    const leaky = Array.from({ length: 12 }, (_, i) => ({ revenue: i * 10, revenue_copy: i * 10 + 5 }));
    const dossier = buildDossier(leaky, { target: 'revenue' });
    expect(dossier.issues.some((i) => i.id.startsWith('leak-'))).toBe(true);
  });

  it('يرتّب المشكلات بالخطورة تصاعديًّا', () => {
    const dossier = buildDossier(rows);
    const order = ['critical', 'high', 'medium', 'low'];
    const ranks = dossier.issues.map((i) => order.indexOf(i.severity));
    expect(ranks).toEqual([...ranks].sort((x, y) => x - y));
  });
});

describe('analystMemory — ذاكرة المحلل', () => {
  const entries: MemoryEntry[] = [
    { id: 'm1', question: 'كم إيراد الشهر الماضي؟', answer: '12,400 دولار بلا مرتجعات', outcome: 'positive', tags: ['revenue'], createdAt: '2026-03-01T00:00:00Z' },
    { id: 'm2', question: 'تحليل مرتجعات الربع', answer: 'نُفيت الفرضية: المرتجعات لا ترتبط بالموسم', outcome: 'negative', tags: ['refunds'], createdAt: '2026-04-01T00:00:00Z' },
  ];

  it('يرتّب النتائج بالصلة ويفسّر سبب الظهور', () => {
    const hits = rankMemory('إيراد الشهر', entries);
    expect(hits[0].entry.id).toBe('m1');
    expect(hits[0].reason.length).toBeGreaterThan(0);
  });

  it('يحذّر من تكرار تحليل نُفي سابقًا', () => {
    const warnings = memoryWarnings('تحليل المرتجعات', entries);
    expect(warnings.some((w) => w.kind === 'repeated-negative')).toBe(true);
  });

  it('ينبّه لفرق كبير عن رقم سابق', () => {
    const warnings = memoryWarnings('إيراد الشهر الماضي', entries, 20000);
    expect(warnings.some((w) => w.kind === 'prior-conflict')).toBe(true);
  });

  it('يبني كتلة سياق للمساعد', () => {
    expect(memoryContextBlock('إيراد الشهر الماضي', entries)).toContain('تحليلات سابقة');
  });
});

describe('anomalyAgent — الشذوذ والإسناد', () => {
  it('يفكّك السلسلة إلى اتجاه وموسمية وبقايا', () => {
    const values = [10, 12, 11, 13, 10, 12, 11, 13, 10, 12, 11, 13, 10, 12];
    const { trend, seasonal, residual, period } = decomposeSeries(values, 4);
    expect(period).toBe(4);
    expect(trend).toHaveLength(values.length);
    expect(seasonal).toHaveLength(values.length);
    expect(residual).toHaveLength(values.length);
  });

  it('يكتشف ارتفاعًا شاذًّا بعد فصل الموسمية', () => {
    const series = Array.from({ length: 28 }, (_, i) => ({ label: `d${i}`, value: 100 + (i % 7) * 2 }));
    series[27] = { label: 'd27', value: 400 };
    const report = detectAnomalies(series, 7);
    expect(report.points.length).toBeGreaterThanOrEqual(1);
    expect(report.points[0].direction).toBe('spike');
  });

  it('يعلن قصور السلسلة بدل إنذار كاذب', () => {
    const report = detectAnomalies([{ label: 'a', value: 1 }, { label: 'b', value: 2 }], 7);
    expect(report.sufficient).toBe(false);
    expect(report.summary).toContain('قصيرة');
  });

  it('يسند التغيّر إلى أكبر قيمة مساهمة', () => {
    const attribution = attributeChange([
      { dimension: 'city', value: 'دمشق', current: 120, baseline: 180 },
      { dimension: 'city', value: 'حلب', current: 150, baseline: 150 },
    ], 'city');
    expect(attribution.contributions[0].value).toBe('دمشق');
    expect(attribution.concentration).toBe('single');
    expect(attribution.narrative).toContain('دمشق');
  });
});
