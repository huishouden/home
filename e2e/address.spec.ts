import { expect, test } from '@playwright/test';
import { stubOpenStreetMap } from '@huishouden/pwa-kit/e2e';

// The household's own address on the overview. The sample house's home is invented (12 Example
// Lane, Springfield); `?home=none` is the sample before its household set one.

test('the overview shows the home address with a link to the map', async ({ page }) => {
  await stubOpenStreetMap(page);
  await page.goto('./');
  const home = page.getByRole('region', { name: 'Home address' });
  await expect(home).toContainText('12 Example Lane, Springfield, Illinois 62701');
  await expect(home.getByRole('link', { name: 'Open 12 Example Lane, Springfield, Illinois 62701 on the map' })).toHaveAttribute(
    'href',
    'https://www.openstreetmap.org/?mlat=39.78170&mlon=-89.65010#map=17/39.78170/-89.65010',
  );
  await expect(page.getByRole('link', { name: 'Set your home address in the portal' })).toHaveCount(0);
});

test('without a home, admins and members get a link to set it in the portal', async ({ page }) => {
  await page.goto('./?home=none');
  await expect(page.getByRole('region', { name: 'Home address' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Set your home address in the portal' })).toHaveAttribute('href', '/apps#household');
});

test('a helper without a home sees no link they could not use', async ({ page }) => {
  await page.goto('./?home=none&as=helper');
  await expect(page.getByRole('heading', { name: 'Booked visits' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Set your home address in the portal' })).toHaveCount(0);
});

test('a helper still reads the address', async ({ page }) => {
  await page.goto('./?as=helper');
  await expect(page.getByRole('region', { name: 'Home address' })).toContainText('12 Example Lane');
});
