import { expect, type Page, test } from '@playwright/test';

// While Drafter starts (the SPA loading screen, before the app mounts), the mark moves so a slow
// start doesn't look frozen; after 3 s it says "Loading Drafter…", and after 15 s it suggests
// checking the connection. CSS alone does it, so the content security policy has nothing to allow.

const boot = (page: Page) => page.locator('.drafter-boot');
const mark = (page: Page) => page.locator('.drafter-boot-mark');
const loading = (page: Page) => page.getByText('Loading Drafter…');
const slow = (page: Page) => page.getByText('Taking longer than usual. Try reloading.');

/** Holds the app's scripts until `release` is called, so the loading screen stays up. */
async function holdTheApp(page: Page): Promise<() => void> {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/_nuxt/*.js', async (route) => {
    await held;
    await route.continue();
  });
  return release;
}

/** The mark's animations that are running. */
const running = (page: Page) =>
  mark(page).evaluate(
    (el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
  );

test('the mark moves while the app loads, the words come when it is slow, and all go once it is ready', async ({
  page,
}) => {
  const release = await holdTheApp(page);
  await page.goto('/', { waitUntil: 'commit' });
  await expect(mark(page)).toBeVisible();
  expect(await running(page)).toBeGreaterThan(0);

  // Nothing is said at first; "Loading Drafter…" after three seconds.
  await expect(loading(page)).toBeHidden();
  await expect(loading(page)).toBeVisible({ timeout: 6000 });
  await expect(page.getByRole('status').filter({ hasText: 'Loading Drafter…' })).toHaveCount(1);
  await expect(slow(page)).toBeHidden();

  // Fifteen seconds in (the clock of its CSS animation moved on), the hint.
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      if ((animation as CSSAnimation).animationName === 'drafter-boot-show') {
        animation.currentTime = 16_000;
      }
    }
  });
  await expect(slow(page)).toBeVisible();

  // The app arrives: the loading screen goes, and the editor shows text at once (no empty shell).
  release();
  await expect(page.locator('.cm-content')).toBeAttached({ timeout: 15_000 });
  await expect(boot(page)).toHaveCount(0);
  await expect(page.locator('.cm-content')).not.toHaveText('');
  await expect(loading(page)).toHaveCount(0);
});

test('stands still under reduced motion, and still says it is loading', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const release = await holdTheApp(page);
  await page.goto('/', { waitUntil: 'commit' });
  await expect(mark(page)).toBeVisible();
  expect(await running(page)).toBe(0);
  expect(await mark(page).evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  await expect(loading(page)).toBeVisible({ timeout: 6000 });
  release();
  await expect(boot(page)).toHaveCount(0, { timeout: 15_000 });
});

test('follows the stored theme', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('nuxt-color-mode', 'light'));
  const release = await holdTheApp(page);
  await page.goto('/', { waitUntil: 'commit' });
  await expect(boot(page)).toHaveCSS('background-color', 'rgb(244, 244, 242)');
  release();
  await expect(boot(page)).toHaveCount(0, { timeout: 15_000 });
});
