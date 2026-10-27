import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import {
  answerClose,
  closeAsked,
  editor,
  expect,
  type Launched,
  openedExternally,
  type Profile,
  stored,
  test,
} from './helpers';

// Updates from GitHub Releases (Plan 6 Task 6). The app is pointed at a local server that plays
// GitHub's release assets (DRAFTER_UPDATE_FEED, honoured only by an unpackaged app): a fake
// latest-linux.yml listing both the AppImage and the .deb, as electron-builder publishes it, and a
// fake AppImage. An AppImage is played with APPIMAGE set, a .deb without it. quitAndInstall is
// replaced by a hook (DRAFTER_E2E_UPDATE_INSTALL): it records "install" and quits, installing
// nothing. The real swap of the AppImage and the .deb's behaviour are Linux-only: CI (Task 7).

const NEWER = '9.9.9';
const APPIMAGE_BYTES = Buffer.from('not really an AppImage, only bytes to download\n'.repeat(40));
const DEB_BYTES = Buffer.from('not really a deb\n');
const sha512 = (bytes: Buffer) => createHash('sha512').update(bytes).digest('base64');

const FEED_YML = `version: ${NEWER}
files:
  - url: Drafter-${NEWER}.AppImage
    sha512: ${sha512(APPIMAGE_BYTES)}
    size: ${APPIMAGE_BYTES.length}
  - url: Drafter-${NEWER}.deb
    sha512: ${sha512(DEB_BYTES)}
    size: ${DEB_BYTES.length}
path: Drafter-${NEWER}.AppImage
sha512: ${sha512(APPIMAGE_BYTES)}
releaseDate: '2026-10-27T00:00:00.000Z'
`;

interface Feed {
  url: string;
  /** Every request path the server saw, in order. */
  seen: string[];
  close(): Promise<void>;
}

