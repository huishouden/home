import { describe, expect, test } from 'bun:test';
import { allDayStart } from '@huishouden/pwa-kit/agenda';
import { atTime } from '@huishouden/pwa-kit/time';
import {
  eventPresets, eventAgenda, eventWhen, fromSeries, guessEventKind, prepTitleFrom, splitRegular, hasEventNamed, nextUp, occurrenceWords, prepAgenda, prepReminders, prepTasks, withOccurrenceChange,
} from './events';
import { eventDoc, type HomeEvent, type PrepTick } from './model';
import { SUITE_ORIGIN } from '@huishouden/pwa-kit/site';

// Thursday 16 October 2031 is pickup day.
const URL = `${SUITE_ORIGIN}/home/#regular`;
const trash: HomeEvent = {
  id: 'e1',
  title: 'Garbage pickup',
  kind: 'trash',
  rule: { freq: 'week', every: 1, start: '2031-01-02' },
  time: '07:00',
  prep: { title: 'Take the garbage out', offset: { daysBefore: 1, time: '19:00' }, remind: true },
  createdAt: 1,
  by: 'sam@example.com',
};
const lawn: HomeEvent = {
  id: 'e2',
  title: 'Lawn service',
  kind: 'lawn',
  rule: { freq: 'week', every: 2, start: '2031-03-07' },
  contactId: 'c1',
  createdAt: 1,
  by: 'sam@example.com',
};
const tick = (day: string, at = atTime('2031-10-22', '19:40')): PrepTick => ({ id: `e1_${day}`, done: true, at, by: 'alex@example.com' });

describe('things to do before, in Needs doing', () => {
  const at = (day: string, time: string) => atTime(day, time);
  const shown = (now: number, ticks: PrepTick[] = []) => prepTasks([trash], ticks, now).map((t) => [t.occurrence.date, t.state]);

  test('appears 14 hours ahead, stays late until pickup, then shows missed until the end of pickup day', () => {
    expect(shown(at('2031-10-22', '04:59'))).toEqual([]);
    expect(shown(at('2031-10-22', '05:00'))).toEqual([['2031-10-23', 'soon']]);
    expect(shown(at('2031-10-22', '21:00'))).toEqual([['2031-10-23', 'due']]);
    expect(shown(at('2031-10-23', '07:00'))).toEqual([['2031-10-23', 'missed']]);
    expect(shown(at('2031-10-23', '23:00'))).toEqual([['2031-10-23', 'missed']]);
    expect(shown(at('2031-10-24', '00:00'))).toEqual([]);
  });

  test('done shows who did it until pickup, then goes', () => {
    expect(shown(at('2031-10-22', '20:00'), [tick('2031-10-23')])).toEqual([['2031-10-23', 'done']]);
    expect(shown(at('2031-10-23', '07:00'), [tick('2031-10-23')])).toEqual([]);
  });

  test('a moved pickup moves its thing to do before; a skipped one has none', () => {
    const moved = { ...trash, exceptions: { '2031-10-23': { moved: { date: '2031-10-24' } } } };
    expect(prepTasks([moved], [], at('2031-10-23', '12:00')).map((t) => [t.occurrence.original, t.occurrence.date, t.state, t.id])).toEqual([
      ['2031-10-23', '2031-10-24', 'soon', 'e1_2031-10-23'],
    ]);
    const skipped = { ...trash, exceptions: { '2031-10-23': { skipped: true as const } } };
    expect(prepTasks([skipped], [], at('2031-10-22', '20:00'))).toEqual([]);
  });

  test('late and missed come first', () => {
    const lawnPrep = { ...lawn, time: '09:00', prep: { title: 'Unlock the side gate', offset: { daysBefore: 0, time: '08:00' }, remind: false } };
    const list = prepTasks([lawnPrep, { ...trash, rule: { freq: 'week' as const, every: 1, start: '2031-01-03' } }], [], at('2031-10-16', '20:00'));
    expect(list.map((t) => [t.prep.title, t.state])).toEqual([
      ['Take the garbage out', 'due'],
      ['Unlock the side gate', 'soon'],
    ]);
  });
});

