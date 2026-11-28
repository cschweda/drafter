// Definitions (definitions design §7.2): the one file the dictionary is, pinned. W1913's lookup
// build of Webster's Revised Unabridged Dictionary (1913), CC0 1.0, from the W1913 release named
// here. A new edition is a change to `source.json` (its name, size, and SHA-256 together), reviewed like
// any dependency bump. The build scripts (`scripts/definitions.mjs`), the store, and the desktop's
// download (`apps/desktop/src/definitions.ts`, checked against this by a test) all use it.
import source from './source.json';

/**
 * The file: its W1913 edition, the release that carries it, its name, its size in bytes as
 * published (gzipped), and its SHA-256. Kept as JSON so the build scripts read the same values.
 */
export const DEFINITIONS_SOURCE: Readonly<{
  edition: string;
  release: string;
  file: string;
  size: number;
  sha256: string;
}> = source;

/** Where the desktop app's main process downloads it (definitions design §7.4). */
export const DEFINITIONS_URL = `https://github.com/cschweda/w1913/releases/download/${DEFINITIONS_SOURCE.release}/${DEFINITIONS_SOURCE.file}`;

/** Where drafter.dev serves its own copy (§7.2), which `connect-src 'self'` allows. */
export const DEFINITIONS_PATH = `/definitions/${DEFINITIONS_SOURCE.file}`;

/** What a writer is told the download is: "8.1 MB". */
export const DEFINITIONS_SIZE_LABEL = `${(DEFINITIONS_SOURCE.size / 1e6).toFixed(1)} MB`;

/** The SHA-256 of `bytes`, as lowercase hex. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Whether `bytes` are exactly the pinned file. */
export async function isTheFile(bytes: Uint8Array): Promise<boolean> {
  return (
    bytes.byteLength === DEFINITIONS_SOURCE.size &&
    (await sha256Hex(bytes)) === DEFINITIONS_SOURCE.sha256
  );
}
