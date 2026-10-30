// What every app's archive shares: which entries can hold the document, which one to read, and
// how its bytes become text.
import { ArchiveError, type ArchiveFormat } from './errors';
import type { ZipEntry } from './zip';

/**
 * Strict UTF-8 (`not-utf8` otherwise), with no NUL (`not-text`, as Open refuses a file holding a
 * zero byte), a leading BOM taken off, `\r\n` and `\r` made `\n`.
 */
export function scriptText(bytes: Uint8Array, format: ArchiveFormat): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch (error) {
    throw new ArchiveError(format, 'not-utf8', undefined, { cause: error });
  }
  if (text.includes('\u0000')) throw new ArchiveError(format, 'not-text');
  if (text.startsWith('\uFEFF')) text = text.slice(1);
  return text.replace(/\r\n?/g, '\n');
}

/** An entry the archiving tool or the system added, not the app: macOS's resource forks, dot-files. */
export function isClutter(entry: ZipEntry): boolean {
  const segments = entry.name.split('/');
  return segments[0] === '__MACOSX' || segments.some((s) => s.startsWith('.'));
}

/** The entries that can hold the document: not a directory, not under `__MACOSX/`, no segment starting with `.`. */
export function candidates(entries: readonly ZipEntry[], extension: RegExp): ZipEntry[] {
  return entries.filter((e) => !e.directory && !isClutter(e) && extension.test(e.name));
}

/** How many folders deep an entry sits. */
export const depth = (entry: ZipEntry): number => entry.name.split('/').length - 1;

/** The candidates at the shallowest depth, in archive order; throws `no-script` when there are none. */
export function shallowest(found: readonly ZipEntry[], format: ArchiveFormat): ZipEntry[] {
  if (found.length === 0) throw new ArchiveError(format, 'no-script');
  const least = Math.min(...found.map(depth));
  return found.filter((e) => depth(e) === least);
}

/** The one to read: the only candidate, else the only one at the shallowest depth; else throws `no-script` / `many-scripts`. */
export function pickEntry(found: readonly ZipEntry[], format: ArchiveFormat): ZipEntry {
  const top = shallowest(found, format);
  if (top.length > 1) throw new ArchiveError(format, 'many-scripts');
  return top[0] as ZipEntry;
}
