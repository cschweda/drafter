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
/**
 * Brackets open inside this many others are deep: no link or footnote is. A paragraph may hold
 * MAX_BRACKETS closing brackets that close a deep one. `[` 80,000 times and then `]` 80,000 times
 * took micromark the square of that, 24 seconds (red/blue audit of 23 November 2026, W6); links
 * and footnotes, however many, never nest, and stay linear.
 */
export const DEEP_BRACKETS = 32;
/**
 * The most headings written as a line with `===` or `---` under it that one document may hold.
 * micromark's work on them grows with their number squared (160 KB of them took 16 seconds, the
 * same audit); headings written with `#` don't. A real document has a few dozen.
 */
export const MAX_UNDERLINED = 2000;

const STAR = 42;
const UNDERSCORE = 95;
const OPEN = 91;
const CLOSE = 93;
const LF = 10;
const CR = 13;
const SPACE = 32;
const TAB = 9;
const EQUALS = 61;
const HYPHEN = 45;

/** Whether `code` is an emphasis mark, `*` or `_`. */
export const isEmphasisMark = (code: number): boolean => code === STAR || code === UNDERSCORE;

/**
 * Whether some paragraph of `source` (text between blank lines) holds more than MAX_MARKS
 * emphasis marks, MAX_BRACKETS closing brackets with nothing open, or as many that close a deeply
 * nested one; or the whole of it more than MAX_UNDERLINED underlined headings. One pass, no
 * regular expression.
 */
export function denseMarks(source: string): boolean {
  let marks = 0;
  let open = 0;
  let stray = 0;
  let deep = 0;
  let underlined = 0;
  let lineBlank = true;
  // Whether the line before this one had text, and what this line is made of so far: only `=` or
  // only `-` (0 while it is still blank, -1 once it holds anything else).
  let textAbove = false;
  let rule = 0;
  const endLine = () => {
    // A line of only `=`, or only `-`, straight under a line of text, underlines it as a heading.
    if (textAbove && rule > 0 && ++underlined > MAX_UNDERLINED) return true;
    if (lineBlank) {
      marks = 0;
      open = 0;
      stray = 0;
      deep = 0;
    }
    textAbove = !lineBlank;
    lineBlank = true;
    rule = 0;
    return false;
  };
  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i);
    if (code === LF || code === CR) {
      // CRLF is one line ending, as the parsers read it: two would make every line look blank.
      if (code === CR && source.charCodeAt(i + 1) === LF) i++;
      if (endLine()) return true;
      continue;
    }
    if (code !== SPACE && code !== TAB) {
      lineBlank = false;
      if (rule >= 0)
        rule = (code === EQUALS || code === HYPHEN) && (rule === 0 || rule === code) ? code : -1;
    }
    if (isEmphasisMark(code) && ++marks > MAX_MARKS) return true;
    if (code === OPEN) open++;
    else if (code === CLOSE) {
      if (open > DEEP_BRACKETS && ++deep > MAX_BRACKETS) return true;
      if (open > 0) open--;
      else if (++stray > MAX_BRACKETS) return true;
    }
  }
  return endLine();
}
