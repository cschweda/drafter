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
}

const MARKERS = /[*_\\]/;

const isSpace = (code: number | undefined) =>
  code === undefined || /\s/.test(String.fromCharCode(code));

/**
 * Parses emphasis (technical design §2.6) in the text that `segs` select from
 * `source`: `*italic*`, `**bold**`, `***bold italic***`, `_underline_`. A
 * delimiter run matches only a run of the same marker and length; a backslash
 * makes the next `*`, `_`, or `\` literal; unmatched markers stay as text.
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
  if (codes.length === 0) return [];

  // Per char: 0 = text, 1 = removed (escape backslash or matched delimiter).
  const removed = new Uint8Array(codes.length);
  const bold = new Int16Array(codes.length);
  const italic = new Int16Array(codes.length);
  const underline = new Int16Array(codes.length);

  if (emphasis) {
    const delimiters: Delimiter[] = [];
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i] as number;
      if (c === 92 /* \ */ && i + 1 < codes.length) {
        const next = codes[i + 1];
        if (next === 42 || next === 95 || next === 92) {
          removed[i] = 1;
          i++; // the escaped char stays as literal text
          continue;
        }
      }
      if (c === 42 || c === 95) {
        let j = i;
        while (j < codes.length && codes[j] === c) j++;
        const length = j - i;
        const usable = c === 42 ? length <= 3 : length === 1;
        if (usable) {
          delimiters.push({
            marker: c,
            length,
            at: i,
            canOpen: !isSpace(codes[j]),
            canClose: !isSpace(codes[i - 1]),
          });
        }
        i = j - 1;
      }
    }

    const open: Delimiter[] = [];
    for (const d of delimiters) {
      if (d.canClose) {
        const k = findOpener(open, d);
        if (k !== -1) {
          const opener = open[k] as Delimiter;
          open.length = k; // openers above the match stay literal
          applyStyle(opener, d, removed, bold, italic, underline);
          continue;
        }
      }
      if (d.canOpen) open.push(d);
    }
  }

  // Merge chars with the same style into runs.
  const runs: InlineRun[] = [];
  let current: InlineRun | null = null;
  for (let i = 0; i < codes.length; i++) {
    if (removed[i]) continue;
    const b = (bold[i] as number) > 0;
    const it = (italic[i] as number) > 0;
    const u = (underline[i] as number) > 0;
    const offset = offsets[i] as number;
    const ch = String.fromCharCode(codes[i] as number);
    if (current && current.bold === b && current.italic === it && current.underline === u) {
      current.text += ch;
      current.span.to = offset + 1;
    } else {
      current = {
        text: ch,
        bold: b,
        italic: it,
        underline: u,
        span: { from: offset, to: offset + 1 },
      };
      runs.push(current);
    }
  }
  return runs;
}

function findOpener(open: Delimiter[], closer: Delimiter): number {
  for (let k = open.length - 1; k >= 0; k--) {
    const o = open[k] as Delimiter;
    if (o.marker === closer.marker && o.length === closer.length) return k;
  }
  return -1;
}

function applyStyle(
  opener: Delimiter,
  closer: Delimiter,
  removed: Uint8Array,
  bold: Int16Array,
  italic: Int16Array,
  underline: Int16Array,
): void {
  for (let i = opener.at; i < opener.at + opener.length; i++) removed[i] = 1;
  for (let i = closer.at; i < closer.at + closer.length; i++) removed[i] = 1;
  const start = opener.at + opener.length;
  for (let i = start; i < closer.at; i++) {
    if (opener.marker === 95) underline[i] = (underline[i] as number) + 1;
    else {
      if (opener.length >= 2) bold[i] = (bold[i] as number) + 1;
      if (opener.length !== 2) italic[i] = (italic[i] as number) + 1;
    }
  }
}
