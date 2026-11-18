/**
 * توصيل القدرات العشرين بالمساعد الذكي (AI Copilot).
 *
 * لماذا طبقة مستقلة: المساعد ليس محادثة فقط — يجب أن يُشغّل نفس المحرّكات
 * التي في مختبر الذكاء قبل أن يجيب، فيصبح الجواب مسنَدًا لا مُتخيَّلًا.
 *
 * المنهج ثلاثي:
 *  1) سياق مُعدّ مسبقًا: نكشف نيّة السؤال بالكلمات المفتاحية، نشغّل الأدوات
 *     المناسبة، ونحقن نتائجها في تعليمات النظام قبل استدعاء النموذج.
 *  2) أدوات يطلبها النموذج: إن احتاج حسابًا لم نُشغّله، يُخرج طلبًا بصيغة
 *     ```json {"action":"ANALYST_TOOL","tool":"anomaly","args":{...}}``` فننفّذه
 *     ونعيد النتيجة للواجهة كبطاقة دليل.
 *  3) قواعد سلوكية في التعليمات: لا سببية من بيانات رصدية، لا رقم بلا إثبات،
 *     سؤال واحد عند الغموض، وذكر التحذيرات دائمًا.
 */

import {
  detectMetricConflicts,
  resolveQuestion,
  type MetricDefinition,
} from './metricSemantics';
import { crossCheckResults, type QueryResultSet } from './sqlCrossCheck';
import { buildDossier, profileColumn } from './dataDossier';
import { rankMemory, memoryWarnings, type MemoryEntry } from './analystMemory';
import { attributeChange, detectAnomalies } from './anomalyAgent';
import { lintClaims, meanConfidenceInterval, twoProportionTest } from './statRigor';
import { readExperiment, type GuardrailMetric } from './sequentialTest';
import { planClarification } from './clarifier';
import { buildProofChain, proofReadiness } from './proofChain';
import { critiqueChart, type ChartSpec } from './chartCritic';
import { simulateScenario } from './scenarioSim';
import { analyzeImpact, type Artifact } from './lineageImpact';
import { dryRunPlan, validateWorkflow, type WorkflowSpec } from './workflowReliability';
import { runEvaluation, routeTask, type GoldenCase, type TaskKind } from './evalHarness';
import { evaluateGate } from './piiGate';
import { buildOnboardingBrief } from './firstTenMinutes';
import { arbitrate, type AnalysisClaim } from './arbiter';
import { buildWeeklyReport, type WeeklySignal } from './weeklyNarrative';
import { explainModel, type FeatureImportance } from './modelExplanation';

export type AnalystToolId =
  | 'metrics'
  | 'metric-conflicts'
  | 'cross-check'
  | 'dossier'
  | 'memory'
  | 'anomaly'
  | 'rigor'
  | 'experiment'
  | 'clarify'
  | 'proof'
  | 'chart-critic'
  | 'scenario'
  | 'lineage'
  | 'workflow'
  | 'eval'
  | 'pii'
  | 'onboarding'
  | 'arbiter'
  | 'weekly'
  | 'explain-model';

export interface CopilotEvidence {
  tool: AnalystToolId;
  title: string;
  summary: string;
  tone: 'ok' | 'warn' | 'bad' | 'info';
  details: string[];
  /** بيانات منظمة للعرض التفصيلي (لا تُحقن في التعليمات كاملة). */
  data?: unknown;
}

