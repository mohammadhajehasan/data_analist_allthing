/**
 * مسارات «الذكاء التحليلي» — الواجهة الوحيدة لصفحة Intelligence.
 *
 * لماذا ملف مستقل: server.ts كبير، وكل ما تحتاجه هذه المسارات هو دالة
 * المصادقة وحده؛ نمرّرها كاعتمادية فلا تنشأ دورة import ولا تتضخم الملفات.
 *
 * القاعدة: الحساب الثقيل في محرّكات مستقلة (server/analyst/*) والمسارات هنا
 * رقيقة — استقبال، تحقّق، ثم إرجاع نتيجة المحرّك. ما يحتاج حفظًا يمرّ بالمخزن.
 */

import type { Express, Request } from 'express';
import {
  analystOverview,
  addMemory,
  deleteArtifact,
  deleteGolden,
  deleteMemory,
  deleteMetric,
  deleteProof,
  listArtifacts,
  listEvalSnapshots,
  listGolden,
  listMemory,
  listMetrics,
  listProofs,
  listRuns,
  recordRun,
  saveArtifact,
  saveEvalSnapshot,
  saveMetric,
  saveProof,
  upsertGolden,
} from './analyst/store';
import {
  MAX_ANALYST_ROWS,
  capRows,
  labelColumns,
  listDatasetSummaries,
  loadDatasetSource,
  numericColumns,
  seriesFromSource,
} from './analyst/sources';
import { consumeAnalystBudget } from './analyst/guard';
import {
  createMonitor,
  deleteMonitor,
  listMonitors,
  runMonitorSweep,
  setMonitorEnabled,
} from './analyst/monitors';
import { evaluateGate, type GatePolicy } from './analyst/piiGate';
import { pushNotification } from './notifications';
import {
  detectMetricConflicts,
  normalizeMetric,
  resolveQuestion,
  validateMetric,
  type MetricDefinition,
} from './analyst/metricSemantics';
import { crossCheckResults, type QueryResultSet } from './analyst/sqlCrossCheck';
import { buildDossier } from './analyst/dataDossier';
import { rankMemory, memoryWarnings, memoryContextBlock } from './analyst/analystMemory';
import { attributeChange, detectAnomalies, anomalyDigest } from './analyst/anomalyAgent';
import { lintClaims, meanConfidenceInterval, minimumDetectableEffect, twoProportionTest, srmCheck } from './analyst/statRigor';
import { readExperiment, visitorsNeeded, type GuardrailMetric } from './analyst/sequentialTest';
import { planClarification, assumptionsFooter } from './analyst/clarifier';
import { buildProofChain, proofReadiness } from './analyst/proofChain';
import { critiqueChart } from './analyst/chartCritic';
import { estimateElasticity, simulateScenario } from './analyst/scenarioSim';
import { analyzeImpact } from './analyst/lineageImpact';
import { dryRunPlan, explainFailure, idempotencyKey, validateWorkflow } from './analyst/workflowReliability';
import { compareRuns, routeTask, runEvaluation } from './analyst/evalHarness';
import { buildOnboardingBrief } from './analyst/firstTenMinutes';
import { arbitrate, recommendCanonical } from './analyst/arbiter';
import { buildWeeklyReport } from './analyst/weeklyNarrative';
import { explainModel } from './analyst/modelExplanation';

type AuthUser = { id: string; email?: string; role?: string };
type AuthResolver = (req: Request) => Promise<AuthUser | null>;

interface Deps {
  authUserFromReq: AuthResolver;
}

const str = (v: unknown): string => String(v ?? '');
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const num = (v: unknown, fallback = NaN): number => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/**
 * ملخّص مقروء يستخرج أشهر حقل «خلاصة» في استجابات المحلّل — كي يقرأ المستخدم
 * سجله بجملة، لا بـ JSON خام.
 */
