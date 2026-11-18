/**
 * #1 — الطبقة الدلالية للمقاييس (Semantic Layer / Metric Catalogue).
 *
 * لماذا هذه الطبقة أهم من تحسين صياغة SQL: الخطأ المتكرر في تحليل البيانات ليس
 * في جملة الاستعلام بل في **تعريف المقياس** — أي حبيبية (grain) وأي فلاتر
 * إلزامية وأي عملة. حين يُعرَّف المقياس مرة واحدة ويُقرأ منه كل سؤال، يختفي
 * تناقض «نفس الرقم بثلاث نتائج»، ويتحوّل المساعد من مولّد SQL إلى محلل يعرف
 * مؤسستك.
 *
 * الوحدة هنا لا تنفّذ SQL: تُعرّف المقياس، تتحقّق من صحته، تطابق سؤالًا حرًّا
 * مع المقاييس المعروفة، وتكشف التعارضات بين تعريفين لنفس الاسم.
 */

export type MetricGrain = 'row' | 'order' | 'customer' | 'day' | 'week' | 'month' | 'quarter' | 'year' | 'other';

export interface MetricDefinition {
  id: string;
  /** الاسم المعتمد كما يُكتب في التقارير. */
  name: string;
  /** أسماء بديلة يفهمها المستخدم (بالإنجليزية والعربية). */
  aliases: string[];
  /** الصيغة المعتمدة — تُنسخ حرفيًّا إلى SQL عند التوليد. */
  formula: string;
  /** الحبيبية: ماذا يمثّل الصف الواحد في هذه الصيغة. */
  grain: MetricGrain;
  /** فلاتر إلزامية (مثل «استبعاد المرتجعات»)، فارغة = لا شيء. */
  requiredFilters: string[];
  currency?: string;
  owner?: string;
  /** تحذيرات تُعرض كلما استُخدم المقياس — أهم جزء لتفادي القراءة الخاطئة. */
  caveats: string[];
  sourceTables: string[];
  createdAt?: string;
  /** دورة حياة التعريف: مسودّة تُكتب، معتمد يُحتجّ به، متقاعد لا يُستخدم جديدًا. */
  status?: 'draft' | 'approved' | 'deprecated';
  /** يزيد مع كل اعتماد/تعديل معتمد — يمنع مقارنة تقريرين بإصدارين مختلفين صامتًا. */
  version?: number;
}

export interface MetricConflict {
  name: string;
  metrics: MetricDefinition[];
  /** الحقول التي تختلف فعليًّا بين التعريفات. */
  differingFields: string[];
  severity: 'high' | 'medium';
  /** أثر تقديري على الرقم (نسبة مئوية) إن أمكن استنتاجه من الفلاتر. */
  note: string;
}

export interface MetricMatch {
  metric: MetricDefinition;
  score: number;
  matchedTerms: string[];
}

