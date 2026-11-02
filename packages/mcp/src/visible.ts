// What a tool may show of a file (§6): the writer's text exactly, with the notes and the boneyard
// cut unless the call asks for them, and the metadata block (with a Beat Board block before it)
// and the title page's Contact field cut always. Nothing else is changed: no detector, no filter.
import type { Doc } from '@drafter/fountain';
import { findMarkdownMeta } from '@drafter/markdown';
import { bodyEnd } from '@drafter/outline';
import type { Include, LeftOut } from './envelope';

type Cut = [number, number];

const isSpace = (c: string | undefined) =>
  c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';

/** `at`, moved back over the white space before it. */
function backOverSpace(source: string, at: number): number {
  let i = at;
  while (i > 0 && isSpace(source[i - 1])) i--;
  return i;
}

/** Whether only white space is in `source` from `from` to `to`. */
function blank(source: string, from: number, to: number): boolean {
  for (let i = from; i < to; i++) if (!isSpace(source[i])) return false;
  return true;
}

/**
 * Where a trailing block opened by `opener` starts: at a line's start, the opener followed by a
 * line break, and nothing but white space after its first `*\/` up to `end`. -1 when there is none.
 * Found by its text, so an unclosed boneyard before it, which the parse joins to it, can't hide it.
 */
function trailingBlock(source: string, opener: string, end: number): number {
  // Its `*/` is the last before `end`, and its opener comes after the `*/` before that one: one
  // pass over that stretch, whatever the file holds.
  const close = source.lastIndexOf('*/', end - 2);
  if (close < 0 || !blank(source, close + 2, end)) return -1;
  const before = close >= 2 ? source.lastIndexOf('*/', close - 1) : -1;
  const first = before < 0 ? 0 : before + 2;
  let found = -1;
  let at = source.lastIndexOf(opener, close - opener.length);
  while (at >= first) {
    const after = at + opener.length;
    const lineStart = at === 0 || source[at - 1] === '\n';
    const breaks = source[after] === '\n' || (source[after] === '\r' && source[after + 1] === '\n');
    // The earliest such opener: everything from it is the block.
    if (lineStart && breaks) found = at;
    if (at === 0) break;
    at = source.lastIndexOf(opener, at - 1);
  }
  return found;
}

/**
 * Where the script's own text ends: before the metadata block and a Beat Board block before it,
 * and the blank lines before them; the source's length when there is neither.
 */
export function scriptEnd(doc: Doc): number {
  const { source, blocks } = doc;
  let end = source.length;
  const body = bodyEnd(doc);
  if (body < blocks.length) end = (blocks[body] as Doc['blocks'][number]).span.from;
  const meta = trailingBlock(source, '/* drafter', source.length);
  if (meta >= 0) {
    end = Math.min(end, meta);
    const board = trailingBlock(source, '/* beat board', meta);
    if (board >= 0) end = Math.min(end, board);
  }
  return end === source.length ? end : backOverSpace(source, end);
}

/** The title page's Contact field (any case), its continuation lines, and its line break. */
function contactCuts(doc: Doc): Cut[] {
  const cuts: Cut[] = [];
  for (const field of doc.titlePage?.fields ?? []) {
    if (field.key.trim().toLowerCase() !== 'contact') continue;
    let to = field.span.to;
    if (doc.source[to] === '\r') to++;
    if (doc.source[to] === '\n') to++;
    cuts.push([field.span.from, to]);
  }
  return cuts;
}

/**
 * `doc.source` from `from` to `to`, with every note and boneyard the call doesn't include cut out
 * (and counted, by kind, when any of it is in the range), anything at or past the metadata block
 * cut, and the title page's Contact field cut.
 */
export function visible(
  doc: Doc,
  from: number,
  to: number,
  include: Include,
): { text: string; leftOut: LeftOut } {
  const { source } = doc;
  const end = Math.min(to, scriptEnd(doc));
  const start = Math.min(Math.max(0, from), end);
  const leftOut: LeftOut = { notes: 0, boneyard: 0 };
  const cuts: Cut[] = contactCuts(doc);
  for (const region of doc.regions) {
    if (region.span.to <= start || region.span.from >= end) continue;
    if (include.includes(region.kind === 'note' ? 'notes' : 'boneyard')) continue;
    cuts.push([region.span.from, region.span.to]);
    if (region.kind === 'note') leftOut.notes++;
    else leftOut.boneyard++;
  }
  cuts.sort((a, b) => a[0] - b[0]);
  let text = '';
  let at = start;
  for (const [cutFrom, cutTo] of cuts) {
    if (cutTo <= at) continue;
    if (cutFrom >= end) break;
    if (cutFrom > at) text += source.slice(at, cutFrom);
    at = Math.max(at, cutTo);
  }
  if (at < end) text += source.slice(at, end);
  return { text, leftOut };
}

/** A Markdown document from `from` to `to`, with its trailing metadata comment cut. */
export function visibleMarkdown(text: string, from: number, to: number): string {
  const meta = findMarkdownMeta(text);
  const end = meta ? Math.min(to, backOverSpace(text, meta.from)) : to;
  return text.slice(Math.min(from, end), end);
}
