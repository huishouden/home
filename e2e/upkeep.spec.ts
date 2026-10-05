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
  await page.getByRole('button', { name: 'Mark Gutter cleaning done' }).click();
  await expect(page.getByText('Done: Gutter cleaning. Next due Apr 16, 2032.')).toBeVisible();
  // Rolled forward: no done-looking button stays behind, and nothing is a pressed toggle.
  await expect(page.getByRole('button', { name: 'Mark Gutter cleaning done' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Upkeep' }).locator('[aria-pressed]')).toHaveCount(0);
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
  await expect(dialog.getByText('Every 6 months on the 1st.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Not done yet', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByLabel('Next due')).toHaveValue('2032-04-01');
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
  await dialog.getByRole('button', { name: 'On a date' }).click();
  await dialog.getByLabel('Last done', { exact: true }).fill('2031-05-01');
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

test('a new job is not assumed done: by default it is due now and shows as needing doing', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Upkeep', exact: true }).click();
  await page.getByRole('button', { name: 'Add job' }).click();
  const dialog = page.getByRole('dialog', { name: 'New upkeep job' });
  await dialog.getByLabel('What').fill('Reseal the shower');
  await dialog.getByLabel('Unit').selectOption('year');
  await dialog.getByLabel('How many').fill('1');
  await expect(dialog.getByRole('group', { name: 'When was it last done?' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: "Not done yet, it's due now" })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByLabel('Next due')).toHaveValue('2031-10-16');
  await expect(dialog.getByText('Due today, Thursday, October 16.', { exact: false })).toBeVisible();

  // "Today" says it was just done: due a year on. Back to "Not done yet" and it is due now again.
  await dialog.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(dialog.getByLabel('Next due')).toHaveValue('2032-10-16');
  await dialog.getByRole('button', { name: "Not done yet, it's due now" }).click();
  await expect(dialog.getByLabel('Next due')).toHaveValue('2031-10-16');
  await dialog.getByRole('button', { name: 'Save' }).click();

  const row = page.getByRole('listitem', { name: 'Reseal the shower' });
  await expect(row).toContainText('Due today');
  await expect(row).toContainText('Every year · Not done yet');
  await expect(page.getByRole('region', { name: 'Next two weeks' }).getByRole('listitem', { name: 'Reseal the shower' })).toBeVisible();
});

test("a new job on set dates that's already overdue goes on the date that passed", async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Upkeep', exact: true }).click();
  await page.getByRole('button', { name: 'Add job' }).click();
  const dialog = page.getByRole('dialog', { name: 'New upkeep job' });
  await dialog.getByLabel('What').fill('Clean the dishwasher filter');
  await dialog.getByRole('button', { name: 'On set dates' }).click();
  await dialog.getByLabel('How many').fill('1');
  await dialog.getByLabel('Starting on').fill('2031-01-05');
  await expect(dialog.getByLabel('Next due')).toHaveValue('2031-11-05');
  await dialog.getByRole('button', { name: "It's overdue" }).click();
  await expect(dialog.getByLabel('Next due')).toHaveValue('2031-10-05');
  await dialog.getByRole('button', { name: 'Save' }).click();

  const row = page.getByRole('listitem', { name: 'Clean the dishwasher filter' });
  await expect(row).toContainText('Overdue by 11 days');
  await expect(page.getByRole('region', { name: 'Overdue' }).getByRole('listitem', { name: 'Clean the dishwasher filter' })).toBeVisible();
});

test('an existing job: last done and next due can be changed directly', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Upkeep', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Change HVAC filter' }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit job' });
  // Opens on what is saved: done on July 20, due October 20.
  await expect(dialog.getByRole('button', { name: 'On a date' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByLabel('Last done', { exact: true })).toHaveValue('2031-07-20');
  await expect(dialog.getByLabel('Next due')).toHaveValue('2031-10-20');

  // It wasn't actually done: it needs doing now.
  await dialog.getByRole('button', { name: "Not done yet, it's due now" }).click();
  await expect(dialog.getByLabel('Next due')).toHaveValue('2031-10-16');
  await dialog.getByRole('button', { name: 'Save' }).click();
  const row = page.getByRole('listitem', { name: 'Change HVAC filter' });
  await expect(row).toContainText('Due today');
  await expect(row).toContainText('Every 3 months · Not done yet');

  // Next due by hand.
  await page.getByRole('button', { name: 'Edit Dryer vent cleaning' }).click();
  const edit = page.getByRole('dialog', { name: 'Edit job' });
  await edit.getByLabel('Next due').fill('2031-10-01');
  await edit.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('listitem', { name: 'Dryer vent cleaning' })).toContainText('Overdue by 2 weeks');
});

test('a paused job stays in Upkeep as Paused, off the overview, until it is resumed', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Upkeep', exact: true }).click();
  const paused = page.getByRole('region', { name: 'Paused' });
  await expect(paused.getByRole('listitem', { name: 'Pool filter clean' })).toContainText('Paused Oct 1');

  // Pause from the job's dialog: kept, out of the due groups and the overview.
  await page.getByRole('button', { name: 'Edit Gutter cleaning' }).click();
  await page.getByRole('dialog', { name: 'Edit job' }).getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByText("Paused Gutter cleaning. It won't come due until resumed.")).toBeVisible();
  await expect(paused.getByRole('listitem', { name: 'Gutter cleaning' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Overdue' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByText('Overdue: gutter cleaning')).toHaveCount(0);
  await expect(page.getByText('Change HVAC filter due in 4 days')).toBeVisible();

  // Resume: due again, from today since its date passed while paused.
  await page.getByRole('button', { name: 'Upkeep', exact: true }).click();
  await paused.getByRole('button', { name: 'Resume: Gutter cleaning' }).click();
  await expect(page.getByText('Resumed Gutter cleaning')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Next two weeks' }).getByRole('listitem', { name: 'Gutter cleaning' })).toContainText('Due today');
});

test('the thing to do before can be skipped, shows as skipped, and the skip undone', async ({ page }) => {
  await page.goto('./');
  const card = page.getByRole('region', { name: 'Upkeep' });
  const row = card.getByRole('listitem').filter({ hasText: 'Unlock the side gate' });
  await row.getByRole('button', { name: 'Skip: Unlock the side gate' }).click();
  await expect(page.getByText('Skipped: Unlock the side gate')).toBeVisible();
  await card.getByRole('button', { name: /All done for now/ }).click();
  await expect(row).toHaveAttribute('data-completion', 'skipped');
  await expect(row).toContainText('Skipped by you · 10:30 AM');
  await row.getByRole('button', { name: 'Undo skip for Unlock the side gate' }).click();
  await expect(row.getByRole('button', { name: 'Mark Unlock the side gate done' })).toBeVisible();
});
