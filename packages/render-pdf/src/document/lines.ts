import { drawable } from '../text';
import { type DocBlock, MARKER_GAP, type Run } from './blocks';
import type { Face } from './fonts';
import type { Measure } from './measure';
import { STYLE } from './style';

/** Text in one style on one line, drawn with one text operator. `x` is points from the left margin. */
export interface Fragment {
  x: number;
  text: string;
  face: Face;
  size: number;
  color: Run['color'];
  underline: boolean;
  link: string | null;
  /** `measure.width` of exactly `text`: what pdf-lib will draw. */
  width: number;
  /** How far the baseline is raised: a footnote's reference. */
  rise?: number;
  /** The footnote a reference's number refers to. */
  note?: number;
}

/** One line of a block. `ascent` is how far its baseline sits below the line's top. */
export interface DocLine {
  fragments: Fragment[];
  height: number;
  ascent: number;
}

/**
 * Where the baseline sits in a block's size: the text is centred in its leading, and its
 * descenders take the bottom fifth of the size.
 */
const ASCENT = 0.8;

const CHAR = 0;
/** U+0020, where text may break. */
const SPACE = 1;
/** A hard break: the line ends here. */
const HARD = 2;

/** A block's text, one code point a cell, cleaned and ready to draw, with each cell's run. */
interface Cells {
  ch: string[];
  run: Run[];
  kind: number[];
  /** Text may break after this cell (a zero-width space followed it). */
  breakAfter: boolean[];
}

/**
 * The cells of `runs`: control characters as spaces and lone surrogates as `?` (`drawable`); soft
 * hyphens and zero-width spaces dropped, the latter leaving a break after the character before it;
 * a character the run's face lacks as `?`, added to `missing`.
 */
function cellsOf(runs: readonly Run[], measure: Measure, missing: Set<string>): Cells {
  const cells: Cells = { ch: [], run: [], kind: [], breakAfter: [] };
  const add = (ch: string, run: Run, kind: number) => {
    cells.ch.push(ch);
    cells.run.push(run);
    cells.kind.push(kind);
    cells.breakAfter.push(false);
  };
  for (const run of runs) {
    if (run.text === '\n') {
      add('\n', run, HARD);
      continue;
    }
    for (let ch of drawable(run.text, '?')) {
      if (ch === '­') continue;
      if (ch === '​') {
        const last = cells.kind.length - 1;
        if (cells.kind[last] === CHAR) cells.breakAfter[last] = true;
        continue;
      }
      if (ch !== ' ' && ch !== '?' && !measure.has(ch.codePointAt(0) as number, run.face)) {
        missing.add(ch);
        ch = '?';
      }
      add(ch, run, ch === ' ' ? SPACE : CHAR);
    }
  }
  return cells;
}

const sameStyle = (a: Run, b: Run) =>
  a.face === b.face &&
  a.size === b.size &&
  a.color === b.color &&
  a.underline === b.underline &&
  a.link === b.link &&
  a.rise === b.rise &&
  a.note === b.note;

/**
 * Wraps a block to `width` (the text area's), Call 13. Characters a face lacks become '?' and are
 * added to `missing`.
 *
 * Text breaks at spaces and after zero-width spaces, first fit, estimating a line by its words'
 * widths; a word wider than the line starts a line of its own and breaks at the character that
 * overflows it. Code and raw HTML break only by character, at the panel's (or the line's) edge.
 * Each line's fragments, one per run of one style, are then measured whole, exactly as they will
 * be drawn, and a line that comes out wider than the estimate gives back its last word (or, a lone
 * word, its last character), so contextual alternates can never push drawn text past the edge. A
 * single character wider than the line is the one thing drawn past it, alone on its line.
 *
 * Every block gives at least one line (an empty one places its marker, or its space); a rule is one
 * line its thickness high. A list item's marker is the first line's first fragment, right-aligned to
 * `indent − MARKER_GAP`, on that line's baseline. A code panel's padding is in its first and last
 * lines' heights.
 */
