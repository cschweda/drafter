// The Node-only half of the archive package: the hardened file reader the CLI and the MCP server
// share, and the Windows path rules. The root entry (index.ts) imports nothing from Node, so the
// browser build stays clean; anything that needs `node:fs` lives here.
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { basename } from 'node:path';
import { type FdxImport, fromFdx } from '@drafter/fdx';
import { ArchiveError } from './errors';
import { fromFadeIn } from './fadein';
import {
  type ImportKind,
  importKindOf,
  isUtf16,
  MAX_SCRIPT_BYTES,
  notAScript,
  refusalMessage,
  SNIFF_BYTES,
} from './formats';
import { fromHighland } from './highland';
import { embeddedSource, REOPEN_MAX_BYTES, reopenFormatOf, sourceTooBig } from './reopen';
import { ZIP_LIMITS } from './zip';

export { windowsNameProblem, windowsPathProblem } from './windows-paths';

/** A file that isn't read (or converted), and why, in words. */
export class Refused extends Error {}

/** Why a file or folder couldn't be read or written, in words. */
export function reason(error: unknown): string {
  const code = (error as { code?: string }).code;
  if (code === 'ENOENT') return 'no such file';
  if (code === 'EISDIR') return "it's a folder";
  if (code === 'EACCES' || code === 'EPERM') return 'permission denied';
  if (code === 'ENOTDIR') return "part of its path isn't a folder";
  if (code === 'ENOSPC') return 'the disk is full';
  return (error as Error).message;
}

export interface ReadCappedOptions {
  /** Open with O_NOFOLLOW where the system has it (`constants.O_NOFOLLOW ?? 0`): a link in the last part refuses. */
  noFollow?: boolean;
  /** The checked file: the open handle's `dev` and `ino` (bigint stat) must equal these, else Refused("it changed while it was being read"). */
  expect?: { dev: bigint; ino: bigint };
}

/**
 * The file's bytes, or a refusal when it is over `cap`, a folder, or anything but a regular file (a
 * pipe, a device such as /dev/zero): never more than `cap` + 1 bytes are read, and nothing waits.
 */
export async function readCapped(
  source: string,
  cap: number,
  tooBig: () => Error,
  options: ReadCappedOptions = {},
): Promise<Uint8Array> {
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    // Non-blocking, so a pipe put in the file's place after it was checked can't hang the open;
    // the handle's own stat then refuses it.
    handle = await open(
      source,
      constants.O_RDONLY |
        (constants.O_NONBLOCK ?? 0) |
        (options.noFollow === true ? (constants.O_NOFOLLOW ?? 0) : 0),
    );
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (options.noFollow === true && (code === 'ELOOP' || code === 'EMLINK'))
      throw new Refused("can't read it: it is a link");
    throw new Refused(`can't read it: ${reason(error)}`);
  }
  let big: Error | undefined;
  const over = () => (big = tooBig());
  try {
    const info = await handle.stat({ bigint: true });
    if (options.expect && (info.dev !== options.expect.dev || info.ino !== options.expect.ino))
      throw new Refused('it changed while it was being read');
    if (info.isDirectory()) throw new Refused("it's a folder");
    if (!info.isFile()) throw new Refused('it isn’t a file');
    if (info.size > BigInt(cap)) throw over();
    // The size can change after the stat: read one byte more than it said, and no further.
    const buffer = new Uint8Array(Math.min(Number(info.size), cap) + 1);
    let filled = 0;
    while (filled < buffer.length) {
      const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, filled);
      if (bytesRead === 0) break;
      filled += bytesRead;
    }
    if (filled > cap) throw over();
    return buffer.subarray(0, filled);
  } catch (error) {
    if (error instanceof Refused || error instanceof ArchiveError) throw error;
    // The caller's own refusal for a file that is too big passes as it is made.
    if (error === big) throw error;
    throw new Refused(`can't read it: ${reason(error)}`);
  } finally {
    await handle.close();
  }
}

/**
 * Open's text checks: not UTF-16, no NUL in the first SNIFF_BYTES, strict UTF-8, a byte order mark
 * dropped, and every `\r\n` or `\r` a `\n`.
 */
