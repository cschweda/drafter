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
// `ide-light.png` at twice the pixels. A screen that can't be reached is reported and skipped; the
// rest still go.
//
// With `--readme`, it takes only the README's screenshots, into `<folder>` (docs/images from the
// repository root): `drafter-<shot>-<dark|light>.png` for the editor and the page at twice the
// pixels, Outline, Cards, the Stats grid, a Scaffold character page, Compare, and a phone, and
// `drafter-pdf-page.png`, the sample's first script page as the PDF prints it (it needs the CLI
// built, `pnpm -r build`, and pdftoppm). Each is squeezed with pngquant when it is installed, to
// keep it under about 400 KB. Every shot uses Drafter's own sample, "The Call".
import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { chromium, devices, webkit } from '@playwright/test';

const args = process.argv.slice(2);
const README = args.includes('--readme');
const [folder, base = 'http://localhost:4173'] = args.filter((a) => a !== '--readme');
if (!folder) {
  console.error('Usage: node scripts/ui-shots.mjs <folder> [base-url] [--readme]');
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
      // Focus mode's key (commands/data.ts): Mod-Shift-Enter.
      await page.keyboard.press('ControlOrMeta+Shift+Enter');
      await page.getByRole('group', { name: 'Focus mode' }).waitFor();
      await page.waitForTimeout(500);
    },
  ],
];

let failed = 0;
const run$ = promisify(execFile);

/** Squeezes a PNG with pngquant, when it is installed; a PNG it can't shrink is left as it is. */
async function squeeze(file) {
  try {
    await run$('pngquant', [
      '--force',
      '--skip-if-larger',
      '--quality',
      '70-95',
      '--ext',
      '.png',
      file,
    ]);
  } catch (error) {
    // 98 and 99 are pngquant's "not smaller" and "quality too low": the file stays as it was.
    if (error?.code === 'ENOENT') console.warn('  (pngquant is not installed; not squeezed)');
  }
  const { size } = await stat(file);
  if (size > 400 * 1024) console.warn(`  ${file} is ${Math.round(size / 1024)} KB`);
}

/** The view behind the editor, for a change made as typing would make it. */
const replaceInSource = (page, find, insert) =>
  page.evaluate(
    ([f, i]) => {
      const content = document.querySelector('.cm-content');
      const view = (content?.cmTile ?? content?.cmView)?.view;
      const from = view?.state.doc.toString().indexOf(f) ?? -1;
      if (!view || from < 0) throw new Error(`not in the source: ${f}`);
      view.dispatch({ changes: { from, to: from + f.length, insert: i } });
    },
    [find, insert],
  );

/** Scrolls the editor so the line holding `text` sits near the top; sync scrolling follows. */
const scrollSourceTo = (page, selector) =>
  page.evaluate((sel) => {
    const scroller = document.querySelector('.cm-scroller');
    const line = document.querySelector(sel);
    if (!scroller || !line) return;
    const top = line.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
    scroller.scrollTop += top - 24;
  }, selector);

