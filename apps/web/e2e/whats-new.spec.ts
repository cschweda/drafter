import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { WHATS_NEW_SEEN } from '../app/whats-new/banner';
import { WHATS_NEW } from '../app/whats-new/entries';
import { drafterDatabase, sampleSeenRows } from './seed';

// What is Drafter?, What's new, and What's new's banner on the writing screen (docs/DECISIONS.md,
// What is Drafter? and What's new). The other help-page checks (prerendered, the content security
// policy, offline) cover these two pages with the rest, from HELP_PAGES, and a11y.spec.ts runs axe
// on them; axe on the banner is here.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const THEMES = ['dark', 'light'] as const;
type Theme = (typeof THEMES)[number];

const port = Number(process.env.E2E_PORT ?? 4173);
/** The counts the What is Drafter? page shows (scripts/test-counts.mjs). */
const counts = JSON.parse(
  readFileSync(new URL('../app/about/test-counts.json', import.meta.url), 'utf8'),
) as { version: string; e2e: { web: number }; trap: { traps: number } };
const NEWEST = WHATS_NEW.find((entry) => entry.banner);
if (!NEWEST) throw new Error('No What’s new entry is marked for the banner.');
const BANNER_IDS = WHATS_NEW.filter((entry) => entry.banner).map((entry) => entry.id);

// The browser tests' storage state (playwright.config.ts) without What's new's "seen" note, so the
// banner behaves as it does for a writer.
test.use({
  storageState: {
    cookies: [],
    origins: [
      {
        origin: `http://localhost:${port}`,
        localStorage: [
          { name: 'drafter-tour-v1', value: 'true' },
          { name: 'drafter-storage-toast-v1', value: 'true' },
          { name: 'nuxt-color-mode', value: 'dark' },
        ],
        indexedDB: [drafterDatabase(sampleSeenRows)],
      },
    ],
  },
});

const editor = (page: Page) => page.locator('.cm-content');
const banner = (page: Page) => page.locator('[data-whats-new]');
const region = (page: Page) => page.locator('[data-whats-new-region]');

async function violations(page: Page, include?: string) {
  let builder = new AxeBuilder({ page }).withTags(WCAG);
  if (include) builder = builder.include(include);
  const { violations } = await builder.analyze();
  return violations.map(({ id, nodes }) => `${id}: ${nodes.map((n) => n.target).join(', ')}`);
}

async function useTheme(page: Page, theme: Theme) {
  await page.addInitScript((t) => localStorage.setItem('nuxt-color-mode', t), theme);
}

/** Opens the app and waits until the script is open (and the first visit's answer is in). */
async function open(page: Page) {
  await page.goto('/');
  await expect(editor(page)).toContainText('INT. KITCHEN - NIGHT');
  await expect(page.locator('[data-tour="status"]')).toBeAttached();
}

/** What this browser remembers seeing. */
const seen = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '[]') as string[], WHATS_NEW_SEEN);

/** A returning visit that hasn't seen the newest banner entry: the first visit, then its note forgotten. */
async function returning(page: Page) {
  await open(page);
  // The first visit has marked every entry seen (once its script is stored), before it's forgotten.
  await expect.poll(() => seen(page)).toContain(NEWEST.id);
  await page.evaluate((key) => localStorage.removeItem(key), WHATS_NEW_SEEN);
  await page.reload();
  await expect(editor(page)).toContainText('INT. KITCHEN - NIGHT');
  await expect(banner(page)).toBeVisible();
}

