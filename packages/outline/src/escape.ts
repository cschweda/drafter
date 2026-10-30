// Escaping for CommonMark (Call 34): the writer's text, written so that a CommonMark parser (the
// app's own, `mdast-util-from-markdown`) reads back exactly that text, in the block it was written
// as. Markdown can't hold a line's leading or trailing spaces (four leading spaces would even make
// a code block), so they are taken off; everything else comes through.

/** Characters that mean something anywhere in a line: emphasis, code, links, HTML, entities, tables, strikethrough. */
const ANYWHERE = /[\\`*_[\]<>&!|~]/g;

/** `text` with every character that means something anywhere in a line escaped. */
export const escapeInline = (text: string): string => text.replace(ANYWHERE, (c) => `\\${c}`);

/** A line without the spaces and tabs at its ends, which Markdown can't hold. */
const trimLine = (line: string): string => line.replace(/^[ \t]+|[ \t]+$/g, '');

/**
 * A line of already escaped Markdown, made safe at its ends: at its start, what would begin a
 * heading, a list, a setext underline, or a thematic break (`#`, `+`, `-`, `=`, `1.`, `1)`), unless
 * the line is a heading's text, where none of those can start; at its end, a closing run of `#`
 * that a heading would drop.
 */
export function guardLine(line: string, inHeading = false): string {
  let out = line;
  if (!inHeading) {
    if (/^[#+\-=]/.test(out)) out = `\\${out}`;
    else out = out.replace(/^(\d+)([.)])/, '$1\\$2');
  }
  return out.replace(/(^|[ \t])(#+)$/, '$1\\$2');
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
