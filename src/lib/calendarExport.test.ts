import { describe, expect, test } from 'bun:test';
import { agendaDoc, fillEditOps } from '@huishouden/pwa-kit/agenda';
import { DEFAULT_CALENDAR_SETTINGS, exportEvents } from '@huishouden/pwa-kit/calendar-export';
import { resolveOps } from '@huishouden/pwa-kit/todos';
import { atTime } from '@huishouden/pwa-kit/time';
import { AGENDA_APP, calendarEntry, jobAgenda, jobEntry, visitAgenda, visitEntry, warrantyEntry } from './agenda';
import { allDayStart } from '@huishouden/pwa-kit/agenda';
import { EVENT_AGENDA_DAYS, eventAgenda, eventEdit, eventEntry, occurrenceEntry } from './events';
import { EVENT_KEYS, SERVICE_KEYS, TASK_KEYS, eventDoc, type HomeEvent, type HomeTask, type ServiceEntry } from './model';
import { SUITE_ORIGIN } from '@huishouden/pwa-kit/site';

// What Home publishes for calendars (huishouden/calendar, @huishouden/pwa-kit/calendar-export):
// regular events as one repeating series, and the edits that bring changes made there back.
const URL = `${SUITE_ORIGIN}/home/#regular`;
const now = atTime('2031-10-16', '10:30');
const trash: HomeEvent = {
  id: 'e1',
  title: 'Garbage pickup',
  kind: 'trash',
  rule: { freq: 'week', every: 1, start: '2031-01-02' },
  time: '07:00',
  exceptions: { '2031-10-30': { skipped: true }, '2031-11-06': { moved: { date: '2031-11-07', time: '08:00' } } },
  createdAt: 1,
  by: 'sam@example.com',
};
const job: HomeTask = { id: 't1', title: 'Change HVAC filter', category: 'hvac', schedule: { kind: 'after-done', every: 3, unit: 'month' }, due: '2031-10-20', createdAt: 1, by: 'alex@example.com' };
const visit: ServiceEntry = { id: 'v1', date: '2031-10-25', title: 'Furnace tune-up', createdAt: atTime('2031-10-10', '09:00'), by: 'alex@example.com' };

/** A merge as Firestore does it: nested maps merge field by field. */
function merge(target: Record<string, unknown>, data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...target };
  for (const [k, v] of Object.entries(data)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' ? merge(out[k] as Record<string, unknown>, v as Record<string, unknown>) : v;
  }
  return out;
}

describe('regular events for calendars', () => {
  const items = eventAgenda(trash, [], now, URL);

  test('each occurrence carries the schedule, its own day and how far ahead it was published', () => {
    expect(items[0].series).toEqual({ rule: trash.rule, time: '07:00', minutes: 30, original: '2031-10-16', through: '2031-12-15' });
    const moved = items.find((i) => i.series!.original === '2031-11-06')!;
    expect(moved.start).toBe(atTime('2031-11-07', '08:00'));
    expect(items.some((i) => i.series!.original === '2031-10-30')).toBe(false);
    expect(EVENT_AGENDA_DAYS).toBe(60);
  });

  test('the kit stores them, and a calendar gets one series: the skip excluded, the move overridden', () => {
    const stored = items.map((i, n) => ({ id: `x${n}`, ...agendaDoc(AGENDA_APP, { ...i, ref: 'event:e1' }, 'sam@example.com', now) }));
    const [series] = exportEvents({ agenda: stored, me: 'sam@example.com', role: 'member', lang: 'en', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, settings: DEFAULT_CALENDAR_SETTINGS });
    expect(series.series!.exdates).toEqual(['2031-10-30']);
    expect(series.series!.overrides.map((o) => o.original)).toEqual(['2031-11-06']);
  });

  test('a move in a calendar becomes a change to that occurrence the rules and the app accept', () => {
    const ops = resolveOps(fillEditOps(eventEdit(trash).reschedule!.ops, { original: '2031-10-23', date: '2031-10-24', time: '09:00' }), { now, me: 'sam@example.com' });
    const after = merge(trash as unknown as Record<string, unknown>, ops[0].data as Record<string, unknown>);
    expect(Object.keys(after).filter((k) => k !== 'id').every((k) => (EVENT_KEYS as readonly string[]).includes(k))).toBe(true);
    expect(eventDoc(after as never, { by: 'sam@example.com', createdAt: 1, updatedAt: now }).exceptions).toEqual({ ...trash.exceptions, '2031-10-23': { moved: { date: '2031-10-24', time: '09:00' } } });
  });

  test('a skip, a rename and a new usual time; notes only while it has none; by admins, members and its author', () => {
    const edit = eventEdit(trash);
    expect(fillEditOps(edit.skip!.ops, { original: '2031-10-23' })[0].data).toMatchObject({ exceptions: { '2031-10-23': { skipped: true } } });
    expect(edit.rename!.ops[0].data).toMatchObject({ title: '$title' });
    expect(edit.retime!.ops[0].data).toMatchObject({ time: '$time' });
    expect(edit.notes).toBeDefined();
    expect(eventEdit({ ...trash, notes: 'Bins at the curb' }).notes).toBeUndefined();
    expect(eventEdit({ ...trash, time: undefined }).retime).toBeUndefined();
    expect(edit.reschedule).toMatchObject({ roles: ['admin', 'member'], emails: ['sam@example.com'] });
  });

  test('Add to calendar gets the whole series', () => {
    expect(calendarEntry(items[0]).series).toEqual({ rule: trash.rule, time: '07:00', minutes: 30 });
  });
});

