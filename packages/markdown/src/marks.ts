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

const BACKTICK = 96;
const TILDE = 126;

/** Where the line that holds `at` ends: at its line ending, or the text's end. */
function lineEnd(source: string, at: number): number {
  let i = at;
  while (i < source.length) {
    const code = source.charCodeAt(i);
    if (code === LF || code === CR) break;
    i++;
  }
  return i;
}

/**
 * The fence that the line at `at` opens, when the line starts at the margin with one: its mark and
 * how many of them (three or more backticks or tildes; after backticks, no other backtick in the
 * line, or it is code within a line). Only at the margin: indented, it may belong to a list item.
 */
function fenceAt(source: string, at: number): { mark: number; run: number } | null {
  const mark = source.charCodeAt(at);
  if (mark !== BACKTICK && mark !== TILDE) return null;
  let run = 1;
  while (source.charCodeAt(at + run) === mark) run++;
  if (run < 3) return null;
  if (mark === BACKTICK) {
    const end = lineEnd(source, at);
    for (let i = at + run; i < end; i++) if (source.charCodeAt(i) === BACKTICK) return null;
  }
  return { mark, run };
}

/**
 * Whether the line at `at` closes `fence`: up to three spaces, at least as many of its mark, and
 * then only spaces and tabs.
 */
function closesFence(source: string, at: number, fence: { mark: number; run: number }): boolean {
  let i = at;
  while (i < at + 3 && source.charCodeAt(i) === SPACE) i++;
  let run = 0;
  while (source.charCodeAt(i) === fence.mark) {
    run++;
    i++;
  }
  if (run < fence.run) return false;
  const end = lineEnd(source, i);
  for (; i < end; i++) {
    const code = source.charCodeAt(i);
    if (code !== SPACE && code !== TAB) return false;
  }
  return true;
}

const BACKSLASH = 92;
const LEFT_PAREN = 40;
const RIGHT_PAREN = 41;
const DOUBLE = 34;
const SINGLE = 39;
/** How far a title is followed for its end: a longer one counts as never closing. */
const TITLE_REACH = 1000;

/**
 * Whether the `](` at `at` (the index of its `]`) starts a link whose title opens and is not
 * closed and followed by `)` on its line: `[a](b "c`, `[a](b (c`, `[a](<b> 'c`. The parser looks
 * for the rest of such a link as far as the paragraph goes, each time (144 KB of `[a](b (c `: a
 * minute). A link that is whole on its line, with a title or without, is not one of these.
 */
export function opensTitle(source: string, at: number): boolean {
  if (source.charCodeAt(at + 1) !== LEFT_PAREN) return false;
  let i = at + 2;
  const blank = (code: number) => code === SPACE || code === TAB;
  const ends = (code: number) => code === LF || code === CR || Number.isNaN(code);
  while (blank(source.charCodeAt(i))) i++;
  // The destination: in angle brackets, or up to a space, or the `)` that closes the link.
  if (source.charCodeAt(i) === LESS) {
    for (i++; ; i++) {
      const code = source.charCodeAt(i);
      if (ends(code) || code === LESS) return false;
      if (code === BACKSLASH) i++;
      else if (code === QUOTE) break;
    }
    i++;
  } else {
    let depth = 0;
    for (; ; i++) {
      const code = source.charCodeAt(i);
      if (ends(code) || blank(code)) break;
      if (code === BACKSLASH) i++;
      else if (code === LEFT_PAREN) depth++;
      else if (code === RIGHT_PAREN && depth-- === 0) return false;
    }
  }
  // Spaces, and one line ending, may come before the title.
  const gap = i;
  while (blank(source.charCodeAt(i))) i++;
  if (source.charCodeAt(i) === CR && source.charCodeAt(i + 1) === LF) i++;
  if (source.charCodeAt(i) === LF || source.charCodeAt(i) === CR) i++;
  while (blank(source.charCodeAt(i))) i++;
  if (i === gap) return false;
  const open = source.charCodeAt(i);
  if (open !== DOUBLE && open !== SINGLE && open !== LEFT_PAREN) return false;
  const close = open === LEFT_PAREN ? RIGHT_PAREN : open;
  const limit = i + TITLE_REACH;
  for (i++; i < limit; i++) {
    const code = source.charCodeAt(i);
    if (ends(code)) return true;
    if (code === BACKSLASH) i++;
    else if (code === close) {
      // Closed: a whole link only if `)` comes next.
      i++;
      while (blank(source.charCodeAt(i))) i++;
      return source.charCodeAt(i) !== RIGHT_PAREN;
    } else if (open === LEFT_PAREN && code === LEFT_PAREN) return true;
  }
  return true;
}

