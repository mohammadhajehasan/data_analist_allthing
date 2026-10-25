import { describe, it, expect } from 'vitest';
import { computeHistogramBins, type HistogramBin } from '../ChartFactory';

/**
 * اختبارات محرك صناديق التوزيع (Histogram Bins) — عقديات منفصلة عن الرسم:
 *   1) الحدود: كل صندوق [min+i·w, min+(i+1)·w) وكلها مجاورة بعرض متساوٍ.
 *   2) العدد: √N محكوم [5, 15]، وبند واحد متساوي القيم، والفراغ صفري.
 *   3) الحفظ: مجموع (value) = عدد القيم الصالحة بالضبط — لا سجل يضيع.
 */

/** يفك اسم الصندوق "lo–hi" إلى نطاق رقمي حقيقي (يفهم صيغة k للألف) */
function binRange(bin: HistogramBin): [number, number] {
  const [lo, hi] = bin.name.split('–');
  const toNum = (s: string) =>
    s.endsWith('k') ? parseFloat(s.slice(0, -1)) * 1000 : parseFloat(s);
  return [toNum(lo), toNum(hi)];
}

describe('computeHistogramBins — الفراغatives والمدخلات غيرالرقمية', () => {
  it('يرجع مصفوفة فارغة لمدخلات فارغة/عمود ناقص/لا أعمدة رقمية', () => {
    expect(computeHistogramBins([], 'sales')).toEqual([]);
    expect(computeHistogramBins(undefined, 'sales')).toEqual([]);
    expect(computeHistogramBins(null, 'sales')).toEqual([]);
    expect(computeHistogramBins([{ name: 'x', value: 'a' }], '')).toEqual([]);
    expect(computeHistogramBins([{ name: 'x', value: 'text' }], 'value')).toEqual([]);
  });

  it('يستخرج الأرقام من الصيغ المالكة $ و % و', () => {
    const rows = [{ v: '$1,200' }, { v: '45%' }, { v: 30 }];
    const bins = computeHistogramBins(rows, 'v');
    const total = bins.reduce((s, b) => s + b.value, 0);
    expect(total).toBe(3);
  });

  it('يتجاهل NaN والقيم الفاسدة دون إسقاط البقية', () => {
    const rows = [{ v: 1 }, { v: 'not-a-number' }, { v: 2 }, { v: NaN }, { v: undefined }, { v: 3 }];
    const bins = computeHistogramBins(rows, 'v');
    const total = bins.reduce((s, b) => s + b.value, 0);
    expect(total).toBe(3); // 1, 2, 3 فقط
  });
});

describe('computeHistogramBins — عدد الصناديق √N محكوم [5, 15]', () => {
  it('N=36 → صناديق = 6 (√36)', () => {
    const rows = Array.from({ length: 36 }, (_, i) => ({ v: i }));
    expect(computeHistogramBins(rows, 'v')).toHaveLength(6);
  });

  it('N=10 → الأدنى 5 (ceil(√10)=4 محكوم لأعلى إلى 5)', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ v: i }));
    expect(computeHistogramBins(rows, 'v')).toHaveLength(5);
  });

  it('N≥225 → الحد الأقصى 15 صندوقاً', () => {
    const rows = Array.from({ length: 300 }, (_, i) => ({ v: i }));
    expect(computeHistogramBins(rows, 'v')).toHaveLength(15);
  });

  it('قيم متساوية fetching كلها المعروفة — صندوق وحيد يحمل كل السجلات', () => {
    const rows = [{ v: 7 }, { v: 7 }, { v: 7 }, { v: '7' }];
    const bins = computeHistogramBins(rows, 'v');
    expect(bins).toHaveLength(1);
    expect(bins[0].value).toBe(4);
    expect(bins[0].count).toBe(4);
  });
});

describe('computeHistogramBins — حدو الأصادمي ومجانتها', () => {
  it('الصناديق مجاورة: نهاية كل صندوق = بداية التالي بعرض متساو', () => {
    const rows = Array.from({ length: 64 }, (_, i) => ({ v: i * 3 }));
    const bins = computeHistogramBins(rows, 'v');
    expect(bins.length).toBeGreaterThan(1);
    for (let i = 1; i < bins.length; i++) {
      const [, hiPrev] = binRange(bins[i - 1]);
      const [loThis] = binRange(bins[i]);
      expect(hiPrev).toBeCloseTo(loThis, 6);
    }
    // الصندوق الأول يبدأ من min وصندوق الأخير ينتهي عند max
    const [firstLo] = binRange(bins[0]);
    const [, lastHi] = binRange(bins[bins.length - 1]);
    expect(firstLo).toBeCloseTo(0, 6);
    expect(lastHi).toBeCloseTo(63 * 3, 6);
  });

  it('كل سجل يقع في صندوق واحد فقط: توزيع متتالي على الحد الحدودي', () => {
    // القيمة الأقصى نفسها تُحبَر في آخر صندوق (الحد السفلي المشرع)
    const rows = [0, 10, 20, 30, 40, 50, 60].map(v => ({ v: v }));
    const bins = computeHistogramBins(rows, 'v');
    const totalInBins = bins.reduce((s, b) => s + b.value, 0);
    expect(totalInBins).toBe(7);
    // لا قيم في صناديق قبل min أو بعد max
    expect(bins[0].value).toBeGreaterThan(0);
    expect(bins[bins.length - 1].value).toBeGreaterThan(0);
  });

  it('value === count في كل صندوق (تعريف مزدوج متزامن)', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ v: i * 2 }));
    const bins = computeHistogramBins(rows, 'v');
    for (const b of bins) {
      expect(b.value).toBe(b.count);
    }
  });

  it('مجموع جميع الصناديق = عدد القيم الصالحة — صفر سجلات ضائعة', () => {
    const rows = Array.from({ length: 101 }, (_, i) => ({ v: (i % 7) * 11.5 }));
    const bins = computeHistogramBins(rows, 'v');
    expect(bins.reduce((s, b) => s + b.value, 0)).toBe(101);
  });
});