export interface CopilotContext {
  message: string;
  language?: 'ar' | 'en';
  /** صفوف مجموعة البيانات النشطة (عيّنة) — تفتح التدقيق والخصوصية. */
  rows?: Array<Record<string, unknown>>;
  datasetName?: string;
  datasetRowCount?: number;
  targetColumn?: string;
  series?: Array<{ label: string; value: number }>;
  chartSpec?: ChartSpec;
  control?: { name: string; visitors: number; conversions: number };
  treatment?: { name: string; visitors: number; conversions: number };
  guardrails?: GuardrailMetric[];
  claims?: AnalysisClaim[];
  scenario?: Parameters<typeof simulateScenario>[0];
  workflow?: WorkflowSpec;
  crossCheck?: { a: QueryResultSet; b: QueryResultSet };
  modelFeatures?: FeatureImportance[];
  modelTarget?: string;
  signals?: WeeklySignal[];
  /** ما يجلبه المستدعي من التخزين (مقاييس/ذاكرة/أثراء/ذهبية). */
  metrics?: MetricDefinition[];
  memory?: MemoryEntry[];
  artifacts?: Artifact[];
  golden?: GoldenCase[];
  /** عقود تشغيل سابقة (إن توفّرت) لبناء سلسلة الإثبات. */
  lastQuery?: { sql?: string; filters?: Array<{ column: string; operator: string; value: string }>; updatedAt?: string | null };
}

/** قواعد الكشف: كل نيّة ← الأدوات التي تُشغَّل قبل الإجابة. */
const INTENT_RULES: Array<{ tool: AnalystToolId; pattern: RegExp }> = [
  { tool: 'clarify', pattern: /(أداء|اداء|مبيعات|إيراد|ايراد|نمو|اتجاه|performance|trend|sales|revenue)/i },
  { tool: 'metrics', pattern: /(إيراد|ايراد|مبيعات|تحويل|احتفاظ|churn|revenue|conversion|retention|مقياس|metric)/i },
  { tool: 'memory', pattern: /(سبق|سابق|جرّبنا|جربنا|قبل|آخر مرة|last time|previously|already tried)/i },
  { tool: 'anomaly', pattern: /(شاذ|شواذ|شذوذ|قفزة|قفزات|انخفاض مفاجئ|anomal|outlier|spike|drop)/i },
  { tool: 'dossier', pattern: /(جودة|نظافة|مكرّر|مكرر|مفقود|quality|duplicate|missing|clean)/i },
  { tool: 'pii', pattern: /(خصوصية|شخصي|بيانات حساسة|pii|privacy|email|هاتف)/i },
  { tool: 'rigor', pattern: /(معنوي|دلالة|فرق|أفضل|افضل|significant|p-value|ثقة|confidence)/i },
  { tool: 'experiment', pattern: /(a\/b|اختبار|تجربة|experiment|test group|تحويل)/i },
  { tool: 'scenario', pattern: /(ماذا لو|what if|رفعنا|خفضنا|سعر|price|سيناريو|scenario)/i },
  { tool: 'lineage', pattern: /(احذف|حذف|أعمدة|عمود|schema|lineage|ينكسر|break|rename)/i },
  { tool: 'workflow', pattern: /(أتمت|اتمت|workflow|سير العمل|automation|جدول|schedule)/i },
  { tool: 'eval', pattern: /(دقة|تقييم|accuracy|evaluation|golden|انحدار|regression)/i },
  { tool: 'weekly', pattern: /(أسبوع|اسبوع|weekly|week over week|تقرير الأسبوع)/i },
  { tool: 'explain-model', pattern: /(نموذج|ميزات|features|model|importance|تفسير|explain)/i },
  { tool: 'arbiter', pattern: /(تعارض|متناقض|رقمان|conflict|contradict|disagree)/i },
  { tool: 'onboarding', pattern: /(ابدأ|من أين أبدأ|start|onboard|أول مرة|first time)/i },
  { tool: 'proof', pattern: /(أثبت|اثبت|من أين|مصدر|prove|source|evidence|دليل)/i },
  { tool: 'chart-critic', pattern: /(مخطط|رسم|chart|plot|visuali[sz])/i },
  { tool: 'cross-check', pattern: /(تحقّق|تحقق|cross.?check|verify|مطابق)/i },
];

