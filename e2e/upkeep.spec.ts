import { expect, test } from '@playwright/test';

// The sample house (signed out, nothing saved). Its clock starts on Thursday 16 October 2031.

test('the overview leads with what is overdue, then what is due soon', async ({ page }) => {
  await page.goto('./');
  const upkeep = page.getByRole('region', { name: 'Upkeep' });
  await expect(upkeep.getByText('Overdue: gutter cleaning')).toBeVisible();
  await expect(upkeep).toContainText('1 overdue');
  const also = upkeep.getByRole('list', { name: 'Also due' });
  await expect(also.getByRole('listitem').first()).toContainText('Change HVAC filter');
  await expect(also.getByRole('listitem').first()).toContainText('Due in 4 days');
  await expect(also.getByRole('listitem').nth(1)).toContainText('Due in 12 days');
  await expect(page.getByRole('region', { name: 'Booked visits' })).toContainText('Quarterly pest control');
  await expect(page.getByRole('region', { name: 'Warranties ending' })).toContainText('Expires in 46 days');
});

test('Done rolls the job forward, records it in the history, and can be undone', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Mark done: Gutter cleaning' }).click();
  await expect(page.getByText('Done: Gutter cleaning. Next due Apr 16, 2032.')).toBeVisible();
  await expect(page.getByText('Change HVAC filter due in 4 days')).toBeVisible();

  await page.getByRole('button', { name: 'History', exact: true }).first().click();
  await expect(page.getByRole('listitem', { name: 'Gutter cleaning, Thursday, October 16' })).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('listitem', { name: 'Gutter cleaning, Thursday, October 16' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByText('Overdue: gutter cleaning')).toBeVisible();
});

test('a new job on set dates gets its next due date from the schedule', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Upkeep', exact: true }).click();
  await page.getByRole('button', { name: 'Add job' }).click();
  const dialog = page.getByRole('dialog', { name: 'New upkeep job' });
  await dialog.getByLabel('What').fill('Test the sump pump');
  await expect(dialog.getByLabel('Kind')).toHaveValue('plumbing');
  await dialog.getByRole('button', { name: 'On set dates' }).click();
  await dialog.getByLabel('How many').fill('6');
  await dialog.getByLabel('Starting on').fill('2031-04-01');
  await expect(dialog.getByText('Every 6 months on the 1st. Next due Thursday, April 1, 2032.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Save' }).click();

  const row = page.getByRole('listitem', { name: 'Test the sump pump' });
  await expect(row).toContainText('Due in 6 months');
  await expect(row).toContainText('Every 6 months on the 1st · Not done yet');
  await expect(page.getByRole('region', { name: 'Later' }).getByRole('listitem', { name: 'Test the sump pump' })).toBeVisible();
});

test('an after-done job starts one interval after the last time it was done', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Upkeep', exact: true }).click();
  await page.getByRole('button', { name: 'Add job' }).click();
  const dialog = page.getByRole('dialog', { name: 'New upkeep job' });
  await dialog.getByLabel('What').fill('Clean the fridge coils');
  await dialog.getByLabel('Unit').selectOption('week');
  await dialog.getByLabel('How many').fill('26');
  await dialog.getByLabel('Last done (optional)').fill('2031-05-01');
  await expect(dialog.getByLabel('Next due')).toHaveValue('2031-10-30');
  await dialog.getByLabel('Who does it (optional)').selectOption({ label: 'Example Plumbing (Plumber)' });
  await dialog.getByRole('button', { name: 'Save' }).click();

  const row = page.getByRole('listitem', { name: 'Clean the fridge coils' });
  await expect(row).toContainText('Due in 2 weeks');
  await expect(row).toContainText('Every 26 weeks · Done 6 months ago');
  await expect(row.getByRole('link', { name: 'Call Example Plumbing, (555) 010-0140' })).toHaveAttribute('href', 'tel:5550100140');
});

test('deleting a job can be undone', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Upkeep', exact: true }).click();
  await page.getByRole('button', { name: 'Edit HOA dues' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit job' });
  await expect(dialog.getByLabel('Starting on')).toHaveValue('2031-01-01');
  await dialog.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('listitem', { name: 'HOA dues' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('listitem', { name: 'HOA dues' })).toContainText('Every month on the 1st');
});
