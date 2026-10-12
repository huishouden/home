// Read budgets of Home's own sync paths (pwa-kit STANDARD.md "Read budgets"), on the emulators with
// the household's rules (`bun run e2e:emulator`, which `hh dev evidence` runs inside
// `firebase emulators:exec`): the publish on open (agenda and reminders), the to-do list, and the
// publish after a write. Reads are counted from the SDK's own results as Firestore bills them
// (`readCounter().sdk`); the interleaving tests land another device's write before each read. Its
// own `bun test` process: it replaces firebase/firestore with the counted module for the process.
// A change that raises a ceiling says why in its PR.
import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { expectReads, readCounter, writeBeforeEachRead } from '@huishouden/pwa-kit/read-test';
import { e2eProject, e2eTarget, seedTestHousehold, testHousehold, writeTestDocs, type TestHousehold } from '@huishouden/pwa-kit/staging';
import { agendaDoc } from '@huishouden/pwa-kit/agenda-core';
import { reminderDoc } from '@huishouden/pwa-kit/reminder-core';
import { todoDoc } from '@huishouden/pwa-kit/todo-core';
import { addDays, toYmd } from '@huishouden/pwa-kit/time';
import type { HomeData } from '../src/lib/demo';
import type { HomeEvent, HomeTask, ServiceEntry, Warranty } from '../src/lib/model';
import type { Op } from '../src/data/actions';

const real = await import('firebase/firestore');
const counter = readCounter();
mock.module('firebase/firestore', () => counter.sdk(real));
const { connectFirestoreEmulator, initializeFirestore, memoryLocalCache, terminate } = await import('firebase/firestore');
const { publishChanges, publishOnOpen, publishTodos } = await import('../src/data/publish');

const emulator = e2eTarget();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Tomorrow at 10:30 local time, so the counts don't hang on when the test runs.
const NOW = new Date(new Date().setHours(0, 0, 0, 0) + DAY + 10.5 * HOUR).getTime();
const TODAY = toYmd(NOW);
// The rules take only the suite's own addresses.
const URL = 'https://huishouden-staging.web.app/home/';

let hh: TestHousehold;
let app: FirebaseApp;
let db: ReturnType<typeof real.getFirestore>;
let admin: string;

// An invented house: three jobs (one overdue, one due in three days, one in two months), a visit
// booked in five days and one done, a warranty ending in three weeks, and the garbage every week
// with "take the bins out" the evening before, reminded.
function data(): HomeData {
  const job = (id: string, title: string, due: number): HomeTask => ({ id, title, category: 'other', schedule: { kind: 'after-done', every: 3, unit: 'month' }, due: addDays(TODAY, due), createdAt: NOW - 90 * DAY, by: admin });
  const entry = (id: string, title: string, day: number): ServiceEntry => ({ id, title, date: addDays(TODAY, day), createdAt: NOW - 10 * DAY, by: admin });
  const warranty: Warranty = { id: 'fridge', item: 'Test fridge', purchaseDate: addDays(TODAY, -700), warrantyEnd: addDays(TODAY, 21), createdAt: NOW - 90 * DAY, by: admin };
  const bins: HomeEvent = { id: 'bins', title: 'Test garbage', kind: 'trash', rule: { freq: 'week', every: 1, start: addDays(TODAY, -30) }, time: '07:00', prep: { title: 'Take the bins out', offset: { daysBefore: 1, time: '19:00' }, remind: true }, createdAt: NOW - 90 * DAY, by: admin };
  return {
    tasks: [job('filter', 'Test filter', -2), job('gutters', 'Test gutters', 3), job('smoke', 'Test smoke alarms', 60)],
    log: [entry('pest', 'Test pest visit', 5), entry('lawn', 'Test lawn service', -7)],
    warranties: [warranty],
    contacts: [],
    events: [bins],
    prep: [],
  };
}