/** الأدوات المُشغَّلة تلقائيًا قبل الإجابة، بحدّ أقصى كي لا يثقل الطلب. */
export function detectAnalystTools(message: string, ctx: CopilotContext = { message: '' }, maxTools = 3): AnalystToolId[] {
  const hits = INTENT_RULES.filter((rule) => rule.pattern.test(message)).map((rule) => rule.tool);
  // الذاكرة والسياق الدلالي أولًا، فهما يغيّران معنى بقية النتائج.
  const priority: AnalystToolId[] = ['metrics', 'metric-conflicts', 'memory', 'clarify'];
  const ordered = [
    ...priority.filter((t) => hits.includes(t)),
    ...hits.filter((t) => !priority.includes(t)),
  ];
  const withData = ordered.filter((tool) => {
    if (tool === 'dossier' || tool === 'pii' || tool === 'onboarding') return !!ctx.rows?.length;
    if (tool === 'anomaly') return !!ctx.series?.length || !!ctx.rows?.length;
    if (tool === 'chart-critic') return !!ctx.chartSpec;
    if (tool === 'experiment') return !!ctx.control && !!ctx.treatment;
    if (tool === 'cross-check') return !!ctx.crossCheck;
    if (tool === 'workflow') return !!ctx.workflow;
    if (tool === 'scenario') return !!ctx.scenario;
    if (tool === 'explain-model') return !!ctx.modelFeatures?.length;
    if (tool === 'weekly') return !!ctx.signals?.length;
    if (tool === 'arbiter') return !!ctx.claims?.length;
    if (tool === 'lineage') return true;
    return true;
  });
  return Array.from(new Set(withData)).slice(0, maxTools);
}

/** كل أسماء الأدوات — للعرض والتوثيق في الواجهة والتعليمات. */
export const ANALYST_TOOL_IDS: AnalystToolId[] = [
  'metrics', 'metric-conflicts', 'cross-check', 'dossier', 'memory',
  'anomaly', 'rigor', 'experiment', 'clarify', 'proof',
  'chart-critic', 'scenario', 'lineage', 'workflow', 'eval',
  'pii', 'onboarding', 'arbiter', 'weekly', 'explain-model',
];

const TOOL_LABELS: Record<AnalystToolId, string> = {
  metrics: 'المقياس المعتمد',
  'metric-conflicts': 'تعارض تعريفات',
  'cross-check': 'تحقّق مسار مزدوج',
  dossier: 'تدقيق جودة البيانات',
  memory: 'ذاكرة التحليلات',
  anomaly: 'كشف الشذوذ',
  rigor: 'الصرامة الإحصائية',
  experiment: 'قراءة تجربة',
  clarify: 'توضيح الغموض',
  proof: 'سلسلة الإثبات',
  'chart-critic': 'نقد التمثيل',
  scenario: 'سيناريو',
  lineage: 'أثر تغيير المخطط',
  workflow: 'موثوقية الأتمتة',
  eval: 'تقييم الجودة',
  pii: 'حاجز الخصوصية',
  onboarding: 'بداية التحليل',
  arbiter: 'الحكم بين تحليلين',
  weekly: 'السرد الأسبوعي',
  'explain-model': 'تفسير النموذج',
};

export function toolLabel(tool: AnalystToolId): string {
  return TOOL_LABELS[tool] ?? tool;
}

