import { describe, expect, it, beforeEach } from 'vitest';
import {
  MAX_ANALYST_ROWS,
  capRows,
  describeFreshness,
  inferColumns,
  seriesFromSource,
  type DatasetSource,
} from '../../server/analyst/sources';
import { shouldCaptureMemory } from '../../server/analyst/memoryCapture';
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
  updatedAt: null,
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

describe('pii gate — الأرقام تُقرأ بالسياق ولا تُقنَّع عبثًا', () => {
  const gate = (rows: Array<Record<string, unknown>>) =>
    evaluateGate(rows, { allowExternalWithPii: false, maxRows: 10 });

  it('لا يلمس الإيراد ولا رقم الطلب الطويل', () => {
    const decision = gate([
      { revenue: 1234567890, order_id: 123456789012 },
      { revenue: 9876543210, order_id: 987654321098 },
    ]);
    expect(decision.findings).toHaveLength(0);
    expect(decision.sanitizedRows[0].revenue).toBe(1234567890);
    expect(decision.sanitizedRows[0].order_id).toBe(123456789012);
  });

  it('يقنّع الرقم الدولي حتى بلا دلالة في اسم العمود', () => {
    const decision = gate([
      { contact: '+963991234567' },
      { contact: '+963998765432' },
    ]);
    expect(decision.findings[0]?.kind).toBe('phone');
    expect(String(decision.sanitizedRows[0].contact)).toContain('***');
  });

  it('يقرأ الرقم المحلي هاتفًا فقط حين يدلّ اسم العمود', () => {
    const hinted = gate([{ phone: '0991234567' }, { phone: '0998765432' }]);
    expect(hinted.findings[0]?.kind).toBe('phone');
    const unhinted = gate([{ amount: '0991234567' }, { amount: '0998765432' }]);
    expect(unhinted.findings).toHaveLength(0);
  });

  it('يقرأ الرقم الوطني فقط حين يدلّ اسم العمود', () => {
    const decision = gate([{ national_id: '12345678901' }, { national_id: '10987654321' }]);
    expect(decision.findings[0]?.kind).toBe('national_id');
    expect(String(decision.sanitizedRows[0].national_id)).toContain('***');
  });

  it('يقبل البطاقة الصحيحة بـLuhn ويرفض رقمًا طويلًا عابرًا', () => {
    const valid = gate([{ card: '4111 1111 1111 1111' }]);
    expect(valid.findings[0]?.kind).toBe('credit_card');
    const invalid = gate([{ reference: '1234567890123456' }]);
    expect(invalid.findings).toHaveLength(0);
  });
});

describe('memory capture — يحفظ التحليل لا المحادثة', () => {
  const base = {
    message: 'كم إيراد فرع حلب في آخر 30 يومًا؟',
    reply: 'الإيراد 128,400 بعد استبعاد المرتجعات، والفترة من 2026-10-19 إلى 2026-11-18.',
    evidenceCount: 2,
    existing: [],
  };

  it('يحفظ ردًّا مسنَدًا بدليل جديد', () => {
    expect(shouldCaptureMemory(base).capture).toBe(true);
  });

  it('يرفض المحادثة بلا دليل محسوب', () => {
    expect(shouldCaptureMemory({ ...base, evidenceCount: 0 }).capture).toBe(false);
  });

  it('يرفض السؤال القصير والردّ القصير والاعتذار', () => {
    expect(shouldCaptureMemory({ ...base, message: 'مرحبا' }).capture).toBe(false);
    expect(shouldCaptureMemory({ ...base, reply: 'تمام' }).capture).toBe(false);
    expect(shouldCaptureMemory({ ...base, reply: 'عذرًا، تعذّر الوصول إلى النموذج الآن، حاول لاحقًا بعد قليل.' }).capture).toBe(false);
  });

  it('يرفض التكرار شبه الحرفي لذكرى موجودة', () => {
    const existing = [
      {
        id: 'm1',
        question: 'كم إيراد فرع حلب في آخر 30 يوما؟',
        answer: 'الإيراد 128,400 بعد استبعاد المرتجعات.',
        createdAt: new Date().toISOString(),
      },
    ];
    const decision = shouldCaptureMemory({ ...base, existing });
    expect(decision.capture).toBe(false);
    expect(decision.similarity).toBeGreaterThanOrEqual(0.68);
  });
});

describe('freshness — عمر البيانات يُقاس قبل الاستنتاج', () => {
  const now = new Date('2026-11-18T12:00:00Z');

  it('طازج خلال اليوم، ويقدم قبل الأسبوع، ويصير قديمًا بعده', () => {
    expect(describeFreshness('2026-11-18T06:00:00Z', now).level).toBe('fresh');
    expect(describeFreshness('2026-11-15T12:00:00Z', now).level).toBe('aging');
    expect(describeFreshness('2026-11-01T12:00:00Z', now).level).toBe('stale');
  });

  it('يُنبّه فقط حين تستحق البيانات تنبيهًا', () => {
    expect(describeFreshness('2026-11-18T06:00:00Z', now).warn).toBe(false);
    expect(describeFreshness('2026-11-15T12:00:00Z', now).warn).toBe(true);
    expect(describeFreshness(null, now).level).toBe('unknown');
  });
});
