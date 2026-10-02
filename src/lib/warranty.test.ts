import { expect, test } from 'bun:test';
import { byExpiry, warrantyState, warrantyText } from './warranty';
import { addDays } from './ymd';

const today = '2031-10-16';
const at = (d: number) => addDays(today, d);

test.each([
  [46, 'Expires in 46 days'],
  [90, 'Expires in 90 days'],
  [1, 'Expires tomorrow'],
  [0, 'Expires today'],
  [-1, 'Expired yesterday'],
  [-30, 'Expired 30 days ago'],
  [-197, 'Expired 6 months ago'],
  [309, 'Expires in 10 months'],
  [2400, 'Expires in 6 years'],
])('%p days: %p', (d, text) => expect(warrantyText(at(d), today)).toBe(text));

test('no end date', () => {
  expect(warrantyText(undefined, today)).toBe('No warranty end date');
  expect(warrantyState(undefined, today).state).toBe('none');
});

test('expiring within 90 days is highlighted', () => {
  expect(warrantyState(at(90), today).state).toBe('expiring');
  expect(warrantyState(at(91), today).state).toBe('covered');
  expect(warrantyState(at(-1), today).state).toBe('expired');
});

test('ending soonest first, then the most recently expired, then undated', () => {
  const list = [
    { item: 'Undated' },
    { item: 'Long ago', warrantyEnd: at(-400) },
    { item: 'Far', warrantyEnd: at(900) },
    { item: 'Recent', warrantyEnd: at(-20) },
    { item: 'Soon', warrantyEnd: at(46) },
  ];
  expect(byExpiry(list, today).map((w) => w.item)).toEqual(['Soon', 'Far', 'Recent', 'Long ago', 'Undated']);
});
