// Shared by both drivers: the long script, the bench script's source, and result helpers.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '../../..');
export const WEB = resolve(ROOT, 'apps/web/.output/public');
export const OUT = resolve(process.env.SPIKE_OUT ?? resolve(HERE, '../out'));
mkdirSync(OUT, { recursive: true });

export const BENCH = readFileSync(resolve(HERE, 'bench.js'), 'utf8');
const SAMPLE = readFileSync(resolve(ROOT, 'samples/screenplay.fountain'), 'utf8');
// The same script the app's e2e test calls 120 pages (apps/web/e2e/script.spec.ts): the sample
// from "# Act One" on, 85 times, about 206k characters.
export const LONG = `${SAMPLE.slice(SAMPLE.indexOf('# Act One'))}\n`.repeat(85);
export const MIN_PAGES = 110;
// 200 characters, typed at the start of the script (the worst place: every later offset moves).
export const PHRASE = 'Typing into a long script, one letter at a time. '.repeat(5).slice(0, 200);
export const PERSIST = `PERSISTED-${Date.now()}`;

/** A suffix for output files, so several runs (variants) can share one folder. */
export const VARIANT = process.env.SPIKE_VARIANT ? `-${process.env.SPIKE_VARIANT}` : '';
export const outName = (base, ext) => `${base}${VARIANT}.${ext}`;

/** Startup from the shell's own process start to the app being ready (bench/startup.js). */
export const startupOf = (info, startedAt) =>
  Number.isFinite(info.readyAtMs) && startedAt
    ? { processToReadyMs: Math.round(info.timeOrigin + info.readyAtMs - startedAt), navigationToReadyMs: info.readyAtMs }
    : { error: 'no ready mark', readyAtMs: info.readyAtMs };

export function save(name, data) {
  writeFileSync(resolve(OUT, name), `${JSON.stringify(data, null, 2)}\n`);
  console.log(`== ${name}\n${JSON.stringify(data, null, 2)}`);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
