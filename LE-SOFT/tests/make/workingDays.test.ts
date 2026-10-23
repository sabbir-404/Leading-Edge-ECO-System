import { describe, it, expect } from 'vitest';
import {
  calculateDeliveryDateFromWorkingDays,
  calculateWorkingDaysBetween,
  isWorkingDay,
  toYmdString,
  parseYmdToUtc,
  formatWorkingDateDisplay
} from '../../src/utils/workingDays';

describe('MAKE Working Days Helper (src/utils/workingDays.ts)', () => {
  it('correctly identifies working days excluding Friday (5)', () => {
    // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
    expect(isWorkingDay(0)).toBe(true);  // Sunday is working in standard 6-day week
    expect(isWorkingDay(1)).toBe(true);  // Monday
    expect(isWorkingDay(2)).toBe(true);  // Tuesday
    expect(isWorkingDay(3)).toBe(true);  // Wednesday
    expect(isWorkingDay(4)).toBe(true);  // Thursday
    expect(isWorkingDay(5)).toBe(false); // Friday is weekend
    expect(isWorkingDay(6)).toBe(true);  // Saturday is working
  });

  it('calculates 1 working day from Monday correctly', () => {
    // 2026-10-19 is Monday
    const res = calculateDeliveryDateFromWorkingDays('2026-10-19', 1);
    expect(res.dateStr).toBe('2026-10-20'); // Tuesday
    expect(res.formattedDisplay).toContain('20 Oct 2026 (Tue)');
    expect(res.error).toBeUndefined();
  });

  it('calculates 1 working day from Thursday by skipping Friday to Saturday', () => {
    // 2026-10-22 is Thursday
    // 1 working day later should be Saturday 2026-10-24, since Friday 2026-10-23 is skipped
    const res = calculateDeliveryDateFromWorkingDays('2026-10-22', 1);
    expect(res.dateStr).toBe('2026-10-24'); // Saturday
    expect(res.formattedDisplay).toContain('24 Oct 2026 (Sat)');
    expect(res.error).toBeUndefined();
  });

  it('calculates multi-week working days accurately', () => {
    // 2026-10-19 (Mon) + 6 working days:
    // Tue(1), Wed(2), Thu(3), [Fri skipped], Sat(4), Sun(5), Mon(6) -> 2026-10-26 (Mon)
    const res = calculateDeliveryDateFromWorkingDays('2026-10-19', 6);
    expect(res.dateStr).toBe('2026-10-26');
    expect(res.formattedDisplay).toContain('26 Oct 2026 (Mon)');
  });

  it('safely handles blank, empty, and undefined inputs', () => {
    expect(calculateDeliveryDateFromWorkingDays('2026-10-19', '')).toEqual({ dateStr: null, formattedDisplay: '' });
    expect(calculateDeliveryDateFromWorkingDays('2026-10-19', null)).toEqual({ dateStr: null, formattedDisplay: '' });
    expect(calculateDeliveryDateFromWorkingDays('2026-10-19', undefined)).toEqual({ dateStr: null, formattedDisplay: '' });
    expect(calculateDeliveryDateFromWorkingDays('2026-10-19', '   ')).toEqual({ dateStr: null, formattedDisplay: '' });
  });

  it('safely rejects zero, negative, floating-point, and non-numeric inputs', () => {
    const resZero = calculateDeliveryDateFromWorkingDays('2026-10-19', 0);
    expect(resZero.dateStr).toBeNull();
    expect(resZero.error).toBe('Working days must be greater than zero.');

    const resNeg = calculateDeliveryDateFromWorkingDays('2026-10-19', -5);
    expect(resNeg.dateStr).toBeNull();
    expect(resNeg.error).toBe('Working days must be greater than zero.');

    const resFloat = calculateDeliveryDateFromWorkingDays('2026-10-19', 4.5);
    expect(resFloat.dateStr).toBeNull();
    expect(resFloat.error).toBe('Working days must be a whole integer.');

    const resStringFloat = calculateDeliveryDateFromWorkingDays('2026-10-19', '3.14');
    expect(resStringFloat.dateStr).toBeNull();
    expect(resStringFloat.error).toBe('Working days must be a whole integer.');

    const resAlpha = calculateDeliveryDateFromWorkingDays('2026-10-19', 'abc');
    expect(resAlpha.dateStr).toBeNull();
    expect(resAlpha.error).toBe('Working days must be a valid number.');
  });

  it('safely caps excessively large input to prevent overflow or freezing', () => {
    const resOver = calculateDeliveryDateFromWorkingDays('2026-10-19', 5000);
    expect(resOver.dateStr).toBeNull();
    expect(resOver.error).toContain('cannot exceed 3,650 days');
  });

  it('derives correct working days between two dates for reopening existing orders', () => {
    // 2026-10-22 (Thu) to 2026-10-24 (Sat) = 1 working day (Fri skipped)
    expect(calculateWorkingDaysBetween('2026-10-22', '2026-10-24')).toBe(1);

    // 2026-10-19 (Mon) to 2026-10-26 (Mon) = 6 working days
    expect(calculateWorkingDaysBetween('2026-10-19', '2026-10-26')).toBe(6);

    // End date on or before start date returns 0
    expect(calculateWorkingDaysBetween('2026-10-22', '2026-10-22')).toBe(0);
    expect(calculateWorkingDaysBetween('2026-10-22', '2026-10-20')).toBe(0);
  });

  it('preserves historical order placement date when calculating', () => {
    // Reopening an order placed 2026-09-01 with 10 working days
    // 2026-09-01 is Tuesday
    const res = calculateDeliveryDateFromWorkingDays('2026-09-01', 10);
    expect(res.dateStr).not.toBeNull();
    expect(res.dateStr?.startsWith('2026-09-')).toBe(true);
  });
});
