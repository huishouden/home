import { expect, test } from '@playwright/test';

const openHistory = async (page: import('@playwright/test').Page) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'History', exact: true }).first().click();
};

test('booked visits come first, then the year with what it cost', async ({ page }) => {
  await openHistory(page);
  const booked = page.getByRole('region', { name: 'Booked visits' });
  await expect(booked.getByRole('listitem').first()).toContainText('Quarterly pest control');
  await expect(booked.getByRole('listitem').first().getByRole('link', { name: 'Call Example Pest Control, (555) 010-0120' })).toBeVisible();
  const year = page.getByRole('region', { name: 'Done in 2031' });
  await expect(year).toContainText('Spent $2,137.00');
  await expect(year.getByRole('listitem').first()).toContainText('Lawn service');
  await expect(year.getByRole('listitem', { name: /^Replaced the garbage disposal/ })).toContainText('$240.00');
});

test('a past entry for a job marks it done on that day', async ({ page }) => {
  await openHistory(page);
  await page.getByRole('button', { name: 'Add entry' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add to history' });
  await dialog.getByLabel('Upkeep job (optional)').selectOption({ label: 'Change HVAC filter' });
  await expect(dialog.getByLabel('What')).toHaveValue('Change HVAC filter');
  await dialog.getByLabel('Date').fill('2031-10-15');
  await expect(dialog.getByText('Saving marks Change HVAC filter done on this day, if it is the latest time.')).toBeVisible();
  await dialog.getByLabel('Cost (optional)').fill('abc');
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();
  await dialog.getByLabel('Cost (optional)').fill('28.50');
  await dialog.getByLabel('Name (optional)').fill('We did it');
  await dialog.getByRole('button', { name: 'Save' }).click();

  const row = page.getByRole('listitem', { name: 'Change HVAC filter, Wednesday, October 15' });
  await expect(row).toContainText('$28.50');
  await expect(row).toContainText('We did it');
  await expect(page.getByRole('region', { name: 'Done in 2031' })).toContainText('Spent $2,165.50');

  await page.getByRole('button', { name: 'Upkeep', exact: true }).click();
  const job = page.getByRole('listitem', { name: 'Change HVAC filter' });
  await expect(job).toContainText('Due in 3 months');
  await expect(job).toContainText('Done yesterday');
});

test('a future entry is a booked visit and changes no job', async ({ page }) => {
  await openHistory(page);
  await page.getByRole('button', { name: 'Add entry' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add to history' });
  await dialog.getByLabel('What').fill('Chimney sweep');
  await dialog.getByLabel('Date').fill('2031-11-20');
  await expect(dialog.getByText('A booked visit until then.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('region', { name: 'Booked visits' }).getByRole('listitem', { name: /^Chimney sweep/ })).toBeVisible();
});

test('deleting an entry can be undone', async ({ page }) => {
  await openHistory(page);
  await page.getByRole('button', { name: 'Edit Replaced the garbage disposal' }).click();
  await page.getByRole('dialog', { name: 'Edit entry' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Deleted Replaced the garbage disposal')).toBeVisible();
  await expect(page.getByRole('listitem', { name: /^Replaced the garbage disposal/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('listitem', { name: /^Replaced the garbage disposal/ })).toBeVisible();
});
