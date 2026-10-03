import { expect, test, type Page } from '@playwright/test';
import { stubCalendar } from '@huishouden/pwa-kit/e2e';
import { calendarEvents, repeatingEvents } from './fixtures/calendar';

// The sample house (signed out, nothing saved), on Thursday 16 October 2031 at 10:30: garbage went
// out last night, the lawn service comes tomorrow at 9 and the side gate needs unlocking tonight.
test.beforeEach(async ({ page }, info) => {
  if (!info.title.includes('terracotta')) await page.clock.setFixedTime('2031-10-16T10:30:00');
});

const regularTab = (page: Page) => page.getByRole('button', { name: 'Regular', exact: true }).first().click();

test('the thing to do before shows in Needs doing; Done records who and when, and Undo puts it back', async ({ page }) => {
  await page.goto('./');
  const before = page.getByRole('region', { name: 'Upkeep' }).getByRole('list', { name: 'Before regular events' });
  const gate = before.getByRole('listitem', { name: 'Unlock the side gate' });
  await expect(gate).toContainText('Unlock the side gate · tonight by 7 PM');
  await expect(gate).toContainText('For lawn service tomorrow at 9 AM');
  await expect(page.getByRole('region', { name: 'Upkeep' })).toContainText('1 to do soon');

  const done = gate.getByRole('button', { name: 'Done: Unlock the side gate' });
  await expect(done).toHaveAttribute('aria-pressed', 'false');
  await done.click();
  await expect(done).toHaveAttribute('aria-pressed', 'true');
  await expect(gate).toContainText('Done by You at 10:30 AM');
  await expect(page.getByText('Done: Unlock the side gate')).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(done).toHaveAttribute('aria-pressed', 'false');
  await expect(gate).toContainText('tonight by 7 PM');

  // Tapping a done one again undoes it too.
  await done.click();
  await done.click();
  await expect(done).toHaveAttribute('aria-pressed', 'false');
});

test('a thing to do before turns terracotta once late, and says missed after the event begins', async ({ page }) => {
  // The sample's clock starts at 10:30 and runs on from there.
  await page.clock.install({ time: new Date('2031-10-16T10:30:00') });
  await page.goto('./');
  const gate = page.getByRole('listitem', { name: 'Unlock the side gate' });
  await expect(gate).toContainText('tonight by 7 PM');
  await page.clock.fastForward('09:30:00');
  await expect(gate).toContainText('was due tonight by 7 PM');
  await expect(gate.locator('.text-terracotta-dark').first()).toBeVisible();
  await page.clock.fastForward('13:30:00');
  await expect(gate).toContainText('Missed: lawn service was at 9 AM');
});

test('moving one occurrence leaves the schedule alone, and can be put back', async ({ page }) => {
  await page.goto('./');
  await regularTab(page);
  const lawn = page.getByRole('listitem', { name: 'Lawn service' });
  await expect(lawn).toContainText('Every other Friday at 9 AM');
  await lawn.getByRole('button', { name: 'Lawn service, Fri, Oct 31, 9 AM' }).click();

  const dialog = page.getByRole('dialog', { name: 'Lawn service' });
  await dialog.getByRole('button', { name: 'Move this one' }).click();
  await dialog.getByLabel('New day').fill('2031-11-01');
  await dialog.getByLabel('At (optional)').fill('10:00');
  await dialog.getByLabel('Why (optional)').fill('Rain');
  await dialog.getByRole('button', { name: 'Move it' }).click();
  await expect(page.getByText('Moved Lawn service')).toBeVisible();

  const moved = lawn.getByRole('button', { name: 'Lawn service, Sat, Nov 1, 10 AM, moved from Fri, Oct 31' });
  await expect(moved).toBeVisible();
  await expect(lawn).toContainText('Every other Friday at 9 AM');
  await expect(lawn.getByRole('button', { name: 'Lawn service, Fri, Nov 14, 9 AM' })).toBeVisible();

  await moved.click();
  await expect(dialog).toContainText('Moved from Fri, Oct 31');
  await expect(dialog).toContainText('Rain');
  await dialog.getByRole('button', { name: 'Back to Fri, Oct 31' }).click();
  await expect(lawn.getByRole('button', { name: 'Lawn service, Fri, Oct 31, 9 AM' })).toBeVisible();
});