/** تنفيذ أداة واحدة — كل الأدوات تُرجع دليلًا أو null إن لم يكن لها ما تقوله. */
export function runAnalystTool(tool: AnalystToolId, ctx: CopilotContext): CopilotEvidence | null {
  try {
    switch (tool) {
      case 'metrics': {
        const metrics = ctx.metrics || [];
        if (!metrics.length) return null;
        const resolution = resolveQuestion(ctx.message, metrics);
        if (resolution.chosen) {
          return {
            tool, title: `المقياس المعتمد: ${resolution.chosen.name}`, tone: 'ok',
            summary: `الصيغة ${resolution.chosen.formula} • الحبيبية ${resolution.chosen.grain}`,
            details: [
              ...(resolution.chosen.requiredFilters.length ? [`فلاتر إلزامية: ${resolution.chosen.requiredFilters.join(' AND ')}`] : []),
              ...resolution.chosen.caveats.map((c) => `تحذير: ${c}`),
            ],
            data: resolution.chosen,
          };
        }
        if (resolution.matches.length > 1) {
          return {
            tool, title: 'أي تعريف تقصد؟', tone: 'warn',
            summary: resolution.reason,
            details: resolution.matches.slice(0, 3).map((m) => `${m.metric.name} = ${m.metric.formula} (${m.metric.grain})`),
          };
        }
        return null;
      }
      case 'metric-conflicts': {
        const conflicts = detectMetricConflicts(ctx.metrics || []);
        if (!conflicts.length) return null;
        return {
          tool, title: `تعارض تعريفات (${conflicts.length})`, tone: 'warn',
          summary: conflicts[0].note,
          details: conflicts.slice(0, 3).map((c) => `${c.name}: ${c.differingFields.join('، ')}`),
          data: conflicts,
        };
      }
      case 'cross-check': {
        if (!ctx.crossCheck) return null;
        const report = crossCheckResults(ctx.crossCheck.a, ctx.crossCheck.b);
        return {
          tool, title: 'تحقّق المسار المزدوج', tone: report.status === 'agree' ? 'ok' : 'bad',
          summary: report.verdict,
          details: report.findings.map((f) => f.detail),
          data: report,
        };
      }
      case 'dossier': {
        if (!ctx.rows?.length) return null;
        const dossier = buildDossier(ctx.rows, { target: ctx.targetColumn });
        const critical = dossier.issues.filter((i) => i.severity === 'critical' || i.severity === 'high');
        return {
          tool, title: `جودة البيانات ${dossier.qualityScore}/100`, tone: dossier.qualityScore >= 80 ? 'ok' : dossier.qualityScore >= 55 ? 'warn' : 'bad',
          summary: dossier.summary,
          details: critical.slice(0, 4).map((i) => `${i.title} — ${i.why}`),
          data: { qualityScore: dossier.qualityScore, issues: dossier.issues.slice(0, 6) },
        };
      }
      case 'memory': {
        const entries = ctx.memory || [];
        if (!entries.length) return null;
        const hits = rankMemory(ctx.message, entries, 3).filter((h) => h.score >= 0.2);
        const warnings = memoryWarnings(ctx.message, entries);
        if (!hits.length && !warnings.length) return null;
        return {
          tool, title: 'ذاكرة التحليلات', tone: warnings.length ? 'warn' : 'info',
          summary: warnings[0]?.message || `تشابه مع ${hits.length} تحليل سابق — اربط الجواب به ولا تقدّمه كأنه جديد.`,
          details: hits.map((h) => `${h.entry.question} → ${h.entry.answer.slice(0, 120)}`),
          data: { hits, warnings },
        };
      }
      case 'anomaly': {
        const series = ctx.series?.length
          ? ctx.series
          : numericSeriesFromRows(ctx.rows || []);
        if (!series || series.length < 5) return null;
        const report = detectAnomalies(series, 7);
        if (!report.points.length) {
          return { tool, title: 'لا شذوذ', tone: 'ok', summary: report.summary, details: [] };
        }
        const attribution = ctx.rows?.length ? attributeFromRows(ctx.rows) : undefined;
        return {
          tool, title: `شذوذ: ${report.points.length} نقطة`, tone: 'bad',
          summary: report.summary,
          details: [...report.points.slice(0, 3).map((p) => p.explanation), ...(attribution ? [attribution.narrative] : [])],
          data: { report, attribution },
        };
      }
      case 'rigor': {
        const findings = lintClaims(ctx.message, { design: 'observational' });
        if (!findings.length) return null;
        return {
          tool, title: 'تدقيق العبارة', tone: 'warn',
          summary: findings[0].message,
          details: findings.map((f) => `بديل: ${f.rewrite}`),
          data: findings,
        };
      }
      case 'experiment': {
        if (!ctx.control || !ctx.treatment) return null;
        const readout = readExperiment(ctx.control, ctx.treatment, ctx.guardrails || []);
        return {
          tool, title: `قراءة التجربة: ${readout.verdict}`, tone: readout.verdict === 'ship' ? 'ok' : readout.verdict === 'invalid' || readout.verdict === 'stop' ? 'bad' : 'warn',
          summary: readout.headline,
          details: [readout.primary.message, ...readout.guardrails.filter((g) => g.breached).map((g) => g.message), readout.peekingNote],
          data: readout,
        };
      }
      case 'clarify': {
        const plan = planClarification(ctx.message, { maxQuestions: 1 });
        if (!plan.needsClarification) return null;
        return {
          tool, title: 'قبل الحساب: توضيح واحد', tone: 'warn',
          summary: plan.prompt || plan.questions[0].question,
          details: [`الخيارات: ${plan.questions[0].options.join(' | ')}`, `إن لم يُجب: ${plan.questions[0].defaultAssumption}`],
          data: plan,
        };
      }
      case 'proof': {
        const rows = ctx.rows || [];
        const metric = ctx.metrics?.[0];
        const card = buildProofChain({
          metricName: metric?.name || 'المقياس',
          value: rows.length ? meanOfNumeric(rows) : 0,
          formula: metric?.formula,
          grain: metric?.grain,
          filters: ctx.lastQuery?.filters,
          sql: ctx.lastQuery?.sql,
          source: { datasetName: ctx.datasetName, rows: ctx.datasetRowCount },
          updatedAt: ctx.lastQuery?.updatedAt ?? null,
        });
        const readiness = proofReadiness(card);
        return {
          tool, title: 'سلسلة إثبات', tone: readiness.ready ? 'ok' : 'warn',
          summary: readiness.reason,
          details: [card.shareText.slice(0, 400)],
          data: card,
        };
      }
      case 'chart-critic': {
        if (!ctx.chartSpec) return null;
        const verdict = critiqueChart(ctx.chartSpec);
        return {
          tool, title: `نقد التمثيل ${verdict.score}/100`, tone: verdict.score >= 80 ? 'ok' : 'warn',
          summary: verdict.summary,
          details: verdict.findings.map((f) => `${f.issue} — ${f.fix}`),
          data: verdict,
        };
      }
      case 'scenario': {
        if (!ctx.scenario) return null;
        const result = simulateScenario(ctx.scenario);
        return {
          tool, title: 'نتيجة السيناريو', tone: 'info',
          summary: result.narrative,
          details: [...result.assumptions, ...result.warnings],
          data: result,
        };
      }
      case 'lineage': {
        const artifacts = ctx.artifacts || [];
        if (!artifacts.length) return null;
        const table = guessTable(ctx.message, artifacts);
        if (!table) return null;
        const report = analyzeImpact({ table, change: /حذف|drop/i.test(ctx.message) ? 'drop-table' : 'drop-column' }, artifacts);
        return {
          tool, title: 'أثر تغيير المخطط', tone: report.verdict === 'safe' ? 'ok' : report.verdict === 'risky' ? 'warn' : 'bad',
          summary: report.headline,
          details: report.impacted.slice(0, 3).map((i) => `${i.artifact.name}: ${i.reason}`),
          data: report,
        };
      }
      case 'workflow': {
        if (!ctx.workflow) return null;
        const plan = validateWorkflow(ctx.workflow);
        const dryRun = dryRunPlan(ctx.workflow, 100);
        return {
          tool, title: plan.valid ? 'الأتمتة صالحة' : 'الأتمتة غير صالحة', tone: plan.valid ? 'ok' : 'bad',
          summary: plan.summary,
          details: [...plan.issues.map((i) => `${i.message} — ${i.fix}`), ...dryRun.warnings],
          data: { plan, dryRun },
        };
      }
      case 'eval': {
        const cases = ctx.golden || [];
        if (!cases.length) return null;
        const report = runEvaluation(cases);
        const router = routeTask('reasoning', 0.5);
        return {
          tool, title: `دقة المساعد ${report.accuracy}%`, tone: report.accuracy >= 80 ? 'ok' : 'warn',
          summary: report.summary,
          details: [report.failures.slice(0, 3).map((f) => `${f.caseId}: ${f.detail}`).join(' | '), `التوجيه: ${router.model} — ${router.reason}`].filter(Boolean),
          data: report,
        };
      }
      case 'pii': {
        if (!ctx.rows?.length) return null;
        const decision = evaluateGate(ctx.rows, { allowExternalWithPii: false, maxRows: 200 });
        if (!decision.findings.length) return null;
        return {
          tool, title: `بيانات شخصية (${decision.findings.length} عمودًا)`, tone: 'warn',
          summary: decision.reason,
          details: [decision.requiredAction || 'لا إجراء إضافي.', `أعمدة مستبعدة: ${decision.droppedColumns.join('، ') || 'لا شيء'}`],
          data: decision,
        };
      }
      case 'onboarding': {
        if (!ctx.rows?.length) return null;
        const columns = Object.keys(ctx.rows[0]).map((name) => profileColumn(name, ctx.rows!));
        const brief = buildOnboardingBrief({ rowCount: ctx.datasetRowCount || ctx.rows.length, columns, datasetName: ctx.datasetName });
        return {
          tool, title: 'من أين نبدأ', tone: 'info',
          summary: brief.headline,
          details: brief.insights.slice(0, 3).map((i) => `${i.headline} — ${i.detail}`),
          data: brief,
        };
      }
      case 'arbiter': {
        if (!ctx.claims || ctx.claims.length < 2) return null;
        const result = arbitrate(ctx.claims[0], ctx.claims[1]);
        return {
          tool, title: `الحكم: ${result.verdict}`, tone: result.verdict === 'contradiction' ? 'bad' : result.verdict === 'explainable' ? 'info' : 'ok',
          summary: result.headline,
          details: [...result.explanations, result.resolution],
          data: result,
        };
      }
      case 'weekly': {
        if (!ctx.signals?.length) return null;
        const report = buildWeeklyReport(ctx.signals, [], 'هذا الأسبوع');
        return {
          tool, title: 'السرد الأسبوعي', tone: 'info',
          summary: report.narrative,
          details: report.recommendations.map((r) => `${r.action} (أثر ${r.expectedImpact})`),
          data: report,
        };
      }
      case 'explain-model': {
        if (!ctx.modelFeatures?.length) return null;
        const explanation = explainModel({
          target: ctx.modelTarget || 'الهدف',
          task: 'classification',
          features: ctx.modelFeatures,
          rows: ctx.datasetRowCount,
        });
        return {
          tool, title: explanation.headline, tone: 'info',
          summary: explanation.paragraphs[0] || '',
          details: explanation.cautions,
          data: explanation,
        };
      }
      default:
        return null;
    }
  } catch {
    // أدوات المساعد لا تُسقط المحادثة أبدًا: فشل أداة = غياب دليل فقط.
    return null;
  }
}

