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
//
// One convention for every publisher here: it never rejects. Each step that fails is reported to
// `onError` (default: a console warning) and the steps after it still run; a step's result is
// null when it failed. Steps run one after the other, each reading what is there when it runs.

const REGULAR_URL = screen('regular');

type Published = NonNullable<Parameters<typeof syncAgenda>[4]['published']>;
type What = 'agenda' | 'reminders' | 'to-dos';

export interface PublishOptions {
  /** A helper's device: only what helpers may read and write. */
  restricted?: boolean;
  /** Where this device notes what it published (default localStorage; null reads every time). */
  published?: Published | null;
  /** Hears a step's failure; the publish goes on with the next step. */
  onError?: (e: unknown, what: What) => void;
}

const WARNINGS: Record<What, string> = { agenda: "Couldn't update the household agenda", reminders: "Couldn't schedule reminders", 'to-dos': "Couldn't update the household to-do list" };
const warn = (e: unknown, what: What) => console.warn(WARNINGS[what], e);

const publishedOf = ({ published }: PublishOptions) => (published === undefined ? {} : { published });

async function step<R>(what: What, run: () => Promise<R>, { onError = warn }: PublishOptions): Promise<R | null> {
  try {
    return await run();
  } catch (e) {
    onError(e, what);
    return null;
  }
}

const syncPrepReminders = (db: Firestore, householdId: string, me: string, data: Pick<HomeData, 'events' | 'prep'>, now: number, options: PublishOptions) =>
  localizeReminders(() => prepReminders(data.events, data.prep, now, APP_URL)).then((items) =>
    syncReminders(db, householdId, AGENDA_APP, items, me, now, { restricted: options.restricted ?? false, ...publishedOf(options) }),
  );

/**
 * On open, with every list loaded: the household agenda made to match Home's data (one query), then
 * the reminders before regular events topped up for the next two weeks (one query).
 */
export async function publishOnOpen(db: Firestore, householdId: string, me: string, data: HomeData, now: number, options: PublishOptions = {}) {
  const restricted = options.restricted ?? false;
  const agenda = await step('agenda', () => localizeAgenda(() => agendaItems(data, now)).then((items) => syncAgenda(db, householdId, AGENDA_APP, items, { by: me, restricted, now, ...publishedOf(options) })), options);
  const reminders = await step('reminders', () => syncPrepReminders(db, householdId, me, data, now, options), options);
  return { agenda, reminders };
}

/** The household to-do list made to match Home's data: one query, none when this device just published the same. */
export function publishTodos(db: Firestore, householdId: string, me: string, data: HomeData, now: number, options: PublishOptions = {}) {
  return step('to-dos', async () => syncTodos(db, householdId, AGENDA_APP, await localizeTodos(() => todoItems(data, now)), { by: me, restricted: options.restricted ?? false, now, ...publishedOf(options) }), options);
}

/** A record's agenda items, by ref, in `data`: none when it isn't there. */
function itemsOf(data: HomeData, col: DataKey, id: string, now: number): [string, AgendaEntry[]][] {
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

/**
 * One step of a publish after a change: a ref's agenda items replaced or removed, or the reminders
 * topped up. A replace carries the builder of its items, not the items: `localizeAgenda` runs it
 * once per app language for each item's words in every language.
 */
export type Step = { kind: 'replace'; ref: string; build: () => AgendaEntry[] } | { kind: 'remove'; ref: string } | { kind: 'reminders' };

/**
 * What a write changes on the agenda and reminders: for each record it touched, its items replaced
 * (or removed when it was deleted), once per ref; records with no items before or after are left
 * alone; the reminders when an event or a tick changed. Pure.
 */
export function planChanges(before: HomeData, after: HomeData, ops: Op[], now: number): Step[] {
  const steps: Step[] = [];
  const done = new Set<string>();
  for (const op of ops) {
    const gone = (op.col === 'events' && !after.events.some((e) => e.id === op.id)) || (op.col !== 'prep' && !op.data);
    const was = new Map(itemsOf(before, op.col, op.id, now));
    for (const [ref, items] of itemsOf(after, op.col, op.id, now)) {
      if (done.has(ref)) continue;
      done.add(ref);
      if (gone) steps.push({ kind: 'remove', ref });
      else if (items.length || was.get(ref)?.length) steps.push({ kind: 'replace', ref, build: () => new Map(itemsOf(after, op.col, op.id, now)).get(ref) ?? [] });
    }
  }
  if (ops.some((op) => op.col === 'events' || op.col === 'prep')) steps.push({ kind: 'reminders' });
  return steps;
}

/**
 * What a contact's new name changes: the agenda items of every job, visit and event that names it.
 * Records with no items (a visit done, a job outside the agenda's window) are left alone: a name
 * can't give them any. Pure.
 */
export function planContactRename(data: HomeData, contactId: string, name: string, now: number): Step[] {
  const renamed = { ...data, contacts: data.contacts.map((c) => (c.id === contactId ? { ...c, name } : c)) };
  const records: [DataKey, string][] = [
    ...data.tasks.filter((x) => x.contactId === contactId).map((x): [DataKey, string] => ['tasks', x.id]),
    ...data.log.filter((x) => x.contactId === contactId).map((x): [DataKey, string] => ['log', x.id]),
    ...data.events.filter((x) => x.contactId === contactId).map((x): [DataKey, string] => ['events', x.id]),
  ];
  return records.flatMap(([col, id]): Step[] => {
    const [ref, items] = itemsOf(renamed, col, id, now)[0];
    return items.length ? [{ kind: 'replace', ref, build: () => itemsOf(renamed, col, id, now)[0][1] }] : [];
  });
}

/** Runs the steps one after the other, one query each, the agenda in every language. */
export async function runSteps(db: Firestore, householdId: string, me: string, steps: Step[], after: Pick<HomeData, 'events' | 'prep'>, now: number, options: PublishOptions = {}): Promise<void> {
  const restricted = options.restricted ?? false;
  for (const s of steps) {
    if (s.kind === 'reminders') await step('reminders', () => syncPrepReminders(db, householdId, me, after, now, options), options);
    else if (s.kind === 'remove') await step('agenda', () => removeAgenda(db, householdId, AGENDA_APP, s.ref, { restricted }), options);
    else await step('agenda', () => localizeAgenda(s.build).then((items) => replaceAgenda(db, householdId, AGENDA_APP, s.ref, items, { by: me, restricted })), options);
  }
}

/** After a write: `planChanges`, run. */
export const publishChanges = (db: Firestore, householdId: string, me: string, before: HomeData, after: HomeData, ops: Op[], now: number, options: PublishOptions = {}) =>
  runSteps(db, householdId, me, planChanges(before, after, ops, now), after, now, options);

/** After a contact is renamed: `planContactRename`, run. */
export const publishContactRename = (db: Firestore, householdId: string, me: string, data: HomeData, contactId: string, name: string, now: number, options: PublishOptions = {}) =>
  runSteps(db, householdId, me, planContactRename(data, contactId, name, now), data, now, options);
