import { expect, test, type Browser, type Page } from '@playwright/test';
import { expectPageReads, useTestHousehold } from '@huishouden/pwa-kit/e2e';
import { testHousehold } from '@huishouden/pwa-kit/staging';

// Read budgets (pwa-kit STANDARD.md "Read budgets"): what opening Home costs a household in
// Firestore reads, on the emulators with a build that counts them (`expectPageReads`), each in a
// fresh browser context (a first open, nothing cached). A change that raises a ceiling says why in
// its PR. An invented house: three jobs, two visits done and one booked, two warranties, the
// garbage every week with a thing to do the evening before (ticked a week ago, and six weeks ago:
// older ticks aren't read), and three contacts (Home's, one of them private, and another app's).
const NOW = Date.now();
const DAY = 86_400_000;
const ymd = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const { admin } = testHousehold('reads').users;
const by = admin.email;
const base = { createdAt: NOW - 90 * DAY, by };
const job = (id: string, title: string, due: number) => ({ [`homeTasks/${id}`]: { title, category: 'other', schedule: { kind: 'after-done', every: 3, unit: 'month' }, due: ymd(NOW + due * DAY), ...base } });
const visit = (id: string, title: string, day: number) => ({ [`homeServiceLog/${id}`]: { title, date: ymd(NOW + day * DAY), ...base } });
const contact = (id: string, name: string, app: string, priv: boolean) => ({ [`contacts/${id}`]: { name, role: 'Service', phone: '555-0100', apps: [app], private: priv, ...base } });

const hh = useTestHousehold(test, {
  scope: 'reads',
  docs: {
    ...job('filter', 'Test filter', -2),
    ...job('gutters', 'Test gutters', 3),
    ...job('smoke', 'Test smoke alarms', 60),
    ...visit('lawn', 'Test lawn service', -7),
    ...visit('roof', 'Test roof repair', -200),
    ...visit('pest', 'Test pest visit', 5),
    'homeWarranties/fridge': { item: 'Test fridge', purchaseDate: ymd(NOW - 700 * DAY), warrantyEnd: ymd(NOW + 21 * DAY), ...base },
    'homeWarranties/roof': { item: 'Test roof', purchaseDate: ymd(NOW - 700 * DAY), warrantyEnd: ymd(NOW + 3000 * DAY), ...base },
    'homeEvents/bins': { title: 'Test garbage', kind: 'trash', rule: { freq: 'week', every: 1, start: ymd(NOW - 60 * DAY) }, time: '07:00', prep: { title: 'Take the bins out', offset: { daysBefore: 1, time: '19:00' }, remind: true }, ...base },
    [`homeEventPrep/bins_${ymd(NOW - 7 * DAY)}`]: { done: true, at: NOW - 8 * DAY, by },
    [`homeEventPrep/bins_${ymd(NOW - 42 * DAY)}`]: { done: true, at: NOW - 43 * DAY, by },
    ...contact('plumber', 'Test Plumber', 'home', false),
    ...contact('roofer', 'Test Roofer', 'home', true),
    ...contact('vet', 'Test Vet', 'pet', false),
  },
});

// One open at a time: another open's writes (a sign-in's profile, its publish) would reach this
// page's listeners and be counted as its reads.
test.describe.configure({ mode: 'serial' });

// The to-do list is published again this long after the data last changed (useLiveStore).
const TODO_DELAY_MS = 3000;
const loaded = (page: Page) => expect(page.getByText('Test filter').first()).toBeVisible({ timeout: 30_000 });

// Each person has used Home before on another device: a first sign-in's own writes (the member's
// profile, their language) are done, so they don't land in a measured open as changes its listeners
// bill, early or late.
test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  for (const as of ['admin', 'helper'] as const) {
    const page = await hh.open(browser, as);
    await loaded(page);
    await page.waitForTimeout(TODO_DELAY_MS + 1500);
    await page.close();
  }
});

async function firstOpen(browser: Browser, as: 'admin' | 'helper', path: string, ready: (page: Page) => Promise<unknown>, max: number, label: string) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  try {
    const page = await context.newPage();
    return await expectPageReads(
      page,
      async () => {
        await hh.signIn(page, as, path);
        await ready(page);
      },
      // Past the to-do publish a few seconds after the data is in: its query is part of an open.
      { max, min: max, label, settleMs: TODO_DELAY_MS + 1500 },
    );
  } finally {
    await context.close();
  }
}

// Every screen mounts the same eight listeners: the household (1), the jobs (3), the visits (3: all
// of them, the house's history), the warranties (2), the events (1), the last three weeks of ticks
// (1), the household's contacts (3: every app's, filtered on the device) and their pay details (none,
// billed 1). The publish reads nothing on the local preview: its links are http, so the agenda,
// reminders and to-dos stop before reading; e2e/reads.sdk.ts budgets them.
for (const [tab, text] of [
  ['', 'Test filter'],
  ['#upkeep', 'Test smoke alarms'],
  ['#regular', 'Test garbage'],
  ['#history', 'Test roof repair'],
  ['#warranties', 'Test roof'],
  ['#contacts', 'Test Roofer'],
] as const) {
  test(`opening Home${tab ? ` at ${tab.slice(1)}` : ' (Overview)'}, signed in as an admin`, async ({ browser }) => {
    await firstOpen(browser, 'admin', `./${tab}`, (p) => expect(p.getByText(text).first()).toBeVisible({ timeout: 30_000 }), 15, `Home ${tab || 'Overview'}, admin`);
  });
}

// A helper (as a kid) reads the same, with the contacts that aren't private (2) and no pay details.
test('opening Home (Overview), signed in as a helper: no private contacts read', async ({ browser }) => {
  await firstOpen(browser, 'helper', './', loaded, 13, 'Home Overview, helper');
});
