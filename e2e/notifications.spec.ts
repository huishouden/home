import { expect, test } from '@playwright/test';

// "Notifications on this device" on the overview: Home writes reminders (things to do before an
// event, upkeep due), so the device switch lives here. The sample shows the card with a note
// instead of a switch that would do nothing.

test('the overview offers notifications on this device, as a note in the sample', async ({ page }) => {
  await page.goto('./');
  const card = page.getByRole('region', { name: 'Notifications on this device' });
  await expect(card).toContainText('things to do before an event');
  await expect(card.getByRole('button', { name: 'Turn on' })).toBeDisabled();
  await expect(card).toContainText('Sign in to turn on notifications.');
});

test('a helper sees it too: Home is everyday', async ({ page }) => {
  await page.goto('./?as=helper');
  await expect(page.getByRole('region', { name: 'Notifications on this device' })).toBeVisible();
});
