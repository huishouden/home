import type { AgendaInput } from '@huishouden/pwa-kit/agenda';
import { allDayStart, inAgendaWindow } from '@huishouden/pwa-kit/agenda';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { describeSchedule } from '@huishouden/pwa-kit/schedule';
import { appUrl } from '@huishouden/pwa-kit/site';
import { daysBetween, toYmd } from '@huishouden/pwa-kit/time';
import type { HomeTask, ServiceEntry, Warranty } from './model';
import { eventAgenda, eventRef, prepAgenda, prepRef } from './events';
import type { HomeData } from './demo';
import type { TabId } from './tabs';
import { dueState, isPaused } from './upkeep';

// What Home puts on the household agenda (households/{id}/agenda, read by the portal): each job's
// next due date, visits booked ahead, warranties ending, and regular events (each occurrence of the
// next 60 days, and the thing to do before it as a task). Pure: every function takes `now`.

// Home's path on the suite's one site (pwa-kit docs/one-site.md). In the browser the origin is the
// page's, so staging links to staging; unit tests run without a page.
const BASE = import.meta.env.BASE_URL ?? '/home/';
const ORIGIN = globalThis.location?.origin ?? 'https://huishouden-piekstra.web.app';
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
        title: `${w.item} warranty ends`,
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
