import type { Manuscript, ManuscriptBlock, Run } from '@drafter/novel';
import { PAPER_POINTS, type Paper } from '@drafter/templates';
import { MIN_LINES } from '../document/paginate';
import type { ManuscriptFace } from './fonts';

// A novel's standard manuscript, laid out on pages (manuscript design, "Layout" and "The PDF"):
// 12 pt, double-spaced, one-inch margins, every paragraph's first line indented half an inch, a
// title page, and a running header on every page after it. The fonts are measured by the caller,
// so the same layout serves Liberation Serif, Courier Prime, and a test's fixed-width measure.

/** A run of one face on one line. */
export type ManuscriptRun = Run & { face: ManuscriptFace };

/** One line: where it starts (`x` from the page's left, `y` its baseline from the page's top, in points) and its runs. */
export interface ManuscriptLine {
  x: number;
  y: number;
  runs: ManuscriptRun[];
}

/** A page: its number (the title page is 1), its running header (none on the title page), and its lines. */
export interface ManuscriptPage {
  number: number;
  header: string | null;
  lines: ManuscriptLine[];
}

/** The text size. */
export const SIZE = 12;
/** Double spacing: one line to the next. */
export const LEADING = 24;
/** The contact lines under the legal name are single-spaced, as on a typed title page. */
const CONTACT_LEADING = 12;
export const MARGIN = 72;
/** A paragraph's first-line indent, and a quote's or a list's indent on each side. */
const INDENT = 36;
/** The running header's baseline, from the page's top: half an inch. */
export const HEADER_Y = 36;
/** The room the word count keeps from the legal name and contact lines beside it. */
const GAP = 18;
const EPS = 1e-6;

export type ManuscriptMeasure = (text: string, face: ManuscriptFace) => number;

const faceOf = (run: Run): ManuscriptFace =>
  run.bold ? (run.italic ? 'boldItalic' : 'bold') : run.italic ? 'italic' : 'regular';

/** A piece of a line: text in one run's marks (so one face). */
interface Piece {
  run: ManuscriptRun;
  width: number;
}

/**
 * `runs`, wrapped at word boundaries: the first line `first` pt wide, the rest `rest` pt. A word is
 * the text between spaces, and may span runs (an italic word and its comma). A word wider than its
 * line breaks at the character that overflows it. Spaces at either end of a wrapped line are
 * dropped; with `keepSpaces` (a code line) the first line's leading spaces are kept. Each line's
 * runs of the same marks are joined, so each is drawn with one text operator. Always at least one
 * line, perhaps empty.
 */
function wrap(
  runs: readonly Run[],
  first: number,
  rest: number,
  measure: ManuscriptMeasure,
  keepSpaces = false,
): ManuscriptRun[][] {
  // Words and the spaces between them, as pieces.
  type Token = { space: boolean; pieces: Piece[]; width: number };
  const tokens: Token[] = [];
  for (const source of runs) {
    const run: ManuscriptRun = { ...source, text: '', face: faceOf(source) };
    for (const part of source.text.replace(/\r?\n/g, ' ').split(/( +)/)) {
      if (part === '') continue;
      const space = part.startsWith(' ');
      const piece = { run: { ...run, text: part }, width: measure(part, run.face) };
      const last = tokens.at(-1);
      if (last && last.space === space) {
        last.pieces.push(piece);
        last.width += piece.width;
      } else {
        tokens.push({ space, pieces: [piece], width: piece.width });
      }
    }
  }

  const lines: Piece[][] = [];
  let line: Piece[] = [];
  let used = 0;
  /** Spaces waiting to be placed before the next word on this line. */
  let pending: Token | null = null;
  const width = () => (lines.length === 0 ? first : rest);
  const breakLine = () => {
    lines.push(line);
    line = [];
    used = 0;
    pending = null;
  };

  for (const token of tokens) {
    if (token.space) {
      if (line.length === 0 && !(keepSpaces && lines.length === 0)) continue;
      pending = token;
      if (line.length === 0) {
        // A code line's leading spaces: placed as they are.
        line.push(...token.pieces);
        used += token.width;
        pending = null;
      }
      continue;
    }
    const before = pending?.width ?? 0;
    if (line.length > 0 && used + before + token.width > width() + EPS) breakLine();
    if (pending) {
      line.push(...pending.pieces);
      used += pending.width;
      pending = null;
    }
    if (used + token.width <= width() + EPS) {
      line.push(...token.pieces);
      used += token.width;
      continue;
    }
    // A word wider than its line: by character, a line at a time.
    for (const piece of token.pieces) {
      for (const ch of piece.run.text) {
        const w = measure(ch, piece.run.face);
        if (used > 0 && used + w > width() + EPS) breakLine();
        line.push({ run: { ...piece.run, text: ch }, width: w });
        used += w;
      }
    }
  }
  if (line.length > 0 || lines.length === 0) lines.push(line);

  return lines.map((pieces) => {
    const joined: ManuscriptRun[] = [];
    for (const { run } of pieces) {
      const last = joined.at(-1);
      if (last && last.face === run.face && !!last.code === !!run.code) last.text += run.text;
      else joined.push({ ...run });
    }
    return joined;
  });
}

