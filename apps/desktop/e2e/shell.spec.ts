import { readFileSync } from 'node:fs';
import {
  editor,
  expect,
  launchAgain,
  openedExternally,
  ready,
  stored,
  test,
  welcome,
} from './helpers';

// The shell (Plan 6 Task 1): Drafter in an Electron window, served from its own files at
// app://drafter/, with the security settings of docs/drafter-desktop-design.md §2.

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  .version as string;
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';
/** How long a refused navigation is given to happen anyway, before the page is checked. */
const SETTLE = 750;

test('opens the editor with the sample on a first run', async ({ desktop }) => {
  const { page, errors } = await desktop({ firstRun: true });
  expect(page.url()).toBe('app://drafter/');
  await expect(welcome(page)).toBeVisible();
  await expect(editor(page)).toContainText('INT. KITCHEN - NIGHT');
  expect(await page.title()).toContain('Drafter');
  // The page knows it is in the desktop app, through the one bridge.
  expect(
    await page.evaluate(() => {
      const bridge = window.drafterDesktop;
      return {
        version: bridge?.version,
        platform: bridge?.platform,
        // Named calls only (Task 2's files): no ipcRenderer, nothing else.
        files: Object.keys(bridge?.files ?? {}).sort(),
        keys: Object.keys(bridge ?? {}).sort(),
      };
    }),
  ).toEqual({
    version: VERSION,
    platform: process.platform,
    files: ['pathOfDropped', 'read', 'realPath', 'showOpen', 'showSave', 'watch', 'write'],
    keys: ['files', 'onOpenFile', 'platform', 'version'],
  });
  // Every file it asked for was there, and the CSP blocked nothing.
  expect(errors).toEqual([]);
});

test('keeps typed text across a restart', async ({ desktop, profile }) => {
  const LINE = 'A LINE TYPED IN THE DESKTOP APP';
  const first = await desktop();
  await editor(first.page).click();
  await first.page.keyboard.press(`${MOD}+End`);
  await first.page.keyboard.type(`\n\n${LINE}`);
  // The recovery copy is written a moment after typing stops.
  await expect
    .poll(async () => (await stored(first.page)).some((row) => row.source.includes(LINE)))
    .toBe(true);
  await first.close();

  const second = await desktop({ profile });
  // The editor draws only the lines in view: go to the end, where the line was typed.
  await editor(second.page).click();
  await second.page.keyboard.press(`${MOD}+End`);
  await expect(editor(second.page)).toContainText(LINE);
});

test('has no service worker and no storage warning', async ({ desktop }) => {
  const { page } = await desktop();
  // A browser that won't promise to keep the recovery copy gets a warning; the desktop app's
  // profile is never cleared, so it gets none, even when Chromium says the same.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persisted: async () => false, persist: async () => false },
    });
  });
  await page.reload();
  await expect(editor(page)).toBeVisible();
  await expect(page.locator('[data-tour="status"]')).toContainText('may be cleared');
  await expect(page.locator('[data-warning]')).toHaveCount(0);

  const worker = await page.evaluate(async () => ({
    registrations: await navigator.serviceWorker
      ?.getRegistrations()
      .then((all) => all.length)
      .catch(() => 0),
    controlled: !!navigator.serviceWorker?.controller,
    sw: (await fetch('/sw.js')).status,
    manifest: (await fetch('/manifest.webmanifest')).status,
    manifestLink: !!document.querySelector('link[rel="manifest"]'),
  }));
  expect(worker).toEqual({
    registrations: 0,
    controlled: false,
    sw: 404,
    manifest: 404,
    manifestLink: false,
  });
});

