import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { HELP_PAGES } from '../app/commands/data';
import { removePickers, stubPickers, textOf } from './fs-stub';

// Offline use and updates (Phase 1 design §11), on Chromium with the service worker allowed (every
// other spec blocks it: playwright.config.ts). The build is the production one that
// `scripts/serve.mjs` serves with its `_headers`, so the policy is what drafter.dev sends.

test.use({ serviceWorkers: 'allow' });
test.skip(
  ({ browserName, isMobile }) => browserName !== 'chromium' || !!isMobile,
  'desktop Chromium',
);

declare global {
  interface Window {
    __violations: string[];
    __marker?: number;
  }
}

const editor = (page: Page) => page.locator('.cm-content');
const pages = (page: Page) => page.getByRole('region', { name: 'Script' }).locator('.drafter-page');
const update = (page: Page) => page.getByRole('region', { name: 'Update' });
const reload = (page: Page) => update(page).getByRole('button', { name: 'Reload', exact: true });
const later = (page: Page) => update(page).getByRole('button', { name: 'Later' });
const saveFirst = (page: Page) => update(page).getByRole('button', { name: 'Save first' });
const reloadAnyway = (page: Page) => update(page).getByRole('button', { name: 'Reload anyway' });
const cancel = (page: Page) => update(page).getByRole('button', { name: 'Cancel' });
const UNSAVED =
  'Your unsaved changes stay in this browser’s recovery copy, but they aren’t in your file yet.';

/** The worker is active and controls the page: the first visit has been cached. */
async function controlled(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15_000 })
    .toBe(true);
}

async function start(page: Page) {
  await page.goto('/');
  await expect(editor(page)).toContainText('The Call');
  await controlled(page);
}

/** The worker the server sends: the build's own file, which a deploy would replace. */
const SW_FILE = fileURLToPath(new URL('../.output/public/sw.js', import.meta.url));
const SW_ORIGINAL = readFileSync(SW_FILE, 'utf8');

/** Puts the build's own `sw.js` back. */
function restoreWorker() {
  writeFileSync(SW_FILE, SW_ORIGINAL);
}

/**
 * Deploys a new version: `sw.js` is different the next time the browser asks for it, as it is when
 * any file the worker caches changes. The browser installs it, and it waits. (A route can't stand
 * in for it: the browser's own check of the worker is not a request a page's route sees.) The
 * tests that do this run one at a time (they share the file) and put it back afterward.
 */
async function deployNewVersion(page: Page) {
  writeFileSync(SW_FILE, `${SW_ORIGINAL}\n// a new version, ${Date.now()}\n`);
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update();
  });
}

/** Marks this page load, so a reload shows as the mark going away. */
async function mark(page: Page) {
  await page.evaluate(() => {
    window.__marker = 1;
  });
}
const reloaded = (page: Page) =>
  expect
    .poll(() =>
      // While the page is going away its context is gone: that is the reload under way.
      page.evaluate(() => window.__marker).catch(() => undefined),
    )
    .toBe(undefined);
const notReloaded = async (page: Page) => {
  // Long enough for a reload that was going to happen to have happened.
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__marker)).toBe(1);
};

async function typeAtEnd(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.insertText(text);
}

/** The end of the text is in view (the editor draws only what is on screen), and has `text`. */
async function expectAtEnd(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await expect(editor(page)).toContainText(text);
}

/** The text of every script in this browser's recovery copy. */
function storedSources(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const open = indexedDB.open('drafter');
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction('projects').objectStore('projects').getAll();
          request.onsuccess = () => {
            db.close();
            resolve((request.result as { source: string }[]).map((p) => p.source));
          };
          request.onerror = () => {
            db.close();
            resolve([]);
          };
        };
      }),
  );
}

