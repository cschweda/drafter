import type { Doc } from '@drafter/fountain';

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

/** A file's name without its extension: the title of a script that has none. */
export function fileBaseName(name: string | undefined): string {
  if (!name) return 'Untitled';
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  return base.trim() || 'Untitled';
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what this removes.
const UNSAFE = /[/\\:*?"<>|\u0000-\u001f\u007f]/g;
const MAX_NAME = 120;

/**
 * A file name: the title without `/ \ : * ? " < > |` and control characters,
 * without leading or trailing dots and spaces, at most 120 characters, plus the
 * extension. A title with nothing left is "Untitled".
 */
export function fileNameFor(title: string, extension: '.fountain' | '.pdf' | '.txt'): string {
  const cleaned = title.replace(UNSAFE, '').replace(/\s+/g, ' ').trim();
  // Cut by code point, so an emoji is never split.
  const cut = Array.from(cleaned).slice(0, MAX_NAME).join('');
  const name = cut.replace(/^[.\s]+|[.\s]+$/g, '');
  return (name || 'Untitled') + extension;
}