export function strictText(bytes: Uint8Array): string {
  if (isUtf16(bytes)) throw new Refused('it isn’t UTF-8 text');
  if (bytes.subarray(0, SNIFF_BYTES).includes(0)) throw new Refused('it holds more than text');
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Refused('it isn’t UTF-8 text');
  }
  if (text.startsWith('﻿')) text = text.slice(1);
  return text.replace(/\r\n?/g, '\n');
}

/** A file's script, ready to use: its text, the notes an import made, and what kind it is. */
export interface ScriptRead {
  text: string;
  notes: number;
  /** A Markdown document, from an export. */
  markdown: boolean;
}

/** The app's Open caps: a Final Draft file is text, at most 5 MB; an archive, the zip reader's 32 MB. */
const MAX_BYTES: Record<ImportKind, number> = {
  fdx: MAX_SCRIPT_BYTES,
  highland: ZIP_LIMITS.maxArchiveBytes,
  fadein: ZIP_LIMITS.maxArchiveBytes,
};
const FORMAT = { highland: 'Highland', fadein: 'Fade In' } as const;

/**
 * A file's script: an import's, as the app imports it, with every line break a line feed (as the
 * editor holds it); or a Drafter export's, exactly as it was saved inside it. `whatItReads` is the
 * refusal for any other file.
 */
export async function readScriptFile(
  source: string,
  whatItReads: string,
  options: ReadCappedOptions = {},
): Promise<ScriptRead> {
  const reopened = await reopenFile(source, whatItReads, options);
  if (reopened) return reopened;
  const imported = await importFile(source, whatItReads, options);
  return {
    text: imported.text.replace(/\r\n?/g, '\n'),
    notes: imported.mapped.reduce((sum, { count }) => sum + count, 0),
    markdown: false,
  };
}

/**
 * A Drafter HTML or EPUB export's script (reopenable exports), by its name: its exact text, read
 * only as text; undefined for a file not named as one. A page or a book with no script inside, or
 * a malformed one, is refused, and so is a script that isn't UTF-8 text, as Open refuses them.
 */
async function reopenFile(
  source: string,
  whatItReads: string,
  options: ReadCappedOptions,
): Promise<ScriptRead | undefined> {
  const name = basename(source);
  if (!reopenFormatOf(name, new Uint8Array(0))) return undefined;
  const bytes = await readCapped(
    source,
    REOPEN_MAX_BYTES,
    () => new Refused('it is larger than 32 MB'),
    options,
  );
  const found = await embeddedSource(bytes);
  if (!found) {
    if (sourceTooBig(bytes)) throw new Refused('the script in it is larger than 5 MB');
    const refusal = notAScript(name, bytes) ?? notAScript(name, new Uint8Array(0));
    throw new Refused(refusal ? refusalMessage(name, refusal) : whatItReads);
  }
  if (isUtf16(found.bytes)) throw new Refused('it isn’t UTF-8 text');
  if (found.bytes.subarray(0, SNIFF_BYTES).includes(0))
    throw new Refused('it holds more than text');
  let text: string;
  try {
    // Exactly as saved: its byte order mark and its line breaks too.
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(found.bytes);
  } catch {
    throw new Refused('it isn’t UTF-8 text');
  }
  return { text, notes: 0, markdown: found.kind === 'markdown' };
}

/**
 * A file's script, as the app's Open reads it: `notAScript` first (by extension, then by first
 * bytes), a kind `convert` reads, the size cap read before the bytes are, then the importer.
 */
async function importFile(
  source: string,
  whatItReads: string,
  options: ReadCappedOptions,
): Promise<FdxImport> {
  const name = basename(source);
  const named = notAScript(name, new Uint8Array(0));
  if (named) throw new Refused(refusalMessage(name, named));
  const kind = importKindOf(name);
  if (!kind) throw new Refused(whatItReads);
  const bytes = await readCapped(
    source,
    MAX_BYTES[kind],
    () =>
      kind === 'fdx'
        ? new Refused('it is larger than 5 MB')
        : new ArchiveError(FORMAT[kind], 'too-big'),
    options,
  );
  const refusal = notAScript(name, bytes);
  if (refusal) throw new Refused(refusalMessage(name, refusal));
  if (kind === 'highland') return fromHighland(bytes);
  if (kind === 'fadein') return fromFadeIn(bytes);
  return fromFdx(strictText(bytes));
}
