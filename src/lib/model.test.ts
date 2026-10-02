import { expect, test } from 'bun:test';
import { SERVICE_KEYS, TASK_KEYS, WARRANTY_KEYS, httpsUrl, serviceDoc, taskDoc, warrantyDoc } from './model';

const s = { by: 'sam@example.com', createdAt: 1_950_000_000_000.4 };

test('task documents carry only the rule keys, trimmed', () => {
  const doc = taskDoc(
    {
      title: '  Change HVAC filter  ',
      category: 'hvac',
      schedule: { kind: 'after-done', every: 3, unit: 'month', anchor: '2031-01-01' } as never,
      due: '2031-10-20',
      notes: '  ',
      contactId: '',
    },
    s,
  );
  expect(doc).toEqual({ title: 'Change HVAC filter', category: 'hvac', schedule: { kind: 'after-done', every: 3, unit: 'month' }, due: '2031-10-20', createdAt: 1_950_000_000_000, by: 'sam@example.com' });
  for (const k of Object.keys(doc)) expect(TASK_KEYS as readonly string[]).toContain(k);
});

test('a task needs a valid schedule and due date', () => {
  expect(() => taskDoc({ title: 'x', category: 'other', schedule: { kind: 'fixed', every: 1, unit: 'year' } as never, due: '2031-10-20' }, s)).toThrow();
  expect(() => taskDoc({ title: 'x', category: 'other', schedule: { kind: 'after-done', every: 1, unit: 'year' }, due: '2031-13-01' }, s)).toThrow();
});

test('service entries: a contact replaces free-text who; cost must be whole cents', () => {
  const doc = serviceDoc({ date: '2031-10-03', title: 'Lawn service', contactId: 'c1', who: 'ignored', costCents: 6500 }, { ...s, updatedAt: 5 });
  expect(doc).toEqual({ date: '2031-10-03', title: 'Lawn service', contactId: 'c1', costCents: 6500, createdAt: 1_950_000_000_000, updatedAt: 5, by: 'sam@example.com' });
  expect(serviceDoc({ date: '2031-10-03', title: 'x', costCents: 1.5 }, s).costCents).toBeUndefined();
  expect(serviceDoc({ date: '2031-10-03', title: 'x', who: ' We did it ' }, s).who).toBe('We did it');
  for (const k of Object.keys(doc)) expect(SERVICE_KEYS as readonly string[]).toContain(k);
});

test('warranty links are https only', () => {
  const doc = warrantyDoc({ item: 'Fridge', receiptUrl: 'receipts.example.com/a.pdf', manualUrl: 'javascript:alert(1)', warrantyEnd: '2031-12-01' }, s);
  expect(doc.receiptUrl).toBe('https://receipts.example.com/a.pdf');
  expect(doc.manualUrl).toBeUndefined();
  for (const k of Object.keys(doc)) expect(WARRANTY_KEYS as readonly string[]).toContain(k);
  expect(httpsUrl('http://example.com')).toBeUndefined();
  expect(httpsUrl('not a link')).toBeUndefined();
});
