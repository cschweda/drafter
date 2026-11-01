#!/usr/bin/env node
// The screenshot sweep of the fresh look (fresh-look design §11): each screen of the app in both
// themes, at 1440×900 and on an iPhone 14, kept as images to look at, not compared by a test.
//
// Run it from apps/web, with the built site served:
//
//   DRAFTER_TEST_MODULES=1 NETLIFY=true pnpm build
//   node scripts/serve.mjs .output/public 4173 &
//   node scripts/ui-shots.mjs <folder> [http://localhost:4173]
//
// It writes `<folder>/<desktop|iphone14>-<dark|light>-<screen>.png`, and `ide-dark.png` and
// `ide-light.png` at twice the pixels, which are the README's screenshots (docs/images). A screen
// that can't be reached is reported and skipped; the rest still go.
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, devices, webkit } from '@playwright/test';

const [folder, base = 'http://localhost:4173'] = process.argv.slice(2);
if (!folder) {
  console.error('Usage: node scripts/ui-shots.mjs <folder> [base-url]');
  process.exit(2);
}
const OUT = resolve(folder);
await mkdir(OUT, { recursive: true });

const THEMES = ['dark', 'light'];
const DEVICES = {
  desktop: { browser: chromium, options: { viewport: { width: 1440, height: 900 } } },
  iphone14: { browser: webkit, options: devices['iPhone 14'] },
};

/**
 * A context in `theme`, as a returning writer: the tour seen, and the recovery copy kept for good
 * (as an installed app's is), so no storage warning covers the screens.
 */
async function context(browser, options, theme, { firstVisit = false, scale } = {}) {
  const ctx = await browser.newContext({
    ...options,
    ...(scale ? { deviceScaleFactor: scale } : {}),
    colorScheme: theme,
    serviceWorkers: 'block',
  });
  await ctx.addInitScript(
    ([t, first]) => {
      localStorage.setItem('nuxt-color-mode', t);
      localStorage.setItem('drafter-storage-toast-v1', 'true');
      if (!first) localStorage.setItem('drafter-tour-v1', 'true');
      if (globalThis.StorageManager) {
        StorageManager.prototype.persisted = async () => true;
        StorageManager.prototype.persist = async () => true;
      }
    },
    [theme, firstVisit],
  );
  return ctx;
}

/** Waits for every finite animation (the menus' and dialogs' one motion) to end. */
const settle = (page) =>
  page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Number.POSITIVE_INFINITY)
        .map((a) => a.finished.catch(() => {})),
    ),
  );

async function open(page) {
  await page.goto(base);
  await page.locator('.cm-content').waitFor({ state: 'attached' });
  await page.waitForTimeout(1200);
}

/** Runs a palette command by its title, from the top bar's search. */
async function run(page, title) {
  await page.getByRole('button', { name: 'Go to scene or command' }).click();
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.locator('input').fill(title);
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await palette.waitFor({ state: 'hidden' });
  await page.waitForTimeout(500);
}