export function wrapBlock(
  block: DocBlock,
  width: number,
  measure: Measure,
  missing: Set<string>,
): DocLine[] {
  if (block.kind === 'rule') return [{ fragments: [], height: block.leading, ascent: 0 }];

  const code = block.kind === 'code' || block.kind === 'raw';
  const pad = block.panel ? STYLE.codePadding : 0;
  const left = block.indent + pad;
  const right = width - pad;
  const cells = cellsOf(block.runs, measure, missing);
  const { ch, run, kind, breakAfter } = cells;
  const n = ch.length;

  const charWidth = (i: number) =>
    measure.width(ch[i] as string, (run[i] as Run).face, (run[i] as Run).size);
  /** The width of cells `from` to `to`, a word's: each run's part of it measured whole. */
  const wordWidth = (from: number, to: number) => {
    let total = 0;
    for (let i = from; i < to; ) {
      const style = run[i] as Run;
      let text = '';
      while (i < to && sameStyle(run[i] as Run, style)) text += ch[i++];
      total += measure.width(text, style.face, style.size);
    }
    return total;
  };
  /** Text drops the spaces at a line's end; code keeps every one. */
  const trimmed = (from: number, to: number) => {
    if (!code) while (to > from && kind[to - 1] === SPACE) to--;
    return to;
  };
  const fragmentsOf = (from: number, to: number): Fragment[] => {
    const fragments: Fragment[] = [];
    let x = left;
    for (let i = from; i < to; ) {
      const style = run[i] as Run;
      let text = '';
      while (i < to && sameStyle(run[i] as Run, style)) text += ch[i++];
      const w = measure.width(text, style.face, style.size);
      fragments.push({
        x,
        text,
        face: style.face,
        size: style.size,
        color: style.color,
        underline: style.underline,
        link: style.link,
        width: w,
        ...(style.rise === undefined ? {} : { rise: style.rise }),
        ...(style.note === undefined ? {} : { note: style.note }),
      });
      x += w;
    }
    return fragments;
  };

  /** Where a line from `start` ends, by estimate: a hard break's index, `n`, or the first cell of the next line. */
  const estimateEnd = (start: number): number => {
    let x = left;
    if (code) {
      let i = start;
      for (; i < n && kind[i] !== HARD; i++) {
        const w = charWidth(i);
        if (x + w > right && i > start) break;
        x += w;
      }
      return i;
    }
    let spaces = 0;
    let lastWord = -1;
    let i = start;
    while (i < n && kind[i] !== HARD) {
      if (kind[i] === SPACE) {
        spaces += charWidth(i);
        i++;
        continue;
      }
      // The word's characters, summed only until they pass the room left by a quarter line (drawn
      // whole, a word may come out narrower than its characters): a word too wide for that is
      // never measured whole, so no line measures more than about a line and a quarter of text.
      const room = right - x - spaces + (right - left) / 4;
      let sum = 0;
      let j = i;
      for (; j < n && kind[j] === CHAR && (j === i || !breakAfter[j - 1]); j++) {
        sum += charWidth(j);
        if (sum > room) {
          j++;
          break;
        }
      }
      const w = sum > room ? Number.POSITIVE_INFINITY : wordWidth(i, j);
      if (x + spaces + w > right) {
        if (lastWord >= 0) return lastWord;
        // A word wider than the line: it breaks at the character that overflows it.
        let k = i;
        for (; k < j; k++) {
          const cw = charWidth(k);
          if (x + cw > right && k > i) break;
          x += cw;
        }
        return k;
      }
      x += spaces + w;
      spaces = 0;
      lastWord = j;
      i = j;
    }
    return i;
  };

  /** The end of the line before `end`'s last word, or `start` when it has only one. */
  const lastWordStart = (start: number, end: number) => {
    // The word's last character, then back to its first.
    let k = trimmed(start, end) - 1;
    while (k > start && kind[k - 1] !== SPACE && !breakAfter[k - 1]) k--;
    return trimmed(start, k) > start ? k : start;
  };

  const ascent = (block.leading - block.size) / 2 + ASCENT * block.size;
  const lines: DocLine[] = [];
  let start = 0;
  for (;;) {
    if (!code) while (start < n && kind[start] === SPACE) start++;
    let end = estimateEnd(start);
    let fragments = fragmentsOf(start, trimmed(start, end));
    // Measured as drawn, a line may come out wider than its estimate: give back a word, or a character.
    for (;;) {
      const last = fragments.at(-1);
      if (!last || last.x + last.width <= right) break;
      const back = code ? start : lastWordStart(start, end);
      if (back > start) end = back;
      else if (trimmed(start, end) - start > 1) end = trimmed(start, end) - 1;
      else break;
      fragments = fragmentsOf(start, trimmed(start, end));
    }
    lines.push({ fragments, height: block.leading, ascent });
    if (end >= n) break;
    start = kind[end] === HARD ? end + 1 : end;
  }

  if (pad > 0) {
    const first = lines[0] as DocLine;
    lines[0] = { ...first, height: first.height + pad, ascent: first.ascent + pad };
    const last = lines.at(-1) as DocLine;
    lines[lines.length - 1] = { ...last, height: last.height + pad };
  }

  if (block.marker) {
    const marks = cellsOf([block.marker], measure, missing);
    const text = marks.ch.join('');
    const w = measure.width(text, block.marker.face, block.marker.size);
    const { face, size, color, underline, link } = block.marker;
    (lines[0] as DocLine).fragments.unshift({
      x: block.indent - MARKER_GAP - w,
      text,
      face,
      size,
      color,
      underline,
      link,
      width: w,
    });
  }
  return lines;
}
