import { expect, test } from '@playwright/test';
import { HELP_PAGES } from '../app/commands/data';
import { countScenes, runCommand, start, turnOnFixture } from './modules';

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

// `pnpm e2e` builds with the test module (DRAFTER_TEST_MODULES=1), so these see a module on.
test('loads and runs a module with no CSP violations', async ({ page }) => {
  await page.addInitScript(() => {
    window.__violations = [];
    document.addEventListener('securitypolicyviolation', (event) =>
      window.__violations.push(`${event.violatedDirective} ${event.blockedURI}`),
    );
  });
  await start(page);
  await turnOnFixture(page);
  await countScenes(page).click();
  await runCommand(page, 'Fixture: add a note');
  await page.waitForLoadState('networkidle');
  expect(await page.evaluate(() => window.__violations)).toEqual([]);
});

test('keeps connect-src to the page’s own origin, which a module’s network origins don’t change', async ({
  request,
}) => {
  const csp = (await request.get('/')).headers()['content-security-policy'];
  expect(csp).toContain("connect-src 'self'");
  expect(csp).not.toContain('example.invalid');
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

// The help pages are prerendered, so their inline scripts (the theme, Nuxt's configuration) are
// hashed into the policy like the app's (scripts/csp.mjs reads every page).
test.describe('the help pages', () => {
  for (const { path, title } of HELP_PAGES) {
    test(`send the content security policy and load with no CSP violations: ${title}`, async ({
      page,
      request,
    }) => {
      const csp = (await request.get(path)).headers()['content-security-policy'];
      expect(csp).toMatch(/^default-src 'self'; script-src 'self'( 'sha256-[^']+')+;/);
      expect(csp).toContain("connect-src 'self'");

      await page.addInitScript(() => {
        window.__violations = [];
        document.addEventListener('securitypolicyviolation', (event) =>
          window.__violations.push(`${event.violatedDirective} ${event.blockedURI}`),
        );
      });
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
      await page.waitForLoadState('networkidle');
      expect(await page.evaluate(() => window.__violations)).toEqual([]);
    });
  }
});
