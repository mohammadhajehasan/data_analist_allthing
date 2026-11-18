/**
 * #9 — سلسلة الإثبات: من الرقم إلى الصفوف في خطوات مقروءة.
 *
 * لماذا: الثقة تُبنى حين يستطيع أي شخص أن يُعيد إنتاج الرقم. هذه الوحدة تبني
 * شجرة إثبات (رقم ← صيغة ← فلاتر ← مصدر ← طزاجة) وتُخرج مقتطفًا قابلًا للتشغيل
 * وبطاقة دليل قابلة للمشاركة، بحيث يصمد الجواب أمام أول اعتراض في الاجتماع.
 */

export interface ProofStep {
  id: string;
  kind: 'number' | 'formula' | 'filter' | 'source' | 'freshness' | 'granularity' | 'excluded';
  title: string;
  detail: string;
}

export interface ProofChainInput {
  metricName: string;
  value: number;
  unit?: string;
  formula?: string;
  filters?: Array<{ column: string; operator: string; value: string }>;
  source?: { datasetName?: string; table?: string; rows?: number };
  /** آخر تحديث معروف للبيانات. */
  updatedAt?: string | null;
  now?: Date;
  /** استثناءات صريحة (صفوف مستبعدة ولماذا). */
  exclusions?: Array<{ what: string; count?: number; why: string }>;
  grain?: string;
  sql?: string;
}

export interface ProofCard {
  metricName: string;
  displayValue: string;
  steps: ProofStep[];
  /** مقتطف قابل لإعادة التشغيل. */
  reproducible: string;
  freshness: { ageHours: number | null; level: 'fresh' | 'aging' | 'stale' | 'unknown'; label: string };
  /** نص بطاقة جاهز للنسخ والمشاركة. */
  shareText: string;
  /** ما ينقص السلسلة (شفافية: لا ندّعي اكتمالًا). */
  gaps: string[];
}

function formatNumber(value: number, unit?: string): string {
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 0 : abs >= 10 ? 1 : 2;
  return `${value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: 0 })}${unit ? ` ${unit}` : ''}`;
}

export function buildProofChain(input: ProofChainInput): ProofCard {
  const steps: ProofStep[] = [];
  const gaps: string[] = [];
  const now = input.now || new Date();

  steps.push({
    id: 'number',
    kind: 'number',
    title: 'الرقم',
    detail: `${input.metricName} = ${formatNumber(input.value, input.unit)}`,
  });

  if (input.formula) {
    steps.push({ id: 'formula', kind: 'formula', title: 'الصيغة', detail: input.formula });
  } else {
    gaps.push('لا توجد صيغة موثّقة للمقياس — الرقم بلا تعريف ثابت.');
  }

  if (input.grain) {
    steps.push({ id: 'granularity', kind: 'granularity', title: 'الحبيبية', detail: `الصف الواحد يمثّل: ${input.grain}` });
  } else {
    gaps.push('الحبيبية غير مذكورة — قد يكون الرقم محسوبًا على مستوى مختلف.');
  }

  if (input.filters?.length) {
    steps.push({
      id: 'filters',
      kind: 'filter',
      title: 'الفلاتر المطبّقة',
      detail: input.filters.map((f) => `${f.column} ${f.operator} ${f.value}`).join(' AND '),
    });
  } else {
    gaps.push('لا فلاتر مذكورة — قد يدخل الرقم صفوفًا لا تريدها.');
  }

  if (input.source) {
    steps.push({
      id: 'source',
      kind: 'source',
      title: 'المصدر',
      detail: [input.source.datasetName, input.source.table, input.source.rows !== undefined ? `${input.source.rows.toLocaleString('en-US')} صفًّا` : null]
        .filter(Boolean)
        .join(' — ') || 'غير محدد',
    });
  } else {
    gaps.push('المصدر غير مربوط.');
  }

  for (const ex of input.exclusions || []) {
    steps.push({
      id: `excluded-${ex.what}`,
      kind: 'excluded',
      title: 'استُبعد صراحةً',
      detail: `${ex.what}${ex.count !== undefined ? ` (${ex.count.toLocaleString('en-US')} صفًّا)` : ''} — ${ex.why}`,
    });
  }

  let ageHours: number | null = null;
  let level: 'fresh' | 'aging' | 'stale' | 'unknown' = 'unknown';
  let label = 'طزاجة البيانات غير معروفة';
  if (input.updatedAt) {
    const t = Date.parse(input.updatedAt);
    if (Number.isFinite(t)) {
      ageHours = Math.max(0, (now.getTime() - t) / 3_600_000);
      level = ageHours <= 24 ? 'fresh' : ageHours <= 24 * 7 ? 'aging' : 'stale';
      label = level === 'fresh'
        ? `البيانات حديثة (آخر تحديث قبل ${ageHours < 1 ? 'أقل من ساعة' : `${Math.round(ageHours)} ساعة`})`
        : level === 'aging'
          ? `البيانات متأخرة ${Math.round(ageHours / 24)} يومًا — تحقّق من التحديث قبل القرار`
          : `البيانات قديمة (${Math.round(ageHours / 24)} يومًا) — لا تُبنى عليها قرارات آنية`;
      steps.push({ id: 'freshness', kind: 'freshness', title: 'الطزاجة', detail: label });
    }
  }
  if (level === 'unknown') gaps.push('لا وقت تحديث — لا يمكن الحكم على حداثة الرقم.');
  if (ageHours !== null && ageHours > 24 * 30) gaps.push('عمر البيانات يتجاوز شهرًا.');

  const reproducible = input.sql
    ? `-- إعادة إنتاج: ${input.metricName}\n${input.sql.trim()}`
    : `# إعادة إنتاج: ${input.metricName}\n# الصيغة: ${input.formula || '—'}\n# الحبيبية: ${input.grain || '—'}\n# المصدر: ${input.source?.datasetName || input.source?.table || '—'}\n# القيمة المعتمدة: ${formatNumber(input.value, input.unit)}`;

  const shareText = [
    `📌 ${input.metricName}: ${formatNumber(input.value, input.unit)}`,
    input.formula ? `الصيغة: ${input.formula}` : null,
    input.filters?.length ? `الفلاتر: ${input.filters.map((f) => `${f.column} ${f.operator} ${f.value}`).join(' AND ')}` : null,
    input.source?.datasetName ? `المصدر: ${input.source.datasetName}` : null,
    label,
    gaps.length ? `نواقص الإثبات: ${gaps.join(' | ')}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    metricName: input.metricName,
    displayValue: formatNumber(input.value, input.unit),
    steps,
    reproducible,
    freshness: { ageHours, level, label },
    shareText,
    gaps,
  };
}

/** هل الرقم «جاهز للاجتماع»؟ (لا نواقص جوهرية وبيانات غير قديمة). */
export function proofReadiness(card: ProofCard): { ready: boolean; reason: string } {
  const blocking = card.gaps.filter((g) => /صيغة|الحبيبية|المصدر/.test(g));
  if (blocking.length) return { ready: false, reason: `ينقص الإثبات: ${blocking.join('، ')}` };
  if (card.freshness.level === 'stale') return { ready: false, reason: 'البيانات قديمة — حدّثها أولًا.' };
  return { ready: true, reason: 'السلسلة مكتملة: رقم ← صيغة ← فلاتر ← مصدر ← طزاجة.' };
}