export function runAnalystTools(tools: AnalystToolId[], ctx: CopilotContext): CopilotEvidence[] {
  const seen = new Set<AnalystToolId>();
  const out: CopilotEvidence[] = [];
  for (const tool of tools) {
    if (seen.has(tool)) continue;
    seen.add(tool);
    const evidence = runAnalystTool(tool, ctx);
    if (evidence) out.push(evidence);
  }
  return out;
}

/** متوسط أول عمود رقمي — يُستخدم لسلسلة الإثبات التلقائية فقط. */
function meanOfNumeric(rows: Array<Record<string, unknown>>): number {
  const first = rows[0] ? Object.keys(rows[0]) : [];
  for (const col of first) {
    const values = rows.map((r) => Number(r[col])).filter((v) => Number.isFinite(v));
    if (values.length >= Math.max(2, rows.length * 0.6)) {
      return values.reduce((s, v) => s + v, 0) / values.length;
    }
  }
  return 0;
}

function numericSeriesFromRows(rows: Array<Record<string, unknown>>): Array<{ label: string; value: number }> | null {
  if (rows.length < 5) return null;
  const keys = Object.keys(rows[0] || {});
  const numericCol = keys.find((k) => rows.filter((r) => Number.isFinite(Number(r[k]))).length >= rows.length * 0.8);
  if (!numericCol) return null;
  return rows.map((r, i) => ({ label: String(r[keys[0]] ?? `#${i + 1}`), value: Number(r[numericCol]) }));
}

