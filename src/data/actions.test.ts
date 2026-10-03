import { describe, expect, test } from 'bun:test';
import { DEMO_NOW, demoData, type HomeData } from '../lib/demo';
import { prepTickId } from '../lib/model';
import { applyOps, createActions, type Op } from './actions';

/** The actions over a memory backend that records every write, as the sample store does. */
function harness(initial: HomeData = demoData()) {
  let data = initial;
  const writes: Op[][] = [];
  let seq = 0;
  const actions = createActions(
    {
      newId: (col) => `${col}-${seq++}`,
      write: (ops) => {
        writes.push(ops);
        data = applyOps(data, ops);
      },
      contacts: { save: () => {}, remove: () => {}, restore: () => {} },
    },
    () => data,
    'alex@example.com',
    () => DEMO_NOW,
  );
  return { actions, writes, get data() { return data; } };
}

describe('marking a job done', () => {
  test('moves the job and logs an entry in one write; undoDone puts the job back and removes the entry', () => {
    const h = harness();
    const before = h.data.tasks[0];
    const { entryId, next } = h.actions.markDone(before, '2031-10-16');
    expect(h.writes.at(-1)!.map((o) => o.col)).toEqual(['tasks', 'log']);
    const after = h.data.tasks.find((t) => t.id === before.id)!;
    expect(after).toMatchObject({ due: next, lastDone: '2031-10-16', by: before.by, createdAt: before.createdAt, updatedAt: DEMO_NOW });
    expect(h.data.log.find((e) => e.id === entryId)).toMatchObject({ taskId: before.id, by: 'alex@example.com' });
    h.actions.undoDone(before, entryId);
    expect(h.data.tasks.find((t) => t.id === before.id)).toEqual(before);
    expect(h.data.log.some((e) => e.id === entryId)).toBe(false);
  });
});

describe('editing', () => {
  test('an edit keeps the author and creation time', () => {
    const h = harness();
    const w = h.data.warranties[0];
    const { id, by, createdAt, updatedAt: _u, ...input } = w;
    h.actions.saveWarranty(id, { ...input, item: 'Renamed' } as never);
    expect(h.data.warranties.find((x) => x.id === id)).toMatchObject({ item: 'Renamed', by, createdAt, updatedAt: DEMO_NOW });
  });

  test('ticking and unticking prep writes one tick by its event and day', () => {
    const h = harness();
    const event = h.data.events.find((e) => e.id === 'demo-event-trash')!;
    const id = prepTickId(event.id, '2031-10-20');
    h.actions.tickPrep(event, '2031-10-20');
    expect(h.data.prep.find((t) => t.id === id)).toMatchObject({ done: true, by: 'alex@example.com' });
    h.actions.untickPrep(event, '2031-10-20');
    expect(h.data.prep.some((t) => t.id === id)).toBe(false);
  });

  test('a deleted event comes back under its id', () => {
    const h = harness();
    const event = h.data.events[0];
    h.actions.deleteEvent(event.id);
    expect(h.data.events.some((e) => e.id === event.id)).toBe(false);
    h.actions.restoreEvent(event);
    expect(h.data.events.find((e) => e.id === event.id)).toEqual(event);
  });
});
