import { describe, expect, it } from 'vitest';
import { localizePhaseLabel } from '../utils/seasonalPhaseLabels';

describe('seasonal phase labels', () => {
  it('names months in Arabic for the Arabic UI', () => {
    expect(localizePhaseLabel('Jan', 'ar')).toBe('يناير');
    expect(localizePhaseLabel('Dec', 'ar')).toBe('ديسمبر');
    expect(localizePhaseLabel('Jan–Jun', 'ar')).toBe('يناير–يونيو');
  });

  it('names weekdays, quarters and numbered phases', () => {
    expect(localizePhaseLabel('Sunday', 'ar')).toBe('الأحد');
    expect(localizePhaseLabel('Q3', 'ar')).toBe('الربع الثالث');
    expect(localizePhaseLabel('W7', 'ar')).toBe('الأسبوع 7');
    expect(localizePhaseLabel('#5', 'ar')).toBe('الطور 5');
  });

  it('keeps the English labels untouched for the English UI', () => {
    expect(localizePhaseLabel('Jan', 'en')).toBe('Jan');
    expect(localizePhaseLabel('Q2', 'en')).toBe('Q2');
  });

  it('passes through labels it does not recognize', () => {
    expect(localizePhaseLabel('2024-Q1', 'ar')).toBe('2024-Q1');
    expect(localizePhaseLabel('', 'ar')).toBe('');
  });
});
