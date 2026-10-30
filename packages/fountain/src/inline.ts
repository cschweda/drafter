import type { InlineRun } from './types';

/** A contiguous source range `[from, to)`. */
export type Seg = readonly [number, number];

interface Delimiter {
  marker: 42 | 95; // '*' or '_'
  length: number;
  /** Index of the delimiter's first character in the char arrays. */
  at: number;
  canOpen: boolean;
  canClose: boolean;
  /** Its position in the stack of open delimiters, once pushed. */
  index: number;
}

const MARKERS = /[*_\\]/;

const isSpace = (code: number | undefined) =>
  code === undefined || /\s/.test(String.fromCharCode(code));

/** One opener stack per kind of delimiter: `*`, `**`, `***`, and `_`. */
const slot = (d: Delimiter) => (d.marker === 95 ? 3 : d.length - 1);

/**
 * Text with no line break, such as a section's or a synopsis's, read for emphasis as an action
 * line is: its styled runs, with the marks taken off.
 */
export const inlineRuns = (text: string): InlineRun[] =>
  parseInline(text, [[0, text.length]], true);

/**
 * Parses emphasis (technical design §2.6) in the text that `segs` select from
 * `source`: `*italic*`, `**bold**`, `***bold italic***`, `_underline_`. A
 * delimiter run matches only a run of the same marker and length; a backslash
 * makes the next `*`, `_`, or `\` literal; unmatched markers stay as text.
 * Runs in linear time on any line.
 */
export function parseInline(source: string, segs: readonly Seg[], emphasis: boolean): InlineRun[] {
  if (segs.length === 0) return [];
  // Most lines have no markers at all: one plain run, without per-char work.
  if (!emphasis || !segs.some(([from, to]) => MARKERS.test(source.slice(from, to)))) {
    let text = '';
    for (const [from, to] of segs) text += source.slice(from, to);
    const first = segs[0] as Seg;
    const last = segs[segs.length - 1] as Seg;
    return text
      ? [
          {
            text,
            bold: false,
            italic: false,
            underline: false,
            span: { from: first[0], to: last[1] },
          },
        ]
      : [];
  }

  // Flatten the selected text into parallel arrays of char codes and source offsets.
  const codes: number[] = [];
  const offsets: number[] = [];
  for (const [from, to] of segs) {
    for (let i = from; i < to; i++) {
      codes.push(source.charCodeAt(i));
      offsets.push(i);
    }
  }
  const n = codes.length;
  if (n === 0) return [];

  // Removed chars (escaping backslashes, matched delimiters), and per-style
  // difference arrays: +1 where a styled stretch starts, -1 where it ends.
  const removed = new Uint8Array(n);
  const bold = new Int32Array(n + 1);
  const italic = new Int32Array(n + 1);
  const underline = new Int32Array(n + 1);

  const delimiters: Delimiter[] = [];
  for (let i = 0; i < n; i++) {
    const c = codes[i] as number;
    if (c === 92 /* \ */ && i + 1 < n) {
      const next = codes[i + 1];
      if (next === 42 || next === 95 || next === 92) {
        removed[i] = 1;
        i++; // the escaped char stays as literal text
        continue;
      }
    }
    if (c === 42 || c === 95) {
      let j = i;
      while (j < n && codes[j] === c) j++;
      const length = j - i;
      if (c === 42 ? length <= 3 : length === 1) {
        delimiters.push({
          marker: c,
          length,
          at: i,
          canOpen: !isSpace(codes[j]),
          canClose: !isSpace(codes[i - 1]),
          index: -1,
        });
      }
      i = j - 1;
    }
  }

  const open: Delimiter[] = [];
  const stacks: Delimiter[][] = [[], [], [], []];
  for (const d of delimiters) {
    if (d.canClose) {
      const stack = stacks[slot(d)] as Delimiter[];
      // Skip openers already discarded by an outer match.
      while (stack.length > 0) {
        const top = stack[stack.length - 1] as Delimiter;
        if (open[top.index] === top) break;
        stack.pop();
      }
      const opener = stack.pop();
      if (opener) {
        open.length = opener.index; // openers above the match stay literal
        for (let k = 0; k < opener.length; k++) removed[opener.at + k] = 1;
        for (let k = 0; k < d.length; k++) removed[d.at + k] = 1;
        const start = opener.at + opener.length;
        if (d.marker === 95) {
          (underline[start] as number)++;
          (underline[d.at] as number)--;
        } else {
          if (d.length >= 2) {
            (bold[start] as number)++;
            (bold[d.at] as number)--;
          }
          if (d.length !== 2) {
            (italic[start] as number)++;
            (italic[d.at] as number)--;
          }
        }
        continue;
      }
    }
    if (d.canOpen) {
      d.index = open.length;
      open.push(d);
      (stacks[slot(d)] as Delimiter[]).push(d);
    }
  }

  // Merge chars with the same style into runs.
  const runs: InlineRun[] = [];
  let current: InlineRun | null = null;
  let b = 0;
  let it = 0;
  let u = 0;
  for (let i = 0; i < n; i++) {
    b += bold[i] as number;
    it += italic[i] as number;
    u += underline[i] as number;
    if (removed[i]) continue;
    const offset = offsets[i] as number;
    const ch = String.fromCharCode(codes[i] as number);
    if (
      current &&
      current.bold === b > 0 &&
      current.italic === it > 0 &&
      current.underline === u > 0
    ) {
      current.text += ch;
      current.span.to = offset + 1;
    } else {
      current = {
        text: ch,
        bold: b > 0,
        italic: it > 0,
        underline: u > 0,
        span: { from: offset, to: offset + 1 },
      };
      runs.push(current);
    }
  }
  return runs;
}
