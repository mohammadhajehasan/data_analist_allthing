/**
 * أدوات إحصائية مشتركة لمحرّكات «الذكاء التحليلي».
 *
 * لماذا ملف مستقل: أكثر من محرّك (الصرامة الإحصائية، الاختبار المتسلسل، محاكي
 * السيناريو) يحتاج نفس الكمّيات الحرجة (z، t، قوة الاختبار). تكرارها في كل
 * ملف يجعل نسخةً واحدة تُصحَّح وباقيها لا — وهذا أسوأ من خطأ واضح.
 */

/** كمّية التوزيع الطبيعي القياسي (Acklam) — دقة ~1e-9 وهي كافية تمامًا هنا. */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) throw new Error('normalQuantile: p يجب أن يكون بين 0 و1');
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;
  let q: number, r: number;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - plow) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5;
  r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** دالة التوزيع التراكمي للتوزيع الطبيعي القياسي. */
export function normalCdf(z: number): number {
  // erf تقريبية عالية الدقة (Abramowitz & Stegun 7.1.26)
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** قيمة p ثنائية الطرف من إحصاء z. */
export function pValueTwoSided(z: number): number {
  return Math.min(1, 2 * (1 - normalCdf(Math.abs(z))));
}

/**
 * كمّية توزيع t — تقريب Cornish–Fisher بدرجات حرية ν.
 * دقّته كافية لقرارات عملية (خطأ < 0.01 عند ν ≥ 5) ويتجنّب مكتبة كاملة.
 */
export function tQuantile(p: number, df: number): number {
  if (df <= 0) throw new Error('tQuantile: df يجب أن تكون موجبة');
  const z = normalQuantile(p);
  const v = df;
  return (
    z +
    (z ** 3 + z) / (4 * v) +
    (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * v ** 2) +
    (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / (384 * v ** 3)
  );
}

/** متوسط مصفوفة أرقام (NaN يُهمَل). */
export function mean(values: number[]): number {
  const clean = values.filter((v) => Number.isFinite(v));
  return clean.length ? clean.reduce((s, v) => s + v, 0) / clean.length : NaN;
}

/** انحراف معياري للعيّنة. */
export function sd(values: number[]): number {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length < 2) return NaN;
  const m = mean(clean);
  return Math.sqrt(clean.reduce((s, v) => s + (v - m) ** 2, 0) / (clean.length - 1));
}

/** وسيط مصفوفة. */
export function median(values: number[]): number {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!clean.length) return NaN;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

/** مركّب: MAD (وسيط الانحرافات المطلقة) — أساس z القوي. */
export function medianAbsoluteDeviation(values: number[]): number {
  const m = median(values);
  if (!Number.isFinite(m)) return NaN;
  return median(values.map((v) => Math.abs(v - m)));
}

/** تقريب صيغة معكوس الدالة العادية — للاستخدام في حساب القوة/حجم العيّنة. */
export function approxNormalQuantile(p: number): number {
  return normalQuantile(p);
}
