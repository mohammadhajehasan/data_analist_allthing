/**
 * بوابة الالتقاط التلقائي للذاكرة.
 *
 * لماذا بوابة أصلًا: الالتقاط «لكل ردّ» يملأ الذاكرة بأسئلة ترحيب ومجاملات،
 * فيصير استرجاع «آخر تحليل مشابه» يضخّم الضجيج ويقترح ذكريات لا معنى لها.
 * القاعدة: يُحفظ التحليل لا المحادثة — أي ردّ قام عليه دليل محسوب، ولم يكن
 * تكرارًا شبه حرفي لما هو محفوظ، ولم يكن اعتذارًا/فشلًا.
 */

import { rankMemory, type MemoryEntry } from './analystMemory';

/**
 * فوق هذا الحد يُعدّ السؤال مكرّرًا. القيمة مُعايرة على الواقع: السؤال نفسه
 * باختلاف تشكيل/حرف واحد ≈ 0.70، وسؤال بنفس الصيغة لكن مدينة مختلفة ≈ 0.54.
 * فحدّ 0.68 يلتقط الأول ولا يخنق الثاني.
 */
export const MEMORY_DUPLICATE_SCORE = 0.68;
const MIN_QUESTION_CHARS = 8;
const MIN_ANSWER_CHARS = 40;
// لا \b هنا: حدود الكلمة في JS مبنية على [A-Za-z0-9_]، فلا ترى حدود الكلمة العربية.
const APOLOGY = /^(?:عذرًا|عذرا|آسف|لا أستطيع|تعذّر|تعذر|sorry|i can't|i cannot|unable to)(?=\s|،|,|$)/i;

export interface MemoryCaptureInput {
  message: string;
  reply: string;
  /** عدد الأدلة المحسوبة المصاحبة للردّ. صفر = محادثة لا تحليل. */
  evidenceCount: number;
  existing: Array<Pick<MemoryEntry, 'id' | 'question' | 'answer' | 'createdAt'>>;
}

export interface MemoryCaptureDecision {
  capture: boolean;
  /** سبب القرار — يُسجَّل في الخادم عند التخطي، فيمكن تشخيصه لاحقًا. */
  reason: string;
  /** أعلى تشابه مع ذكرى موجودة (0..1) إن وُجدت. */
  similarity?: number;
}

export function shouldCaptureMemory(input: MemoryCaptureInput): MemoryCaptureDecision {
  const message = String(input.message || '').trim();
  const reply = String(input.reply || '').trim();

  if (message.length < MIN_QUESTION_CHARS) {
    return { capture: false, reason: 'السؤال قصير جدًا — غالبًا مجاملة أو كلمة واحدة' };
  }
  if (reply.length < MIN_ANSWER_CHARS) {
    return { capture: false, reason: 'الردّ قصير جدًا — لا يحمل استنتاجًا يُحفظ' };
  }
  if (input.evidenceCount <= 0) {
    return { capture: false, reason: 'لا دليل محسوب — محادثة عامة لا تحليل يستحق التذكّر' };
  }
  if (APOLOGY.test(reply)) {
    return { capture: false, reason: 'الردّ اعتذار/فشل — لا يُحفظ كتحليل' };
  }

  const existing = input.existing as MemoryEntry[];
  const top = existing.length ? rankMemory(message, existing, 1)[0] : undefined;
  if (top && top.score >= MEMORY_DUPLICATE_SCORE) {
    return { capture: false, reason: 'سؤال مكرّر شبه حرفيًا لذكرى موجودة', similarity: top.score };
  }

  return { capture: true, reason: 'تحليل مسنَد بدليل جديد', similarity: top?.score };
}
