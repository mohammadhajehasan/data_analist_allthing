/**
 * #13 — موثوقية الأتمتة: تحقّق DAG، تشغيل تجريبي، تكلفة، مفاتيح منع تكرار،
 * وشرح فشل قابل للتنفيذ.
 *
 * لماذا: الأتمتة تُقيَّم بموثوقيتها لا بذكائها. خطوة واحدة صامتة تُسقط الثقة
 * كلها. هذه الوحدة تُجيب قبل التشغيل: «هل هذا المسار صالح؟ كم يكلّف؟ ما أسوأ
 * ما يمكن أن يحدث؟» — وبعده: «لماذا فشل، وأي مُدخل سبّبه، وما الإصلاح؟».
 */

export type NodeKind = 'source' | 'transform' | 'sql' | 'ai' | 'chart' | 'branch' | 'output' | 'notify';

export interface WorkflowNode {
  id: string;
  kind: NodeKind;
  label: string;
  /** المعرّفات التي يستهلكها. */
  inputs: string[];
  /** هل يعدّل البيانات (كتابة/إرسال)؟ يؤثر على التكرار عند إعادة المحاولة. */
  sideEffect?: boolean;
  /** تقدير التكلفة بالدولار/دقيقة حسب النوع. */
  costUsd?: number;
  rows?: number;
}

export interface WorkflowEdge {
  from: string;
  to: string;
}

export interface WorkflowSpec {
  id?: string;
  name?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface ValidationIssue {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  nodeId?: string;
  message: string;
  fix: string;
}

export interface WorkflowPlan {
  valid: boolean;
  issues: ValidationIssue[];
  order: string[];
  estimatedCostUsd: number;
  estimatedMinutes: number;
  /** الخطوات التي تحتاج تأكيدًا بشريًّا قبل التشغيل. */
  confirmations: string[];
  summary: string;
}

const BASE_MINUTES: Record<NodeKind, number> = {
  source: 0.5,
  transform: 1,
  sql: 1.5,
  ai: 3,
  chart: 0.5,
  branch: 0.2,
  output: 0.5,
  notify: 0.3,
};

/** ترتيب طوبولوجي (Kahn) — يكشف الدورات ويعطي ترتيب التنفيذ. */
export function topologicalOrder(spec: WorkflowSpec): { order: string[]; cyclic: boolean; missingRefs: string[] } {
  const ids = new Set(spec.nodes.map((n) => n.id));
  const indegree = new Map<string, number>(spec.nodes.map((n) => [n.id, 0]));
  const adjacency = new Map<string, string[]>(spec.nodes.map((n) => [n.id, []]));
  const missingRefs: string[] = [];

  for (const node of spec.nodes) {
    for (const input of node.inputs) {
      if (!ids.has(input)) missingRefs.push(`${node.id} ← ${input}`);
    }
  }
  for (const edge of spec.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) {
      missingRefs.push(`${edge.from} → ${edge.to}`);
      continue;
    }
    adjacency.get(edge.from)!.push(edge.to);
    indegree.set(edge.to, (indegree.get(edge.to) || 0) + 1);
  }

  const queue = spec.nodes.filter((n) => (indegree.get(n.id) || 0) === 0).map((n) => n.id);
  const order: string[] = [];
  while (queue.length) {
    const current = queue.shift()!;
    order.push(current);
    for (const next of adjacency.get(current) || []) {
      indegree.set(next, (indegree.get(next) || 0) - 1);
      if ((indegree.get(next) || 0) === 0) queue.push(next);
    }
  }
  return { order, cyclic: order.length !== spec.nodes.length, missingRefs };
}

