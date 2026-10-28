// Builds the web app for the desktop (`DRAFTER_DESKTOP=1`: no service worker, no storage warning)
// and puts the static site in `apps/desktop/web/`, which the main process serves as app://drafter/.
// Run as `pnpm build:web` (the e2e suite's global setup runs it too).
//
// The build is the same command Netlify runs, plus the flag, into `apps/web/.output/public`; that
// folder is deleted first, so a stale build can't be copied, and again after the copy, so a
// desktop build is never left where a web deploy might pick it up. Extra environment (for example
// `DRAFTER_TEST_MODULES=1`) passes through.
//
// `web/` is replaced whole, never cleared and refilled: the new build is copied into a sibling
// folder first, and only then swapped in by renaming, so an app started during a rebuild finds
// either the old build or the new one, complete, and never a half-copied folder without its
// `_headers` (the content security policy the app refuses to start without).
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB_APP = fileURLToPath(new URL('../../web/', import.meta.url));
const BUILT = fileURLToPath(new URL('../../web/.output/public/', import.meta.url));
const TARGET = fileURLToPath(new URL('../web', import.meta.url));

/**
 * Replaces the folder `target` with a copy of `source`, atomically as far as a reader can tell:
 * `copy` fills a new sibling folder while `target` stays as it was, then two renames swap them and
 * the old one is deleted. If the copy fails, `target` is untouched. Leftovers of an earlier run that
 * was stopped halfway (`<name>.next-*`, `<name>.old-*`) are cleared first.
 * @param {string} source
 * @param {string} target
 * @param {(from: string, to: string) => void} [copy] how to fill the new folder (tests pass their own)
 */
export function replaceFolder(
  source,
  target,
  copy = (from, to) => cpSync(from, to, { recursive: true }),
) {
  const parent = dirname(target);
  const name = basename(target);
  for (const entry of existsSync(parent) ? readdirSync(parent) : []) {
    if (entry.startsWith(`${name}.next-`) || entry.startsWith(`${name}.old-`)) {
      rmSync(join(parent, entry), { recursive: true, force: true });
    }
  }
  const next = join(parent, `${name}.next-${process.pid}`);
  const old = join(parent, `${name}.old-${process.pid}`);
  try {
    copy(source, next);
  } catch (error) {
    rmSync(next, { recursive: true, force: true });
    throw error;
  }
  const hadOld = existsSync(target);
  if (hadOld) renameSync(target, old);
  try {
    renameSync(next, target);
  } catch (error) {
    // Put the old build back rather than leave no build at all.
    if (hadOld) renameSync(old, target);
    rmSync(next, { recursive: true, force: true });
    throw error;
  }
  if (hadOld) rmSync(old, { recursive: true, force: true });
}

/**
 * How to run pnpm: the pnpm that is running this (`npm_execpath`, its JavaScript entry, run by this
 * Node), or else `pnpm` from the PATH. On Windows that is `pnpm.cmd`, which only a shell can start
 * (Node refuses to run a .cmd without one), so it is started through one; its arguments are fixed.
 * @returns {{ file: string, args: string[], shell: boolean }}
 */
export function pnpmCommand(
  args,
  env = process.env,
  platform = process.platform,
  node = process.execPath,
) {
  const entry = env.npm_execpath;
  if (entry && /\.[cm]?js$/.test(entry) && /pnpm/i.test(entry)) {
    return { file: node, args: [entry, ...args], shell: false };
  }
  return { file: 'pnpm', args, shell: platform === 'win32' };
}

export function buildWeb() {
  rmSync(fileURLToPath(new URL('../../web/.output/', import.meta.url)), {
    recursive: true,
    force: true,
  });
  const pnpm = pnpmCommand(['build']);
  execFileSync(pnpm.file, pnpm.args, {
    shell: pnpm.shell,
    cwd: WEB_APP,
    stdio: 'inherit',
    env: { ...process.env, DRAFTER_DESKTOP: '1', NETLIFY: 'true' },
  });
  for (const needed of ['index.html', '_headers']) {
    if (!existsSync(join(BUILT, needed)))
      throw new Error(`The web build wrote no ${BUILT}${needed}`);
  }
  replaceFolder(BUILT, TARGET);
  // The desktop build (no service worker) is not left where a web deploy or preview could take it.
  rmSync(fileURLToPath(new URL('../../web/.output/', import.meta.url)), {
    recursive: true,
    force: true,
  });
  console.log(`Put the desktop web build in ${TARGET}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) buildWeb();
