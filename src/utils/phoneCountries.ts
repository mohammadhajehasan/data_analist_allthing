/**
 * أرقام الهاتف الوطنية حسب الدولة — الوحدة المشتركة بين الخادم والعميل.
 * - الخادم يستخدمها للتحقق الإلزامي عند طلب رمز إعادة التعيين عبر الهاتف.
 * - العميل يستخدمها لبناء منتقي رمز الدولة والتحقق أثناء الكتابة.
 * النمط pattern يُطبَّق على الأرقام الوطنية بعد حذف رمز الدولة وصفر الشهر (0/00).
 */

export interface PhoneCountry {
  code: string;       // ISO 3166-1 alpha-2
  dial: string;       // رمز الاتصال الدولي (بدون +)
  name: string;
  nameAr: string;
  flag: string;       // رمز علم
  // نمط الأرقام الوطنية الصالحة (بدون رمز الدولة).
  pattern: string;
  example: string;    // مثال بصري في الواجهة (بدون رمز الدولة)
}

// الترتيب: العالم العربي أولاً ثم الدول الشائعة لمستخدمي المنصة.
export const PHONE_COUNTRIES: PhoneCountry[] = [
  { code: 'SY', dial: '963',  name: 'Syria',            nameAr: 'سوريا',                 flag: '🇸🇾', pattern: '^(9[0-9]{8}|[1-8][0-9]{7})$', example: '991758886' },
  { code: 'SA', dial: '966',  name: 'Saudi Arabia',     nameAr: 'السعودية',              flag: '🇸🇦', pattern: '^5[0-9]{8}$',                 example: '512345678' },
  { code: 'AE', dial: '971',  name: 'UAE',              nameAr: 'الإمارات',              flag: '🇦🇪', pattern: '^5[0-9]{8}$',                 example: '501234567' },
  { code: 'QA', dial: '974',  name: 'Qatar',            nameAr: 'قطر',                   flag: '🇶🇦', pattern: '^[3567][0-9]{7}$',            example: '50123456' },
  { code: 'KW', dial: '965',  name: 'Kuwait',           nameAr: 'الكويت',                flag: '🇰🇼', pattern: '^[5-9][0-9]{7}$',             example: '50123456' },
  { code: 'BH', dial: '973',  name: 'Bahrain',          nameAr: 'البحرين',               flag: '🇧🇭', pattern: '^[36][0-9]{7}$',              example: '30123456' },
  { code: 'OM', dial: '968',  name: 'Oman',             nameAr: 'عُمان',                 flag: '🇴🇲', pattern: '^[279][0-9]{7}$',             example: '90123456' },
  { code: 'JO', dial: '962',  name: 'Jordan',           nameAr: 'الأردن',                flag: '🇯🇴', pattern: '^7[789][0-9]{7}$',            example: '791234567' },
  { code: 'LB', dial: '961',  name: 'Lebanon',          nameAr: 'لبنان',                 flag: '🇱🇧', pattern: '^([37][0-9]{7}|77[0-9]{7}|81[0-9]{7})$', example: '70123456' },
  { code: 'PS', dial: '970',  name: 'Palestine',        nameAr: 'فلسطين',                flag: '🇵🇸', pattern: '^5[0-9]{8}$',                 example: '591234567' },
  { code: 'IQ', dial: '964',  name: 'Iraq',             nameAr: 'العراق',                flag: '🇮🇶', pattern: '^7[3-9][0-9]{8}$',            example: '7712345678' },
  { code: 'EG', dial: '20',   name: 'Egypt',            nameAr: 'مصر',                   flag: '🇪🇬', pattern: '^1[0125][0-9]{8}$',           example: '1012345678' },
  { code: 'YE', dial: '967',  name: 'Yemen',            nameAr: 'اليمن',                 flag: '🇾🇪', pattern: '^7[13679][0-9]{7}$',          example: '712345678' },
  { code: 'LY', dial: '218',  name: 'Libya',            nameAr: 'ليبيا',                 flag: '🇱🇾', pattern: '^9[1-9][0-9]{7}$',            example: '911234567' },
  { code: 'TN', dial: '216',  name: 'Tunisia',          nameAr: 'تونس',                  flag: '🇹🇳', pattern: '^[2-9][0-9]{7}$',             example: '20123456' },  { code: 'DZ', dial: '213',  name: 'Algeria',           nameAr: 'الجزائر',                flag: '🇩🇿', pattern: '^([5-7][0-9]{8}|[1-4][0-9]{7})$', example: '551234567' },  { code: 'MA', dial: '212',  name: 'Morocco',           nameAr: 'المغرب',                 flag: '🇲🇦', pattern: '^([5-7][0-9]{8}|[5-7][0-9]{8})$', example: '612345678' },
  { code: 'SD', dial: '249',  name: 'Sudan',            nameAr: 'السودان',               flag: '🇸🇩', pattern: '^9[0-9]{8}$',                 example: '911234567' },
  { code: 'TR', dial: '90',   name: 'Turkey',           nameAr: 'تركيا',                 flag: '🇹🇷', pattern: '^5[0-9]{9}$',                 example: '5012345678' },
  { code: 'US', dial: '1',    name: 'USA',              nameAr: 'الولايات المتحدة',      flag: '🇺🇸', pattern: '^[2-9][0-9]{9}$',             example: '2012345678' },
  { code: 'CA', dial: '1',    name: 'Canada',           nameAr: 'كندا',                  flag: '🇨🇦', pattern: '^[2-9][0-9]{9}$',             example: '5012345678' },
  { code: 'GB', dial: '44',   name: 'United Kingdom',   nameAr: 'المملكة المتحدة',       flag: '🇬🇧', pattern: '^7[0-9]{9}$',                 example: '7400123456' },
  { code: 'DE', dial: '49',   name: 'Germany',          nameAr: 'ألمانيا',               flag: '🇩🇪', pattern: '^1[5-7][0-9]{8}$',            example: '1512345678' },
  { code: 'FR', dial: '33',   name: 'France',           nameAr: 'فرنسا',                 flag: '🇫🇷', pattern: '^[67][0-9]{8}$',              example: '612345678' },
  { code: 'IT', dial: '39',   name: 'Italy',            nameAr: 'إيطاليا',               flag: '🇮🇹', pattern: '^3[0-9]{9}$',                 example: '3123456789' },
  { code: 'ES', dial: '34',   name: 'Spain',            nameAr: 'إسبانيا',               flag: '🇪🇸', pattern: '^[67][0-9]{8}$',              example: '612345678' },
  { code: 'NL', dial: '31',   name: 'Netherlands',      nameAr: 'هولندا',                flag: '🇳🇱', pattern: '^6[0-9]{8}$',                 example: '612345678' },
  { code: 'SE', dial: '46',   name: 'Sweden',           nameAr: 'السويد',                flag: '🇸🇪', pattern: '^7[0-9]{8}$',                 example: '701234567' },
  { code: 'RU', dial: '7',    name: 'Russia',           nameAr: 'روسيا',                 flag: '🇷🇺', pattern: '^9[0-9]{9}$',                 example: '9012345678' },
  { code: 'CN', dial: '86',   name: 'China',            nameAr: 'الصين',                 flag: '🇨🇳', pattern: '^1[3-9][0-9]{9}$',            example: '13123456789' },
  { code: 'JP', dial: '81',   name: 'Japan',            nameAr: 'اليابان',               flag: '🇯🇵', pattern: '^[789]0[0-9]{8}$',             example: '9012345678' },
  { code: 'KR', dial: '82',   name: 'South Korea',      nameAr: 'كوريا الجنوبية',        flag: '🇰🇷', pattern: '^1[0-8][0-9]{8}$',            example: '1012345678' },
  { code: 'IN', dial: '91',   name: 'India',            nameAr: 'الهند',                 flag: '🇮🇳', pattern: '^[6-9][0-9]{9}$',             example: '9812345678' },
  { code: 'PK', dial: '92',   name: 'Pakistan',         nameAr: 'باكستان',               flag: '🇵🇰', pattern: '^3[0-9]{9}$',                 example: '3012345678' },
  { code: 'ID', dial: '62',   name: 'Indonesia',        nameAr: 'إندونيسيا',             flag: '🇮🇩', pattern: '^8[0-9]{8,11}$',              example: '8123456789' },
  { code: 'MY', dial: '60',   name: 'Malaysia',         nameAr: 'ماليزيا',               flag: '🇲🇾', pattern: '^1[0-9]{8,9}$',               example: '123456789' },
  { code: 'SG', dial: '65',   name: 'Singapore',        nameAr: 'سنغافورة',              flag: '🇸🇬', pattern: '^[89][0-9]{7}$',              example: '81234567' },
  { code: 'NG', dial: '234',  name: 'Nigeria',          nameAr: 'نيجيريا',               flag: '🇳🇬', pattern: '^([789][0-9]{9}|0[7-9][0-9]{9})$', example: '8012345678' },
  { code: 'ZA', dial: '27',   name: 'South Africa',     nameAr: 'جنوب أفريقيا',          flag: '🇿🇦', pattern: '^[1-8][0-9]{8}$',             example: '711234567' },
  { code: 'KE', dial: '254',  name: 'Kenya',            nameAr: 'كينيا',                 flag: '🇰🇪', pattern: '^([17][0-9]{8}|[2-9][0-9]{8})$', example: '711234567' },
  { code: 'AU', dial: '61',   name: 'Australia',        nameAr: 'أستراليا',              flag: '🇦🇺', pattern: '^4[0-9]{8}$',                 example: '412345678' },
  { code: 'NZ', dial: '64',   name: 'New Zealand',      nameAr: 'نيوزيلندا',             flag: '🇳🇿', pattern: '^2[0-9]{7,9}$',               example: '211234567' },
  { code: 'BR', dial: '55',   name: 'Brazil',           nameAr: 'البرازيل',              flag: '🇧🇷', pattern: '^[1-9][0-9]{10}$',            example: '11987654321' },
  { code: 'MX', dial: '52',   name: 'Mexico',           nameAr: 'المكسيك',               flag: '🇲🇽', pattern: '^[1-9][0-9]{9}$',             example: '3121234567' },
  { code: 'AR', dial: '54',   name: 'Argentina',        nameAr: 'الأرجنتين',             flag: '🇦🇷', pattern: '^9?[1-9][0-9]{8,9}$',         example: '9112345678' },
];

