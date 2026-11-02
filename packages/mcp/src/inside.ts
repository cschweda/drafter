// What is inside a file, judged by its bytes as the app's Open judges them (storage/open.ts),
// whatever its name says: a web page or an e-book is a Drafter export with its script inside, or
// refused; then a known kind that isn't a script (a PDF, an RTF or Word file, by its first bytes)
// is refused in Open's words; then a Final Draft, Highland, or Fade In file by its name goes to its
// importer; and anything else is text, read strictly. The file is read once, capped, without
// following a link, and only if it is still the file that was checked.
import {
  ArchiveError,
  embeddedSource,
  fromFadeIn,
  fromHighland,
  importKindOf,
  isUtf16,
  MAX_SCRIPT_BYTES,
  notAScript,
  REOPEN_MAX_BYTES,
  refusalMessage,
  reopenFormatOf,
  SNIFF_BYTES,
  sourceTooBig,
} from '@drafter/archive';
import { Refused, readCapped, strictText } from '@drafter/archive/node';
import { type FdxImport, fromFdx } from '@drafter/fdx';
import type { Format } from './formats';
import { Refusal } from './paths';

/** What Drafter found inside a file it read. */
export type Content =
  | 'fountain'
  | 'markdown'
  | 'final draft'
  | 'highland'
  | 'fade in'
  | 'html export'
  | 'epub export';

/** What a file's name says is inside it. */
export const NAMED: Readonly<Record<Format, Content>> = {
  fountain: 'fountain',
  text: 'fountain',
  markdown: 'markdown',
  fdx: 'final draft',
  highland: 'highland',
  fadein: 'fade in',
  html: 'html export',
  epub: 'epub export',
};

/** A file's script, ready to parse, and what it was found in. */
export interface Inside {
  content: Content;
  text: string;
  /** What an import brought in as notes. */
  notes: number;
  /** A Markdown document (by its name, or an export's script that is one). */
  markdown: boolean;
}

/**
 * A file Drafter won't read for what is inside it, in Open's own words (a PDF, a web page with no
 * script, a file an importer refuses): the file's shown name only, never a path.
 */
export class NotOpened extends Refusal {}

/**
 * A file whose bytes couldn't be read at all (over 32 MB, gone, a link, changed since it was
 * checked), in words that never hold a path.
 */
export class NotRead extends Refusal {}

/** The checked file to read: its real path, and the dev and ino it was checked as. */
export interface Readable {
  real: string;
  dev: bigint;
  ino: bigint;
}

const IMPORT_ERRORS = new Set(['FdxError', 'ArchiveError', 'OsfError']);
const FORMAT = { highland: 'Highland', fadein: 'Fade In' } as const;

/** Open's text checks on an export's script: exactly as saved, its BOM and line breaks too. */
function exportText(bytes: Uint8Array): string {
  if (isUtf16(bytes)) throw new Refused('it isn’t UTF-8 text');
  if (bytes.subarray(0, SNIFF_BYTES).includes(0)) throw new Refused('it holds more than text');
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Refused('it isn’t UTF-8 text');
  }
}

/** Open's text checks, and its 5 MB cap for a script's text. */
function scriptText(bytes: Uint8Array): string {
  if (bytes.byteLength > MAX_SCRIPT_BYTES) throw new Refused('it is larger than 5 MB');
  return strictText(bytes);
}

async function imported(run: () => FdxImport | Promise<FdxImport>): Promise<FdxImport> {
  try {
    return await run();
  } catch (error) {
    // The importer's own words: a fixed phrase, never a path.
    if (error instanceof Error && IMPORT_ERRORS.has(error.name)) throw new NotOpened(error.message);
    throw error;
  }
}

/**
 * The script inside `file`, named `name` (its shown name, which is all a refusal says), judged in
 * Open's order. Throws NotRead when its bytes couldn't be read, NotOpened in Open's words for a
 * file Open turns away, and Refused (the reader's own phrase) for text Open won't read: over 5 MB,
 * not UTF-8, more than text.
 */
export async function readInside(file: Readable, name: string): Promise<Inside> {
  const kind = importKindOf(name);
  let bytes: Uint8Array;
  try {
    // Open reads up to 32 MB of any file, then decides.
    bytes = await readCapped(
      file.real,
      REOPEN_MAX_BYTES,
      () =>
        kind === 'highland' || kind === 'fadein'
          ? new ArchiveError(FORMAT[kind], 'too-big')
          : new Refused('it is larger than 32 MB'),
      { noFollow: true, expect: { dev: file.dev, ino: file.ino } },
    );
  } catch (error) {
    if (error instanceof ArchiveError) throw new NotRead(error.message);
    if (error instanceof Refused) throw new NotRead(`Can’t read that file: ${error.message}.`);
    throw error;
  }

  // A web page or an e-book, by its content or its name: a Drafter export, or refused.
  const reopen = reopenFormatOf(name, bytes);
  if (reopen) {
    const found = await embeddedSource(bytes);
    if (!found) {
      if (sourceTooBig(bytes)) throw new Refused('the script in it is larger than 5 MB');
      const refusal = notAScript(name, bytes) ?? notAScript(name, new Uint8Array());
      // reopenFormatOf and notAScript name the same pages and books, so a refusal is always found.
      throw new NotOpened(
        refusal ? refusalMessage(name, refusal) : 'Drafter can’t open that file.',
      );
    }
    return {
      content: reopen === 'epub' ? 'epub export' : 'html export',
      text: exportText(found.bytes),
      notes: 0,
      markdown: found.kind === 'markdown',
    };
  }

  // A known kind that isn't a script, by its name or its first bytes.
  const refusal = notAScript(name, bytes);
  if (refusal) throw new NotOpened(refusalMessage(name, refusal));

  // Another app's file, by its name, to its importer.
  if (kind) {
    const got = await imported(() =>
      kind === 'highland'
        ? fromHighland(bytes)
        : kind === 'fadein'
          ? fromFadeIn(bytes)
          : fromFdx(scriptText(bytes)),
    );
    return {
      content: kind === 'fdx' ? 'final draft' : kind === 'highland' ? 'highland' : 'fade in',
      text: got.text.replace(/\r\n?/g, '\n'),
      notes: got.mapped.reduce((sum, { count }) => sum + count, 0),
      markdown: false,
    };
  }

  // Text: Markdown by its name, as Open opens it; anything else Fountain.
  const markdown = /\.(md|markdown)$/i.test(name);
  return {
    content: markdown ? 'markdown' : 'fountain',
    text: scriptText(bytes),
    notes: 0,
    markdown,
  };
}