describe('words', () => {
  test('occurrences and events', () => {
    expect(occurrenceWords({ date: '2031-10-16', time: '07:00' }, '2031-10-16')).toBe('Today 7 AM');
    expect(occurrenceWords({ date: '2031-10-17' }, '2031-10-16')).toBe('Tomorrow');
    expect(occurrenceWords({ date: '2031-10-23' }, '2031-10-18')).toBe('Thu');
    expect(occurrenceWords({ date: '2031-10-30' }, '2031-10-16')).toBe('Thu, Oct 30');
    expect(eventWhen(trash, { date: '2031-10-23', time: '07:00' }, '2031-10-22')).toBe('Garbage pickup tomorrow at 7 AM');
    expect(eventWhen(lawn, { date: '2031-10-17' }, '2031-10-17')).toBe('Lawn service today');
  });

  test('guessing the kind of a calendar event', () => {
    expect(['Garbage pickup', 'Trash day', 'Recycling', 'Yard waste collection', 'Landscaping crew', 'HOA meeting', 'Maid service', 'Dentist'].map(guessEventKind)).toEqual([
      'trash', 'trash', 'recycling', 'yard waste', 'lawn', 'hoa', 'cleaning', null,
    ]);
    expect(hasEventNamed([trash], ' garbage  Pickup')).toBe(true);
  });

  test('next up, soonest first', () => {
    expect(nextUp([lawn, trash], '2031-10-16').map((x) => [x.event.id, x.occurrence.date])).toEqual([['e1', '2031-10-16'], ['e2', '2031-10-17']]);
  });

  test('presets give valid events', () => {
    for (const p of eventPresets()) {
      const doc = eventDoc({ title: p.title, kind: p.kind, rule: p.rule('2031-10-30'), time: p.time, prep: p.prep }, { by: 'sam@example.com', createdAt: 1 });
      expect(doc.title).toBe(p.title);
    }
    expect(eventPresets().find((p) => p.id === 'hoa')!.rule('2031-10-30')).toEqual({ freq: 'month', every: 1, start: '2031-10-30', nth: -1, weekday: 4 });
  });
});

describe('saving', () => {
  test('eventDoc keeps changes only on days the schedule has, and drops an empty prep title', () => {
    const doc = eventDoc(
      {
        ...trash,
        exceptions: { '2031-10-23': { skipped: true }, '2031-10-24': { skipped: true }, '2031-10-30': { moved: { date: 'later' } } as never },
        prep: { title: '  ', offset: { daysBefore: 1, time: '19:00' }, remind: true },
      },
      { by: 'sam@example.com', createdAt: 1 },
    );
    expect(doc.exceptions).toEqual({ '2031-10-23': { skipped: true } });
    expect(doc.prep).toBeUndefined();
    expect(Object.keys(doc).sort()).toEqual(['by', 'createdAt', 'exceptions', 'kind', 'rule', 'time', 'title']);
  });

  test('changing one occurrence keeps the schedule and forgets changes long past', () => {
    const before = { ...trash, exceptions: { '2031-07-03': { skipped: true as const } } };
    const input = withOccurrenceChange(before, '2031-10-23', { moved: { date: '2031-10-24', time: '08:00' }, note: 'Holiday' }, '2031-10-16');
    expect(input.rule).toEqual(trash.rule);
    expect(input.exceptions).toEqual({ '2031-10-23': { moved: { date: '2031-10-24', time: '08:00' }, note: 'Holiday' } });
    expect(withOccurrenceChange({ ...trash, exceptions: input.exceptions }, '2031-10-23', null, '2031-10-16').exceptions).toEqual({});
  });
});

