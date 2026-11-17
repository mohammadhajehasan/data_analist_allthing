/**
 * تعريب أسماء أطوار الموسمية.
 *
 * الأسماء تأتي من `buildPhaseLabels` في forecastUtils مشتقةً من تسميات السلسلة
 * نفسها: Jan…Dec للأشهر، Sun…Sat لأيام الأسبوع، Q1…Q4 للأرباع، W3 لأسبوع داخل
 * الدورة، و#5 لطور بلا اسم. الواجهة العربية تعرضها معرّبة، وأي تسمية غير
 * معروفة تُترك كما هي بدل إخفائها.
 */
const AR_MONTHS: Record<string, string> = {
  Jan: 'يناير', Feb: 'فبراير', Mar: 'مارس', Apr: 'أبريل', May: 'مايو', Jun: 'يونيو',
  Jul: 'يوليو', Aug: 'أغسطس', Sep: 'سبتمبر', Oct: 'أكتوبر', Nov: 'نوفمبر', Dec: 'ديسمبر',
};

const AR_WEEKDAYS: Record<string, string> = {
  Sunday: 'الأحد', Monday: 'الاثنين', Tuesday: 'الثلاثاء', Wednesday: 'الأربعاء',
  Thursday: 'الخميس', Friday: 'الجمعة', Saturday: 'السبت',
};

const AR_QUARTERS = ['الأول', 'الثاني', 'الثالث', 'الرابع'];

export function localizePhaseLabel(label: string, language?: string): string {
  const text = (label || '').trim();
  if (!text || language !== 'ar') return text;
  if (AR_MONTHS[text]) return AR_MONTHS[text];
  if (AR_WEEKDAYS[text]) return AR_WEEKDAYS[text];
  // نصف سنوي يأتي كمدى: "Jan–Jun"
  const range = /^([A-Za-z]{3})–([A-Za-z]{3})$/.exec(text);
  if (range && AR_MONTHS[range[1]] && AR_MONTHS[range[2]]) {
    return `${AR_MONTHS[range[1]]}–${AR_MONTHS[range[2]]}`;
  }
  const quarter = /^Q([1-4])$/.exec(text);
  if (quarter) return `الربع ${AR_QUARTERS[Number(quarter[1]) - 1]}`;
  const week = /^W(\d+)$/.exec(text);
  if (week) return `الأسبوع ${week[1]}`;
  const phase = /^#(\d+)$/.exec(text);
  if (phase) return `الطور ${phase[1]}`;
  return text;
}
