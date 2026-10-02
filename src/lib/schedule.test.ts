import { describe, expect, test } from 'bun:test';
import fixture from './__fixtures__/schedules.json';
import { addInterval, describeSchedule, firstDue, isSchedule, nextDueAfterDone, occurrenceOnOrAfter, type Schedule, type Unit } from './schedule';

type Fixed = Extract<Schedule, { kind: 'fixed' }>;

describe('intervals', () => {
  for (const c of fixture.addInterval)
    test(`${c.from} + ${c.every} ${c.unit}${c.why ? ` (${c.why})` : ''}`, () => expect(addInterval(c.from, c.every, c.unit as Unit, c.day)).toBe(c.expected));
});

describe('fixed schedules', () => {
  for (const c of fixture.fixed)
    test(`${describeSchedule(c.schedule as Schedule)} from ${c.onOrAfter}${c.why ? ` (${c.why})` : ''}`, () =>
      expect(occurrenceOnOrAfter(c.schedule as Fixed, c.onOrAfter)).toBe(c.expected));

  test('the 31st anchor survives short months over many steps', () => {
    const s: Fixed = { kind: 'fixed', every: 1, unit: 'month', anchor: '2031-01-31' };
    expect(['2031-02-01', '2031-03-01', '2031-07-01', '2031-09-15'].map((d) => occurrenceOnOrAfter(s, d))).toEqual(['2031-02-28', '2031-03-31', '2031-07-31', '2031-09-30']);
  });
});

describe('marking done', () => {
  for (const c of fixture.done)
    test(`${describeSchedule(c.schedule as Schedule)}, due ${c.due}, done ${c.doneOn}${c.why ? ` (${c.why})` : ''}`, () =>
      expect(nextDueAfterDone(c.schedule as Schedule, c.due, c.doneOn)).toBe(c.expected));
});

describe('first due date', () => {
  test('fixed: the next occurrence on or after today', () => {
    expect(firstDue({ kind: 'fixed', every: 1, unit: 'year', anchor: '2030-11-02' }, '2031-10-16')).toBe('2031-11-02');
  });
  test('after-done: one interval after the last time, or today', () => {
    expect(firstDue({ kind: 'after-done', every: 3, unit: 'month' }, '2031-10-16', '2031-08-01')).toBe('2031-11-01');
    expect(firstDue({ kind: 'after-done', every: 3, unit: 'month' }, '2031-10-16')).toBe('2031-10-16');
  });
});

describe('wording', () => {
  for (const c of fixture.describe) test(c.expected, () => expect(describeSchedule(c.schedule as Schedule)).toBe(c.expected));
});

test('only valid schedules pass', () => {
  expect(isSchedule({ kind: 'after-done', every: 3, unit: 'month' })).toBe(true);
  expect(isSchedule({ kind: 'fixed', every: 1, unit: 'year', anchor: '2031-02-01' })).toBe(true);
  expect(isSchedule({ kind: 'fixed', every: 1, unit: 'year' })).toBe(false);
  expect(isSchedule({ kind: 'after-done', every: 3, unit: 'month', anchor: 'x' })).toBe(true);
  expect(isSchedule({ kind: 'after-done', every: 0, unit: 'month' })).toBe(false);
  expect(isSchedule({ kind: 'after-done', every: 1.5, unit: 'month' })).toBe(false);
  expect(isSchedule({ kind: 'after-done', every: 1, unit: 'decade' })).toBe(false);
  expect(isSchedule(null)).toBe(false);
});