/** تطبيع عربي/إنجليزي للمقارنة: تشكيل، أل التعريف، هل والهمزات، مسافات. */
export function normalizeTerm(input: string): string {
  return String(input || '')
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ال(?=[\u0621-\u064A])/g, '')
    .replace(/[^a-z0-9\u0621-\u064A\s_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set([
  'كم', 'ما', 'هو', 'هي', 'في', 'من', 'علي', 'على', 'عن', 'خلال', 'هذا', 'هذه', 'الشهر', 'السنه',
  'the', 'of', 'for', 'in', 'by', 'and', 'what', 'is', 'was', 'how', 'many', 'much', 'total',
]);

export function tokenize(input: string): string[] {
  return normalizeTerm(input)
    .split(' ')
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/** أخطاء تعريف المقياس — قائمة فارغة تعني أنه صالح للاستخدام. */
export function validateMetric(def: Partial<MetricDefinition>): string[] {
  const errors: string[] = [];
  if (!def.name?.trim()) errors.push('الاسم مطلوب');
  if (!def.formula?.trim()) errors.push('الصيغة مطلوبة');
  else {
    const formula = def.formula.toUpperCase();
    // صيغة بلا تجميع ولا عمود = ليست مقياسًا
    if (!/(SUM|COUNT|AVG|MIN|MAX|MEDIAN|PERCENTILE|DISTINCT)\s*\(/.test(formula)) {
      errors.push('الصيغة يجب أن تحتوي دالة تجميع (SUM/COUNT/AVG…) — وإلا فهي عمود لا مقياس');
    }
    if (/SELECT\s+\*/i.test(def.formula)) errors.push('لا تُستخدم SELECT * داخل تعريف المقياس');
  }
  if (!def.grain) errors.push('الحبيبية مطلوبة (grain)');
  if (!Array.isArray(def.aliases)) errors.push('aliases يجب أن تكون مصفوفة (يمكن أن تكون فارغة)');
  if (!Array.isArray(def.caveats)) errors.push('caveats يجب أن تكون مصفوفة (يمكن أن تكون فارغة)');
  return errors;
}

/** توحيد المقياس قبل الحفظ حتى لا تتكرر نسخ متشابهة. */
export function normalizeMetric(def: MetricDefinition): MetricDefinition {
  const dedupe = (arr?: string[]) => Array.from(new Set((arr || []).map((s) => s.trim()).filter(Boolean)));
  return {
    ...def,
    id: def.id || `metric-${normalizeTerm(def.name).replace(/\s+/g, '-')}`,
    name: def.name.trim(),
    aliases: dedupe(def.aliases),
    requiredFilters: dedupe(def.requiredFilters),
    caveats: dedupe(def.caveats),
    sourceTables: dedupe(def.sourceTables),
    status: def.status || 'draft',
    version: Number.isFinite(Number(def.version)) && Number(def.version) > 0 ? Number(def.version) : 1,
  };
}

/**
 * مطابقة سؤال حرّ مع المقاييس: اسم/لقب مطابق يتفوّق على مجرد تقاسم كلمات.
 * Score 1.0 = تطابق تام (اسم أو لقب)، وأقل من ذلك تقاسم كلمات.
 */
export function matchMetrics(question: string, metrics: MetricDefinition[]): MetricMatch[] {
  const q = ` ${normalizeTerm(question)} `;
  const qTokens = new Set(tokenize(question));
  const matches: MetricMatch[] = [];
  for (const metric of metrics) {
    const terms = [metric.name, ...metric.aliases];
    let best = 0;
    const matched = new Set<string>();
    for (const term of terms) {
      const n = normalizeTerm(term);
      if (!n) continue;
      if (q.includes(` ${n} `) || q === ` ${n} `) {
        best = 1;
        matched.add(term);
        continue;
      }
      const tt = normalizeTerm(term).split(' ').filter((t) => t.length > 1);
      if (!tt.length) continue;
      const hit = tt.filter((t) => qTokens.has(t)).length;
      const score = hit / tt.length;
      if (score > best) {
        best = score;
        matched.add(term);
      }
    }
    if (best >= 0.5) matches.push({ metric, score: Number(best.toFixed(3)), matchedTerms: Array.from(matched) });
  }
  return matches.sort((a, b) => b.score - a.score);
}

export interface Resolution {
  matches: MetricMatch[];
  /** أفضل مقياس إن كان الحسم واضحًا. */
  chosen: MetricDefinition | null;
  /** سؤال توضيحي واحد حين يوجد أكثر من مقياس متقارب. */
  clarifyingQuestion: string | null;
  /** تحذيرات المقياس المختار — تُمرَّر إلى المساعد ليذكرها. */
  caveats: string[];
  reason: string;
}

/**
 * حسم السؤال إلى مقياس واحد. الفاصل الحاسم: يجب أن يتقدّم الأول بفارق واضح
 * عن الثاني (0.15)، وإلا فالسؤال الحقيقي «أيّهما؟» — وهذه أرخص طريقة لجعل
 * المساعد يبدو ذكيًّا: لا يخمّن.
 */
export function resolveQuestion(question: string, metrics: MetricDefinition[]): Resolution {
  const matches = matchMetrics(question, metrics);
  if (!matches.length) {
    return { matches, chosen: null, clarifyingQuestion: null, caveats: [], reason: 'لم يُطابق السؤال أي مقياس معتمد — لا يوجد تعريف موثوق' };
  }
  const [first, second] = matches;
  if (!second || first.score - second.score >= 0.15) {
    return {
      matches,
      chosen: first.metric,
      clarifyingQuestion: null,
      caveats: first.metric.caveats,
      reason: `تطابق ${Math.round(first.score * 100)}% عبر «${first.matchedTerms[0] || first.metric.name}»`,
    };
  }
  const options = matches.slice(0, 3).map((m) => `• ${m.metric.name} = ${m.metric.formula}`);
  return {
    matches,
    chosen: null,
    clarifyingQuestion: `أيّ تعريف تريد؟\n${options.join('\n')}`,
    caveats: [],
    reason: 'أكثر من مقياس بنفس الاسم بتعريفات مختلفة — الحسم يحتاج قرارك',
  };
}

/** كشف أن نفس الاسم معرَّف بأكثر من صيغة/فلتر/حبيبية (تناقض المؤسسة). */
export function detectMetricConflicts(metrics: MetricDefinition[]): MetricConflict[] {
  const byName = new Map<string, MetricDefinition[]>();
  for (const m of metrics) {
    const key = normalizeTerm(m.name);
    const list = byName.get(key) || [];
    list.push(m);
    byName.set(key, list);
  }
  const conflicts: MetricConflict[] = [];
  for (const list of byName.values()) {
    if (list.length < 2) continue;
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
    const differing: string[] = [];
    if (new Set(list.map((m) => norm(m.formula))).size > 1) differing.push('الصيغة');
    if (new Set(list.map((m) => m.grain)).size > 1) differing.push('الحبيبية');
    if (new Set(list.map((m) => norm([...m.requiredFilters].sort().join('|')))).size > 1) differing.push('الفلاتر الإلزامية');
    if (new Set(list.map((m) => norm(m.currency || ''))).size > 1) differing.push('العملة');
    if (!differing.length) continue;
    conflicts.push({
      name: list[0].name,
      metrics: list,
      differingFields: differing,
      severity: differing.includes('الحبيبية') || differing.includes('الصيغة') ? 'high' : 'medium',
      note:
        `«${list[0].name}» له ${list.length} تعريفات متعارضة (${differing.join('، ')}). ` +
        'أي تقرير يستخدم أحدها لا يُقارَن بالآخر قبل توحيد التعريف.',
    });
  }
  return conflicts;
}

/** تعليق SQL يوضّح المقياس المستخدم — يُلصق أعلى الاستعلام المولّد. */
export function metricSqlPreamble(metric: MetricDefinition): string {
  const lines = [
    `-- metric: ${metric.name} (grain: ${metric.grain})`,
    `-- formula: ${metric.formula}`,
  ];
  if (metric.requiredFilters.length) lines.push(`-- required filters: ${metric.requiredFilters.join(' AND ')}`);
  if (metric.currency) lines.push(`-- currency: ${metric.currency}`);
  for (const caveat of metric.caveats.slice(0, 3)) lines.push(`-- caveat: ${caveat}`);
  return lines.join('\n');
}