test('skipping one occurrence: the next one is next, and Undo brings it back', async ({ page }) => {
  await page.goto('./');
  await regularTab(page);
  const garbage = page.getByRole('listitem', { name: 'Garbage pickup' });
  await garbage.getByRole('button', { name: 'Garbage pickup, Thu, Oct 23, 7 AM' }).click();
  await page.getByRole('dialog', { name: 'Garbage pickup' }).getByRole('button', { name: 'Skip this one' }).click();
  await expect(garbage.getByRole('button', { name: 'Garbage pickup, Thu, Oct 23, 7 AM, skipped' })).toBeVisible();

  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  const coming = page.getByRole('region', { name: 'Regular events' });
  await expect(coming).toContainText('Lawn service');
  await expect(coming).not.toContainText('Oct 23');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(coming.getByRole('button', { name: 'Garbage pickup · Thu, Oct 23, 7 AM' })).toBeVisible();
});

test('a new event from a preset, with the evening-before task and its reminder', async ({ page }) => {
  await page.goto('./');
  await regularTab(page);
  await page.getByRole('button', { name: 'Add event' }).click();
  const dialog = page.getByRole('dialog', { name: 'New regular event' });
  await dialog.getByRole('button', { name: 'Yard waste', exact: true }).click();
  await expect(dialog.getByLabel('What', { exact: true })).toHaveValue('Yard waste pickup');
  await dialog.getByRole('button', { name: 'Monday' }).click();
  await dialog.getByRole('button', { name: 'Thursday' }).click();
  await expect(dialog).toContainText('Every Monday. Next: Mon, Oct 20 · Mon, Oct 27 · Mon, Nov 3.');
  await expect(dialog.getByLabel('What to do')).toHaveValue('Put the yard waste out');
  await expect(dialog).toContainText('The evening before at 7 PM.');
  await dialog.getByRole('button', { name: 'Save' }).click();

  const row = page.getByRole('listitem', { name: 'Yard waste pickup' });
  await expect(row).toContainText('Every Monday');
  await expect(row).toContainText('Put the yard waste out: the evening before at 7 PM');
  await expect(row.getByRole('button', { name: 'Yard waste pickup, Mon', exact: true })).toBeVisible();
});

test('a repeating garbage day in the calendar is offered as one regular event', async ({ page }) => {
  await stubCalendar(page, { events: [...repeatingEvents] });
  await page.goto('./');
  const card = page.getByRole('region', { name: 'Regular events in your calendar' });
  await expect(card).toContainText('Looks regular: Trash day · Every Thursday at 7 AM');
  // The one-off visit is still offered as a visit; the pickups are not.
  const visits = page.getByRole('region', { name: 'New in your calendar' });
  await expect(visits).toContainText('Lawn aeration');
  await expect(visits).not.toContainText('Trash day');

  await card.getByRole('button', { name: 'Add Trash day' }).click();
  const dialog = page.getByRole('dialog', { name: 'New regular event' });
  await expect(dialog.getByLabel('What', { exact: true })).toHaveValue('Trash day');
  await expect(dialog.getByLabel('Kind')).toHaveValue('trash');
  await expect(dialog.getByLabel('At (optional)')).toHaveValue('07:00');
  await expect(dialog).toContainText('Every Thursday');
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(card).toHaveCount(0);
  await regularTab(page);
  await expect(page.getByRole('listitem', { name: 'Trash day' })).toContainText('Every Thursday at 7 AM');
});

test('Import from calendar offers a repeating pickup as a regular event', async ({ page }) => {
  await stubCalendar(page, { events: [...repeatingEvents, ...calendarEvents.slice(0, 1)] });
  await page.goto('./');
  await page.getByRole('button', { name: 'History', exact: true }).first().click();
  await page.getByRole('button', { name: 'Import from calendar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import from calendar' });
  await expect(dialog.getByRole('list', { name: 'Regular events' })).toContainText('Looks regular: Every Thursday at 7 AM');
  await expect(dialog.getByRole('list', { name: 'Calendar events' })).not.toContainText('Trash day');
  await dialog.getByRole('button', { name: 'Make Trash day a regular event' }).click();
  await expect(page.getByRole('dialog', { name: 'New regular event' }).getByLabel('What', { exact: true })).toHaveValue('Trash day');
});
