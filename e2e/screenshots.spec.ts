import { expect, test } from '@playwright/test';
import { captureScreenshot } from '@huishouden/pwa-kit/e2e';
import places from './fixtures/nominatim.json' with { type: 'json' };
import { calendarEvents, mockCalendar } from './fixtures/calendar';

// README images of the signed-out app's invented sample house, refreshed by CI after each deploy.
// The clock is frozen at the sample data's moment so every run renders the same.
const fixedTime = '2031-10-16T10:30:00';
const tab = (name: string) => async (p: import('@playwright/test').Page) => {
  await p.getByRole('button', { name, exact: true }).first().click();
};

test('overview', ({ page }) =>
  captureScreenshot(page, 'overview', {
    fixedTime,
    prepare: (p) => expect(p.getByText('Overdue: gutter cleaning')).toBeVisible(),
  }));

test('upkeep', ({ page }) =>
  captureScreenshot(page, 'upkeep', {
    fixedTime,
    prepare: async (p) => {
      await tab('Upkeep')(p);
      await expect(p.getByText('Dryer vent cleaning')).toBeVisible();
    },
  }));

test('history', ({ page }) =>
  captureScreenshot(page, 'history', {
    fixedTime,
    prepare: async (p) => {
      await tab('History')(p);
      await expect(p.getByText('Quarterly pest control')).toBeVisible();
    },
  }));

test('warranties', ({ page }) =>
  captureScreenshot(page, 'warranties', {
    fixedTime,
    prepare: async (p) => {
      await tab('Warranties')(p);
      await expect(p.getByText('Expires in 46 days')).toBeVisible();
    },
  }));

test('contacts', ({ page }) =>
  captureScreenshot(page, 'contacts', {
    fixedTime,
    prepare: async (p) => {
      await tab('Contacts')(p);
      await expect(p.getByText('Example Pest Control')).toBeVisible();
    },
  }));

test('job dialog', ({ page }) =>
  captureScreenshot(page, 'job-dialog', {
    fixedTime,
    prepare: async (p) => {
      await tab('Upkeep')(p);
      await p.getByRole('button', { name: 'Edit HOA dues' }).click();
      await expect(p.getByRole('dialog', { name: 'Edit job' })).toBeVisible();
    },
  }));

test('done with undo', ({ page }) =>
  captureScreenshot(page, 'done', {
    fixedTime,
    prepare: async (p) => {
      await p.getByRole('button', { name: 'Mark done: Gutter cleaning' }).click();
      await expect(p.getByRole('button', { name: 'Undo' })).toBeVisible();
    },
  }));

test('calendar import', async ({ page }) => {
  await page.addInitScript(mockCalendar, calendarEvents);
  await captureScreenshot(page, 'calendar-import', {
    fixedTime,
    prepare: async (p) => {
      await tab('History')(p);
      await p.getByRole('button', { name: 'Import from calendar' }).click();
      await expect(p.getByRole('list', { name: 'Calendar events' })).toBeVisible();
    },
  });
});

test('contact search', async ({ page }) => {
  await page.route('https://nominatim.openstreetmap.org/**', (route) => route.fulfill({ json: places }));
  await captureScreenshot(page, 'contact-search', {
    fixedTime,
    prepare: async (p) => {
      await tab('Contacts')(p);
      await p.getByRole('button', { name: 'Add contact' }).click();
      const dialog = p.getByRole('dialog', { name: 'New contact' });
      await dialog.getByLabel('Find a business').fill('Example Electric Springfield');
      await dialog.getByRole('button', { name: 'Search', exact: true }).click();
      await expect(dialog.getByRole('list', { name: 'Places' })).toBeVisible();
    },
  });
});

test('phone: overview', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await captureScreenshot(page, 'phone-overview', {
    fixedTime,
    prepare: (p) => expect(p.getByText('Overdue: gutter cleaning')).toBeVisible(),
  });
});

test('phone: upkeep', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await captureScreenshot(page, 'phone-upkeep', {
    fixedTime,
    prepare: async (p) => {
      await tab('Upkeep')(p);
      await expect(p.getByText('Gutter cleaning').first()).toBeVisible();
    },
  });
});
