import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

// Help: About Drafter, the sample scripts, and Check for updates (decided 2026-10-29). The
// accessibility of these dialogs is left to the final accessibility pass.

const VERSION = (
  JSON.parse(readFileSync(new URL('../../desktop/package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;

const editor = (page: Page) => page.locator('.cm-content');
const mark = (page: Page) => page.getByRole('button', { name: 'Drafter menu' });
const menu = (page: Page) => page.getByRole('menu', { name: 'Drafter menu' });
const item = (page: Page, name: RegExp) => page.getByRole('menuitem', { name });
const palette = (page: Page) => page.getByRole('dialog', { name: 'Command palette' });
const about = (page: Page) => page.getByRole('dialog', { name: 'Drafter', exact: true });
const checkDialog = (page: Page) => page.getByRole('dialog', { name: 'Check for updates' });
const text = (page: Page) => editor(page).evaluate((el) => el.textContent ?? '');

async function start(page: Page) {
  await page.goto('/');
  await expect(editor(page)).toContainText('The Call');
}

async function runCommand(page: Page, title: string) {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(palette(page)).toBeVisible();
  await page.keyboard.type(title);
  await palette(page).getByRole('option', { name: title }).first().click();
}

interface Row {
  id: string;
  title: string;
  source: string;
  sample?: string;
  sampleScript?: string;
}

function stored(page: Page): Promise<Row[]> {
  return page.evaluate(
    () =>
      new Promise<Row[]>((resolve) => {
        const open = indexedDB.open('drafter');
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          const db = open.result;
          const request = db.transaction('projects').objectStore('projects').getAll();
          request.onsuccess = () => {
            db.close();
            resolve(request.result as Row[]);
          };
          request.onerror = () => {
            db.close();
            resolve([]);
          };
        };
      }),
  );
}

test.describe('About Drafter', () => {
  test('shows the version, the app, and the links, which open in a new tab', async ({ page }) => {
    await start(page);
    await mark(page).click();
    await expect(menu(page)).toBeVisible();
    await item(page, /^About Drafter/).click();
    const dialog = about(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('[data-about-version]')).toHaveText(`v${VERSION}`);
    await expect(dialog).toContainText('The web app (drafter.dev)');
    await expect(dialog).toContainText('MIT License');
    const repo = dialog.getByRole('link', { name: 'Source code on GitHub' });
    await expect(repo).toHaveAttribute('href', 'https://github.com/cschweda/drafter');
    await expect(repo).toHaveAttribute('target', '_blank');
    await expect(repo).toHaveAttribute('rel', /noopener/);
    for (const [name, href] of [
      ['Releases', 'https://github.com/cschweda/drafter/releases'],
      ['Changelog', 'https://github.com/cschweda/drafter/blob/main/CHANGELOG.md'],
      ['drafter.dev', 'https://drafter.dev/'],
    ]) {
      const link = dialog.getByRole('link', { name, exact: true });
      await expect(link).toHaveAttribute('href', href as string);
      await expect(link).toHaveAttribute('target', '_blank');
    }
    await expect(dialog.getByRole('link', { name: 'Keyboard shortcuts' })).toBeVisible();
    // Escape closes it, as every dialog's does.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('copies the version info for a bug report, and says so', async ({
    page,
    context,
    browserName,
  }) => {
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    }
    await start(page);
    await runCommand(page, 'About Drafter');
    const dialog = about(page);
    await dialog.getByRole('button', { name: 'Copy version info' }).click();
    await expect(dialog.getByRole('status')).toHaveText('Copied.');
    if (browserName === 'chromium') {
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      expect(copied).toContain(`Drafter v${VERSION}`);
      expect(copied).toContain('App: web app (drafter.dev)');
      expect(copied).toMatch(/Browser: \w+/);
    }
  });
});

test.describe('the sample scripts', () => {
  for (const [name, expected] of [
    ['Screenplay', 'Sample: Screenplay'],
    ['Stage play', 'Sample: Stage play'],
    ['Markdown', 'Sample: Markdown'],
  ] as const) {
    test(`Sample script: ${name} opens as a new script, leaving the one that was open`, async ({
      page,
    }) => {
      await start(page);
      await runCommand(page, 'New screenplay');
      await expect.poll(() => text(page)).toContain('Title: Untitled Screenplay');
      await editor(page).click();
      await page.keyboard.press('ControlOrMeta+End');
      await page.keyboard.type('\nMY OWN LINE.\n');
      await expect
        .poll(async () => (await stored(page)).some((r) => r.source.includes('MY OWN LINE.')))
        .toBe(true);
      const before = (await stored(page)).length;

      await runCommand(page, `Sample script: ${name}`);
      await expect.poll(() => text(page)).toContain(expected);
      const rows = await stored(page);
      expect(rows).toHaveLength(before + 1);
      const made = rows.find((r) => r.title === expected);
      expect(made?.sample).toBeUndefined();
      expect(made?.sampleScript).toBeTruthy();
      // The writer's script is as it was.
      expect(rows.some((r) => r.source.includes('MY OWN LINE.'))).toBe(true);
      // Opened unchanged: the title has no unsaved mark.
      await expect(page).toHaveTitle(`${expected} — Drafter`);
    });
  }

  test('are in the app menu’s Help section, in a submenu', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'a submenu is opened by pointer or keys here');
    await start(page);
    await mark(page).click();
    await item(page, /^Sample scripts/).hover();
    await item(page, /^Stage play$/).click();
    await expect.poll(() => text(page)).toContain('Sample: Stage play');
  });
});

