import { type Doc, parse } from '@drafter/fountain';
import type { DocumentKind } from '../markdown/kind';
import { markdownTitle } from '../markdown/title';

export type LineBreak = '\n' | '\r\n';

const BOM = '﻿';

/** The bytes are not UTF-8, so decoding them would have to change characters. */
export class NotUtf8Error extends Error {
  constructor() {
    super('The bytes are not UTF-8.');
    this.name = 'NotUtf8Error';
  }
}

/**
 * A file's bytes as editor text: UTF-8, a leading byte-order mark taken off and
 * reported, and every line break turned into `\n`. The file's line break is
 * `\r\n` when its first one is, else `\n`. A BOM left in the text would let the
 * writer type before it, and the saved file would then hold U+FEFF mid-text.
 *
 * By default a byte that isn't UTF-8 decodes to U+FFFD. `strict` throws `NotUtf8Error` instead,
 * for a file the writer may save over: a Latin-1 file's characters must not be replaced.
 */
export function decodeFile(
  bytes: Uint8Array,
  options: { strict?: boolean } = {},
): {
  text: string;
  lineBreak: LineBreak;
  bom: boolean;
} {
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { ignoreBOM: true, fatal: options.strict === true }).decode(
      bytes,
    );
  } catch {
    throw new NotUtf8Error();
  }
  const bom = decoded.startsWith(BOM);
  const raw = bom ? decoded.slice(1) : decoded;
  const first = /\r\n?|\n/.exec(raw);
  return {
    text: raw.replace(/\r\n?/g, '\n'),
    lineBreak: first?.[0] === '\r\n' ? '\r\n' : '\n',
    bom,
  };
}

/** The editor's text as the file's text: its line break, and its BOM if it had one. */
export function encodeFile(text: string, lineBreak: LineBreak, bom: boolean): string {
  const body = lineBreak === '\r\n' ? text.replace(/\n/g, '\r\n') : text;
  return bom ? BOM + body : body;
}

/** The title page's Title, as one line of plain text, else `fallback`. */
export function titleOf(doc: Doc, fallback = 'Untitled'): string {
  const field = doc.titlePage?.fields.find((f) => f.key.trim().toLowerCase() === 'title');
  if (!field) return fallback;
  // The runs have emphasis markers removed; the value lines are the source's.
  const text = field.runs
    .map((line) => line.map((run) => run.text).join(''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || fallback;
}

/** The title of `source` as a `kind` document reads it: a title page's Title, or a Markdown document's first heading. */
export function titleFor(kind: DocumentKind, source: string, fallback = 'Untitled'): string {
  return kind === 'markdown'
    ? (markdownTitle(source) ?? fallback)
    : titleOf(parse(source), fallback);
}

/**
 * The file a script with no title is called after: its own, else the Final Draft file it was
 * imported from (`Project.importedFrom`), which it is never saved to.
 */
export function titleFileOf(
  project: { fileName?: string; importedFrom?: string } | null | undefined,
): string | undefined {
  return project?.fileName ?? project?.importedFrom;
}

/** A file's name without its extension: the title of a script that has none. */
export function fileBaseName(name: string | undefined): string {
  if (!name) return 'Untitled';
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  return base.trim() || 'Untitled';
}

// What a file name can't hold, and what can't be seen in one: every control character, the
// format characters (zero-width ones, and the direction overrides, which made a name read
// backward or end in a false extension; red/blue audit of 23 November 2026, W13), and the
// letters and marks that draw nothing (the Hangul fillers, the blank Braille cell, the combining
// grapheme joiner, the Mongolian selectors). Two kinds of format character stay, where a real
// title needs them: the joiners (U+200C, U+200D: Persian, a family emoji), and the tag characters
// that follow a black flag and make it Scotland's or Wales's.
const UNSAFE = /[/\\:*?"<>|\p{Cc}\p{Cf}\u2028\u2029]/u;
/** Letters and marks that draw nothing, by code point (a pattern's class can't hold a combining one). */
const BLANK = new Set([
  0x034f, 0x115f, 0x1160, 0x180b, 0x180c, 0x180d, 0x180e, 0x180f, 0x2800, 0x3164, 0xffa0,
]);
const isJoiner = (code: number) => code === 0x200c || code === 0x200d;
const isTag = (code: number) => code >= 0xe0020 && code <= 0xe007f;
const FLAG = '\u{1f3f4}';
/** What draws nothing alone (a space, a joiner, a variation selector, a tag): a name of only these is no name. */
const drawsNothing = (char: string) => {
  const code = char.codePointAt(0) as number;
  return /\s/.test(char) || isJoiner(code) || isTag(code) || (code >= 0xfe00 && code <= 0xfe0f);
};
const MAX_NAME = 120;
/**
 * Under the 255 bytes most disks allow a name, with room for the extension and a " (2)": 120
 * letters of two bytes each, 80 of three.
 */
const MAX_NAME_BYTES = 240;
/**
 * The names Windows keeps for devices, whatever follows the first dot (`NUL.tar.gz` is `NUL`), with
 * the superscript digits it takes for 1 to 3, and the two console names.
 */
const DEVICE =
  /^(?:con|prn|aux|nul|com[0-9\u00b9\u00b2\u00b3]|lpt[0-9\u00b9\u00b2\u00b3]|conin\$|conout\$)$/iu;

/** `title` without what a name can't hold or show, one character at a time. */
function seen(title: string): string {
  let out = '';
  let flag = false;
  for (const char of title) {
    const code = char.codePointAt(0) as number;
    if (isTag(code)) {
      if (flag) out += char;
      continue;
    }
    flag = char === FLAG;
    if (isJoiner(code) || (!UNSAFE.test(char) && !BLANK.has(code))) out += char;
  }
  return out;
}

/**
 * A file name: the title without `/ \ : * ? " < > |`, control characters, and characters that
 * can't be seen, never a name Windows keeps for a device,
 * without leading or trailing dots and spaces, at most 120 characters, plus the
 * extension. A title with nothing left is "Untitled".
 */
export function fileNameFor(
  title: string,
  extension:
    | '.fountain'
    | '.md'
    | '.pdf'
    | '.html'
    | '.epub'
    | '.txt'
    | '.fdx'
    | '.docx'
    | '.csv'
    | '.zip',
): string {
  const cleaned = seen(title).replace(/\s+/g, ' ').trim();
  // Cut by code point, so an emoji is never split, and to a length in bytes a disk allows: 120
  // emoji are 480 bytes (the same audit, W14).
  const encoder = new TextEncoder();
  let cut = '';
  let bytes = 0;
  for (const char of Array.from(cleaned).slice(0, MAX_NAME)) {
    bytes += encoder.encode(char).length;
    if (bytes > MAX_NAME_BYTES) break;
    cut += char;
  }
  let name = cut.replace(/^[.\s]+|[.\s]+$/g, '');
  if (Array.from(name).every(drawsNothing)) name = '';
  // The part before the first dot is what Windows goes by, spaces after it or not.
  const stem = name.split('.')[0]?.trim() ?? '';
  return (DEVICE.test(stem) ? `_${name}` : name || 'Untitled') + extension;
}
