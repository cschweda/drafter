// The Windows installer as a writer runs it: `pnpm e2e:packaged` with DRAFTER_PACKAGED set to the
// built `Drafter-<version>-windows-<arch>-setup.exe`. Windows only: CI's `windows` jobs run it
// (.github/workflows/desktop.yml), on x64 and on Arm.
//
// The tests run in order, on one installation: a silent per-user install into a folder of the
// test's own (`/S /D=…`), what it registered, the installed app opening a file named on its command
// line and handing a second launch's file to the first, the file type opening Drafter, and the
// uninstaller taking it all away again. As on Linux and the Mac the fuses keep Playwright's
// Electron driver out, so the page is driven over CDP, with a profile of its own
// (`--user-data-dir`). With DRAFTER_UPDATE_OLD and DRAFTER_UPDATE_NEW (two installers built by
// e2e/update-test.builder.cjs, 1.0.0 and 1.0.1, with a feed on this machine), a real update too:
// 1.0.0 finds 1.0.1, downloads it, and Restart runs the new installer, which starts 1.0.1.
import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { type Browser, chromium, expect, type Page, test } from '@playwright/test';
import { signingConfigured, updateConfigProblems } from '../scripts/check-update-config.mjs';

const INSTALLER = process.env.DRAFTER_PACKAGED ?? '';

test.skip(process.platform !== 'win32', 'The Windows installer');
test.skip(!/-setup\.exe$/.test(INSTALLER), 'DRAFTER_PACKAGED is not set to a built installer');
test.describe.configure({ mode: 'serial' });

const LAMP = 'Title: The Lamp\r\n\r\nEXT. LIGHTHOUSE - NIGHT\r\n\r\nThe lamp turns.\r\n';
const PILOT = 'Title: Pilot\r\n\r\nINT. CABIN - DAY\r\n\r\nThe radio crackles.\r\n';

/** Where the installer puts Drafter for this run, and the folders the tests write in. */
let root = '';
let installDir = '';
const exe = () => join(installDir, 'Drafter.exe');
const uninstaller = () => join(installDir, 'Uninstall Drafter.exe');
const startMenu = () =>
  join(process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Drafter.lnk');

test.beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'drafter-win-'));
  installDir = join(root, 'Programs', 'Drafter');
});
test.afterAll(async () => {
  killDrafters();
  await rm(root, { recursive: true, force: true }).catch(() => {});
});

const stops: (() => void)[] = [];
test.afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

/** PowerShell's answer, trimmed. */
const powershell = (script: string) =>
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
  }).trim();

