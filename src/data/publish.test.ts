import { describe, expect, test } from 'bun:test';
import type { Firestore } from 'firebase/firestore';
import { DEMO_NOW, demoData } from '../lib/demo';
import { prepTickId } from '../lib/model';
import { applyOps, type Op } from './actions';
import { planChanges, planContactRename, runSteps, type Step } from './publish';

const refs = (steps: Step[]) => steps.map((s) => (s.kind === 'reminders' ? 'reminders' : `${s.kind} ${s.ref}`));
const plan = (ops: Op[]) => {
  const before = demoData();
  return refs(planChanges(before, applyOps(before, ops), ops, DEMO_NOW));
};

describe('what a write publishes', () => {
  test('a job edited: its one ref replaced, once however many ops touch it', () => {
    const task = demoData().tasks.find((t) => t.id === 'demo-task-gutters')!;
    const edit: Op = { col: 'tasks', id: task.id, data: { ...task, title: 'Gutters, front' } };
    expect(plan([edit])).toEqual(['replace job:demo-task-gutters']);
    expect(plan([edit, { ...edit, data: { ...task, title: 'Gutters, back' } }])).toEqual(['replace job:demo-task-gutters']);
  });

  test('a job deleted: its ref removed', () => {
    expect(plan([{ col: 'tasks', id: 'demo-task-gutters', data: null }])).toEqual(['remove job:demo-task-gutters']);
  });

  test("a tick: its event's occurrences and things to do before replaced, and the reminders", () => {
    const id = prepTickId('demo-event-lawn', '2031-10-17');
    expect(plan([{ col: 'prep', id, data: { done: true, at: DEMO_NOW, by: 'alex@example.com' } }])).toEqual(['replace event:demo-event-lawn', 'replace prep:demo-event-lawn', 'reminders']);
  });

  test('a record with no items before or after (a visit long done) publishes nothing', () => {
    const entry = demoData().log.find((e) => e.id === 'demo-entry-12')!;
    expect(plan([{ col: 'log', id: entry.id, data: { ...entry, notes: 'Receipt in the drawer' } }])).toEqual([]);
  });
});

describe('what a contact renamed publishes', () => {
  test('every job, visit and event naming it that has items; a visit outside the agenda left alone', () => {
    const steps = planContactRename(demoData(), 'demo-contact-hoa', 'Example HOA', DEMO_NOW);
    expect(refs(steps)).toEqual(['replace job:demo-task-hoa', 'replace visit:demo-entry-5', 'replace event:demo-event-hoa']);
    // The older dues visit names the contact too, but has nothing on the agenda.
    expect(demoData().log.find((e) => e.id === 'demo-entry-6')).toMatchObject({ contactId: 'demo-contact-hoa' });
  });
});

describe('running the steps', () => {
  test('a step that fails is reported and the next still runs', async () => {
    const errors: string[] = [];
    const steps: Step[] = [{ kind: 'remove', ref: 'job:a' }, { kind: 'remove', ref: 'job:b' }];
    await runSteps({} as Firestore, 'h1', 'alex@example.com', steps, demoData(), DEMO_NOW, { onError: (_e, what) => errors.push(what) });
    expect(errors).toEqual(['agenda', 'agenda']);
  });
});