function attributeFromRows(rows: Array<Record<string, unknown>>) {
  const keys = Object.keys(rows[0] || {});
  if (keys.length < 2) return null;
  const dimension = keys[0];
  const measure = keys.find((k) => rows.every((r) => Number.isFinite(Number(r[k]))));
  if (!measure) return null;
  const half = Math.floor(rows.length / 2);
  const bucket = (slice: Array<Record<string, unknown>>) => {
    const map = new Map<string, number>();
    for (const r of slice) {
      const key = String(r[dimension] ?? '—');
      map.set(key, (map.get(key) || 0) + Number(r[measure]));
    }
    return map;
  };
  const base = bucket(rows.slice(0, half));
  const current = bucket(rows.slice(half));
  const allKeys = new Set([...base.keys(), ...current.keys()]);
  return attributeChange(
    Array.from(allKeys).map((value) => ({ dimension, value, baseline: base.get(value) || 0, current: current.get(value) || 0 })),
    dimension
  );
}

function guessTable(message: string, artifacts: Artifact[]): string | null {
  const tables = new Set(artifacts.flatMap((a) => a.reads.map((r) => r.table)));
  for (const table of tables) if (message.toLowerCase().includes(table.toLowerCase())) return table;
  return tables.values().next().value || null;
}

/** طلب أداة من النموذج داخل ردّه. */
export interface ToolRequest {
  tool: AnalystToolId;
  args?: Record<string, unknown>;
  reason?: string;
}

