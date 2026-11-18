/**
 * #4 — ذاكرة المحلل: استرجاع التحليلات السابقة بصلتها بالسؤال الجديد.
 *
 * لماذا: الذاكرة هي الفرق الحسّي بين أداة و«محلل يعمل معك منذ سنة». حين يقول
 * المساعد «جرّبت هذا في آذار ووجدت كذا، والظروف تغيّرت لأن…» يصبح شريكًا لا
 * مولّدًا. ولا نستخدم متجهات ضخمة: TF-IDF على الكلمات + تعزيز بالوسوم والمجموعة
 * يكفي لدقة عالية في هذا النطاق، ويعمل بلا اعتماد خارجي.
 */

export interface MemoryEntry {
  id: string;
  userId?: string;
  question: string;
  /** الاستنتاج أو الجواب المختصر. */
  answer: string;
  sql?: string;
  datasetId?: string;
  datasetName?: string;
  outcome?: 'positive' | 'negative' | 'inconclusive';
  tags?: string[];
  createdAt: string;
}

export interface MemoryHit {
  entry: MemoryEntry;
  score: number;
  /** لماذا ظهرت هذه النتيجة (شفافية التسجيل). */
  reason: string;
}

/** تطبيع بسيط متوافق مع العربية (تشكيل، همزات، أل). */
function normalize(input: string): string {
  return String(input || '')
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^a-z0-9\u0621-\u064A\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP = new Set(['the', 'and', 'for', 'of', 'in', 'on', 'ما', 'هل', 'من', 'في', 'على', 'عن', 'هذا', 'هذه', 'كم']);

export function tokens(input: string): string[] {
  return normalize(input)
    .split(' ')
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/**
 * تمثيل حرفي ثلاثي (character trigrams) — يكمّل TF-IDF حين تختلف الكلمة
 * نفسها بصيغة/إعراب/خطأ إملائي («مبيعات» ↔ «مبيعتها»)، وهو تشابه دلالي بلا
 * خدمة تضمين خارجية: لا بيانات تخرج، ولا مفتاح API، والنتيجة ثابتة وقابلة للاختبار.
 */
function trigramVector(text: string): Map<string, number> {
  const clean = ` ${normalize(text).replace(/\s+/g, ' ')} `;
  const vec = new Map<string, number>();
  for (let i = 0; i < clean.length - 2; i += 1) {
    const gram = clean.slice(i, i + 3);
    if (gram.trim().length < 2) continue;
    vec.set(gram, (vec.get(gram) || 0) + 1);
  }
  return vec;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  if (!a.size || !b.size) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, v] of a) {
    na += v * v;
    const w = b.get(k);
    if (w) dot += v * w;
  }
  for (const v of b.values()) nb += v * v;
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/** تشابه جيب التمام على TF-IDF محسوب من المجموعة نفسها + تشابه حرفي. */
export function rankMemory(query: string, entries: MemoryEntry[], limit = 5): MemoryHit[] {
  if (!entries.length) return [];
  const qTerms = tokens(query);
  if (!qTerms.length) return [];
  const docs = entries.map((e) => ({
    entry: e,
    terms: tokens(`${e.question} ${e.answer} ${(e.tags || []).join(' ')} ${e.datasetName || ''} ${e.sql || ''}`),
  }));
  const df = new Map<string, number>();
  for (const d of docs) {
    for (const t of new Set(d.terms)) df.set(t, (df.get(t) || 0) + 1);
  }
  const idf = (t: string) => Math.log(1 + docs.length / (1 + (df.get(t) || 0)));
  const qVec = new Map<string, number>();
  for (const t of qTerms) qVec.set(t, (qVec.get(t) || 0) + idf(t));

  const queryGrams = trigramVector(query);
  const hits: MemoryHit[] = [];
  for (const d of docs) {
    const tf = new Map<string, number>();
    for (const t of d.terms) tf.set(t, (tf.get(t) || 0) + 1);
    let dot = 0;
    let qNorm = 0;
    let dNorm = 0;
    for (const [t, w] of qVec) {
      qNorm += w * w;
      const docW = (tf.get(t) || 0) * idf(t);
      if (docW) dot += w * docW;
    }
    for (const [t, c] of tf) {
      const w = c * idf(t);
      dNorm += w * w;
    }
    const lexical = qNorm && dNorm ? dot / (Math.sqrt(qNorm) * Math.sqrt(dNorm)) : 0;
    const docText = `${d.entry.question} ${d.entry.answer} ${(d.entry.tags || []).join(' ')}`;
    const shape = cosine(queryGrams, trigramVector(docText));
    // الكلمة الدقيقة تبقى الأقوى، لكن الصياغة القريبة لم تعد صفرًا.
    const score = lexical * 0.7 + shape * 0.3;
    // التشابه الحرفي وحده يُغري بالإنذارات الكاذبة (كل نصّ عربي يشترك في "ما "
    // و"ال" متناثرة)، فيُشترط تشابه معجمي حقيقي أو تشابه حرفي عالٍ جدًّا.
    const relevant = lexical > 0.02 || shape >= 0.45;
    const shared = qTerms.filter((t) => tf.has(t));
    if (relevant) {
      hits.push({
        entry: d.entry,
        score: Number(score.toFixed(3)),
        reason: shared.length
          ? `تشابه في: ${shared.slice(0, 4).join('، ')}`
          : 'تشابه في الصياغة (لا الكلمات)',
      });
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

export interface ContradictionWarning {
  kind: 'repeated-negative' | 'changed-conditions' | 'prior-conflict';
  message: string;
  entry: MemoryEntry;
}

/**
 * تنبيهات تُبنى فوق الاسترجاع: «جرّبت هذا وفشل»، أو «الرقم تغيّر عن آخر مرة».
 * هذه الجملة وحدها تجعل المساعد يبدو أنه يتذكّر فعلًا.
 */
export function memoryWarnings(query: string, entries: MemoryEntry[], currentValue?: number): ContradictionWarning[] {
  const hits = rankMemory(query, entries, 3).filter((h) => h.score >= 0.25);
  const out: ContradictionWarning[] = [];
  for (const hit of hits) {
    if (hit.entry.outcome === 'negative') {
      out.push({
        kind: 'repeated-negative',
        message: `جرّبت سابقًا صياغة قريبة ونفيتها: «${hit.entry.answer.slice(0, 120)}». لا تُعِد التوصية بها دون سبب جديد.`,
        entry: hit.entry,
      });
    }
    const priorNumber = Number((hit.entry.answer.match(/-?\d[\d,.]*/) || [])[0]?.replace(/,/g, ''));
    if (currentValue !== undefined && Number.isFinite(priorNumber) && priorNumber !== 0) {
      const deltaPct = ((currentValue - priorNumber) / Math.abs(priorNumber)) * 100;
      if (Math.abs(deltaPct) >= 20) {
        out.push({
          kind: 'prior-conflict',
          message: `الرقم الآن ${currentValue.toLocaleString('en-US')} مقابل ${priorNumber.toLocaleString('en-US')} سابقًا (${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(0)}%) — اشرح الفرق بدل تقديمه كأنه جديد.`,
          entry: hit.entry,
        });
      }
    }
  }
  return out;
}

/** ملخّص سياق جاهز يُضاف إلى طلب المساعد. */
export function memoryContextBlock(query: string, entries: MemoryEntry[]): string {
  const hits = rankMemory(query, entries, 3).filter((h) => h.score >= 0.2);
  if (!hits.length) return '';
  return [
    'سياق من تحليلات سابقة (لا تُقدّمه كأنه جديد، بل اربطه):',
    ...hits.map((h) => `- (${new Date(h.entry.createdAt).toISOString().slice(0, 10)}) سؤال: ${h.entry.question.slice(0, 120)} → ${h.entry.answer.slice(0, 160)}`),
  ].join('\n');
}
