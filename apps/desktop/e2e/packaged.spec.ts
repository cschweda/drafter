// The packaged app (Plan 6 Task 7): the AppImage, the installed .deb, or the unpacked build, as a
// user gets it. Run by `pnpm e2e:packaged` (playwright.packaged.config.ts) with DRAFTER_PACKAGED set
// to the program to launch and DRAFTER_PACKAGED_KIND to `appimage`, `deb`, or `unpacked`. Linux only,
// under a display (xvfb in CI). CI runs the .deb, and the AppImage first, with Ubuntu 24.04's default
// user-namespace restriction on, which is what these tests are for: the app must run with
// Chromium's sandbox, never with `--no-sandbox` slipped in by a launcher. The .deb brings an
// AppArmor profile that allows the sandbox. The AppImage's launcher adds `--no-sandbox` on such a
// system, so the app refuses to run (src/sandbox.ts) until user namespaces are allowed.
//
// The packaged binary has Electron's `--inspect` and `ELECTRON_RUN_AS_NODE` switched off (its fuses),
// so Playwright's Electron driver, which needs `--inspect`, can't start it. These tests start it
// themselves with Chromium's `--remote-debugging-port` and drive its page over CDP; the process
// checks read /proc.
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Browser, chromium, expect, type Page, test } from '@playwright/test';
import { markerFor, type SandboxReason } from '../src/sandbox';
import { editor, stored } from './helpers';

const PACKAGED = process.env.DRAFTER_PACKAGED;
const KIND = process.env.DRAFTER_PACKAGED_KIND ?? 'unpacked';

test.skip(!PACKAGED, 'DRAFTER_PACKAGED is not set (the packaged app to launch)');
test.skip(process.platform !== 'linux', 'The packages are for Linux');

/** True when this system blocks unprivileged user namespaces (Ubuntu 24.04's default). */
const RESTRICTED = (() => {
  try {
    return (
      readFileSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').trim() === '1'
    );
  } catch {
    return false;
  }
})();
/** The AppImage's launcher turns the sandbox off there, so the app asks first. */
/** An AppArmor profile for the AppImage's own path was loaded (DRAFTER_APPIMAGE_PROFILED=1): then its launcher's user-namespace test may pass. */
const PROFILED = process.env.DRAFTER_APPIMAGE_PROFILED === '1';
const REFUSED = KIND === 'appimage' && RESTRICTED && !PROFILED;

/**
 * MERGE CHECKLIST: flip to `true` when Task 3 (opening files from the command line) is merged. While it
 * is `false` the test below is skipped, and shows as skipped in every run; once it is `true` the test
 * is a hard assertion, with no way to skip itself.
 */
const SHELL_OPENS_FILES = true;

const SANDBOX_QUESTION = 'Drafter is about to start without Chromium’s sandbox';

/** What Electron prints when its Node inspector is listening, or Node runs the app's `-e`. */
const INSPECTOR_BANNER = /Debugger listening on ws:/;

interface Running {
  child: ChildProcess;
  /** Chromium's DevTools endpoint, from its first line on stderr. */
  endpoint: string;
  /** Everything the app printed so far. */
  output(): string;
  /** HOME for this launch. */
  home: string;
  /** The exit code once the app has exited, else undefined. */
  exited(): number | null | undefined;
  stop(): Promise<void>;
}

interface LaunchOptions {
  /** Runs with this launch's HOME before the app starts (to leave files in its profile). */
  before?: (home: string) => Promise<void>;
  args?: string[];
  env?: Record<string, string>;
  /** Start with this HOME (an earlier launch's) instead of a new one. */
  home?: string;
  /** Launch this program instead of DRAFTER_PACKAGED. */
  program?: string;
}

const stops: (() => Promise<void>)[] = [];
const dirs: string[] = [];

