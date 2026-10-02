import { describe, expect, test } from 'bun:test';
import { byDue, dueState, dueText, headline, lastDoneText, needsAttention, spanWords } from './upkeep';
import { addDays } from '@huishouden/pwa-kit/time';

const today = '2031-10-16';
const at = (d: number) => addDays(today, d);

describe('due wording', () => {
  test.each([
    [-1, 'Overdue by 1 day'],
    [-5, 'Overdue by 5 days'],
    [-21, 'Overdue by 3 weeks'],
    [-95, 'Overdue by 3 months'],
    [0, 'Due today'],
    [1, 'Due tomorrow'],
    [4, 'Due in 4 days'],
    [13, 'Due in 13 days'],
    [17, 'Due in 2 weeks'],
    [47, 'Due in 6 weeks'],
    [151, 'Due in 5 months'],
    [800, 'Due in 2 years'],
  ])('%p days', (d, text) => expect(dueText(at(d), today)).toBe(text));

  test('states', () => {
    expect(dueState(at(-1), today).state).toBe('overdue');
    expect(dueState(at(0), today).state).toBe('today');
    expect(dueState(at(14), today).state).toBe('soon');
    expect(dueState(at(15), today).state).toBe('later');
  });

  test('glanceable headlines', () => {
    expect(headline('Gutter cleaning', at(-5), today)).toBe('Overdue: gutter cleaning');
    expect(headline('HVAC filter', at(-5), today)).toBe('Overdue: HVAC filter');
    expect(headline('Filter change', at(4), today)).toBe('Filter change due in 4 days');
    expect(headline('Lawn service', at(1), today)).toBe('Lawn service due tomorrow');
    expect(headline('HOA dues', at(0), today)).toBe('HOA dues due today');
  });

  test('spans', () => {
    expect(spanWords(46, 90)).toBe('46 days');
    expect(spanWords(59)).toBe('8 weeks');
    expect(spanWords(60)).toBe('2 months');
    expect(spanWords(365)).toBe('12 months');
  });

  test('last done', () => {
    expect(lastDoneText(undefined, today)).toBe('Not done yet');
    expect(lastDoneText(today, today)).toBe('Done today');
    expect(lastDoneText(at(-1), today)).toBe('Done yesterday');
    expect(lastDoneText(at(-88), today)).toBe('Done 3 months ago');
  });
});

describe('ordering', () => {
  const items = [
    { title: 'Later', due: at(40) },
    { title: 'Soon', due: at(4) },
    { title: 'Very late', due: at(-30) },
    { title: 'Late', due: at(-5) },
    { title: 'Also soon', due: at(4) },
  ];
  test('most overdue first, then soonest, ties by title', () => {
    expect(byDue(items).map((i) => i.title)).toEqual(['Very late', 'Late', 'Also soon', 'Soon', 'Later']);
  });
  test('needs attention is overdue plus the next two weeks', () => {
    expect(needsAttention(items, today).map((i) => i.title)).toEqual(['Very late', 'Late', 'Also soon', 'Soon']);
  });
});