async function feed(yml = FEED_YML): Promise<Feed> {
  const seen: string[] = [];
  const server: Server = createServer((request, response) => {
    const path = (request.url ?? '').split('?')[0] ?? '';
    seen.push(path);
    if (/\/latest.*\.yml$/.test(path)) {
      response.writeHead(200, { 'content-type': 'text/yaml' }).end(yml);
    } else if (path.endsWith('.AppImage')) {
      response.writeHead(200, { 'content-type': 'application/octet-stream' }).end(APPIMAGE_BYTES);
    } else {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    seen,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

const feeds: Feed[] = [];
test.afterEach(async () => {
  for (const f of feeds.splice(0)) await f.close();
});
async function startFeed(yml?: string): Promise<Feed> {
  const f = await feed(yml);
  feeds.push(f);
  return f;
}

/** The environment for an AppImage (`appimage`) or a .deb (`deb`) that checks `feedUrl` soon. */
function env(kind: 'appimage' | 'deb', profile: Profile, feedUrl: string, delay = 100) {
  return {
    DRAFTER_UPDATE_FEED: feedUrl,
    DRAFTER_E2E_UPDATE_DELAY_MS: String(delay),
    DRAFTER_E2E_UPDATE_INSTALL: join(profile.dir, 'install.log'),
    APPIMAGE: kind === 'appimage' ? join(profile.dir, 'Drafter.AppImage') : '',
  };
}

const installs = (profile: Profile) => {
  const file = join(profile.dir, 'install.log');
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
};

const toast = (page: Page) => page.locator('[data-update]');
const button = (page: Page, name: string) => toast(page).getByRole('button', { name, exact: true });
const exited = (launched: Launched) => launched.app.waitForEvent('close');
const settle = (ms = 1500) => new Promise((resolve) => setTimeout(resolve, ms));

async function chooseNewScreenplay(page: Page) {
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page
    .getByRole('group', { name: 'Scripts' })
    .getByRole('button', { name: 'New screenplay' })
    .click();
}

async function typeAtEnd(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(text);
}

test('offers an update and installs only when asked', async ({ desktop, profile }) => {
  const f = await startFeed();
  const launched = await desktop({ env: env('appimage', profile, f.url) });
  const { page } = launched;

  // Found, downloaded in the background, and offered: nothing is installed.
  await expect(toast(page)).toContainText('A new version of Drafter is ready');
  await expect(button(page, 'Restart')).toBeVisible();
  await expect(button(page, 'Later')).toBeVisible();
  expect(f.seen.some((p) => p.endsWith('.AppImage'))).toBe(true);
  expect(f.seen.filter((p) => /\/latest.*\.yml$/.test(p))).toHaveLength(1);
  await settle();
  expect(installs(profile)).toEqual([]);

  // Later puts it off without installing.
  await button(page, 'Later').click();
  await expect(toast(page)).toBeHidden();
  await settle(500);
  expect(installs(profile)).toEqual([]);

  // After a reload it is offered again, and Restart (nothing unsaved) installs and quits.
  await page.reload();
  await expect(button(page, 'Restart')).toBeVisible();
  const gone = exited(launched);
  await button(page, 'Restart').click();
  await gone;
  expect(installs(profile)).toEqual(['install']);
  expect(closeAsked(profile)).toEqual([]);
});

test('never restarts to update by itself', async ({ desktop, profile }) => {
  const f = await startFeed();
  const launched = await desktop({ env: env('appimage', profile, f.url) });
  const { page } = launched;
  await chooseNewScreenplay(page);
  await typeAtEnd(page, '\nINT. LIGHTHOUSE - NIGHT\n');
  await expect(button(page, 'Restart')).toBeVisible();

  // Time passes with the offer up and changes unsaved: still running, nothing installed.
  await settle(3000);
  expect(installs(profile)).toEqual([]);
  await expect(editor(page)).toContainText('INT. LIGHTHOUSE - NIGHT');

  // Restart asks first, and Cancel keeps everything as it was.
  await button(page, 'Restart').click();
  await expect(toast(page)).toContainText(
    'Your unsaved changes stay in Drafter’s recovery copy, but they aren’t in your file yet.',
  );
  await expect(button(page, 'Save first')).toBeFocused();
  await expect(button(page, 'Restart anyway')).toBeVisible();
  await button(page, 'Cancel').click();
  await expect(button(page, 'Restart')).toBeVisible();
  await settle(500);
  expect(installs(profile)).toEqual([]);

  // Escape is Cancel, from the keyboard.
  await button(page, 'Restart').click();
  await page.keyboard.press('Escape');
  await expect(button(page, 'Restart')).toBeVisible();

  // Restart anyway: the recovery copy is written, the app quits without asking again.
  await button(page, 'Restart').click();
  const gone = exited(launched);
  await button(page, 'Restart anyway').click();
  await gone;
  expect(installs(profile)).toEqual(['install']);
  expect(closeAsked(profile)).toEqual([]);

  const again = await desktop();
  await expect(editor(again.page)).toContainText('INT. LIGHTHOUSE - NIGHT');
  expect((await stored(again.page)).some((p) => p.source.includes('INT. LIGHTHOUSE'))).toBe(true);
});

test('keeps asking about unsaved changes after an install that fails', async ({
  desktop,
  profile,
}) => {
  const f = await startFeed();
  const launched = await desktop({
    env: { ...env('appimage', profile, f.url), DRAFTER_E2E_UPDATE_INSTALL_FAILS: '1' },
  });
  const { page, app } = launched;
  await chooseNewScreenplay(page);
  await typeAtEnd(page, '\nINT. LIGHTHOUSE - NIGHT\n');
  await button(page, 'Restart').click();
  await button(page, 'Restart anyway').click();

  // The updater said it could not install: the toast says so, the app goes on.
  await expect(toast(page)).toContainText('Drafter couldn’t install the update');
  expect(installs(profile)).toEqual(['install']);
  await expect(editor(page)).toContainText('INT. LIGHTHOUSE - NIGHT');

  // Closing the window still asks, because the quit approval was taken back.
  answerClose(profile, ['cancel']);
  await app.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.webContents.getURL() === 'app://drafter/') window.close();
    }
  });
  await expect.poll(() => closeAsked(profile).length).toBe(1);
  await settle(500);
  await expect(editor(page)).toContainText('INT. LIGHTHOUSE - NIGHT');

  // Later puts the message away.
  await button(page, 'Later').click();
  await expect(toast(page)).toBeHidden();
});

