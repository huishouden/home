import { expect, test } from '@playwright/test';
import {
  expectCleanLoad,
  expectCompactSampleBanner,
  expectGoogleSignInPopup,
  expectHuishoudenFrame,
  expectInstallable,
  expectSecurityHeaders,
} from '@huishouden/pwa-kit/e2e';

test('loads without runtime errors and shows the sample house', async ({ page }) => {
  await expectCleanLoad(page);
  await expect(page.getByText('Sample data')).toBeVisible();
  await expect(page.getByText('Overdue: gutter cleaning')).toBeVisible();
  await expectHuishoudenFrame(page, { app: 'Home', portalUrl: '/' });
});

test('is installable', ({ page, request }) => expectInstallable(page, request));

test('Google sign-in popup reaches Google with an allowed redirect URI', ({ page, context }) =>
  expectGoogleSignInPopup(page, context, async (p) => {
    await p.getByRole('button', { name: 'Sign in with Google' }).first().click();
  }));

test('link previews describe the app and show its image', async ({ page, request }) => {
  await page.goto('./');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', 'Keeping the house in good shape');
  const image = await page.locator('meta[property="og:image"]').getAttribute('content');
  expect(image).toMatch(/^https:\/\/huishouden-piekstra\.web\.app\/home\/og\.png/);
  expect((await request.get('./og.png')).ok()).toBe(true);
});

test('sends the security headers and leaves sign-in un-framed', ({ request }) => expectSecurityHeaders(request, './', { camera: true }));

test('the Sample data banner is one line on a phone', ({ page }) => expectCompactSampleBanner(page, './'));
