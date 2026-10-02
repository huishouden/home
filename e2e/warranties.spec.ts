import { expect, test } from '@playwright/test';

const openWarranties = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Warranties', exact: true }).click();
};

test('warranties end soonest first, with the receipt and manual one tap away', async ({ page }) => {
  await openWarranties(page);
  const cards = page.locator('main section[aria-label]');
  await expect(cards.first()).toHaveAttribute('aria-label', 'Refrigerator');
  const fridge = page.getByRole('region', { name: 'Refrigerator' });
  await expect(fridge).toContainText('Expires in 46 days');
  await expect(fridge).toContainText('Bought Dec 1, 2029, warranty to Dec 1, 2031');
  await expect(fridge.getByRole('link', { name: 'Receipt for Refrigerator' })).toHaveAttribute('href', 'https://receipts.example.com/refrigerator.pdf');
  await expect(fridge.getByRole('link', { name: 'Manual for Refrigerator' })).toHaveAttribute('href', 'https://manuals.example.com/ex-200');
  await expect(page.getByRole('region', { name: 'Washing machine' })).toContainText('Expired 6 months ago');
});

test('a new item gets its end date from the warranty length', async ({ page }) => {
  await openWarranties(page);
  await page.getByRole('button', { name: 'Add item' }).click();
  const dialog = page.getByRole('dialog', { name: 'New warranty' });
  await dialog.getByLabel('Item').fill('Microwave');
  await dialog.getByLabel('Bought').fill('2031-01-10');
  await dialog.getByRole('button', { name: '1 year', exact: true }).click();
  await expect(dialog.getByLabel('Warranty ends')).toHaveValue('2032-01-10');
  await dialog.getByLabel('Manual link (optional)').fill('javascript:alert(1)');
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
  await dialog.getByLabel('Manual link (optional)').fill('manuals.example.com/microwave');
  await dialog.getByRole('button', { name: 'Save' }).click();

  const card = page.getByRole('region', { name: 'Microwave' });
  await expect(card).toContainText('Expires in 86 days');
  await expect(card.getByRole('link', { name: 'Manual for Microwave' })).toHaveAttribute('href', 'https://manuals.example.com/microwave');
});

test('deleting an item can be undone', async ({ page }) => {
  await openWarranties(page);
  await page.getByRole('button', { name: 'Delete Dishwasher' }).click();
  await expect(page.getByRole('region', { name: 'Dishwasher' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('region', { name: 'Dishwasher' })).toBeVisible();
});
