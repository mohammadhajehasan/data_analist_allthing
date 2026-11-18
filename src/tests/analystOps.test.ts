import { describe, expect, it, beforeEach } from 'vitest';
import {
  MAX_ANALYST_ROWS,
  capRows,
  inferColumns,
  seriesFromSource,
  type DatasetSource,
} from '../../server/analyst/sources';
import { consumeAnalystBudget, resetAnalystBudgets } from '../../server/analyst/guard';
import { rankMemory } from '../../server/analyst/analystMemory';
import { normalizeMetric } from '../../server/analyst/metricSemantics';
import { runEvaluation, type GoldenCase } from '../../server/analyst/evalHarness';
import { evaluateGate } from '../../server/analyst/piiGate';

const source = (data: Array<Record<string, unknown>>): DatasetSource => ({
  id: 'ds-1',
  name: 'sales_2026',
  rows: data,
  columns: inferColumns(data),
  rowCount: data.length,
  truncated: false,
});

describe('sources — محوّلات البيانات الحقيقية', () => {
  it('يقصّ الصفوف عند السقف ويُعلن ذلك', () => {
    const rows = Array.from({ length: MAX_ANALYST_ROWS + 25 }, (_, i) => ({ i }));
    const limited = capRows(rows);
    expect(limited.rows).toHaveLength(MAX_ANALYST_ROWS);
    expect(limited.truncated).toBe(true);
    expect(capRows([{ a: 1 }]).truncated).toBe(false);
  });

  it('يستنتج الأنواع من القيم حين لا يحملها الملف', () => {
    const columns = inferColumns([
      { city: 'دمشق', sales: 120, date: '2026-01-01' },
      { city: 'حلب', sales: 90, date: '2026-01-02' },
    ]);
    expect(columns.find((c) => c.name === 'sales')?.type).toBe('number');
    expect(columns.find((c) => c.name === 'city')?.type).toBe('string');
    expect(columns.find((c) => c.name === 'date')?.type).toBe('date');
  });

  it('يبني سلسلة من عمود التسمية وعمود القيمة بترتيب الصفوف', () => {
    const series = seriesFromSource(source([
      { day: 'd1', revenue: 10 },
      { day: 'd2', revenue: 12 },
      { day: 'd3', revenue: 11 },
    ]));
    expect(series).toEqual([
      { label: 'd1', value: 10 },
      { label: 'd2', value: 12 },
      { label: 'd3', value: 11 },
    ]);
  });

  it('تعود فارغة حين لا يوجد عمود رقمي', () => {
    expect(seriesFromSource(source([{ a: 'x' }, { a: 'y' }]))).toEqual([]);
  });
});

describe('guard — سقف الاستخدام', () => {
  beforeEach(() => resetAnalystBudgets());

  it('يسمح حتى السقف ثم يرفض مع زمن إعادة', () => {
    const user = 'u-1';
    for (let i = 0; i < 5; i += 1) {
      expect(consumeAnalystBudget(user, 'compute', 1, 5, 60_000).ok).toBe(true);
    }
    const blocked = consumeAnalystBudget(user, 'compute', 1, 5, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it('يعزل المستخدمين ونطاقات العمل عن بعضها', () => {
    expect(consumeAnalystBudget('u-a', 'compute', 1, 1, 60_000).ok).toBe(true);
    expect(consumeAnalystBudget('u-a', 'compute', 1, 1, 60_000).ok).toBe(false);
    expect(consumeAnalystBudget('u-b', 'compute', 1, 1, 60_000).ok).toBe(true);
    expect(consumeAnalystBudget('u-a', 'read', 1, 1, 60_000).ok).toBe(true);
  });
});

describe('memory — تشابه حرفي بلا خدمة خارجية', () => {
  const entries = [
    {
      id: 'm1',
      question: 'كم إيراد الشهر الماضي؟',
      answer: 'الإيراد الصافي 128,400 بعد استبعاد المرتجعات.',
      createdAt: new Date().toISOString(),
      tags: ['إيراد'],
      outcome: 'positive' as const,
    },
  ];

  it('يطابق صياغة قريبة/مخطئة إملائيًّا', () => {
    const hits = rankMemory('ايرادات الشهر السابق', entries, 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].entry.id).toBe('m1');
    expect(hits[0].score).toBeGreaterThan(0);
  });

  it('لا يطابق سؤالًا غير ذي صلة', () => {
    expect(rankMemory('ما هو لون الشعار؟', entries, 3)).toHaveLength(0);
  });
});

describe('metric governance — دورة حياة التعريف', () => {
  it('يبدأ مسودّة بإصدار 1 افتراضيًّا', () => {
    const metric = normalizeMetric({
      id: 'm-1',
      name: 'الإيراد الصافي',
      aliases: [],
      formula: 'SUM(net_amount)',
      grain: 'order',
      requiredFilters: ['refunded = 0'],
      caveats: [],
      sourceTables: ['orders'],
    });
    expect(metric.status).toBe('draft');
    expect(metric.version).toBe(1);
  });

  it('يحافظ على الاعتماد والإصدار عند إعادة التطبيع', () => {
    const metric = normalizeMetric({
      id: 'm-1',
      name: 'الإيراد الصافي',
      aliases: [],
      formula: 'SUM(net_amount)',
      grain: 'order',
      requiredFilters: [],
      caveats: [],
      sourceTables: [],
      status: 'approved',
      version: 3,
    });
    expect(metric.status).toBe('approved');
    expect(metric.version).toBe(3);
  });
});

describe('pii gate — لا يمحو محور الزمن', () => {
  it('يحفظ تواريخ السلسلة كما هي ويستبعد الأسماء ويقنّع البريد', () => {
    const decision = evaluateGate([
      { day: '2026-11-13', full_name: 'Ahmed Ali', email: 'ahmad@example.com', revenue: 210 },
      { day: '2026-11-14', full_name: 'Sara Omar', email: 'sara@example.com', revenue: 180 },
    ], { allowExternalWithPii: false, maxRows: 10 });
    expect(decision.sanitizedRows[0].day).toBe('2026-11-13');
    expect(decision.droppedColumns).toContain('full_name');
    expect(String(decision.sanitizedRows[0].email)).toContain('***@');
    expect(decision.sanitizedRows[0].revenue).toBe(210);
  });

  it('يعامل عمود الميلاد الصريح كبيانات شخصية', () => {
    const decision = evaluateGate([{ birth_date: '1990-05-01' }], { allowExternalWithPii: false, maxRows: 10 });
    expect(decision.findings.some((f) => f.kind === 'dob')).toBe(true);
  });
});

describe('eval gate — عتبة دقة تحمي من الانحدار', () => {
  const cases: GoldenCase[] = [
    { id: 'g1', question: 'كم مبيعات آذار؟', expected: '12400', actual: '12,400' },
    { id: 'g2', question: 'من أفضل مدينة؟', expected: 'دمشق', actual: 'دمشق' },
    { id: 'g3', question: 'ما هامش الربح؟', expected: '32%', actual: '31%' },
  ];

  it('يحسب دقة مفهومة ويصمد أمام تغيير في التنسيق', () => {
    const report = runEvaluation(cases);
    expect(report.accuracy).toBeGreaterThanOrEqual(60);
    expect(report.summary).toBeTruthy();
  });

  it('يسقط عند إجابات خاطئة — هذا ما يمنع تدهورًا صامتًا', () => {
    const broken = runEvaluation(cases.map((c) => ({ ...c, actual: 'غير معروف' })));
    expect(broken.accuracy).toBeLessThan(50);
  });
});
