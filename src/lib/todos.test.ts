import { describe, expect, test } from 'bun:test';
import { allDayStart } from '@huishouden/pwa-kit/agenda';
import { applyOps as applyKitOps } from '@huishouden/pwa-kit/store';
import { TODO_COLLECTIONS, resolveOps, todoDoc, todoOpsAllowed, type TodoInput } from '@huishouden/pwa-kit/todos';
import { HOUR, addDays, atTime, daysBetween } from '@huishouden/pwa-kit/time';
import { COLLECTIONS, applyOps, createActions, type DataKey, type Op } from '../data/actions';
import { AGENDA_APP } from './agenda';
import { DEMO_NOW, DEMO_TODAY, demoData, type HomeData } from './demo';
import { prepTasks } from './events';
import { prepTickId, type HomeTask } from './model';
import { jobTodo, nextDueValue, todoEntryId, todoItems } from './todos';

const me = 'alex@example.com';
const tapAt = DEMO_NOW + 2 * HOUR;
const byCollection = Object.fromEntries(Object.entries(COLLECTIONS).map(([k, v]) => [v, k])) as Record<string, DataKey>;

/** What the portal does with an action: the placeholders filled in as `me` taps it, then the writes. */
const run = (data: HomeData, ops: Op[] | Parameters<typeof resolveOps>[0], now = tapAt) =>
  applyKitOps(data, resolveOps(ops, { now, me }), (col: string) => byCollection[col]);

/** Home's own actions over memory, as the sample store runs them. */
function home(initial: HomeData, now = tapAt) {
  let data = initial;
  let seq = 0;
  const actions = createActions(
    {
      newId: (col) => `${col}-${seq++}`,
      write: (ops) => {
        data = applyOps(data, ops);
      },
      contacts: { save: () => {}, remove: () => {}, restore: () => {} },
    },
    () => data,
    me,
    () => now,
  );
  return { actions, get data() { return data; } };
}

const byRef = (items: TodoInput[]) => new Map(items.map((i) => [i.ref, i]));

