// The desktop e2e harness. Each test gets its own profile (a temp folder for HOME, XDG_CONFIG_HOME,
// and Electron's userData), so tests never share a recovery copy, a single-instance lock, or
// settings, and can run in parallel. Launch the app with `desktop()`; every app a test launched is
// closed, and its profile removed, when the test ends.
//
//   import { expect, test } from './helpers';
//   test('…', async ({ desktop }) => {
//     const { page } = await desktop();            // the editor, ready, the tour's welcome skipped
//     const again = await desktop({ firstRun: true }); // (another profile would be `newProfile()`)
//   });
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  _electron,
  test as base,
  type ElectronApplication,
  expect,
  type Page,
} from '@playwright/test';

export { expect };

/** apps/desktop: launched as a folder, so Electron reads its package.json (name, version, main). */
export const DESKTOP_DIR = fileURLToPath(new URL('..', import.meta.url));
/** The Electron binary (Electron 45 downloads it on first `require`). */
const ELECTRON = createRequire(import.meta.url)('electron') as unknown as string;

/** A test's own place on disk. */
export interface Profile {
  /** The temp folder holding everything below. */
  dir: string;
  /** HOME for the app (and XDG_CONFIG_HOME under it, `.config`). */
  home: string;
  /** Electron's userData: IndexedDB, localStorage, the single-instance lock. */
  userData: string;
  /** Where the app writes the URLs it would have opened in the system browser (one per line). */
  externalLog: string;
  /**
   * The answers the app's Open and Save dialogs give, in order (`DRAFTER_E2E_DIALOG`): a path, or
   * null for Cancel. An empty queue cancels. Each question asked is logged beside it (`.log`).
   */
  dialogs: string;
}

export async function newProfile(): Promise<Profile> {
  const dir = await mkdtemp(join(tmpdir(), 'drafter-desktop-e2e-'));
  const home = join(dir, 'home');
  await mkdir(join(home, '.config'), { recursive: true });
  return {
    dir,
    home,
    userData: join(dir, 'user-data'),
    externalLog: join(dir, 'external.log'),
    dialogs: join(dir, 'dialogs.json'),
  };
}

/** Queues the answers the next Open and Save dialogs give: a path each, or null for Cancel. */
export function answerDialogs(profile: Profile, answers: (string | null)[]): void {
  writeFileSync(profile.dialogs, JSON.stringify(answers));
}

/** A question a dialog was asked: what kind, the folder (and name) it suggested. */
export interface DialogAsked {
  kind: 'open' | 'save';
  defaultPath: string;
  extension?: string;
}

/** The dialogs the app has shown, in order. */
export function dialogsAsked(profile: Profile): DialogAsked[] {
  const log = `${profile.dialogs}.log`;
  if (!existsSync(log)) return [];
  return readFileSync(log, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as DialogAsked);
}

/** The URLs the app handed to the system browser, in order. */
export function openedExternally(profile: Profile): string[] {
  if (!existsSync(profile.externalLog)) return [];
  return readFileSync(profile.externalLog, 'utf8').split('\n').filter(Boolean);
}

export interface LaunchOptions {
  /** The profile to use: the test's own by default; pass the same one again to relaunch. */
  profile?: Profile;
  /** Leave the first-run welcome alone (by default the tour is marked seen, as in apps/web's e2e). */
  firstRun?: boolean;
  /** More command-line arguments (files to open, Task 3). */
  args?: string[];
  /** More environment (test hooks of later tasks, such as DRAFTER_E2E_DIALOG). */
  env?: Record<string, string>;
}

export interface Launched {
  app: ElectronApplication;
  /** The main window, with the editor ready. */
  page: Page;
  profile: Profile;
  /** Console errors and uncaught page errors seen in the main window (CSP violations among them). */
  errors: string[];
  /** Quits the app and waits for it to exit. */
  close(): Promise<void>;
}

/** The editor's text area. */
export const editor = (page: Page) => page.locator('.cm-content');

/** The text in the editor. */
export const editorText = (page: Page) => editor(page).evaluate((el) => el.textContent ?? '');

/** The first-run welcome dialog. */
export const welcome = (page: Page) =>
  page.getByRole('alertdialog', { name: 'Welcome to Drafter' });

