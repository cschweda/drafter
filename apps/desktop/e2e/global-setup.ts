import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildWeb } from '../scripts/build-web.mjs';

/**
 * Builds the web app for the desktop (DRAFTER_DESKTOP=1) once for the whole suite, and checks the
 * main process is built and Electron's binary is there (Electron 45 downloads it on first use).
 * `DRAFTER_E2E_REUSE_WEB=1` keeps an existing `web/`, for a quicker rerun while working on the
 * shell alone.
 */
export default function globalSetup() {
  const main = fileURLToPath(new URL('../dist/main.cjs', import.meta.url));
  if (!existsSync(main))
    throw new Error('No dist/main.cjs: run `pnpm e2e`, which builds it first.');
  createRequire(import.meta.url)('electron');
  const web = fileURLToPath(new URL('../web/index.html', import.meta.url));
  if (process.env.DRAFTER_E2E_REUSE_WEB === '1' && existsSync(web)) return;
  buildWeb();
}