beforeAll(async () => {
  if (emulator !== 'emulator') return;
  const household = testHousehold('home-reads-sdk');
  admin = household.users.admin.email;
  // The records in Firestore too: the rules check what a reminder's source and an item's actions name.
  const d = data();
  const docs: Record<string, Record<string, unknown>> = {};
  const put = (col: string, list: { id: string }[]) => list.forEach(({ id, ...rest }) => (docs[`${col}/${id}`] = rest));
  put('homeTasks', d.tasks);
  put('homeServiceLog', d.log);
  put('homeWarranties', d.warranties);
  put('homeEvents', d.events);
  hh = await seedTestHousehold({ household, docs });
  app = initializeApp({ apiKey: 'demo-key', projectId: e2eProject(), appId: 'demo' }, `reads-${hh.id}`);
  db = initializeFirestore(app, { localCache: memoryLocalCache() });
  connectFirestoreEmulator(db, process.env.HH_EMULATOR_HOST || '127.0.0.1', Number(process.env.HH_EMULATOR_FIRESTORE_PORT || 8080), {
    mockUserToken: { sub: hh.users.admin.uid, email: admin, email_verified: true },
  });
});

afterAll(async () => {
  if (emulator !== 'emulator') return;
  await terminate(db);
  await deleteApp(app);
});

const memory = () => {
  const notes = new Map<string, string>();
  return { getItem: (k: string) => notes.get(k) ?? null, setItem: (k: string, v: string) => void notes.set(k, v), removeItem: (k: string) => void notes.delete(k), key: (i: number) => [...notes.keys()][i] ?? null, get length() { return notes.size; } };
};
const settled = <T,>(r: PromiseSettledResult<T>): T => {
  if (r.status === 'rejected') throw r.reason;
  return r.value;
};

/** Another device's stray item in each list Home publishes to: the sync must remove it. */
const stray = (n: number) => ({
  [`agenda/home_stray_${n}`]: agendaDoc('home', { ref: `stray:${n}`, kind: 'due', title: `Old ${n}`, start: NOW + 2 * DAY, allDay: true, url: URL }, admin, NOW),
  [`reminders/home-stray-${n}`]: reminderDoc({ app: 'home', ref: `stray:${n}`, title: `Old ${n}`, at: NOW + 2 * DAY, url: URL }, admin, NOW),
  [`todos/home:stray:${n}`]: todoDoc('home', { ref: `stray:${n}`, title: `Old ${n}`, createdAt: NOW - DAY, url: URL }, admin, NOW),
});

describe.skipIf(emulator !== 'emulator')('on open: the agenda and the reminders, one query each, none when this device already published the same', () => {
  test('first, again, and again with this device\'s note', async () => {
    const first = await expectReads(() => publishOnOpen(db, hh.id, admin, data(), NOW, { published: null }), { max: 2, min: 2, counter, label: 'Home on open, first' });
    settled(first.value.agenda);
    settled(first.value.reminders);
    // Again: the queries return what the first wrote: 23 agenda items (the garbage's pickups and the
    // evenings before them, 17 together; the jobs, the visits and the warranty) and 2 reminders (the
    // evenings before in the next two weeks).
    const { value, reads } = await expectReads(() => publishOnOpen(db, hh.id, admin, data(), NOW, { published: null }), { max: 25, min: 25, counter, label: 'Home on open, again' });
    expect(reads).toBe(settled(value.agenda).unchanged + settled(value.reminders).unchanged);
    const store = memory();
    await publishOnOpen(db, hh.id, admin, data(), NOW, { published: store });
    await expectReads(() => publishOnOpen(db, hh.id, admin, data(), NOW, { published: store }), { max: 0, counter, label: 'Home on open, published' });
  });

  test('interleaving: another device writes before each of its two reads; one pass, each read sees the strays written before it', async () => {
    let n = 0;
    const { value } = await expectReads(() => publishOnOpen(db, hh.id, admin, data(), NOW, { published: null }), {
      // The 25, the agenda's one stray, the reminders' two.
      max: 28,
      min: 28,
      counter,
      label: 'Home on open with a write before each read',
      beforeRead: writeBeforeEachRead(() => writeTestDocs(hh, stray(++n))),
    });
    expect(n).toBe(2);
    expect([settled(value.agenda).deleted, settled(value.reminders).deleted]).toEqual([1, 2]);
  });
});