/** A registry value (`reg query`), or null when there is none. */
function registry(key: string, name?: string): string | null {
  try {
    const out = execFileSync('reg', ['query', key, ...(name ? ['/v', name] : ['/ve'])], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const line = out.split(/\r?\n/).find((l) => /\sREG_\w+/.test(l));
    return line ? line.replace(/^.*?REG_\w+\s*/, '').trim() : '';
  } catch {
    return null;
  }
}
const keyExists = (key: string) => {
  try {
    execFileSync('reg', ['query', key], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

/** Every Drafter.exe running, with its command line. */
function drafters(): { pid: number; commandLine: string; path: string }[] {
  const out = powershell(
    'Get-CimInstance Win32_Process -Filter "Name=\'Drafter.exe\'" | ForEach-Object { "$($_.ProcessId)`t$($_.ExecutablePath)`t$($_.CommandLine)" }',
  );
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [pid, path, ...rest] = line.split('\t');
      return { pid: Number(pid), path: path ?? '', commandLine: rest.join('\t') };
    });
}
function killDrafters() {
  for (const { pid } of drafters()) {
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      // Gone already.
    }
  }
}

/**
 * Runs an installer or uninstaller and waits for it. NSIS takes `/D=` unquoted, to the end of the
 * line, so the folders given to it here have no spaces (Node would quote such an argument).
 */
function run(program: string, args: string[], timeout = 180_000) {
  execFileSync(program, args, { stdio: 'inherit', timeout });
}

/** A port nothing is listening on. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('no port')),
      );
    });
  });
}

/**
 * Starts the installed Drafter with `args`, a profile folder of its own (or `profile`), and DevTools
 * on a port; resolves with its editor page once it is there.
 */
async function launch(
  args: string[] = [],
  profile?: string,
): Promise<{ page: Page; profile: string; child: ChildProcess; browser: Browser }> {
  const dir = profile ?? join(root, `profile-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  const port = await freePort();
  const child = spawn(
    exe(),
    [...args, `--user-data-dir=${dir}`, `--remote-debugging-port=${port}`],
    {
      stdio: 'ignore',
    },
  );
  let browser: Browser | null = null;
  const until = Date.now() + 60_000;
  while (!browser) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    } catch (error) {
      if (Date.now() > until) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  const connected = browser;
  stops.push(() => {
    void connected.close().catch(() => {});
    killDrafters();
  });
  let page: Page | undefined;
  await expect
    .poll(
      () => {
        page = connected
          .contexts()
          .flatMap((c) => c.pages())
          .find((p) => p.url() === 'app://drafter/');
        return Boolean(page);
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  return { page: page as Page, profile: dir, child, browser: connected };
}

test('installs silently, for this user only, into the folder it is given', () => {
  test.setTimeout(240_000);
  run(INSTALLER, ['/S', `/D=${installDir}`]);
  expect(existsSync(exe()), exe()).toBe(true);
  expect(existsSync(uninstaller())).toBe(true);
  expect(existsSync(startMenu()), startMenu()).toBe(true);
  // Per user: the uninstall entry is the current user's, not the machine's.
  const uninstall = execFileSync(
    'reg',
    [
      'query',
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      '/s',
      '/f',
      'Drafter',
    ],
    { encoding: 'utf8' },
  );
  expect(uninstall).toMatch(/DisplayName\s+REG_SZ\s+Drafter/);
  expect(uninstall).toContain(installDir);
});

test('opens .fountain files, and offers itself for Markdown without taking it over', () => {
  expect(registry('HKCU\\Software\\Classes\\.fountain')).toBe('Drafter.fountain');
  expect(registry('HKCU\\Software\\Classes\\Drafter.fountain')).toBe('Fountain screenplay');
  const command = registry('HKCU\\Software\\Classes\\Drafter.fountain\\shell\\open\\command');
  expect(command).toBe(`"${exe()}" "%1"`);
  for (const ext of ['.md', '.markdown']) {
    expect(
      registry(`HKCU\\Software\\Classes\\${ext}\\OpenWithProgids`, 'Drafter.markdown'),
    ).not.toBeNull();
    // The app Markdown already opens in keeps it.
    expect(registry(`HKCU\\Software\\Classes\\${ext}`) ?? '').not.toMatch(/Drafter/);
  }
  expect(registry('HKCU\\Software\\Classes\\Drafter.markdown\\shell\\open\\command')).toBe(
    `"${exe()}" "%1"`,
  );
});

test('has Electron’s fuses set, as the Linux and Mac apps do', () => {
  const bytes = readFileSync(exe());
  const sentinel = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX');
  const at = bytes.indexOf(sentinel);
  expect(at, 'no fuse wire in Drafter.exe').toBeGreaterThan(0);
  const start = at + sentinel.length;
  expect(bytes[start]).toBe(1);
  expect(bytes.subarray(start + 2, start + 2 + 8).toString('latin1')).toBe('00001100');
});

test('updates from this repository’s releases, with a signature check exactly when it is signed', () => {
  const text = readFileSync(join(installDir, 'resources', 'app-update.yml'), 'utf8');
  console.log(`app-update.yml:\n${text}`);
  const config = createRequire(import.meta.url)('../electron-builder.config.cjs');
  const signed = signingConfigured(config, process.env);
  expect(updateConfigProblems(text, { signed })).toEqual([]);
  // Unsigned for now: no publisher, so electron-updater checks an update's sha512 only.
  expect(/^publisherName:/m.test(text)).toBe(signed);
});

test('opens a file named on its command line, sandboxed, and takes a second launch’s file', async () => {
  test.setTimeout(120_000);
  const scripts = join(root, 'My Scripts');
  mkdirSync(scripts, { recursive: true });
  const lamp = join(scripts, 'The Lamp.fountain');
  const pilot = join(scripts, 'PILOT.FOUNTAIN');
  writeFileSync(lamp, LAMP);
  writeFileSync(pilot, PILOT);
  const { page, profile } = await launch([lamp]);
  await expect(page.locator('.cm-content')).toContainText('The lamp turns.', { timeout: 30_000 });
  await expect.poll(() => page.title()).toBe('The Lamp — Drafter');
  expect(await page.evaluate(() => window.drafterDesktop?.platform)).toBe('win32');
  expect(await page.evaluate(() => typeof (globalThis as { require?: unknown }).require)).toBe(
    'undefined',
  );
  // Chromium's sandbox: no Drafter process was started without it.
  const running = drafters();
  expect(running.length).toBeGreaterThan(1);
  for (const proc of running) expect(proc.commandLine).not.toContain('--no-sandbox');
  expect(running.some((p) => p.commandLine.includes('--type=renderer'))).toBe(true);

  // A second launch with the same profile hands its file over and quits.
  const second = spawn(exe(), [pilot, `--user-data-dir=${profile}`], { stdio: 'ignore' });
  const code = await new Promise<number | null>((resolve) => second.on('exit', resolve));
  expect(code).toBe(0);
  await expect(page.locator('.cm-content')).toContainText('The radio crackles.', {
    timeout: 30_000,
  });
  await expect.poll(() => page.title()).toBe('Pilot — Drafter');
});

test('a .fountain file opens in Drafter, as a double-click in Explorer opens it', async () => {
  test.setTimeout(90_000);
  const file = join(root, 'Opened from Explorer.fountain');
  writeFileSync(file, LAMP);
  // `start` opens a file with its registered type, as Explorer does.
  execFileSync('cmd.exe', ['/d', '/c', 'start', '""', file], { stdio: 'ignore' });
  let found: ReturnType<typeof drafters>[number] | undefined;
  await expect
    .poll(
      () => {
        found = drafters().find((p) => p.commandLine.includes(basename(file)));
        return Boolean(found);
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  expect(found?.path.toLowerCase()).toBe(exe().toLowerCase());
  killDrafters();
});

test('uninstalls silently, taking its files, shortcut, and file types, and leaving the writer’s', async () => {
  test.setTimeout(180_000);
  killDrafters();
  run(uninstaller(), ['/S']);
  // The uninstaller copies itself elsewhere and goes on from there: wait for it to finish.
  await expect.poll(() => existsSync(exe()), { timeout: 120_000 }).toBe(false);
  await expect.poll(() => existsSync(startMenu()), { timeout: 60_000 }).toBe(false);
  await expect
    .poll(() => keyExists('HKCU\\Software\\Classes\\Drafter.fountain'), { timeout: 60_000 })
    .toBe(false);
  expect(keyExists('HKCU\\Software\\Classes\\Drafter.markdown')).toBe(false);
  expect(registry('HKCU\\Software\\Classes\\.fountain') ?? '').not.toBe('Drafter.fountain');
  for (const ext of ['.md', '.markdown']) {
    expect(
      registry(`HKCU\\Software\\Classes\\${ext}\\OpenWithProgids`, 'Drafter.markdown'),
    ).toBeNull();
  }
  // The profiles the tests used (recovery copies, settings) are the writer's, and stay.
  expect(existsSync(join(root, 'My Scripts', 'The Lamp.fountain'))).toBe(true);
});

test('updates itself for real: 1.0.0 downloads 1.0.1, and Restart installs and starts it', async () => {
  const OLD = process.env.DRAFTER_UPDATE_OLD;
  const NEW = process.env.DRAFTER_UPDATE_NEW;
  const PORT = Number(process.env.DRAFTER_UPDATE_PORT);
  test.skip(!OLD || !NEW || !PORT, 'The update test’s installers are not given (CI builds them)');
  test.setTimeout(420_000);
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const oldSetup = join(OLD as string, `Drafter-1.0.0-windows-${arch}-setup.exe`);
  const newName = `Drafter-1.0.1-windows-${arch}-setup.exe`;
  const newBytes = readFileSync(join(NEW as string, newName));
  const newFeed = readFileSync(join(NEW as string, 'latest.yml'), 'utf8');
  expect(newFeed).toMatch(/^version: 1\.0\.1$/m);

  const seen: string[] = [];
  const server = createHttpServer((request, response) => {
    const path = (request.url ?? '').split('?')[0] ?? '';
    seen.push(path);
    if (path === '/latest.yml') response.writeHead(200).end(newFeed);
    else if (path === `/${newName}`) {
      response.writeHead(200, { 'content-length': newBytes.length }).end(newBytes);
    } else response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(PORT, '127.0.0.1', resolve));
  try {
    installDir = join(root, 'Programs', 'DrafterUpdate');
    run(oldSetup, ['/S', `/D=${installDir}`]);
    const version = () =>
      // Windows gives four parts: 1.0.0.0.
      powershell(
        `(Get-Item -LiteralPath '${exe().replaceAll("'", "''")}').VersionInfo.ProductVersion`,
      ).replace(/^(\d+\.\d+\.\d+)\.0$/, '$1');
    expect(version()).toBe('1.0.0');
    const { page } = await launch();
    // Past the first-run welcome, as a writer who has used Drafter (the offer comes again after it).
    await page.evaluate(() => localStorage.setItem('drafter-tour-v1', 'true'));
    await page.reload();
    const toast = page.locator('[data-update]');
    await expect(toast).toContainText('A new version of Drafter is ready', { timeout: 180_000 });
    expect(seen).toContain(`/${newName}`);
    await toast.getByRole('button', { name: 'Restart', exact: true }).click();
    // The old Drafter quits, the new installer replaces it, and the new version starts.
    await expect.poll(version, { timeout: 180_000, intervals: [1000] }).toBe('1.0.1');
    await expect
      .poll(() => drafters().some((p) => p.path.toLowerCase() === exe().toLowerCase()), {
        timeout: 120_000,
        intervals: [1000],
      })
      .toBe(true);
  } finally {
    server.close();
    killDrafters();
    if (existsSync(uninstaller())) run(uninstaller(), ['/S']);
  }
});