test.describe('the What’s new banner', () => {
  test('stays hidden on a first visit, which marks every entry seen', async ({ page }) => {
    await open(page);
    await expect.poll(() => seen(page)).toEqual(expect.arrayContaining(BANNER_IDS));
    await expect(banner(page)).toHaveCount(0);
    await page.reload();
    await expect(editor(page)).toContainText('INT. KITCHEN - NIGHT');
    await expect(banner(page)).toHaveCount(0);
  });

  test('shows the newest big change once, in one line, and stays dismissed', async ({ page }) => {
    await returning(page);
    await expect(banner(page)).toHaveAttribute('data-whats-new', NEWEST.id);
    await expect(banner(page)).toContainText(NEWEST.kind);
    await expect(banner(page)).toContainText(NEWEST.title);
    await expect(banner(page).getByRole('link', { name: 'What’s new' })).toHaveAttribute(
      'href',
      `/docs/whats-new/#${NEWEST.id}`,
    );
    // A polite status, said once, that took no focus.
    await expect(region(page)).toHaveAttribute('role', 'status');
    await expect(page.getByRole('status').filter({ hasText: NEWEST.title })).toHaveCount(1);
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-whats-new]'))).toBe(
      false,
    );
    // One line, and only one.
    await expect(page.locator('[data-whats-new]')).toHaveCount(1);
    const box = await banner(page).boundingBox();
    expect(box?.height ?? 0).toBeLessThanOrEqual(40);

    await banner(page)
      .getByRole('button', { name: `Dismiss: ${NEWEST.title}` })
      .click();
    await expect(banner(page)).toHaveCount(0);
    expect(await seen(page)).toEqual(expect.arrayContaining(BANNER_IDS));
    await page.reload();
    await expect(editor(page)).toContainText('INT. KITCHEN - NIGHT');
    await expect(banner(page)).toHaveCount(0);
  });

  test('is dismissed from the keyboard with Escape', async ({ page }) => {
    await returning(page);
    await banner(page).getByRole('link', { name: 'What’s new' }).focus();
    await page.keyboard.press('Escape');
    await expect(banner(page)).toHaveCount(0);
    expect(await seen(page)).toContain(NEWEST.id);
  });

  test('opens What’s new in a new tab, and counts as seen', async ({ page, context }) => {
    await returning(page);
    const [tab] = await Promise.all([
      context.waitForEvent('page'),
      banner(page).getByRole('link', { name: 'What’s new' }).click(),
    ]);
    await tab.waitForLoadState();
    expect(new URL(tab.url()).pathname).toBe('/docs/whats-new/');
    await expect(tab.getByRole('heading', { level: 1 })).toHaveText('What’s new');
    await expect(banner(page)).toHaveCount(0);
  });

  test('is hidden in focus mode, and back after it', async ({ page }) => {
    await returning(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+Shift+Enter');
    await expect(page.locator('[data-focus-layout]')).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-focus-layout]')).toHaveCount(0);
    await expect(banner(page)).toBeVisible();
  });

  test('waits while the update prompt is showing, so the two never stack', async ({ page }) => {
    // A registration whose update finds a new version, waiting (as alerts.spec.ts has it).
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
    await returning(page);
    await page.keyboard.press('ControlOrMeta+k');
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await palette.locator('input').fill('Check for updates');
    await palette.getByRole('option', { name: 'Check for updates…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Check for updates' });
    await expect(dialog.getByRole('button', { name: 'Reload' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    const offer = page.locator('[data-update]');
    await expect(offer).toBeVisible();
    await expect(banner(page)).toHaveCount(0);
    await offer.getByRole('button', { name: 'Later' }).click();
    await expect(offer).toHaveCount(0);
    await expect(banner(page)).toBeVisible();
  });

  test('sits in the page’s flow, above the editor, without covering its text', async ({ page }) => {
    await returning(page);
    const box = await banner(page).boundingBox();
    const text = await editor(page).boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(text).not.toBeNull();
    if (!box || !text || !viewport) return;
    expect(box.y + box.height).toBeLessThanOrEqual(text.y + 1);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    // Nothing scrolls sideways, on a phone too.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });

  for (const theme of THEMES) {
    test(`has no accessibility violations (${theme})`, async ({ page }) => {
      await useTheme(page, theme);
      await returning(page);
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
      await page.evaluate(() =>
        Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))),
      );
      expect(await violations(page, '[data-whats-new-region]')).toEqual([]);
    });
  }
});