describe('the household agenda and reminders', () => {
  const now = atTime('2031-10-16', '10:30');

  test('occurrences of the next 60 days, timed or all day, with no status', () => {
    const items = eventAgenda(trash, [], now, URL);
    expect(items).toHaveLength(9);
    expect(items[0]).toMatchObject({ kind: 'other', title: 'Garbage pickup', start: atTime('2031-10-16', '07:00'), end: atTime('2031-10-16', '07:30'), allDay: false, detail: 'Every Thursday', url: URL });
    const lawnItems = eventAgenda({ ...lawn, exceptions: { '2031-10-31': { moved: { date: '2031-11-01' }, note: 'Rain' } } }, [{ id: 'c1', name: 'Example Lawn Care', apps: ['home'], createdAt: 1, by: 'x@example.com' }], now, URL);
    expect(lawnItems.slice(0, 2)).toMatchObject([
      { kind: 'appointment', title: 'Lawn service', start: allDayStart('2031-10-17'), allDay: true, detail: 'Every other Friday · Example Lawn Care', url: URL },
      { kind: 'appointment', title: 'Lawn service', start: allDayStart('2031-11-01'), allDay: true, detail: 'Moved from Fri, Oct 31 · Rain · Example Lawn Care', url: URL },
    ]);
    expect(lawnItems[0].end).toBeUndefined();
  });

  test('things to do before are tasks due at their deadline, ending that night; done once ticked; missed ones left off', () => {
    const items = prepAgenda(trash, [tick('2031-10-23')], now, URL);
    expect(items[0]).toEqual({
      kind: 'task',
      title: 'Take the garbage out',
      start: atTime('2031-10-22', '19:00'),
      end: atTime('2031-10-22', '23:59'),
      allDay: false,
      detail: 'Before garbage pickup tomorrow at 7 AM',
      url: URL,
      status: 'done',
    });
    expect(items[1].status).toBe('upcoming');
    expect(prepAgenda(trash, [], atTime('2031-10-22', '20:00'), URL)[0].status).toBe('overdue');
    expect(prepAgenda(trash, [], atTime('2031-10-23', '08:00'), URL)[0].start).toBe(atTime('2031-10-29', '19:00'));
    expect(prepAgenda(lawn, [], now, URL)).toEqual([]);
  });

  test('a reminder at each deadline of the next two weeks, not for ticked ones or ones without remind', () => {
    const r = prepReminders([trash, { ...lawn, prep: { title: 'Gate', offset: { daysBefore: 0, time: '07:00' }, remind: false } }], [tick('2031-10-23')], now, `${SUITE_ORIGIN}/home/`);
    expect(r.map((x) => [x.title, x.body, x.at])).toEqual([['Take the garbage out', 'Garbage pickup tomorrow at 7 AM', atTime('2031-10-29', '19:00')]]);
    expect(r[0]).toMatchObject({ app: 'home', ref: 'home:prep:e1', recipients: 'all', private: false });
  });
});

