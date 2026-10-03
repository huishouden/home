import { devices, expect, test } from '@playwright/test';

// On a phone, filling in a dialog: no keyboard until a field is tapped, and once the person has
// moved on to chips and selects further down, nothing sends focus (and the keyboard, and the
// scroll) back to the name. The app re-renders every 15 seconds on its clock; the test runs it on.

const { defaultBrowserType: _, ...pixel } = devices['Pixel 7'];
test.use(pixel);

test('a new job on a phone: focus and scroll stay where the person tapped while the app re-renders', async ({ page }) => {
  await page.clock.install();
  await page.goto('./');
  await page.getByRole('button', { name: 'Upkeep', exact: true }).click();
  await page.getByRole('button', { name: 'Add job' }).click();
  const dialog = page.getByRole('dialog', { name: 'New upkeep job' });
  const name = dialog.getByLabel('What');

  // Opening it pops no keyboard: the dialog holds focus, not a field.
  await expect(dialog).toBeFocused();
  await expect(name).not.toBeFocused();

  await name.tap();
  await name.pressSequentially('Change HVAC filter');
  const chip = dialog.getByRole('button', { name: 'On set dates' });
  await chip.tap();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  const scrolled = () => dialog.evaluate((el) => el.scrollTop);
  const before = await scrolled();

  await page.clock.runFor(46_000); // three clock ticks
  await expect(name).not.toBeFocused();
  expect(await page.evaluate(() => document.activeElement?.closest('input, textarea') === null)).toBe(true);
  expect(await scrolled()).toBe(before);

  const unit = dialog.getByLabel('Unit');
  await unit.tap();
  await unit.selectOption('week');
  await page.clock.runFor(46_000);
  await expect(unit).toBeFocused();
  await expect(name).not.toBeFocused();
  expect(await scrolled()).toBe(before);
  await expect(name).toHaveValue('Change HVAC filter');
});