async function closeAll(page) {
  for (let i = 0; i < 3; i++) await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

/** The screens, each from a page showing the sample with nothing open. */
const SCREENS = [
  ['editor', async (page) => page.locator('.cm-content').click()],
  ['outline', (page) => run(page, 'Show Outline')],
  ['cards', (page) => run(page, 'Show Cards')],
  ['notes', (page) => run(page, 'Show Notes')],
  ['problems', (page) => run(page, 'Show Problems')],
  ['stats', (page) => run(page, 'Show stats')],
  [
    'stats-characters',
    async (page) => {
      await run(page, 'Show stats');
      await page
        .locator('#stats-characters, h2:text-is("Characters")')
        .first()
        .scrollIntoViewIfNeeded();
    },
  ],
  [
    'stats-grid',
    async (page) => {
      await run(page, 'Show stats');
      await page.locator('#stats-grid').scrollIntoViewIfNeeded();
    },
  ],
  ['scaffold-scene', (page) => run(page, 'Show Scaffold')],
  [
    'scaffold-character',
    async (page) => {
      await run(page, 'Show the cast');
      await page.getByRole('link', { name: 'MARGARET' }).first().click();
      await page.waitForTimeout(400);
    },
  ],
  [
    'palette',
    async (page) => {
      await page.getByRole('button', { name: 'Go to scene or command' }).click();
      await page.getByRole('dialog', { name: 'Command palette' }).locator('input').fill('show');
      await page.waitForTimeout(300);
    },
  ],
  ['settings', (page) => run(page, 'Settings…')],
  [
    'export-menu',
    async (page) => {
      const bar = page.locator('header.toolbar');
      const button = bar.getByRole('button', { name: 'Export', exact: true });
      if (await button.isVisible()) {
        await button.click();
        return;
      }
      await bar.getByRole('button', { name: 'More actions', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Export', exact: true }).click();
    },
  ],
  ['export-options', (page) => run(page, 'Export options…')],
  ['history', (page) => run(page, 'History…')],
  ['about', (page) => run(page, 'About Drafter')],
  [
    'focus',
    async (page) => {
      await page.locator('.cm-content').click();
      await page.keyboard.press('ControlOrMeta+Shift+F');
      await page.waitForTimeout(500);
    },
  ],
];

let failed = 0;
async function shoot(page, file, prepare) {
  try {
    await prepare(page);
    await settle(page);
    await page.screenshot({ path: `${OUT}/${file}.png` });
    console.log(`  ${file}.png`);
  } catch (error) {
    failed++;
    console.error(`  ${file}: ${error instanceof Error ? error.message.split('\n')[0] : error}`);
  }
}

for (const [name, { browser: type, options }] of Object.entries(DEVICES)) {
  const browser = await type.launch();
  for (const theme of THEMES) {
    console.log(`${name}, ${theme}`);
    for (const [screen, prepare] of SCREENS) {
      const ctx = await context(browser, options, theme);
      const page = await ctx.newPage();
      await open(page);
      await shoot(page, `${name}-${theme}-${screen}`, prepare);
      await ctx.close();
    }
    // A first visit: the welcome, then the tour's intro card and its first step.
    const ctx = await context(browser, options, theme, { firstVisit: true });
    const page = await ctx.newPage();
    await open(page);
    const welcome = page.getByRole('alertdialog', { name: /Welcome to Drafter/ });
    await shoot(page, `${name}-${theme}-welcome`, () => welcome.waitFor());
    await shoot(page, `${name}-${theme}-tour`, async () => {
      await welcome.getByRole('button', { name: 'Take the tour' }).click();
      await page.waitForTimeout(400);
      const intro = page.getByRole('dialog', { name: 'Fountain in 30 seconds' });
      await intro
        .getByRole('button', { name: /Start|Next|Begin/ })
        .last()
        .click();
      await page.locator('.tour-dialog').waitFor();
      await page.waitForTimeout(400);
    });
    await ctx.close();
    await closeAll(page).catch(() => {});
  }
  await browser.close();
}

// The README's screenshots: a scene in both panes, at twice the pixels.
{
  const browser = await chromium.launch();
  for (const theme of THEMES) {
    const ctx = await context(browser, DEVICES.desktop.options, theme, { scale: 2 });
    const page = await ctx.newPage();
    await open(page);
    await shoot(page, `ide-${theme}`, async () => {
      // The palette goes to the scene and leaves the cursor at its heading, in the editor; the
      // heading is then scrolled to the top, and sync scrolling brings the page along.
      await run(page, 'INT. KITCHEN');
      await page.evaluate(() => {
        const scroller = document.querySelector('.cm-scroller');
        const heading = document.querySelector('.cm-line.cm-f-scene_heading');
        if (!scroller || !heading) return;
        const top = heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        scroller.scrollTop += top - 24;
      });
      await page.waitForTimeout(1200);
    });
    await ctx.close();
  }
  await browser.close();
}

console.log(failed ? `${failed} screen(s) couldn't be taken.` : `Done: ${OUT}`);
process.exitCode = failed ? 1 : 0;
