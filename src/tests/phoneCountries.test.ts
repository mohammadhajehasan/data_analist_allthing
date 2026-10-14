import { describe, it, expect } from 'vitest';
import { PHONE_COUNTRIES, validatePhoneNational, normalizePhone } from '../utils/phoneCountries';
import { parseE164 } from '../../server/passwordReset';

describe('validatePhoneNational — سوريا (963)', () => {
  it('يقبل رقم المحمول السوري 9 أرقام يبدأ بـ 9 — +963991758886', () => {
    const v = validatePhoneNational('963', '991758886');
    expect(v.valid).toBe(true);
    expect(v.nationalDigits).toBe('991758886');
  });
  it('يقبل الأرقام الأرضية (8 أرقام تبدأ 1-8)', () => {
    expect(validatePhoneNational('963', '11234567').valid).toBe(true);
  });
  it('يحذف الصفر الشهري 0991758886 → 991758886', () => {
    expect(validatePhoneNational('963', '0991758886').nationalDigits).toBe('991758886');
  });
  it('يرفض الرقم القصير (8 أرقام لموبايل)', () => {
    expect(validatePhoneNational('963', '99175888').valid).toBe(false);
  });
  it('يرفض موبايل لا يبدأ بـ 9', () => {
    expect(validatePhoneNational('963', '891758886').valid).toBe(false);
  });
});

describe('validatePhoneNational — تنوع الدول', () => {
  const cases: Array<[string, string, boolean]> = [
    ['966', '512345678', true],   // السعودية
    ['971', '501234567', true],   // الإمارات
    ['962', '791234567', true],   // الأردن
    ['20',  '1012345678', true],  // مصر
    ['1',   '2012345678', true],  // أمريكا
    ['90',  '5012345678', true],  // تركيا
    ['49',  '1512345678', true],  // ألمانيا
    ['966', '412345678', false],  // سعودي لا يبدأ بـ 5
    ['20',  '2012345678', false], // مصري طوله خاطئ (9 بدل 10)
    ['',    '991758886', false], // دولة غير معروفة
  ];
  for (const [dial, nat, ok] of cases) {
    it(`${ok ? 'يقبل' : 'يرفض'} +${dial || '؟'} ${nat}`, () => {
      expect(validatePhoneNational(dial, nat).valid).toBe(ok);
    });
  }
});

describe('normalizePhone', () => {
  it('يبني E.164: 963 + 00991758886 → +963991758886', () => {
    expect(normalizePhone('963', '00991758886')).toBe('+963991758886');
  });
});

describe('parseE164 — الخادم', () => {
  it('يترجم +963991758886 إلى E.164 وطني سوري صالح', () => {
    const p: any = parseE164('+963 991 758 886');
    expect(p.ok).toBe(true);
    expect(p.e164).toBe('+963991758886');
    expect(p.dial).toBe('963');
    expect(p.national).toBe('991758886');
    expect(p.country.code).toBe('SY');
  });
  it('يقبل التنسيقات الموّد (+963-991-758-886 وبأقواس)', () => {
    expect(parseE164('+963-991-758-886').ok).toBe(true);
  });
  it('يرفض رقم السارية المالكة', () => { /* country pattern */
    expect(parseE164('+96399175888').ok).toBe(false);
  });
  it('يرفض رمز دولة غير مدعوم', () => {
    expect(parseE164('+999123456').ok).toBe(false);
  });
  it('يرفض أعداد بلا +', () => {
    expect(parseE164('963991758886').ok).toBe(false);
  });
  it('الأمثلة في القائمة كلها صالحة (سائر الدول)', () => {
    for (const c of PHONE_COUNTRIES) {
      if (c.code === 'XX') continue;
      const v = validatePhoneNational(c.dial, c.example.replace(/\D/g, ''));
      expect([c.code, c.example, v.valid ? 'valid' : `invalid (${v.errorKey})`].join(' ')).toBe(
        [c.code, c.example, 'valid'].join(' ')
      );
    }
  });
});
