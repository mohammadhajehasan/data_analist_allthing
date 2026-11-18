/**
 * #14 — حاضنة التقييم: مجموعة ذهبية + انحدار + توجيه النموذج حسب المهمة.
 *
 * لماذا: بلا قياس، «تحسين المساعد» ظنّ. حين تُثبَّت 200–300 سؤال بإجاباتها
 * المعتمدة، يصبح كل تغيير في البرومبت أو النموذج قرارًا مبرهنًا برقم، ويصبح
 * الانحدار يُكتشف قبل المستخدم لا بعده.
 */

export type TaskKind = 'extract' | 'reasoning' | 'codegen' | 'narrative' | 'classify';

export interface GoldenCase {
  id: string;
  question: string;
  /** الإجابة المعتمدة بشريًّا (المرجع). */
  expected: string;
  /** إجابة النظام الحالية. */
  actual?: string;
  task?: TaskKind;
  tags?: string[];
  /** إن كانت الإجابة رقمًا: التسامح النسبي المقبول. */
  numericTolerance?: number;
}

export type CaseOutcome = 'pass' | 'fail' | 'partial';

export interface CaseResult {
  caseId: string;
  outcome: CaseOutcome;
  score: number; // 0..1
  detail: string;
}

export interface EvalReport {
  total: number;
  passed: number;
  partial: number;
  failed: number;
  accuracy: number;
  byTask: Array<{ task: TaskKind; total: number; accuracy: number }>;
  failures: CaseResult[];
  summary: string;
}

function normalize(text: string): string {
  return String(text || '')
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[.,،;؛٪%\s]+/g, ' ')
    .trim();
}

