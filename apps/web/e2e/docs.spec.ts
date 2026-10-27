import { expect, type Page, test } from '@playwright/test';
import { COMMAND_DATA, HELP_PAGES, helpHref } from '../app/commands/data';

// The help pages (Phase 1 design §4.5): Saving and your browser, Keyboard shortcuts, and Privacy.
// They are prerendered, so they read without JavaScript, and they share the app's theme.
// (Accessibility checks of these pages wait for the project's final stage, decided 2026-10-26.)

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

  test('prerenders a help index that links the three pages', async ({ page }) => {
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
    // The tab's link back opens the app, a second editor that can't edit the script that is open here.
    await tab.getByRole('link', { name: /Back to Drafter/ }).click();
    await expect(tab).toHaveURL(/\/$/);
    await tab.close();

    // The writer's tab is untouched: no leave prompt, and the line is there.
    expect(asked).toBe(false);
    await showSource(page);
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await expect(editor(page)).toContainText('A line written before reading the help.');
  });
});
