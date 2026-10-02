import { expect, test } from 'bun:test';
import { centsToInput, formatMoney, parseMoney } from './money';

test.each([
  ['120', 12000],
  ['120.5', 12050],
  ['$1,200.00', 120000],
  [' 0.99 ', 99],
  ['', undefined],
  ['abc', null],
  ['1.234', null],
  ['-5', null],
  ['1000001', null],
])('%p', (text, cents) => expect(parseMoney(text)).toBe(cents as number | null | undefined));

test('formatting: two decimals, whole dollars for the headline', () => {
  expect(formatMoney(123450)).toBe('$1,234.50');
  expect(formatMoney(123450, { headline: true })).toBe('$1,235');
  expect(formatMoney(0)).toBe('$0.00');
  expect(centsToInput(6500)).toBe('65.00');
  expect(centsToInput(undefined)).toBe('');
});
