import type { Doc, Span } from '@drafter/fountain';
import { type KeyedNote, readNote } from './keyed';
import { bodyEnd } from './text';

// Every note and boneyard in a script, as the Notes tab lists them (Phase 2 design §8).

export interface NoteEntry {
  kind: 'note' | 'boneyard';
  /** The region, `[[` to `]]` or `/*` to `*\/`. */
  span: Span;
  /** A note's inner text, a boneyard's inside: what lies between the delimiters, exactly. */
  text: string;
  /** Null for a boneyard. */
  note: KeyedNote | null;
  /** The block holding it (the one its opener is in). */
  block: number;
  /** The only thing on its line (or lines), apart from spaces and tabs. */
  alone: boolean;
}

/** Whether the region `[from, to)` has only spaces and tabs beside it on its first and last lines. */
function aloneAt(source: string, from: number, to: number): boolean {
  // Walk out from the region and stop at the first thing that isn't blank, so a line of many
  // notes costs each of them only the spaces beside it.
  const blank = (c: string | undefined) => c === ' ' || c === '\t' || c === '\r';
  let i = from - 1;
  while (i >= 0 && blank(source[i])) i--;
  if (i >= 0 && source[i] !== '\n') return false;
  let j = to;
  while (j < source.length && blank(source[j])) j++;
  return j >= source.length || source[j] === '\n';
}

/**
 * Every closed note and boneyard in source order; never the metadata block or the Beat Board block.
 * An unclosed boneyard isn't listed (it hides the rest of the script, and lint reports it), nor is
 * a note on the title page, which no block holds.
 */
export function noteEntries(doc: Doc): NoteEntry[] {
  const { source, blocks } = doc;
  const end = bodyEnd(doc);
  const entries: NoteEntry[] = [];
  let index = 0;
  for (const region of doc.regions) {
    if (!region.closed) continue;
    const { from, to } = region.span;
    while (index < end && (blocks[index]?.span.to ?? 0) <= from) index++;
    if (index >= end) break;
    if ((blocks[index]?.span.from ?? 0) > from) continue;
    const text = source.slice(from + 2, to - 2);
    entries.push({
      kind: region.kind,
      span: { from, to },
      text,
      note: region.kind === 'note' ? readNote(text) : null,
      block: index,
      alone: aloneAt(source, from, to),
    });
  }
  return entries;
}

/** How far from its old offset `findEntry` looks for a note, beyond the script's change in length. */
const FIND_REACH = 200;

/**
 * The entry that is still `was` in a newer parse: the one with the same text at its offset, or at
 * the nearest offset (the earlier one on a tie), no further away than 200 characters plus
 * `lengthChange` (how much the script grew or shrank since, either way). Null when there is none, so
 * a stale action changes nothing (Call 16) and never lands on a far-away twin of a note that's gone.
 */
export function findEntry(
  entries: readonly NoteEntry[],
  was: Pick<NoteEntry, 'span' | 'text'>,
  lengthChange = 0,
): NoteEntry | null {
  let best: NoteEntry | null = null;
  let distance = FIND_REACH + Math.abs(lengthChange);
  for (const entry of entries) {
    if (entry.text !== was.text) continue;
    const d = Math.abs(entry.span.from - was.span.from);
    if (best === null ? d <= distance : d < distance) {
      best = entry;
      distance = d;
    }
  }
  return best;
}

/** A person's name as replies match it: case folded, spaces collapsed. */
const nameKey = (name: string) => name.toLowerCase().replace(/\s+/gu, ' ').trim();

/**
 * Each note with the `Name re Name` replies under it: a reply nests under the nearest earlier note
 * by the person it names, or under the thread that note is in when it is a reply itself, so threads
 * are one level deep. A reply with no such note, and every boneyard, stands alone.
 */
export function nestReplies(
  entries: readonly NoteEntry[],
): Array<{ entry: NoteEntry; replies: NoteEntry[] }> {
  const out: Array<{ entry: NoteEntry; replies: NoteEntry[] }> = [];
  /** Each person's latest note so far, with the thread it sits in. */
  const latest = new Map<string, { entry: NoteEntry; replies: NoteEntry[] }>();
  for (const entry of entries) {
    const head = entry.note?.head;
    const thread = head?.kind === 'person' && head.re ? latest.get(nameKey(head.re)) : undefined;
    let home = thread;
    if (thread) thread.replies.push(entry);
    else {
      home = { entry, replies: [] };
      out.push(home);
    }
    if (head?.kind === 'person' && home) latest.set(nameKey(head.name), home);
  }
  return out;
}
