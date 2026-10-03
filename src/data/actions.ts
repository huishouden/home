import type { ContactWrites } from '@huishouden/pwa-kit/contacts';
import { applyOps as applyKitOps, stampFor, withoutId, type Backend as KitBackend, type Op as KitOp } from '@huishouden/pwa-kit/store';
import { toYmd } from '@huishouden/pwa-kit/time';
import { track } from '@huishouden/pwa-kit/observability';
import type { HomeData } from '../lib/demo';
import { doneFromEntry, markDone, resumedDue, tickedTask } from '../lib/done';
import { withOccurrenceChange } from '../lib/events';
import { eventDoc, prepTickDoc, prepTickId, serviceDoc, taskDoc, warrantyDoc, type HomeTask, type TaskInput } from '../lib/model';
import type { HomeActions } from './types';

// The Home actions, written once over a storage interface that the live (Firestore) and the sample
// (memory) stores each implement (@huishouden/pwa-kit/store). The live store publishes the agenda
// and reminders from what each write changes.

/** Firestore collection names under households/{id}, by the data key that holds them. */
export const COLLECTIONS = {
  tasks: 'homeTasks',
  log: 'homeServiceLog',
  warranties: 'homeWarranties',
  events: 'homeEvents',
  prep: 'homeEventPrep',
} as const satisfies Partial<Record<keyof HomeData, string>>;
export type DataKey = keyof typeof COLLECTIONS;

export type Op = KitOp<DataKey>;

export interface Backend extends KitBackend<DataKey> {
  contacts: ContactWrites;
}

/** `data` with the writes applied, as the stores hold it once they land. */
export const applyOps = (data: HomeData, ops: Op[]): HomeData => applyKitOps(data, ops);

export function createActions(backend: Backend, read: () => HomeData, me: string, clock: () => number): HomeActions {
  const write = (ops: Op[]) => backend.write(ops);
  const put = (col: DataKey, id: string, data: object) => write([{ col, id, data }]);
  const del = (col: DataKey, id: string) => write([{ col, id, data: null }]);
  const find = (col: DataKey, id: string | null) => (id ? (read()[col] as { id: string; by: string; createdAt: number }[]).find((x) => x.id === id) : undefined);
  const stamp = (col: DataKey, id: string | null) => stampFor(find(col, id), me, clock());
  /** A new or edited record: the edit keeps its author and creation time. */
  const save = <I>(col: DataKey, build: (input: I, s: ReturnType<typeof stamp>) => object) => (id: string | null, input: I) =>
    put(col, id ?? backend.newId(col), build(input, stamp(col, id)));

  return {
    saveTask: (id, input) => {
      track('save job');
      // An edit keeps a paused job paused.
      const pausedAt = (find('tasks', id) as HomeTask | undefined)?.pausedAt;
      save('tasks', (i: TaskInput, s) => ({ ...taskDoc(i, s), ...(pausedAt !== undefined ? { pausedAt } : {}) }))(id, input);
    },
    pauseTask: (task) => {
      track('pause job');
      const now = clock();
      put('tasks', task.id, { ...withoutId(task), pausedAt: now, updatedAt: now });
    },
    resumeTask: (task) => {
      track('resume job');
      const now = clock();
      const { pausedAt: _paused, ...rest } = withoutId(task);
      put('tasks', task.id, { ...rest, due: resumedDue(task, toYmd(now)), updatedAt: now });
    },
    deleteTask: (id) => del('tasks', id),
    restoreTask: (t) => put('tasks', t.id, withoutId(t)),
    markDone: (task, doneOn) => {
      track('mark job done');
      const { due, lastDone, entry } = markDone(task, doneOn);
      const now = clock();
      const entryId = backend.newId('log');
      write([
        { col: 'tasks', id: task.id, data: withoutId(tickedTask(task, { due, lastDone }, now)) },
        { col: 'log', id: entryId, data: serviceDoc(entry, { by: me, createdAt: now }) },
      ]);
      return { entryId, next: due };
    },
    undoDone: (task, entryId) =>
      write([
        { col: 'tasks', id: task.id, data: withoutId(task) },
        { col: 'log', id: entryId, data: null },
      ]),
    saveEntry: (id, input) => {
      track('log service');
      const existing = find('log', id);
      const now = clock();
      const data = serviceDoc(input, stampFor(existing, me, now));
      const ops: Op[] = [{ col: 'log', id: id ?? backend.newId('log'), data }];
      // A new entry for a job that is now its latest done date also moves the job on.
      const task = !existing && data.taskId ? read().tasks.find((t) => t.id === data.taskId) : undefined;
      const moved = task ? doneFromEntry(task, data.date, toYmd(now)) : null;
      if (task && moved) ops.push({ col: 'tasks', id: task.id, data: withoutId(tickedTask(task, moved, now)) });
      write(ops);
    },
    deleteEntry: (id) => del('log', id),
    restoreEntry: (e) => put('log', e.id, withoutId(e)),
    saveWarranty: (id, input) => {
      track('save warranty');
      save('warranties', warrantyDoc)(id, input);
    },
    deleteWarranty: (id) => del('warranties', id),
    restoreWarranty: (w) => put('warranties', w.id, withoutId(w)),
    saveEvent: (id, input) => {
      track('save regular event');
      save('events', eventDoc)(id, input);
    },
    deleteEvent: (id) => del('events', id),
    restoreEvent: (e) => put('events', e.id, withoutId(e)),
    changeOccurrence: (event, original, change) => {
      track(change?.skipped ? 'skip occurrence' : change ? 'move occurrence' : 'restore occurrence');
      const now = clock();
      put('events', event.id, eventDoc(withOccurrenceChange(event, original, change, toYmd(now)), { by: event.by, createdAt: event.createdAt, updatedAt: now }));
    },
    tickPrep: (event, original) => {
      track('tick prep');
      put('prep', prepTickId(event.id, original), prepTickDoc(me, clock()));
    },
    skipPrep: (event, original) => {
      track('skip prep');
      put('prep', prepTickId(event.id, original), prepTickDoc(me, clock(), true));
    },
    untickPrep: (event, original) => del('prep', prepTickId(event.id, original)),
    saveContact: (id, input) => backend.contacts.save(id, input),
    deleteContact: (id) => {
      const c = read().contacts.find((x) => x.id === id);
      if (c) backend.contacts.remove(c);
    },
    restoreContact: (c) => backend.contacts.restore(c),
  };
}
