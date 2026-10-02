import { expect, test } from '@playwright/test';
import { calendarEvents, mockCalendar } from './fixtures/calendar';

// Google Calendar has no emulator, and the sample app has no Google account: these tests stand in
// for the calendar with window.__mockCalendarEvents, which the kit's search answers from.

test('signed out, calendar search is off and says why', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'History', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Import from calendar' })).toBeDisabled();
  await expect(page.getByText('Sign in to search your calendar.')).toBeVisible();
  await page.getByRole('button', { name: 'Upkeep', exact: true }).click();
  await page.getByRole('button', { name: 'Add job' }).click();
  const dialog = page.getByRole('dialog', { name: 'New upkeep job' });
  await dialog.getByLabel('What').fill('Gutter cleaning');
  await expect(dialog.getByRole('button', { name: 'Find in my calendar' })).toBeDisabled();
  await expect(dialog.getByText('Sign in to search your calendar.')).toBeVisible();
});

test.describe('with a calendar', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(mockCalendar, calendarEvents);
    await page.goto('/');
  });

  test('Find in my calendar sets the job’s next due date from a booked visit', async ({ page }) => {
    await page.getByRole('button', { name: 'Upkeep', exact: true }).click();
    await page.getByRole('button', { name: 'Edit Gutter cleaning' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit job' });
    await expect(dialog.getByText('Google will ask once to let Home read your calendar. Home never changes it.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Find in my calendar' }).click();
    const match = dialog.getByRole('list', { name: 'Calendar matches' }).getByRole('button', { name: /Gutter cleaning/ });
    await expect(match).toContainText('Wed, Oct 22, 8:00 AM · Family');
    await match.click();
    await expect(dialog.getByLabel('Next due')).toHaveValue('2031-10-22');
    await expect(dialog.getByRole('link', { name: 'Open in Calendar' })).toHaveAttribute('href', 'https://calendar.example.com/event?eid=evt-gutter');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('listitem', { name: 'Gutter cleaning' })).toContainText('Due in 6 days');
  });

  test('Find in my calendar fills a history entry and links its job', async ({ page }) => {
    await page.getByRole('button', { name: 'History', exact: true }).first().click();
    await page.getByRole('button', { name: 'Add entry' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add to history' });
    await dialog.getByLabel('What').fill('Gutter cleaning');
    await dialog.getByRole('button', { name: 'Find in my calendar' }).click();
    await dialog.getByRole('list', { name: 'Calendar matches' }).getByRole('button', { name: /Gutter cleaning/ }).click();
    await expect(dialog.getByLabel('Date')).toHaveValue('2031-10-22');
    await expect(dialog.getByLabel('Upkeep job (optional)')).toHaveValue('demo-task-gutters');
    await expect(dialog.getByLabel('Who')).toHaveValue('demo-contact-roofing');
    await expect(dialog.getByLabel('Notes (optional)')).toHaveValue('Front and back. They need the side gate open.');
    await dialog.getByRole('button', { name: 'Save' }).click();
    const row = page.getByRole('region', { name: 'Booked visits' }).getByRole('listitem', { name: /^Gutter cleaning/ });
    await expect(row.getByRole('link', { name: 'Open in Calendar' })).toHaveAttribute('href', 'https://calendar.example.com/event?eid=evt-gutter');
  });

  test('Import from calendar lists new visits once and adds them', async ({ page }) => {
    await page.getByRole('button', { name: 'History', exact: true }).first().click();
    await page.getByRole('button', { name: 'Import from calendar' }).click();
    const dialog = page.getByRole('dialog', { name: 'Import from calendar' });
    const list = dialog.getByRole('list', { name: 'Calendar events' });
    await expect(list.getByRole('listitem')).toHaveCount(3);
    await expect(list).not.toContainText('Quarterly pest control');

    await list.getByRole('button', { name: 'Add Gutter cleaning' }).click();
    await expect(list.getByRole('listitem')).toHaveCount(2);
    await expect(page.getByText('Added Gutter cleaning')).toBeVisible();

    await dialog.getByRole('button', { name: 'Add all 2' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Added 2 visits')).toBeVisible();
    const booked = page.getByRole('region', { name: 'Booked visits' });
    for (const title of ['Gutter cleaning', 'Lawn aeration', 'Roof inspection']) await expect(booked.getByRole('listitem', { name: new RegExp(`^${title}`) })).toBeVisible();
    await expect(booked.getByRole('listitem', { name: /^Lawn aeration/ })).toContainText('Example Lawn Care');

    await page.getByRole('button', { name: 'Import from calendar' }).click();
    await expect(dialog.getByText('Every house visit in your calendar is already in Home.')).toBeVisible();
  });

  test('a closed permission window is explained, with Try again', async ({ page }) => {
    await page.evaluate(() => {
      Object.defineProperty(window, '__mockCalendarEvents', {
        configurable: true,
        get() {
          throw Object.assign(new Error('Firebase: Error (auth/popup-closed-by-user).'), { code: 'auth/popup-closed-by-user' });
        },
      });
    });
    await page.getByRole('button', { name: 'History', exact: true }).first().click();
    await page.getByRole('button', { name: 'Import from calendar' }).click();
    const alert = page.getByRole('dialog', { name: 'Import from calendar' }).getByRole('alert');
    await expect(alert).toContainText('Calendar access was not allowed');
    await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});
