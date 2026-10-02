import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query, where, type Query } from 'firebase/firestore';
import { deleteDoc, setDoc, writeBatch } from '@huishouden/pwa-kit/firestore';
import { removeAgenda, replaceAgenda, syncAgenda } from '@huishouden/pwa-kit/agenda';
import { syncReminders } from '@huishouden/pwa-kit/reminders';
import { addContact, removeContactFromApp, restoreContact, updateContact, watchContacts, type Contact } from '@huishouden/pwa-kit/contacts';
import { AGENDA_APP, APP_URL, agendaItems, jobAgenda, jobRef, screen, visitAgenda, visitRef, warrantyAgenda, warrantyRef, type AgendaEntry } from '../lib/agenda';
import { eventAgenda, eventRef, prepAgenda, prepReminders, prepRef, withOccurrenceChange } from '../lib/events';
import { APP } from '../lib/contacts';
import { doneFromEntry, markDone, tickedTask } from '../lib/done';
import {
  eventDoc, prepTickDoc, prepTickId, serviceDoc, taskDoc, warrantyDoc, withoutId, type HomeEvent, type HomeTask, type PrepTick, type ServiceEntry, type Warranty,
} from '../lib/model';
import { DAY, toYmd } from '@huishouden/pwa-kit/time';
import { readError } from '@huishouden/pwa-kit/feedback';
import { db } from './firebase';
import type { HomeActions, HomeStore } from './types';
import { track } from '@huishouden/pwa-kit/observability';