describe('calendar suggestions', () => {
  // Sundays 19 and 26 October 2031, Mondays 20 and 27, Wednesdays 22 and 29, Thursdays 16, 23 and 30.
  const ev = (id: string, title: string, day: number, series?: string, time = '07:00') => ({
    id,
    title,
    start: atTime(`2031-10-${String(day).padStart(2, '0')}`, time),
    allDay: false,
    location: '',
    description: '',
    link: `https://calendar.example.com/${id}`,
    calendarName: 'Family',
    ...(series ? { recurringEventId: series } : {}),
  });
  const weekly = (key: string, title: string, days: number[], time = '07:00') => days.map((d, i) => ev(`${key}${i}`, title, d, key, time));
  // Garbage on Mondays and Thursdays, entered by hand after the calendar reminders began.
  const garbage: HomeEvent = { ...trash, rule: { freq: 'week', every: 1, start: '2031-11-03', days: [1, 4] } };
  const recycling: HomeEvent = { id: 'e3', title: 'Recycling pickup', kind: 'recycling', rule: { freq: 'week', every: 2, start: '2031-10-16' }, createdAt: 1, by: 'sam@example.com' };
  const mondayOut = weekly('m', 'Garbage out for Monday Pickup', [19, 26], '20:00');
  const thursdayOut = weekly('w', 'Garbage out for Thursday Pickup', [22, 29], '20:00');

  test('a repeating pickup is one offer; one-offs, other repeating events and known events are not', () => {
    const { offers, prepOffers, visits } = splitRegular(
      [...weekly('s', 'Trash day', [14, 21]), ev('a', 'Lawn aeration', 24), ev('b1', 'Book club', 16, 'b'), ev('b2', 'Book club', 23, 'b'), ev('g', 'Garbage pickup', 23, 'g'), ev('g2', 'Garbage pickup', 30, 'g')],
      [{ ...trash, prep: undefined }],
    );
    expect(offers.map((o) => [o.title, o.rule, o.time])).toEqual([['Trash day', { freq: 'week', every: 1, start: '2031-10-14' }, '07:00']]);
    expect(prepOffers).toEqual([]);
    expect(visits.map((m) => m.id)).toEqual(['a', 'b1', 'b2']);
    expect(fromSeries(offers[0])).toEqual({ title: 'Trash day', kind: 'trash', rule: { freq: 'week', every: 1, start: '2031-10-14' }, time: '07:00' });
  });

  test('a series on the pickup days of an event the household has is not offered, nor its occurrences as visits', () => {
    const { offers, prepOffers, visits } = splitRegular([...weekly('t', 'Trash day', [16, 20, 23, 27]), ...weekly('r', 'Recycling', [16, 30])], [garbage, recycling]);
    expect([offers, prepOffers, visits]).toEqual([[], [], []]);
  });

  test('the evening-before reminders for Monday and Thursday pickups are the thing to do before, not new events', () => {
    const { prep: _, ...bare } = garbage;
    const { offers, prepOffers, visits } = splitRegular([...mondayOut, ...thursdayOut], [recycling, bare]);
    expect(offers).toEqual([]);
    expect(visits).toEqual([]);
    // One offer per event: the second reminder goes once the first is used or dismissed.
    expect(prepOffers.map((o) => [o.series.title, o.event.id, o.prep])).toEqual([
      ['Garbage out for Monday Pickup', 'e1', { title: 'Garbage out for pickup', offset: { daysBefore: 1, time: '20:00' }, remind: true }],
    ]);
    expect(splitRegular(thursdayOut, [bare]).prepOffers.map((o) => [o.series.title, o.prep.offset])).toEqual([['Garbage out for Thursday Pickup', { daysBefore: 1, time: '20:00' }]]);
  });

  test('with a thing to do before already, the reminders are just left out', () => {
    expect(splitRegular([...mondayOut, ...thursdayOut], [garbage])).toEqual({ offers: [], prepOffers: [], visits: [] });
  });

  test('a series titled like an event the household has is left out, whatever its days', () => {
    expect(splitRegular(weekly('x', 'The garbage pickup', [14, 21]), [garbage])).toEqual({ offers: [], prepOffers: [], visits: [] });
  });

  test('a new series is still offered', () => {
    const { offers, prepOffers } = splitRegular([...weekly('y', 'Yard waste pickup', [21, 28]), ...weekly('n', 'Recycling out', [19, 26], '20:00')], [garbage]);
    expect(offers.map((o) => o.title)).toEqual(['Recycling out', 'Yard waste pickup']);
    expect(prepOffers).toEqual([]);
  });

  test('a reminder title for one weekday becomes one for every pickup', () => {
    expect(prepTitleFrom('Garbage out for Monday Pickup')).toBe('Garbage out for pickup');
    expect(prepTitleFrom('Put the bins out')).toBe('Put the bins out');
  });
});
