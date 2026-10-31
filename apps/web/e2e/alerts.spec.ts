import AxeBuilder from '@axe-core/playwright';
import { type BrowserContext, expect, type Locator, type Page, test } from '@playwright/test';

// The alerts' tones (fresh-look Task 3b; the maintainer, 2026-10-31: "nothing blaring"): a caution
// (the recovery copy may be cleared, a read-only tab, an update waiting) is a quiet amber, an error
// (no recovery copy at all) a quiet red. A tinted background, a 3px edge in the hue, the text still
// --text, the dismiss button's icon in the hue, and axe clean in both themes.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const THEMES = ['dark', 'light'] as const;
type Theme = (typeof THEMES)[number];

const editor = (page: Page) => page.locator('.cm-content');

async function useTheme(page: Page | BrowserContext, theme: Theme) {
  await page.addInitScript((t) => localStorage.setItem('nuxt-color-mode', t), theme);
}

/** A token's colour as the browser computes it, in the page's theme. */
function token(page: Page, name: string): Promise<string> {
  return page.evaluate((n) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${n})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, name);
}

/** axe on one element (and what is inside it), after any fade has finished. */
async function clean(page: Page, selector: string, state: string) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
  const { violations } = await new AxeBuilder({ page }).include(selector).withTags(WCAG).analyze();
  expect(
    violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`),
    state,
  ).toEqual([]);
}

/** The tone drawn on `box`: its tint, its 3px edge in the hue, and its text in --text. */
async function expectTone(page: Page, box: Locator, tone: 'warn' | 'danger') {
  await expect(box).toHaveClass(new RegExp(`\\btone-${tone}\\b`));
  await expect(box).toHaveCSS('background-color', await token(page, `--${tone}-bg`));
  await expect(box).toHaveCSS('border-left-width', '3px');
  await expect(box).toHaveCSS('border-left-color', await token(page, `--${tone}-border`));
  await expect(box).toHaveCSS('color', await token(page, '--text'));
}

async function stubPersistence(page: Page) {
  await page.addInitScript(() => {
    localStorage.removeItem('drafter-storage-toast-v1');
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persisted: async () => false, persist: async () => false },
    });
  });
}

async function breakIndexedDb(page: Page) {
  await page.addInitScript(() => {
    indexedDB.open = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
  });
}

/** A registration whose update finds a new version, waiting. */
async function waitingWorker(page: Page) {
  await page.addInitScript(() => {
    let waiting: unknown = null;
    const registration = {
      installing: null,
      get waiting() {
        return waiting;
      },
      async update() {
        waiting = { state: 'installed' };
      },
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: null,
        register: () => Promise.reject(new Error('No worker in this test.')),
        getRegistration: async () => registration,
        addEventListener() {},
        removeEventListener() {},
      },
    });
  });
}

for (const theme of THEMES) {
  test.describe(`the alerts in the ${theme} theme`, () => {
    test(`the "may be cleared" toast is a caution, with its dismiss in the hue (${theme})`, async ({
      page,
    }) => {
      await useTheme(page, theme);
      await stubPersistence(page);
      await page.goto('/');
      const toast = page.locator('[data-warning="not-persistent"]');
      await expect(toast).toBeVisible();
      await expectTone(page, toast, 'warn');
      const dismiss = toast.getByRole('button', { name: 'Dismiss' });
      await expect(dismiss).toHaveCSS('color', await token(page, '--warn'));
      await expect(toast.locator('[data-slot="icon"]')).toHaveCSS(
        'color',
        await token(page, '--warn'),
      );
      await clean(page, '[data-warning="not-persistent"]', 'the may-be-cleared toast');
    });

    test(`"unavailable" is an error (${theme})`, async ({ page }) => {
      await useTheme(page, theme);
      await breakIndexedDb(page);
      await page.goto('/');
      const alert = page.locator('[data-warning="unavailable"]');
      await expect(alert).toContainText('only in memory');
      await expectTone(page, alert, 'danger');
      await clean(page, '[data-warning="unavailable"]', 'the unavailable alert');
    });

    test(`the read-only bar is a caution (${theme})`, async ({ context }) => {
      await useTheme(context, theme);
      const first = await context.newPage();
      await first.goto('/');
      await expect(editor(first)).toContainText('The Call');
      const second = await context.newPage();
      await second.goto('/');
      await expect(
        second.getByText('This script is open for editing in another tab'),
      ).toBeVisible();
      const bar = second.locator('.bar', { hasText: 'This script is open for editing' });
      await expectTone(second, bar, 'warn');
      await clean(second, '.bar.tone-warn', 'the read-only bar');
    });

    test(`the update offer is a caution (${theme})`, async ({ page }) => {
      await useTheme(page, theme);
      await waitingWorker(page);
      await page.goto('/');
      await expect(editor(page)).toContainText('The Call');
      await page.keyboard.press('ControlOrMeta+k');
      const palette = page.getByRole('dialog', { name: 'Command palette' });
      await palette.locator('input').fill('Check for updates');
      await palette.getByRole('option', { name: 'Check for updates…' }).click();
      const dialog = page.getByRole('dialog', { name: 'Check for updates' });
      await expect(dialog.getByRole('button', { name: 'Reload' })).toBeVisible();
      await dialog.getByRole('button', { name: 'Close' }).click();
      const offer = page.locator('[data-update]');
      await expect(offer).toBeVisible();
      await expectTone(page, offer, 'warn');
      await clean(page, '[data-update]', 'the update offer');
    });
  });
}
