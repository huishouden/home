import { describe, expect, test } from 'bun:test';
import { addDays, addMonths, daysBetween, formatDay, formatShort, isYmd, ordinal, parseYmd, toYmd, ymdToTime } from './ymd';

describe('calendar days', () => {
  test('parse rejects malformed and impossible dates', () => {
    expect(parseYmd('2031-02-30')).toBeNull();
    expect(parseYmd('2031-2-3')).toBeNull();
    expect(parseYmd(undefined)).toBeNull();
    expect(isYmd('2032-02-29')).toBe(true);
    expect(isYmd('2031-02-29')).toBe(false);
  });

  test('local day round trip', () => {
    expect(toYmd(ymdToTime('2031-03-09'))).toBe('2031-03-09');
    expect(toYmd(new Date(2031, 9, 16, 23, 59).getTime())).toBe('2031-10-16');
  });

  test('day arithmetic is exact across DST and year ends', () => {
    expect(addDays('2031-03-08', 1)).toBe('2031-03-09');
    expect(addDays('2031-11-01', 2)).toBe('2031-11-03');
    expect(addDays('2031-12-31', 1)).toBe('2032-01-01');
    expect(daysBetween('2031-10-16', '2031-10-20')).toBe(4);
    expect(daysBetween('2031-10-16', '2031-10-11')).toBe(-5);
  });

  test('months clamp to the last day', () => {
    expect(addMonths('2031-01-31', 1)).toBe('2031-02-28');
    expect(addMonths('2031-03-31', -1)).toBe('2031-02-28');
    expect(addMonths('2031-02-28', 1, 31)).toBe('2031-03-31');
  });

  test('wording', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st']);
    expect(formatDay('2031-11-04', '2031-10-16')).toBe('Tuesday, November 4');
    expect(formatDay('2032-02-01', '2031-10-16')).toBe('Sunday, February 1, 2032');
    expect(formatShort('2031-11-04', '2031-10-16')).toBe('Nov 4');
    expect(formatShort('2030-12-02', '2031-10-16')).toBe('Dec 2, 2030');
  });
});
