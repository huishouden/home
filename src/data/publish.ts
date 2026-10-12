import type { Firestore } from 'firebase/firestore';
import { localizeAgenda, removeAgenda, replaceAgenda, syncAgenda } from '@huishouden/pwa-kit/agenda';
import { localizeReminders, syncReminders } from '@huishouden/pwa-kit/reminders';
import { localizeTodos, syncTodos } from '@huishouden/pwa-kit/todos';
import { todoItems } from '../lib/todos';
import { AGENDA_APP, APP_URL, agendaItems, jobAgenda, jobRef, screen, visitAgenda, visitRef, warrantyAgenda, warrantyRef, type AgendaEntry } from '../lib/agenda';
import { eventAgenda, eventRef, prepAgenda, prepReminders, prepRef } from '../lib/events';
import type { HomeData } from '../lib/demo';
import type { DataKey, Op } from './actions';

// What Home publishes for the household (the agenda, the to-do list, the reminders before regular
// events), as plain functions of a Firestore and the data, so each is read-budgeted on the
// emulators (e2e/reads.sdk.ts). The live store calls them.

const REGULAR_URL = screen('regular');

type Published = NonNullable<Parameters<typeof syncAgenda>[4]['published']>;

export interface PublishOptions {
  /** A helper's device: only what helpers may read and write. */
  restricted?: boolean;
  /** Where this device notes what it published (default localStorage; null reads every time). */
  published?: Published | null;
}

const settle = <T,>(p: Promise<T>): Promise<PromiseSettledResult<T>> => p.then((value) => ({ status: 'fulfilled' as const, value }), (reason: unknown) => ({ status: 'rejected' as const, reason }));

const publishedOf = ({ published }: PublishOptions) => (published === undefined ? {} : { published });

/**
 * On open, with every list loaded: the household agenda made to match Home's data (one query), then
 * the reminders before regular events topped up for the next two weeks (one query). One after the
 * other, each reading what is there when it runs; one failing doesn't stop the other (its result is
 * the error).
 */
export async function publishOnOpen(db: Firestore, householdId: string, me: string, data: HomeData, now: number, options: PublishOptions = {}) {
  const { restricted = false } = options;
  const agenda = await settle(localizeAgenda(() => agendaItems(data, now)).then((items) => syncAgenda(db, householdId, AGENDA_APP, items, { by: me, restricted, now, ...publishedOf(options) })));
  const reminders = await settle(localizeReminders(() => prepReminders(data.events, data.prep, now, APP_URL)).then((items) => syncReminders(db, householdId, AGENDA_APP, items, me, now, { restricted, ...publishedOf(options) })));
  return { agenda, reminders };
}

/** The household to-do list made to match Home's data: one query, none when this device just published the same. */
export async function publishTodos(db: Firestore, householdId: string, me: string, data: HomeData, now: number, options: PublishOptions = {}) {
  const items = await localizeTodos(() => todoItems(data, now));
  return syncTodos(db, householdId, AGENDA_APP, items, { by: me, restricted: options.restricted ?? false, now, ...publishedOf(options) });
}

/** A record's agenda items, by ref, in `data`: none when it isn't there. */
export function itemsOf(data: HomeData, col: DataKey, id: string, now: number): [string, AgendaEntry[]][] {
  const { contacts } = data;
  if (col === 'tasks') {
    const t = data.tasks.find((x) => x.id === id);
    return [[jobRef(id), t ? jobAgenda(t, contacts, now) : []]];
  }
  if (col === 'log') {
    const e = data.log.find((x) => x.id === id);
    return [[visitRef(id), e ? visitAgenda(e, contacts, now) : []]];
  }
  if (col === 'warranties') {
    const w = data.warranties.find((x) => x.id === id);
    return [[warrantyRef(id), w ? warrantyAgenda(w, now) : []]];
  }
  // An event's occurrences and its things to do before; a tick changes its event's prep.
  const eventId = col === 'events' ? id : id.slice(0, id.lastIndexOf('_'));
  const event = data.events.find((x) => x.id === eventId);
  return [
    [eventRef(eventId), event ? eventAgenda(event, contacts, now, REGULAR_URL) : []],
    [prepRef(eventId), event ? prepAgenda(event, data.prep, now, REGULAR_URL) : []],
  ];
}

/** One record's agenda items replaced (one query of that ref's items), in every language. */
export const publishRef = (db: Firestore, householdId: string, me: string, ref: string, build: () => AgendaEntry[], { restricted = false }: PublishOptions = {}) =>
  localizeAgenda(build).then((items) => replaceAgenda(db, householdId, AGENDA_APP, ref, items, { by: me, restricted }));

/**
 * After a write: replaces the agenda items of each record it touched (one query per ref), removes
 * those of deleted ones, and tops up the reminders (one query) when an event or a tick changed.
 * Records with no items before or after are left alone. One step after the other; `onError` hears
 * a step's failure and the rest still run.
 */
export async function publishChanges(db: Firestore, householdId: string, me: string, before: HomeData, after: HomeData, ops: Op[], now: number, options: PublishOptions & { onError?: (e: unknown) => void } = {}) {
  const { restricted = false, onError } = options;
  const steps: (() => Promise<unknown>)[] = [];
  const done = new Set<string>();
  for (const op of ops) {
    const gone = (op.col === 'events' && !after.events.some((e) => e.id === op.id)) || (op.col !== 'prep' && !op.data);
    const was = new Map(itemsOf(before, op.col, op.id, now));
    for (const [ref, items] of itemsOf(after, op.col, op.id, now)) {
      if (done.has(ref)) continue;
      done.add(ref);
      if (gone) steps.push(() => removeAgenda(db, householdId, AGENDA_APP, ref, { restricted }));
      else if (items.length || was.get(ref)?.length) steps.push(() => publishRef(db, householdId, me, ref, () => new Map(itemsOf(after, op.col, op.id, now)).get(ref) ?? [], { restricted }));
    }
  }
  if (ops.some((op) => op.col === 'events' || op.col === 'prep'))
    steps.push(() => localizeReminders(() => prepReminders(after.events, after.prep, now, APP_URL)).then((items) => syncReminders(db, householdId, AGENDA_APP, items, me, now, { restricted })));
  for (const step of steps) await step().catch((e) => onError?.(e));
}