/**
 * Whether some paragraph of `source` (text between blank lines) holds more than MAX_MARKS
 * emphasis marks, MAX_BRACKETS closing brackets with nothing open, or as many that close a deeply
 * nested one, or more than MAX_OPENERS HTML openers; or the whole of it more than MAX_UNDERLINED
 * underlined headings or MAX_OPENERS_IN_ALL openers. One pass, no
 * regular expression.
 *
 * A fenced code block that starts at the margin is passed over, as so many blank lines: the parser
 * keeps what is in it as it is, so a long listing of ordinary code (`snake_case` names, rules of
 * `-`, brackets) costs it nothing, and was refused. Only where it is certain to be one: a fence
 * at the margin closes every list, quote and note, so it is the document's own; but HTML may hold
 * a line that looks like a fence, and a fence that is indented may open a block that the next
 * fence at the margin closes. So after the first `<` outside a code block, or the first three
 * fence marks in a row that opened none here, no fence is taken for one, and everything is counted
 * as before. A test asks the parser where each line of
 * thousands of small documents ended up, and nothing it reads as text is passed over here.
 */
export function denseMarks(source: string): boolean {
  let marks = 0;
  let open = 0;
  let stray = 0;
  let deep = 0;
  let underlined = 0;
  let openers = 0;
  let allOpeners = 0;
  // Whether the paragraph holds a backtick or a `<`: a `[` may then be inside code or a tag,
  // where it opens nothing, so every `]` after it is counted as closing nothing.
  let literal = false;
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
      literal = false;
    }
    textAbove = !lineBlank;
    lineBlank = true;
    rule = 0;
    return false;
  };
  // The open code block; whether fences can no longer be told (a `<`, or a run of fence marks
  // that was not taken for a block, has been seen outside one); and whether a line starts here.
  let fence: { mark: number; run: number } | null = null;
  let unsure = false;
  let lineStart = true;
  for (let i = 0; i < source.length; i++) {
    if (lineStart) {
      lineStart = false;
      const opened = fence;
      if (opened) {
        if (closesFence(source, i, opened)) fence = null;
      } else if (!unsure) fence = fenceAt(source, i);
      if (opened || fence) {
        // A line of the block, its fences too: nothing in it is read, and it ends a paragraph.
        i = lineEnd(source, i) - 1;
        continue;
      }
    }
    const code = source.charCodeAt(i);
    length++;
    if (code === LF || code === CR) {
      // CRLF is one line ending, as the parsers read it: two would make every line look blank.
      if (code === CR && source.charCodeAt(i + 1) === LF) i++;
      if (endLine()) return true;
      lineStart = true;
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
    if (code === BACKSLASH) {
      // An escaped bracket is only itself: `\[` opens nothing, and `\]` closes nothing.
      const next = source.charCodeAt(i + 1);
      if (next === OPEN || next === CLOSE || next === BACKSLASH) {
        i++;
        length++;
      }
      continue;
    }
    if (code === LESS || code === BACKTICK) literal = true;
    if (code === LESS) unsure = true;
    // Three fence marks in a row that opened no block here: indented (so perhaps in a list item,
    // or the document's own all the same), or after other text. Whichever, the next fence at the
    // margin may be its end and not a start.
    if (
      (code === BACKTICK || code === TILDE) &&
      source.charCodeAt(i - 1) === code &&
      source.charCodeAt(i - 2) === code
    )
      unsure = true;
    if (code === LESS && isOpener(source, i)) {
      if (++openers > MAX_OPENERS || ++allOpeners > MAX_OPENERS_IN_ALL) return true;
    }
    if (code === OPEN) {
      if (!literal) open++;
    } else if (code === CLOSE) {
      if (opensTitle(source, i) && (++openers > MAX_OPENERS || ++allOpeners > MAX_OPENERS_IN_ALL))
        return true;
      if (open > DEEP_BRACKETS && ++deep > MAX_BRACKETS) return true;
      if (open > 0) open--;
      else if (++stray > MAX_BRACKETS) return true;
    }
  }
  return endLine() || endParagraph();
}