export function extractToolRequests(reply: string): ToolRequest[] {
  const requests: ToolRequest[] = [];
  const blocks = String(reply || '').match(/```json\s*([\s\S]*?)```/gi) || [];
  for (const block of blocks) {
    const body = block.replace(/```json/i, '').replace(/```$/, '').trim();
    try {
      const parsed = JSON.parse(body);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (item?.action === 'ANALYST_TOOL' && ANALYST_TOOL_IDS.includes(item.tool)) {
          requests.push({ tool: item.tool, args: item.args || {}, reason: item.reason });
        }
      }
    } catch {
      // كتلة JSON غير صالحة: تُترك للنموذج كما هي ولا تُعطّل الرد.
    }
  }
  return requests;
}

/** إزالة كتل طلب الأدوات من النص المعروض للمستخدم. */
export function stripToolRequests(reply: string): string {
  return String(reply || '').replace(/```json\s*([\s\S]*?)```/gi, (block) => {
    try {
      const parsed = JSON.parse(block.replace(/```json/i, '').replace(/```$/, '').trim());
      const items = Array.isArray(parsed) ? parsed : [parsed];
      return items.some((i: any) => i?.action === 'ANALYST_TOOL') ? '' : block;
    } catch {
      return block;
    }
  }).trim();
}

/** ما يُحقن في تعليمات النظام: كيف يستخدم الأدوات وقواعد الصدق. */
export function copilotAnalystInstructions(language: 'ar' | 'en' = 'ar'): string {
  const list = ANALYST_TOOL_IDS.map((t) => `- ${t}: ${TOOL_LABELS[t]}`).join('\n');
  const ar = `أنت محلل بيانات خبير، وتُجيب من محرّكات حقيقية لا من التخمين.

أدوات محلل متاحة (النتائج تُحقن لك تحت «أدلة محسوبة»):
${list}

قواعد إلزامية:
1) لا تذكر رقمًا لا يوجد في الأدلة أو في بيانات المجموعة النشطة. إن لم يتوفر دليل، قل ما ينقصك.
2) إن ذكرت مقياسًا، اذكر تعريفه (الصيغة والحبيبية) وتحذيراته من طبقة المقاييس.
3) لا لغة سببية من بيانات رصدية: قل «يرتبط» لا «يؤدي إلى» إلا في تجربة.
4) عند الغموض (فترة، حبيبية، مرتجعات، عملة) اسأل **سؤالًا واحدًا** بخيارات، وأعلن أي افتراض اتخذته.
5) عند مقارنة، اذكر n والفترة، وحذّر إن كان الأثر أصغر من الحد الأدنى القابل للكشف.
6) عند نقد مخطط، اذكر الخطأ والأثر البصري والإصلاح.
7) لا تُرسل بيانات شخصية خارجيًا؛ اقترح التقنيع أو النموذج المحلي.
8) إن احتجت حسابًا غير محسوب لك، أخرج في نهاية ردّك كتلة واحدة:
\`\`\`json
{"action":"ANALYST_TOOL","tool":"anomaly","args":{"series":[{"label":"d1","value":100}]}}
\`\`\`
وسأتولّى تنفيذها وإعادة النتيجة.
9) اربط الإجابة بذاكرة التحليلات حين تظهر، ولا تُقدّم قديمًا كأنه جديد.
10) اجعل الخلاصة أولًا، ثم الأدلة، ثم الخطوة التالية.`;
  if (language === 'ar') return ar;
  return `You are an expert data analyst answering from real engines, not guesses.
Available analyst tools: ${ANALYST_TOOL_IDS.join(', ')}.
Rules: never state a number absent from computed evidence; cite metric definitions and caveats; use association not causation for observational data; ask one clarifying question with options when ambiguous and declare assumptions; report n and confidence; critique misleading charts; never send PII off-machine; if you need a computation emit {"action":"ANALYST_TOOL","tool":"anomaly","args":{...}} at the end.`;
}

