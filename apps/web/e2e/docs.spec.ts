import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, type Page, test } from '@playwright/test';
import { DICTIONARIES } from '../../../packages/spell/src/dictionaries';
import { COMMAND_DATA, HELP_PAGES, helpHref } from '../app/commands/data';

// The help pages (Phase 1 design §4.5): Saving and your browser, Keyboard shortcuts, and Privacy.
// They are prerendered, so they read without JavaScript, and they share the app's theme.
// (Their accessibility checks are in a11y.spec.ts.)

const editor = (page: Page) => page.locator('.cm-content');
const mark = (page: Page) => page.getByRole('button', { name: 'Drafter menu' });
const menu = (page: Page) => page.getByRole('menu', { name: 'Drafter menu' });
const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });
const heading = (page: Page) => page.getByRole('heading', { level: 1 });

/** The text of the page's main part, with each run of white space as one space. */
async function mainText(page: Page): Promise<string> {
  return ((await page.locator('main').textContent()) ?? '').replace(/\s+/g, ' ');
}

async function start(page: Page) {
  await page.goto('/');
  await expect(editor(page)).toContainText('The Call');
}

/** The Source tab, which a phone doesn't show to begin with. */
async function showSource(page: Page) {
  if (!(await editor(page).isVisible())) {
    await page.getByRole('tab', { name: 'Source' }).first().click();
  }
  await expect(editor(page)).toBeVisible();
}

async function openMenu(page: Page) {
  await mark(page).click();
  await expect(menu(page)).toBeVisible();
}

