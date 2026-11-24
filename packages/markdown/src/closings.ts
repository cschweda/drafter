// What a document costs the parser in lists, quotes and notes that end. micromark keeps every
// open container (a block quote, a list item, a footnote's definition) on a stack, and at each
// line that leaves one of them without starting another it looks back through everything it has
// read so far for something still open (its document tokenizer, `writeToChild`). After a blank
// line there is nothing, so it reads all of it: a document of `- a`, a blank line, `b`, a blank
// line, over and over, took the square of its length, as did `> a` and a blank line (8,000 short
// quotes: seven seconds; the audit of the red/blue audit of 23 November 2026, W6). A line that
// goes on a paragraph without its container's mark (a "lazy" line) looks back as far as the
// paragraph's start, so one quoted paragraph of thousands of such lines does the same. And when a
// list's next item starts while something inside the last one is still open (a list within it, a
// quote), the parser moves every event it holds to close it (`documentContinue`, by its edit map):
// 16,000 items that each hold a list of their own took eleven seconds.
//
// This counts that looking, line by line, as the parser would do it: the containers each line
// keeps open, the ones it starts, and the ones it leaves. Where it can't be sure, it charges the
// most and keeps more open than the parser might: a container kept open too long only charges
// more, and one closed too soon would miss what the parser pays. So code fences and HTML are read
// as ordinary lines (a list inside a code block counts as a list), and a mark that the parser
// would refuse because it interrupts a paragraph counts as one.

import { MAX_NESTING } from './depth';

/**
 * The most looking back a document, or a piece of one, may cost: the lines read so far, summed
 * over every line that makes the parser look. The worst shape spends this in about two seconds on
 * the maintainer's machine; 2,000 lists that each end at a paragraph spend a twelfth of it.
 */
export const CLOSING_BUDGET = 100_000_000;

/** No more containers than this are followed: the parser is never given a deeper document. */
const MAX_OPEN = MAX_NESTING + 16;

const TAB = 9;
const LF = 10;
const CR = 13;
const SPACE = 32;
const HASH = 35;
const RIGHT_PAREN = 41;
const STAR = 42;
const PLUS = 43;
const HYPHEN = 45;
const DOT = 46;
const ZERO = 48;
const NINE = 57;
const COLON = 58;
const LESS = 60;
const EQUALS = 61;
const GREATER = 62;
const LEFT_BRACKET = 91;
const BACKSLASH = 92;
const RIGHT_BRACKET = 93;
const CARET = 94;
const UNDERSCORE = 95;
const BACKTICK = 96;
const TILDE = 126;

/** An open container: a block quote, or a list item or footnote that goes on by its indent. */
interface Level {
  quote: boolean;
  /** The indent a line needs to go on with a list item or a note. */
  size: number;
  /** A list's mark (`-`, `+`, `*`, or the `.` or `)` after its number): the same again is its next item. */
  mark: number;
  /** A list item with nothing after its mark, yet. */
  blankStart: boolean;
  /** Such an item, and then a blank line: nothing goes on with it. */
  over: boolean;
}

/**
 * What `text` costs the parser in looking back (see the top of this file), or some number past
 * `budget` as soon as it is past it. One pass, no regular expression.
 */