const TASKS = 'homeTasks';
const LOG = 'homeServiceLog';
const WARRANTIES = 'homeWarranties';
const EVENTS = 'homeEvents';
const PREP = 'homeEventPrep';
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
    const publish = (ref: string, items: AgendaEntry[]) =>
      void replaceAgenda(db, householdId, AGENDA_APP, ref, items, { by: me, restricted }).catch((e) => console.warn("Couldn't update the household agenda", e));
    const unpublish = (ref: string) => void removeAgenda(db, householdId, AGENDA_APP, ref, { restricted }).catch((e) => console.warn("Couldn't update the household agenda", e));
    // An event's occurrences and its things to do before, on the agenda; and the reminders for them all.
    const publishEvent = (event: HomeEvent, ticks = current.current.prep) => {
      const now = Date.now();
      publish(eventRef(event.id), eventAgenda(event, current.current.contacts, now, REGULAR_URL));
      publish(prepRef(event.id), prepAgenda(event, ticks, now, REGULAR_URL));
    };
    const remind = (events: HomeEvent[], ticks: PrepTick[]) => {
      const now = Date.now();
      void syncReminders(db, householdId, AGENDA_APP, prepReminders(events, ticks, now, HOME_URL), me, now, { restricted }).catch((e) => console.warn("Couldn't schedule reminders", e));
    };
    const upsert = <T extends { id: string }>(list: T[], item: T) => [...list.filter((x) => x.id !== item.id), item];
    const publishJob = (task: HomeTask, contacts = current.current.contacts) => publish(jobRef(task.id), jobAgenda(task, contacts, Date.now()));
    const publishVisit = (entry: ServiceEntry, contacts = current.current.contacts) => publish(visitRef(entry.id), visitAgenda(entry, contacts, Date.now()));
    const publishWarranty = (w: Warranty) => publish(warrantyRef(w.id), warrantyAgenda(w, Date.now()));
    const report = (p: Promise<unknown>) => void p.catch((e) => errorRef.current(readError(e, "Couldn't save")));
    const ref = (name: string, id?: string | null) => (id ? doc(db, base, name, id) : doc(collection(db, base, name)));
    const stampFor = (existing?: { by: string; createdAt: number }) => {
      const now = Date.now();
      return existing ? { by: existing.by, createdAt: existing.createdAt, updatedAt: now } : { by: me, createdAt: now };
    };
    return {
      saveTask: (id, input) => {
        track('save job');
        const taskRef = ref(TASKS, id);
        const data = taskDoc(input, stampFor(current.current.tasks.find((t) => t.id === id)));
        report(setDoc(taskRef, data));
        publishJob({ id: taskRef.id, ...data });
      },
      deleteTask: (id) => {
        report(deleteDoc(ref(TASKS, id)));
        unpublish(jobRef(id));
      },
      restoreTask: (t) => {
        report(setDoc(ref(TASKS, t.id), withoutId(t)));
        publishJob(t);
      },
      markDone: (task, doneOn) => {
        track('mark job done');
        const { due, lastDone, entry } = markDone(task, doneOn);
        const entryRef = ref(LOG);
        const batch = writeBatch(db);
        const moved = tickedTask(task, { due, lastDone }, Date.now());
        batch.set(ref(TASKS, task.id), withoutId(moved));
        batch.set(entryRef, serviceDoc(entry, { by: me, createdAt: Date.now() }));
        report(batch.commit());
        publishJob(moved);
        return { entryId: entryRef.id, next: due };
      },
      undoDone: (task, entryId) => {
        const batch = writeBatch(db);
        batch.set(ref(TASKS, task.id), withoutId(task));
        batch.delete(ref(LOG, entryId));
        report(batch.commit());
        publishJob(task);
      },
      saveEntry: (id, input) => {
        track('log service');
        const existing = id ? current.current.log.find((e) => e.id === id) : undefined;
        const data = serviceDoc(input, stampFor(existing));
        const entryRef = ref(LOG, id);
        const batch = writeBatch(db);
        batch.set(entryRef, data);
        const task = !existing && data.taskId ? current.current.tasks.find((t) => t.id === data.taskId) : undefined;
        const moved = task ? doneFromEntry(task, data.date, toYmd(Date.now())) : null;
        const movedTask = task && moved ? tickedTask(task, moved, Date.now()) : null;
        if (movedTask) batch.set(ref(TASKS, movedTask.id), withoutId(movedTask));
        report(batch.commit());
        publishVisit({ id: entryRef.id, ...data });
        if (movedTask) publishJob(movedTask);
      },
      deleteEntry: (id) => {
        report(deleteDoc(ref(LOG, id)));
        unpublish(visitRef(id));
      },
      restoreEntry: (e) => {
        report(setDoc(ref(LOG, e.id), withoutId(e)));
        publishVisit(e);
      },
      saveWarranty: (id, input) => {
        track('save warranty');
        const docRef = ref(WARRANTIES, id);
        const data = warrantyDoc(input, stampFor(current.current.warranties.find((w) => w.id === id)));
        report(setDoc(docRef, data));
        publishWarranty({ id: docRef.id, ...data });
      },
      deleteWarranty: (id) => {
        report(deleteDoc(ref(WARRANTIES, id)));
        unpublish(warrantyRef(id));
      },
      restoreWarranty: (w) => {
        report(setDoc(ref(WARRANTIES, w.id), withoutId(w)));
        publishWarranty(w);
      },
      saveEvent: (id, input) => {
        track('save regular event');
        const eventDocRef = ref(EVENTS, id);
        const data = eventDoc(input, stampFor(current.current.events.find((e) => e.id === id)));
        const event = { id: eventDocRef.id, ...data };
        report(setDoc(eventDocRef, data));
        publishEvent(event);
        remind(upsert(current.current.events, event), current.current.prep);
      },
      deleteEvent: (id) => {
        report(deleteDoc(ref(EVENTS, id)));
        unpublish(eventRef(id));
        unpublish(prepRef(id));
        remind(current.current.events.filter((e) => e.id !== id), current.current.prep);
      },
      restoreEvent: (e) => {
        report(setDoc(ref(EVENTS, e.id), withoutId(e)));
        publishEvent(e);
        remind(upsert(current.current.events, e), current.current.prep);
      },
      changeOccurrence: (event, original, change) => {
        track(change?.skipped ? 'skip occurrence' : change ? 'move occurrence' : 'restore occurrence');
        const now = Date.now();
        const data = eventDoc(withOccurrenceChange(event, original, change, toYmd(now)), { by: event.by, createdAt: event.createdAt, updatedAt: now });
        const changed = { id: event.id, ...data };
        report(setDoc(ref(EVENTS, event.id), data));
        publishEvent(changed);
        remind(upsert(current.current.events, changed), current.current.prep);
      },
      tickPrep: (event, original) => {
        track('tick prep');
        const id = prepTickId(event.id, original);
        const data = prepTickDoc(me, Date.now());
        report(setDoc(ref(PREP, id), data));
        const ticks = upsert(current.current.prep, { id, ...data });
        publishEvent(event, ticks);
        remind(current.current.events, ticks);
      },
      untickPrep: (event, original) => {
        const id = prepTickId(event.id, original);
        report(deleteDoc(ref(PREP, id)));
        const ticks = current.current.prep.filter((t) => t.id !== id);
        publishEvent(event, ticks);
        remind(current.current.events, ticks);
      },
      saveContact: (id, input) => {
        report(id ? updateContact(db, householdId, id, input, me) : addContact(db, householdId, input, me));
        if (!id) return;
        // Jobs and visits name their contact on the agenda: a renamed one is republished.
        const contacts = current.current.contacts.map((c) => (c.id === id ? { ...c, name: input.name } : c));
        current.current.tasks.filter((t) => t.contactId === id).forEach((t) => publishJob(t, contacts));
        current.current.log.filter((e) => e.contactId === id).forEach((e) => publishVisit(e, contacts));
        current.current.events.filter((e) => e.contactId === id).forEach((e) => publish(eventRef(e.id), eventAgenda(e, contacts, Date.now(), REGULAR_URL)));
      },
      deleteContact: (id) => {
        const c = current.current.contacts.find((x) => x.id === id);
        // A contact other apps also show stays for them; Home only stops showing it.
        if (c) report(removeContactFromApp(db, householdId, c, APP, me));
      },
      restoreContact: (c) => report(restoreContact(db, householdId, c)),
    };
  }, [base, householdId, me, restricted]);

  return { data: { tasks, log, warranties, contacts, events, prep }, ready, actions, me };
}