test.describe('offline', () => {
  test('works offline after the first visit', async ({ page, context }) => {
    await start(page);
    await context.setOffline(true);
    await page.reload();
    await expect(editor(page)).toContainText('The Call');
    // The title page and the two numbered pages are drawn.
    await expect(pages(page)).toHaveCount(3);
    // The service worker answered: the page is controlled, with no network.
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  });

  test('spellchecks offline: the dictionaries are cached', async ({ page, context }) => {
    await start(page);
    await context.setOffline(true);
    await page.reload();
    await expect(editor(page)).toContainText('The Call');
    await typeAtEnd(page, '\nThe phnoe rings.\n');
    await expect(page.locator('.cm-misspelled')).toHaveText('phnoe', { timeout: 10_000 });
  });

  test('works offline at a Markdown document, whose parser loads on demand', async ({
    page,
    context,
  }) => {
    await start(page);
    // The first visit has not used Markdown at all: its code arrives now, with no network.
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page
      .getByRole('group', { name: 'Scripts', exact: true })
      .getByRole('button', { name: 'New Markdown document' })
      .click();
    await expect(editor(page)).toContainText('# Untitled');
    await expect(editor(page)).toHaveAttribute('data-language', 'markdown');
    await typeAtEnd(page, 'Some *words*.');
    if (!(await page.getByRole('article', { name: 'Preview' }).isVisible())) {
      await page.getByRole('tab', { name: 'Preview' }).first().click();
    }
    await expect(page.getByRole('article', { name: 'Preview' }).locator('em')).toHaveText('words');
  });

  test('exports a PDF offline: the export worker and its fonts are cached', async ({
    page,
    context,
  }) => {
    await removePickers(page);
    await start(page);
    await context.setOffline(true);
    await page.reload();
    await expect(editor(page)).toContainText('The Call');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('group', { name: 'Export' }).getByRole('button', { name: 'PDF' }).click();
    expect((await download).suggestedFilename()).toBe('The Call.pdf');
  });

  test('exports a Markdown PDF offline: its fonts are cached', async ({ page, context }) => {
    await removePickers(page);
    await start(page);
    await context.setOffline(true);
    await page.reload();
    await expect(editor(page)).toContainText('The Call');
    // A first Markdown PDF, with no network: the parser and the five document fonts come from the cache.
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page
      .getByRole('group', { name: 'Scripts', exact: true })
      .getByRole('button', { name: 'New Markdown document' })
      .click();
    await expect(editor(page)).toContainText('# Untitled');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('group', { name: 'Export' }).getByRole('button', { name: 'PDF' }).click();
    expect((await download).suggestedFilename()).toBe('Untitled.pdf');
    await expect(page.locator('.toast [role="status"]')).toHaveText('Exported Untitled.pdf.');
  });

  test('does not answer a request for a file with the app', async ({ page, context }) => {
    await start(page);
    await context.setOffline(true);
    // A file that isn't cached is a network error offline, not the app's shell in its place.
    for (const path of ['/og-image.png', '/404.html']) {
      await page.goto(path).catch(() => null);
      await expect(editor(page)).toHaveCount(0);
    }
    // And the app itself still opens.
    await page.goto('/');
    await expect(editor(page)).toContainText('The Call');
  });

  test('opens the help pages offline, with and without the trailing slash, and not as the app', async ({
    page,
    context,
  }) => {
    await start(page);
    await context.setOffline(true);
    // The page asks for nothing the worker can't answer (Nuxt fetches a prerendered page's payload).
    const failed: string[] = [];
    page.on('requestfailed', (request) => failed.push(request.url()));
    for (const { path, title } of [{ path: '/docs', title: 'Help' }, ...HELP_PAGES]) {
      for (const address of [path, `${path}/`]) {
        await page.goto(address);
        await expect(page.getByRole('heading', { level: 1 }), address).toHaveText(title);
        await expect(editor(page), address).toHaveCount(0);
        await page.waitForLoadState('networkidle');
      }
    }
    expect(failed).toEqual([]);
    // And from a page to the app, offline.
    await page.getByRole('link', { name: /Back to Drafter/ }).click();
    await expect(editor(page)).toContainText('The Call');
  });

  test('opens the licence files the Third-party licences page links, offline', async ({
    page,
    context,
  }) => {
    await start(page);
    await context.setOffline(true);
    await page.goto('/docs/licences/');
    const links = page.locator('main a[href$=".txt"]');
    const hrefs = await links.evaluateAll((all) => all.map((a) => a.getAttribute('href') ?? ''));
    expect([...new Set(hrefs)].sort()).toEqual([
      '/fonts/courier-prime/OFL.txt',
      '/fonts/inter-tight/OFL.txt',
      '/licenses/dictionary-en-gb.txt',
      '/licenses/dictionary-en.txt',
      '/licenses/is-buffer.txt',
      '/licenses/nspell.txt',
    ]);
    for (const href of hrefs) {
      const text = await page.evaluate(async (url) => (await fetch(url)).text(), href);
      expect(text, href).toMatch(/licen[cs]e|copyright/i);
    }
  });

  test('caches nothing but the app’s own files', async ({ page }) => {
    await start(page);
    const stored = await page.evaluate(async () => {
      const names = await caches.keys();
      const urls: string[] = [];
      for (const name of names) {
        for (const request of await (await caches.open(name)).keys()) {
          urls.push(new URL(request.url).pathname);
        }
      }
      return { names, urls };
    });
    // One precache and nothing else (no runtime cache).
    expect(stored.names).toHaveLength(1);
    expect(stored.names[0]).toMatch(/precache/);
    // The shell, the scripts and styles, the workers, both fonts, and the icons.
    expect(stored.urls).toContain('/');
    expect(stored.urls.some((u) => /^\/_nuxt\/.+\.js$/.test(u))).toBe(true);
    expect(stored.urls.some((u) => /^\/_nuxt\/.+\.css$/.test(u))).toBe(true);
    // The history worker too: Deleted scenes and History of this scene read the snapshots in it.
    for (const worker of [
      'layout.worker',
      'export.worker',
      'markdown.worker',
      'spell.worker',
      'history.worker',
    ]) {
      expect(stored.urls.some((u) => u.includes(worker))).toBe(true);
    }
    // Inter Tight: the interface's two files, and the four styles a Markdown document's PDF embeds.
    expect(stored.urls.filter((u) => /^\/_nuxt\/InterTight/.test(u))).toHaveLength(2);
    expect(
      stored.urls.filter((u) => /^\/fonts\/inter-tight\/InterTight-.+\.ttf$/.test(u)).sort(),
    ).toEqual(
      ['Italic', 'Regular', 'SemiBold', 'SemiBoldItalic'].map(
        (style) => `/fonts/inter-tight/InterTight-${style}.ttf`,
      ),
    );
    // Courier Prime's four files and its licence.
    expect(stored.urls.filter((u) => u.startsWith('/fonts/courier-prime/'))).toHaveLength(5);
    for (const icon of ['/icon-192.png', '/icon-512.png', '/icon-maskable-512.png']) {
      expect(stored.urls).toContain(icon);
    }
    // The help pages, under both addresses.
    for (const { path } of [{ path: '/docs' }, ...HELP_PAGES]) {
      expect(stored.urls).toContain(path);
      expect(stored.urls).toContain(`${path}/`);
    }
    // Not the social image, and not the hosting fallbacks.
    expect(stored.urls).not.toContain('/og-image.png');
    expect(stored.urls).not.toContain('/200.html');
    expect(stored.urls).not.toContain('/404.html');
  });
});

