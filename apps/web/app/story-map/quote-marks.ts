import { type Block, type Doc, parse, type TextChange } from '@drafter/fountain';
import { readNote, wholeMarkOf } from '@drafter/notes';

// Use in story map and Never use in story map (story-map design §3.1, Call 6): a `[[Quote]]` or
// `[[No quote]]` note at the end of a speech's last line of dialogue, as one undo. The story map
// reads the marks with `@drafter/notes`'s `wholeMarkOf`, in the speech or alone on the line under
// it (`@drafter/story-map`'s lines), so these find them in the same places.

/** What a speech is made of after its cue, as the layout groups it. */
const PARTS = new Set<Block['kind']>(['parenthetical', 'dialogue', 'lyric']);
/** Blocks that print nothing: a `^` speech still pairs with the speech before them. */
const QUIET = new Set<Block['kind']>(['note', 'boneyard', 'synopsis']);

/** On the line just after the block before it: no blank line between. */
const adjacent = (block: Block) => block.leading.split('\n').length === 2;

/** The last block of the speech whose cue is `cue`. */
function speechEnd(doc: Doc, cue: number): number {
  let end = cue;
  for (let b = cue + 1; b < doc.blocks.length; b++) {
    const block = doc.blocks[b] as Block;
    if (!PARTS.has(block.kind) || !adjacent(block)) break;
    end = b;
  }
  return end;
}

/** Either side of a dual-dialogue pair: a `^` cue, or the speech a `^` speech pairs with. */
function isDual(doc: Doc, cue: number): boolean {
  const block = doc.blocks[cue];
  if (block?.kind !== 'character') return false;
  if (block.sem.dual) return true;
  for (let b = speechEnd(doc, cue) + 1; b < doc.blocks.length; b++) {
    const next = doc.blocks[b] as Block;
    if (QUIET.has(next.kind)) continue;
    return next.kind === 'character' && next.sem.dual;
  }
  return false;
}

