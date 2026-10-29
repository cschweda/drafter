// The Mac app as `pnpm desktop:mac` builds it (docs/desktop-install-macos.md): run by
// `pnpm e2e:packaged` with DRAFTER_PACKAGED set to the built Drafter.app
// (`release/mac-arm64/Drafter.app` on Apple silicon). macOS only: CI's `mac` job runs it
// (.github/workflows/desktop.yml).
//
// A packaged app ignores the e2e suite's profile variable, and on a Mac its profile is always in
// ~/Library/Application Support/Drafter, whatever HOME says: each launch here passes Chromium's
// --user-data-dir instead, a folder of its own, so the writer's own scripts are never touched. As
// on Linux, the fuses keep Playwright's Electron driver out, so the page is driven over CDP.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type Browser, chromium, expect, type Page, test } from '@playwright/test';

const APP = process.env.DRAFTER_PACKAGED ?? '';

test.skip(process.platform !== 'darwin', 'The Mac app');
test.skip(!APP.endsWith('.app'), 'DRAFTER_PACKAGED is not set to a built Drafter.app');

const LAMP = 'Title: The Lamp\n\nEXT. LIGHTHOUSE - NIGHT\n\nThe lamp turns.\n';

const dirs: string[] = [];
const stops: (() => void)[] = [];
test.afterEach(async () => {
  for (const stop of stops.splice(0)) stop();
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

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

/** The process started with this profile, if it is running. */
function pidFor(profile: string): number | null {
  try {
    const out = execFileSync('pgrep', ['-f', `Contents/MacOS/Drafter --user-data-dir=${profile}`], {
      encoding: 'utf8',
    });
    return Number(out.trim().split('\n')[0]) || null;
  } catch {
    return null;
  }
}

/**
 * Opens the app as Finder does (`open -a`), naming `files`, which reach it as `open-file` events
 * before it is ready, with a profile of its own and DevTools on a port. Resolves with its page.
 */
async function openApp(
  files: string[] = [],
): Promise<{ page: Page; profile: string; pid: number }> {
  const root = await mkdtemp(join(tmpdir(), 'drafter-mac-'));
  dirs.push(root);
  const profile = join(root, 'profile');
  const port = await freePort();
  execFileSync('open', [
    '-n',
    '-a',
    APP,
    ...files,
    '--args',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
  ]);
  let browser: Browser | null = null;
  const until = Date.now() + 30_000;
  while (!browser) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    } catch (error) {
      if (Date.now() > until) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  const pid = pidFor(profile);
  expect(pid, 'the app with this profile is running').not.toBeNull();
  stops.push(() => {
    void browser?.close().catch(() => {});
    if (pid) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Gone already.
      }
    }
  });
  let page: Page | undefined;
  await expect
    .poll(() => {
      page = browser
        ?.contexts()
        .flatMap((c) => c.pages())
        .find((p) => p.url() === 'app://drafter/');
      return Boolean(page);
    })
    .toBe(true);
  return { page: page as Page, profile, pid: pid as number };
}

const plist = () =>
  JSON.parse(
    execFileSync('plutil', ['-convert', 'json', '-o', '-', join(APP, 'Contents', 'Info.plist')], {
      encoding: 'utf8',
    }),
  ) as Record<string, unknown>;

test('is signed ad hoc, whole, without the hardened runtime', () => {
  execFileSync('codesign', ['--verify', '--deep', '--strict', APP]);
  // codesign describes a signature on stderr.
  const about = execFileSync('sh', ['-c', 'codesign -dv --verbose=2 "$0" 2>&1', APP], {
    encoding: 'utf8',
  });
  expect(about).toContain('Signature=adhoc');
  expect(about).toContain('Identifier=dev.drafter.app');
  expect(about).toMatch(/flags=0x[0-9a-f]+\(adhoc\)/);
});

test('opens .fountain, .md, .markdown, and .fdx, and says a .fountain file is plain text', () => {
  const info = plist();
  expect(info.CFBundleIdentifier).toBe('dev.drafter.app');
  expect(info.CFBundleName).toBe('Drafter');
  const types = info.CFBundleDocumentTypes as {
    CFBundleTypeExtensions: string[];
    CFBundleTypeRole: string;
    LSHandlerRank: string;
  }[];
  expect(types.map((t) => [t.CFBundleTypeExtensions, t.CFBundleTypeRole, t.LSHandlerRank])).toEqual(
    [
      [['fountain'], 'Editor', 'Default'],
      [['md'], 'Editor', 'Alternate'],
      [['markdown'], 'Editor', 'Alternate'],
      [['fdx'], 'Viewer', 'Alternate'],
    ],
  );
  const [fountain] = info.UTImportedTypeDeclarations as {
    UTTypeIdentifier: string;
    UTTypeConformsTo: string[];
    UTTypeTagSpecification: Record<string, string[]>;
  }[];
  expect(fountain?.UTTypeConformsTo).toEqual(['public.plain-text']);
  expect(fountain?.UTTypeTagSpecification['public.filename-extension']).toEqual(['fountain']);
});

test('has Electron’s fuses set, as the Linux packages do', () => {
  const framework = join(
    APP,
    'Contents',
    'Frameworks',
    'Electron Framework.framework',
    'Electron Framework',
  );
  const bytes = readFileSync(framework);
  const sentinel = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX');
  const at = bytes.indexOf(sentinel);
  expect(at, 'no fuse wire in the framework').toBeGreaterThan(0);
  const start = at + sentinel.length;
  expect(bytes[start]).toBe(1);
  // RunAsNode, cookie encryption, NODE_OPTIONS, --inspect: off; asar integrity, asar only: on;
  // the browser's own V8 snapshot, file: privileges: off.
  const wire = bytes.subarray(start + 2, start + 2 + 8).toString('latin1');
  expect(wire).toBe('00001100');
});

test('opens a file Finder names as it starts, sandboxed, and quits on SIGTERM', async () => {
  const root = await mkdtemp(join(tmpdir(), 'drafter-mac-files-'));
  dirs.push(root);
  mkdirSync(join(root, 'Scripts'));
  const path = join(root, 'Scripts', 'The Lamp.fountain');
  writeFileSync(path, LAMP);
  const { page, pid } = await openApp([path]);
  await expect(page.locator('.cm-content')).toContainText('The lamp turns.', { timeout: 30_000 });
  await expect.poll(() => page.title()).toBe('The Lamp — Drafter');
  expect(await page.evaluate(() => window.drafterDesktop?.platform)).toBe('darwin');
  // The page is no Node: the sandbox and context isolation are on.
  expect(await page.evaluate(() => typeof (globalThis as { require?: unknown }).require)).toBe(
    'undefined',
  );
  process.kill(pid, 'SIGTERM');
  await expect
    .poll(() => {
      try {
        process.kill(pid, 0);
        return 'running';
      } catch {
        return 'gone';
      }
    })
    .toBe('gone');
});
