import { expect, test } from '@playwright/test';
import { signInTestUser } from '@huishouden/pwa-kit/e2e';

// Signed in as an invented test user on the staging site (pwa-kit STANDARD.md "Staging"): the real
// staging Firestore and rules, the seeded test household. Other runs share that household, so each
// test works on a job named for its run and removes it afterwards.
test.skip(!process.env.HH_STAGING_SA, 'signed-in tests run against staging, in CI');

test('a job one member marks done is in the history for the other', async ({ page, browser }) => {
  const title = `Test the smoke alarms ${Date.now().toString(36)}`;
  await signInTestUser(page, { email: 'test-a@example.com' });
  await page.getByRole('button', { name: 'Upkeep', exact: true }).click({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Add job' }).click();
  const dialog = page.getByRole('dialog', { name: 'New upkeep job' });
  await dialog.getByLabel('What').fill(title);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('listitem', { name: title })).toBeVisible();

  await page.getByRole('button', { name: `Mark done: ${title}` }).click();
  await expect(page.getByText(`Done: ${title}. Next due`)).toBeVisible();

  // Saved in the household, not just on this screen: the other member's own browser shows it.
  const other = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  try {
    const theirs = await other.newPage();
    await signInTestUser(theirs, { email: 'test-b@example.com' });
    await theirs.getByRole('button', { name: 'History', exact: true }).first().click({ timeout: 20_000 });
    await expect(theirs.getByRole('listitem', { name: new RegExp(`^${title}, `) })).toBeVisible({ timeout: 20_000 });
  } finally {
    await other.close();
  }

  // Leave the shared household as it was: the job goes (its history entry stays, like a real one).
  await page.getByRole('button', { name: `Edit ${title}` }).click();
  await page.getByRole('dialog', { name: 'Edit job' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('listitem', { name: title })).toHaveCount(0);
});
