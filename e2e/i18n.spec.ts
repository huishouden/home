import { expect, test } from '@playwright/test';
import { expectLocalized, useLanguage } from '@huishouden/pwa-kit/e2e';
import es from '../src/locales/es.json' with { type: 'json' };
import nl from '../src/locales/nl.json' with { type: 'json' };

// The signed-out sample house in Spanish and Dutch: Home's own chrome and the kit's, no English left.
// Job, visit and appliance names are sample data and stay as entered.
const fixedTime = '2031-10-16T10:30:00';
const ENGLISH = ['Overview', 'Upkeep', 'Regular', 'History', 'Warranties', 'All jobs', 'Coming up', 'Booked visits', 'Spent in', 'Add job', 'Next two weeks', 'Paused'];

for (const [lang, messages] of [
  ['es', es],
  ['nl', nl],
] as const) {
  test(`the sample house in ${lang}`, async ({ page }) => {
    await page.clock.setFixedTime(fixedTime);
    await expectLocalized(page, lang, { words: ENGLISH });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(messages['app.name']);
    await expect(page.getByRole('region', { name: messages['history.bookedVisits'] })).toBeVisible();

    // The upkeep list, then a new job in that language.
    await page.getByRole('button', { name: messages['tab.upkeep'], exact: true }).first().click();
    await expect(page.getByRole('heading', { name: messages['upkeep.nextTwoWeeks'] })).toBeVisible();
    await page.getByRole('button', { name: messages['upkeep.addJob'] }).click();
    const dialog = page.getByRole('dialog', { name: messages['taskDialog.titleAdd'] });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: messages['taskDialog.fixed'] })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
    await expect(dialog).not.toContainText('When was it last done?');
  });
}

test('a new regular event starts from a preset in the reader’s language', async ({ page }) => {
  await page.clock.setFixedTime(fixedTime);
  await useLanguage(page, 'es');
  await page.goto('./#regular', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: es['regular.addEvent'] }).click();
  const dialog = page.getByRole('dialog', { name: es['eventDialog.titleAdd'] });
  await dialog.getByRole('button', { name: es['preset.trash'], exact: true }).click();
  await expect(dialog.getByLabel(es['form.what'], { exact: true })).toHaveValue(es['preset.trashTitle']);
  await expect.poll(() => dialog.locator('input').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value))).toContain(es['prep.trash']);
  await expect(dialog).not.toContainText('p.m..');
});