/** كتلة الأدلة التي تُضاف إلى تعليمات النظام. */
export function formatEvidenceForPrompt(evidence: CopilotEvidence[]): string {
  if (!evidence.length) return 'أدلة محسوبة: لا شيء (لا تُبدِ أرقامًا من عندك).';
  const lines = ['أدلة محسوبة من محرّكات المنصة (استخدمها ولم تُخالفها):'];
  for (const item of evidence) {
    lines.push(`- [${item.tool}] ${item.title}: ${item.summary}`);
    for (const detail of item.details.slice(0, 4)) lines.push(`    · ${detail}`);
  }
  return lines.join('\n');
}

/** اقتراحات أسئلة مبنية على الأدلة الفعلية لا على نص جاهز. */
export function evidenceSuggestions(evidence: CopilotEvidence[], language: 'ar' | 'en' = 'ar'): string[] {
  const suggestions: string[] = [];
  const byTool = new Map(evidence.map((e) => [e.tool, e]));
  if (byTool.has('clarify')) suggestions.push(language === 'ar' ? 'اعتمد آخر 30 يومًا وأجب' : 'Use last 30 days and answer');
  if (byTool.has('metrics')) suggestions.push(language === 'ar' ? 'اعرض المقياس مع تحذيراته في تقرير' : 'Add this metric with caveats to a report');
  if (byTool.has('anomaly')) suggestions.push(language === 'ar' ? 'أي بُعد صنع هذا الشذوذ؟' : 'Which dimension drove this anomaly?');
  if (byTool.has('dossier')) suggestions.push(language === 'ar' ? 'أصلح المشكلات الحرجة فقط وأعد التقرير' : 'Fix only critical issues and rerun');
  if (byTool.has('pii')) suggestions.push(language === 'ar' ? 'شغّل التحليل على النسخة المقنّعة' : 'Run the analysis on the masked copy');
  if (byTool.has('experiment')) suggestions.push(language === 'ar' ? 'كم زائرًا إضافيًا لنتيجة حاسمة؟' : 'How many more visitors for a decisive result?');
  if (byTool.has('memory')) suggestions.push(language === 'ar' ? 'قارن الحالي بنتيجة المرة الماضية' : 'Compare with the previous result');
  if (byTool.has('chart-critic')) suggestions.push(language === 'ar' ? 'أعد رسمه بالتمثيل المقترح' : 'Redraw using the suggested encoding');
  if (!suggestions.length) {
    suggestions.push(
      language === 'ar' ? 'افحص جودة البيانات النشطة' : 'Audit the active dataset quality',
      language === 'ar' ? 'هل توجد قيم شاذة هذا الأسبوع؟' : 'Any anomalies this week?',
      language === 'ar' ? 'أثبت الرقم الأخير بمصدره' : 'Prove the last number with its source'
    );
  }
  return suggestions.slice(0, 3);
}

/** وصف مختصر للواجهة: أي أدوات عملت. */
export function evidenceBadges(evidence: CopilotEvidence[]): string[] {
  return Array.from(new Set(evidence.map((e) => `${toolLabel(e.tool)}`))).slice(0, 6);
}