describe('what Home publishes', () => {
  const d = demoData();
  const items = todoItems(d, DEMO_NOW);

  test('the jobs Overview shows as needing doing, and the thing to do before tonight; not paused, later or ticked ones', () => {
    expect(items.map((i) => i.ref)).toEqual(['job:demo-task-gutters', 'job:demo-task-filter', 'job:demo-task-pest', `prep:${prepTickId('demo-event-lawn', '2031-10-17')}`]);
    // Paused (overdue by its date, but paused), later, and the garbage put out last night: none.
    expect(items.some((i) => i.ref === 'job:demo-task-pool')).toBe(false);
    expect(items.some((i) => i.ref.startsWith('prep:demo-event-trash'))).toBe(false);
  });

  test('every item is one the rules and the portal accept', () => {
    for (const i of items) {
      expect(() => todoDoc(AGENDA_APP, i, me, DEMO_NOW)).not.toThrow();
      expect(todoOpsAllowed(AGENDA_APP, i.done!.ops)).toBe(true);
      expect(todoOpsAllowed(AGENDA_APP, i.cancel!.ops)).toBe(true);
    }
    expect(TODO_COLLECTIONS[AGENDA_APP]).toEqual(['homeTasks', 'homeServiceLog', 'homeEventPrep']);
  });

  test('a job: its title, who does it (or its category), when it was added, its due day, its author', () => {
    const gutters = byRef(items).get('job:demo-task-gutters')!;
    expect(gutters).toMatchObject({
      title: 'Gutter cleaning',
      detail: 'Example Roofing',
      createdAt: d.tasks.find((t) => t.id === 'demo-task-gutters')!.createdAt,
      due: allDayStart(addDays(DEMO_TODAY, -5)),
      url: 'https://huishouden-piekstra.web.app/home/#upkeep',
      owner: d.tasks.find((t) => t.id === 'demo-task-gutters')!.by,
      private: false,
    });
    expect(byRef(items).get('job:demo-task-filter')!.detail).toBe('Heating and cooling');
  });

  test('Done is open to everyone (tick fields, and a history entry in their own name); Pause to admins, members and the owner', () => {
    const gutters = byRef(items).get('job:demo-task-gutters')!;
    expect(gutters.done).toEqual({
      label: 'Done',
      ops: [
        { col: 'homeTasks', id: 'demo-task-gutters', merge: true, data: { lastDone: '$today', due: '$today+6m', updatedAt: '$now' } },
        {
          col: 'homeServiceLog',
          id: `todo-demo-task-gutters-${addDays(DEMO_TODAY, -5)}`,
          data: { date: '$today', title: 'Gutter cleaning', taskId: 'demo-task-gutters', contactId: 'demo-contact-roofing', createdAt: '$now', by: '$me' },
        },
      ],
      roles: ['admin', 'member', 'helper', 'kid'],
    });
    expect(gutters.cancel).toEqual({
      label: 'Pause',
      ops: [{ col: 'homeTasks', id: 'demo-task-gutters', merge: true, data: { pausedAt: '$now', updatedAt: '$now' } }],
      roles: ['admin', 'member'],
      owner: true,
    });
  });

  test('a thing to do before: added when it came up, due at its deadline; Done and Skip tick it for everyone', () => {
    const id = prepTickId('demo-event-lawn', '2031-10-17');
    const gate = byRef(items).get(`prep:${id}`)!;
    const deadline = atTime('2031-10-16', '19:00');
    expect(gate).toMatchObject({
      title: 'Unlock the side gate',
      detail: 'Before lawn service · Fri, Oct 17',
      createdAt: deadline - 14 * HOUR,
      due: deadline,
      url: 'https://huishouden-piekstra.web.app/home/#overview',
    });
    expect(gate.done).toEqual({ label: 'Done', ops: [{ col: 'homeEventPrep', id, data: { done: true, at: '$now', by: '$me' } }], roles: ['admin', 'member', 'helper', 'kid'] });
    expect(gate.cancel).toEqual({ label: 'Skip', ops: [{ col: 'homeEventPrep', id, data: { done: true, skipped: true, at: '$now', by: '$me' } }], roles: ['admin', 'member', 'helper', 'kid'] });
  });

  test('a late thing to do before is still on; once its event has begun (missed), it is not', () => {
    const lateNow = atTime('2031-10-16', '22:00');
    expect(todoItems(d, lateNow).some((i) => i.ref.startsWith('prep:demo-event-lawn'))).toBe(true);
    const afterStart = atTime('2031-10-17', '09:30');
    expect(todoItems(d, afterStart).some((i) => i.ref === `prep:${prepTickId('demo-event-lawn', '2031-10-17')}`)).toBe(false);
  });
});

describe('next due date', () => {
  test('after-done: from the day it is done, as a placeholder', () => {
    expect(nextDueValue({ kind: 'after-done', every: 2, unit: 'week' }, '2031-10-01')).toBe('$today+2w');
    expect(nextDueValue({ kind: 'after-done', every: 10, unit: 'day' }, '2031-10-01')).toBe('$today+10d');
    expect(nextDueValue({ kind: 'after-done', every: 1, unit: 'year' }, '2031-10-01')).toBe('$today+1y');
  });

  test('set dates: a placeholder for the next one after its due date and the day it is done', () => {
    const monthly = { kind: 'fixed', every: 1, unit: 'month', anchor: '2031-01-01' } as const;
    expect(nextDueValue(monthly, '2031-08-01')).toEqual({ $nextDue: { schedule: monthly, due: '2031-08-01' } });
    const tapped = (due: string, on: string) => resolveOps([{ col: 'homeTasks', id: 'j', data: { due: nextDueValue(monthly, due) } }], { now: atTime(on, '10:00'), me })[0].data;
    expect(tapped('2031-11-01', '2031-10-16')).toEqual({ due: '2031-12-01' });
    expect(tapped('2031-08-01', '2031-10-16')).toEqual({ due: '2031-11-01' });
  });

  test('set dates: published one date overdue, tapped three dates overdue, next due is after the tap', () => {
    const d = demoData();
    const monthly = { kind: 'fixed', every: 1, unit: 'month', anchor: '2031-01-01' } as const;
    const task: HomeTask = { ...d.tasks.find((t) => t.id === 'demo-task-gutters')!, schedule: monthly, due: '2031-07-01' };
    const data = { ...d, tasks: d.tasks.map((t) => (t.id === task.id ? task : t)) };
    // Published on 2 July; Done tapped on 16 October, after the August, September and October dates.
    const ops = jobTodo(task, data.contacts).done!.ops;
    const at = atTime('2031-10-16', '10:00');
    const done = run(data, ops, at).tasks.find((t) => t.id === task.id)!;
    expect(done.due).toBe('2031-11-01');
    expect(done.lastDone).toBe('2031-10-16');
    expect(daysBetween('2031-10-16', done.due)).toBeGreaterThan(0);
  });
});

