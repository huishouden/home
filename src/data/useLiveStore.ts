import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { addContact, removeContactFromApp, restoreContact, updateContact, watchContacts, type Contact } from '@huishouden/pwa-kit/contacts';
import { APP } from '../lib/contacts';
import { doneFromEntry, markDone } from '../lib/done';
import { serviceDoc, taskDoc, warrantyDoc, withoutId, type HomeTask, type ServiceEntry, type Warranty } from '../lib/model';
import { toYmd } from '@huishouden/pwa-kit/time';
import { readError } from '@huishouden/pwa-kit/feedback';
import { db } from './firebase';
import type { HomeActions, HomeStore } from './types';

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
  const current = useRef({ tasks, log, warranties, contacts });
  current.current = { tasks, log, warranties, contacts };
  const errorRef = useRef(onError);
  errorRef.current = onError;

  const base = `households/${householdId}`;

  useEffect(() => {
    const fail = (what: string) => (e: Error) => errorRef.current(readError(e, `Couldn't load ${what}`));
    const list = <T,>(name: string, set: (items: T[]) => void, what: string, onFirst?: () => void) =>
      onSnapshot(
        collection(db, base, name),
        (s) => {
          set(s.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
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
      watchContacts(db, householdId, setContacts, { app: APP, onError: fail('the contacts') }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [base, householdId]);

  const actions = useMemo<HomeActions>(() => {
    const report = (p: Promise<unknown>) => void p.catch((e) => errorRef.current(readError(e, "Couldn't save")));
    const ref = (name: string, id?: string | null) => (id ? doc(db, base, name, id) : doc(collection(db, base, name)));
    const stampFor = (existing?: { by: string; createdAt: number }) => {
      const now = Date.now();
      return existing ? { by: existing.by, createdAt: existing.createdAt, updatedAt: now } : { by: me, createdAt: now };
    };
    return {
      saveTask: (id, input) => report(setDoc(ref(TASKS, id), taskDoc(input, stampFor(current.current.tasks.find((t) => t.id === id))))),
      deleteTask: (id) => report(deleteDoc(ref(TASKS, id))),
      restoreTask: (t) => report(setDoc(ref(TASKS, t.id), withoutId(t))),
      markDone: (task, doneOn) => {
        const { due, lastDone, entry } = markDone(task, doneOn);
        const entryRef = ref(LOG);
        const batch = writeBatch(db);
        batch.set(ref(TASKS, task.id), { ...withoutId(task), due, lastDone, updatedAt: Date.now() });
        batch.set(entryRef, serviceDoc(entry, { by: me, createdAt: Date.now() }));
        report(batch.commit());
        return { entryId: entryRef.id, next: due };
      },
      undoDone: (task, entryId) => {
        const batch = writeBatch(db);
        batch.set(ref(TASKS, task.id), withoutId(task));
        batch.delete(ref(LOG, entryId));
        report(batch.commit());
      },
      saveEntry: (id, input) => {
        const existing = id ? current.current.log.find((e) => e.id === id) : undefined;
        const data = serviceDoc(input, stampFor(existing));
        const batch = writeBatch(db);
        batch.set(ref(LOG, id), data);
        const task = !existing && data.taskId ? current.current.tasks.find((t) => t.id === data.taskId) : undefined;
        const moved = task ? doneFromEntry(task, data.date, toYmd(Date.now())) : null;
        if (task && moved) batch.set(ref(TASKS, task.id), { ...withoutId(task), ...moved, updatedAt: Date.now() });
        report(batch.commit());
      },
      deleteEntry: (id) => report(deleteDoc(ref(LOG, id))),
      restoreEntry: (e) => report(setDoc(ref(LOG, e.id), withoutId(e))),
      saveWarranty: (id, input) => report(setDoc(ref(WARRANTIES, id), warrantyDoc(input, stampFor(current.current.warranties.find((w) => w.id === id))))),
      deleteWarranty: (id) => report(deleteDoc(ref(WARRANTIES, id))),
      restoreWarranty: (w) => report(setDoc(ref(WARRANTIES, w.id), withoutId(w))),
      saveContact: (id, input) => report(id ? updateContact(db, householdId, id, input, me) : addContact(db, householdId, input, me)),
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