test('offers Get it for a .deb, which downloads nothing and installs nothing', async ({
  desktop,
  profile,
}) => {
  const f = await startFeed();
  const { page } = await desktop({ env: env('deb', profile, f.url) });
  await expect(toast(page)).toContainText('A new version of Drafter is available');
  await expect(button(page, 'Restart')).toHaveCount(0);
  await expect(button(page, 'Later')).toBeVisible();
  await settle();
  expect(f.seen.some((p) => p.endsWith('.AppImage') || p.endsWith('.deb'))).toBe(false);

  await button(page, 'Get it').focus();
  await page.keyboard.press('Enter');
  await expect
    .poll(() => openedExternally(profile))
    .toEqual(['https://github.com/cschweda/drafter/releases/latest']);
  expect(installs(profile)).toEqual([]);
  expect(closeAsked(profile)).toEqual([]);
});

test('offers nothing when the release is not newer', async ({ desktop, profile }) => {
  const f = await startFeed(FEED_YML.replace(`version: ${NEWER}`, 'version: 0.0.1'));
  const { page } = await desktop({ env: env('appimage', profile, f.url) });
  await expect.poll(() => f.seen.length).toBeGreaterThan(0);
  await settle();
  await expect(toast(page)).toHaveCount(0);
  expect(f.seen.some((p) => p.endsWith('.AppImage'))).toBe(false);
});

test('stays quiet when the release server is down', async ({ desktop, profile }) => {
  const f = await startFeed();
  const url = f.url;
  await f.close();
  const { page, errors } = await desktop({ env: env('appimage', profile, url) });
  await settle(2500);
  await expect(toast(page)).toHaveCount(0);
  await expect(editor(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test('makes no request without a test feed and no check when unpackaged', async ({
  desktop,
  profile,
}) => {
  const f = await startFeed();
  // Everything but the feed: an unpackaged app checks nothing.
  const { page } = await desktop({
    env: { ...env('appimage', profile, f.url), DRAFTER_UPDATE_FEED: '' },
  });
  await settle(2000);
  await expect(toast(page)).toHaveCount(0);
  expect(f.seen).toEqual([]);
});

test('makes no request when Check for updates is off', async ({ desktop, profile }) => {
  const f = await startFeed();
  // The first run turns it off before the (long) wait is over, from the keyboard.
  const first = await desktop({ env: env('appimage', profile, f.url, 20_000) });
  const dialog = first.page.getByRole('dialog', { name: 'Settings' });
  await first.page.keyboard.press('ControlOrMeta+,');
  await expect(dialog).toBeVisible();
  const check = dialog.getByRole('switch', { name: 'Check for updates' });
  await expect(check).toBeChecked();
  await check.focus();
  await first.page.keyboard.press('Space');
  await expect(check).not.toBeChecked();
  await first.close();
  expect(f.seen).toEqual([]);

  // The next start remembers: it waits as short as it likes and the server sees nothing.
  const again = await desktop({ env: env('appimage', profile, f.url, 100) });
  await settle(2500);
  await expect(toast(again.page)).toHaveCount(0);
  expect(f.seen).toEqual([]);
  await again.page.keyboard.press('ControlOrMeta+,');
  await expect(
    again.page
      .getByRole('dialog', { name: 'Settings' })
      .getByRole('switch', { name: 'Check for updates' }),
  ).not.toBeChecked();
});

test('lets updater requests through the network backstop, while pages still get none', async ({
  desktop,
  profile,
}) => {
  const f = await startFeed();
  const { page } = await desktop({ env: env('appimage', profile, f.url) });
  await expect(button(page, 'Restart')).toBeVisible();
  // A page's own request to the same server is cancelled (the CSP and the backstop).
  const before = f.seen.length;
  const reached = await page.evaluate(
    (url) =>
      fetch(`${url}/latest-linux.yml`)
        .then(() => true)
        .catch(() => false),
    f.url,
  );
  expect(reached).toBe(false);
  expect(f.seen.length).toBe(before);
});
