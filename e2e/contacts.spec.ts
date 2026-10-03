import { expect, test, type Page } from '@playwright/test';
import places from './fixtures/nominatim.json' with { type: 'json' };

// The sample house's service providers (signed out, nothing saved). Place search goes to
// OpenStreetMap's Nominatim, stubbed here with invented results.

const openContacts = async (page: Page) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Contacts', exact: true }).click();
};

test('the providers are one tap from a call or a map', async ({ page }) => {
  await openContacts(page);
  const card = page.getByRole('region', { name: 'Example Pest Control' });
  await expect(card).toContainText('Pest control');
  await expect(card.getByRole('link', { name: 'Call Example Pest Control, (555) 010-0120' })).toHaveAttribute('href', 'tel:5550100120');
  await expect(card.getByRole('link', { name: 'Open in Google Maps' })).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Example%20Pest%20Control/);
  await expect(card.getByRole('link', { name: 'pest.example.com', exact: true })).toHaveAttribute('href', 'https://pest.example.com');
});

test('Find a business fills the contact from OpenStreetMap, only on Search', async ({ page }) => {
  let searches = 0;
  await page.route('https://nominatim.openstreetmap.org/**', (route) => {
    searches++;
    return route.fulfill({ json: places });
  });
  await openContacts(page);
  await page.getByRole('button', { name: 'Add contact' }).click();
  const dialog = page.getByRole('dialog', { name: 'New contact' });
  await dialog.getByLabel('Phone').fill('(555) 010-0199');
  await dialog.getByLabel('Find a business').fill('Example Pool Springfield');
  expect(searches).toBe(0);
  await expect(dialog.getByRole('link', { name: 'Search Google Maps' })).toHaveAttribute('href', 'https://www.google.com/maps/search/?api=1&query=Example%20Pool%20Springfield');
  await dialog.getByRole('button', { name: 'Search', exact: true }).click();

  const results = dialog.getByRole('list', { name: 'Places' }).getByRole('button');
  await expect(results).toHaveCount(2);
  await expect(results.first()).toContainText('+1 555 010 0181');
  expect(searches).toBe(1);
  await results.filter({ hasText: 'Example Pool Service' }).click();

  await expect(dialog.getByLabel('Name')).toHaveValue('Example Pool Service');
  await expect(dialog.getByLabel('Address')).toHaveValue('5 Demo Lane, Springfield, 00000, United States');
  await expect(dialog.getByLabel('Phone')).toHaveValue('(555) 010-0199');
  await dialog.getByRole('button', { name: 'Pool service' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();

  const card = page.getByRole('region', { name: 'Example Pool Service' });
  await expect(card).toContainText('Pool service');
  await expect(card.getByRole('link', { name: /^Call Example Pool Service/ })).toHaveAttribute('href', 'tel:5550100199');
  await expect(card.getByRole('link', { name: 'Open in Google Maps' })).toHaveAttribute('href', /query=Example%20Pool%20Service/);
});

test('deleting a contact can be undone', async ({ page }) => {
  await openContacts(page);
  await page.getByRole('button', { name: 'Delete Example Roofing' }).click();
  await expect(page.getByRole('region', { name: 'Example Roofing' })).toHaveCount(0);
  await expect(page.getByText('Deleted Example Roofing')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('region', { name: 'Example Roofing' })).toBeVisible();
});

test('the overview shows who does the next job, with their number', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('region', { name: 'Upkeep' }).getByRole('link', { name: 'Call Example Roofing, (555) 010-0150' })).toHaveAttribute('href', 'tel:5550100150');
});