test.describe('What is Drafter?', () => {
  test('jumps to each section from the list at the top', async ({ page }) => {
    await page.goto('/docs/what-is-drafter/');
    const jump = page.getByRole('navigation', { name: 'On this page' });
    const links = jump.getByRole('link');
    await expect(links).toHaveCount(5);
    for (const [index, id] of [
      'one-minute',
      'writers',
      'industry',
      'trust',
      'technical',
    ].entries()) {
      const link = links.nth(index);
      await expect(link).toHaveAttribute('href', `#${id}`);
      await link.click();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      await expect(page.locator(`h2#${id}`)).toBeInViewport();
      await page.evaluate(() => window.scrollTo(0, 0));
    }
  });

  test('shows the test counts, as of the release they were counted for', async ({ page }) => {
    await page.goto('/docs/what-is-drafter/');
    const numbers = page.locator('[data-test-counts]');
    await expect(page.locator('main')).toContainText(`As of Drafter ${counts.version}`);
    await expect(numbers).toContainText(`${counts.trap.traps} trap documents`);
    await expect(numbers).toContainText(
      `${String(counts.e2e.web).replace(/\B(?=(\d{3})+(?!\d))/g, ',')} browser tests`,
    );
  });

  for (const theme of THEMES) {
    test(`draws each diagram for the ${theme} theme, with words for a screen reader`, async ({
      page,
    }) => {
      await useTheme(page, theme);
      await page.goto('/docs/what-is-drafter/#how-it-works');
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
      const figures = page.locator('figure.diagram');
      await expect(figures).toHaveCount(4);
      for (const figure of await figures.all()) {
        const shown = figure.locator(`img.diagram-${theme}`);
        const hidden = figure.locator(`img.diagram-${theme === 'dark' ? 'light' : 'dark'}`);
        await shown.scrollIntoViewIfNeeded();
        await expect(shown).toBeVisible();
        await expect(hidden).toBeHidden();
        expect((await shown.getAttribute('alt'))?.length ?? 0).toBeGreaterThan(100);
        await expect
          .poll(() => shown.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
          .toBeGreaterThan(0);
      }
      // One image per diagram reaches the accessibility tree.
      await expect(page.getByRole('img')).toHaveCount(4);
    });
  }

  test('links the comparison on Why Drafter, which links back', async ({ page }) => {
    await page.goto('/docs/what-is-drafter/');
    await expect(
      page.locator('#writers').locator('..').getByRole('link', { name: 'How Drafter compares' }),
    ).toHaveAttribute('href', '/docs/why/#compares');
    await page.goto('/docs/why/');
    await expect(page.getByRole('link', { name: 'What is Drafter?' }).first()).toBeVisible();
    await expect(page.locator('#compares')).toBeAttached();
  });
});

test.describe('What’s new', () => {
  test('lists every release, newest first, with each entry', async ({ page }) => {
    await page.goto('/docs/whats-new/');
    const versions = [...new Set(WHATS_NEW.map((entry) => entry.version))];
    const headings = page.locator('main h2');
    await expect(headings).toHaveCount(versions.length);
    expect((await headings.allTextContents()).map((t) => t.match(/\d+\.\d+\.\d+/)?.[0])).toEqual(
      versions,
    );
    for (const entry of WHATS_NEW) {
      const item = page.locator(`li[id="${entry.id}"]`);
      await expect(item, entry.id).toContainText(entry.title);
      await expect(item, entry.id).toContainText(entry.kind);
    }
  });

  test('fits a phone without scrolling sideways', async ({ page }) => {
    for (const path of ['/docs/whats-new/', '/docs/what-is-drafter/']) {
      await page.goto(path);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        path,
      ).toBe(true);
    }
  });
});
