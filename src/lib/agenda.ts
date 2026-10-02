import type { AgendaInput } from '@huishouden/pwa-kit/agenda';
import { allDayStart, inAgendaWindow } from '@huishouden/pwa-kit/agenda';
import type { Contact } from '@huishouden/pwa-kit/contacts';
import { describeSchedule } from '@huishouden/pwa-kit/schedule';
import { daysBetween, toYmd } from '@huishouden/pwa-kit/time';
import type { HomeTask, ServiceEntry, Warranty } from './model';
import type { HomeData } from './demo';
import type { TabId } from './tabs';
import { dueState } from './upkeep';

// What Home puts on the household agenda (households/{id}/agenda, read by the portal): each job's
// next due date, visits booked ahead, and warranties ending. Pure: every function takes `now`.

/** Home's public address (the same as the PWA manifest's). */
export const APP_URL = 'https://huishouden-home.web.app';
/** The repo short name the agenda files Home's items under. */
export const AGENDA_APP = 'home';

export type AgendaEntry = Omit<AgendaInput, 'ref'>;

export const jobRef = (id: string) => `job:${id}`;
export const visitRef = (id: string) => `visit:${id}`;
export const warrantyRef = (id: string) => `warranty:${id}`;

const screen = (appUrl: string, tab: TabId) => `${appUrl}/#${tab}`;
const contactName = (contacts: Contact[], id?: string) => (id ? contacts.find((c) => c.id === id)?.name : undefined);
const joined = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ') || undefined;
const inWindow = (items: AgendaEntry[], now: number) => items.filter((i) => inAgendaWindow(i, now));

/** A job's next due day: overdue once that day has passed. Only the next one, not every occurrence. */
export function jobAgenda(task: HomeTask, contacts: Contact[], now: number, appUrl = APP_URL): AgendaEntry[] {
  const overdue = dueState(task.due, toYmd(now)).state === 'overdue';
  return inWindow(
    [
      {
        kind: 'due',
        title: task.title,
        start: allDayStart(task.due),
        allDay: true,
        detail: joined(describeSchedule(task.schedule), contactName(contacts, task.contactId)),
        url: screen(appUrl, 'upkeep'),
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
export function visitAgenda(entry: ServiceEntry, contacts: Contact[], now: number, appUrl = APP_URL): AgendaEntry[] {
  if (!isBookedVisit(entry)) return [];
  return inWindow(
    [
      {
        kind: 'appointment',
        title: entry.title,
        start: allDayStart(entry.date),
        allDay: true,
        detail: contactName(contacts, entry.contactId) ?? entry.who,
        url: screen(appUrl, 'history'),
      },
    ],
    now,
  );
}

/** The day a warranty ends, from 30 days back to 180 ahead (the agenda's window). */
export function warrantyAgenda(w: Warranty, now: number, appUrl = APP_URL): AgendaEntry[] {
  if (!w.warrantyEnd) return [];
  return inWindow(
    [
      {
        kind: 'renewal',
        title: `${w.item} warranty ends`,
        start: allDayStart(w.warrantyEnd),
        allDay: true,
        detail: w.details,
        url: screen(appUrl, 'warranties'),
      },
    ],
    now,
  );
}

/** Everything Home publishes, for `syncAgenda` when the app opens. */
export function agendaItems(data: Pick<HomeData, 'tasks' | 'log' | 'warranties' | 'contacts'>, now: number, appUrl = APP_URL): AgendaInput[] {
  const withRef = (ref: string, items: AgendaEntry[]) => items.map((i) => ({ ...i, ref }));
  return [
    ...data.tasks.flatMap((t) => withRef(jobRef(t.id), jobAgenda(t, data.contacts, now, appUrl))),
    ...data.log.flatMap((e) => withRef(visitRef(e.id), visitAgenda(e, data.contacts, now, appUrl))),
    ...data.warranties.flatMap((w) => withRef(warrantyRef(w.id), warrantyAgenda(w, now, appUrl))),
  ];
}