test('refuses to navigate away from the app', async ({ desktop, profile }) => {
  const { app, page } = await desktop();
  const windows = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
  /** What the window shows, read in the page and in the main process. */
  const where = async (target = page) => ({
    page: await target.evaluate(() => [location.href, !!document.querySelector('.cm-content')]),
    loading: await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((window) => window.webContents.isLoading()),
    ),
  });

  // In the window itself: nothing loads but the app. An https address goes to the system browser.
  // (A refused navigation leaves Playwright's frame waiting for it to finish, so the page is read
  // with `evaluate` from here on rather than with locators, which would wait for it.)
  for (const url of [
    'https://example.com/',
    'http://example.com/',
    'file:///etc/passwd',
    'data:text/html,<p>x</p>',
  ]) {
    await page.evaluate((to) => {
      window.location.href = to;
    }, url);
    await page.waitForTimeout(SETTLE);
    expect(await where(), url).toEqual({ page: ['app://drafter/', true], loading: false });
  }

  // New windows: none for another site (https goes to the system browser instead).
  const opened = await page.evaluate(() =>
    ['https://example.org/', 'http://example.net/', 'file:///etc/hosts', 'javascript:1'].map(
      (url) => window.open(url) === null,
    ),
  );
  expect(opened).toEqual([true, true, true, true]);
  await page.waitForTimeout(SETTLE);
  expect(await windows()).toBe(1);
  expect(openedExternally(profile)).toEqual(['https://example.com/', 'https://example.org/']);

  // The app's own pages may open in a window of their own, under the same rules.
  const [help] = await Promise.all([
    app.waitForEvent('window'),
    page.evaluate(() => {
      window.open('/docs/saving/', '_blank');
    }),
  ]);
  await help.waitForLoadState('domcontentloaded');
  expect(help.url()).toBe('app://drafter/docs/saving/');
  await expect(help.getByRole('heading', { level: 1 })).toBeVisible();
  await help.evaluate(() => {
    window.location.href = 'https://example.com/elsewhere';
  });
  await help.waitForTimeout(SETTLE);
  expect(await help.evaluate(() => location.href)).toBe('app://drafter/docs/saving/');
  expect(openedExternally(profile)).toEqual([
    'https://example.com/',
    'https://example.org/',
    'https://example.com/elsewhere',
  ]);
});

test('runs the renderer sandboxed', async ({ desktop }) => {
  const { app, page } = await desktop();
  // The preload reports how its renderer was started (`process.sandboxed`, `contextIsolated`).
  const renderers = await app.evaluate(() =>
    (
      globalThis as unknown as {
        drafterShell: { renderers(): { sandboxed: boolean; contextIsolated: boolean }[] };
      }
    ).drafterShell.renderers(),
  );
  expect(renderers.length).toBeGreaterThan(0);
  for (const renderer of renderers) {
    expect(renderer).toMatchObject({ sandboxed: true, contextIsolated: true });
  }
  // Nothing turned Chromium's sandbox off.
  expect(
    await app.evaluate(({ app }) => ({
      noSandbox: app.commandLine.hasSwitch('no-sandbox'),
      env: process.env.ELECTRON_DISABLE_SANDBOX ?? null,
    })),
  ).toEqual({ noSandbox: false, env: null });
  // macOS and Windows report the OS sandbox per process (Linux doesn't: Chromium refuses to start
  // there without one unless told --no-sandbox, checked above, and CI runs this on Linux).
  const metrics = await app.evaluate(({ app }) =>
    app
      .getAppMetrics()
      .filter((metric) => metric.type === 'Tab')
      .map((m) => m.sandboxed),
  );
  for (const sandboxed of metrics) if (sandboxed !== undefined) expect(sandboxed).toBe(true);
  // The page has no Node.
  expect(
    await page.evaluate(() => [typeof require, typeof process, typeof module, typeof Buffer]),
  ).toEqual(['undefined', 'undefined', 'undefined', 'undefined']);
});

test('opens the editor again from a second launch when only a help window is left', async ({
  desktop,
  profile,
}) => {
  const { app, page } = await desktop();
  // A help page in a top-level window of its own. (One the editor opens with window.open closes
  // with the editor, Electron's default; Task 4's Help menu may open them like this.)
  const help = app.waitForEvent('window');
  await app.evaluate(({ BrowserWindow }) => {
    const window = new BrowserWindow({ show: true });
    void window.loadURL('app://drafter/docs/saving/');
  });
  const helpPage = await help;
  await expect.poll(() => helpPage.url()).toContain('/docs/saving');
  // The editor's window is closed; the help window stays, so the app keeps running.
  const closed = page.waitForEvent('close');
  await app.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.webContents.getURL() === 'app://drafter/') window.close();
    }
  });
  await closed;
  expect(app.windows()).toHaveLength(1);

  // Launched again: the first instance opens the editor, and the second quits.
  const editorWindow = app.waitForEvent('window');
  expect(await launchAgain(profile)).toBe(0);
  const reopened = await editorWindow;
  await ready(reopened);
  expect(reopened.url()).toBe('app://drafter/');
  expect(app.windows()).toHaveLength(2);

  // Launched once more: the same editor window comes forward, and no other opens.
  expect(await launchAgain(profile)).toBe(0);
  await new Promise((resolve) => setTimeout(resolve, 500));
  expect(app.windows()).toHaveLength(2);
});