/** The README's screenshots (see the top of this file). */
async function readmeShots() {
  const GALLERY = [
    ['outline', (page) => run(page, 'Show Outline')],
    ['cards', (page) => run(page, 'Show Cards')],
    [
      'stats',
      async (page) => {
        await run(page, 'Show stats');
        await page.locator('#stats-grid').scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
      },
    ],
    [
      'scaffold',
      async (page) => {
        await run(page, 'Show the cast');
        await page.getByRole('link', { name: 'MARGARET' }).first().click();
        await page.waitForTimeout(400);
      },
    ],
    [
      'compare',
      async (page) => {
        // A sample keeps no snapshots, so the sample's text goes into a new script of one's own
        // first. Then a snapshot, a few changed lines, and Compare with now (History's newest).
        const sample = await readFile(
          resolve(import.meta.dirname, '../../../samples/screenplay.fountain'),
          'utf8',
        );
        await page
          .getByRole('banner')
          .getByRole('button', { name: 'Sample: start your own' })
          .click();
        await page.getByRole('menu').getByRole('menuitem', { name: 'New screenplay' }).click();
        await page.locator('.cm-content').filter({ hasText: 'Title:' }).waitFor();
        await page.evaluate((text) => {
          const content = document.querySelector('.cm-content');
          const view = (content?.cmTile ?? content?.cmView)?.view;
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
        }, sample);
        await page.waitForTimeout(600);
        await run(page, 'Take snapshot…');
        const history = page.getByRole('dialog', { name: 'History' });
        await history.getByRole('textbox', { name: 'Label' }).fill('First draft');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(300);
        await history.getByRole('button', { name: 'Close' }).click();
        await history.waitFor({ state: 'hidden' });
        await replaceInSource(
          page,
          'She scrapes the plate into the trash and sets it in the sink harder than she needs to.',
          'She scrapes the plate into the trash. The fork goes in too. She leaves it there.',
        );
        await replaceInSource(page, 'Of course you did.', 'Of course you did. You always do.');
        await replaceInSource(
          page,
          'A small kitchen, cleaner than it needs to be.',
          'A small kitchen, scrubbed to within an inch of its life.',
        );
        await run(page, 'History…');
        const first = history
          .getByRole('listbox', { name: 'Snapshots' })
          .getByRole('option')
          .first();
        await first.focus();
        await page.keyboard.press('Enter');
        await history.waitFor({ state: 'hidden' });
        await page.locator('#panel-compare .diff-view').waitFor();
        await scrollSourceTo(page, '.cm-line.cm-f-scene_heading');
        await page.waitForTimeout(600);
      },
    ],
  ];
  const chrome = await chromium.launch();
  for (const theme of THEMES) {
    // The editor and the page, at twice the pixels.
    {
      const ctx = await context(chrome, DEVICES.desktop.options, theme, { scale: 2 });
      const page = await ctx.newPage();
      await open(page);
      await shoot(page, `drafter-ide-${theme}`, async () => {
        await run(page, 'INT. KITCHEN');
        await scrollSourceTo(page, '.cm-line.cm-f-scene_heading');
        await page.waitForTimeout(1200);
      });
      await ctx.close();
    }
    for (const [shot, prepare] of GALLERY) {
      const ctx = await context(chrome, DEVICES.desktop.options, theme);
      const page = await ctx.newPage();
      await open(page);
      await shoot(page, `drafter-${shot}-${theme}`, async () => {
        await run(page, 'INT. KITCHEN');
        await scrollSourceTo(page, '.cm-line.cm-f-scene_heading');
        await page.waitForTimeout(300);
        await prepare(page);
      });
      await ctx.close();
    }
  }
  await chrome.close();
  // A phone, on Write, at the scene.
  const safari = await webkit.launch();
  for (const theme of THEMES) {
    const ctx = await context(safari, { ...DEVICES.iphone14.options, deviceScaleFactor: 2 }, theme);
    const page = await ctx.newPage();
    await open(page);
    await shoot(page, `drafter-phone-${theme}`, async () => {
      await run(page, 'INT. KITCHEN');
      await scrollSourceTo(page, '.cm-line.cm-f-scene_heading');
      await page.waitForTimeout(600);
    });
    await ctx.close();
  }
  await safari.close();
  // The sample's first script page as the PDF prints it (page 1 is the title page).
  try {
    const root = resolve(import.meta.dirname, '../../..');
    const pdf = join(tmpdir(), `drafter-readme-${process.pid}.pdf`);
    await run$('node', [
      join(root, 'packages/cli/dist/index.js'),
      'build',
      join(root, 'samples/screenplay.fountain'),
      '--pdf',
      pdf,
    ]);
    await run$('pdftoppm', [
      '-png',
      '-r',
      '110',
      '-f',
      '2',
      '-l',
      '2',
      '-singlefile',
      pdf,
      join(OUT, 'drafter-pdf-page'),
    ]);
    await rm(pdf, { force: true });
    console.log('  drafter-pdf-page.png');
  } catch (error) {
    failed++;
    console.error(
      `  drafter-pdf-page: ${error instanceof Error ? error.message.split('\n')[0] : error}`,
    );
  }
  for (const shot of ['ide', 'outline', 'cards', 'stats', 'scaffold', 'compare', 'phone'])
    for (const theme of THEMES)
      await squeeze(join(OUT, `drafter-${shot}-${theme}.png`)).catch(() => {});
  await squeeze(join(OUT, 'drafter-pdf-page.png')).catch(() => {});
}
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

if (!README) {
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

  // A scene in both panes, at twice the pixels (the README's own come from --readme).
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
}

if (README) await readmeShots();

console.log(failed ? `${failed} screen(s) couldn't be taken.` : `Done: ${OUT}`);
process.exitCode = failed ? 1 : 0;