describe.skipIf(emulator !== 'emulator')('the to-do list: one query, none when this device already published the same', () => {
  test('first, again, and with the note', async () => {
    // First: the query finds the earlier strays' to-dos (two), and removes them.
    await expectReads(() => publishTodos(db, hh.id, admin, data(), NOW, { published: null }), { max: 2, min: 2, counter, label: 'Home to-dos, first' });
    // Again: the overdue job and the one due in three days.
    const { value } = await expectReads(() => publishTodos(db, hh.id, admin, data(), NOW, { published: null }), { max: 2, min: 2, counter, label: 'Home to-dos, again' });
    expect(value.unchanged).toBe(2);
    const store = memory();
    await publishTodos(db, hh.id, admin, data(), NOW, { published: store });
    await expectReads(() => publishTodos(db, hh.id, admin, data(), NOW, { published: store }), { max: 0, counter, label: 'Home to-dos, published' });
  });

  test('interleaving: a stray lands before its read; read once and removed', async () => {
    const { value } = await expectReads(() => publishTodos(db, hh.id, admin, data(), NOW, { published: null }), {
      max: 3,
      min: 3,
      counter,
      label: 'Home to-dos with a write before the read',
      beforeRead: writeBeforeEachRead(() => writeTestDocs(hh, stray(10))),
    });
    expect(value).toMatchObject({ deleted: 1, unchanged: 2 });
  });
});

describe.skipIf(emulator !== 'emulator')('after a write: one query per record it touched, and the reminders when an event changed', () => {
  test('a job edited, and the garbage moved to a new day', async () => {
    const before = data();
    const jobOps: Op[] = [{ col: 'tasks', id: 'gutters', data: { title: 'Test gutters, front' } }];
    const jobAfter = { ...before, tasks: before.tasks.map((t) => (t.id === 'gutters' ? { ...t, title: 'Test gutters, front' } : t)) };
    // The job's one agenda item.
    await expectReads(() => publishChanges(db, hh.id, admin, before, jobAfter, jobOps, NOW, { onError: (e) => { throw e; } }), { max: 1, min: 1, counter, label: 'Home after a job edit' });
    const moved = { ...before.events[0], time: '08:00' as const };
    const eventOps: Op[] = [{ col: 'events', id: 'bins', data: { time: '08:00' } }];
    const eventAfter = { ...before, events: [moved] };
    // The event's 17 agenda items (its pickups and the evenings before), and the reminders: the two,
    // and the to-do test's stray, removed.
    await expectReads(() => publishChanges(db, hh.id, admin, before, eventAfter, eventOps, NOW, { onError: (e) => { throw e; } }), { max: 20, min: 20, counter, label: 'Home after an event edit' });
  });

  test('interleaving: another device writes before each of its three reads', async () => {
    const before = data();
    const eventOps: Op[] = [{ col: 'events', id: 'bins', data: { time: '09:00' } }];
    const eventAfter = { ...before, events: [{ ...before.events[0], time: '09:00' as const }] };
    let n = 20;
    // The 17 agenda items, then the two reminders and the three strays written before it.
    await expectReads(() => publishChanges(db, hh.id, admin, before, eventAfter, eventOps, NOW, { onError: (e) => { throw e; } }), {
      max: 22,
      min: 22,
      counter,
      label: 'Home after an event edit, with a write before each read',
      beforeRead: writeBeforeEachRead(() => writeTestDocs(hh, stray(++n))),
    });
    expect(n - 20).toBe(3);
  });
});