/** تحقّق شامل قبل التشغيل: بنية، اتصال، خطوات خطرة، تعرّض للفشل. */
export function validateWorkflow(spec: WorkflowSpec): WorkflowPlan {
  const issues: ValidationIssue[] = [];
  const { order, cyclic, missingRefs } = topologicalOrder(spec);

  if (!spec.nodes.length) {
    issues.push({ id: 'empty', severity: 'critical', message: 'المسار بلا خطوات.', fix: 'أضف خطوة مصدر وواحدة مخرجات على الأقل.' });
  }
  if (cyclic) {
    issues.push({
      id: 'cycle',
      severity: 'critical',
      message: 'المسار يحتوي دورة (خطوة تعتمد على مخرجات نفسها بشكل دائري).',
      fix: 'أعد ترتيب الاعتماديات أو استخدم خطوة فرع صريحة بدل التغذية الراجعة.',
    });
  }
  if (missingRefs.length) {
    issues.push({
      id: 'missing-refs',
      severity: 'high',
      message: `مراجع غير موجودة: ${missingRefs.slice(0, 5).join('، ')}`,
      fix: 'احذف الروابط المعلّقة أو أضف الخطوات المفقودة.',
    });
  }
  for (const node of spec.nodes) {
    if (node.kind !== 'source' && !spec.edges.some((e) => e.to === node.id) && !node.inputs.length) {
      issues.push({
        id: `orphan-${node.id}`,
        severity: 'medium',
        nodeId: node.id,
        message: `«${node.label}» بلا مُدخل — سيُشغَّل على لا شيء.`,
        fix: 'اربطه بمخرج الخطوة السابقة أو اجعله مصدرًا.',
      });
    }
    if (node.sideEffect && node.kind === 'ai') {
      issues.push({
        id: `side-effect-${node.id}`,
        severity: 'medium',
        nodeId: node.id,
        message: `«${node.label}» خطوة ذكاء اصطناعي بآثار جانبية (إرسال/كتابة) — إعادة المحاولة قد تُنشئ تكرارًا.`,
        fix: 'أضف مفتاح idempotency على المدخلات، أو اجعل الإرسال خطوة نهائية مستقلة.',
      });
    }
    if (!node.sideEffect && (node.kind === 'notify' || node.kind === 'output')) {
      issues.push({
        id: `undeclared-effect-${node.id}`,
        severity: 'low',
        nodeId: node.id,
        message: `«${node.label}» يبدو مُخرِجًا لكنه غير معلَّم كأثر جانبي.`,
        fix: 'علّمه sideEffect ليعمل منع التكرار بشكل صحيح.',
      });
    }
    if (node.kind === 'ai' && !(node.costUsd && node.costUsd > 0)) {
      issues.push({
        id: `ai-cost-${node.id}`,
        severity: 'low',
        nodeId: node.id,
        message: `«${node.label}» بلا تقدير تكلفة.`,
        fix: 'أضف costUsd التقديري ليراه المشغّل قبل التشغيل.',
      });
    }
  }

  const estimatedCostUsd = Number(spec.nodes.reduce((s, n) => s + (n.costUsd || 0), 0).toFixed(4));
  const estimatedMinutes = Number(spec.nodes.reduce((s, n) => s + BASE_MINUTES[n.kind] * (1 + Math.log10(Math.max(1, n.rows || 1)) / 4), 0).toFixed(2));
  const confirmations = spec.nodes
    .filter((n) => n.sideEffect || n.kind === 'notify')
    .map((n) => `«${n.label}» يعدّل/يرسل — يحتاج تأكيدًا بشريًّا قبل أول تشغيل.`);

  const critical = issues.filter((i) => i.severity === 'critical').length;
  return {
    valid: !critical,
    issues,
    order,
    estimatedCostUsd,
    estimatedMinutes,
    confirmations,
    summary: critical
      ? `${critical} مشكلة حرجة تمنع التشغيل.`
      : `المسار صالح: ${spec.nodes.length} خطوة، ${estimatedMinutes} دقيقة تقديرية، ${estimatedCostUsd}$، ${confirmations.length} خطوة تحتاج تأكيدًا.`,
  };
}

/**
 * تشغيل تجريبي على عيّنة: يبيّن شكل المخرجات والأخطاء المتوقّعة دون لمس
 * البيانات الحقيقية. هذا ما يجعل المستخدم يجرؤ على الأتمتة.
 */
