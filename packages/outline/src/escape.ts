// Escaping for CommonMark (Call 34): the writer's text, written so that a CommonMark parser (the
// app's own, `mdast-util-from-markdown`) reads back exactly that text, in the block it was written
// as. Markdown can't hold a line's leading or trailing spaces (four leading spaces would even make
// a code block), so they are taken off; everything else comes through.
//
// Only what a parser would misread where it stands is escaped, so the raw file reads well to a
// writer and to an AI: `\`, `` ` ``, `*`, `[`, and `~` anywhere; `_` unless it is between two
// letters or digits; `<` before what could start a tag or an autolink; `&` before what could be an
// entity; and at a line's start or end what would make a block.
// What depends on the characters around it is judged on the whole line, never on a piece of it.
// Every scan is one pass over the line, so a long line costs no more than its length.

/** Characters that mean something wherever they stand: escapes, code, emphasis, links, strikethrough. */
const ALWAYS = new Set(['\\', '`', '*', '[', '~']);

/**
 * What can follow `<` in a tag, a comment, a declaration, or an autolink: a URI's scheme starts
 * with a letter, and an email address with a letter, a digit, or most punctuation.
 */
const TAG_START = /[A-Za-z0-9/!?.#$%&'*+=^_`{|}~-]/;

const isAlnum = (c: string | undefined) => c !== undefined && /[A-Za-z0-9]/.test(c);
/** A letter or a digit, which CommonMark reads as neither whitespace nor punctuation. */
const isWordChar = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);

/** Whether `line` from `i` reads as an entity's name and its `;` (`#?[A-Za-z0-9]+;`). */
function entityAt(line: string, i: number): boolean {
  let j = line[i] === '#' ? i + 1 : i;
  const from = j;
  while (isAlnum(line[j])) j++;
  return j > from && line[j] === ';';
}

/**
 * Whether the character at `i` of `line` must be escaped, judged by the line around it. `_` between
 * two letters or digits can neither open nor close emphasis, so `snake_case` and a URL's `my_page`
 * stay as they are; but only within the piece `from` to `to`, since an emphasis mark or a tag may
 * be written at the piece's edge, beside it.
 */
function escapesAt(line: string, i: number, from: number, to: number): boolean {
  const c = line[i] as string;
  if (ALWAYS.has(c)) return true;
  if (c === '_') {
    return !(i > from && i + 1 < to && isWordChar(line[i - 1]) && isWordChar(line[i + 1]));
  }
  if (c === '<') return TAG_START.test(line[i + 1] ?? '');
  if (c === '&') return entityAt(line, i + 1);
  return false;
}

/**
 * The characters `from` to `to` of `line` with what means something there escaped, judged on the
 * whole line: a `<` or `&` in one piece may mean something only by what the next one holds.
 */
export function escapeInline(line: string, from = 0, to = line.length): string {
  let out = '';
  let start = from;
  for (let i = from; i < to; i++) {
    if (!escapesAt(line, i, from, to)) continue;
    out += `${line.slice(start, i)}\\`;
    start = i;
  }
  return out + line.slice(start, to);
}

const isSpaceOrTab = (c: string | undefined) => c === ' ' || c === '\t';

/** Where a line's text starts once the spaces and tabs before it are taken off. */
export function textStart(line: string): number {
  let from = 0;
  while (isSpaceOrTab(line[from])) from++;
  return from;
}

/** Where a line's text ends once the spaces and tabs after it are taken off. */
export function textEnd(line: string): number {
  let to = line.length;
  while (to > 0 && isSpaceOrTab(line[to - 1])) to--;
  return to;
}

/** A line without the spaces and tabs at its ends, which Markdown can't hold. */
const trimLine = (line: string): string => {
  const from = textStart(line);
  return from === line.length ? '' : line.slice(from, textEnd(line));
};

/** At a line's start: an ATX heading's `#`s, a bullet, a block quote, or a list's number. */
const BLOCK_START = /^(?:#{1,6}(?:\s|$)|[+-](?:\s|$)|>)/u;
/** A whole line that is a setext underline (`===`) or a thematic break or underline of `-`. */
const UNDERLINE = /^(?:=+\s*|-[-\s]*)$/u;
/** An ordered list's number and its `.` or `)`. */
const ORDERED = /^(\d{1,9})([.)])(?=\s|$)/u;

/**
 * A line of only `|`, `:`, `-`, and whitespace that GFM would read as a table's delimiter row: one
 * with a `|`, or, under a line of one cell, one with both a `:` and a `-` (`:--`, `--:`).
 */
function delimiterRow(line: string): 'pipe' | 'bare' | null {
  let pipe = false;
  let colon = false;
  let dash = false;
  for (const c of line) {
    if (c === '|') pipe = true;
    else if (c === ':') colon = true;
    else if (c === '-') dash = true;
    else if (!/\s/u.test(c)) return null;
  }
  return pipe ? 'pipe' : colon && dash ? 'bare' : null;
}

/**
 * A line of already escaped Markdown, made safe as a whole: at its start, what would begin a
 * heading, a list, a block quote, a setext underline, or a thematic break, and a line GFM would
 * read as a table's delimiter row, unless the line is a heading's text, where none of those can
 * start; at its end, a closing run of `#` that a heading would drop.
 */
export function guardLine(line: string, inHeading = false): string {
  let out = line;
  if (!inHeading) {
    const row = delimiterRow(out);
    if (BLOCK_START.test(out) || UNDERLINE.test(out)) out = `\\${out}`;
    else if (row === 'pipe') out = out.replaceAll('|', '\\|');
    // A backslash at the start could stand before whitespace, where it is only a backslash.
    else if (row === 'bare') out = out.replace('-', '\\-');
    else out = out.replace(ORDERED, '$1\\$2');
  }
  // A run of `#` at the end, after a space or nothing, would close a heading.
  let hashes = out.length;
  while (hashes > 0 && out[hashes - 1] === '#') hashes--;
  if (hashes < out.length && (hashes === 0 || isSpaceOrTab(out[hashes - 1]))) {
    out = `${out.slice(0, hashes)}\\${out.slice(hashes)}`;
  }
  return out;
}

/**
 * Lines of Markdown as one block: joined by hard breaks (a backslash before the line break), with
 * empty lines at either end left off. An empty line inside stays, as a line holding only the break.
 */
export function joinLines(lines: readonly string[]): string {
  let from = 0;
  let to = lines.length;
  while (from < to && lines[from] === '') from++;
  while (to > from && lines[to - 1] === '') to--;
  return lines.slice(from, to).join('\\\n');
}

/**
 * The writer's text as CommonMark that shows it exactly: the treatment's escaper, made complete.
 * Each line is escaped, its ends trimmed, and the lines are joined by hard breaks into one block.
 */
export function markdownText(text: string): string {
  return joinLines(text.split(/\r\n|\r|\n/).map((line) => guardLine(escapeInline(trimLine(line)))));
}

/**
 * The writer's text as a heading's text: its lines joined by spaces and escaped, without the
 * guards a line's start needs, since after `## ` nothing can start a block.
 */
export function markdownHeading(text: string): string {
  const lines = text
    .split(/\r\n|\r|\n/)
    .map(trimLine)
    .filter((line) => line !== '');
  return guardLine(escapeInline(lines.join(' ')), true);
}