interface Row {
  id: string;
  title: string;
  source: string;
}

/** The scripts the app keeps in IndexedDB (its recovery copies); none before the first is made. */
export function stored(page: Page): Promise<Row[]> {
  return page.evaluate(
    () =>
      new Promise<Row[]>((resolve) => {
        const open = indexedDB.open('drafter');
        open.onerror = () => resolve([]);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('projects')) {
            db.close();
            resolve([]);
            return;
          }
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

/**
 * Waits until the app has started: the editor is there and the first script is stored.
 * (Playwright's `waitForFunction` can't be used: it compiles its predicate in the page, which the
 * app's CSP forbids. Locators and `expect.poll` over `evaluate` are fine.)
 */
export async function ready(page: Page) {
  await expect(editor(page)).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => (await stored(page)).length, { timeout: 30_000 })
    .toBeGreaterThan(0);
}

/** The tour's "seen" key (nuxt-guided-tour, app/tour/tour.config.ts). */
const TOUR_SEEN = 'drafter-tour-v1';

/** The environment the app runs with: the profile's folders, and the test hooks. */
function envFor(profile: Profile, extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...(process.env as Record<string, string>),
    HOME: profile.home,
    XDG_CONFIG_HOME: join(profile.home, '.config'),
    // Honoured only by an unpackaged app (src/main.ts).
    DRAFTER_USER_DATA: profile.userData,
    DRAFTER_E2E_EXTERNAL_LOG: profile.externalLog,
    // Every dialog answers from the queue (Cancel when it is empty): no test waits on a person.
    DRAFTER_E2E_DIALOG: profile.dialogs,
    ...extra,
  };
}

/** Second instances still running (`launchAgain`), stopped by the fixture when a test ends. */
const spawned = new Set<ReturnType<typeof spawn>>();

/**
 * Starts the app again with `profile`, as a person double-clicking it would, while an instance
 * already runs: the new one hands over to it and quits. Resolves with its exit code.
 */
export function launchAgain(profile: Profile, args: string[] = []): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(ELECTRON, [DESKTOP_DIR, ...args], {
      env: envFor(profile),
      stdio: 'ignore',
    });
    // Should the first instance be gone, this one would stay: it is stopped when the test ends.
    spawned.add(child);
    child.on('exit', () => spawned.delete(child));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('The second instance did not quit.'));
    }, 30_000);
    child.on('error', reject);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

async function launchApp(profile: Profile, options: LaunchOptions): Promise<Launched> {
  const app = await _electron.launch({
    executablePath: ELECTRON,
    args: [DESKTOP_DIR, ...(options.args ?? [])],
    env: envFor(profile, options.env),
    timeout: 60_000,
  });
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  if (!options.firstRun) {
    const seen = await page.evaluate((key) => localStorage.getItem(key), TOUR_SEEN);
    if (seen !== 'true') {
      await page.evaluate((key) => localStorage.setItem(key, 'true'), TOUR_SEEN);
      await page.reload();
      await ready(page);
    }
  }
  let closed = false;
  return {
    app,
    page,
    profile,
    errors,
    async close() {
      if (closed) return;
      closed = true;
      await app.close();
    },
  };
}

interface Fixtures {
  /** This test's profile. */
  profile: Profile;
  /** Launches the app (the test's profile unless another is given). */
  desktop: (options?: LaunchOptions) => Promise<Launched>;
}

export const test = base.extend<Fixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright's fixture signature.
  profile: async ({}, use) => {
    const profile = await newProfile();
    await use(profile);
    await rm(profile.dir, { recursive: true, force: true });
  },
  desktop: async ({ profile }, use, testInfo) => {
    const launched: Launched[] = [];
    await use(async (options = {}) => {
      const app = await launchApp(options.profile ?? profile, options);
      launched.push(app);
      return app;
    });
    for (const app of launched) {
      if (testInfo.status !== testInfo.expectedStatus && app.errors.length > 0) {
        await testInfo.attach('page errors', { body: app.errors.join('\n') });
      }
      await app.close().catch(() => {});
    }
    for (const child of spawned) child.kill();
    spawned.clear();
  },
});
