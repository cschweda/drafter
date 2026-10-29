import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { editor, expect, test } from './helpers';

// What the session allows (Plan 6, Rulings D5 and D6): spellcheck with a bundled dictionary and no
// download, no permission the app doesn't use, no network request from a page, and the site's
// policy headers on app://.

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

test('a misspelling is marked with no download, and right-click opens Drafter’s spelling menu', async ({
  desktop,
}) => {
  const { app, page } = await desktop();
  // Every request the page makes, to see that none leaves the app's own files.
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await app.evaluate(({ BrowserWindow }) => {
    const shell = globalThis as unknown as { drafterNative?: number };
    shell.drafterNative = 0;
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.on('context-menu', () => {
        shell.drafterNative = (shell.drafterNative ?? 0) + 1;
      });
    }
  });
  await editor(page).click();
  await page.keyboard.press(`${MOD}+End`);
  await page.keyboard.type('\nThe quikc brown fox.\n');
  // Drafter's own checker (a worker, with the dictionary from the app's files) marks it.
  const mark = page.locator('.cm-misspelled', { hasText: 'quikc' });
  await expect(mark).toBeVisible({ timeout: 30_000 });
  await mark.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Spelling suggestions' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'quick', exact: true })).toBeVisible();
  // Not the app's native menu (which would be Chromium's, with its own list).
  expect(
    await app.evaluate(() => (globalThis as unknown as { drafterNative?: number }).drafterNative),
  ).toBe(0);
  // A suggestion replaces the word in the script.
  await menu.getByRole('menuitem', { name: 'quick', exact: true }).click();
  await expect(editor(page)).toContainText('The quick brown fox.');
  await expect(editor(page)).not.toContainText('quikc');
  // Nothing was downloaded, and nothing was asked of any address but the app's.
  const spell = await app.evaluate(() =>
    (
      globalThis as unknown as {
        drafterShell: { spellcheck(): { mode: string; downloads: string[] } };
      }
    ).drafterShell.spellcheck(),
  );
  expect(spell.downloads).toEqual([]);
  const outside = requests.filter((url) => !/^(app|blob|data):/.test(url));
  expect(outside).toEqual([]);
  expect(requests.some((url) => /\/dictionaries\/en-US\/index\.dic$/.test(url))).toBe(true);
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
    // Linux and Windows runners have no microphone.
    media: microphones === 0 && process.platform !== 'darwin' ? 'NotFoundError' : 'NotAllowedError',
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
