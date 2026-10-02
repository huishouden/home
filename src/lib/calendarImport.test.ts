import { describe, expect, test } from 'bun:test';
import type { CalendarMatch } from '@huishouden/pwa-kit/calendar';
import fixture from './__fixtures__/calendar-matches.json';
import { calendarError, fromCalendar, guessCategory, isImported, matchTask, notImported, plainText } from './calendarImport';
import type { HomeTask, ServiceEntry } from './model';

const matches = fixture.matches as CalendarMatch[];
const [pest, gutter, inspection] = matches;
const task = (id: string, title: string, category: HomeTask['category'], contactId?: string): HomeTask => ({
  id,
  title,
  category,
  schedule: { kind: 'after-done', every: 3, unit: 'month' },
  due: '2031-10-20',
  ...(contactId ? { contactId } : {}),
  createdAt: 1,
  by: 'sam@example.com',
});
const tasks = [task('t-pest', 'Pest control visit', 'pest', 'c-pest'), task('t-gutters', 'Gutter cleaning', 'gutters'), task('t-filter', 'Change HVAC filter', 'hvac'), task('t-tune', 'HVAC tune-up', 'hvac')];
const entry = (fields: Partial<ServiceEntry>): ServiceEntry => ({ id: 'e1', date: '2031-01-01', title: 'Something', createdAt: 1, by: 'sam@example.com', ...fields });

describe('categories from words', () => {
  test.each([
    ['Quarterly pest treatment', 'pest'],
    ['Termite inspection', 'pest'],
    ['Furnace service', 'hvac'],
    ['Change HVAC filter', 'hvac'],
    ['Lawn service', 'lawn'],
    ['Roof inspection', 'gutters'],
    ['Water heater flush', 'plumbing'],
    ['Test the sump pump', 'plumbing'],
    ['Smoke detector batteries', 'safety'],
    ['HOA dues', 'paperwork'],
    ['Pool opening', 'pool'],
    ['Dentist', null],
  ])('%p → %p', (text, category) => expect(guessCategory(text)).toBe(category as never));
});

describe('matching a visit to its job', () => {
  test('the only job of that kind', () => expect(matchTask('Quarterly pest treatment', tasks)?.id).toBe('t-pest'));
  test('of several, the one sharing a word', () => expect(matchTask('HVAC tune-up with Example Heating', tasks)?.id).toBe('t-tune'));
  test('none when unclear or unknown', () => {
    expect(matchTask('Furnace service', tasks)).toBeUndefined();
    expect(matchTask('Home inspection', tasks)).toBeUndefined();
  });
});

describe('a service entry from a calendar event', () => {
  test('fills the day, title, notes, the job and its provider', () => {
    expect(fromCalendar(pest, tasks)).toEqual({
      date: '2031-10-19',
      title: 'Quarterly pest treatment',
      taskId: 't-pest',
      contactId: 'c-pest',
      notes: 'Home\nInside and outside.\nLeave the side gate open & the dog in.',
      calendarEventId: 'evt-pest',
      calendarLink: 'https://calendar.example.com/event?eid=evt-pest',
    });
  });

  test('leaves out what the event lacks', () => {
    const out = fromCalendar(gutter, []);
    expect('notes' in out).toBe(false);
    expect('taskId' in out).toBe(false);
    expect(fromCalendar(inspection, tasks).notes).toBe('Line one\nLine two');
  });

  test('long descriptions are cut to the notes limit', () => {
    const out = plainText('word '.repeat(400));
    expect(out.length).toBeLessThanOrEqual(1000);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('import de-duplication', () => {
  test('by id, by link, or by the same title on the same day', () => {
    expect(isImported(pest, [entry({ calendarEventId: 'evt-pest' })])).toBe(true);
    expect(isImported(pest, [entry({ calendarLink: pest.link })])).toBe(true);
    expect(isImported(pest, [entry({ title: ' quarterly PEST treatment ', date: '2031-10-19' })])).toBe(true);
    expect(isImported(pest, [entry({ title: 'Quarterly pest treatment', date: '2031-10-20' })])).toBe(false);
  });

  test('each new event once, soonest first', () => {
    expect(notImported([...matches, pest], []).map((m) => m.id)).toEqual(['evt-gutter', 'evt-pest', 'evt-inspection']);
    expect(notImported(matches, [entry({ calendarEventId: 'evt-gutter' })]).map((m) => m.id)).toEqual(['evt-pest', 'evt-inspection']);
  });
});

test('a closed Google window reads as not allowed; anything else as a connection problem', () => {
  expect(calendarError({ code: 'auth/popup-closed-by-user' })).toContain('not allowed');
  expect(calendarError({ code: 'auth/popup-blocked' })).toContain('pop-ups');
  expect(calendarError(new Error('[500] Calendar: backend'))).toContain('connection');
});
