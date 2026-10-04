import type { AgendaAction, AgendaEdit, AgendaInput } from '@huishouden/pwa-kit/agenda';
import type { CalendarEntry } from '@huishouden/pwa-kit/calendar-export';
import type { Role } from '@huishouden/pwa-kit/roles';
import { allDayStart, inAgendaWindow } from '@huishouden/pwa-kit/agenda';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { describeSchedule } from '@huishouden/pwa-kit/schedule';
import { appUrl, SUITE_ORIGIN } from '@huishouden/pwa-kit/site';
import { daysBetween, toYmd } from '@huishouden/pwa-kit/time';
import type { HomeTask, ServiceEntry, Warranty } from './model';
import { eventAgenda, eventRef, prepAgenda, prepRef } from './events';
import type { HomeData } from './demo';
import type { TabId } from './tabs';
import { dueState, isPaused } from './upkeep';
import { t } from '../i18n';

// What Home puts on the household agenda (households/{id}/agenda, read by the portal): each job's
// next due date, visits booked ahead, warranties ending, and regular events (each occurrence of the
// next 60 days, and the thing to do before it as a task). Pure: every function takes `now`.

// Home's path on the suite's one site (pwa-kit docs/one-site.md). In the browser the origin is the
// page's, so staging links to staging; unit tests run without a page.
const BASE = import.meta.env.BASE_URL ?? '/home/';
const ORIGIN = globalThis.location?.origin ?? SUITE_ORIGIN;
/** Home's address, ending in `/home/`. */
export const APP_URL = appUrl(BASE, '', ORIGIN);
/** The repo short name the agenda files Home's items under. */
export const AGENDA_APP = 'home';

export type AgendaEntry = Omit<AgendaInput, 'ref'>;

export const jobRef = (id: string) => `job:${id}`;
export const visitRef = (id: string) => `visit:${id}`;
export const warrantyRef = (id: string) => `warranty:${id}`;

export const screen = (tab: TabId) => appUrl(BASE, `#${tab}`, ORIGIN);
const contactName = (contacts: Contact[], id?: string) => (id ? contacts.find((c) => c.id === id)?.name : undefined);
const joined = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ') || undefined;
const inWindow = (items: AgendaEntry[], now: number) => items.filter((i) => inAgendaWindow(i, now));

// ---- Changes made in a person's own calendar (huishouden/calendar) ----
//
// Each item says how a change made in Google Calendar is written back to its record, as the person
// who made it, so the rules still decide: admins and members change anything; helpers and kids
// what they added (and, on any job, its due day: the rules let them tick jobs off).

const STAFF: Role[] = ['admin', 'member'];
const EVERYONE: Role[] = ['admin', 'member', 'helper', 'kid'];

/** One merge onto a record, by the roles and the record's own author. */
export function mergeAction(col: string, id: string, data: Record<string, unknown>, roles: Role[], by: string): AgendaAction {
  return { ops: [{ col, id, data: { ...data, updatedAt: '$now' }, merge: true }], roles, emails: [by] };
}

/**
 * A job: moved to another day (its due date), renamed, or given notes when it has none (notes it
 * already has aren't in the calendar, so a calendar never overwrites them).
 */
export function jobEdit(task: HomeTask): AgendaEdit {
  return {
    reschedule: mergeAction('homeTasks', task.id, { due: '$date' }, EVERYONE, task.by),
    rename: mergeAction('homeTasks', task.id, { title: '$title' }, STAFF, task.by),
    ...(task.notes ? {} : { notes: mergeAction('homeTasks', task.id, { notes: '$notes' }, STAFF, task.by) }),
  };
}

/** A booked visit: moved, renamed, notes when it has none, or cancelled (the entry deleted). */
export function visitEdit(entry: ServiceEntry): AgendaEdit {
  return {
    reschedule: mergeAction('homeServiceLog', entry.id, { date: '$date' }, STAFF, entry.by),
    rename: mergeAction('homeServiceLog', entry.id, { title: '$title' }, STAFF, entry.by),
    ...(entry.notes ? {} : { notes: mergeAction('homeServiceLog', entry.id, { notes: '$notes' }, STAFF, entry.by) }),
    cancel: { ops: [{ col: 'homeServiceLog', id: entry.id, data: null }], roles: STAFF, emails: [entry.by] },
  };
}

