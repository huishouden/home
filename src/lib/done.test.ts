import { describe, expect, test } from 'bun:test';
import { TICK_FIELDS, doneFromEntry, markDone, resumedDue, tickedTask } from './done';
import { mayChange } from '../data/types';
import type { HomeTask } from './model';

const filter: HomeTask = {
  id: 't1',
  title: 'Change HVAC filter',
  category: 'hvac',
  schedule: { kind: 'after-done', every: 3, unit: 'month' },
  due: '2031-10-20',
  lastDone: '2031-07-20',
  contactId: 'c1',
  createdAt: 1,
  by: 'sam@example.com',
};

test('done rolls the schedule forward and records history', () => {
  expect(markDone(filter, '2031-10-16')).toEqual({
    due: '2032-01-16',
    lastDone: '2031-10-16',
    entry: { date: '2031-10-16', title: 'Change HVAC filter', taskId: 't1', contactId: 'c1' },
  });
});

test('a past entry newer than the last time moves the job; booked or older ones do not', () => {
  expect(doneFromEntry(filter, '2031-10-10', '2031-10-16')).toEqual({ due: '2032-01-10', lastDone: '2031-10-10' });
  expect(doneFromEntry(filter, '2031-10-20', '2031-10-16')).toBeNull();
  expect(doneFromEntry(filter, '2031-07-20', '2031-10-16')).toBeNull();
  expect(doneFromEntry({ ...filter, lastDone: undefined }, '2031-01-05', '2031-10-16')).toEqual({ due: '2031-04-05', lastDone: '2031-01-05' });
});

test('marking a job done changes only the fields a helper may tick, and keeps its author', () => {
  const job = { ...filter, by: 'alex@example.com', createdAt: 1 } as HomeTask;
  const { due, lastDone } = markDone(job, '2031-10-21');
  const moved = tickedTask(job, { due, lastDone }, 5);
  const changed = Object.keys(moved).filter((k) => JSON.stringify(moved[k as keyof HomeTask]) !== JSON.stringify(job[k as keyof HomeTask]));
  expect(changed.every((k) => (TICK_FIELDS as readonly string[]).includes(k))).toBe(true);
  expect(moved.by).toBe('alex@example.com');
});

test('helpers and kids change only what they added; everyone else anything', () => {
  const helper = { helping: true, me: 'sitter@example.com' };
  expect(mayChange(helper, { by: 'sitter@example.com' })).toBe(true);
  expect(mayChange(helper, { by: 'alex@example.com' })).toBe(false);
  expect(mayChange(helper, {})).toBe(false);
  expect(mayChange({ me: 'sam@example.com' }, { by: 'alex@example.com' })).toBe(true);
});

describe('resuming a paused job', () => {
  const after = { kind: 'after-done', every: 3, unit: 'month' } as const;
  const monthly = { kind: 'fixed', every: 1, unit: 'month', anchor: '2031-01-01' } as const;
  test('a date still ahead is kept; one that passed while paused is now (after-done) or the next set date', () => {
    expect(resumedDue({ schedule: after, due: '2031-11-02' }, '2031-10-16')).toBe('2031-11-02');
    expect(resumedDue({ schedule: after, due: '2031-10-16' }, '2031-10-16')).toBe('2031-10-16');
    expect(resumedDue({ schedule: after, due: '2031-06-01' }, '2031-10-16')).toBe('2031-10-16');
    expect(resumedDue({ schedule: monthly, due: '2031-06-01' }, '2031-10-16')).toBe('2031-11-01');
  });
});
