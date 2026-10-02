import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { deleteDoc, setDoc, writeBatch } from '@huishouden/pwa-kit/firestore';
import { removeAgenda, replaceAgenda, syncAgenda } from '@huishouden/pwa-kit/agenda';
import { addContact, removeContactFromApp, restoreContact, updateContact, watchContacts, type Contact } from '@huishouden/pwa-kit/contacts';
import { AGENDA_APP, agendaItems, jobAgenda, jobRef, visitAgenda, visitRef, warrantyAgenda, warrantyRef, type AgendaEntry } from '../lib/agenda';
import { APP } from '../lib/contacts';
import { doneFromEntry, markDone } from '../lib/done';
import { serviceDoc, taskDoc, warrantyDoc, withoutId, type HomeTask, type ServiceEntry, type Warranty } from '../lib/model';
import { toYmd } from '@huishouden/pwa-kit/time';
import { readError } from '@huishouden/pwa-kit/feedback';
import { db } from './firebase';
import type { HomeActions, HomeStore } from './types';
import { track } from '@huishouden/pwa-kit/observability';

const TASKS = 'homeTasks';
const LOG = 'homeServiceLog';
const WARRANTIES = 'homeWarranties';

/**
 * Live household data from Firestore with onSnapshot listeners. Writes are fire-and-forget: the
 * persistent cache applies them locally at once (also offline) and syncs later.
 */
export function useLiveStore(householdId: string, me: string, onError: (message: string) => void): HomeStore {
  const [tasks, setTasks] = useState<HomeTask[]>([]);
  const [log, setLog] = useState<ServiceEntry[]>([]);
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [ready, setReady] = useState(false);
  // Which lists have answered once: the agenda is reconciled only when all of them have.
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(new Set());
  const current = useRef({ tasks, log, warranties, contacts });
  current.current = { tasks, log, warranties, contacts };
  const errorRef = useRef(onError);
  errorRef.current = onError;

  const base = `households/${householdId}`;

  useEffect(() => {
    const fail = (what: string) => (e: Error) => errorRef.current(readError(e, `Couldn't load ${what}`));
    const answered = (name: string) => setLoaded((l) => (l.has(name) ? l : new Set(l).add(name)));
    const list = <T,>(name: string, set: (items: T[]) => void, what: string, onFirst?: () => void) =>
      onSnapshot(
        collection(db, base, name),
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
      watchContacts(
        db,
        householdId,
        (c) => {
          setContacts(c);
          answered('contacts');
        },
        { app: APP, onError: fail('the contacts') },
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [base, householdId]);

  // Once per open, with every list loaded: makes the household agenda match Home's data, which also
  // repairs what another device or an older version left and moves jobs to overdue as days pass.
  const synced = useRef(false);
  const allLoaded = [TASKS, LOG, WARRANTIES, 'contacts'].every((n) => loaded.has(n));
  useEffect(() => {
    if (!allLoaded || synced.current) return;
    synced.current = true;
    const now = Date.now();
    syncAgenda(db, householdId, AGENDA_APP, agendaItems(current.current, now), { by: me, now }).catch((e) => console.warn("Couldn't update the household agenda", e));
  }, [allLoaded, householdId, me]);

  const actions = useMemo<HomeActions>(() => {
    // The agenda follows each save; a failure there never fails the save (the next open repairs it).
    const publish = (ref: string, items: AgendaEntry[]) =>
      void replaceAgenda(db, householdId, AGENDA_APP, ref, items, { by: me }).catch((e) => console.warn("Couldn't update the household agenda", e));
    const unpublish = (ref: string) => void removeAgenda(db, householdId, AGENDA_APP, ref).catch((e) => console.warn("Couldn't update the household agenda", e));
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
        const moved = { ...task, due, lastDone, updatedAt: Date.now() };
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
        const movedTask = task && moved ? { ...task, ...moved, updatedAt: Date.now() } : null;
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
      saveContact: (id, input) => {
        report(id ? updateContact(db, householdId, id, input, me) : addContact(db, householdId, input, me));
        if (!id) return;
        // Jobs and visits name their contact on the agenda: a renamed one is republished.
        const contacts = current.current.contacts.map((c) => (c.id === id ? { ...c, name: input.name } : c));
        current.current.tasks.filter((t) => t.contactId === id).forEach((t) => publishJob(t, contacts));
        current.current.log.filter((e) => e.contactId === id).forEach((e) => publishVisit(e, contacts));
      },
      deleteContact: (id) => {
        const c = current.current.contacts.find((x) => x.id === id);
        // A contact other apps also show stays for them; Home only stops showing it.
        if (c) report(removeContactFromApp(db, householdId, c, APP, me));
      },
      restoreContact: (c) => report(restoreContact(db, householdId, c)),
    };
  }, [base, householdId, me]);

  return { data: { tasks, log, warranties, contacts }, ready, actions, me };
}
