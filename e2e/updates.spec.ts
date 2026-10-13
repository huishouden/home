import { expect, test, type Page } from '@playwright/test';

// The screen lives in the address (kit STANDARD.md "Updates"), so a reload (an update applying) and
// Back return to it. The sample house, signed out.

const currentTab = (page: Page) => page.locator('nav[slot="nav"] button[aria-current="page"]');

test('a reload and Back return to the screen in the address', async ({ page }) => {
  await page.goto('./');
  await expect(currentTab(page)).toHaveText('Overview');
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Upkeep', exact: true }).click();
  await expect(page).toHaveURL(/\?tab=upkeep$/);
  await page.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'History', exact: true }).click();
  await expect(page).toHaveURL(/\?tab=history$/);
  await page.reload();
  await expect(currentTab(page)).toHaveText('History');
  await page.goBack();
  await expect(currentTab(page)).toHaveText('Upkeep');
  await page.goForward();
  await expect(currentTab(page)).toHaveText('History');
});

test('an agenda link to #warranties still opens Warranties, and the address keeps it as ?tab=', async ({ page }) => {
  await page.goto('./#warranties');
  await expect(currentTab(page)).toHaveText('Warranties');
  await expect(page).toHaveURL(/\?tab=warranties$/);
  await page.reload();
  await expect(currentTab(page)).toHaveText('Warranties');
});

test('an agenda link followed while the app is open switches the screen too', async ({ page }) => {
  await page.goto('./?tab=history');
  await page.evaluate(() => (location.hash = '#upkeep'));
  await expect(currentTab(page)).toHaveText('Upkeep');
  await expect(page).toHaveURL(/\?tab=upkeep$/);
});