function describePayload(payload: any): string {
  if (!payload || typeof payload !== 'object') return '';
  const candidates = [
    payload.report?.summary,
    payload.dossier?.summary,
    payload.verdict?.summary,
    payload.decision?.reason,
    payload.result?.narrative,
    payload.readout?.headline,
    payload.arbitration?.headline,
    payload.plan?.summary,
    payload.explanation?.headline,
    payload.report?.accuracy !== undefined ? `دقة ${payload.report.accuracy}%` : '',
    payload.metric?.name ? `مقياس: ${payload.metric.name}` : '',
    payload.entry?.question ? `ذاكرة: ${payload.entry.question}` : '',
    payload.monitor ? `مراقب: ${payload.monitor.datasetName || ''} / ${payload.monitor.valueColumn || ''}` : '',
    payload.monitors ? `مراقبات: ${payload.monitors.length}` : '',
    payload.sweep ? `فحص ${payload.sweep.checked} مراقبًا — ${payload.sweep.triggered} تنبيه` : '',
    payload.proof ? `بطاقة إثبات: ${payload.proof.metricName || ''}` : '',
    payload.proofs ? `بطاقات محفوظة: ${payload.proofs.length}` : '',
    payload.datasets ? `مجموعات: ${payload.datasets.length}` : '',
    payload.ok ? 'تم' : '',
  ];
  const first = candidates.find((v) => typeof v === 'string' && v.trim());
  return first ? String(first).slice(0, 300) : JSON.stringify(payload).slice(0, 200);
}

/** اسم الأداة من نمط المسار: /api/analyst/memory/:id → memory/*. */
function toolFromReq(req: Request): string {
  const pattern = String((req as any).route?.path || req.path || '');
  return pattern.replace(/^\/api\/analyst\/?/, '').replace(/\/[^/]+$/, '/*') || 'overview';
}

