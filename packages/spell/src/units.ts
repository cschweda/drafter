import type { Block, Doc, Region } from '@drafter/fountain';

// The checkable text of a script or a Markdown document (Phase 2 design §12; Plan D, Calls 6, 7,
// and 16), a unit per block. A unit's text is the source from `from`, the same length, with every
// part that isn't checked turned into spaces, so a token's offsets in it are offsets in the source.

export interface Unit {
  /** The block's kind and its text, so equal blocks share a cache entry. */
  key: string;
  from: number;
  /** The source from `from`, the same length, with the parts not checked as spaces. */
  text: string;
}

export interface UnitOptions {
  /** Check notes and boneyard. */
  notes: boolean;
}

/** The kinds checked whole. A scene heading gives its time; cues, transitions, and page breaks nothing. */
const WHOLE = new Set<Block['kind']>([
  'action',
  'dialogue',
  'parenthetical',
  'centered',
  'lyric',
  'section',
  'synopsis',
]);

/** The forcing marks and other markers at a line's start (and a centered line's end), by kind. */
const MARKS: Partial<Record<Block['kind'], RegExp[]>> = {
  action: [/^\s*!/],
  centered: [/^\s*>/, /<\s*$/],
  lyric: [/^\s*~/],
  section: [/^\s*#+/],
  synopsis: [/^\s*=/],
};

/** The source from `from` to `to` as characters to blank, with each CRLF's `\r` already blanked. */
function charsOf(source: string, from: number, to: number): string[] {
  const chars = source.slice(from, to).split('');
  for (let i = 0; i < chars.length; i++) if (chars[i] === '\r') chars[i] = ' ';
  return chars;
}

/** Blanks `[from, to)` (source offsets) in `chars`, which starts at `base`. */
function blank(chars: string[], base: number, from: number, to: number): void {
  const end = Math.min(to - base, chars.length);
  for (let i = Math.max(from - base, 0); i < end; i++) if (chars[i] !== '\n') chars[i] = ' ';
}

function unitOf(kind: string, from: number, chars: string[]): Unit | null {
  const text = chars.join('');
  return /\S/.test(text) ? { key: `${kind}:${text}`, from, text } : null;
}

/**
 * The `/* drafter` boneyard in the last block, read or not: never checked, even damaged, since it
 * holds Drafter's settings and not the writer's words. (`parse` reads `doc.meta` from it.)
 */
function isMetaRegion(doc: Doc, region: Region): boolean {
  const last = doc.blocks[doc.blocks.length - 1];
  if (last?.kind !== 'boneyard' || region.span.from < last.span.from) return false;
  return /^\/\* drafter\r?\n/.test(doc.source.slice(region.span.from, region.span.from + 12));
}

/** A keyed note's head: the text before its first colon, on one line, at most 40 characters, starting with a letter. */
function keyedHead(inner: string): { head: string; colon: number } | null {
  const colon = inner.indexOf(':');
  if (colon < 0) return null;
  const head = inner.slice(0, colon).trim();
  if (head.length === 0 || head.length > 40 || /[\r\n]/.test(head) || !/^\p{L}/u.test(head)) {
    return null;
  }
  return { head: head.toLowerCase(), colon };
}

/** Heads whose body is a value Drafter reads (a color, a card's place), not the writer's words. */
const VALUE_HEADS = new Set(['color', 'card']);

/** A note or boneyard as its own unit: its delimiters blanked, and a keyed note's head. */
function regionUnit(source: string, region: Region): Unit | null {
  const { from, to } = region.span;
  const chars = charsOf(source, from, to);
  blank(chars, from, from, from + 2);
  if (region.closed) blank(chars, from, to - 2, to);
  if (region.kind === 'note') {
    const inner = source.slice(from + 2, region.closed ? to - 2 : to);
    const keyed = keyedHead(inner);
    if (keyed && VALUE_HEADS.has(keyed.head)) return null;
    if (keyed) blank(chars, from, from + 2, from + 2 + keyed.colon + 1);
  }
  return unitOf(region.kind, from, chars);
}

/** Blanks each line's markers; an action's `!` forces only on its first line. */
function blankMarks(block: Block, chars: string[]): void {
  const marks = MARKS[block.kind];
  if (!marks) return;
  const lines =
    block.kind === 'action' ? (block.forced ? block.lines.slice(0, 1) : []) : block.lines;
  for (const line of lines) {
    const text = line.raw.replace(/\r$/, '');
    for (const mark of marks) {
      const found = mark.exec(text);
      if (found) {
        const at = line.span.from + found.index;
        blank(chars, block.span.from, at, at + found[0].length);
      }
    }
  }
}

/** A scene heading's time (`NIGHT`, `MOMENTS LATER`), the rest blanked; null when it has none. */
function headingUnit(
  block: Extract<Block, { kind: 'scene_heading' }>,
  chars: string[],
): Unit | null {
  if (block.sem.time === null) return null;
  const line = block.lines[0];
  if (!line) return null;
  const end = line.span.to - block.span.from;
  let text = chars.slice(0, end).join('');
  // The scene number, `#12A#`, goes before the separator is looked for.
  const number = block.sem.number === null ? null : /#[^#]*#\s*$/.exec(text);
  if (number) text = text.slice(0, number.index);
  const separator = Math.max(text.lastIndexOf(' - '), text.lastIndexOf(' – '));
  if (separator < 0) return null;
  for (let i = 0; i < chars.length; i++) {
    if (i < separator + 3 || i >= text.length) chars[i] = chars[i] === '\n' ? '\n' : ' ';
  }
  return unitOf(block.kind, block.span.from, chars);
}

/**
 * One unit per checked block: action, dialogue, parenthetical, centered, lyric, section,
 * synopsis; a scene heading's time only. Never: cues, transitions, page breaks, the title page,
 * scene numbers, forcing marks, the metadata block. Notes and boneyards are blanked unless
 * `notes`; with `notes`, each is its own unit and a keyed note's head is blanked. `key` is the
 * block kind and its text, so equal blocks share a cache entry.
 */
export function fountainUnits(doc: Doc, options: UnitOptions): Unit[] {
  const { source, regions } = doc;
  const units: Unit[] = [];
  let next = 0; // the first region that may overlap the current block
  for (const block of doc.blocks) {
    if (block.kind !== 'scene_heading' && !WHOLE.has(block.kind)) continue;
    const { from, to } = block.span;
    const chars = charsOf(source, from, to);
    while (next < regions.length && (regions[next] as Region).span.to <= from) next++;
    for (let k = next; k < regions.length; k++) {
      const region = regions[k] as Region;
      if (region.span.from >= to) break;
      blank(chars, from, region.span.from, region.span.to);
    }
    let unit: Unit | null;
    if (block.kind === 'scene_heading') {
      unit = headingUnit(block, chars);
    } else {
      blankMarks(block, chars);
      unit = unitOf(block.kind, from, chars);
    }
    if (unit) units.push(unit);
  }
  if (!options.notes) return units;

  const titleEnd = doc.titlePage?.span.to ?? 0;
  for (const region of regions) {
    if (region.span.from < titleEnd || isMetaRegion(doc, region)) continue;
    const unit = regionUnit(source, region);
    if (unit) units.push(unit);
  }
  return units.sort((a, b) => a.from - b.from);
}

// Markdown (Call 16): a small scanner, not a Markdown parse, that knows the CommonMark shapes
// holding code, addresses, or markup. A unit is a paragraph, or a heading line.

/** A line's offsets, `to` before its `\n`. */
interface LineSpan {
  from: number;
  to: number;
}

function linesOf(source: string): LineSpan[] {
  const lines: LineSpan[] = [];
  let from = 0;
  for (;;) {
    const at = source.indexOf('\n', from);
    lines.push({ from, to: at < 0 ? source.length : at });
    if (at < 0) return lines;
    from = at + 1;
  }
}

/** A fence at any indent: one under a list item is indented four or more. */
const FENCE = /^\s*(`{3,}|~{3,})/;
const ATX = /^ {0,3}#{1,6}(?:\s|$)/;
/** Four columns of indent: a tab, or four spaces (a tab after up to three). */
const INDENTED = /^(?: {0,3}\t| {4})/;
const REFERENCE = /^ {0,3}\[[^\]]+\]:/;
const AUTOLINK = /<[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>]*>|<[^\s<>@]+@[^\s<>]+>/g;
const TAG = /<\/?[A-Za-z][A-Za-z0-9-]*(?:\s[^<>]*)?\/?>/g;
const ENTITY = /&(?:#[0-9]{1,7}|#[xX][0-9A-Fa-f]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/g;

/** Blanks every match of `pattern` in `text`, which is `chars` from source offset `base`. */
function blankAll(chars: string[], text: string, pattern: RegExp, base: number): void {
  for (const match of text.matchAll(pattern)) {
    blank(chars, 0, base + match.index, base + match.index + match[0].length);
  }
}

/** Code spans: a backtick run up to the next run of the same length; an unmatched run stays. */
function blankCodeSpans(chars: string[], text: string, base: number): void {
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '`') {
      i++;
      continue;
    }
    let j = i;
    while (text[j] === '`') j++;
    const run = j - i;
    let close = -1;
    for (let k = j; k < text.length; ) {
      if (text[k] !== '`') {
        k++;
        continue;
      }
      let end = k;
      while (text[end] === '`') end++;
      if (end - k === run) {
        close = end;
        break;
      }
      k = end;
    }
    if (close < 0) {
      i = j;
      continue;
    }
    blank(chars, 0, base + i, base + close);
    i = close;
  }
}