describe('the portal running an action writes what Home does', () => {
  const strip = (t: HomeTask | undefined) => t && { due: t.due, lastDone: t.lastDone, updatedAt: t.updatedAt, pausedAt: t.pausedAt, by: t.by, createdAt: t.createdAt };

  test('Done on a job: the same job and the same history entry as Mark done', () => {
    for (const id of ['demo-task-gutters', 'demo-task-filter', 'demo-task-pest']) {
      const d = demoData();
      const task = d.tasks.find((t) => t.id === id)!;
      const portal = run(d, jobTodo(task, d.contacts).done!.ops);
      const app = home(demoData());
      const { entryId } = app.actions.markDone(task, DEMO_TODAY);
      expect(strip(portal.tasks.find((t) => t.id === id))).toEqual(strip(app.data.tasks.find((t) => t.id === id)));
      const { id: _a, ...fromPortal } = portal.log.find((e) => e.id === todoEntryId(task))!;
      const { id: _b, ...fromApp } = app.data.log.find((e) => e.id === entryId)!;
      expect(fromPortal).toEqual(fromApp);
      // Done, it isn't published again.
      expect(todoItems(portal, tapAt).some((i) => i.ref === `job:${id}`)).toBe(false);
    }
  });

  test('Pause on a job: paused as in Home, kept with its dates, and no longer published', () => {
    const d = demoData();
    const task = d.tasks.find((t) => t.id === 'demo-task-gutters')!;
    const portal = run(d, jobTodo(task, d.contacts).cancel!.ops);
    const app = home(demoData());
    app.actions.pauseTask(task);
    expect(strip(portal.tasks.find((t) => t.id === task.id))).toEqual(strip(app.data.tasks.find((t) => t.id === task.id)));
    expect(portal.tasks.find((t) => t.id === task.id)).toMatchObject({ pausedAt: tapAt, due: task.due });
    expect(todoItems(portal, tapAt).some((i) => i.ref === `job:${task.id}`)).toBe(false);
  });

  test('Done and Skip on a thing to do before: the same tick as Home, then not published', () => {
    const d = demoData();
    const item = todoItems(d, DEMO_NOW).find((i) => i.ref.startsWith('prep:'))!;
    const t = prepTasks(d.events, d.prep, DEMO_NOW).find((x) => `prep:${x.id}` === item.ref)!;
    for (const [which, act] of [['done', 'tickPrep'], ['cancel', 'skipPrep']] as const) {
      const portal = run(demoData(), item[which]!.ops);
      const app = home(demoData());
      app.actions[act](t.event, t.occurrence.original);
      expect(portal.prep.find((p) => p.id === t.id)).toEqual(app.data.prep.find((p) => p.id === t.id));
      expect(todoItems(portal, tapAt).some((i) => i.ref === item.ref)).toBe(false);
    }
    expect(run(demoData(), item.cancel!.ops).prep.find((p) => p.id === t.id)).toMatchObject({ skipped: true, by: me });
  });
});
