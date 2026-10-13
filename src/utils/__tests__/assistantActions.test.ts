/**
 * Assistant action-block suite.
 *
 * The AI agent appends a ```json … ``` action block (CREATE_REPORT ⇄ reports,
 * CREATE_DASHBOARD ⇄ dashboards, NAVIGATE ⇄ tab). Output shape varies sharply
 * across providers: self-hosted 3B models (Ollama), routed free gateways
 * (FreeLLMAPI `auto` → e.g. gpt-oss:120b), OpenRouter free tiers, and cloud
 * flash models (Gemini). These fixtures reproduce the observed styles so the
 * parser + structure validator stay correct without real network calls.
 *
 * Note: structure validation runs BEFORE the UI dispatches an action into
 * saveDataStory()/saveDashboard() — a malformed report/dashboard here means
 * corrupted user state there.
 */
import { describe, it, expect } from 'vitest';
import { parseAssistantAction, validateAssistantAction, KNOWN_TABS, KNOWN_WIDGET_TYPES } from '../assistantActions';

const mkReportReply = (opts?: { mainTitle?: string; narr?: string; clean?: string }) => `سأضع لك تقريراً متكاملاً.
\`\`\`json
{
  "action": "CREATE_REPORT",
  "tab": "reports",
  "report": {
    "title": "${opts?.mainTitle ?? 'Q3 Sales Performance Overview'}",
    "executiveSummary": "إجمالي الإيرادات 485,500$ في الربع الثالث.",
    "sections": [
      { "title": "Product Revenue Landscape", "narrative": "${opts?.narr ?? 'سيطرت الحواسيب المحمولة على الإيرادات.'}", "insights": ["الابتوبات 44% من الإجمالي"] },
      { "title": "Regional Dynamics", "narrative": "الشمال يقود بنسبة 42%.", "insights": ["هنثوك ونورد", "أعمق"] }
    ],
    "recommendations": ["ركز على خط الهواتف", "اختر منافسة مسعرة في الجنوب"],
    "extraProviderKey": "allowed-cosmetic"
  }
}
\`\`\`
${opts?.clean ?? 'نُفّذ الإجراء. تفضّل بالاطلاع على التقرير في تبوي« الاقتراحات.»'}`;

const mkDashboardReply = (widgets?: any[]) => {
  const w = widgets ?? [
    { type: 'bar', title: 'إيرادات حسب المنتج', xAxis: 'product', yAxis: 'revenue' },
    { type: 'line', title: 'عدد الوحدات شهرياً', xAxis: 'month', yAxis: 'units' },
  ];
  return `جاهز — لوحة مبيعات الربع الثالث.
\`\`\`json
{
  "action": "CREATE_DASHBOARD",
  "tab": "dashboards",
  "dashboard": {
    "title": "لوحة تحكم مبيعات الربع الثالث",
    "widgets": ${JSON.stringify(w)}
  }
}
\`\`\`
تم الأمر بنجاح.`;
};

