import { expect, test } from 'bun:test';
import { doneFromEntry, markDone } from './done';
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
