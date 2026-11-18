/**
 * اختبارات ربط المساعد الذكي بمحرّكات المحلل العشرين: الكشف عن النيّة، تنفيذ
 * الأدوات، طلب النموذج لأداة، وحقن الأدلة في التعليمات.
 */
import { describe, expect, it } from 'vitest';
import {
  copilotAnalystInstructions,
  detectAnalystTools,
  evidenceBadges,
  evidenceSuggestions,
  extractToolRequests,
  formatEvidenceForPrompt,
  runAnalystTool,
  runAnalystTools,
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
});
