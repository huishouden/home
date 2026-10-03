import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query, where, type Query } from 'firebase/firestore';
import { commitOps } from '@huishouden/pwa-kit/firestore';
import { removeAgenda, replaceAgenda, syncAgenda } from '@huishouden/pwa-kit/agenda';
import { syncReminders } from '@huishouden/pwa-kit/reminders';
import { householdContacts, watchContacts, type Contact } from '@huishouden/pwa-kit/contacts';
import { AGENDA_APP, APP_URL, agendaItems, jobAgenda, jobRef, screen, visitAgenda, visitRef, warrantyAgenda, warrantyRef, type AgendaEntry } from '../lib/agenda';
import { eventAgenda, eventRef, prepAgenda, prepReminders, prepRef } from '../lib/events';
import { APP } from '../lib/contacts';
import type { HomeData } from '../lib/demo';
import type { HomeEvent, HomeTask, PrepTick, ServiceEntry, Warranty } from '../lib/model';
import { DAY } from '@huishouden/pwa-kit/time';
import { readError } from '@huishouden/pwa-kit/feedback';
import { db } from './firebase';
import { COLLECTIONS, applyOps, createActions, type Backend, type DataKey, type Op } from './actions';
import type { HomeActions, HomeStore } from './types';

const { tasks: TASKS, log: LOG, warranties: WARRANTIES, events: EVENTS, prep: PREP } = COLLECTIONS;
/** Ticks older than this are history nobody looks at: not loaded. */
const PREP_LOAD_DAYS = 21;
const REGULAR_URL = screen(APP_URL, 'regular');
const HOME_URL = `${APP_URL}/`;

/**
 * Live household data from Firestore with onSnapshot listeners. Writes are fire-and-forget: the
 * persistent cache applies them locally at once (also offline) and syncs later.
 */