/**
 * Replaces the service worker container before the page's scripts run: `register` fails (as the
 * blocked worker of these tests does), and `getRegistration` gives a registration whose `update`
 * finds `found` (nothing, or a worker that installs and waits).
 */
async function fakeWorker(page: Page, found: 'nothing' | 'waiting' | 'none') {
  await page.addInitScript((kind) => {
    let waiting: unknown = null;
    const registration = {
      installing: null,
      get waiting() {
        return waiting;
      },
      async update() {
        (window as unknown as { updates: number }).updates =
          ((window as unknown as { updates?: number }).updates ?? 0) + 1;
        if (kind === 'waiting') waiting = { state: 'installed' };
      },
      addEventListener() {},
      removeEventListener() {},
    };
    const container = {
      controller: null,
      register: () => Promise.reject(new Error('No worker in this test.')),
      getRegistration: async () => (kind === 'none' ? undefined : registration),
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
  }, found);
}

test.describe('Check for updates', () => {
  test('says this is the latest version when there is no new build', async ({ page }) => {
    await fakeWorker(page, 'nothing');
    await start(page);
    await runCommand(page, 'Check for updates…');
    const dialog = checkDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('status')).toHaveText(
      `You’re on the latest version (v${VERSION}).`,
    );
    expect(await page.evaluate(() => (window as unknown as { updates: number }).updates)).toBe(1);
    await expect(dialog.getByRole('button', { name: 'Reload' })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-update]')).toHaveCount(0);
  });

  test('offers Reload when a new build is waiting, which asks first with changes unsaved', async ({
    page,
  }) => {
    await fakeWorker(page, 'waiting');
    await start(page);
    await runCommand(page, 'New screenplay');
    await editor(page).click();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.type('\nUNSAVED LINE.\n');
    await runCommand(page, 'Check for updates…');
    const dialog = checkDialog(page);
    await expect(dialog.getByRole('status')).toHaveText(
      'A new version of Drafter is ready. Reload to use it.',
    );
    const reload = dialog.getByRole('button', { name: 'Reload' });
    await expect(reload).toBeFocused();
    await reload.click();
    await expect(dialog).toBeHidden();
    // The offer's own question: nothing reloads with changes that aren't in a file.
    const toast = page.locator('[data-update]');
    await expect(toast).toContainText('Your unsaved changes stay in this browser’s recovery copy');
    await expect(toast.getByRole('button', { name: 'Save first' })).toBeFocused();
    await toast.getByRole('button', { name: 'Cancel' }).click();
    await expect(toast.getByRole('button', { name: 'Reload' })).toBeVisible();
    await expect.poll(() => text(page)).toContain('UNSAVED LINE.');
  });

  test('says so when there is no service worker', async ({ page }) => {
    await fakeWorker(page, 'none');
    await start(page);
    await mark(page).click();
    await item(page, /^Check for updates…/).click();
    await expect(checkDialog(page).getByRole('status')).toHaveText(
      /^This copy of Drafter has no service worker/,
    );
  });
});
