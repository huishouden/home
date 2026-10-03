import { expect, test } from '@playwright/test';
import { runPortalTodo, signInTestUser } from '@huishouden/pwa-kit/e2e';
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

test('a landlord imported from a contact card is saved for the household', async ({ page, browser }) => {
  const name = `Jordan Example ${Date.now().toString(36)}`;
  await signInTestUser(page, { email: 'test-a@example.com' });
  await page.getByRole('button', { name: 'Contacts', exact: true }).click({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Add contact' }).click();
  const dialog = page.getByRole('dialog', { name: 'New contact' });
  // Signed in, Google Contacts is offered too.
  await expect(dialog.getByRole('button', { name: 'Find in my Google Contacts' })).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Import a contact card' }).click();
  await (await chooser).setFiles(new URL('./fixtures/contacts/landlord.vcf', import.meta.url).pathname);
  await expect(dialog.getByLabel('Phone', { exact: true })).toHaveValue('(555) 010-0142');
  // Other runs share the household: a name of this run's own.
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Landlord' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();

  try {
    const other = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    try {
      const theirs = await other.newPage();
      await signInTestUser(theirs, { email: 'test-b@example.com' });
      await theirs.getByRole('button', { name: 'Contacts', exact: true }).click({ timeout: 20_000 });
      const card = theirs.getByRole('region', { name });
      await expect(card).toContainText('Landlord', { timeout: 20_000 });
      await expect(card.getByRole('link', { name: `Call ${name}, (555) 010-0142` })).toBeVisible();
      await expect(card).toContainText('Rent due on the 1st.');
    } finally {
      await other.close();
    }
  } finally {
    await page.getByRole('button', { name: `Delete ${name}` }).click();
    await expect(page.getByRole('region', { name })).toHaveCount(0);
  }
});

test('a job due today is on the portal’s To-do list, and Done there moves it on in Home', async ({ page }) => {
  // Home, the portal, and Home again, with time for the to-do to be published: longer than one screen's test.
  test.setTimeout(150_000);
  const title = `Descale the kettle ${Date.now().toString(36)}`;
  await signInTestUser(page, { email: 'test-a@example.com' });
  await page.getByRole('button', { name: 'Upkeep', exact: true }).click({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Upkeep' })).toBeVisible();
  // A run cut short leaves its job behind: clear those first.
  const leftover = page.getByRole('listitem', { name: /^Descale the kettle / });
  await page.waitForTimeout(3_000);
  while ((await leftover.count()) > 0) {
    const name = await leftover.first().getAttribute('aria-label');
    await page.getByRole('button', { name: `Edit ${name}` }).click();
    await page.getByRole('dialog', { name: 'Edit job' }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('listitem', { name: name!, exact: true })).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Add job' }).click();
  const dialog = page.getByRole('dialog', { name: 'New upkeep job' });
  await dialog.getByLabel('What').fill(title);
  // Every 3 months from when it's done, not done yet: due today.
  await dialog.getByRole('button', { name: 'Save' }).click();
  const job = page.getByRole('listitem', { name: title });
  await expect(job).toContainText('Due today');

  try {
    // Home publishes its to-dos a few seconds after a change: let that land before leaving the page.
    await page.waitForTimeout(8_000);
    await runPortalTodo(page, title);

    await page.goto('./');
    await page.getByRole('button', { name: 'Upkeep', exact: true }).click({ timeout: 20_000 });
    await expect(job).toContainText('Due in 3 months', { timeout: 20_000 });
    await expect(job).toContainText('Done today');
    await page.getByRole('button', { name: 'History', exact: true }).first().click();
    await expect(page.getByRole('listitem', { name: new RegExp(`^${title}, `) })).toBeVisible({ timeout: 20_000 });
  } finally {
    // Leave the shared household as it was, pass or fail: the history entry (if any) and the job.
    await page.goto('./');
    await page.getByRole('button', { name: 'History', exact: true }).first().click({ timeout: 20_000 });
    const entry = page.getByRole('listitem', { name: new RegExp(`^${title}, `) });
    if (await entry.count()) {
      await entry.getByRole('button', { name: `Edit ${title}` }).click();
      await page.getByRole('dialog', { name: 'Edit entry' }).getByRole('button', { name: 'Delete' }).click();
      await expect(entry).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Upkeep', exact: true }).click();
    await page.getByRole('button', { name: `Edit ${title}` }).click();
    await page.getByRole('dialog', { name: 'Edit job' }).getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('listitem', { name: title })).toHaveCount(0);
  }
});