describe('parseAssistantAction — استخراج البنّا من ردود مزودات مختلفة', () => {
  // gemini-3.8-flash: رد عربي + JSON سليم
  it('gemini-style: يستخرج CREATE_REPORT ويزيل البنّا من النص', () => {
    const { replyContent, action } = parseAssistantAction(mkReportReply());
    expect(action).not.toBeNull();
    expect(action?.action).toBe('CREATE_REPORT');
    expect(action?.report?.sections).toHaveLength(2);
    expect(replyContent).not.toContain('```json');
    expect(replyContent).toContain('نُفّذ الإجراء');
  });

  // ollama llama3.2:3b: نص إنجليزي طويل قبل البتّة ثم JSON معلّف
  it('ollama-style: يتعامل مع JSON مسبوق بأسطر جديدة ومسافات', () => {
    const ollama = `Sure! Here is a dashboard based on your Q3 data.\n\n\`\`\`json\n\n${JSON.stringify({
      action: 'CREATE_DASHBOARD',
      tab: 'dashboards',
      dashboard: { title: 'Q3 Dashboard', widgets: [{ type: 'bar', title: 'Revenue by Product', xAxis: 'product', yAxis: 'revenue' }] },
    })}\n\`\`\`\nThe widgets match the requested columns.`;
    const { action } = parseAssistantAction(ollama);
    expect(action?.action).toBe('CREATE_DASHBOARD');
    expect(action?.dashboard?.widgets).toHaveLength(1);
  });

  // freellmapi auto→gpt-oss:120b: أسلوب "User asks: …" مع بلاوك JSON (ملاحظة حية)
  it('freellmapi-style: يتجزّع التعليق المطوّل قبل البنّا ويُنتج CREATE_DASHBOARD', () => {
    const freellm = `User asks: "build dashboard". Must respond with json block.\n\`\`\`json\n${JSON.stringify({
      action: 'CREATE_DASHBOARD',
      tab: 'dashboards',
      dashboard: {
        title: 'لوحة تحكم مبيعات الربع الثالث',
        widgets: [
          { type: 'bar', title: 'إيرادات حسب المنتج', xAxis: 'product', yAxis: 'revenue' },
          { type: 'bar', title: 'إيرادات حسب المنطقة', xAxis: 'region', yAxis: 'revenue' },
          { type: 'line', title: 'عدد الوحدات شهرياً', xAxis: 'month', yAxis: 'units' },
        ],
      },
    })}\n\`\`\``;
    const { action, replyContent } = parseAssistantAction(freellm);
    expect(action?.dashboard?.widgets).toHaveLength(3);
    expect(replyContent).toBe('User asks: "build dashboard". Must respond with json block.');
  });

  // openrouter free model: يقحم NAVIGATE بلا أي مفاتيح أخرى
  it('openrouter-style: NAVIGATE وحده من البتّة', () => {
    const { action } = parseAssistantAction('Transferred, and here is sudo:\n```json\n{"action":"NAVIGATE","tab":"nl2sql"}\n```');
    expect(action?.action).toBe('NAVIGATE');
    expect(action?.tab).toBe('nl2sql');
  });

  // حواف: بنّا غير صالح، بلا بنّا، بنّا فارغ
  it('JSON تالف → action null والنص الأصلي محفوظ كاملًا (سلوك قديم مُحفَظ)', () => {
    const broken = 'reply with block:\n```json\n{"action":"NAVIGATE","tab":\n```';
    const { action, replyContent } = parseAssistantAction(broken);
    expect(action).toBeNull();
    expect(replyContent).toContain('```json');
  });

  it('رد بلا أي بنّا → لا شيء', () => {
    expect(parseAssistantAction('مجرد جواب نصي عادي.').action).toBeNull();
    expect(parseAssistantAction('').action).toBeNull();
  });

  it('بنّا غير json (```sql) → لا يُستخرج كإجراء', () => {
    expect(parseAssistantAction('```sql\nSELECT 1;\n```').action).toBeNull();
  });
});

describe('validateAssistantAction — بنية CREATE_REPORT', () => {
  it('تقرير سليم عبر gemini-style fixture → valid بدون أخطاء', () => {
    const { action } = parseAssistantAction(mkReportReply());
    const v = validateAssistantAction(action);
    expect(v.kind).toBe('CREATE_REPORT');
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
  });

  it('يكتشف narrative فارغًا (خطأ عدم فقدان بيانات المستخدم)', () => {
    const { action } = parseAssistantAction(mkReportReply({ narr: '' }));
    const v = validateAssistantAction(action);
    expect(v.kind).toBe('CREATE_REPORT');
    expect(v.errors.some(e => e === 'section-0-narrative-empty')).toBe(true);
  });

  it('يكتشف قسماً واحداً صحيحاً مع ملاحظات نقص أسفل لا تمنع الإجراء', () => {
    const { action } = parseAssistantAction(mkReportReply({ mainTitle: '' }));
    const v = validateAssistantAction(action);
    expect(v.errors).toContain('report-title-not-string');
  });

  it('تقرير بلا sections → خطأ بنية', () => {
    const v = validateAssistantAction({ action: 'CREATE_REPORT', report: { title: 'X' } });
    expect(v.valid).toBe(false);
    expect(v.errors).toContain('sections-empty-or-missing');
  });

  it('عادة عارض all-in-langs: لا تتعارض مفاتيح الزوائد من المزود', () => {
    const { action } = parseAssistantAction(mkReportReply());
    const v = validateAssistantAction(action);
    expect(v.warnings.some(w => w.includes('extraProviderKey'))).toBe(false);
  });

  it('تسامح: الحقول الشكلية غير السليمة → تحذيرات، والعنوان غير السلس خطأ حاجب (يُخزَّن مباشرة في saveDataStory)', () => {
    const v = validateAssistantAction({
      action: 'CREATE_REPORT',
      report: { title: ['مصفوفة عقبول'], executiveSummary: 42, sections: [{ narrative: 'نص' }] },
    });
    expect(v.errors).toContain('report-title-not-string');
    expect(v.warnings).toContain('missing-executiveSummary');
  });
});

