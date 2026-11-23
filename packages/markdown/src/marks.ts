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
/**
 * The most HTML openers (`<!` and `<?`: a comment, a declaration, a processing instruction, a
 * CDATA section) one paragraph may hold, and the whole document. One that never closes sends the
 * parser to the paragraph's end to look, each time: 80 KB of `x <!A ` held micromark for 26
 * seconds (the audit of the red/blue audit of 23 November 2026, W6). A real document has a few.
 */
export const MAX_OPENERS = 1000;
export const MAX_OPENERS_IN_ALL = 8000;
/**
 * And the most looking they may cost: a paragraph's openers times its length, and that summed
 * over the document. A few hundred openers in a paragraph of a megabyte look as far as thousands
 * in a short one.
 */
export const OPENER_BUDGET = 20_000_000;
export const OPENER_BUDGET_IN_ALL = 40_000_000;

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
const QUOTE = 62;
const LESS = 60;
const BANG = 33;
const QUERY = 63;

/** Whether `source` has an HTML opener at `i`: `<!` or `<?`. */
export function isOpener(source: string, i: number): boolean {
  if (source.charCodeAt(i) !== LESS) return false;
  const next = source.charCodeAt(i + 1);
  return next === BANG || next === QUERY;
}

/** Whether `code` is an emphasis mark, `*` or `_`. */
export const isEmphasisMark = (code: number): boolean => code === STAR || code === UNDERSCORE;

/**
 * Whether some paragraph of `source` (text between blank lines) holds more than MAX_MARKS
 * emphasis marks, MAX_BRACKETS closing brackets with nothing open, or as many that close a deeply
 * nested one, or more than MAX_OPENERS HTML openers; or the whole of it more than MAX_UNDERLINED
 * underlined headings or MAX_OPENERS_IN_ALL openers. One pass, no
 * regular expression.
 */
export function denseMarks(source: string): boolean {
  let marks = 0;
  let open = 0;
  let stray = 0;
  let deep = 0;
  let underlined = 0;
  let openers = 0;
  let allOpeners = 0;
  let length = 0;
  let looked = 0;
  // A paragraph ends: what its openers cost, against the paragraph's budget and the document's.
  const endParagraph = () => {
    const cost = openers * length;
    looked += cost;
    length = 0;
    return cost > OPENER_BUDGET || looked > OPENER_BUDGET_IN_ALL;
  };
  let lineBlank = true;
  // Whether the line before this one had text, and what this line is made of so far: only `=` or
  // only `-` (0 while it is still blank, -1 once it holds anything else).
  let textAbove = false;
  let rule = 0;
  const endLine = () => {
    // A line of only `=`, or only `-`, straight under a line of text, underlines it as a heading.
    if (textAbove && rule > 0 && ++underlined > MAX_UNDERLINED) return true;
    if (lineBlank) {
      if (endParagraph()) return true;
      marks = 0;
      open = 0;
      stray = 0;
      deep = 0;
      openers = 0;
    }
    textAbove = !lineBlank;
    lineBlank = true;
    rule = 0;
    return false;
  };
  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i);
    length++;
    if (code === LF || code === CR) {
      // CRLF is one line ending, as the parsers read it: two would make every line look blank.
      if (code === CR && source.charCodeAt(i + 1) === LF) i++;
      if (endLine()) return true;
      continue;
    }
    if (code !== SPACE && code !== TAB) {
      lineBlank = false;
      // A block quote's `>` is not part of the line it quotes: `> a` over `> ===` is a heading too.
      if (rule >= 0 && code !== QUOTE) {
        rule = (code === EQUALS || code === HYPHEN) && (rule === 0 || rule === code) ? code : -1;
      }
    }
    if (isEmphasisMark(code) && ++marks > MAX_MARKS) return true;
    if (code === LESS && isOpener(source, i)) {
      if (++openers > MAX_OPENERS || ++allOpeners > MAX_OPENERS_IN_ALL) return true;
    }
    if (code === OPEN) open++;
    else if (code === CLOSE) {
      if (open > DEEP_BRACKETS && ++deep > MAX_BRACKETS) return true;
      if (open > 0) open--;
      else if (++stray > MAX_BRACKETS) return true;
    }
  }
  return endLine() || endParagraph();
}