const lineWidth = (runs: readonly ManuscriptRun[], measure: ManuscriptMeasure) =>
  runs.reduce((sum, run) => sum + measure(run.text, run.face), 0);

/** The running header: `Surname / SHORT TITLE / N`, leaving out an empty part. */
function headerFor(ms: Manuscript, n: number): string {
  return [ms.surname.trim(), ms.shortTitle.trim(), String(n)].filter((s) => s !== '').join(' / ');
}

/** A paragraph's lines' left edges and widths, by style: `[first x, later x, right edge]`. */
function edges(style: string, left: number, right: number): [number, number, number] {
  switch (style) {
    case 'quote':
      return [left + INDENT, left + INDENT, right - INDENT];
    case 'list':
      return [left + INDENT, left + INDENT, right];
    case 'code':
      return [left, left, right];
    default:
      return [left + INDENT, left, right];
  }
}

/**
 * Lays a manuscript out on Letter or A4: the title page (the legal name and contact lines top
 * left, the word count top right, the title centred halfway down and the byline under it), then
 * the book. A part has a page of its own, its title halfway down; a chapter starts a new page, its
 * title centred a third of the way down and its text two lines below. A paragraph never leaves
 * fewer than `MIN_LINES` of its lines at the foot or the head of a page; a scene break keeps the
 * next paragraph's first lines with it; `END` follows the text after a blank line, and the notes,
 * if any, follow on a page headed "Notes". `onProgress` is told the blocks laid out.
 */