test.afterEach(async () => {
  for (const stop of stops.splice(0)) await stop().catch(() => {});
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function tempDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

/** Launches the packaged app with a profile of its own, and waits until DevTools is listening. */
async function launch(options: LaunchOptions = {}): Promise<Running> {
  const home = options.home ?? (await tempDir('drafter-packaged-'));
  await mkdir(join(home, '.config'), { recursive: true });
  await options.before?.(home);
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  // Nothing from the developer's environment may turn the sandbox off or make the app a Node.
  for (const name of ['ELECTRON_DISABLE_SANDBOX', 'ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS']) {
    delete env[name];
  }
  Object.assign(env, { HOME: home, XDG_CONFIG_HOME: join(home, '.config') }, options.env);
  const child = spawn(
    options.program ?? (PACKAGED as string),
    ['--remote-debugging-port=0', ...(options.args ?? [])],
    // Its own process group, so stopping it stops the AppImage's launcher and the app together.
    { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let printed = '';
  const collect = (chunk: Buffer) => {
    printed += chunk.toString();
  };
  child.stdout?.on('data', collect);
  child.stderr?.on('data', collect);
  let exited: number | null | undefined;
  child.on('exit', (code) => {
    exited = code;
  });
  const stop = async () => {
    if (child.pid === undefined || exited !== undefined) return;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // Already gone.
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
    if (exited === undefined) {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        // Gone.
      }
    }
  };
  stops.push(stop);
  let endpoint = '';
  await expect
    .poll(
      () => {
        endpoint = /DevTools listening on (ws:\/\/\S+)/.exec(printed)?.[1] ?? '';
        if (!endpoint && exited !== undefined) {
          throw new Error(`The app exited (${exited}) before it was ready:\n${printed}`);
        }
        return endpoint;
      },
      {
        timeout: 60_000,
        message: 'DevTools never listened (see the app output in the error above)',
      },
    )
    .not.toBe('');
  return { child, endpoint, output: () => printed, home, exited: () => exited, stop };
}

/** The app's first page, over CDP, with the editor showing. */
async function editorPage(running: Running): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.connectOverCDP(running.endpoint);
  let page: Page | undefined;
  await expect
    .poll(
      () => {
        page = browser
          .contexts()
          .flatMap((context) => context.pages())
          .find((candidate) => candidate.url().startsWith('app://drafter/'));
        return page !== undefined;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  const found = page as Page;
  await expect(found.locator('.cm-content')).toBeVisible({ timeout: 30_000 });
  return { browser, page: found };
}

/** The tour's "seen" key (as in e2e/helpers.ts): the welcome is left out, as the shell's e2e does. */
const TOUR_SEEN = 'drafter-tour-v1';

/** The editor, ready to write in: the welcome out of the way and the sample stored. */
async function writingPage(running: Running): Promise<{ browser: Browser; page: Page }> {
  const { browser, page } = await editorPage(running);
  if ((await page.evaluate((key) => localStorage.getItem(key), TOUR_SEEN)) !== 'true') {
    await page.evaluate((key) => localStorage.setItem(key, 'true'), TOUR_SEEN);
    await page.reload();
  }
  await expect(editor(page)).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => (await stored(page)).length, { timeout: 30_000 })
    .toBeGreaterThan(0);
  return { browser, page };
}

/** True when the `xdotool` command is there. */
const HAS_XDOTOOL = (() => {
  try {
    execFileSync('xdotool', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

/** Real key presses through the X server (XTEST), as a person's keyboard sends them. */
function xdotool(...args: string[]): string {
  return execFileSync('xdotool', args, { encoding: 'utf8', timeout: 15_000 }).trim();
}

/**
 * The processes of one launch: those under `root` by their parent links, and any other that carries
 * this launch's own HOME in its environment (the temp folder is unique to the launch, and every
 * Chromium helper inherits it, wherever its parent link has gone).
 */
function family(root: number, home: string): number[] {
  const parent = new Map<number, number>();
  const marked = new Set<number>();
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    try {
      const stat = readFileSync(`/proc/${entry}/stat`, 'utf8');
      // "pid (comm) state ppid …": comm may hold spaces and parentheses, so cut at the last ")".
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      parent.set(pid, Number(fields[1]));
    } catch {
      continue; // The process ended while we looked.
    }
    try {
      if (readFileSync(`/proc/${entry}/environ`, 'utf8').split('\0').includes(`HOME=${home}`)) {
        marked.add(pid);
      }
    } catch {
      // Not ours to read.
    }
  }
  const found = new Set<number>([root, ...marked]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [pid, ppid] of parent) {
      if (!found.has(pid) && found.has(ppid)) {
        found.add(pid);
        grew = true;
      }
    }
  }
  return [...found];
}

interface Proc {
  pid: number;
  argv: string[];
  seccomp: string;
  noNewPrivs: string;
}

function inspect(pid: number): Proc | null {
  try {
    // Chromium's helpers rewrite their command line into one string, so split on spaces too.
    const argv = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split(/[\0 ]/).filter(Boolean);
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    const field = (name: string) => new RegExp(`^${name}:\\s*(\\S+)`, 'm').exec(status)?.[1] ?? '';
    return { pid, argv, seccomp: field('Seccomp'), noNewPrivs: field('NoNewPrivs') };
  } catch {
    return null;
  }
}

test('launches, and shows the editor', async () => {
  test.skip(REFUSED, 'The AppImage asks about the sandbox here (tested below)');
  const running = await launch();
  const { browser, page } = await editorPage(running);
  expect(await page.title()).toMatch(/Drafter/i);
  // The shell's bridge is in the page.
  expect(await page.evaluate(() => typeof window.drafterDesktop?.platform)).toBe('string');
  await browser.close();
});

test('runs sandboxed, with no --no-sandbox from anywhere', async () => {
  test.skip(REFUSED, 'The AppImage asks about the sandbox here (tested below)');
  const running = await launch();
  const { browser } = await editorPage(running);
  const procs = family(running.child.pid as number, running.home)
    .map(inspect)
    .filter((proc): proc is Proc => proc !== null);
  const type = (proc: Proc) => proc.argv.find((arg) => arg.startsWith('--type='));
  const renderers = procs.filter((proc) => type(proc) === '--type=renderer');
  expect(
    renderers.length,
    `no renderer process found among:\n${procs.map((proc) => `${proc.pid} ${proc.argv.join(' ').slice(0, 200)}`).join('\n')}`,
  ).toBeGreaterThan(0);
  // Nothing in the tree (the launcher, the app, its helpers) was started without the sandbox.
  for (const proc of procs) {
    expect(proc.argv, `pid ${proc.pid} ${proc.argv.join(' ')}`).not.toContain('--no-sandbox');
  }
  // A sandboxed renderer runs under a seccomp filter (2) and can't gain privileges.
  for (const renderer of renderers) {
    expect(renderer.seccomp, `renderer ${renderer.pid} seccomp`).toBe('2');
    expect(renderer.noNewPrivs, `renderer ${renderer.pid} no_new_privs`).toBe('1');
  }
  expect(running.output()).not.toMatch(/sandbox.*(disabled|not usable|failed)/i);
  await browser.close();
});

test('is not a Node runtime, and takes no Node switches', async () => {
  test.skip(REFUSED, 'The AppImage asks about the sandbox here (tested below)');
  // With the fuses off, none of these does anything: the app starts as usual. With them on, Node would
  // run the `-e` script and exit, the inspector would listen, or the missing `--require` would fail.
  const running = await launch({
    env: {
      ELECTRON_RUN_AS_NODE: '1',
      NODE_OPTIONS: '--inspect=0 --require /nonexistent/drafter.js',
    },
    args: ['--inspect=0', '--inspect-brk=0', '-e', 'console.log("DRAFTER_RAN_AS_NODE")'],
  });
  const { browser } = await editorPage(running);
  expect(running.output()).not.toContain('DRAFTER_RAN_AS_NODE');
  expect(running.output()).not.toMatch(INSPECTOR_BANNER);
  expect(running.output()).not.toContain('/nonexistent/drafter.js');
  await browser.close();
});

test('brings its spellcheck dictionary, and copies it into the profile', async () => {
  test.skip(REFUSED, 'The AppImage asks about the sandbox here (tested below)');
  // The dictionaries come with the app once the spellchecker is merged (apps/desktop/dictionaries/).
  test.skip(
    !existsSync(new URL('../dictionaries/', import.meta.url)),
    'This build of the app has no dictionaries',
  );
  const running = await launch();
  const { browser } = await editorPage(running);
  // Read from inside app.asar, and copied where Chromium looks before it would download one.
  const seeded = join(running.home, '.config', 'Drafter', 'Dictionaries');
  await expect
    .poll(() => (existsSync(seeded) ? readdirSync(seeded) : []).filter((n) => n.endsWith('.bdic')))
    .not.toEqual([]);
  await browser.close();
});

test('has Electron’s fuses set', async () => {
  test.skip(
    KIND === 'appimage',
    'An AppImage’s binary is inside its squashfs; the unpacked build and the .deb are checked',
  );
  const binary = realpathSync(PACKAGED as string);
  const bytes = readFileSync(binary);
  const sentinel = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX');
  const at = bytes.indexOf(sentinel);
  expect(at, 'no fuse wire in the binary').toBeGreaterThan(0);
  const start = at + sentinel.length;
  const version = bytes[start];
  const length = bytes[start + 1];
  expect(version).toBe(1);
  // '0' is off, '1' is on, in Electron's order.
  const wire = bytes.subarray(start + 2, start + 2 + length).toString('latin1');
  const names = [
    'RunAsNode',
    'EnableCookieEncryption',
    'EnableNodeOptionsEnvironmentVariable',
    'EnableNodeCliInspectArguments',
    'EnableEmbeddedAsarIntegrityValidation',
    'OnlyLoadAppFromAsar',
    'LoadBrowserProcessSpecificV8Snapshot',
    'GrantFileProtocolExtraPrivileges',
  ];
  const state = Object.fromEntries(names.map((name, index) => [name, wire[index]]));
  expect(state).toEqual({
    RunAsNode: '0',
    EnableCookieEncryption: '0',
    EnableNodeOptionsEnvironmentVariable: '0',
    EnableNodeCliInspectArguments: '0',
    EnableEmbeddedAsarIntegrityValidation: '1',
    OnlyLoadAppFromAsar: '1',
    LoadBrowserProcessSpecificV8Snapshot: '0',
    GrantFileProtocolExtraPrivileges: '0',
  });
});

test('opens a file from the command line', async () => {
  test.skip(
    !SHELL_OPENS_FILES,
    'Task 3 (files) is not merged yet: flip SHELL_OPENS_FILES when it is',
  );
  test.skip(REFUSED, 'The AppImage asks about the sandbox here (tested below)');
  const folder = await tempDir('drafter-packaged-files-');
  const file = join(folder, 'from the shell.fountain');
  await writeFile(file, 'Title: Packaged Opening\n\nINT. A KITCHEN - DAY\n\nSomeone arrives.\n');
  const running = await launch({ args: [file] });
  const { browser, page } = await editorPage(running);
  await expect(page.locator('.cm-content')).toContainText('INT. A KITCHEN - DAY');
  await browser.close();
});

test('installs a desktop entry, an icon, and an AppArmor profile', async () => {
  test.skip(KIND !== 'deb', 'Only the .deb installs system files');
  const entry = readFileSync('/usr/share/applications/drafter.desktop', 'utf8');
  expect(entry).toContain('Categories=Office;TextEditor;');
  expect(entry).toMatch(/MimeType=.*text\/x-fountain;/);
  expect(entry).toMatch(/MimeType=.*text\/markdown;/);
  // %F: the files' paths, which the app opens (Exec takes no other arguments).
  expect(entry).toMatch(/^Exec=\/opt\/Drafter\/drafterdev %F$/m);
  expect(entry).not.toContain('--no-sandbox');
  expect(entry.match(/text\/markdown/g)).toHaveLength(1);
  // The MIME types' file globs, one extension each (a list would be one glob that matches nothing).
  const mime = readFileSync('/usr/share/mime/packages/drafterdev.xml', 'utf8');
  expect(mime).toContain('<glob pattern="*.fountain"/>');
  expect(mime).toContain('<glob pattern="*.md"/>');
  expect(mime).not.toMatch(/pattern="[^"]*,/);
  // And the system's MIME database (rebuilt by the .deb's post-install) now types a .fountain file
  // text/x-fountain, so a file manager offers Drafter for it. (xdg-mime can't say: with no desktop
  // environment it asks `file`, which knows only text/plain.)
  const globs = readFileSync('/usr/share/mime/globs2', 'utf8');
  expect(globs).toMatch(/^\d+:text\/x-fountain:\*\.fountain$/m);
  expect(globs).toMatch(/^\d+:text\/markdown:\*\.md$/m);
  expect(existsSync('/usr/share/icons/hicolor/512x512/apps/drafterdev.png')).toBe(true);
  expect(existsSync('/usr/bin/drafterdev')).toBe(true);
  const profile = readFileSync('/etc/apparmor.d/drafterdev', 'utf8');
  expect(profile).toMatch(/userns,/);
  expect(profile).toContain('/opt/Drafter/drafterdev');
});

test('the window’s class is the desktop entry’s StartupWMClass', async () => {
  test.skip(KIND !== 'deb', 'Only the .deb installs a desktop entry to compare with');
  test.skip(REFUSED, 'Not an AppImage');
  const entry = readFileSync('/usr/share/applications/drafter.desktop', 'utf8');
  const wanted = /^StartupWMClass=(.+)$/m.exec(entry)?.[1];
  expect(wanted, 'the desktop entry has no StartupWMClass').toBeTruthy();
  const running = await launch();
  const { browser } = await editorPage(running);
  // Every window on the display, with its WM_CLASS: `0x… "title": ("instance" "class")`.
  const tree = execFileSync('xwininfo', ['-root', '-tree'], { encoding: 'utf8' });
  const classes = [...tree.matchAll(/"[^"]*": \("([^"]*)" "([^"]*)"\)/g)].map((m) => m[2]);
  expect(classes, `StartupWMClass=${wanted}; the windows are:\n${tree}`).toContain(wanted);
  await browser.close();
});

/** Leaves the answer "Continue" for a reason in the profile of the launch about to start. */
const continued = (reason: SandboxReason) => async (home: string) => {
  const dir = join(home, '.config', 'Drafter');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, markerFor(reason)), 'continue\n');
};

/** The question is on the screen: said on stderr, the app alive, no window, no renderer. */
async function expectQuestionOnly(running: Running) {
  await expect.poll(() => running.output(), { timeout: 20_000 }).toContain(SANDBOX_QUESTION);
  expect(running.exited()).toBeUndefined();
  const browser = await chromium.connectOverCDP(running.endpoint);
  const pages = browser.contexts().flatMap((context) => context.pages());
  expect(pages.map((page) => page.url()).filter((url) => url.startsWith('app://'))).toEqual([]);
  await browser.close();
  const procs = family(running.child.pid as number, running.home)
    .map(inspect)
    .filter((proc): proc is Proc => proc !== null);
  expect(procs.filter((proc) => proc.argv.includes('--type=renderer'))).toEqual([]);
}

/** The app runs, and some process in it has the sandbox off. */
async function expectRunningUnsandboxed(running: Running) {
  const { browser } = await editorPage(running);
  expect(running.output()).not.toContain(SANDBOX_QUESTION);
  const procs = family(running.child.pid as number, running.home)
    .map(inspect)
    .filter((proc): proc is Proc => proc !== null);
  expect(procs.some((proc) => proc.argv.includes('--no-sandbox'))).toBe(true);
  await browser.close();
}

test('asks before running with the sandbox off', async () => {
  test.skip(REFUSED, 'The AppImage’s own case is below');
  // `--no-sandbox`, and ELECTRON_DISABLE_SANDBOX set to anything (empty too), each stop at the question.
  for (const via of [
    { args: ['--no-sandbox'] },
    { env: { ELECTRON_DISABLE_SANDBOX: '1' } },
    { env: { ELECTRON_DISABLE_SANDBOX: '' } },
  ]) {
    const running = await launch(via);
    await expectQuestionOnly(running);
    await running.stop();
  }
});

test('carries on without the sandbox once that was chosen, or when asked by name', async () => {
  test.skip(REFUSED, 'The AppImage’s own case is below');
  // The answer "Continue" is kept per reason, in the profile.
  await expectRunningUnsandboxed(
    await launch({ args: ['--no-sandbox'], before: continued('no-sandbox-switch') }),
  );
  // An answer for another reason doesn't count.
  const other = await launch({ args: ['--no-sandbox'], before: continued('disable-sandbox-env') });
  await expectQuestionOnly(other);
  await other.stop();
  // Said by name, it never asks, and leaves no answer behind.
  const byName = await launch({ args: ['--no-sandbox'], env: { DRAFTER_ALLOW_NO_SANDBOX: '1' } });
  await expectRunningUnsandboxed(byName);
  expect(existsSync(join(byName.home, '.config', 'Drafter', markerFor('no-sandbox-switch')))).toBe(
    false,
  );
});

test('the AppImage asks about the sandbox on a system that blocks user namespaces', async () => {
  test.skip(!REFUSED, 'Only an AppImage on a system with the restriction');
  // Its launcher adds --no-sandbox there; the app sees it and asks, with nothing else running.
  const asking = await launch();
  await expectQuestionOnly(asking);
  await asking.stop();
  // After "Continue" (kept in the profile) it runs, plainly without the sandbox.
  await expectRunningUnsandboxed(await launch({ before: continued('no-sandbox-switch') }));
});

test('quits on SIGTERM with no question, and the text is there at the next start', async () => {
  // The app's main process is the one signalled: the .deb's command and the unpacked binary are it;
  // an AppImage has its launcher in between.
  test.skip(KIND === 'appimage', 'The AppImage’s launcher stands between the signal and the app');
  const running = await launch();
  const { browser, page } = await writingPage(running);
  const before = (await stored(page)).length;
  await page.keyboard.press('Control+Alt+n');
  await expect.poll(async () => (await stored(page)).length).toBe(before + 1);
  await editor(page).click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText('\nINT. LIGHTHOUSE - NIGHT\n');
  await browser.close();
  // At once: the page's own write comes 750 ms after the last key, so only the flush keeps this.
  process.kill(running.child.pid as number, 'SIGTERM');
  // Gone within seconds: a question or any other dialog would hold the app open.
  await expect.poll(() => running.exited(), { timeout: 15_000 }).not.toBeUndefined();
  expect(running.output()).not.toContain(SANDBOX_QUESTION);

  const again = await launch({ home: running.home });
  const next = await writingPage(again);
  await expect(editor(next.page)).toContainText('INT. LIGHTHOUSE - NIGHT');
  await next.browser.close();
});

test('real keys: Alt+F opens the File menu, and Ctrl+Alt+N still makes one new screenplay', async () => {
  test.skip(KIND !== 'deb', 'Run once, on the installed .deb');
  // CI installs xdotool and sets DRAFTER_XDOTOOL=1, so there it can't skip itself.
  test.skip(
    !HAS_XDOTOOL && process.env.DRAFTER_XDOTOOL !== '1',
    'xdotool is not installed (CI has it)',
  );
  const running = await launch();
  const { browser, page } = await writingPage(running);
  const pid = String(running.child.pid);
  // The editor's window, given the X input focus (there is no window manager under xvfb).
  const window = xdotool('search', '--sync', '--onlyvisible', '--pid', pid).split(
    '\n',
  )[0] as string;
  xdotool('windowfocus', '--sync', window);
  await page.waitForTimeout(500);
  const count = async () => (await stored(page)).length;
  const start = await count();

  // Alt+F is the File menu's mnemonic (the menu bar's `&File`): the menu opens with its first item,
  // New screenplay, selected, and Enter chooses it. Had the keys reached the page instead, Enter
  // would be a new line in the script and no script would be made.
  xdotool('key', '--clearmodifiers', 'alt+f');
  await page.waitForTimeout(700);
  xdotool('key', '--clearmodifiers', 'Return');
  await expect
    .poll(count, { timeout: 10_000, message: 'Alt+F, Enter made no script' })
    .toBe(start + 1);

  // Ctrl+Alt+N, New screenplay's key, is not taken by the menu bar's Alt mnemonics: one script.
  xdotool('windowfocus', '--sync', window);
  xdotool('key', '--clearmodifiers', 'ctrl+alt+n');
  await expect
    .poll(count, { timeout: 10_000, message: 'Ctrl+Alt+N made no script' })
    .toBe(start + 2);
  await page.waitForTimeout(800);
  expect(await count()).toBe(start + 2);
  await browser.close();
});

/** `name` from an app.asar's header and data (the asar format: a pickled JSON header, then files). */
function readFromAsar(asar: string, name: string): string {
  const bytes = readFileSync(asar);
  // Pickle: [payload size][header pickle size][payload size][JSON length][JSON…]
  const headerSize = bytes.readUInt32LE(4);
  const jsonLength = bytes.readUInt32LE(12);
  const header = JSON.parse(bytes.subarray(16, 16 + jsonLength).toString('utf8')) as {
    files: Record<string, { offset: string; size: number }>;
  };
  const entry = header.files[name];
  if (!entry) throw new Error(`${name} is not in ${asar}`);
  const start = 8 + headerSize + Number(entry.offset);
  return bytes.subarray(start, start + entry.size).toString('utf8');
}

/** The processes whose environment carries this HOME, each with its environment. */
function launchedWith(home: string): { pid: number; argv: string[]; env: Map<string, string> }[] {
  const found = [];
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const vars = readFileSync(`/proc/${entry}/environ`, 'utf8').split('\0');
      if (!vars.includes(`HOME=${home}`)) continue;
      const env = new Map(
        vars.filter(Boolean).map((v) => [v.slice(0, v.indexOf('=')), v.slice(v.indexOf('=') + 1)]),
      );
      const argv = readFileSync(`/proc/${entry}/cmdline`, 'utf8').split('\0').filter(Boolean);
      found.push({ pid: Number(entry), argv, env });
    } catch {
      // Ended while we looked, or not ours.
    }
  }
  return found;
}

// The real thing, end to end: an AppImage of version 1.0.0 (built by CI for this test with a feed on
// this machine, e2e/update-test.builder.cjs) finds 1.0.1, downloads it, and on Restart, chosen on
// its page, electron-updater's own quitAndInstall replaces the file and starts the new version.
// DRAFTER_UPDATE_OLD and DRAFTER_UPDATE_NEW are those builds' folders; DRAFTER_UPDATE_PORT the
// feed's port, as built in.
test('an AppImage replaces itself in place on Restart, and the new version runs', async () => {
  const OLD = process.env.DRAFTER_UPDATE_OLD;
  const NEW = process.env.DRAFTER_UPDATE_NEW;
  const PORT = Number(process.env.DRAFTER_UPDATE_PORT);
  test.skip(!OLD || !NEW || !PORT, 'The update test’s builds are not given (CI builds them)');
  test.skip(KIND !== 'appimage' || REFUSED, 'An AppImage, with the sandbox usable');
  test.setTimeout(240_000);
  const NAME = 'Drafter-x86_64.AppImage';
  const newBytes = readFileSync(join(NEW as string, NAME));
  const newFeed = readFileSync(join(NEW as string, 'latest-linux.yml'), 'utf8');
  expect(newFeed).toContain(`url: ${NAME}`);
  expect(newFeed).toMatch(/^version: 1\.0\.1$/m);

  // The release server: the feed and the new AppImage, as GitHub would serve them (whole files).
  const seen: string[] = [];
  const server = createServer((request, response) => {
    const path = (request.url ?? '').split('?')[0] ?? '';
    seen.push(
      `${request.method} ${path}${request.headers.range ? ` ${request.headers.range}` : ''}`,
    );
    if (path === '/latest-linux.yml') response.writeHead(200).end(newFeed);
    else if (path === `/${NAME}`) {
      response.writeHead(200, { 'content-length': newBytes.length }).end(newBytes);
    } else response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', resolve));
  try {
    // Where a person keeps it: a folder of their own, under the release's name.
    const folder = await tempDir('drafter-apps-');
    const image = join(folder, NAME);
    await copyFile(join(OLD as string, NAME), image);
    await chmod(image, 0o755);
    const oldSha = createHash('sha512').update(readFileSync(image)).digest('base64');

    // Chromium's own log (the single-instance lock among it) for both versions: the new one inherits
    // this environment from the old, and its output is otherwise thrown away.
    const chromiumLog = join(folder, '..', `${NAME}.chromium.log`);
    const running = await launch({
      program: image,
      env: { ELECTRON_ENABLE_LOGGING: '1', ELECTRON_LOG_FILE: chromiumLog },
    });
    stops.push(async () => {
      for (const proc of launchedWith(running.home)) {
        try {
          process.kill(proc.pid, 'SIGKILL');
        } catch {
          // Gone.
        }
      }
    });
    const { browser, page } = await writingPage(running);
    expect(await page.evaluate(() => window.drafterDesktop?.platform)).toBe('linux');
    const toast = page.locator('[data-update]');
    await expect(toast).toContainText('A new version of Drafter is ready', { timeout: 120_000 });
    // What ran, and when, from Restart on: printed whatever happens, so a failure says why.
    const began = Date.now();
    const timeline: string[] = [];
    const known = new Set<number>();
    let oldGoneAt: number | undefined;
    const sample = setInterval(() => {
      const at = Date.now() - began;
      if (oldGoneAt === undefined && running.exited() !== undefined) {
        oldGoneAt = at;
        timeline.push(`${at} ms: the old AppImage's launcher exited (${running.exited()})`);
      }
      const now = launchedWith(running.home);
      for (const proc of now) {
        if (known.has(proc.pid) || proc.argv.some((arg) => arg.startsWith('--type='))) continue;
        known.add(proc.pid);
        timeline.push(
          `${at} ms: + ${proc.pid} ${proc.argv.slice(0, 3).join(' ')} APPIMAGE=${proc.env.get('APPIMAGE') ?? ''} SILENT=${proc.env.get('APPIMAGE_SILENT_INSTALL') ?? ''}`,
        );
      }
      for (const pid of known) {
        if (!existsSync(`/proc/${pid}`)) {
          known.delete(pid);
          timeline.push(`${at} ms: - ${pid}`);
        }
      }
    }, 100);
    const report = () => {
      clearInterval(sample);
      console.log(
        `update test, from Restart:\n  ${timeline.join('\n  ')}\nthe old Drafter printed:\n${running.output()}\nChromium's log:\n${existsSync(chromiumLog) ? readFileSync(chromiumLog, 'utf8').slice(-20_000) : '(none)'}`,
      );
    };
    stops.push(async () => report());
    await toast.getByRole('button', { name: 'Restart', exact: true }).click();

    // The old Drafter (its AppImage runtime, which waits for it) exits.
    await expect
      .poll(() => running.exited(), { timeout: 60_000, message: 'the old Drafter never quit' })
      .not.toBeUndefined();
    await browser.close().catch(() => {});
    expect(running.output()).not.toMatch(/install failed/);

    // The file at the same path is now the new version, and nothing else was left beside it.
    expect(readdirSync(folder)).toEqual([NAME]);
    expect(createHash('sha512').update(readFileSync(image)).digest('base64')).not.toBe(oldSha);
    expect(readFileSync(image).equals(newBytes)).toBe(true);

    // A new Drafter is running from that path: its main process (no --type) has APPIMAGE set to it,
    // and the app mounted from it is 1.0.1.
    let main: ReturnType<typeof launchedWith>[number] | undefined;
    await expect
      .poll(
        () => {
          main = launchedWith(running.home).find(
            (proc) =>
              proc.env.get('APPIMAGE') === image &&
              (proc.argv[0] ?? '').endsWith('/drafterdev') &&
              !proc.argv.some((arg) => arg.startsWith('--type=')),
          );
          return main !== undefined;
        },
        { timeout: 60_000, message: 'no new Drafter started from the AppImage' },
      )
      .toBe(true);
    const appDir = main?.env.get('APPDIR') as string;
    const version = JSON.parse(
      readFromAsar(join(appDir, 'resources', 'app.asar'), 'package.json'),
    ).version;
    expect(version).toBe('1.0.1');
    // It stays up (it took the lock instead of handing over to the old one and exiting), and shows
    // its window.
    await new Promise((resolve) => setTimeout(resolve, 3000));
    expect(existsSync(`/proc/${main?.pid}`)).toBe(true);
    if (HAS_XDOTOOL) {
      const windows = execFileSync(
        'xdotool',
        ['search', '--sync', '--onlyvisible', '--pid', String(main?.pid)],
        { encoding: 'utf8', timeout: 30_000 },
      ).trim();
      expect(windows).not.toBe('');
    }
    // What the updater fetched: the feed, then the AppImage.
    expect(seen.some((line) => line.startsWith('GET /latest-linux.yml'))).toBe(true);
    expect(seen.some((line) => line.startsWith(`GET /${NAME}`))).toBe(true);
    console.log(`update test: the server saw\n  ${seen.join('\n  ')}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