export function normalizePhone(countryDial: string, rawNational: string): string {
  const digits = String(rawNational || '').replace(/[^0-9]/g, '');
  // يُدخل العرب بادئة دولية (00) أو صفراً شهرياً (0) — تُحذف قبل التركيب.
  const trimmed = digits.replace(/^0{1,2}/, '');
  return `+${String(countryDial || '').replace(/[^0-9]/g, '')}${trimmed}`;
}

export interface PhoneValidation {
  valid: boolean;
  nationalDigits: string; // الرقم الوطني المُصفّى (بلا رمز الدولة)
  errorKey?: 'empty' | 'country' | 'format';
  country?: PhoneCountry;
}

/** تحقق وطني صارم: بلد معروف + نمط أرقام الدولة (سوريا مثلاً ‏:9 أرقام تبدأ 9). */
export function validatePhoneNational(countryDial: string, rawNational: string): PhoneValidation {
  const national = String(rawNational || '').replace(/[^0-9]/g, '').replace(/^0{1,2}/, '');
  if (!national) {
    return { valid: false, nationalDigits: '', errorKey: 'empty', country: UNKNOWN };
  }
  const dial = String(countryDial || '').replace(/[^0-9]/g, '');
  const country = PHONE_COUNTRIES.find((c) => c.dial === dial);
  if (!country) {
    return { valid: false, nationalDigits: national, errorKey: 'country' };
  }
  const valid = new RegExp(country.pattern).test(national);
  return { valid, nationalDigits: national, errorKey: valid ? undefined : 'format', country };
}

export const UNKNOWN: PhoneCountry = {
  code: 'XX', dial: '', name: 'Unknown', nameAr: 'غير معروف', flag: '🏳️',
  pattern: '^[0-9]{6,14}$', example: '',
};