export function closingCost(text: string, budget = Number.POSITIVE_INFINITY): number {
  const stack: Level[] = [];
  let cost = 0;
  let lines = 0;
  // The lines of the paragraph a lazy line would go on with, at most: since the last blank line
  // or the last container started.
  let para = 0;
  let afterBlank = true;
  // Whether the line before could only be a line of a paragraph, and whether a code fence or
  // HTML has started since the stack was last empty (inside those, no line is).
  let plainBefore = false;
  let murky = false;
  let p = 0;
  let col = 0;
  let to = 0;

  /** Moves `p` and `col` past spaces and tabs; a tab goes to the next multiple of four. */
  const skip = () => {
    for (; p < to; p++) {
      const code = text.charCodeAt(p);
      if (code === SPACE) col++;
      else if (code === TAB) col += 4 - (col % 4);
      else break;
    }
  };
  /** Whether the line from `at` is a rule: three or more of its mark, and only spaces between. */
  const rule = (at: number) => {
    const mark = text.charCodeAt(at);
    let n = 0;
    for (let i = at; i < to; i++) {
      const code = text.charCodeAt(i);
      if (code === mark) n++;
      else if (code !== SPACE && code !== TAB) return false;
    }
    return n >= 3;
  };
  /** The end of a footnote's label and colon (`[^a]:`) that starts at `at`, or -1. */
  const noteEnd = (at: number) => {
    if (text.charCodeAt(at + 1) !== CARET) return -1;
    for (let i = at + 2; i < to; i++) {
      const code = text.charCodeAt(i);
      if (code === BACKSLASH) i++;
      else if (code === RIGHT_BRACKET) {
        return i > at + 2 && text.charCodeAt(i + 1) === COLON ? i + 2 : -1;
      }
    }
    return -1;
  };

  for (let from = 0; from < text.length; from = to + 1) {
    to = from;
    while (to < text.length) {
      const code = text.charCodeAt(to);
      if (code === LF || code === CR) break;
      to++;
    }
    const lineEnd = to;
    lines++;
    p = from;
    col = 0;
    skip();
    // The indent before `p` that no container has taken.
    let pad = col;

    // The containers this line keeps open.
    let kept = 0;
    for (; kept < stack.length; kept++) {
      const level = stack[kept] as Level;
      if (level.quote) {
        if (p >= to || pad >= 4 || text.charCodeAt(p) !== GREATER) break;
        p++;
        col++;
        const before = col;
        skip();
        // The mark takes one space after it.
        pad = Math.max(0, col - before - 1);
      } else if (p >= to) {
        // A blank line goes on with a list item or a note.
        if (level.blankStart) level.over = true;
      } else {
        if (level.over || pad < level.size) break;
        pad -= level.size;
        level.blankStart = false;
      }
    }

    if (p >= to) {
      // A blank line: a quote it leaves ends there, and the parser looks.
      if (kept < stack.length) {
        cost += lines;
        stack.length = kept;
        if (kept === 0) murky = false;
      }
      para = 0;
      afterBlank = true;
      plainBefore = false;
    } else {
      // The containers it starts: each closes what the line didn't keep, and the parser doesn't look.
      let made = false;
      while (p < to && pad < 4 && stack.length < MAX_OPEN) {
        const code = text.charCodeAt(p);
        let level: Level | null = null;
        if (code === GREATER) {
          p++;
          col++;
          const before = col;
          skip();
          pad = Math.max(0, col - before - 1);
          level = { quote: true, size: 0, mark: 0, blankStart: false, over: false };
        } else {
          let after = -1;
          let mark = code;
          if (code === PLUS) after = p + 1;
          else if (code === HYPHEN || code === STAR) after = rule(p) ? -1 : p + 1;
          else if (code >= ZERO && code <= NINE) {
            let i = p + 1;
            while (i < to && i - p < 9 && isDigit(text.charCodeAt(i))) i++;
            const end = text.charCodeAt(i);
            if (end === DOT || end === RIGHT_PAREN) after = i + 1;
            mark = end;
          } else if (code === LEFT_BRACKET) {
            const end = noteEnd(p);
            if (end < 0) break;
            col += end - p;
            p = end;
            skip();
            pad = 0;
            level = { quote: false, size: 4, mark: 0, blankStart: false, over: false };
          }
          if (!level) {
            // A list's mark needs a space after it, or the line's end.
            const next = text.charCodeAt(after);
            if (after < 0 || (after < to && next !== SPACE && next !== TAB)) break;
            const width = after - p;
            col += width;
            p = after;
            const before = col;
            skip();
            const space = col - before;
            if (p >= to) {
              level = { quote: false, size: pad + width + 1, mark, blankStart: true, over: false };
              pad = 0;
            } else if (space <= 4) {
              level = {
                quote: false,
                size: pad + width + space,
                mark,
                blankStart: false,
                over: false,
              };
              pad = 0;
            } else {
              // Five spaces or more: one is the mark's, and the rest indent code.
              level = { quote: false, size: pad + width + 1, mark, blankStart: false, over: false };
              pad = space - 1;
            }
          }
        }
        if (!made) {
          // The next item of a list, with something still open inside the last one: the parser
          // moves all it holds to close that.
          const left = stack[kept];
          if (left && level.mark !== 0 && left.mark === level.mark && stack.length > kept + 1)
            cost += lines;
          stack.length = kept;
        }
        made = true;
        stack.push(level);
      }

      if (made) para = 0;
      else if (kept < stack.length) {
        // It leaves a container and starts none: the parser looks back.
        const first = text.charCodeAt(p);
        if (afterBlank) {
          // Nothing is open after a blank line, so it reads everything, and the container ends.
          cost += lines;
          stack.length = kept;
          if (kept === 0) murky = false;
        } else if (plainBefore && !murky && pad < 4 && !startsBlock(first)) {
          // A lazy line of a paragraph: as far back as the paragraph's start.
          cost += para + 1;
        } else {
          // It may end the container or not: charged as if it did, and kept open as if it didn't.
          cost += lines;
        }
      }

      if (p >= to) {
        // Only marks: an item or a quote with nothing in it yet.
        para = 0;
        afterBlank = true;
        plainBefore = false;
      } else {
        const first = text.charCodeAt(p);
        if (stack.length > 0 && (first === LESS || first === BACKTICK || first === TILDE))
          murky = true;
        plainBefore = pad < 4 && !startsBlock(first);
        afterBlank = false;
        para++;
      }
    }
    if (cost > budget) return cost;
    // CRLF is one line ending.
    to = lineEnd;
    if (text.charCodeAt(to) === CR && text.charCodeAt(to + 1) === LF) to++;
  }
  return cost;
}

const isDigit = (code: number) => code >= ZERO && code <= NINE;

/** Whether a line that starts with `code` may be something other than a paragraph's line. */
const startsBlock = (code: number) =>
  code === HASH ||
  code === LESS ||
  code === BACKTICK ||
  code === TILDE ||
  code === EQUALS ||
  code === HYPHEN ||
  code === STAR ||
  code === UNDERSCORE;

/** Whether `text` costs the parser more looking back than `CLOSING_BUDGET`. */
export const closesTooOften = (text: string): boolean =>
  closingCost(text, CLOSING_BUDGET) > CLOSING_BUDGET;