function firstNumber(text: string): number | null {
  const m = String(text || '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/**
 * تقييم حالة واحدة: الأرقام تُقارن بتسامح نسبي (لأن صياغة النص تختلف)،
 * والنصوص تُقارن بالاحتواء بعد التطبيع، وإلا فبتشابه الكلمات.
 */
export function scoreCase(c: GoldenCase): CaseResult {
  const expected = String(c.expected ?? '');
  const actual = String(c.actual ?? '');
  if (!actual.trim()) {
    return { caseId: c.id, outcome: 'fail', score: 0, detail: 'لا إجابة.' };
  }
  const expNum = firstNumber(expected);
  const actNum = firstNumber(actual);
  if (expNum !== null && actNum !== null) {
    const tol = c.numericTolerance ?? 0.01;
    const denom = Math.max(1e-9, Math.abs(expNum));
    const diff = Math.abs(actNum - expNum) / denom;
    if (diff <= tol) return { caseId: c.id, outcome: 'pass', score: 1, detail: `الرقم مطابق (فرق ${(diff * 100).toFixed(3)}%).` };
    if (diff <= tol * 5) return { caseId: c.id, outcome: 'partial', score: 0.6, detail: `الرقم قريب لكن خارج التسامح (فرق ${(diff * 100).toFixed(2)}%).` };
    return { caseId: c.id, outcome: 'fail', score: 0, detail: `الرقم مختلف: ${actNum} بدل ${expNum}.` };
  }
  const e = normalize(expected);
  const a = normalize(actual);
  if (e && a.includes(e)) return { caseId: c.id, outcome: 'pass', score: 1, detail: 'الإجابة تحتوي المرجع حرفيًّا.' };
  const eTokens = new Set(e.split(' ').filter((t) => t.length > 2));
  const aTokens = new Set(a.split(' ').filter((t) => t.length > 2));
  if (!eTokens.size) return { caseId: c.id, outcome: 'fail', score: 0, detail: 'المرجع فارغ.' };
  let hit = 0;
  for (const t of eTokens) if (aTokens.has(t)) hit += 1;
  const overlap = hit / eTokens.size;
  if (overlap >= 0.8) return { caseId: c.id, outcome: 'pass', score: overlap, detail: `تغطية ${(overlap * 100).toFixed(0)}% من كلمات المرجع.` };
  if (overlap >= 0.5) return { caseId: c.id, outcome: 'partial', score: overlap, detail: `تغطية ${(overlap * 100).toFixed(0)}% — ناقصة.` };
  return { caseId: c.id, outcome: 'fail', score: overlap, detail: `تغطية ${(overlap * 100).toFixed(0)}% فقط.` };
}

/** تشغيل المجموعة كاملة وإخراج تقرير قابل للمقارنة بين النسخ. */
export function runEvaluation(cases: GoldenCase[]): EvalReport {
  const results = cases.map(scoreCase);
  const passed = results.filter((r) => r.outcome === 'pass').length;
  const partial = results.filter((r) => r.outcome === 'partial').length;
  const failed = results.filter((r) => r.outcome === 'fail').length;
  const byTaskMap = new Map<TaskKind, { total: number; score: number }>();
  cases.forEach((c, i) => {
    const task = c.task || 'reasoning';
    const entry = byTaskMap.get(task) || { total: 0, score: 0 };
    entry.total += 1;
    entry.score += results[i].score;
    byTaskMap.set(task, entry);
  });
  const accuracy = results.length ? (results.reduce((s, r) => s + r.score, 0) / results.length) * 100 : 0;
  return {
    total: results.length,
    passed,
    partial,
    failed,
    accuracy: Number(accuracy.toFixed(2)),
    byTask: Array.from(byTaskMap.entries()).map(([task, v]) => ({
      task,
      total: v.total,
      accuracy: Number(((v.score / v.total) * 100).toFixed(2)),
    })),
    failures: results.filter((r) => r.outcome !== 'pass'),
    summary: `${passed}/${results.length} مطابقة تامة، ${partial} جزئية، ${failed} فاشلة — دقة ${accuracy.toFixed(1)}%.`,
  };
}

export interface RegressionReport {
  before: EvalReport;
  after: EvalReport;
  deltaAccuracy: number;
  regressedCases: string[];
  improvedCases: string[];
  verdict: 'improved' | 'regressed' | 'unchanged';
  message: string;
}

/** مقارنة نسختين: أهم سؤال في أي ترقية هو «ما الذي انكسر؟». */
export function compareRuns(beforeCases: GoldenCase[], afterCases: GoldenCase[]): RegressionReport {
  const before = runEvaluation(beforeCases);
  const after = runEvaluation(afterCases);
  const beforeMap = new Map(beforeCases.map((c) => [c.id, scoreCase(c)]));
  const afterMap = new Map(afterCases.map((c) => [c.id, scoreCase(c)]));
  const regressed: string[] = [];
  const improved: string[] = [];
  for (const [id, b] of beforeMap) {
    const a = afterMap.get(id);
    if (!a) continue;
    if (a.score < b.score - 1e-9) regressed.push(id);
    if (a.score > b.score + 1e-9) improved.push(id);
  }
  const delta = Number((after.accuracy - before.accuracy).toFixed(2));
  const verdict: RegressionReport['verdict'] = delta > 0.5 ? 'improved' : delta < -0.5 ? 'regressed' : 'unchanged';
  return {
    before,
    after,
    deltaAccuracy: delta,
    regressedCases: regressed,
    improvedCases: improved,
    verdict,
    message:
      verdict === 'regressed'
        ? `تراجع ${Math.abs(delta).toFixed(1)} نقطة، وانكسرت ${regressed.length} حالة — لا تُطلق هذه النسخة.`
        : verdict === 'improved'
          ? `تحسّن ${delta.toFixed(1)} نقطة مع ${regressed.length} حالة متراجعة للتحقق.`
          : `لا فرق جوهري (${delta >= 0 ? '+' : ''}${delta} نقطة).`,
  };
}

export interface RouterDecision {
  model: 'cheap' | 'standard' | 'strong';
  reason: string;
  estimatedCostFactor: number;
}

/**
 * توجيه المهمة إلى أرخص نموذج يحقق الجودة: الاستخراج والتصنيف لا يحتاجان
 * نموذجًا قويًّا، بينما الاستدلال وتوليد SQL يحتاجانه.
 */
export function routeTask(task: TaskKind, complexity = 0.5): RouterDecision {
  if (task === 'extract' || task === 'classify') {
    return { model: 'cheap', reason: 'مهمة استخراج/تصنيف — نموذج صغير يكفيها بدقة عالية وتكلفة أقل بكثير.', estimatedCostFactor: 0.15 };
  }
  if (task === 'reasoning' || task === 'codegen') {
    return complexity > 0.6
      ? { model: 'strong', reason: 'استدلال/توليد SQL معقّد (انحناءات منطقية كثيرة) — يلزم نموذج قوي.', estimatedCostFactor: 1 }
      : { model: 'standard', reason: 'استدلال متوسط التعقيد — نموذج قياسي بتكلفة متوسطة.', estimatedCostFactor: 0.4 };
  }
  return { model: 'standard', reason: 'سرد/تلخيص — القياسي يعطي جودة كافية بتكلفة أقل.', estimatedCostFactor: 0.4 };
}
