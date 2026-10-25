import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __violations: string[];
    __firstTheme?: { className: string; bodyExists: boolean };
  }
}

test('sends the content security policy', async ({ request }) => {
  const csp = (await request.get('/')).headers()['content-security-policy'];
  expect(csp).toMatch(/^default-src 'self'; script-src 'self'( 'sha256-[^']+')+;/);
});

test('loads with no CSP violations', async ({ page }) => {
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', (event) =>
      window.__violations.push(`${event.violatedDirective} ${event.blockedURI}`),
    );
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(await page.evaluate(() => window.__violations)).toEqual([]);
});

test('restores the light theme before the page body exists', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('nuxt-color-mode', 'light');
    // Chromium and WebKit run this before <html> exists, so watch the whole
    // document for the first class set on the root element.
    new MutationObserver((records, observer) => {
      if (!records.some((record) => record.target === document.documentElement)) return;
      window.__firstTheme = {
        className: document.documentElement.className,
        bodyExists: !!document.body,
      };
      observer.disconnect();
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
  });
  await page.goto('/');
  expect(await page.evaluate(() => window.__firstTheme)).toEqual({
    className: expect.stringMatching(/\blight\b/),
    bodyExists: false,
  });
});
