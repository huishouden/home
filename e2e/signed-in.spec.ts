import { expect, test } from '@playwright/test';
import { signInTestUser } from '@huishouden/pwa-kit/e2e';
import { seedTestHousehold } from '@huishouden/pwa-kit/staging';

// Signed in as an invented test user on the staging site (pwa-kit STANDARD.md "Staging"): the real
// staging Firestore and rules, the seeded test household. Other runs share that household, so each
// test works on a job named for its run and removes it afterwards.
test.skip(!process.env.HH_STAGING_SA, 'signed-in tests run against staging, in CI');

// Another app's run may have reseeded the household with an older kit that has no helper: put it back.
test.beforeAll(async () => {
  await seedTestHousehold({ accessToken: process.env.HH_STAGING_ACCESS_TOKEN! });
});

test('a job one member marks done is in the history for the other', async ({ page, browser }) => {
  const title = `Test the smoke alarms ${Date.now().toString(36)}`;
  await signInTestUser(page, { email: 'test-a@example.com' });
  await page.getByRole('button', { name: 'Upkeep', exact: true }).click({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Add job' }).click();
  const dialog = page.getByRole('dialog', { name: 'New upkeep job' });
  await dialog.getByLabel('What').fill(title);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('listitem', { name: title })).toBeVisible();

  try {
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
  } finally {
    // Leave the shared household as it was, pass or fail: the job goes (its history entry stays).
    await page.getByRole('button', { name: `Edit ${title}` }).click();
    await page.getByRole('dialog', { name: 'Edit job' }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('listitem', { name: title })).toHaveCount(0);
  }
});

test('a helper marks a member’s job done but is told who can change it', async ({ page, browser }) => {
  const title = `Clean the gutters ${Date.now().toString(36)}`;
  const admin = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const theirs = await admin.newPage();
  try {
    await signInTestUser(theirs, { email: 'test-a@example.com' });
    await theirs.getByRole('button', { name: 'Upkeep', exact: true }).click({ timeout: 20_000 });
    await theirs.getByRole('button', { name: 'Add job' }).click();
    const dialog = theirs.getByRole('dialog', { name: 'New upkeep job' });
    await dialog.getByLabel('What').fill(title);
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(theirs.getByRole('listitem', { name: title })).toBeVisible();

    await signInTestUser(page, { email: 'test-helper@example.com' });
    await page.getByRole('button', { name: 'Upkeep', exact: true }).click({ timeout: 20_000 });
    const job = page.getByRole('listitem', { name: title });
    await expect(job).toBeVisible({ timeout: 20_000 });
    // Refused: no edit on someone else's job, and opening it says who can.
    await expect(page.getByRole('button', { name: `Edit ${title}` })).toHaveCount(0);
    await job.getByRole('button', { name: title, exact: true }).click();
    await expect(page.getByText('Only admins and members can change or delete what someone else added.').first()).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Permitted: ticking it off, which the admin sees in the history.
    await page.getByRole('button', { name: `Mark done: ${title}` }).click();
    await expect(page.getByText(`Done: ${title}. Next due`)).toBeVisible();
    await theirs.getByRole('button', { name: 'History', exact: true }).first().click();
    await expect(theirs.getByRole('listitem', { name: new RegExp(`^${title}, `) })).toBeVisible({ timeout: 20_000 });
  } finally {
    await theirs.getByRole('button', { name: 'Upkeep', exact: true }).click();
    await theirs.getByRole('button', { name: `Edit ${title}` }).click();
    await theirs.getByRole('dialog', { name: 'Edit job' }).getByRole('button', { name: 'Delete' }).click();
    await expect(theirs.getByRole('listitem', { name: title })).toHaveCount(0);
    await admin.close();
  }
});

test('a helper ticks off the thing to do before a regular event, and a member sees it done', async ({ page, browser }) => {
  const title = `Bins ${Date.now().toString(36)}`;
  const prep = `Put the bins out ${Date.now().toString(36)}`;
  const member = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  const theirs = await member.newPage();
  try {
    // Every week from today, with the thing to do before due today at midnight: late all day, so on Needs doing whenever this runs.
    await signInTestUser(theirs, { email: 'test-a@example.com' });
    await theirs.getByRole('button', { name: 'Regular', exact: true }).first().click({ timeout: 20_000 });
    await theirs.getByRole('button', { name: 'Add event' }).click();
    const dialog = theirs.getByRole('dialog', { name: 'New regular event' });
    await dialog.getByLabel('What', { exact: true }).fill(title);
    await dialog.getByRole('checkbox', { name: 'Something to do before each one' }).check();
    await dialog.getByLabel('What to do').fill(prep);
    await dialog.getByRole('button', { name: 'Days before', exact: true }).click();
    await dialog.getByLabel('Days before').selectOption('0');
    await dialog.getByLabel('By').fill('00:00');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(theirs.getByRole('listitem', { name: title })).toBeVisible();
    await theirs.getByRole('button', { name: 'Overview', exact: true }).click();
    const mine = theirs.getByRole('listitem', { name: prep });
    await expect(mine.getByRole('button', { name: `Done: ${prep}` })).toHaveAttribute('aria-pressed', 'false');

    await signInTestUser(page, { email: 'test-helper@example.com' });
    const row = page.getByRole('listitem', { name: prep });
    await expect(row).toContainText('was due today by 12 AM', { timeout: 20_000 });
    await row.getByRole('button', { name: `Done: ${prep}` }).click();
    await expect(row.getByRole('button', { name: `Done: ${prep}` })).toHaveAttribute('aria-pressed', 'true');

    // Saved for the household: the member's own browser shows it done, by the helper.
    await expect(mine.getByRole('button', { name: `Done: ${prep}` })).toHaveAttribute('aria-pressed', 'true', { timeout: 20_000 });
    await expect(mine).toContainText('Done by Test');
    // Undo is the helper's own to make.
    await row.getByRole('button', { name: `Done: ${prep}` }).click();
    await expect(mine.getByRole('button', { name: `Done: ${prep}` })).toHaveAttribute('aria-pressed', 'false', { timeout: 20_000 });
  } finally {
    await theirs.getByRole('button', { name: 'Regular', exact: true }).first().click();
    await theirs.getByRole('button', { name: `Edit the schedule: ${title}` }).click();
    await theirs.getByRole('dialog', { name: 'Edit the schedule' }).getByRole('button', { name: 'Delete' }).click();
    await expect(theirs.getByRole('listitem', { name: title })).toHaveCount(0);
    await member.close();
  }
});