describe('jobs and visits for calendars', () => {
  test('a job moves by its due day (anyone may, as they may tick it off), renames and takes notes, within its fields', () => {
    const [item] = jobAgenda(job, [], now);
    expect(item.edit!.reschedule).toMatchObject({ roles: ['admin', 'member', 'helper', 'kid'], ops: [{ col: 'homeTasks', id: 't1', data: { due: '$date', updatedAt: '$now' }, merge: true }] });
    for (const action of Object.values(item.edit!)) for (const op of action!.ops) expect(Object.keys(op.data!).every((k) => (TASK_KEYS as readonly string[]).includes(k))).toBe(true);
    expect(() => agendaDoc(AGENDA_APP, { ...item, ref: 'job:t1' }, 'alex@example.com', now)).not.toThrow();
  });

  test('a booked visit moves, renames, takes notes or is cancelled, within its fields', () => {
    const [item] = visitAgenda(visit, [], now);
    expect(Object.keys(item.edit!).sort()).toEqual(['cancel', 'notes', 'rename', 'reschedule']);
    expect(item.edit!.cancel!.ops).toEqual([{ col: 'homeServiceLog', id: 'v1', data: null }]);
    for (const k of ['reschedule', 'rename', 'notes'] as const) for (const op of item.edit![k]!.ops) expect(Object.keys(op.data!).every((f) => (SERVICE_KEYS as readonly string[]).includes(f))).toBe(true);
    expect(visitAgenda({ ...visit, notes: 'Filter size 16x25' }, [], now)[0].edit!.notes).toBeUndefined();
  });
});

describe('Add to calendar', () => {
  test('a job, a booked visit and a warranty end go in on their day, all day', () => {
    expect(jobEntry(job, [])).toMatchObject({ title: 'Change HVAC filter', start: allDayStart('2031-10-20'), allDay: true, kind: 'due' });
    expect(visitEntry(visit, [])).toMatchObject({ title: 'Furnace tune-up', start: allDayStart('2031-10-25'), allDay: true });
    expect(warrantyEntry({ id: 'w', item: 'Dishwasher', createdAt: 1, by: 'x@example.com' })).toBeNull();
    expect(warrantyEntry({ id: 'w', item: 'Dishwasher', warrantyEnd: '2032-01-01', createdAt: 1, by: 'x@example.com' })?.start).toBe(allDayStart('2032-01-01'));
  });

  test('a regular event goes in as its series; one occurrence on its own, for its usual length', () => {
    expect(eventEntry(trash, [], URL)).toMatchObject({ allDay: false, series: { rule: trash.rule, time: '07:00', minutes: 30 } });
    expect(occurrenceEntry(trash, { date: '2031-11-07', time: '08:00' }, URL)).toMatchObject({ start: atTime('2031-11-07', '08:00'), end: atTime('2031-11-07', '08:30'), allDay: false });
    expect(occurrenceEntry(trash, { date: '2031-11-07', time: '08:00' }, URL).series).toBeUndefined();
  });
});