export function dryRunPlan(spec: WorkflowSpec, sampleRows = 100): {
  steps: Array<{ nodeId: string; label: string; kind: NodeKind; rowsIn: number; rowsOut: number; note: string }>;
  warnings: string[];
} {
  const plan = validateWorkflow(spec);
  const warnings = plan.issues.filter((i) => i.severity !== 'low').map((i) => i.message);
  const steps = plan.order.map((nodeId, index) => {
    const node = spec.nodes.find((n) => n.id === nodeId)!;
    const rowsIn = index === 0 ? sampleRows : Math.max(1, Math.round(sampleRows * 0.9 ** index));
    const rowsOut = node.kind === 'sql' || node.kind === 'transform' || node.kind === 'branch' ? Math.max(1, Math.round(rowsIn * 0.8)) : rowsIn;
    return {
      nodeId,
      label: node.label,
      kind: node.kind,
      rowsIn,
      rowsOut,
      note:
        node.kind === 'ai'
          ? `سيُستدعى النموذج على ${rowsIn} صفًّا — استخدم عيّنة ${Math.min(rowsIn, 10)} للتحقق من الصياغة أولًا.`
          : node.kind === 'notify'
            ? 'لن يُرسل شيء فعلًا في التشغيل التجريبي.'
            : `تمرير ${rowsIn} صفًّا، المتوقّع ${rowsOut}.`,
    };
  });
  return { steps, warnings };
}

/** مفتاح منع التكرار: نفس المدخلات ونفس النافذة الزمنية = نفس المفتاح. */
export function idempotencyKey(workflowId: string, runWindow: string, inputs: unknown): string {
  const payload = JSON.stringify(inputs, Object.keys((inputs as Record<string, unknown>) || {}).sort());
  let hash = 2166136261;
  const text = `${workflowId}|${runWindow}|${payload}`;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `wf_${(hash >>> 0).toString(36)}`;
}

export interface FailureExplanation {
  nodeId: string | null;
  cause: string;
  culpritInput: string | null;
  fix: string;
  retrySafe: boolean;
}

/** من رسالة خطأ خام إلى شرح مفهوم + هل إعادة المحاولة آمنة. */
export function explainFailure(spec: WorkflowSpec, error: string): FailureExplanation {
  const text = String(error || '');
  const node = spec.nodes.find((n) => text.includes(n.id) || text.includes(n.label));
  const nodeId = node?.id ?? null;
  const lower = text.toLowerCase();

  if (/rate.?limit|429|too many/.test(lower)) {
    return { nodeId, cause: 'تجاوز حد الطلبات لدى مزوّد خارجي.', culpritInput: null, fix: 'أضف تباعدًا أسّيًّا بين المحاولات وأعد المحاولة بعد دقيقة.', retrySafe: !node?.sideEffect };
  }
  if (/timeout|etimedout|timed out|502|503|fetch failed/.test(lower)) {
    return { nodeId, cause: 'انقطاع مؤقت في الشبكة أو الخدمة.', culpritInput: null, fix: 'أعد المحاولة مرة واحدة؛ إن تكرر فافحص حالة الخدمة (/api/health).', retrySafe: !node?.sideEffect };
  }
  if (/permission|403|unauthorized|401/.test(lower)) {
    return { nodeId, cause: 'مفتاح/صلاحية غير صالحة — إعادة المحاولة لن تُصلحها.', culpritInput: 'credentials', fix: 'حدّث المفتاح في الإعدادات ثم أعد التشغيل يدويًّا.', retrySafe: false };
  }
  if (/null|undefined|لا يوجد عمود|column/.test(lower)) {
    return { nodeId, cause: 'مُدخل ناقص أو عمود محذوف من المصدر.', culpritInput: 'schema', fix: 'افحص أثر تغيير المخطط (lineage) قبل التشغيل، وثبّت أسماء الأعمدة.', retrySafe: false };
  }
  if (/duplicate|unique constraint/.test(lower)) {
    return { nodeId, cause: 'تشغيل مكرّر لنفس النافذة أنتج كتابة مكرّرة.', culpritInput: 'run_window', fix: 'استخدم مفتاح idempotency وأوقف الإدراج المزدوج.', retrySafe: false };
  }
  return { nodeId, cause: 'خطأ غير مصنّف.', culpritInput: null, fix: 'راجع سجل الخطوة، وشغّل تجريبيًّا على عيّنة لعزل السبب.', retrySafe: false };
}
