import { expect, test } from 'bun:test';
import { dueFromLastDone, type Schedule } from '@huishouden/pwa-kit/schedule';
import { initialLastDone, lastDoneChoices, savedLastDone, toLastDone } from './lastDone';

const today = '2031-10-16';
const filter: Schedule = { kind: 'after-done', every: 3, unit: 'month' };
const hoa: Schedule = { kind: 'fixed', every: 1, unit: 'month', anchor: '2031-01-01' };
const due = (s: Schedule, choice: Parameters<typeof toLastDone>[0], on = '') => {
  const last = toLastDone(choice, on, today, s.kind);
  return last && dueFromLastDone(s, today, last);
};

test('a new job is not assumed done: it is due today and saves no last-done day', () => {
  expect(initialLastDone(undefined, today)).toEqual({ choice: 'not-yet', on: '' });
  expect(due(filter, 'not-yet')).toBe(today);
  expect(savedLastDone(toLastDone('not-yet', '', today, 'after-done'))).toBeUndefined();
});

test('done today: next due one interval on, and today is saved as last done', () => {
  expect(due(filter, 'today')).toBe('2032-01-16');
  expect(savedLastDone(toLastDone('today', '', today, 'after-done'))).toBe(today);
});

test('done on a past day: due from that day, already overdue when the interval has passed', () => {
  expect(due(filter, 'date', '2031-05-01')).toBe('2031-08-01');
  expect(savedLastDone(toLastDone('date', '2031-05-01', today, 'after-done'))).toBe('2031-05-01');
});

test('"On a date" needs a day that has come', () => {
  expect(toLastDone('date', '', today, 'after-done')).toBeNull();
  expect(toLastDone('date', '2031-10-17', today, 'after-done')).toBeNull();
});

test("set dates: the next date unless it's overdue, then the date that passed", () => {
  expect(due(hoa, 'not-yet')).toBe('2031-11-01');
  expect(due(hoa, 'overdue')).toBe('2031-10-01');
  expect(due(hoa, 'today')).toBe('2031-11-01');
});

test("\"It's overdue\" is offered for set dates only; on after-done it reads as due now", () => {
  expect(lastDoneChoices('after-done').map((c) => c.value)).toEqual(['not-yet', 'today', 'date']);
  expect(lastDoneChoices('fixed').map((c) => c.value)).toEqual(['not-yet', 'overdue', 'today', 'date']);
  expect(toLastDone('overdue', '', today, 'after-done')).toEqual({ kind: 'not-yet' });
});

test('an existing job opens on its saved last-done day', () => {
  expect(initialLastDone(today, today)).toEqual({ choice: 'today', on: today });
  expect(initialLastDone('2031-07-20', today)).toEqual({ choice: 'date', on: '2031-07-20' });
});