/**
 * Each bracket's partner: for every `(` and `[`, the offset of the `)` or `]` that closes it, or
 * -1. One pass with a stack per kind, skipping escaped characters, so it is linear.
 */
function partners(text: string): Int32Array {
  const out = new Int32Array(text.length).fill(-1);
  const parens: number[] = [];
  const squares: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') i++;
    else if (c === '(') parens.push(i);
    else if (c === '[') squares.push(i);
    else if (c === ')' && parens.length > 0) out[parens.pop() as number] = i;
    else if (c === ']' && squares.length > 0) out[squares.pop() as number] = i;
  }
  return out;
}

/** A link's `(destination "title")` after `](`, and a full reference's `[label]` after `]`. */
function blankLinkTargets(chars: string[], text: string, base: number): void {
  const partner = partners(text);
  for (let i = text.indexOf(']'); i >= 0; i = text.indexOf(']', i + 1)) {
    const open = text[i + 1];
    if (open !== '(' && open !== '[') continue;
    const close = partner[i + 1] as number;
    if (close < 0) continue;
    blank(chars, 0, base + i + 1, base + close + 1);
    i = close;
  }
}

/** The front matter's last line: a `---` (or `+++`) first line, up to the matching line. */
function frontMatterEnd(source: string, lines: LineSpan[]): number {
  const first = lines[0];
  if (!first) return -1;
  const fence = source.slice(first.from, first.to).trimEnd();
  if (fence !== '---' && fence !== '+++') return -1;
  for (let k = 1; k < lines.length; k++) {
    const line = lines[k] as LineSpan;
    const text = source.slice(line.from, line.to).trimEnd();
    if (text === fence || (fence === '---' && text === '...')) return k;
  }
  return -1;
}

