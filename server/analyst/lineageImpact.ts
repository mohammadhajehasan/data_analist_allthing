/**
 * #12 — تحليل الأثر قبل تغيير المخطط (Lineage & Impact).
 *
 * لماذا: أرخص قيمة ممكنة في الأتمتة: «إن حذفت هذا العمود، ما الذي ينكسر؟».
 * يمنع انقطاعًا صامتًا في تقارير يعتمد عليها القرار، ويجعل الفريق يثق بالنظام
 * كله لأنه يحميه من نفسه.
 */

export type ArtifactKind = 'report' | 'dashboard' | 'nl2sql' | 'model' | 'workflow' | 'metric' | 'view';

export interface Artifact {
  id: string;
  name: string;
  kind: ArtifactKind;
  /** الجداول/الأعمدة التي يقرأها. */
  reads: Array<{ table: string; columns: string[] }>;
  owner?: string;
  /** هل يعمل دوريًّا أو عند الطلب. */
  schedule?: 'hourly' | 'daily' | 'weekly' | 'manual';
}

export interface ImpactRequest {
  table: string;
  column?: string;
  change: 'drop-column' | 'drop-table' | 'rename-column' | 'type-change';
}

export interface ImpactedArtifact {
  artifact: Artifact;
  severity: 'breaks' | 'degrades' | 'unaffected';
  reason: string;
}

export interface ImpactReport {
  request: ImpactRequest;
  verdict: 'safe' | 'risky' | 'blocking';
  headline: string;
  impacted: ImpactedArtifact[];
  /** خطوات إصلاح مقترحة. */
  remediation: string[];
  /** ترتيب الأولوية: ما ينكسر وأصحابه. */
  owners: string[];
}

function artifactReads(a: Artifact, table: string, column?: string): boolean {
  return a.reads.some(
    (r) => r.table.toLowerCase() === table.toLowerCase() && (!column || r.columns.some((c) => c.toLowerCase() === column.toLowerCase() || c === '*'))
  );
}

/**
 * تحليل الأثر. «ينكسر» = العمود/الجدول مقروء صراحةً أو عبر SELECT *.
 * «يتدهور» = اعتماد غير مباشر (مقياس دلالي أو نموذج يستخدم المخرجات).
 */
export function analyzeImpact(request: ImpactRequest, artifacts: Artifact[]): ImpactReport {
  const impacted: ImpactedArtifact[] = [];
  const owners = new Set<string>();

  for (const artifact of artifacts) {
    const reads = artifactReads(artifact, request.table, request.column);
    if (reads) {
      impacted.push({
        artifact,
        severity: 'breaks',
        reason:
          artifact.kind === 'model'
            ? 'النموذج دُرِّب على هذا العمود؛ الحذف يبطل الميزات المهمة ويجعل إعادة التدريب تُنتج نموذجًا مختلفًا.'
            : artifact.kind === 'workflow'
              ? 'مسار الأتمتة سيقرأ عمودًا غير موجود فيتوقف عند الخطوة.'
              : artifact.kind === 'nl2sql'
                ? 'الأسئلة المحفوظة/المطابقة الدلالية ستولّد SQL معطوبًا.'
                : 'التقرير سيُظهر NULL أو يفشل في التحديث التالي.',
      });
      if (artifact.owner) owners.add(artifact.owner);
    }
  }

  const breaks = impacted.filter((i) => i.severity === 'breaks');
  const verdict: ImpactReport['verdict'] = breaks.length ? 'blocking' : impacted.length ? 'risky' : 'safe';
  const target = request.column ? `${request.table}.${request.column}` : request.table;
  const action = { 'drop-column': 'حذف', 'drop-table': 'حذف', 'rename-column': 'إعادة تسمية', 'type-change': 'تغيير نوع' }[request.change];

  const headline =
    verdict === 'safe'
      ? `${action} ${target} آمن: لا أثراء معروفون يقرأونه.`
      : verdict === 'risky'
        ? `${action} ${target} يؤدي إلى تدهور ${impacted.length} أثرًا (اعتماد غير مباشر).`
        : `${action} ${target} يكسر ${breaks.length} أثرًا — لا تنفّذه قبل الإصلاح.`;

  const remediation: string[] = [];
  if (verdict !== 'safe') {
    remediation.push('أضف عمودًا جديدًا بالنوع المطلوب واملأه، وبدّل القرّاء تدريجيًّا، ثم احذف القديم (expand–contract).');
    if (request.change === 'drop-column') remediation.push('حدّث الاستعلامات المحفوظة ومسارات الأتمتة، وأعد تشغيل اختبار التسلسل.');
    if (request.change === 'type-change') remediation.push('فرّغ/حوّل القيم صراحةً واختبر التواريخ والفواصل العشرية في بيئة معزولة.');
    if (request.change === 'rename-column') remediation.push('أنشئ عرضًا (VIEW) بالاسم القديم يعكس الاسم الجديد لتغطية فترة الانتقال.');
  }

  return { request, verdict, headline, impacted, remediation, owners: Array.from(owners) };
}

/**
 * رسم تخطيطي نصي لمصادر أي أثر — يُستخدم في التقرير وعرض «لماذا».
 */
export function describeLineage(artifact: Artifact): string {
  if (!artifact.reads.length) return `${artifact.name}: لا مصادر مسجّلة.`;
  return artifact.reads.map((r) => `${r.table}(${r.columns.join(', ')}) → ${artifact.name}`).join('\n');
}
