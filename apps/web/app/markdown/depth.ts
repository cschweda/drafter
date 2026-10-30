/**
 * The most containers (block quotes, list items, footnote definitions) a Markdown document may
 * nest; deeper, it isn't parsed (DECISIONS, Footnotes: nesting). The parser's work grows with depth
 * times length (it checks every open container on every line, and each list reads all of what it
 * holds), and 48 is where 100 KB at the worst depth still parses in about 200 ms on the
 * maintainer's machine. No treatment, outline, or novel comes near it.
 */
export const MAX_NESTING = 48;

const SPACE = 32;
const TAB = 9;
const LF = 10;
const CR = 13;

const isLineEnd = (code: number) => code === LF || code === CR;
/** What may follow a list's mark: a space, a tab, or the line's end (an empty item); NaN is the text's end. */
const endsMark = (code: number) =>
  code === SPACE || code === TAB || isLineEnd(code) || Number.isNaN(code);

/**
 * How deeply the containers of `source` may nest, at least as deep as the parser would nest them
 * (never fewer), and a little more for some lines; stops as soon as it passes `limit` and says how
 * far it got. One pass, each character read at most twice, no regular expression.
 *
 * A line's prefix is read up to its first character that opens nothing: its indentation (in
 * columns, a tab to the next multiple of 4), each `>`, each list mark (`-`, `*`, `+`, or 1 to 9
 * digits and `.` or `)`) followed by a space, a tab, or the line's end, and each footnote label
 * with its colon (`[^…]:`). A line may carry on the containers open above it, as many as its
 * indentation pays for (a list item needs at least two columns of it, inside its parent), and a
 * quote mark for each quote; and it may open one for each mark. So the line's depth is at most its
 * quote marks, plus the containers above it that its indentation can carry on (no more than were
 * open), plus its other marks. A blank or lazy line carries on everything, so the depth so far never
 * falls. Footnote definitions are counted apart: the footnote syntax carries on every open
 * definition on one indentation of four columns, however many are nested, so a line indented four
 * columns may carry them all.
 */
export function containerDepth(source: string, limit: number): number {
  const n = source.length;
  /** The most containers open after a line so far, and of them, footnote definitions. */
  let depth = 0;
  let notes = 0;
  let i = 0;
  while (i < n) {
    let column = 0;
    let indent = 0;
    let quotes = 0;
    let marks = 0;
    let labels = 0;
    let blank = true;
    // The prefix: what the line could open or carry on.
    while (i < n) {
      const code = source.charCodeAt(i);
      if (code === SPACE) {
        column++;
        indent++;
        i++;
        continue;
      }
      if (code === TAB) {
        const to = column + 4 - (column % 4);
        indent += to - column;
        column = to;
        i++;
        continue;
      }
      if (isLineEnd(code)) break;
      blank = false;
      // A line of marks alone may pass the limit: it is said at once, without reading the rest.
      if (quotes + marks + labels > limit) return quotes + marks + labels;
      if (code === 62) {
        // `>`
        quotes++;
        column++;
        i++;
        continue;
      }
      if (code === 45 || code === 42 || code === 43) {
        // `-`, `*`, `+`
        if (!endsMark(source.charCodeAt(i + 1))) break;
        marks++;
        column++;
        i++;
        continue;
      }
      if (code >= 48 && code <= 57) {
        let j = i;
        while (j < n && j - i < 9 && source.charCodeAt(j) >= 48 && source.charCodeAt(j) <= 57) j++;
        const after = source.charCodeAt(j);
        if ((after !== 46 && after !== 41) || !endsMark(source.charCodeAt(j + 1))) break;
        marks++;
        column += j + 1 - i;
        i = j + 1;
        continue;
      }
      if (code === 91 && source.charCodeAt(i + 1) === 94) {
        // `[^`, a label of anything but spaces and brackets (a `\` takes the next character), `]:`.
        let j = i + 2;
        for (; j < n; j++) {
          const c = source.charCodeAt(j);
          if (c === 92) j++;
          else if (c === 93 || c === 91 || c === SPACE || c === TAB || isLineEnd(c)) break;
        }
        if (j === i + 2 || source.charCodeAt(j) !== 93 || source.charCodeAt(j + 1) !== 58) break;
        labels++;
        column += j + 2 - i;
        i = j + 2;
        continue;
      }
      break;
    }
    // The rest of the line.
    while (i < n && !isLineEnd(source.charCodeAt(i))) {
      blank = false;
      i++;
    }
    if (i < n && source.charCodeAt(i) === CR && source.charCodeAt(i + 1) === LF) i++;
    i++;

    if (blank) continue;
    const carriedNotes = indent >= 4 ? notes : 0;
    const carried = Math.min(depth, Math.floor(indent / 2) + carriedNotes);
    depth = Math.max(depth, quotes + carried + marks + labels);
    notes = Math.max(notes, carriedNotes + labels);
    if (depth > limit) return depth;
  }
  return depth;
}