export function useLiveStore(householdId: string, me: string, onError: (message: string) => void, restricted = false): HomeStore {
  const [tasks, setTasks] = useState<HomeTask[]>([]);
  const [log, setLog] = useState<ServiceEntry[]>([]);
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [events, setEvents] = useState<HomeEvent[]>([]);
  const [prep, setPrep] = useState<PrepTick[]>([]);
  const [ready, setReady] = useState(false);
  // Which lists have answered once: the agenda is reconciled only when all of them have.
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(new Set());
  const current = useRef({ tasks, log, warranties, contacts, events, prep });
  current.current = { tasks, log, warranties, contacts, events, prep };
  const errorRef = useRef(onError);
  errorRef.current = onError;

  const base = `households/${householdId}`;

  useEffect(() => {
    const fail = (what: string) => (e: Error) => errorRef.current(readError(e, `Couldn't load ${what}`));
    const answered = (name: string) => setLoaded((l) => (l.has(name) ? l : new Set(l).add(name)));
    const list = <T,>(name: string, set: (items: T[]) => void, what: string, onFirst?: () => void, source: Query = collection(db, base, name)) =>
      onSnapshot(
        source,
        (s) => {
          set(s.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
          answered(name);
          onFirst?.();
        },
        (e) => {
          onFirst?.();
          fail(what)(e);
        },
      );
    const unsubs = [
      list<HomeTask>(TASKS, setTasks, 'the upkeep list', () => setReady(true)),
      list<ServiceEntry>(LOG, setLog, 'the history'),
      list<Warranty>(WARRANTIES, setWarranties, 'the warranties'),
      list<HomeEvent>(EVENTS, setEvents, 'the regular events'),
      list<PrepTick>(PREP, setPrep, 'what was put out', undefined, query(collection(db, base, PREP), where('at', '>=', Date.now() - PREP_LOAD_DAYS * DAY))),
      watchContacts(
        db,
        householdId,
        (c) => {
          setContacts(c);
          answered('contacts');
        },
        { app: APP, restricted, onError: fail('the contacts') },
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [base, householdId, restricted]);

  // Once per open, with every list loaded: makes the household agenda match Home's data, which also
  // repairs what another device or an older version left and moves jobs to overdue as days pass.
  const synced = useRef(false);
  const allLoaded = [TASKS, LOG, WARRANTIES, EVENTS, PREP, 'contacts'].every((n) => loaded.has(n));
  useEffect(() => {
    if (!allLoaded || synced.current) return;
    synced.current = true;
    const now = Date.now();
    syncAgenda(db, householdId, AGENDA_APP, agendaItems(current.current, now), { by: me, restricted, now }).catch((e) => console.warn("Couldn't update the household agenda", e));
    // Reminders for the things to do before regular events, topped up for the next two weeks.
    const { events, prep } = current.current;
    syncReminders(db, householdId, AGENDA_APP, prepReminders(events, prep, now, HOME_URL), me, now, { restricted }).catch((e) => console.warn("Couldn't schedule reminders", e));
  }, [allLoaded, householdId, me, restricted]);

  const actions = useMemo<HomeActions>(() => {
    // The agenda follows each save; a failure there never fails the save (the next open repairs it).
    const warn = (e: unknown) => console.warn("Couldn't update the household agenda", e);
    const publish = (ref: string, items: AgendaEntry[]) => void replaceAgenda(db, householdId, AGENDA_APP, ref, items, { by: me, restricted }).catch(warn);
    const unpublish = (ref: string) => void removeAgenda(db, householdId, AGENDA_APP, ref, { restricted }).catch(warn);
    const report = (p: Promise<unknown>) => void p.catch((e) => errorRef.current(readError(e, "Couldn't save")));

    /** A record's agenda items, by ref, in `data`: none when it isn't there. */
    const itemsOf = (data: HomeData, col: DataKey, id: string, now: number): [string, AgendaEntry[]][] => {
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
    };

    /**
     * After a write: replaces the agenda items of each record it touched, removes those of deleted
     * ones, and tops up the reminders when an event or a tick changed. Records with no items before
     * or after are left alone.
     */
    const publishChanges = (before: HomeData, after: HomeData, ops: Op[]) => {
      const now = Date.now();
      const done = new Set<string>();
      for (const op of ops) {
        const gone = (op.col === 'events' && !after.events.some((e) => e.id === op.id)) || (op.col !== 'prep' && !op.data);
        const was = new Map(itemsOf(before, op.col, op.id, now));
        for (const [ref, items] of itemsOf(after, op.col, op.id, now)) {
          if (done.has(ref)) continue;
          done.add(ref);
          if (gone) unpublish(ref);
          else if (items.length || was.get(ref)?.length) publish(ref, items);
        }
      }
      if (ops.some((op) => op.col === 'events' || op.col === 'prep'))
        void syncReminders(db, householdId, AGENDA_APP, prepReminders(after.events, after.prep, now, HOME_URL), me, now, { restricted }).catch((e) =>
          console.warn("Couldn't schedule reminders", e),
        );
    };

    const contacts = householdContacts(db, householdId, APP, me, report);
    const backend: Backend = {
      newId: (col) => doc(collection(db, base, COLLECTIONS[col])).id,
      write: (ops) => {
        report(commitOps(db, base, ops, (col) => COLLECTIONS[col]));
        const before = current.current;
        publishChanges(before, applyOps(before, ops), ops);
      },
      contacts: {
        ...contacts,
        save: (id, input) => {
          contacts.save(id, input);
          if (!id) return;
          // Jobs, visits and events name their contact on the agenda: a renamed one is republished.
          const d = current.current;
          const renamed = { ...d, contacts: d.contacts.map((c) => (c.id === id ? { ...c, name: input.name } : c)) };
          const now = Date.now();
          const refs = [
            ...d.tasks.filter((t) => t.contactId === id).map((t) => itemsOf(renamed, 'tasks', t.id, now)[0]),
            ...d.log.filter((e) => e.contactId === id).map((e) => itemsOf(renamed, 'log', e.id, now)[0]),
            ...d.events.filter((e) => e.contactId === id).map((e) => itemsOf(renamed, 'events', e.id, now)[0]),
          ];
          for (const [ref, items] of refs) publish(ref, items);
        },
      },
    };
    return createActions(backend, () => current.current, me, () => Date.now());
  }, [base, householdId, me, restricted]);

  return { data: { tasks, log, warranties, contacts, events, prep }, ready, actions, me };
}
