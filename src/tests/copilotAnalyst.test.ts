/**
 * اختبارات ربط المساعد الذكي بمحرّكات المحلل العشرين: الكشف عن النيّة، تنفيذ
 * الأدوات، طلب النموذج لأداة، وحقن الأدلة في التعليمات.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_ANALYST_TOOL_ROUNDS,
  copilotAnalystInstructions,
  detectAnalystTools,
  evidenceBadges,
  evidenceSuggestions,
  extractToolRequests,
  formatEvidenceForPrompt,
  formatToolFollowUpPrompt,
  mergeEvidence,
  runAnalystTool,
  runAnalystTools,
  runToolLoop,
  stripToolRequests,
  toolLabel,
  type CopilotContext,
} from '../../server/analyst/copilotTools';
import { normalizeMetric } from '../../server/analyst/metricSemantics';

const metric = normalizeMetric({
  id: 'metric-revenue',
  name: 'الإيراد الصافي',
  aliases: ['revenue', 'إيراد'],
  formula: 'SUM(net_amount)',
  grain: 'order',
  requiredFilters: ['refunded = 0'],
  caveats: ['لا يشمل الضريبة'],
  sourceTables: ['orders'],
});

const ctx: CopilotContext = {
  message: 'كم إيراد هذا الشهر؟',
  metrics: [metric],
  rows: [
    { city: 'دمشق', sales: 1200, email: 'a@b.com' },
    { city: 'دمشق', sales: 1200, email: 'a@b.com' },
    { city: 'حلب', sales: -999, email: 'c@d.com' },
  ],
  datasetName: 'sales',
  datasetRowCount: 3,
};

describe('copilotTools — الكشف عن النيّة', () => {
  it('يكتشف الشذوذ في سؤال عن قيم شاذة', () => {
    const tools = detectAnalystTools('هل توجد قيم شاذة في المبيعات؟', ctx);
    expect(tools).toContain('anomaly');
  });

  it('يقدّم المقاييس والتوضيح على بقية الأدوات', () => {
    const tools = detectAnalystTools('ما أداء الإيراد هذا الأسبوع؟', ctx);
    expect(tools[0]).toBe('metrics');
    expect(tools.length).toBeLessThanOrEqual(3);
  });

  it('لا يشغّل أدوات لا بيانات لها', () => {
    const empty: CopilotContext = { message: 'هل توجد قيم شاذة؟' };
    expect(detectAnalystTools(empty.message, empty)).not.toContain('pii');
  });
});

describe('copilotTools — تنفيذ الأدوات', () => {
  it('يعيد تعريف المقياس وتحذيراته', () => {
    const evidence = runAnalystTool('metrics', ctx);
    expect(evidence?.tone).toBe('ok');
    expect(evidence?.title).toContain('الإيراد الصافي');
    expect(evidence?.details.join(' ')).toContain('لا يشمل الضريبة');
  });

  it('يسأل سؤالًا واحدًا عند الغموض', () => {
    const evidence = runAnalystTool('clarify', { message: 'ما أداء المبيعات؟' });
    expect(evidence?.tone).toBe('warn');
    expect(evidence?.summary).toContain('أي فترة زمنية');
  });

  it('يدقّق جودة الصفوف ويكشف التكرار والرمز المخفي', () => {
    const evidence = runAnalystTool('dossier', ctx);
    expect(evidence?.summary).toContain('جودة');
    expect(evidence?.details.join(' ')).toMatch(/مكرّر|رمز/);
  });

  it('يكشف البيانات الشخصية ويقنّعها', () => {
    const evidence = runAnalystTool('pii', ctx);
    expect(evidence?.tool).toBe('pii');
    expect(evidence?.summary).toContain('شخصيًّا');
  });

  it('ينتج سلسلة إثبات من بيانات المجموعة', () => {
    const evidence = runAnalystTool('proof', ctx);
    expect(evidence?.tool).toBe('proof');
    expect(evidence?.summary.length).toBeGreaterThan(3);
  });
});

describe('copilotTools — أدوات يطلبها النموذج', () => {
  it('يفكّ طلب الأداة من كتلة JSON', () => {
    const reply = 'سأحسب ذلك.\n```json\n{"action":"ANALYST_TOOL","tool":"anomaly","args":{"series":[]}}\n```';
    expect(extractToolRequests(reply)).toEqual([{ tool: 'anomaly', args: { series: [] }, reason: undefined }]);
  });

  it('يزيل كتلة الطلب ويُبقي إجراءات الواجهة', () => {
    const reply = 'نص\n```json\n{"action":"ANALYST_TOOL","tool":"memory"}\n```\n```json\n{"action":"NAVIGATE","tab":"reports"}\n```';
    const cleaned = stripToolRequests(reply);
    expect(cleaned).not.toContain('ANALYST_TOOL');
    expect(cleaned).toContain('NAVIGATE');
  });

  it('يتجاهل أداة غير معروفة', () => {
    expect(extractToolRequests('```json\n{"action":"ANALYST_TOOL","tool":"hack"}\n```')).toHaveLength(0);
  });
});

describe('copilotTools — الحقن والاقتراحات', () => {
  it('يحقن الأدلة ويمنع الأرقام من عند النموذج', () => {
    const text = formatEvidenceForPrompt(runAnalystTools(['metrics', 'dossier'], ctx));
    expect(text).toContain('أدلة محسوبة');
    expect(text).toContain('[metrics]');
    expect(formatEvidenceForPrompt([])).toContain('لا تُبدِ أرقامًا');
  });

  it('لا يكرّر الأداة مرتين', () => {
    const evidence = runAnalystTools(['metrics', 'metrics'], ctx);
    expect(evidence).toHaveLength(1);
  });

  it('يبني اقتراحات من الأدلة الفعلية', () => {
    const evidence = runAnalystTools(['anomaly', 'dossier'], ctx);
    const suggestions = evidenceSuggestions(evidence);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.join(' ')).toContain('المشكلات الحرجة');
  });

  it('يعطي شارات مختصرة وتسميات عربية', () => {
    const evidence = runAnalystTools(['metrics'], ctx);
    expect(evidenceBadges(evidence)).toContain('المقياس المعتمد');
    expect(toolLabel('proof')).toBe('سلسلة الإثبات');
  });

  it('تعليمات النظام تذكر قاعدة السببية وسؤال التوضيح', () => {
    const instructions = copilotAnalystInstructions('ar');
    expect(instructions).toContain('سببية');
    expect(instructions).toContain('سؤالًا واحدًا');
    expect(copilotAnalystInstructions('en')).toContain('ANALYST_TOOL');
  });

  it('تعليمات الطلب تذكر سقف الدورتين كي لا يكرّر النموذج', () => {
    expect(copilotAnalystInstructions('ar')).toContain('دورتين');
  });
});

describe('runToolLoop — النموذج يرى نتيجة أداته (حد أقصى دورتان)', () => {
  const fence = '`'.repeat(3);
  const request = (tool: string) =>
    `${fence}json\n${JSON.stringify({ action: 'ANALYST_TOOL', tool })}\n${fence}`;

  const loopCtx: CopilotContext = {
    message: 'هل يوجد شذوذ في الإيراد؟',
    rows: [
      { city: 'دمشق', sales: 1200 },
      { city: 'دمشق', sales: 1200 },
      { city: 'حلب', sales: -999 },
    ],
    series: Array.from({ length: 10 }, (_, i) => ({ label: `d${i + 1}`, value: 100 + (i === 9 ? 300 : 0) })),
    datasetName: 'sales',
    datasetRowCount: 10,
  };

  it('ينفّذ الأداة المطلوبة ويرسل نتيجتها في جولة واحدة', async () => {
    const calls: Array<{ round: number; tools: string[] }> = [];
    const result = await runToolLoop({
      draft: `سأفحص الجودة.\n${request('dossier')}`,
      ctx: loopCtx,
      reask: async (_draft, evidence, round) => {
        calls.push({ round, tools: evidence.map((e) => e.tool) });
        return 'الإجابة النهائية بعد رؤية التدقيق.';
      },
    });

    expect(result.rounds).toBe(1);
    expect(result.requested).toEqual(['dossier']);
    expect(result.text).toBe('الإجابة النهائية بعد رؤية التدقيق.');
    expect(result.text).not.toContain('ANALYST_TOOL');
    expect(result.evidence.map((e) => e.tool)).toContain('dossier');
    // الجولة الثانية من الاستدعاء رأت الدليل فعلًا، لا مجرد اسم الأداة.
    expect(calls[0].tools).toContain('dossier');
  });

  it('يسمح بجولة ثانية حين يطلب النموذج أداة أخرى بعد رؤية النتيجة', async () => {
    const prompts: string[] = [];
    const result = await runToolLoop({
      draft: request('dossier'),
      ctx: loopCtx,
      reask: async (draft, _evidence, round) => {
        prompts.push(draft);
        if (round === 1) return `وجدت مشكلة، أحتاج الشذوذ.\n${request('anomaly')}`;
        return 'الخلاصة النهائية: نقطة شاذة واحدة. ';
      },
    });

    expect(result.rounds).toBe(2);
    expect(result.requested).toEqual(['dossier', 'anomaly']);
    expect(result.evidence.map((e) => e.tool)).toEqual(expect.arrayContaining(['dossier', 'anomaly']));
    expect(result.text.trim()).toBe('الخلاصة النهائية: نقطة شاذة واحدة.');
    expect(prompts).toHaveLength(2);
  });

  it('يتوقف عند السقف ولا ينفّذ طلبًا ثالثًا', async () => {
    const result = await runToolLoop({
      draft: request('dossier'),
      ctx: loopCtx,
      reask: async (_draft, _evidence, round) =>
        round === 1 ? request('anomaly') : request('proof'),
    });

    expect(MAX_ANALYST_TOOL_ROUNDS).toBe(2);
    expect(result.rounds).toBe(2);
    expect(result.requested).toEqual(['dossier', 'anomaly']);
  });

  it('لا يعيد تنفيذ أداة حُسبت قبل السؤال', async () => {
    let calls = 0;
    const result = await runToolLoop({
      draft: request('dossier'),
      ctx: loopCtx,
      proactive: [{ tool: 'dossier', title: 'جودة', summary: 'محسوبة مسبقًا', tone: 'ok', details: [] }],
      reask: async () => { calls += 1; return 'نهائي'; },
    });

    expect(calls).toBe(0);
    expect(result.rounds).toBe(0);
    expect(result.evidence).toHaveLength(1);
  });

  it('يبقي المسودة إن تعذّر استدعاء النموذج في المتابعة', async () => {
    const result = await runToolLoop({
      draft: `مسودة.\n${request('dossier')}`,
      ctx: loopCtx,
      reask: async () => null,
    });

    expect(result.rounds).toBe(1);
    expect(result.text).toContain('مسودة.');
    expect(result.evidence.map((e) => e.tool)).toContain('dossier');
  });

  it('يدمج الأدلة بلا تكرار ويحفظ الأولى', () => {
    const base = [{ tool: 'dossier' as const, title: 'أ', summary: 'أولى', tone: 'ok' as const, details: [] }];
    const merged = mergeEvidence(base, [
      { tool: 'dossier' as const, title: 'ب', summary: 'ثانية', tone: 'bad' as const, details: [] },
      { tool: 'anomaly' as const, title: 'ج', summary: 'ثالثة', tone: 'info' as const, details: [] },
    ]);
    expect(merged.map((e) => e.tool)).toEqual(['dossier', 'anomaly']);
    expect(merged[0].summary).toBe('أولى');
  });

  it('prompt المتابعة يحمل الأدلة ورقم الجولة والسقف', () => {
    const prompt = formatToolFollowUpPrompt({
      originalPrompt: 'User: كم الإيراد؟',
      draft: 'مسودة أولى',
      evidence: [{ tool: 'dossier', title: 'جودة', summary: '63/100', tone: 'warn', details: [] }],
      round: 1,
    });
    expect(prompt).toContain('63/100');
    expect(prompt).toContain('جولة الأدوات 1 من 2');
    expect(prompt).toContain('ANALYST_TOOL');
  });
});
