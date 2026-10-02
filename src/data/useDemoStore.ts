import { useMemo, useRef, useState } from 'react';
import { cleanContact } from '@huishouden/pwa-kit/contacts';
import { DEMO_MEMBERS, demoData, type HomeData } from '../lib/demo';
import { doneFromEntry, markDone } from '../lib/done';
import { serviceDoc, taskDoc, warrantyDoc, type ServiceEntry } from '../lib/model';
import { toYmd } from '../lib/ymd';
import type { HomeActions, HomeStore } from './types';

/**
 * Sample data kept in memory: the signed-out app is fully clickable, nothing is saved, and a reload
 * starts over. `clock` is the demo's moving "now" (fixed 2031 start plus time since load).
 */
export function useDemoStore(clock: () => number): HomeStore {
  const [data, setData] = useState<HomeData>(demoData);
  const dataRef = useRef(data);
  dataRef.current = data;
  const me = DEMO_MEMBERS[0];

  const actions = useMemo<HomeActions>(() => {
    let seq = 0;
    const id = () => `local-${Date.now()}-${seq++}`;
    const patch = (f: (d: HomeData) => HomeData) =>
      setData((d) => {
        const next = f(d);
        dataRef.current = next;
        return next;
      });
    const upsert = <T extends { id: string }>(list: T[], item: T) => [...list.filter((x) => x.id !== item.id), item];
    const without = <T extends { id: string }>(list: T[], gone: string) => list.filter((x) => x.id !== gone);
    const stampFor = (existing?: { by: string; createdAt: number }) => {
      const now = clock();
      return existing ? { by: existing.by, createdAt: existing.createdAt, updatedAt: now } : { by: me, createdAt: now };
    };
    return {
      saveTask: (tid, input) =>
        patch((d) => {
          const existing = tid ? d.tasks.find((t) => t.id === tid) : undefined;
          return { ...d, tasks: upsert(d.tasks, { id: tid ?? id(), ...taskDoc(input, stampFor(existing)) }) };
        }),
      deleteTask: (tid) => patch((d) => ({ ...d, tasks: without(d.tasks, tid) })),
      restoreTask: (t) => patch((d) => ({ ...d, tasks: upsert(d.tasks, t) })),
      markDone: (task, doneOn) => {
        const { due, lastDone, entry } = markDone(task, doneOn);
        const entryId = id();
        patch((d) => ({
          ...d,
          tasks: upsert(d.tasks, { ...task, due, lastDone, updatedAt: clock() }),
          log: [...d.log, { id: entryId, ...serviceDoc(entry, { by: me, createdAt: clock() }) }],
        }));
        return { entryId, next: due };
      },
      undoDone: (task, entryId) => patch((d) => ({ ...d, tasks: upsert(d.tasks, task), log: without(d.log, entryId) })),
      saveEntry: (eid, input) =>
        patch((d) => {
          const existing = eid ? d.log.find((e) => e.id === eid) : undefined;
          const entry: ServiceEntry = { id: eid ?? id(), ...serviceDoc(input, stampFor(existing)) };
          const task = !existing && entry.taskId ? d.tasks.find((t) => t.id === entry.taskId) : undefined;
          const moved = task ? doneFromEntry(task, entry.date, toYmd(clock())) : null;
          return { ...d, log: upsert(d.log, entry), tasks: task && moved ? upsert(d.tasks, { ...task, ...moved, updatedAt: clock() }) : d.tasks };
        }),
      deleteEntry: (eid) => patch((d) => ({ ...d, log: without(d.log, eid) })),
      restoreEntry: (e) => patch((d) => ({ ...d, log: upsert(d.log, e) })),
      saveWarranty: (wid, input) =>
        patch((d) => {
          const existing = wid ? d.warranties.find((w) => w.id === wid) : undefined;
          return { ...d, warranties: upsert(d.warranties, { id: wid ?? id(), ...warrantyDoc(input, stampFor(existing)) }) };
        }),
      deleteWarranty: (wid) => patch((d) => ({ ...d, warranties: without(d.warranties, wid) })),
      restoreWarranty: (w) => patch((d) => ({ ...d, warranties: upsert(d.warranties, w) })),
      saveContact: (cid, input) =>
        patch((d) => {
          const existing = cid ? d.contacts.find((c) => c.id === cid) : undefined;
          const now = clock();
          const contact = { id: cid ?? id(), ...cleanContact(input), createdAt: existing?.createdAt ?? now, ...(existing ? { updatedAt: now } : {}), by: me };
          return { ...d, contacts: upsert(d.contacts, contact) };
        }),
      deleteContact: (cid) => patch((d) => ({ ...d, contacts: without(d.contacts, cid) })),
      restoreContact: (c) => patch((d) => ({ ...d, contacts: upsert(d.contacts, c) })),
    };
  }, [clock, me]);

  return { data, ready: true, actions, me };
}
