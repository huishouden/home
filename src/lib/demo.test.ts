import { expect, test } from 'bun:test';
import { DEMO_NOW, DEMO_TODAY, demoData } from './demo';
import { isSchedule } from './schedule';
import { headline, needsAttention } from './upkeep';
import { warrantyText } from './warranty';
import { daysBetween } from './ymd';

const d = demoData();

test('the sample house is in 2031 and needs attention', () => {
  expect(new Date(DEMO_NOW).getFullYear()).toBe(2031);
  expect(DEMO_TODAY).toBe('2031-10-16');
  const attention = needsAttention(d.tasks, DEMO_TODAY).map((t) => headline(t.title, t.due, DEMO_TODAY));
  expect(attention.slice(0, 3)).toEqual(['Overdue: gutter cleaning', 'Lawn service due tomorrow', 'Change HVAC filter due in 4 days']);
});

test('every schedule is valid and every due date follows from it', () => {
  for (const t of d.tasks) {
    expect(isSchedule(t.schedule)).toBe(true);
    if (t.lastDone) expect(daysBetween(t.lastDone, t.due)).toBeGreaterThan(0);
  }
});

test('the refrigerator warranty runs out soon', () => {
  expect(warrantyText(d.warranties.find((w) => w.item === 'Refrigerator')!.warrantyEnd, DEMO_TODAY)).toBe('Expires in 46 days');
});

test('nothing real: example.com, 555-01xx, invented members, links resolve', () => {
  const contactIds = new Set(d.contacts.map((c) => c.id));
  const taskIds = new Set(d.tasks.map((t) => t.id));
  for (const c of d.contacts) {
    expect(c.apps).toContain('home');
    if (c.phone) expect(c.phone).toMatch(/^\(555\) 010-01\d\d$/);
    if (c.website) expect(new URL(c.website).hostname).toMatch(/example\.com$/);
    if (c.email) expect(c.email).toMatch(/@[a-z.]*example\.com$/);
  }
  for (const x of [...d.tasks, ...d.log, ...d.warranties, ...d.contacts]) expect(x.by).toMatch(/@example\.com$/);
  for (const x of [...d.tasks, ...d.log, ...d.warranties]) if (x.contactId) expect(contactIds.has(x.contactId)).toBe(true);
  for (const e of d.log) if (e.taskId) expect(taskIds.has(e.taskId)).toBe(true);
  for (const w of d.warranties) for (const u of [w.receiptUrl, w.manualUrl]) if (u) expect(new URL(u).hostname).toMatch(/example\.com$/);
  const ids = [...d.tasks, ...d.log, ...d.warranties].map((x) => x.id);
  expect(new Set(ids).size).toBe(ids.length);
});