/** The block holding `offset`, by its span (its last character's end counts). */
function blockAt(doc: Doc, offset: number): number {
  let lo = 0;
  let hi = doc.blocks.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const { span } = doc.blocks[mid] as Block;
    if (offset < span.from) hi = mid - 1;
    else if (offset > span.to) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/**
 * The cue block of the speech holding `offset`: on its cue, a parenthetical, a line of dialogue, or
 * a note alone on the line just under it. Null elsewhere, and for either side of dual dialogue,
 * which is never a line on its own.
 */
export function speechAt(doc: Doc, offset: number): number | null {
  let b = blockAt(doc, offset);
  if (b < 0) return null;
  let block = doc.blocks[b] as Block;
  if (block.kind === 'note' && adjacent(block) && b > 0) {
    // A note alone under a speech is the speech's.
    const above = doc.blocks[b - 1] as Block;
    if (!PARTS.has(above.kind) && above.kind !== 'character') return null;
    b -= 1;
    block = above;
  }
  while (PARTS.has(block.kind) && adjacent(block) && b > 0) {
    b -= 1;
    block = doc.blocks[b] as Block;
  }
  if (block.kind !== 'character') return null;
  return isDual(doc, b) ? null : b;
}

/** A change, in old-document offsets. */
type Change = TextChange;

/** Changes that touch or overlap joined into one, in order: removals' empty inserts and the mark's. */
function joined(changes: readonly Change[]): Change[] {
  const sorted = [...changes].sort((a, b) => a.from - b.from || a.to - b.to);
  const out: Change[] = [];
  for (const change of sorted) {
    const last = out.at(-1);
    if (last && change.from <= last.to) {
      out[out.length - 1] = {
        from: last.from,
        to: Math.max(last.to, change.to),
        insert: last.insert + change.insert,
      };
    } else {
      out.push({ ...change });
    }
  }
  return out;
}

/** The blocks' kinds, in order, notes aside: a mark must leave every other block as it was. */
const shapeOf = (doc: Doc) =>
  doc.blocks
    .filter((b) => b.kind !== 'note')
    .map((b) => (b.forced ? `${b.kind}!` : b.kind))
    .join('|');

/**
 * The changes that mark the speech whose cue is `cue` (Call 6): any whole quote mark in it (or alone
 * on the line under it) is removed, then `[[Quote]]` or `[[No quote]]` goes at the end of its last
 * line of dialogue, one space before; null only removes. [] when unchanged, when the speech has no
 * dialogue, or when the mark would change how the script reads.
 */
export function markSpeech(doc: Doc, cue: number, mark: 'quote' | 'no-quote' | null): TextChange[] {
  const { source } = doc;
  const cueBlock = doc.blocks[cue];
  if (cueBlock?.kind !== 'character') return [];
  const end = speechEnd(doc, cue);
  const after = doc.blocks[end + 1];
  const under = after?.kind === 'note' && adjacent(after) ? end + 1 : null;
  const from = cueBlock.span.from;
  const to = (doc.blocks[under ?? end] as Block).span.to;

  // The whole quote marks, each with what removing it takes: a space before it, or its own line.
  const changes: Change[] = [];
  for (const region of doc.regions) {
    if (region.kind !== 'note' || !region.closed) continue;
    if (region.span.from < from || region.span.to > to) continue;
    const inner = source.slice(region.span.from + 2, region.span.to - 2);
    const kind = wholeMarkOf(readNote(inner));
    if (kind !== 'quote' && kind !== 'no-quote') continue;
    const lineStart = source.lastIndexOf('\n', region.span.from - 1) + 1;
    const nextBreak = source.indexOf('\n', region.span.to);
    const lineEnd = nextBreak < 0 ? source.length : nextBreak;
    const before = source.slice(lineStart, region.span.from);
    const rest = source.slice(region.span.to, lineEnd).replace(/\r$/, '');
    if (before.trim() === '' && rest.trim() === '' && lineStart > 0) {
      // Alone on its line: the line goes, with the line break before it.
      const back = source[lineStart - 2] === '\r' ? 2 : 1;
      changes.push({
        from: lineStart - back,
        to: lineEnd - (source[lineEnd - 1] === '\r' ? 1 : 0),
        insert: '',
      });
    } else {
      let start = region.span.from;
      while (start > lineStart && (source[start - 1] === ' ' || source[start - 1] === '\t'))
        start--;
      changes.push({ from: start, to: region.span.to, insert: '' });
    }
  }

  if (mark !== null) {
    // The end of the last line of dialogue that prints.
    let last: Block | undefined;
    for (let b = cue + 1; b <= end; b++) {
      const block = doc.blocks[b] as Block;
      if (block.kind === 'dialogue') last = block;
    }
    const line = last?.lines.filter((l) => !l.transparent).at(-1);
    if (!line) return [];
    // Before any removed mark at the line's end, and before the line's trailing spaces.
    let at = line.span.to;
    if (source[at - 1] === '\r') at--;
    for (const c of changes)
      if (c.to === at && c.insert === '' && c.from >= line.span.from) at = c.from;
    while (at > line.span.from && (source[at - 1] === ' ' || source[at - 1] === '\t')) at--;
    if (doc.regions.some((r) => r.span.from < at && at < r.span.to)) return [];
    const note = mark === 'quote' ? '[[Quote]]' : '[[No quote]]';
    // The spaces kept before the mark are replaced by one.
    let spaceEnd = at;
    while (spaceEnd < source.length && (source[spaceEnd] === ' ' || source[spaceEnd] === '\t'))
      spaceEnd++;
    const blocked = changes.some((c) => c.from < spaceEnd && c.to > at);
    changes.push(
      blocked
        ? { from: at, to: at, insert: ` ${note}` }
        : { from: at, to: spaceEnd, insert: ` ${note}` },
    );
  }

  const out = joined(changes);
  if (out.every((c) => source.slice(c.from, c.to) === c.insert)) return [];
  // Never a mark that would change how the script reads.
  let text = source;
  for (const c of [...out].reverse()) text = text.slice(0, c.from) + c.insert + text.slice(c.to);
  if (shapeOf(parse(text)) !== shapeOf(doc)) return [];
  return out;
}
