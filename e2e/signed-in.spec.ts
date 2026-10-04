import { expect, test } from '@playwright/test';
import { runPortalTodo, useTestHousehold } from '@huishouden/pwa-kit/e2e';
import { personName } from '@huishouden/pwa-kit/people';

// Signed in as the invented people of a household of this run's own (pwa-kit STANDARD.md
// "Staging"), against the real rules: on the emulators (`bun run e2e:emulator`), and on
// staging for what needs the suite's site (@staging) or a kit bump (@smoke).
const hh = useTestHousehold(test);

/** `name`, or on a retry (same household, the first attempt's records still in it) one of the attempt's own. */
const named = (name: string) => (test.info().retry ? `${name} (retry ${test.info().retry})` : name);

test('a job one member marks done is in the history for the other', { tag: '@smoke' }, async ({ browser }) => {
  const title = named('Test the smoke alarms');
  const page = await hh.open(browser, 'admin');
  await page.getByRole('button', { name: 'Upkeep', exact: true }).click({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Add job' }).click();
  const dialog = page.getByRole('dialog', { name: 'New upkeep job' });
  await dialog.getByLabel('What').fill(title);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('listitem', { name: title })).toBeVisible();
  await page.getByRole('button', { name: `Mark ${title} done` }).click();
  await expect(page.getByText(`Done: ${title}. Next due`)).toBeVisible();

  // Saved in the household, not just on this screen: the other member's own browser shows it.
  const theirs = await hh.open(browser, 'member');
  await theirs.getByRole('button', { name: 'History', exact: true }).first().click({ timeout: 20_000 });
  await expect(theirs.getByRole('listitem', { name: new RegExp(`^${title}, `) })).toBeVisible({ timeout: 20_000 });
});

test('a helper marks a member’s job done but is told who can change it', async ({ browser }) => {
  const title = named('Clean the gutters');
  const theirs = await hh.open(browser, 'admin');
  await theirs.getByRole('button', { name: 'Upkeep', exact: true }).click({ timeout: 20_000 });
  await theirs.getByRole('button', { name: 'Add job' }).click();
  const dialog = theirs.getByRole('dialog', { name: 'New upkeep job' });
  await dialog.getByLabel('What').fill(title);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(theirs.getByRole('listitem', { name: title })).toBeVisible();

  const page = await hh.open(browser, 'helper');
  await page.getByRole('button', { name: 'Upkeep', exact: true }).click({ timeout: 20_000 });
  const job = page.getByRole('listitem', { name: title });
  await expect(job).toBeVisible({ timeout: 20_000 });
  // Refused: no edit on someone else's job, and opening it says who can.
  await expect(page.getByRole('button', { name: `Edit ${title}` })).toHaveCount(0);
  await job.getByRole('button', { name: title, exact: true }).click();
  await expect(page.getByText('Only admins and members can change or delete what someone else added.').first()).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Permitted: ticking it off, which the admin sees in the history.
  await page.getByRole('button', { name: `Mark ${title} done` }).click();
  await expect(page.getByText(`Done: ${title}. Next due`)).toBeVisible();
  await theirs.getByRole('button', { name: 'History', exact: true }).first().click();
  await expect(theirs.getByRole('listitem', { name: new RegExp(`^${title}, `) })).toBeVisible({ timeout: 20_000 });
});

test('a helper ticks off the thing to do before a regular event, and a member sees it done', async ({ browser }) => {
  const title = named('Bins');
  const prep = named('Put the bins out');
  // Every week from today, with the thing to do before due today at midnight: late all day, so on Needs doing whenever this runs.
  const theirs = await hh.open(browser, 'member');
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
  const mine = theirs.getByRole('listitem').filter({ hasText: prep });
  await expect(mine.getByRole('button', { name: `Mark ${prep} done` })).toBeVisible();
  await expect(mine.locator('[aria-pressed]')).toHaveCount(0);

  const page = await hh.open(browser, 'helper');
  const row = page.getByRole('listitem').filter({ hasText: prep });
  await expect(row).toContainText('was due today by 12 AM', { timeout: 20_000 });
  await row.getByRole('button', { name: `Mark ${prep} done` }).click();
  // Done, the row folds under All done when nothing else is left to do: wait for one or the other.
  const unfold = async (p: typeof page) => {
    const all = p.getByRole('button', { name: /All done for now/ });
    const undo = p.getByRole('button', { name: `Undo done for ${prep}` });
    await expect(undo.or(all).first()).toBeVisible({ timeout: 20_000 });
    if (!(await undo.isVisible())) await all.click();
  };
  await unfold(page);
  await expect(row.getByRole('button', { name: `Undo done for ${prep}` })).toBeVisible();
  await expect(row.getByRole('button', { name: `Mark ${prep} done` })).toHaveCount(0);

  // Saved for the household: the member's own browser shows it done, by the helper.
  await expect(theirs.getByRole('button', { name: `Mark ${prep} done` })).toHaveCount(0, { timeout: 20_000 });
  await unfold(theirs);
  await expect(mine).toHaveAttribute('data-completion', 'done');
  await expect(mine).toContainText(`Done by ${personName(hh.users.helper.email)}`);
  // Undo is the helper's own to make.
  await row.getByRole('button', { name: `Undo done for ${prep}` }).click();
  await expect(mine.getByRole('button', { name: `Mark ${prep} done` })).toBeVisible({ timeout: 20_000 });
});

test('a landlord imported from a contact card is saved for the household', async ({ browser }) => {
  const name = named('Jordan Example');
  const page = await hh.open(browser, 'admin');
  await page.getByRole('button', { name: 'Contacts', exact: true }).click({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Add contact' }).click();
  const dialog = page.getByRole('dialog', { name: 'New contact' });
  // Signed in, Google Contacts is offered too.
  await expect(dialog.getByRole('button', { name: 'Find in my Google Contacts' })).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await dialog.getByRole('button', { name: 'Import a contact card' }).click();
  await (await chooser).setFiles(new URL('./fixtures/contacts/landlord.vcf', import.meta.url).pathname);
  await expect(dialog.getByLabel('Phone', { exact: true })).toHaveValue('(555) 010-0142');
  await dialog.getByLabel('Name', { exact: true }).fill(name);
  await dialog.getByRole('button', { name: 'Landlord' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();

  const theirs = await hh.open(browser, 'member');
  await theirs.getByRole('button', { name: 'Contacts', exact: true }).click({ timeout: 20_000 });
  const card = theirs.getByRole('region', { name });
  await expect(card).toContainText('Landlord', { timeout: 20_000 });
  await expect(card.getByRole('link', { name: `Call ${name}, (555) 010-0142` })).toBeVisible();
  await expect(card).toContainText('Rent due on the 1st.');
});

// @staging: the portal's To-do list is another app on the suite's site.
test('a job due today is on the portal’s To-do list, and Done there moves it on in Home', { tag: '@staging' }, async ({ browser }) => {
  // Home, the portal, and Home again, with time for the to-do to be published: longer than one screen's test.
  test.setTimeout(150_000);
  const title = named('Descale the kettle');
  const page = await hh.open(browser, 'admin');
  await page.getByRole('button', { name: 'Upkeep', exact: true }).click({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Add job' }).click();
  const dialog = page.getByRole('dialog', { name: 'New upkeep job' });
  await dialog.getByLabel('What').fill(title);
  // Every 3 months from when it's done, not done yet: due today.
  await dialog.getByRole('button', { name: 'Save' }).click();
  const job = page.getByRole('listitem', { name: title });
  await expect(job).toContainText('Due today');

  // Home publishes its to-dos a few seconds after a change: let that land before leaving the page.
  await page.waitForTimeout(8_000);
  await runPortalTodo(page, title);

  await page.goto('./');
  await page.getByRole('button', { name: 'Upkeep', exact: true }).click({ timeout: 20_000 });
  await expect(job).toContainText('Due in 3 months', { timeout: 20_000 });
  await expect(job).toContainText('Done today');
  await page.getByRole('button', { name: 'History', exact: true }).first().click();
  await expect(page.getByRole('listitem', { name: new RegExp(`^${title}, `) })).toBeVisible({ timeout: 20_000 });
});
