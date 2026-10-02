import { expect, test } from '@playwright/test';
import { expectCleanLoad, expectGoogleSignInPopup, expectInstallable } from '@huishouden/pwa-kit/e2e';

test('loads without runtime errors and shows the sample house', async ({ page }) => {
  await expectCleanLoad(page);
  await expect(page.getByText('Sample data')).toBeVisible();
  await expect(page.getByText('Overdue: gutter cleaning')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Huishouden home' })).toHaveAttribute('href', 'https://huishouden-piekstra.web.app');
});

test('is installable', ({ page, request }) => expectInstallable(page, request));

test('Google sign-in popup reaches Google with an allowed redirect URI', ({ page, context }) =>
  expectGoogleSignInPopup(page, context, async (p) => {
    await p.getByRole('button', { name: 'Sign in with Google' }).first().click();
  }));