/** The body's background, as the browser computes it. */
const background = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe('without JavaScript', () => {
  // No JavaScript, and so no stored state to set up first (the tour's "seen" flag is a script's to set).
  test.use({ javaScriptEnabled: false, storageState: { cookies: [], origins: [] } });

  test('prerenders each help page with its title and description', async ({ page }) => {
    const descriptions = new Set<string>();
    for (const { path, title } of HELP_PAGES) {
      await page.goto(path);
      await expect(page, path).toHaveTitle(`${title} — Drafter`);
      await expect(heading(page), path).toHaveText(title);
      const description = await page.locator('meta[name="description"]').getAttribute('content');
      expect(description, path).toBeTruthy();
      expect((description ?? '').length, path).toBeGreaterThan(40);
      expect((description ?? '').length, path).toBeLessThan(200);
      descriptions.add(description ?? '');
      // The link previews say the same, and the canonical address is this page's own.
      await expect(page.locator('meta[property="og:title"]'), path).toHaveAttribute(
        'content',
        `${title} — Drafter`,
      );
      await expect(page.locator('meta[property="og:description"]'), path).toHaveAttribute(
        'content',
        description ?? '',
      );
      await expect(page.locator('link[rel="canonical"]'), path).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]'), path).toHaveAttribute(
        'href',
        `https://drafter.dev${path}/`,
      );
      // Each is a page of its own, with a way back to the app.
      await expect(page.getByRole('link', { name: /Back to Drafter/ }), path).toHaveAttribute(
        'href',
        '/',
      );
    }
    expect(descriptions.size).toBe(HELP_PAGES.length);
  });

  test('prerenders a help index that links every help page', async ({ page }) => {
    for (const address of ['/docs', '/docs/']) {
      await page.goto(address);
      await expect(page, address).toHaveTitle('Help — Drafter');
      await expect(heading(page), address).toHaveText('Help');
      for (const help of HELP_PAGES) {
        await expect(
          page.locator('main').getByRole('link', { name: help.title }),
          address,
        ).toHaveAttribute('href', helpHref(help));
      }
    }
  });

  test('serves each page with and without a trailing slash', async ({ page }) => {
    for (const { path, title } of HELP_PAGES) {
      for (const address of [path, `${path}/`]) {
        await page.goto(address);
        await expect(heading(page), address).toHaveText(title);
      }
    }
  });

  test('lists every registered command on the shortcuts page', async ({ page }) => {
    await page.goto('/docs/shortcuts');
    const text = await mainText(page);
    for (const { title } of COMMAND_DATA) expect(text, title).toContain(title);
    // A script module’s commands are added at run time and are not on the page.
    expect(text).not.toContain('Fixture: add a note');
    // Grouped as the palette groups them.
    for (const group of ['File', 'Edit', 'View', 'Go', 'Help']) {
      await expect(page.getByRole('heading', { level: 2, name: group, exact: true })).toBeVisible();
    }
  });

  test('shows each shortcut in both notations, whatever the reader’s keyboard', async ({
    page,
  }) => {
    await page.goto('/docs/shortcuts');
    const row = (name: string | RegExp) => page.getByRole('row').filter({ hasText: name });
    const save = row('Save As…');
    await expect(save).toContainText('⌘⇧S');
    await expect(save).toContainText('Ctrl+Shift+S');
    const fold = row(/^Fold all/);
    await expect(fold).toContainText('⌃⌥[');
    await expect(fold).toContainText('Ctrl+Alt+[');
    const focus = row('Toggle focus mode');
    await expect(focus).toContainText('⌘⇧Enter');
    await expect(focus).toContainText('Ctrl+Shift+Enter');
  });

  test('the licences page lists every dependency and links its licence file', async ({ page }) => {
    // The versions installed: nspell's from @drafter/spell, is-buffer's from nspell.
    const spell = createRequire(new URL('../../../packages/spell/package.json', import.meta.url));
    const nspellDir = spell.resolve('nspell').replace(/[/\\]lib[/\\]index\.js$/, '');
    const version = (dir: string) =>
      (JSON.parse(readFileSync(`${dir}/package.json`, 'utf8')) as { version: string }).version;
    const isBufferDir = createRequire(`${nspellDir}/package.json`)
      .resolve('is-buffer')
      .replace(/[/\\]index\.js$/, '');
    const packages = [
      { name: 'nspell', version: version(nspellDir), licence: 'MIT', file: '/licenses/nspell.txt' },
      {
        name: 'is-buffer',
        version: version(isBufferDir),
        licence: 'MIT',
        file: '/licenses/is-buffer.txt',
      },
      ...Object.values(DICTIONARIES).map((d) => ({
        name: d.package,
        version: d.version,
        licence: d.licence,
        file: d.licenceFile,
      })),
    ];
    await page.goto('/docs/licences');
    await expect(heading(page)).toHaveText('Third-party licences');
    for (const { name, version, licence, file } of packages) {
      const entry = page.locator('main section').filter({
        has: page.getByRole('heading', { level: 3, name, exact: true }),
      });
      await expect(entry, name).toContainText(version);
      await expect(entry, name).toContainText(licence);
      const link = entry.getByRole('link', { name: /licence/i });
      await expect(link, name).toHaveAttribute('href', file);
      // The file is served, as the package ships it.
      const response = await page.request.get(file);
      expect(response.status(), file).toBe(200);
      expect((await response.text()).length, file).toBeGreaterThan(500);
    }
    // The copyright lines the dictionaries' notices carry, UKACD's shown as it asks.
    const text = await mainText(page);
    for (const line of [
      'Copyright 2000-2018 by Kevin Atkinson',
      'Copyright 1993, Geoff Kuenning, Granada Hills, CA',
      'Copyright (c) J Ross Beresford 1993-1999. All Rights Reserved.',
      'Copyright (c) 2016 Titus Wormer',
      'Copyright (c) Feross Aboukhadijeh',
      'Courier Prime',
      'Inter Tight',
      'SIL Open Font License',
    ]) {
      expect(text, line).toContain(line);
    }
    await expect(page.getByRole('link', { name: /Courier Prime.*licence/i })).toHaveAttribute(
      'href',
      '/fonts/courier-prime/OFL.txt',
    );
    // Inter Tight's own licence, linked and served verbatim (the OFL's second condition).
    await expect(page.getByRole('link', { name: /Inter Tight.*licence/i })).toHaveAttribute(
      'href',
      '/fonts/inter-tight/OFL.txt',
    );
    const ofl = await page.request.get('/fonts/inter-tight/OFL.txt');
    expect(ofl.ok()).toBe(true);
    expect(await ofl.text()).toBe(
      readFileSync(new URL('../app/assets/fonts/inter-tight/OFL.txt', import.meta.url), 'utf8'),
    );
  });

  test('says on the Privacy page that nothing leaves the device', async ({ page }) => {
    await page.goto('/docs/privacy');
    const text = (await mainText(page)).toLowerCase();
    for (const phrase of [
      'no account',
      'no analytics',
      'no telemetry',
      'never leaves',
      'service worker',
      'recovery copy',
      '/sw.js',
      'indexeddb',
      'localstorage',
      'writing stats',
    ]) {
      expect(text, phrase).toContain(phrase);
    }
  });

  test('explains saving: the browser table, synced folders, the recovery copy, and installing', async ({
    page,
  }) => {
    await page.goto('/docs/saving');
    const table = page.getByRole('table', { name: /Browsers/ });
    await expect(table).toBeVisible();
    for (const browser of ['Chrome', 'Edge', 'Firefox', 'Safari', 'Brave']) {
      await expect(table, browser).toContainText(browser);
    }
    const text = await mainText(page);
    for (const phrase of [
      'Dropbox',
      'Google Drive',
      'iCloud Drive',
      'recovery copy',
      'Allow on every visit',
      'Add to Dock',
      'Add to Home Screen',
      'iPhone or iPad',
      'Android',
      'Install page as app',
      'Install this site as an app',
      'install',
    ]) {
      expect(text, phrase).toContain(phrase);
    }
  });

  test('links the Linux and Windows downloads from the Saving page, and the Mac build guide', async ({
    page,
  }) => {
    await page.goto('/docs/saving');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Download the desktop app' }),
    ).toBeVisible();
    for (const name of ['Linux', 'Windows', 'Mac']) {
      await expect(page.getByRole('heading', { level: 3, name })).toBeVisible();
    }
    // The old address of the Linux section still lands on it.
    await expect(page.locator('#download-linux')).toHaveText('Linux');
    const releases = page.getByRole('link', { name: /latest release/i });
    await expect(releases.first()).toHaveAttribute(
      'href',
      'https://github.com/cschweda/drafter/releases/latest',
    );
    for (const [name, guide] of [
      [/Linux install guide/i, 'desktop-install-linux.md'],
      [/Windows install guide/i, 'desktop-install-windows.md'],
      [/build it on your Mac/i, 'desktop-install-macos.md'],
    ] as const) {
      await expect(page.getByRole('link', { name })).toHaveAttribute(
        'href',
        `https://github.com/cschweda/drafter/blob/main/docs/${guide}`,
      );
    }
    const text = await mainText(page);
    for (const phrase of [
      '.deb',
      'AppImage',
      'libfuse2',
      'drafterdev',
      'Ubuntu 24.04',
      'Windows',
      'SmartScreen',
      'More info',
      'Run anyway',
      'Arm',
      'macOS',
    ]) {
      expect(text, phrase).toContain(phrase);
    }
    expect(text).not.toMatch(/ICJIA/i);
  });
});