/** تسجيل كل المسارات تحت /api/analyst — كلها محميّة بالجلسة. */
export function registerAnalystRoutes(app: Express, deps: Deps): void {
  const guard = async (req: Request, res: any): Promise<AuthUser | null> => {
    const user = await deps.authUserFromReq(req);
    if (!user) res.status(401).json({ error: 'جلسة غير صالحة — سجّل الدخول أولاً' });
    return user;
  };
  const wrap = (handler: (req: Request, res: any, user: AuthUser) => Promise<void> | void) =>
    async (req: Request, res: any) => {
      const user = await guard(req, res);
      if (!user) return;
      // الحساب الثقيل نافذة أَضيق من القراءة، والفشل صريح برأس Retry-After.
      const heavy = req.method !== 'GET';
      const budget = consumeAnalystBudget(user.id, heavy ? 'compute' : 'read', 1, heavy ? 45 : 150, 60_000);
      if (!budget.ok) {
        res.setHeader('Retry-After', String(Math.ceil(budget.retryAfterMs / 1000)));
        return res.status(429).json({
          error: `طلبات كثيرة — أعد المحاولة بعد ${Math.ceil(budget.retryAfterMs / 1000)} ثانية.`,
          retryAfterMs: budget.retryAfterMs,
        });
      }
      const started = Date.now();
      const originalJson = res.json.bind(res);
      // سجل التشغيل يُكتب مرة واحدة لكل استجابة، مع الحالة والزمن والخلاصة.
      res.json = (payload: any) => {
        void recordRun(user.id, {
          tool: toolFromReq(req),
          status: res.statusCode,
          summary: describePayload(payload) || (res.statusCode >= 400 ? 'فشل' : 'تم'),
          latencyMs: Date.now() - started,
          payload: res.statusCode >= 400 ? payload : undefined,
        }).catch(() => undefined);
        return originalJson(payload);
      };
      try {
        await handler(req, res, user);
      } catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
      }
    };

  // -------------------------------------------------------------------------
  // نظرة عامة + المقاييس (#1، #20)
  // -------------------------------------------------------------------------
  app.get('/api/analyst/overview', wrap(async (_req, res, user) => {
    res.json({ overview: await analystOverview(user.id) });
  }));

  app.get('/api/analyst/metrics', wrap(async (_req, res, user) => {
    const metrics = await listMetrics(user.id);
    res.json({ metrics, conflicts: detectMetricConflicts(metrics) });
  }));

  app.post('/api/analyst/metrics', wrap(async (req, res, user) => {
    const input = req.body?.metric as MetricDefinition | undefined;
    if (!input) return res.status(400).json({ error: 'metric مطلوب' });
    const errors = validateMetric(input);
    if (errors.length) return res.status(400).json({ error: errors.join('؛ '), errors });
    const saved = await saveMetric(user.id, normalizeMetric(input));
    res.status(201).json({ metric: saved });
  }));

  app.delete('/api/analyst/metrics/:id', wrap(async (req, res, user) => {
    const ok = await deleteMetric(user.id, str(req.params.id));
    res.status(ok ? 200 : 404).json(ok ? { ok: true } : { error: 'المقياس غير موجود' });
  }));

  app.post('/api/analyst/metrics/resolve', wrap(async (req, res, user) => {
    const question = str(req.body?.question);
    if (!question) return res.status(400).json({ error: 'question مطلوب' });
    const metrics = await listMetrics(user.id);
    res.json({ resolution: resolveQuestion(question, metrics) });
  }));

  // -------------------------------------------------------------------------
  // تحقّق SQL المزدوج (#2)
  // -------------------------------------------------------------------------
  app.post('/api/analyst/cross-check', wrap(async (req, res) => {
    const a = req.body?.a as QueryResultSet | undefined;
    const b = req.body?.b as QueryResultSet | undefined;
    if (!a?.columns || !b?.columns) return res.status(400).json({ error: 'a و b مطلوبان بصيغة {columns, rows}' });
    res.json({ report: crossCheckResults(a, b, { tolerance: num(req.body?.tolerance, 0.005) }) });
  }));

  // -------------------------------------------------------------------------
  // ملف تدقيق البيانات (#3)
  // -------------------------------------------------------------------------
  app.post('/api/analyst/dossier', wrap(async (req, res) => {
    const limited = capRows(arr<Record<string, unknown>>(req.body?.rows));
    if (!limited.rows.length) return res.status(400).json({ error: 'rows مطلوبة (مصفوفة كائنات)' });
    res.json({
      dossier: buildDossier(limited.rows, { target: req.body?.target ? str(req.body.target) : undefined }),
      truncated: limited.truncated,
      analyzedRows: limited.rows.length,
      maxRows: MAX_ANALYST_ROWS,
    });
  }));

  // -------------------------------------------------------------------------
  // الذاكرة (#4)
  // -------------------------------------------------------------------------
  app.get('/api/analyst/memory', wrap(async (_req, res, user) => {
    res.json({ entries: await listMemory(user.id) });
  }));

  app.post('/api/analyst/memory', wrap(async (req, res, user) => {
    const question = str(req.body?.question).trim();
    const answer = str(req.body?.answer).trim();
    if (!question || !answer) return res.status(400).json({ error: 'question و answer مطلوبان' });
    const entry = await addMemory(user.id, {
      question,
      answer,
      sql: req.body?.sql ? str(req.body.sql) : undefined,
      datasetId: req.body?.datasetId ? str(req.body.datasetId) : undefined,
      datasetName: req.body?.datasetName ? str(req.body.datasetName) : undefined,
      outcome: req.body?.outcome,
      tags: arr<string>(req.body?.tags),
    });
    res.status(201).json({ entry });
  }));

  app.delete('/api/analyst/memory/:id', wrap(async (req, res, user) => {
    const ok = await deleteMemory(user.id, str(req.params.id));
    res.status(ok ? 200 : 404).json(ok ? { ok: true } : { error: 'العنصر غير موجود' });
  }));

  app.post('/api/analyst/memory/search', wrap(async (req, res, user) => {
    const question = str(req.body?.question);
    if (!question) return res.status(400).json({ error: 'question مطلوب' });
    const entries = await listMemory(user.id);
    const hits = rankMemory(question, entries, num(req.body?.limit, 5));
    res.json({
      hits,
      warnings: memoryWarnings(question, entries, req.body?.currentValue !== undefined ? num(req.body.currentValue) : undefined),
      contextBlock: memoryContextBlock(question, entries),
    });
  }));

  // -------------------------------------------------------------------------
  // الشذوذ والإسناد (#5)
  // -------------------------------------------------------------------------
  app.post('/api/analyst/anomalies', wrap(async (req, res) => {
    const limited = capRows(arr<{ label: string; value: number }>(req.body?.series));
    const series = limited.rows.map((p) => ({ label: str(p.label), value: num(p.value, 0) }));
    if (!series.length) return res.status(400).json({ error: 'series مطلوبة [{label, value}]' });
    const report = detectAnomalies(series, num(req.body?.period, 7));
    const attribution = req.body?.attribution
      ? attributeChange(arr(req.body.attribution.rows), str(req.body.attribution.dimension) || 'dimension')
      : undefined;
    res.json({ report, attribution, digest: anomalyDigest(report, attribution) });
  }));

  // -------------------------------------------------------------------------
  // الصرامة الإحصائية (#6)
  // -------------------------------------------------------------------------
  app.post('/api/analyst/rigor', wrap(async (req, res) => {
    const values = arr<number>(req.body?.values).map((v) => num(v, NaN)).filter((v) => Number.isFinite(v));
    const text = str(req.body?.text);
    if (req.body?.proportions) {
      const p = req.body.proportions;
      const test = twoProportionTest(num(p.conversionsA), num(p.nA), num(p.conversionsB), num(p.nB));
      const mde = minimumDetectableEffect(num(p.conversionsA) / Math.max(1, num(p.nA)), num(p.nA));
      return res.json({
        test,
        mdePct: Number((mde * 100).toFixed(3)),
        findings: text ? lintClaims(text, { pValue: test.pValue, n: num(p.nA) + num(p.nB), effectPct: test.diffPct, mdePct: mde * 100, design: 'experiment' }) : [],
      });
    }
    if (values.length) {
      const interval = meanConfidenceInterval(values);
      const s = values.reduce((acc, v) => acc + v, 0) / values.length;
      const variance = values.length > 1 ? values.reduce((acc, v) => acc + (v - s) ** 2, 0) / (values.length - 1) : 0;
      return res.json({
        interval,
        mean: s,
        sd: Math.sqrt(variance),
        findings: text ? lintClaims(text, { n: values.length }) : [],
      });
    }
    if (text) return res.json({ findings: lintClaims(text, req.body?.context || {}) });
    res.status(400).json({ error: 'values أو proportions أو text مطلوب' });
  }));

  // -------------------------------------------------------------------------
  // التجارب المتسلسلة (#7)
  // -------------------------------------------------------------------------
  app.post('/api/analyst/experiment', wrap(async (req, res) => {
    const control = req.body?.control;
    const treatment = req.body?.treatment;
    if (!control || !treatment) return res.status(400).json({ error: 'control و treatment مطلوبان {name, visitors, conversions}' });
    const guardrails = arr<GuardrailMetric>(req.body?.guardrails);
    const readout = readExperiment(
      { name: str(control.name) || 'control', visitors: num(control.visitors), conversions: num(control.conversions) },
      { name: str(treatment.name) || 'treatment', visitors: num(treatment.visitors), conversions: num(treatment.conversions) },
      guardrails
    );
    const baseRate = num(control.conversions) / Math.max(1, num(control.visitors));
    res.json({
      readout,
      srm: srmCheck([num(control.visitors), num(treatment.visitors)], arr<number>(req.body?.expectedSplitPct)),
      visitorsFor10pct: visitorsNeeded(baseRate, 0.1),
    });
  }));

  // -------------------------------------------------------------------------
  // المُوضِّح (#8)
  // -------------------------------------------------------------------------
  app.post('/api/analyst/clarify', wrap(async (req, res) => {
    const question = str(req.body?.question);
    if (!question) return res.status(400).json({ error: 'question مطلوب' });
    const plan = planClarification(question, { maxQuestions: num(req.body?.maxQuestions, 1) });
    res.json({ plan, footer: assumptionsFooter(plan) });
  }));

  // -------------------------------------------------------------------------
  // سلسلة الإثبات (#9)
  // -------------------------------------------------------------------------
  app.post('/api/analyst/proof', wrap(async (req, res) => {
    const input = req.body?.proof;
    if (!input) return res.status(400).json({ error: 'proof مطلوب' });
    const card = buildProofChain(input);
    res.json({ card, readiness: proofReadiness(card) });
  }));

  // -------------------------------------------------------------------------
  // ناقد المخططات (#10)
  // -------------------------------------------------------------------------
  app.post('/api/analyst/chart-critic', wrap(async (req, res) => {
    const spec = req.body?.spec;
    if (!spec?.series?.length) return res.status(400).json({ error: 'spec مطلوب بصيغة {type, series, categories}' });
    res.json({ verdict: critiqueChart(spec) });
  }));

  // -------------------------------------------------------------------------
  // محاكي السيناريو (#11)
  // -------------------------------------------------------------------------
  app.post('/api/analyst/scenario', wrap(async (req, res) => {
    const input = req.body?.scenario;
    if (!input) return res.status(400).json({ error: 'scenario مطلوب' });
    const result = simulateScenario(input);
    const points = arr<{ price: number; units: number }>(req.body?.history);
    res.json({ result, estimatedElasticity: points.length ? estimateElasticity(points.map((p) => ({ price: num(p.price), units: num(p.units) }))) : null });
  }));

  // -------------------------------------------------------------------------
  // أثر تغيير المخطط (#12)
  // -------------------------------------------------------------------------
  app.get('/api/analyst/artifacts', wrap(async (_req, res, user) => {
    res.json({ artifacts: await listArtifacts(user.id) });
  }));

  app.post('/api/analyst/artifacts', wrap(async (req, res, user) => {
    const artifact = req.body?.artifact;
    if (!artifact?.name || !artifact?.kind) return res.status(400).json({ error: 'artifact مطلوب {name, kind, reads}' });
    res.status(201).json({ artifact: await saveArtifact(user.id, artifact) });
  }));

  app.delete('/api/analyst/artifacts/:id', wrap(async (req, res, user) => {
    const ok = await deleteArtifact(user.id, str(req.params.id));
    res.status(ok ? 200 : 404).json(ok ? { ok: true } : { error: 'الأثر غير موجود' });
  }));

  app.post('/api/analyst/artifacts/impact', wrap(async (req, res, user) => {
    const request = req.body?.impact;
    if (!request?.table || !request?.change) return res.status(400).json({ error: 'impact مطلوب {table, column?, change}' });
    const artifacts = await listArtifacts(user.id);
    res.json({ report: analyzeImpact(request, artifacts) });
  }));

  // -------------------------------------------------------------------------
  // موثوقية الأتمتة (#13)
  // -------------------------------------------------------------------------
  app.post('/api/analyst/workflow/validate', wrap(async (req, res) => {
    const spec = req.body?.workflow;
    if (!spec?.nodes) return res.status(400).json({ error: 'workflow مطلوب {nodes, edges}' });
    res.json({
      plan: validateWorkflow(spec),
      dryRun: dryRunPlan(spec, num(req.body?.sampleRows, 100)),
      idempotencyKey: spec.id ? idempotencyKey(str(spec.id), str(req.body?.runWindow) || new Date().toISOString().slice(0, 10), req.body?.inputs || {}) : null,
    });
  }));

  app.post('/api/analyst/workflow/explain', wrap(async (req, res) => {
    const spec = req.body?.workflow;
    if (!spec?.nodes || !req.body?.error) return res.status(400).json({ error: 'workflow و error مطلوبان' });
    res.json({ explanation: explainFailure(spec, str(req.body.error)) });
  }));

  // -------------------------------------------------------------------------
  // حاضنة التقييم (#14)
  // -------------------------------------------------------------------------
  app.get('/api/analyst/golden', wrap(async (_req, res, user) => {
    res.json({ cases: await listGolden(user.id) });
  }));

  app.post('/api/analyst/golden', wrap(async (req, res, user) => {
    const c = req.body?.case;
    if (!c?.question || c?.expected === undefined) return res.status(400).json({ error: 'case مطلوب {question, expected}' });
    res.status(201).json({ case: await upsertGolden(user.id, c) });
  }));

  app.delete('/api/analyst/golden/:id', wrap(async (req, res, user) => {
    const ok = await deleteGolden(user.id, str(req.params.id));
    res.status(ok ? 200 : 404).json(ok ? { ok: true } : { error: 'الحالة غير موجودة' });
  }));

  app.post('/api/analyst/golden/evaluate', wrap(async (req, res, user) => {
    const inline = arr<any>(req.body?.cases);
    const cases = inline.length ? inline : await listGolden(user.id);
    const report = runEvaluation(cases);
    // لقطة في كل تشغيل: بلا تاريخ لا يُعرف إن كان التعديل حسّن أم أفسد.
    const previous = await listEvalSnapshots(user.id, 1);
    const snapshot = await saveEvalSnapshot(user.id, {
      accuracy: report.accuracy,
      cases: cases.length,
      failures: report.failures?.length || 0,
      detail: report.failures?.slice(0, 10),
    });
    const prior = previous[0]?.accuracy;
    const delta = prior === undefined ? null : Number((report.accuracy - prior).toFixed(1));
    if (delta !== null && delta <= -5) {
      await pushNotification(
        user.id,
        'analyst_eval',
        'انحدار في دقة المساعد',
        `الدقة الآن ${report.accuracy}% مقابل ${prior}% في التشغيل السابق (${delta} نقطة).`,
        { accuracy: report.accuracy, prior, delta }
      ).catch(() => undefined);
    }
    res.json({
      report,
      router: routeTask((req.body?.task || 'reasoning') as any, num(req.body?.complexity, 0.5)),
      snapshot,
      trend: { prior: prior ?? null, delta, regression: delta !== null && delta <= -5 },
    });
  }));

  app.post('/api/analyst/golden/compare', wrap(async (req, res) => {
    const before = arr<any>(req.body?.before);
    const after = arr<any>(req.body?.after);
    if (!before.length || !after.length) return res.status(400).json({ error: 'before و after مطلوبان' });
    res.json({ report: compareRuns(before, after) });
  }));

  // -------------------------------------------------------------------------
  // حاجز الخصوصية (#15)
  // -------------------------------------------------------------------------
  app.post('/api/analyst/pii-gate', wrap(async (req, res) => {
    const limited = capRows(arr<Record<string, unknown>>(req.body?.rows));
    if (!limited.rows.length) return res.status(400).json({ error: 'rows مطلوبة' });
    const policy = req.body?.policy || { allowExternalWithPii: false, maxRows: 500 };
    res.json({ decision: evaluateGate(limited.rows, policy), truncated: limited.truncated });
  }));

  // -------------------------------------------------------------------------
  // أول 10 دقائق (#16)
  // -------------------------------------------------------------------------
  app.post('/api/analyst/onboarding', wrap(async (req, res) => {
    const profile = req.body?.profile;
    if (!profile?.columns) return res.status(400).json({ error: 'profile مطلوب {rowCount, columns}' });
    res.json({ brief: buildOnboardingBrief(profile) });
  }));

  // -------------------------------------------------------------------------
  // المحكّم (#17)
  // -------------------------------------------------------------------------
  app.post('/api/analyst/arbitrate', wrap(async (req, res) => {
    const a = req.body?.a;
    const b = req.body?.b;
    if (!a || !b) return res.status(400).json({ error: 'a و b مطلوبان (تحليلان برقم لكل منهما)' });
    const arbitration = arbitrate(a, b);
    const claims = arr<any>(req.body?.claims);
    const canonical = req.body?.canonical;
    res.json({
      arbitration,
      recommended: canonical && claims.length ? recommendCanonical(claims, canonical) : null,
    });
  }));

  // -------------------------------------------------------------------------
  // التقرير الأسبوعي (#18)
  // -------------------------------------------------------------------------
  app.post('/api/analyst/weekly', wrap(async (req, res) => {
    const signals = arr<any>(req.body?.signals);
    if (!signals.length) return res.status(400).json({ error: 'signals مطلوبة' });
    res.json({ report: buildWeeklyReport(signals, arr(req.body?.events), str(req.body?.periodLabel) || 'هذا الأسبوع') });
  }));

  // -------------------------------------------------------------------------
  // تفسير النموذج (#19)
  // -------------------------------------------------------------------------
  app.post('/api/analyst/explain-model', wrap(async (req, res) => {
    const input = req.body?.model;
    if (!input?.features) return res.status(400).json({ error: 'model مطلوب {target, task, features}' });
    res.json({ explanation: explainModel(input) });
  }));

  // -------------------------------------------------------------------------
  // المصادر الحقيقية: مجموعات بيانات المستخدم (بدل اللصق اليدوي)
  // -------------------------------------------------------------------------
  app.get('/api/analyst/datasets', wrap(async (_req, res, user) => {
    res.json({ datasets: await listDatasetSummaries(user.id) });
  }));

  app.get('/api/analyst/dataset', wrap(async (req, res, user) => {
    const requested = req.query?.id ? str(req.query.id) : undefined;
    const source = await loadDatasetSource(user.id, requested);
    if (!source) return res.status(404).json({ error: 'لا توجد مجموعة بيانات محمّلة لهذا الحساب — ارفع ملفًا أولاً.' });
    res.json({
      dataset: {
        id: source.id,
        name: source.name,
        rowCount: source.rowCount,
        analyzedRows: source.rows.length,
        truncated: source.truncated,
        columns: source.columns,
      },
      numericColumns: numericColumns(source).map((c) => c.name),
      labelColumns: labelColumns(source).map((c) => c.name),
      sampleRows: source.rows.slice(0, 50),
      series: seriesFromSource(source).slice(0, 500),
    });
  }));

  // -------------------------------------------------------------------------
  // مراقبات الشذوذ المستمرة
  // -------------------------------------------------------------------------
  app.get('/api/analyst/monitors', wrap(async (_req, res, user) => {
    res.json({ monitors: await listMonitors(user.id) });
  }));

  app.post('/api/analyst/monitors', wrap(async (req, res, user) => {
    const monitor = await createMonitor(user.id, {
      datasetId: str(req.body?.datasetId),
      labelColumn: req.body?.labelColumn ? str(req.body.labelColumn) : undefined,
      valueColumn: str(req.body?.valueColumn),
      period: num(req.body?.period, 7),
      sensitivity: req.body?.sensitivity === 'strict' ? 'strict' : 'normal',
    });
    res.status(201).json({ monitor });
  }));

  app.delete('/api/analyst/monitors/:id', wrap(async (req, res, user) => {
    const ok = await deleteMonitor(user.id, str(req.params.id));
    res.status(ok ? 200 : 404).json(ok ? { ok: true } : { error: 'المراقب غير موجود' });
  }));

  app.post('/api/analyst/monitors/:id/toggle', wrap(async (req, res, user) => {
    const ok = await setMonitorEnabled(user.id, str(req.params.id), Boolean(req.body?.enabled));
    res.status(ok ? 200 : 404).json(ok ? { ok: true } : { error: 'المراقب غير موجود' });
  }));

  app.post('/api/analyst/monitors/run', wrap(async (_req, res, user) => {
    res.json({ sweep: await runMonitorSweep(user.id) });
  }));

  // -------------------------------------------------------------------------
  // سجل التشغيل + بطاقات الإثبات المحفوظة
  // -------------------------------------------------------------------------
  app.get('/api/analyst/runs', wrap(async (req, res, user) => {
    const limit = num(req.query?.limit, 50);
    const tool = req.query?.tool ? str(req.query.tool) : undefined;
    res.json({ runs: await listRuns(user.id, limit, tool) });
  }));

  app.post('/api/analyst/proof/save', wrap(async (req, res, user) => {
    const card = req.body?.card;
    if (!card) return res.status(400).json({ error: 'card مطلوب (ناتج /api/analyst/proof)' });
    const saved = await saveProof(user.id, {
      metricName: str(req.body?.metricName || card?.metricName || 'مقياس'),
      value: num(req.body?.value ?? card?.displayValue, 0),
      card,
    });
    res.status(201).json({ proof: saved });
  }));

  app.get('/api/analyst/proofs', wrap(async (_req, res, user) => {
    res.json({ proofs: await listProofs(user.id) });
  }));

  app.delete('/api/analyst/proofs/:id', wrap(async (req, res, user) => {
    const ok = await deleteProof(user.id, str(req.params.id));
    res.status(ok ? 200 : 404).json(ok ? { ok: true } : { error: 'البطاقة غير موجودة' });
  }));

  // -------------------------------------------------------------------------
  // تصدير آمن: يمرّ إلزاميًّا بحاجز الخصوصية قبل إخراج أي صف
  // -------------------------------------------------------------------------
  app.post('/api/analyst/export', wrap(async (req, res) => {
    const limited = capRows(arr<Record<string, unknown>>(req.body?.rows));
    if (!limited.rows.length) return res.status(400).json({ error: 'rows مطلوبة' });
    const policy: GatePolicy = {
      allowExternalWithPii: Boolean(req.body?.policy?.allowExternalWithPii),
      maxRows: Math.max(1, Math.min(num(req.body?.policy?.maxRows, 1000), MAX_ANALYST_ROWS)),
    };
    const decision = evaluateGate(limited.rows, policy);
    // طلب البيانات الخام عمدًا مع وجود PII = رفض صريح، لا تقنيع صامت.
    if (req.body?.requireRaw && decision.findings.length && !policy.allowExternalWithPii) {
      return res.status(409).json({ error: decision.reason, decision });
    }
    const format = str(req.body?.format || 'json');
    if (format === 'csv') {
      const rows = decision.sanitizedRows;
      const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
      const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = [columns.map(escape).join(','), ...rows.map((r) => columns.map((c) => escape(r[c])).join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('X-Analyst-Dropped', encodeURIComponent(decision.droppedColumns.join(',')));
      return res.send(csv);
    }
    res.json({ format: 'json', rows: decision.sanitizedRows, decision, truncated: limited.truncated });
  }));

  // -------------------------------------------------------------------------
  // حوكمة المقاييس: اعتماد وإصدار وإيقاف
  // -------------------------------------------------------------------------
  app.post('/api/analyst/metrics/:id/approve', wrap(async (req, res, user) => {
    const metrics = await listMetrics(user.id);
    const existing = metrics.find((m) => m.id === str(req.params.id));
    if (!existing) return res.status(404).json({ error: 'المقياس غير موجود' });
    // الإصدار يمثّل «نسخة معتمدة»، فلا يقفز عند اعتماد مسودّة أول مرة.
    const approved = normalizeMetric({
      ...existing,
      status: 'approved',
      version: existing.status === 'approved' ? (existing.version || 1) + 1 : (existing.version || 1),
      owner: req.body?.owner ? str(req.body.owner) : existing.owner,
    });
    res.json({ metric: await saveMetric(user.id, approved) });
  }));

  app.post('/api/analyst/metrics/:id/status', wrap(async (req, res, user) => {
    const next = str(req.body?.status);
    if (!['draft', 'approved', 'deprecated'].includes(next)) {
      return res.status(400).json({ error: 'status يجب أن يكون draft أو approved أو deprecated' });
    }
    const metrics = await listMetrics(user.id);
    const existing = metrics.find((m) => m.id === str(req.params.id));
    if (!existing) return res.status(404).json({ error: 'المقياس غير موجود' });
    const updated = normalizeMetric({ ...existing, status: next as 'draft' | 'approved' | 'deprecated' });
    res.json({ metric: await saveMetric(user.id, updated) });
  }));

  // -------------------------------------------------------------------------
  // لقطات التقييم (اتجاه الدقة)
  // -------------------------------------------------------------------------
  app.get('/api/analyst/eval/snapshots', wrap(async (req, res, user) => {
    res.json({ snapshots: await listEvalSnapshots(user.id, num(req.query?.limit, 20)) });
  }));
}
