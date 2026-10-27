import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Page } from '@playwright/test';
import { editor, expect, test } from './helpers';

// What the session allows (Plan 6, Rulings D5 and D6): spellcheck with a bundled dictionary and no
// download, no permission the app doesn't use, no network request from a page, and the site's
// policy headers on app://.

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

/** The middle of the first place `word` is drawn in the editor. */
async function whereIs(page: Page, word: string) {
  return page.evaluate((target) => {
    const walker = document.createTreeWalker(
      document.querySelector('.cm-content') as Node,
      NodeFilter.SHOW_TEXT,
    );
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.textContent?.indexOf(target) ?? -1;
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at + 1);
      range.setEnd(node, at + target.length - 1);
      const box = range.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }
    return null;
  }, word);
}

/** The labels of the editor's last right-click menu (main.ts keeps it for an unpackaged app). */
type ShellMenu = { items: { label: string; role?: string; click(): void }[]; closePopup(): void };
const menuLabels = (app: import('@playwright/test').ElectronApplication) =>
  app.evaluate(() => {
    const shell = globalThis as unknown as { drafterShell: { contextMenu(): ShellMenu | null } };
    const menu = shell.drafterShell.contextMenu();
    menu?.closePopup();
    return menu ? menu.items.map((item) => item.label || item.role || '') : null;
  });

test('underlines a misspelled word, with no dictionary downloaded', async ({ desktop }) => {
  const { app, page } = await desktop();
  // Chromium checks spelling in the window that has the keyboard: with two tests running, another
  // window may have taken it.
  const focus = () =>
    app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.focus();
      window?.webContents.focus();
    });
  await focus();
  await editor(page).click();
  await page.keyboard.press(`${MOD}+End`);
  await page.keyboard.type('\nThe quikc brown fox.\n');
  // Chromium checks what was typed once the editor is left (as a writer moving on would).
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await app.evaluate(({ BrowserWindow }) => {
    const shell = globalThis as unknown as { drafterMenu?: unknown };
    shell.drafterMenu = null;
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.on('context-menu', (_event, params) => {
        shell.drafterMenu = {
          word: params.misspelledWord,
          suggestions: params.dictionarySuggestions,
        };
      });
    }
  });
  // The checker may not be ready at once: right-click until it marks the word (as Electron's own
  // spellchecker tests do).
  await expect
    .poll(
      async () => {
        await focus();
        const at = await whereIs(page, 'quikc');
        if (!at) return null;
        await page.mouse.click(at.x, at.y, { button: 'right' });
        // The menu's event comes a moment after the click.
        await page.waitForTimeout(300);
        // The editor's own menu (main.ts) is up: close it.
        await menuLabels(app);
        return app.evaluate(
          () => (globalThis as unknown as { drafterMenu?: { word: string } }).drafterMenu?.word,
        );
      },
      {
        timeout: 30_000,
        intervals: [500],
      },
    )
    .toBe('quikc')
    .catch(async (error: Error) => {
      // What the spellchecker had, when it never marked the word.
      const state = await app.evaluate(({ session }) => ({
        shell: (
          globalThis as unknown as { drafterShell: { spellcheck(): unknown } }
        ).drafterShell.spellcheck(),
        languages: session.defaultSession.getSpellCheckerLanguages(),
        enabled: session.defaultSession.isSpellCheckerEnabled(),
      }));
      throw new Error(`${error.message}\nspellchecker: ${JSON.stringify(state)}`);
    });
  const spell = await app.evaluate(() =>
    (
      globalThis as unknown as {
        drafterShell: { spellcheck(): { mode: string; downloads: string[] } };
      }
    ).drafterShell.spellcheck(),
  );
  expect(spell.downloads).toEqual([]);
  expect(spell.mode).toBe(process.platform === 'darwin' ? 'system' : 'bundled');
});

