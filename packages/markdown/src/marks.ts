/**
 * The most emphasis marks (`*`, `_`) one Markdown paragraph may hold; past this it isn't parsed
 * (red/blue audit, 2026-11-03). The parsers' work on a paragraph's emphasis marks grows with their
 * number squared: 160 KB of `*_` held CodeMirror's Markdown grammar for 14 seconds and micromark
 * for over a minute, and Drafter reopens the last document, so the tab froze again on every
 * reload. A real paragraph has a handful; 4,000 still parses at once.
 */
export const MAX_MARKS = 4000;
/**
 * The most closing brackets with nothing open (`]`) one paragraph may hold: a run of them grows
 * the same way in micromark (160 KB took 41 seconds). Brackets that open, or close what opened
 * (links and footnotes, which stay linear: parse.test.ts reads 100,000), aren't counted.
 */
export const MAX_BRACKETS = 4000;

const STAR = 42;
const UNDERSCORE = 95;
const OPEN = 91;
const CLOSE = 93;
const LF = 10;
const CR = 13;
const SPACE = 32;
const TAB = 9;

/** Whether `code` is an emphasis mark, `*` or `_`. */
export const isEmphasisMark = (code: number): boolean => code === STAR || code === UNDERSCORE;

/**
 * Whether some paragraph of `source` (text between blank lines) holds more than MAX_MARKS
 * emphasis marks or MAX_BRACKETS closing brackets with nothing open. One pass, no regular
 * expression.
 */
export function denseMarks(source: string): boolean {
  let marks = 0;
  let open = 0;
  let stray = 0;
  let lineBlank = true;
  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i);
    if (code === LF || code === CR) {
      if (lineBlank) {
        marks = 0;
        open = 0;
        stray = 0;
      }
      lineBlank = true;
      continue;
    }
    if (code !== SPACE && code !== TAB) lineBlank = false;
    if (isEmphasisMark(code) && ++marks > MAX_MARKS) return true;
    if (code === OPEN) open++;
    else if (code === CLOSE) {
      if (open > 0) open--;
      else if (++stray > MAX_BRACKETS) return true;
    }
  }
  return false;
}
