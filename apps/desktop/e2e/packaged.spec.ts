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
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Browser, chromium, expect, type Page, test } from '@playwright/test';

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
/** The AppImage's launcher turns the sandbox off there, so the app refuses to run. */
const REFUSED = KIND === 'appimage' && RESTRICTED;

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
  stop(): Promise<void>;
}

interface LaunchOptions {
  args?: string[];
  env?: Record<string, string>;
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
  const home = await tempDir('drafter-packaged-');
  await mkdir(join(home, '.config'), { recursive: true });
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  // Nothing from the developer's environment may turn the sandbox off or make the app a Node.
  for (const name of ['ELECTRON_DISABLE_SANDBOX', 'ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS']) {
    delete env[name];
  }
  Object.assign(env, { HOME: home, XDG_CONFIG_HOME: join(home, '.config') }, options.env);
  const child = spawn(
    PACKAGED as string,
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
  return { child, endpoint, output: () => printed, home, stop };
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
  test.skip(REFUSED, 'The AppImage refuses to run here (tested below)');
  const running = await launch();
  const { browser, page } = await editorPage(running);
  expect(await page.title()).toMatch(/Drafter/i);
  // The shell's bridge is in the page.
  expect(await page.evaluate(() => typeof window.drafterDesktop?.platform)).toBe('string');
  await browser.close();
});

test('runs sandboxed, with no --no-sandbox from anywhere', async () => {
  test.skip(REFUSED, 'The AppImage refuses to run here (tested below)');
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
  test.skip(REFUSED, 'The AppImage refuses to run here (tested below)');
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
  test.skip(REFUSED, 'The AppImage refuses to run here (tested below)');
  const folder = await tempDir('drafter-packaged-files-');
  const file = join(folder, 'from the shell.fountain');
  await writeFile(file, 'Title: Packaged Opening\n\nINT. A KITCHEN - DAY\n\nSomeone arrives.\n');
  const running = await launch({ args: [file] });
  const { browser, page } = await editorPage(running);
  const hasOpen = await page.evaluate(
    () => typeof (window.drafterDesktop as { onOpenFile?: unknown } | undefined)?.onOpenFile,
  );
  test.skip(hasOpen !== 'function', 'The shell has no files yet (Task 3 adds opening from argv)');
  await expect(page.locator('.cm-content')).toContainText('INT. A KITCHEN - DAY');
  await browser.close();
});

test('installs a desktop entry, an icon, and an AppArmor profile', async () => {
  test.skip(KIND !== 'deb', 'Only the .deb installs system files');
  const entry = readFileSync('/usr/share/applications/drafter.desktop', 'utf8');
  expect(entry).toContain('Categories=Office;TextEditor;');
  expect(entry).toMatch(/MimeType=.*text\/x-fountain;/);
  expect(entry).toMatch(/MimeType=.*text\/markdown;/);
  expect(entry).toMatch(/^Exec=\/opt\/Drafter\/drafterdev %U$/m);
  expect(entry).not.toContain('--no-sandbox');
  expect(existsSync('/usr/share/icons/hicolor/512x512/apps/drafterdev.png')).toBe(true);
  expect(existsSync('/usr/bin/drafterdev')).toBe(true);
  const profile = readFileSync('/etc/apparmor.d/drafterdev', 'utf8');
  expect(profile).toMatch(/userns,/);
  expect(profile).toContain('/opt/Drafter/drafterdev');
});

test('refuses to run with the sandbox off, unless asked by name', async () => {
  test.skip(REFUSED, 'Covered by the AppImage’s own case below');
  // An explicit --no-sandbox, or the environment variable, stops the app with a message.
  for (const via of [{ args: ['--no-sandbox'] }, { env: { ELECTRON_DISABLE_SANDBOX: '1' } }]) {
    const running = await launch(via);
    await expect
      .poll(() => running.output(), { timeout: 20_000 })
      .toContain('Drafter won’t start without Chromium’s sandbox');
    const browser = await chromium.connectOverCDP(running.endpoint);
    const pages = browser.contexts().flatMap((context) => context.pages());
    expect(pages.map((page) => page.url()).filter((url) => url.startsWith('app://'))).toEqual([]);
    await browser.close();
    await running.stop();
  }
  // Said by name, it runs, and plainly without the sandbox.
  const running = await launch({
    args: ['--no-sandbox'],
    env: { DRAFTER_ALLOW_NO_SANDBOX: '1' },
  });
  const { browser } = await editorPage(running);
  const procs = family(running.child.pid as number, running.home)
    .map(inspect)
    .filter((proc): proc is Proc => proc !== null);
  expect(procs.some((proc) => proc.argv.includes('--no-sandbox'))).toBe(true);
  await browser.close();
});

test('the AppImage refuses to run on a system that blocks user namespaces', async () => {
  test.skip(!REFUSED, 'Only an AppImage on a system with the restriction');
  // Its launcher adds --no-sandbox there; the app sees it and stops.
  const running = await launch();
  await expect
    .poll(() => running.output(), { timeout: 20_000 })
    .toContain('Drafter won’t start without Chromium’s sandbox');
  const procs = family(running.child.pid as number, running.home)
    .map(inspect)
    .filter((proc): proc is Proc => proc !== null);
  expect(procs.filter((proc) => proc.argv.includes('--type=renderer'))).toEqual([]);
});