/**
 * One unit per paragraph, blanking fenced and indented code, inline code, front matter, HTML
 * tags, autolinks, and link destinations.
 */
export function markdownUnits(source: string): Unit[] {
  const chars = charsOf(source, 0, source.length);
  const lines = linesOf(source);
  const lineText = (line: LineSpan) => source.slice(line.from, line.to).replace(/\r$/, '');
  /** Each line's part: blank, code (already blanked), a heading, or a paragraph's. */
  const kinds: Array<'blank' | 'code' | 'heading' | 'text'> = [];

  const front = frontMatterEnd(source, lines);
  let fence: { mark: string; length: number } | null = null;
  let inParagraph = false;
  lines.forEach((line, k) => {
    const text = lineText(line);
    if (k <= front) {
      blank(chars, 0, line.from, line.to);
      kinds.push('code');
      return;
    }
    if (fence) {
      blank(chars, 0, line.from, line.to);
      kinds.push('code');
      const close = FENCE.exec(text);
      const run = close?.[1];
      if (run?.[0] === fence.mark && run.length >= fence.length && text.trim() === run) {
        fence = null;
      }
      return;
    }
    const open = FENCE.exec(text);
    if (open) {
      const run = open[1] as string;
      fence = { mark: run[0] as string, length: run.length };
      blank(chars, 0, line.from, line.to);
      kinds.push('code');
      inParagraph = false;
      return;
    }
    if (text.trim() === '') {
      kinds.push('blank');
      inParagraph = false;
      return;
    }
    // Indented code and a link reference definition can't interrupt a paragraph.
    if (!inParagraph && (INDENTED.test(text) || REFERENCE.test(text))) {
      blank(chars, 0, line.from, line.to);
      kinds.push('code');
      return;
    }
    if (ATX.test(text)) {
      kinds.push('heading');
      inParagraph = false;
      return;
    }
    kinds.push('text');
    inParagraph = true;
  });

  // Comments may run across lines, even blank ones; code is blanked by now, so none starts there.
  const text = chars.join('');
  for (let at = text.indexOf('<!--'); at >= 0; at = text.indexOf('<!--', at)) {
    const end = text.indexOf('-->', at + 4);
    if (end < 0) break;
    blank(chars, 0, at, end + 3);
    at = end + 3;
  }

  const units: Unit[] = [];
  const flush = (kind: string, first: number, last: number) => {
    const from = (lines[first] as LineSpan).from;
    const to = (lines[last] as LineSpan).to;
    const now = () => chars.slice(from, to).join('');
    // Code first, since nothing inside it is markup; each step reads what the last one left.
    blankCodeSpans(chars, now(), from);
    blankAll(chars, now(), AUTOLINK, from);
    blankAll(chars, now(), TAG, from);
    blankLinkTargets(chars, now(), from);
    blankAll(chars, now(), ENTITY, from);
    const unit = unitOf(kind, from, chars.slice(from, to));
    if (unit) units.push(unit);
  };
  let start = -1;
  kinds.forEach((kind, k) => {
    if (kind === 'text') {
      if (start < 0) start = k;
      return;
    }
    if (start >= 0) flush('paragraph', start, k - 1);
    start = -1;
    if (kind === 'heading') flush('heading', k, k);
  });
  if (start >= 0) flush('paragraph', start, kinds.length - 1);
  return units;
}