test.describe('with JavaScript', () => {
  test('uses the app’s dark theme to begin with, and its light theme when that is chosen', async ({
    page,
  }) => {
    await page.goto('/docs/privacy');
    await expect(heading(page)).toBeVisible();
    expect(await background(page)).toBe('rgb(15, 16, 19)');
    await page.evaluate(() => localStorage.setItem('nuxt-color-mode', 'light'));
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/\blight\b/);
    expect(await background(page)).toBe('rgb(244, 244, 242)');
  });

  test('reads at 320px wide without scrolling sideways', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    for (const { path, title } of HELP_PAGES) {
      await page.goto(path);
      await expect(heading(page), path).toHaveText(title);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test('goes back to the app from each page', async ({ page }) => {
    for (const { path } of HELP_PAGES) {
      await page.goto(path);
      await page.getByRole('link', { name: /Back to Drafter/ }).click();
      await expect(page).toHaveURL(/\/$/);
      await expect(editor(page)).toContainText('The Call');
    }
  });
});

/** An action's error, unless the tab it was done in closed under it, which is what was wanted. */
const gone = (tab: Page) => (error: unknown) => {
  if (!tab.isClosed()) throw error;
};

test.describe('from the app', () => {
  /** Chooses `title` from Help in a new tab, which opens at the page. Returns that tab. */
  async function fromMenu(page: Page, title: string, how: 'click' | 'keyboard') {
    await openMenu(page);
    const opened = page.context().waitForEvent('page');
    if (how === 'click') {
      await menu(page).getByRole('menuitem', { name: title }).click();
    } else {
      // Arrow down to the item; it is in the menu's last group.
      let found = false;
      for (let i = 0; i < 60 && !found; i += 1) {
        found = await page.evaluate(
          (name) => document.activeElement?.textContent?.trim().startsWith(name) ?? false,
          title,
        );
        if (!found) await page.keyboard.press('ArrowDown');
      }
      expect(found, title).toBe(true);
      await page.keyboard.press('Enter');
    }
    const tab = await opened;
    await tab.waitForLoadState();
    return tab;
  }

  test('reaches the pages from Help, each in a new tab, and leaves the editor tab as it was', async ({
    page,
  }) => {
    let asked = false;
    page.on('dialog', (dialog) => {
      asked = true;
      void dialog.dismiss();
    });
    await start(page);
    for (const { title, path } of HELP_PAGES) {
      const tab = await fromMenu(page, title, 'click');
      await expect(tab, title).toHaveURL(new RegExp(`${path}/?$`));
      await expect(heading(tab), title).toHaveText(title);
      await tab.close();
      // The writer's tab is where it was: the app, its script, and no leave prompt.
      await expect(page).toHaveURL(/\/$/);
      await expect(editor(page)).toContainText('The Call');
    }
    expect(asked).toBe(false);
  });

  test('reaches the pages from Help with the keyboard alone', async ({ page }) => {
    for (const { title, path } of HELP_PAGES) {
      await start(page);
      await mark(page).focus();
      await page.keyboard.press('Enter');
      await expect(menu(page)).toBeVisible();
      const opened = page.context().waitForEvent('page');
      let found = false;
      for (let i = 0; i < 60 && !found; i += 1) {
        found = await page.evaluate(
          (name) => document.activeElement?.textContent?.trim().startsWith(name) ?? false,
          title,
        );
        if (!found) await page.keyboard.press('ArrowDown');
      }
      expect(found, title).toBe(true);
      await page.keyboard.press('Enter');
      const tab = await opened;
      await expect(tab, title).toHaveURL(new RegExp(`${path}/?$`));
      await expect(heading(tab), title).toHaveText(title);
      await tab.close();
    }
  });

  test('lists the pages in the command palette', async ({ page }) => {
    for (const { title, path } of HELP_PAGES) {
      await start(page);
      await page.keyboard.press('ControlOrMeta+k');
      await expect(palette(page)).toBeVisible();
      await page.keyboard.type(title);
      // The page is the first match, and the highlighted one.
      await expect(palette(page).getByRole('option').first()).toContainText(
        `Open the page: ${title}`,
      );
      const opened = page.context().waitForEvent('page');
      await page.keyboard.press('Enter');
      const tab = await opened;
      await expect(tab, title).toHaveURL(new RegExp(`${path}/?$`));
      await expect(heading(tab), title).toHaveText(title);
      await tab.close();
    }
  });

  test('Back to Drafter closes a help tab the app opened, after reading another page in it too', async ({
    page,
  }) => {
    await start(page);
    const tab = await fromMenu(page, 'Keyboard shortcuts', 'keyboard');
    await expect(heading(tab)).toHaveText('Keyboard shortcuts');
    // Another help page in the same tab: its Back still goes to the editor it came from.
    await tab
      .getByRole('navigation', { name: 'Help pages' })
      .getByRole('link', { name: 'Privacy' })
      .click();
    await expect(heading(tab)).toHaveText('Privacy');
    const closed = tab.waitForEvent('close');
    await tab.getByRole('link', { name: /Back to Drafter/ }).focus();
    // The tab goes away under the key, which Playwright reports as an error of the press.
    await tab.keyboard.press('Enter').catch(gone(tab));
    await closed;
    // One tab, the editor, as it was.
    expect(page.context().pages()).toEqual([page]);
    await expect(page).toHaveURL(/\/$/);
    await expect(editor(page)).toContainText('The Call');
  });

  test('keeps what was being written, unsaved, when a page is read', async ({ page }) => {
    let asked = false;
    page.on('dialog', (dialog) => {
      asked = true;
      void dialog.dismiss();
    });
    await start(page);
    await showSource(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.insertText('\n\nA line written before reading the help.');

    const tab = await fromMenu(page, 'Privacy', 'click');
    await expect(heading(tab)).toHaveText('Privacy');
    // The tab's link back closes it, rather than open a second editor that can't edit the script.
    const closed = tab.waitForEvent('close');
    await tab
      .getByRole('link', { name: /Back to Drafter/ })
      .click()
      .catch(gone(tab));
    await closed;
    expect(tab.isClosed()).toBe(true);

    // The writer's tab is untouched: no leave prompt, and the line is there.
    expect(asked).toBe(false);
    await showSource(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await expect(editor(page)).toContainText('A line written before reading the help.');
  });
});