test.describe('the web app manifest', () => {
  test('serves the web app manifest', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBe('/manifest.webmanifest');
    const response = await request.get(href as string);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('manifest+json');
    expect(response.headers()['cache-control']).toBe('no-cache');
    const manifest = await response.json();
    expect(manifest).toMatchObject({
      name: 'Drafter',
      short_name: 'Drafter',
      display: 'standalone',
      background_color: '#0F1013',
      theme_color: '#0F1013',
      start_url: '/',
    });
    expect(manifest.icons).toEqual([
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ]);
    // Every icon is there, and is an image.
    for (const icon of manifest.icons) {
      const file = await request.get(icon.src);
      expect(file.ok()).toBe(true);
      expect(file.headers()['content-type']).toBe('image/png');
    }
  });
});

test.describe('a new version', () => {
  test.describe.configure({ mode: 'serial' });
  test.afterEach(restoreWorker);

  test('is offered, and is never applied without a choice', async ({ page }) => {
    await start(page);
    await mark(page);
    await expect(update(page)).toHaveCount(0);
    await deployNewVersion(page);
    await expect(update(page)).toContainText('A new version of Drafter is ready');
    await expect(reload(page)).toBeVisible();
    await notReloaded(page);
    // Later hides the offer, and the page still has not reloaded.
    await later(page).click();
    await expect(update(page)).toHaveCount(0);
    await notReloaded(page);
  });

  test('Later lasts through focus mode, which only hides the offer while it is on', async ({
    page,
  }) => {
    await start(page);
    await deployNewVersion(page);
    await expect(update(page)).toContainText('A new version of Drafter is ready');
    await later(page).click();
    await expect(update(page)).toHaveCount(0);
    // In and out of focus mode: the toolbar (and the offer with it) goes and comes back.
    await page.getByRole('button', { name: 'Focus', exact: true }).click();
    await expect(page.locator('[data-focus-layout]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-focus-layout]')).toHaveCount(0);
    // Long enough for the offer to have come back, had it been going to.
    await page.waitForTimeout(1000);
    await expect(update(page)).toHaveCount(0);
  });

  test('reloads when Reload is chosen with nothing unsaved', async ({ page }) => {
    await start(page);
    await mark(page);
    await deployNewVersion(page);
    await reload(page).click();
    await reloaded(page);
    await expect(editor(page)).toContainText('The Call');
    await controlled(page);
  });

  test('asks before reloading with unsaved changes', async ({ page }) => {
    await start(page);
    await typeAtEnd(page, '\n\nA line that is not in any file.');
    await mark(page);
    await deployNewVersion(page);
    await reload(page).click();
    // The question, in place of the buttons, and nothing has reloaded.
    await expect(update(page)).toContainText(UNSAVED);
    await expect(saveFirst(page)).toBeFocused();
    await expect(reloadAnyway(page)).toBeVisible();
    await expect(cancel(page)).toBeVisible();
    await notReloaded(page);
    // Cancel goes back to the offer, and Reload has focus.
    await cancel(page).click();
    await expect(update(page)).not.toContainText(UNSAVED);
    await expect(reload(page)).toBeFocused();
    await notReloaded(page);
    // Reload anyway reloads, and the text is in the recovery copy.
    await reload(page).click();
    await reloadAnyway(page).click();
    await reloaded(page);
    await expectAtEnd(page, 'A line that is not in any file.');
  });

  test('Reload anyway does not bring up the browser’s own leave-this-page question as well', async ({
    page,
  }) => {
    // A script of the writer's own that has changes: the browser would ask before leaving it.
    const asked: string[] = [];
    page.on('dialog', (dialog) => {
      asked.push(dialog.type());
      void dialog.dismiss();
    });
    await start(page);
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page
      .getByRole('group', { name: 'Scripts', exact: true })
      .getByRole('button', { name: 'New screenplay' })
      .click();
    await typeAtEnd(page, '\n\nTyped in a script of my own.');
    await mark(page);
    await deployNewVersion(page);
    await reload(page).click();
    await expect(update(page)).toContainText(UNSAVED);
    await reloadAnyway(page).click();
    await reloaded(page);
    await expectAtEnd(page, 'Typed in a script of my own.');
    expect(asked).toEqual([]);
  });

  test('Save first saves, and reloads only after it has', async ({ page }) => {
    await stubPickers(page);
    await start(page);
    await typeAtEnd(page, '\n\nA line for the file.');
    await mark(page);
    await deployNewVersion(page);
    await reload(page).click();
    await saveFirst(page).click();
    await reloaded(page);
    // The file has the line, and the reloaded page has it too.
    expect(await textOf(page, 'The Call.fountain')).toContain('A line for the file.');
    await expectAtEnd(page, 'A line for the file.');
  });

  test('Save first does not reload when the save is cancelled', async ({ page }) => {
    await stubPickers(page);
    await start(page);
    await typeAtEnd(page, '\n\nStill not saved.');
    await mark(page);
    await page.evaluate(() => {
      (window as unknown as { __cancelPick: boolean }).__cancelPick = true;
    });
    await deployNewVersion(page);
    await reload(page).click();
    await saveFirst(page).click();
    await expect(update(page)).toContainText(UNSAVED);
    await notReloaded(page);
    expect(await textOf(page, 'The Call.fountain')).toBeNull();
  });

  test('can be answered from the keyboard alone', async ({ page }) => {
    await start(page);
    await typeAtEnd(page, '\n\nTyped, then keys only.');
    await mark(page);
    await deployNewVersion(page);
    await expect(update(page)).toBeVisible();
    // Tab from the editor reaches the toast's buttons; Enter on Reload asks.
    await reload(page).focus();
    await page.keyboard.press('Enter');
    await expect(saveFirst(page)).toBeFocused();
    // Escape is Cancel, and puts focus back on Reload.
    await page.keyboard.press('Escape');
    await expect(reload(page)).toBeFocused();
    await expect(update(page)).not.toContainText(UNSAVED);
    await notReloaded(page);
    // Tab moves along the buttons in order, and Space chooses.
    await page.keyboard.press('Space');
    await expect(saveFirst(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(reloadAnyway(page)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(cancel(page)).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Enter');
    await reloaded(page);
    await expectAtEnd(page, 'Typed, then keys only.');
  });

  test('Save first where Save is a download waits for the download, and keeps Reload', async ({
    page,
  }) => {
    await removePickers(page);
    await start(page);
    await typeAtEnd(page, '\n\nDownloaded, then reloaded.');
    await mark(page);
    await deployNewVersion(page);
    await reload(page).click();
    const download = page.waitForEvent('download');
    await saveFirst(page).click();
    expect((await download).suggestedFilename()).toBe('The Call.fountain');
    // Not reloaded: the download has to finish first. The question is replaced by a message.
    await expect(update(page)).toContainText(
      'Your script is downloading. Reload when it has finished.',
    );
    await expect(update(page)).not.toContainText(UNSAVED);
    await expect(reload(page)).toBeFocused();
    await expect(later(page)).toBeVisible();
    await notReloaded(page);
    // Reload now has nothing to ask about.
    await reload(page).click();
    await reloaded(page);
    await expectAtEnd(page, 'Downloaded, then reloaded.');
  });

  test('a download under way is still said after focus mode', async ({ page }) => {
    await removePickers(page);
    await start(page);
    await typeAtEnd(page, '\n\nDownloaded, then focused.');
    await deployNewVersion(page);
    await reload(page).click();
    const download = page.waitForEvent('download');
    await saveFirst(page).click();
    await download;
    const downloading = 'Your script is downloading. Reload when it has finished.';
    await expect(update(page)).toContainText(downloading);
    await page.getByRole('button', { name: 'Focus', exact: true }).click();
    await expect(page.locator('[data-focus-layout]')).toBeVisible();
    await expect(update(page)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-focus-layout]')).toHaveCount(0);
    await expect(update(page)).toContainText(downloading);
  });

  test('in two tabs: one reloads, the other keeps its text and its offer until its own Reload', async ({
    page,
    context,
  }) => {
    await start(page);
    const other = await context.newPage();
    await other.goto('/');
    await expect(editor(other)).toContainText('The Call');
    await controlled(other);
    // Two tabs can't both edit one script: the second takes it over from the first.
    await other.getByRole('button', { name: 'Edit here instead' }).click();
    await typeAtEnd(other, '\n\nTyped in the second tab.');
    await mark(page);
    await mark(other);
    await deployNewVersion(page);
    // Both tabs are offered it.
    await expect(update(page)).toContainText('A new version of Drafter is ready');
    await expect(update(other)).toContainText('A new version of Drafter is ready');
    // The first tab's writer reloads. The second tab was not asked, and does not reload.
    await reload(page).click();
    await reloaded(page);
    await notReloaded(other);
    await expect(update(other)).toContainText('A new version of Drafter is ready');
    await expectAtEnd(other, 'Typed in the second tab.');
    // Its own Reload still reloads it, after the question about its changes.
    await reload(other).click();
    await expect(update(other)).toContainText(UNSAVED);
    await reloadAnyway(other).click();
    await reloaded(other);
    // The text is in the recovery copy.
    await expect
      .poll(() =>
        storedSources(other).then((sources) =>
          sources.some((t) => t.includes('Typed in the second tab.')),
        ),
      )
      .toBe(true);
  });

  test('Reload reloads a tab that was loaded without the worker (a hard reload)', async ({
    page,
    context,
  }) => {
    // Another tab still has the old worker, so the new one waits.
    await start(page);
    await deployNewVersion(page);
    await expect(update(page)).toContainText('A new version of Drafter is ready');
    // This tab is a hard reload: loaded with no controlling worker, while one is waiting.
    const hard = await context.newPage();
    const cdp = await context.newCDPSession(hard);
    await cdp.send('Network.enable');
    await cdp.send('Network.setBypassServiceWorker', { bypass: true });
    await hard.goto('/');
    await expect(editor(hard)).toContainText('The Call');
    expect(await hard.evaluate(() => navigator.serviceWorker.controller === null)).toBe(true);
    await mark(hard);
    await expect(update(hard)).toContainText('A new version of Drafter is ready');
    await reload(hard).click();
    await reloaded(hard);
    await expect(editor(hard)).toContainText('The Call');
    // The first tab was not asked: it keeps its offer.
    await expect(update(page)).toContainText('A new version of Drafter is ready');
  });

  test('waits for the welcome dialog rather than stacking on it', async ({ browser }) => {
    // A first visit with the tour not yet seen: the welcome is up.
    const context = await browser.newContext({ serviceWorkers: 'allow', storageState: undefined });
    const page = await context.newPage();
    await page.goto('/');
    const welcome = page.getByRole('alertdialog', { name: 'Welcome to Drafter' });
    await expect(welcome).toBeVisible();
    await controlled(page);
    await deployNewVersion(page);
    await page.waitForTimeout(1000);
    await expect(update(page)).toHaveCount(0);
    // Once the writer has dealt with the welcome, the offer appears.
    await welcome.getByRole('button', { name: "No thanks, I'll look around." }).click();
    await expect(welcome).toBeHidden();
    await expect(update(page)).toContainText('A new version of Drafter is ready');
    await context.close();
  });
});

test.describe('the service worker and the content security policy', () => {
  test('keeps the content security policy', async ({ page, request }) => {
    await page.addInitScript(() => {
      window.__violations = [];
      document.addEventListener('securitypolicyviolation', (event) =>
        window.__violations.push(`${event.violatedDirective} ${event.blockedURI}`),
      );
    });
    const sw = await request.get('/sw.js');
    expect(sw.ok()).toBe(true);
    // The worker is sent under the same policy as the page, and is not kept for long.
    expect(sw.headers()['content-security-policy']).toMatch(
      /^default-src 'self'; script-src 'self'/,
    );
    expect(sw.headers()['cache-control']).toBe('no-cache');
    expect(sw.headers()['content-type']).toContain('javascript');

    await start(page);
    // Served by the worker, offline, the page is still under its policy and breaks none of it.
    await page.context().setOffline(true);
    await page.reload();
    await expect(editor(page)).toContainText('The Call');
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => window.__violations)).toEqual([]);
    // The policy the page was served with is the page's own: the worker answered with the cached
    // response, and the browser applies the policy that response carried.
    const policy = await page.evaluate(async () =>
      (await fetch('/')).headers.get('content-security-policy'),
    );
    expect(policy).toMatch(/^default-src 'self'; script-src 'self'( 'sha256-[^']+')+;/);
  });
});
