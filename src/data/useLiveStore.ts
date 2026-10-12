import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query, where, type Query } from 'firebase/firestore';
import { commitOps } from '@huishouden/pwa-kit/firestore';
import { t } from '../i18n';
import { householdContacts, watchContacts, type Contact } from '@huishouden/pwa-kit/contacts';
import { APP } from '../lib/contacts';
import type { HomeEvent, HomeTask, PrepTick, ServiceEntry, Warranty } from '../lib/model';
import { DAY } from '@huishouden/pwa-kit/time';
import { readError } from '@huishouden/pwa-kit/feedback';
import { db } from './firebase';
import { COLLECTIONS, applyOps, createActions, type Backend } from './actions';
import { publishChanges, publishContactRename, publishOnOpen, publishTodos } from './publish';
import type { HomeActions, HomeStore } from './types';

const { tasks: TASKS, log: LOG, warranties: WARRANTIES, events: EVENTS, prep: PREP } = COLLECTIONS;
/** Ticks older than this are history nobody looks at: not loaded. */
const PREP_LOAD_DAYS = 21;
/** The to-do list catches up this long after the last change. */
const TODO_DELAY_MS = 3000;

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
    const fail = (prefix: string) => (e: Error) => errorRef.current(readError(e, prefix));
    const answered = (name: string) => setLoaded((l) => (l.has(name) ? l : new Set(l).add(name)));
    const list = <T,>(name: string, set: (items: T[]) => void, what: () => string, onFirst?: () => void, source: Query = collection(db, base, name)) =>
      onSnapshot(
        source,
        (s) => {
          set(s.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
          answered(name);
          onFirst?.();
        },
        (e) => {
          onFirst?.();
          fail(what())(e);
        },
      );
    const unsubs = [
      list<HomeTask>(TASKS, setTasks, () => t('live.loadTasks'), () => setReady(true)),
      list<ServiceEntry>(LOG, setLog, () => t('live.loadHistory')),
      list<Warranty>(WARRANTIES, setWarranties, () => t('live.loadWarranties')),
      list<HomeEvent>(EVENTS, setEvents, () => t('live.loadEvents')),
      list<PrepTick>(PREP, setPrep, () => t('live.loadPrep'), undefined, query(collection(db, base, PREP), where('at', '>=', Date.now() - PREP_LOAD_DAYS * DAY))),
      watchContacts(
        db,
        householdId,
        (c) => {
          setContacts(c);
          answered('contacts');
        },
        { app: APP, restricted, backfillPositions: true, onError: (e) => fail(t('live.loadContacts'))(e) },
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [base, householdId, restricted]);

  // Once per open, with every list loaded: makes the household agenda match Home's data, which also
  // repairs what another device or an older version left and moves jobs to overdue as days pass.
  const synced = useRef(false);
  const todosSynced = useRef(false);
  const allLoaded = [TASKS, LOG, WARRANTIES, EVENTS, PREP, 'contacts'].every((n) => loaded.has(n));
  useEffect(() => {
    if (!allLoaded || synced.current) return;
    synced.current = true;
    // Every language's words, so each member reads the agenda, to-dos and reminders in their own.
    void publishOnOpen(db, householdId, me, current.current, Date.now(), { restricted });
  }, [allLoaded, householdId, me, restricted]);

  // The household to-do list follows Home's data: on open, and a few seconds after any change
  // (done here or in the portal, a day passing on the next open). Replace-by-app, writes only what changed.
  useEffect(() => {
    if (!allLoaded) return;
    const timer = setTimeout(
      () => {
        void publishTodos(db, householdId, me, current.current, Date.now(), { restricted });
      },
      todosSynced.current ? TODO_DELAY_MS : 0,
    );
    todosSynced.current = true;
    return () => clearTimeout(timer);
  }, [allLoaded, householdId, me, restricted, tasks, contacts, events, prep]);

  const actions = useMemo<HomeActions>(() => {
    // The agenda follows each save; a failure there never fails the save (the next open repairs it).
    const report = (p: Promise<unknown>) => void p.catch((e) => errorRef.current(readError(e, t('live.saveFailed'))));

    const contacts = householdContacts(db, householdId, APP, me, report);
    const backend: Backend = {
      newId: (col) => doc(collection(db, base, COLLECTIONS[col])).id,
      write: (ops) => {
        report(commitOps(db, base, ops, (col) => COLLECTIONS[col]));
        const before = current.current;
        void publishChanges(db, householdId, me, before, applyOps(before, ops), ops, Date.now(), { restricted });
      },
      contacts: {
        ...contacts,
        save: (id, input) => {
          contacts.save(id, input);
          if (!id) return;
          // Jobs, visits and events name their contact on the agenda: a renamed one is republished.
          void publishContactRename(db, householdId, me, current.current, id, input.name, Date.now(), { restricted });
        },
      },
    };
    return createActions(backend, () => current.current, me, () => Date.now());
  }, [base, householdId, me, restricted]);

  return { data: { tasks, log, warranties, contacts, events, prep }, ready, actions, me };
}
