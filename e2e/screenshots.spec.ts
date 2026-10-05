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
      await p.getByRole('button', { name: 'Mark Gutter cleaning done' }).click();
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

test('regular events', ({ page }) =>
  captureScreenshot(page, 'regular', {
    fixedTime,
    prepare: async (p) => {
      await tab('Regular')(p);
      await expect(p.getByText('Every other Friday at 9 AM')).toBeVisible();
    },
  }));

test('move one occurrence', ({ page }) =>
  captureScreenshot(page, 'occurrence', {
    fixedTime,
    prepare: async (p) => {
      await tab('Regular')(p);
      await p.getByRole('button', { name: 'Lawn service, Fri, Oct 31, 9 AM' }).click();
      await p.getByRole('button', { name: 'Move this one' }).click();
      await expect(p.getByLabel('New day')).toBeVisible();
    },
  }));

test('event dialog', ({ page }) =>
  captureScreenshot(page, 'event-dialog', {
    fixedTime,
    prepare: async (p) => {
      await tab('Regular')(p);
      await p.getByRole('button', { name: 'Edit the schedule: Garbage pickup' }).click();
      await expect(p.getByRole('dialog', { name: 'Edit the schedule' })).toBeVisible();
    },
  }));

test('thing to do before, done', ({ page }) =>
  captureScreenshot(page, 'prep-done', {
    fixedTime,
    prepare: async (p) => {
      await p.getByRole('button', { name: 'Mark Unlock the side gate done' }).click();
      await p.getByRole('button', { name: /All done for now/ }).click();
      await expect(p.getByText('Done by you')).toBeVisible();
    },
  }));

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

// Roles: a helper ticks jobs off and adds their own, and is told who changes the rest.
test('a helper’s upkeep', ({ page }) =>
  captureScreenshot(page, 'helper-upkeep', {
    path: './?as=helper',
    fixedTime,
    prepare: async (p) => {
      await tab('Upkeep')(p);
      await expect(p.getByText('Only admins and members can change or delete what someone else added.')).toBeVisible();
      // Opening someone else's job says who can change it instead of opening the form.
      await p.getByRole('button', { name: 'Dryer vent cleaning', exact: true }).click();
      await expect(p.getByText('Only admins and members can change or delete what someone else added.')).toHaveCount(2);
      await expect(p.getByRole('dialog')).toHaveCount(0);
    },
  }));

test('a helper’s warranties', ({ page }) =>
  captureScreenshot(page, 'helper-warranties', {
    path: './?as=helper',
    fixedTime,
    prepare: async (p) => {
      await tab('Warranties')(p);
      await expect(p.getByText('Only admins and members can change or delete what someone else added.')).toBeVisible();
    },
  }));
