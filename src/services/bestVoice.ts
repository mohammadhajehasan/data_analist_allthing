/**
 * اختيار أفضل صوت عربي (أو إنجليزي) تلقائياً من أصوات النظام المثبتة.
 *
 * استراتيجية التقييم (أعلى مجموع يفوز):
 *  1. محركات معروفة بجودة عالية للعربية (Majed، Naayf، Hamed، Microsoft Neural، Google، Tarik، Laila) — وزن كبير
 *  2. صوت محلي (localService) بدل السحابي — استجابة أسرع وأقل انقطاعاً
 *  3. مطابقة اللهجة الدقيقة (ar-SA مثلاً) إن وُجدت — وزن متوسط
 *  4. fallback: أي صوت يطابق بادئة اللغة المطلوبة (ar / en)
 *
 * الاعتماد على مطابقة البادئة وحدها كافية — لا صوت مطابق → null
 * ليعتمد المتصفح صوته الافتراضي كما كان.
 */

/** محركات عربية عالية الجودة مرتبة من الأفضل (إيجابي كبير) إلى الضعيف (سالب) */
const ARABIC_ENGINE_SCORES: Array<[RegExp, number]> = [
  [/natural|neural|premium|enhanced/i, 120], // أصوات حديثة عالية الجودة (Core	voices المتصفح يستخدمها)
  [/maged|ماجد/i, 110],
  [/naayf|نايف/i, 100],
  [/hamed|حامد/i, 95],
  [/tarik|طارق/i, 90],
  [/salma|سلمى/i, 85],
  [/amany|أماني/i, 85],
  [/laila|ليلى/i, 75],
  [/maged|zeina|yan|noura/i, 60],
  [/google/i, 55],
  [/shakir/i, 45],
];

/** محركات إنجليزية عالية الجودة (secondary — للموجز الإنجليزي) */
const ENGLISH_ENGINE_SCORES: Array<[RegExp, number]> = [
  [/natural|neural|premium|enhanced/i, 120],
  [/aria|guy|jenny|sonia|ryan/i, 100],
  [/google/i, 60],
];

/**
 * إرجاع أفضل صوت مطابق للغة المطلوبة (ar-SA / en-US مثلاً) من أصوات النظام،
 * أو null إن لم يوجد أي صوت (حينها المتصفح يستخدمه صوت افتراضي).
 *
 * النتيجة مخزنة مؤقتاً — أصوات النظام لا تتغير أثناء الجلسة.
 */
export function pickBestVoice(
  lang: 'ar-SA' | 'en-US',
  speechSynthesis: SpeechSynthesis | undefined = typeof window !== 'undefined' ? window.speechSynthesis : undefined
): SpeechSynthesisVoice | null {
  if (!speechSynthesis) return null;

  const voices = speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const isArabic = lang.startsWith('ar');
  const prefix = isArabic ? 'ar' : 'en';
  const exact = lang.toLowerCase();

  // مطابقة دقيقة أولاً (ar-SA / en-US installed exactly)
  const exactMatches = voices.filter(v => (v.lang || '').toLowerCase().replace('_','-') === exact);
  const prefixMatches = voices.filter(v =>
    (v.lang || '').toLowerCase().startsWith(prefix + '-')
    || (v.lang || '').toLowerCase() === prefix
    || (isArabic && /arabic|عربي/i.test(v.name || ''))
    || (!isArabic && /english/i.test(v.name || ''))
  );

  // أضف أي صوت مطابق ببادئة اللغة المطلوبة إن لم يوجد مطابق دقيق
  const candidates = exactMatches.length > 0 ? exactMatches : prefixMatches;
  if (candidates.length === 0) return null;

  const engineScores = isArabic ? ARABIC_ENGINE_SCORES : ENGLISH_ENGINE_SCORES;

  const scoreOf = (v: SpeechSynthesisVoice): number => {
    const name = v.name || '';
    let score = 0;
    for (const [re, pts] of engineScores) {
      if (re.test(name)) { score += pts; break; } // أعلى مصنف يتطابق فقط
    }
    if (v.localService) score += 30; // محلي = استجابة أسرع
    if ((v.lang || '').toLowerCase() === exact) score += 25; // مطابقة اللهجة الكاملة
    return score;
  };

  return candidates.reduce((best, v) => (scoreOf(v) > scoreOf(best) ? v : best), candidates[0]);
}

/**
 * اضبط الصوت المثالي على النسق (utterance) — لا شيء إن لم يوجد صوت مطابق
 * (المتصفح سيتعامل مع الصوت الافتراضي مع الإعدادات الأصلية).
 */
export function applyBestVoice(
  utterance: SpeechSynthesisUtterance,
  lang: 'ar-SA' | 'en-US',
  speechSynthesis?: SpeechSynthesis
): void {
  const voice = pickBestVoice(lang, speechSynthesis);
  if (voice) {
    utterance.voice = voice;
    // مطابقة lang مع لغة الصوت المختار يرفع دقة النطق في بعض المتصفحات
    utterance.lang = voice.lang || lang;
  }
}
