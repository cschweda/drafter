import type { EditorState, Line } from '@codemirror/state';
import { type Block, type Line as BlockLine, blockAt, type Region } from '@drafter/fountain';
import { lineMarks } from '../highlight';
import { BOM } from '../keymap';
import { parsedDoc } from '../state';

// What Classic Mode doesn't show on a line. The caret, the delete rules, and the view read this one
// list, so what's hidden and what the cursor steps over can't disagree.

export interface HiddenSpan {
  from: number;
  to: number;
  kind: 'lead' | 'close' | 'pair' | 'note' | 'boneyard' | 'escape' | 'dual';
}

const NO_SPANS: readonly HiddenSpan[] = [];

/** The line of a block that starts at `from`, by search, as a paragraph can run to many lines. */
function lineOf(block: Block, from: number): BlockLine | null {
  const { lines } = block;
  let low = 0;
  let high = lines.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const line = lines[middle] as BlockLine;
    if (line.span.from === from) return line;
    if (line.span.from < from) low = middle + 1;
    else high = middle - 1;
  }
  return null;
}

/** The notes and boneyard that touch a line. */
function regionsOn(regions: readonly Region[], line: Line): readonly Region[] {
  let low = 0;
  let high = regions.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((regions[middle] as Region).span.to <= line.from) low = middle + 1;
    else high = middle;
  }
  let end = low;
  while (end < regions.length && (regions[end] as Region).span.from < line.to) end++;
  return regions.slice(low, end);
}

/** How long a line's leading mark is, in a stretch of marks, for a block whose first mark it is. */
function leadLength(block: Block, text: string): number {
  switch (block.kind) {
    case 'page_break':
      return text.length;
    case 'section':
      return (/^#+/.exec(text)?.[0] ?? '').length;
    case 'synopsis':
    case 'lyric':
      return 1;
    default:
      return 'forced' in block && block.forced ? 1 : 0;
  }
}

const INLINE_KIND: Record<string, HiddenSpan['kind']> = {
  '\\': 'escape',
  '^': 'dual',
  '<': 'close',
};

/** A stretch of marks with no lead in it: emphasis, an escape, a dual mark, and a closing `<`. */
function inlineSpans(out: HiddenSpan[], from: number, text: string): void {
  for (const piece of text.matchAll(/[\\^<]|[^\\^<]+/g)) {
    const start = from + piece.index;
    const kind = INLINE_KIND[piece[0]] ?? 'pair';
    out.push({ from: start, to: start + piece[0].length, kind });
  }
}

/** The marks a parsed line reads and doesn't print, less its scene number. */
function markSpans(line: Line, found: BlockLine, block: Block, regions: readonly Region[]) {
  const out: HiddenSpan[] = [];
  const first = line.from + line.text.length - line.text.replace(/^[\s﻿]+/, '').length;
  for (const mark of lineMarks(line.from, line.text, found.inline, regions, false)) {
    if (mark.kind !== 'mark') continue;
    const text = line.text.slice(mark.from - line.from, mark.to - line.from);
    const lead = mark.from === first ? leadLength(block, text) : 0;
    if (lead) {
      // A section's or a synopsis's mark takes its space, which is part of no word.
      const spaced = block.kind === 'section' || block.kind === 'synopsis';
      const tail =
        spaced && lead === text.length ? /^\s*/.exec(line.text.slice(mark.to - line.from)) : null;
      out.push({ from: mark.from, to: mark.from + lead + (tail?.[0].length ?? 0), kind: 'lead' });
    }
    if (lead < text.length) inlineSpans(out, mark.from + lead, text.slice(lead));
  }
  return out;
}

/** The delimiters of the closed notes and boneyard on a line. An unclosed one stays to be seen (§8.1). */
function delimiters(line: Line, regions: readonly Region[]): HiddenSpan[] {
  const out: HiddenSpan[] = [];
  for (const { kind, span, closed } of regions) {
    if (!closed) continue;
    if (span.from >= line.from) out.push({ from: span.from, to: span.from + 2, kind });
    if (span.to <= line.to) out.push({ from: span.to - 2, to: span.to, kind });
  }
  return out;
}

/**
 * What's hidden on the line: `lineMarks` less scene numbers, title-page lines, and an unclosed
 * region's opener, plus closed regions' delimiters, in order. A section's or synopsis's mark takes
 * its space.
 */
export function hiddenSpans(state: EditorState, line: Line): HiddenSpan[] {
  const doc = state.field(parsedDoc);
  const regions = regionsOn(doc.regions, line);
  const block = blockAt(doc, line.from)?.block;
  const found = block ? lineOf(block, line.from) : null;
  const marks = block && found ? markSpans(line, found, block, regions) : NO_SPANS;
  if (!regions.length) return [...marks];
  return [...marks, ...delimiters(line, regions)].sort((a, b) => a.from - b.from);
}

const trailing = (span: HiddenSpan) => span.kind === 'close' || span.kind === 'dual';

const isSpaceAt = (line: Line, at: number) => /\s/.test(line.text.charAt(at - line.from));

/** The spans a cursor can stand after, joined where they touch. */
export function steps(spans: readonly HiddenSpan[]): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  for (const span of spans) {
    if (trailing(span)) continue;
    const last = out[out.length - 1];
    if (last?.to === span.from) last.to = span.to;
    else out.push({ from: span.from, to: span.to });
  }
  return out;
}

/** Where the words of a line start: past a byte-order mark, spaces, and any hidden mark. */
export function visibleStart(state: EditorState, line: Line): number {
  let at = line.from + (line.text.startsWith(BOM) ? 1 : 0);
  while (at < line.to && isSpaceAt(line, at)) at++;
  for (const step of steps(hiddenSpans(state, line))) {
    if (step.from !== at) break;
    at = step.to;
    while (at < line.to && isSpaceAt(line, at)) at++;
  }
  return at;
}

/** Where the words of a line end: before a closing mark and any space before it. */
export function visibleEnd(state: EditorState, line: Line): number {
  const spans = hiddenSpans(state, line).filter(trailing);
  let end = line.to;
  for (;;) {
    let at = end;
    while (at > line.from && isSpaceAt(line, at - 1)) at--;
    const span = spans.find((one) => one.to === at);
    if (!span) return end;
    end = span.from;
    while (end > line.from && isSpaceAt(line, end - 1)) end--;
  }
}