/** An item as "Add to calendar" takes it: what the app publishes, a regular event with its schedule. */
export function calendarEntry(item: AgendaEntry): CalendarEntry {
  return {
    title: item.title,
    start: item.start,
    ...(item.end !== undefined ? { end: item.end } : {}),
    allDay: item.allDay,
    ...(item.detail ? { detail: item.detail } : {}),
    url: item.url,
    kind: item.kind,
    ...(item.series ? { series: { rule: item.series.rule, ...(item.series.time ? { time: item.series.time } : {}), ...(item.series.minutes ? { minutes: item.series.minutes } : {}) } } : {}),
  };
}

/** A job's next due day: overdue once that day has passed. Only the next one, not every occurrence; none while paused. */
export function jobAgenda(task: HomeTask, contacts: Contact[], now: number): AgendaEntry[] {
  if (isPaused(task)) return [];
  const overdue = dueState(task.due, toYmd(now)).state === 'overdue';
  return inWindow(
    [
      {
        kind: 'due',
        title: task.title,
        start: allDayStart(task.due),
        allDay: true,
        detail: joined(describeSchedule(task.schedule), contactName(contacts, task.contactId)),
        url: screen('upkeep'),
        status: overdue ? 'overdue' : 'upcoming',
        edit: jobEdit(task),
      },
    ],
    now,
  );
}

/**
 * A visit booked ahead: an entry dated after the day it was added. Entries added on or after their
 * day are history (what was done), which stays in the app.
 */
export function isBookedVisit(entry: Pick<ServiceEntry, 'date' | 'createdAt'>): boolean {
  return daysBetween(toYmd(entry.createdAt), entry.date) > 0;
}

/** A booked visit, on its day, with who is coming. */
export function visitAgenda(entry: ServiceEntry, contacts: Contact[], now: number): AgendaEntry[] {
  if (!isBookedVisit(entry)) return [];
  return inWindow(
    [
      {
        kind: 'appointment',
        title: entry.title,
        start: allDayStart(entry.date),
        allDay: true,
        detail: contactName(contacts, entry.contactId) ?? entry.who,
        url: screen('history'),
        edit: visitEdit(entry),
      },
    ],
    now,
  );
}

/** The day a warranty ends, from 30 days back to 180 ahead (the agenda's window). */
export function warrantyAgenda(w: Warranty, now: number): AgendaEntry[] {
  if (!w.warrantyEnd) return [];
  return inWindow(
    [
      {
        kind: 'renewal',
        title: t('agenda.warrantyEnds', { item: w.item }),
        start: allDayStart(w.warrantyEnd),
        allDay: true,
        detail: w.details,
        url: screen('warranties'),
      },
    ],
    now,
  );
}

/** Everything Home publishes, for `syncAgenda` when the app opens. */
export function agendaItems(data: Pick<HomeData, 'tasks' | 'log' | 'warranties' | 'contacts' | 'events' | 'prep'>, now: number): AgendaInput[] {
  const withRef = (ref: string, items: AgendaEntry[]) => items.map((i) => ({ ...i, ref }));
  return [
    ...data.tasks.flatMap((t) => withRef(jobRef(t.id), jobAgenda(t, data.contacts, now))),
    ...data.log.flatMap((e) => withRef(visitRef(e.id), visitAgenda(e, data.contacts, now))),
    ...data.warranties.flatMap((w) => withRef(warrantyRef(w.id), warrantyAgenda(w, now))),
    ...data.events.flatMap((e) => withRef(eventRef(e.id), eventAgenda(e, data.contacts, now, screen('regular')))),
    ...data.events.flatMap((e) => withRef(prepRef(e.id), prepAgenda(e, data.prep, now, screen('regular')))),
  ];
}

// ---- Add to calendar: one item into the person's own calendar ----

/** A job's due day, as Add to calendar takes it (the same words the agenda has). */
export function jobEntry(task: HomeTask, contacts: Contact[]): CalendarEntry {
  return { title: task.title, start: allDayStart(task.due), allDay: true, detail: joined(describeSchedule(task.schedule), contactName(contacts, task.contactId)), url: screen('upkeep'), kind: 'due' };
}

/** A booked visit's day. */
export function visitEntry(entry: ServiceEntry, contacts: Contact[]): CalendarEntry {
  const detail = contactName(contacts, entry.contactId) ?? entry.who;
  return { title: entry.title, start: allDayStart(entry.date), allDay: true, ...(detail ? { detail } : {}), url: screen('history'), kind: 'appointment' };
}

/** The day a warranty ends. */
export function warrantyEntry(w: Warranty): CalendarEntry | null {
  if (!w.warrantyEnd) return null;
  return { title: t('agenda.warrantyEnds', { item: w.item }), start: allDayStart(w.warrantyEnd), allDay: true, ...(w.details ? { detail: w.details } : {}), url: screen('warranties'), kind: 'renewal' };
}