test('right-clicking a misspelled word offers suggestions, and one replaces it', async ({
  desktop,
}) => {
  const { app, page } = await desktop();
  const focus = () =>
    app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.focus();
      window?.webContents.focus();
    });
  await focus();
  await editor(page).click();
  await page.keyboard.press(`${MOD}+End`);
  await page.keyboard.type('\nThe quikc brown fox.\n');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  // Right-click the word until the checker has marked it and the menu lists suggestions.
  let labels: string[] | null = null;
  await expect
    .poll(
      async () => {
        await focus();
        const at = await whereIs(page, 'quikc');
        if (!at) return [];
        await page.mouse.click(at.x, at.y, { button: 'right' });
        await page.waitForTimeout(300);
        labels = await menuLabels(app);
        return labels ?? [];
      },
      { timeout: 30_000, intervals: [500] },
    )
    .toContain('Add to Dictionary');
  const menu = labels as unknown as string[];
  const suggestion = menu[0] as string;
  expect(suggestion).not.toBe('No Suggestions');
  expect(menu).toEqual(expect.arrayContaining(['Cut', 'Copy', 'Paste', 'Select All']));
  if (process.platform === 'linux') expect(menu).toContain('quick');

  // Choosing a suggestion (from the menu of the last right-click) replaces the word in the script.
  const chosen = process.platform === 'linux' ? 'quick' : suggestion;
  await app.evaluate((_electron, label) => {
    const shell = globalThis as unknown as { drafterShell: { contextMenu(): ShellMenu | null } };
    shell.drafterShell
      .contextMenu()
      ?.items.find((item) => item.label === label)
      ?.click();
  }, chosen);
  await expect(editor(page)).toContainText(`The ${chosen} brown fox.`);
  await expect(editor(page)).not.toContainText('quikc');
});

test('denies permissions the app doesn’t use', async ({ desktop }) => {
  const { page } = await desktop();
  const answers = await page.evaluate(async (darwin) => {
    const query = (name: string) =>
      navigator.permissions
        .query({ name: name as PermissionName })
        .then((status) => status.state)
        .catch((error: Error) => error.name);
    return {
      notification: await Notification.requestPermission(),
      notifications: await query('notifications'),
      geolocation: await query('geolocation'),
      camera: await query('camera'),
      microphone: await query('microphone'),
      // On macOS an unpackaged Electron waits on the system's own microphone prompt before it asks
      // the app (and the test can't answer it): checked on Linux, in CI.
      // A computer with no microphone answers NotFoundError before any permission is asked (CI's
      // runners have none), so there the answer says nothing about the handler.
      microphones: (await navigator.mediaDevices.enumerateDevices()).filter(
        (device) => device.kind === 'audioinput',
      ).length,
      media: darwin
        ? 'NotAllowedError'
        : await navigator.mediaDevices
            .getUserMedia({ audio: true })
            .then(() => 'granted')
            .catch((error: Error) => error.name),
      midi: await navigator
        .requestMIDIAccess({ sysex: true })
        .then(() => 'granted')
        .catch((error: Error) => error.name),
      persisted: await navigator.storage.persist(),
    };
  }, process.platform === 'darwin');
  const { microphones, ...rest } = answers;
  expect(rest).toEqual({
    notification: 'denied',
    notifications: 'denied',
    geolocation: 'denied',
    camera: 'denied',
    microphone: 'denied',
    media: microphones === 0 && process.platform === 'linux' ? 'NotFoundError' : 'NotAllowedError',
    midi: 'NotAllowedError',
    persisted: true,
  });
});

test('refuses network requests from pages, and leaves the main process alone', async ({
  desktop,
}) => {
  let hits = 0;
  const server: Server = createServer((_request, response) => {
    hits++;
    response.end('ok');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
  try {
    const { app } = await desktop();
    // A page loading a web address (here loaded by the main process, which no CSP or navigation
    // rule stops): the session cancels it.
    const loaded = await app.evaluate(async ({ BrowserWindow }, address) => {
      const window = new BrowserWindow({ show: false });
      try {
        await window.loadURL(address);
        return 'loaded';
      } catch (error) {
        return (error as { code?: string }).code ?? String(error);
      } finally {
        window.destroy();
      }
    }, url);
    expect(loaded).toBe('ERR_BLOCKED_BY_CLIENT');
    expect(hits).toBe(0);
    // The main process's own request (as the update check will be) goes through.
    const status = await app.evaluate(
      async ({ net }, address) => (await net.fetch(address)).status,
      url,
    );
    expect(status).toBe(200);
    expect(hits).toBe(1);
  } finally {
    server.close();
  }
});

test('sends the site’s policy headers with its pages', async ({ desktop }) => {
  const { page } = await desktop();
  const rule = readFileSync(new URL('../web/_headers', import.meta.url), 'utf8').split(
    '\n/',
  )[0] as string;
  const expected = (name: string) =>
    new RegExp(`^\\s+${name}:\\s*(.+)$`, 'mi').exec(rule)?.[1]?.trim();
  const headers = await page.evaluate(async () => {
    const response = await fetch('/');
    return {
      permissions: response.headers.get('permissions-policy'),
      referrer: response.headers.get('referrer-policy'),
      opener: response.headers.get('cross-origin-opener-policy'),
    };
  });
  expect(headers).toEqual({
    permissions: expected('Permissions-Policy'),
    referrer: expected('Referrer-Policy'),
    // Left out on purpose (src/protocol.ts).
    opener: null,
  });
  expect(headers.permissions).toContain('camera=()');
});
