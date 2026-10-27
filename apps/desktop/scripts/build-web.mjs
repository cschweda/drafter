// Builds the web app for the desktop (`DRAFTER_DESKTOP=1`: no service worker, no storage warning)
// and copies the static site to `apps/desktop/web/`, which the main process serves as app://drafter/.
// Run as `pnpm build:web` (the e2e suite's global setup runs it too).
//
// The build is the same command Netlify runs, plus the flag, into `apps/web/.output/public`; that
// folder is deleted first, so a stale build can't be copied. Extra environment (for example
// `DRAFTER_TEST_MODULES=1`) passes through.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WEB_APP = fileURLToPath(new URL('../../web/', import.meta.url));
const BUILT = fileURLToPath(new URL('../../web/.output/public/', import.meta.url));
const TARGET = fileURLToPath(new URL('../web/', import.meta.url));

export function buildWeb() {
  rmSync(fileURLToPath(new URL('../../web/.output/', import.meta.url)), {
    recursive: true,
    force: true,
  });
  execFileSync('pnpm', ['build'], {
    cwd: WEB_APP,
    stdio: 'inherit',
    env: { ...process.env, DRAFTER_DESKTOP: '1', NETLIFY: 'true' },
  });
  if (!existsSync(`${BUILT}index.html`))
    throw new Error(`The web build wrote no ${BUILT}index.html`);
  rmSync(TARGET, { recursive: true, force: true });
  cpSync(BUILT, TARGET, { recursive: true });
  console.log(`Copied the desktop web build to ${TARGET}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) buildWeb();
