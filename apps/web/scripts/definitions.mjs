// Definitions' file for drafter.dev (definitions design §7.2): W1913's lookup build, the pinned
// release asset named in `app/definitions/source.json`, downloaded once into a cache outside Git
// and checked against its SHA-256, then copied to `public/definitions/` for the site to serve. It is
// never committed and never precached: a writer's browser fetches it only when they ask to
// download the dictionary. A desktop build (`DRAFTER_DESKTOP=1`) leaves it out, since the desktop
// app downloads it from GitHub itself.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** The pinned file (`app/definitions/source.json`). */
export const DEFINITIONS_SOURCE = JSON.parse(
  readFileSync(join(here, '../app/definitions/source.json'), 'utf8'),
);

/** Where the release asset is: W1913's GitHub release. */
export const DEFINITIONS_URL = `https://github.com/cschweda/w1913/releases/download/${DEFINITIONS_SOURCE.release}/${DEFINITIONS_SOURCE.file}`;

/** Its path under `public/`. */
export const DEFINITIONS_PUBLIC = `definitions/${DEFINITIONS_SOURCE.file}`;

/** Whether `bytes` are exactly the pinned file. */
export function isTheFile(bytes) {
  return (
    bytes.byteLength === DEFINITIONS_SOURCE.size &&
    createHash('sha256').update(bytes).digest('hex') === DEFINITIONS_SOURCE.sha256
  );
}

/**
 * The cached copy's path, downloading it first if it isn't there (or isn't the file).
 * @param {string} cacheDir
 * @param {(url: string) => Promise<Response>} [fetcher]
 * @returns {Promise<string>}
 */
export async function cachedDefinitions(cacheDir, fetcher = (url) => fetch(url)) {
  const path = join(cacheDir, DEFINITIONS_SOURCE.file);
  if (existsSync(path) && isTheFile(readFileSync(path))) return path;
  const response = await fetcher(DEFINITIONS_URL);
  if (!response.ok) throw new Error(`${response.status} from ${DEFINITIONS_URL}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!isTheFile(bytes)) {
    throw new Error(`${DEFINITIONS_URL} isn't the pinned file (size or SHA-256 differs).`);
  }
  await mkdir(cacheDir, { recursive: true });
  const part = `${path}.part-${process.pid}`;
  await writeFile(part, bytes);
  await rename(part, path);
  return path;
}

/**
 * Puts the file in `publicDir/definitions/` (or, for the desktop, takes it away).
 * @param {string} publicDir
 * @param {string} cacheDir
 * @param {{ desktop?: boolean, fetcher?: (url: string) => Promise<Response> }} [options]
 * @returns {Promise<string | null>} the path written, or null for the desktop
 */
export async function syncDefinitions(publicDir, cacheDir, options = {}) {
  const folder = join(publicDir, 'definitions');
  await rm(folder, { recursive: true, force: true });
  if (options.desktop) return null;
  const cached = await cachedDefinitions(cacheDir, options.fetcher);
  await mkdir(folder, { recursive: true });
  const target = join(publicDir, DEFINITIONS_PUBLIC);
  await copyFile(cached, target);
  return target;
}