describe('validateAssistantAction — بنية CREATE_DASHBOARD', () => {
  it('لوحة freellmapi الحية (3 widgets أعمداها فعلية) → valid بلا أخطاء أو تحذير', () => {
    const { action } = parseAssistantAction(mkDashboardReply());
    const v = validateAssistantAction(action);
    expect(v.kind).toBe('CREATE_DASHBOARD');
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
  });

  it('نمط freellmapi الحية المشاهَد (البادئات تُزال في relation تلقاياً) — يصدّق أبعاد widgets الفعلية', () => {
    const { action } = parseAssistantAction(mkDashboardReply([
      { type: 'bar', title: 'إيرادات حسب المنتج', xAxis: 'product', yAxis: 'revenue' },
    ]));
    const v = validateAssistantAction(action);
    expect(v.valid).toBe(true);
    expect((action?.dashboard?.widgets || []).length).toBe(1);
  });

  it('widgets فارغة → خطأ', () => {
    const v = validateAssistantAction({ action: 'CREATE_DASHBOARD', dashboard: { title: 'X', widgets: [] } });
    expect(v.errors).toContain('widgets-empty-or-missing');
  });

  it('نوع widget خارج القائمة المسموح → تحذير لا خطأ (ابتُلع أولاً بـ parse ثم دُقّق)', () => {
    expect(KNOWN_WIDGET_TYPES).toContain('bar');
    const giza = parseAssistantAction(mkDashboardReply([{ type: 'hologram', title: 'من غير هذا', yAxis: 'revenue' }]));
    const vg = validateAssistantAction(giza.action);
    expect(vg.valid).toBe(true);
    expect(vg.warnings.some(w => w.includes('unknown-type:hologram'))).toBe(true);
    expect(vg.warnings.some(w => w.startsWith('widget-0-unknown-type'))).toBe(true);
  });

  it('widget بلا yAxis → تحذير (الواجهة تعوّض بـ "") لا خطأ', () => {
    const { action } = parseAssistantAction(mkDashboardReply([{ type: 'bar', title: 'no axis' }]));
    expect(action).not.toBeNull();
    const v = validateAssistantAction(action);
    expect(v.valid).toBe(true);
    expect(v.warnings).toContain('widget-0-missing-yAxis');
  });
});

describe('validateAssistantAction — NAVIGATE وحدود الإدخال', () => {
  it('tab معروف → valid؛ tab غير معروف → تحذير', () => {
    expect(validateAssistantAction({ action: 'NAVIGATE', tab: 'reports' }).valid).toBe(true);
    const unk = validateAssistantAction({ action: 'NAVIGATE', tab: 'astral-pane' });
    expect(unk.valid).toBe(true);
    expect(unk.warnings).toContain('unknown-tab:astral-pane');
  });

  it('كل الأتباب المعروفة مُعرّفة في الكونست', () => {
    expect(KNOWN_TABS).toContain('dashboards');
    expect(KNOWN_TABS).toContain('reports');
  });

  it('إدخال غريبي (null / مصفوفة / action غير معرف)', () => {
    expect(validateAssistantAction(null).kind).toBe('none');
    expect(validateAssistantAction([] as any).kind).toBe('none');
    const v = validateAssistantAction({ action: 'DEPLOY', payload: 1 });
    expect(v.kind).toBe('unknown');
    expect(v.errors).toContain('unknown-action:DEPLOY');
  });
});