export function layoutManuscript(
  ms: Manuscript,
  opts: {
    paper: Paper;
    measure: ManuscriptMeasure;
    onProgress?: (done: number, total: number) => void;
  },
): ManuscriptPage[] {
  const { measure } = opts;
  const { width, height } = PAPER_POINTS[opts.paper];
  const left = MARGIN;
  const right = width - MARGIN;
  const bottom = height - MARGIN;
  const text = (s: string): Run[] => (s === '' ? [] : [{ text: s }]);
  const centred = (runs: ManuscriptRun[], y: number): ManuscriptLine => ({
    x: (width - lineWidth(runs, measure)) / 2,
    y,
    runs,
  });

  // The title page.
  const title: ManuscriptLine[] = [];
  const count = wrap(text(ms.wordsLabel), right - left, right - left, measure)[0] ?? [];
  const countWidth = lineWidth(count, measure);
  const besideCount = Math.max(right - left - countWidth - GAP, (right - left) / 2);
  let y = MARGIN;
  for (const detail of [ms.legalName, ...ms.contact]) {
    if (detail.trim() === '') continue;
    for (const runs of wrap(text(detail.trim()), besideCount, besideCount, measure)) {
      title.push({ x: left, y, runs });
      y += CONTACT_LEADING;
    }
  }
  if (count.length > 0) title.push({ x: right - countWidth, y: MARGIN, runs: count });
  y = height / 2;
  for (const runs of wrap(text(ms.title.trim()), right - left, right - left, measure)) {
    if (runs.length === 0) continue;
    title.push(centred(runs, y));
    y += LEADING;
  }
  if (ms.byline.trim() !== '') {
    for (const runs of wrap(text(`by ${ms.byline.trim()}`), right - left, right - left, measure)) {
      title.push(centred(runs, y));
      y += LEADING;
    }
  }
  const pages: ManuscriptPage[] = [{ number: 1, header: null, lines: title }];

  // The book.
  let page = pages[0] as ManuscriptPage;
  /** The next line's baseline. */
  y = MARGIN;
  /** Nothing more goes on this page (a part's). */
  let closed = true;
  /** What was placed last: a blank line goes before END only after text. */
  let last: ManuscriptBlock['kind'] | 'none' = 'none';

  const newPage = () => {
    page = { number: pages.length + 1, header: headerFor(ms, pages.length + 1), lines: [] };
    pages.push(page);
    y = MARGIN;
    closed = false;
  };
  /** How many more lines fit on this page, from `y`. */
  const room = () =>
    closed ? 0 : Math.max(0, Math.floor((bottom - SIZE - y + EPS) / LEADING) + 1);
  const place = (line: Omit<ManuscriptLine, 'y'>) => {
    page.lines.push({ ...line, y });
    y += LEADING;
  };
  const fresh = () => !closed && page.lines.length === 0;
  /** Starts a new page unless this one is fresh. */
  const freshPage = () => {
    if (!fresh()) newPage();
  };

  /** A paragraph's lines, placed with at least `MIN_LINES` on each side of a page break. */
  const placeLines = (lines: Omit<ManuscriptLine, 'y'>[]) => {
    let from = 0;
    while (from < lines.length) {
      const remaining = lines.length - from;
      const fit = room();
      let take: number;
      if (remaining <= fit) take = remaining;
      else if (remaining < 2 * MIN_LINES || fit < MIN_LINES) take = 0;
      else take = Math.min(fit, remaining - MIN_LINES);
      // A fresh page takes what fits, whatever is left over.
      if (take === 0 && fresh()) take = Math.max(1, Math.min(fit, remaining));
      for (const line of lines.slice(from, from + take)) place(line);
      from += take;
      if (from < lines.length) newPage();
    }
  };

  const paragraphLines = (
    runs: readonly Run[],
    style: string,
    marker?: string,
  ): Omit<ManuscriptLine, 'y'>[] => {
    const [x1, x2, edge] = edges(style, left, right);
    const all = marker === undefined ? runs : [{ text: `${marker} ` }, ...runs];
    return wrap(all, edge - x1, edge - x2, measure, style === 'code').map((line, i) => ({
      x: i === 0 ? x1 : x2,
      runs: line,
    }));
  };

  /** The first `MIN_LINES` lines' count of the block after `i`, if it is a paragraph. */
  const nextLines = (i: number) => {
    const next = ms.blocks[i + 1];
    if (next?.kind !== 'paragraph') return 0;
    return Math.min(MIN_LINES, paragraphLines(next.runs, next.style, next.marker).length);
  };

  const titleLines = (title: string, top: number) => {
    y = top;
    for (const runs of wrap(text(title.trim()), right - left, right - left, measure)) {
      if (runs.length === 0) continue;
      if (room() === 0) newPage();
      place(centred(runs, 0));
    }
  };

  const total = ms.blocks.length;
  newPage();
  for (const [i, block] of ms.blocks.entries()) {
    switch (block.kind) {
      case 'part':
        freshPage();
        titleLines(block.title, height / 2);
        closed = true;
        break;
      case 'chapter':
        freshPage();
        titleLines(block.title, height / 3);
        // The text starts two double-spaced lines below the title.
        y += LEADING;
        break;
      case 'paragraph':
        if (closed) newPage();
        placeLines(paragraphLines(block.runs, block.style, block.marker));
        break;
      case 'break': {
        if (closed) newPage();
        // The break keeps the next paragraph's first lines with it.
        if (room() < 1 + nextLines(i) && !fresh()) newPage();
        place(centred([{ text: '#', face: 'regular' }], 0));
        break;
      }
      case 'end': {
        if (closed) newPage();
        if ((last === 'paragraph' || last === 'break') && !fresh()) y += LEADING;
        if (room() === 0) newPage();
        place(centred([{ text: 'END', face: 'regular' }], 0));
        break;
      }
    }
    last = block.kind;
    opts.onProgress?.(i + 1, total);
  }

  if (ms.notes.length > 0) {
    newPage();
    place(centred([{ text: 'Notes', face: 'regular' }], 0));
    y += LEADING;
    for (const [i, note] of ms.notes.entries()) {
      placeLines(paragraphLines([{ text: `${i + 1}. ` }, ...note], 'body'));
    }
  }
  return pages;
}
