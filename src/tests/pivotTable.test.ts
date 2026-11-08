import { describe, it, expect } from 'vitest';
import { buildPivotMatrix, cleanNumeric } from '../utils/pivotTable';

/** بيانات المقال نفسها: مبيعات IT حسب الفئة (Quarter) × الفئة الفرعية (Category) */
const SAMPLE = [
  { Q: 'Q1', Cat: 'Accessories', Sales: 2000 },
  { Q: 'Q1', Cat: 'Software', Sales: 5000 },
  { Q: 'Q1', Cat: 'Software', Sales: 4000 },
  { Q: 'Q2', Cat: 'Peripherals', Sales: 3000 },
  { Q: 'Q2', Cat: 'Accessories', Sales: 1000 },
];

describe('محرّك الجداول المحورية — index × columns × aggfunc', () => {
  it('المصفوفة sum: خلية = مجموع ولا قيمة مفقودة داخل الحواف', () => {
    const p = buildPivotMatrix(SAMPLE, 'Q', 'Cat', 'Sales', 'sum');
    expect(p.rowKeys).toEqual(['Q1', 'Q2']);
    expect(p.colKeys).toEqual(['Accessories', 'Software', 'Peripherals']);
    expect(p.values[0][0]).toBe(2000);        // Q1 × Accessories
    expect(p.values[0][1]).toBe(9000);        // Q1 × Software = 5000+4000
    expect(p.values[1][2]).toBe(3000);        // Q2 × Peripherals
    // الإجماليات
    expect(p.rowTotals[0]).toBe(11000);       // Q1 كاتل
    expect(p.colTotals[1]).toBe(9000);        // عمود Software
    expect(p.grandTotal).toBe(15000);
    expect(p.emptyCells).toBe(2);             // Q1×Peripherals و Q2×Software
  });

  it('المصفوفة avg و count و min و max و median', () => {
    const avg = buildPivotMatrix(SAMPLE, 'Q', 'Cat', 'Sales', 'avg');
    expect(avg.values[0][1]).toBe(4500);      // متوسط Q1×Software
    const count = buildPivotMatrix(SAMPLE, 'Q', 'Cat', 'Sales', 'count');
    expect(count.values[0][1]).toBe(2);
    expect(count.values[1][0]).toBe(1);
    const min = buildPivotMatrix(SAMPLE, 'Q', 'Cat', 'Sales', 'min');
    expect(min.values[0][1]).toBe(4000);
    const max = buildPivotMatrix(SAMPLE, 'Q', 'Cat', 'Sales', 'max');
    expect(max.values[1][0]).toBe(1000);
    const med = buildPivotMatrix(SAMPLE, 'Q', 'Cat', 'Sales', 'median');
    expect(med.values[0][1]).toBe(4500);
  });

  it('الترتيب بالتسلسل المزمع — غير مفروز أبجدياً', () => {
    const reversed = [
      { k: 'B', m: 'Y', v: 5 },
      { k: 'B', m: 'X', v: 3 },
      { k: 'A', m: 'Y', v: 9 },
    ];
    const p = buildPivotMatrix(reversed, 'k', 'm', 'v', 'sum');
    // بالظهور لا بالفرز
    expect(p.rowKeys).toEqual(['B', 'A']);
    expect(p.colKeys).toEqual(['Y', 'X']);
    expect(p.values[1][1]).toBeNull();        // A × X لا بيانات عنها
  });

  it('يقبل قيماً نصية ركيكة ($, %, فواصل) ويتسامح مع القيم المفقودة', () => {
    const messy = [
      { r: 'أ', c: 'س', v: '$1,200' },
      { r: 'أ', c: 'س', v: '45%' },
      { r: 'أ', c: 'س', v: undefined },
      { r: 'ب', c: 'س', v: '8th' },          // parseFloat يقف عند 8
    ];
    const p = buildPivotMatrix(messy, 'r', 'c', 'v', 'sum');
    expect(p.values[0][0]).toBe(1245);
    expect(p.values[1][0]).toBe(8);
  });

  it('حالات فارغة/ناقصة لا تنفجر', () => {
    expect(buildPivotMatrix(null, 'r', 'c', 'v').grandTotal).toBe(0);
    expect(buildPivotMatrix([], 'r', 'c', 'v').rowKeys).toEqual([]);
    // حقل قيمة مفقود
    const p = buildPivotMatrix(SAMPLE, 'Q', 'Cat', 'missingField', 'sum');
    expect(p.emptyCells).toBe(6);
    expect(p.grandTotal).toBe(0);
  });

  it('cleanNumeric: أرقام أنيقة وعقيمة هم كلها NaN', () => {
    expect(cleanNumeric('  $1,234.56 ')).toBe(1234.56);
    expect(cleanNumeric(42)).toBe(42);
    expect(cleanNumeric(null)).toBeNaN();
    expect(cleanNumeric('abc')).toBeNaN();
  });
});
