import { type Doc, parse, type TextChange } from '@drafter/fountain';
import type { NoteEntry } from './entries';
import { isTagWord, type KeyedNote, readNote, tagRuns, writeNote } from './keyed';
import { bodyEnd, contentEnd, hasStrayBoneyard, lineBreakOf, removeLine } from './text';

// A note's edits as text (Phase 2 design §8, Calls 5 and 6). Resolve, Reopen, and Set category
// change only the tag text inside the note; Edit rewrites the whole note exactly; a new note goes
// at the end of a line. Every edit is [] while a `/*` is stray.

/**
 * Whether a note has a status and categories: the writer's own (no head, or a category head) and a
 * person's. A scene field, a setup or payoff mark, and a card don't: a tag in one would become
 * part of its value or label.
 */
const hasStatus = (note: KeyedNote | null): note is KeyedNote =>
  note !== null &&
  (note.head === null || note.head.kind === 'category' || note.head.kind === 'person');

/** Where a note's body starts in its inner text: the body is the inner text's trimmed tail. */
const bodyStart = (inner: string, note: KeyedNote) => inner.trimEnd().length - note.body.length;

const isBlankChar = (c: string | undefined) => c === ' ' || c === '\t';

/** `changes` (in `text`'s offsets, sorted, touching ones merged) made to `text`. */
function applyTo(text: string, changes: readonly TextChange[]): string {
  let out = text;
  for (const change of [...changes].reverse()) {
    out = out.slice(0, change.from) + change.insert + out.slice(change.to);
  }
  return out;
}

/** `changes` sorted, with ones that overlap or touch made into one. */
function merge(changes: readonly TextChange[]): TextChange[] {
  const out: TextChange[] = [];
  for (const change of [...changes].sort((a, b) => a.from - b.from || a.to - b.to)) {
    const last = out[out.length - 1];
    if (last && change.from <= last.to) {
      last.to = Math.max(last.to, change.to);
      last.insert += change.insert;
    } else out.push({ ...change });
  }
  return out;
}

/**
 * The range of `inner` that takes out the tag at `[from, to)` (inner offsets), so no stray space or
 * empty line is left: a tag that starts a line (or the body) with more after it goes with the
 * spaces after it, so the head's colon and the line's indent keep theirs; a tag alone on a later
 * line goes with that line and the break before it; any other tag goes with the spaces before it.
 */
function tagRemoval(inner: string, start: number, from: number, to: number): TextChange {
  let after = to;
  while (isBlankChar(inner[after])) after++;
  const newline = inner.indexOf('\n', to);
  const restOfLine = inner.slice(to, newline < 0 ? inner.length : newline);
  const lineStart = inner.lastIndexOf('\n', from - 1) + 1;
  const startsLine = inner.slice(lineStart, from).trim() === '';
  if (startsLine && lineStart > 0 && restOfLine.trim() === '') {
    // Alone on its line: the line goes, with the break before it (a CRLF's `\r` too).
    const breakAt = lineStart - (inner[lineStart - 2] === '\r' ? 2 : 1);
    return { from: breakAt, to: after, insert: '' };
  }
  if ((startsLine || from === start) && restOfLine.trim() !== '') {
    return { from, to: after, insert: '' };
  }
  let begin = from;
  while (begin > 0 && isBlankChar(inner[begin - 1])) begin--;
  return { from: begin, to, insert: '' };
}

/**
 * The changes to `entry`'s inner text, moved to document offsets, when the result reads back as
 * `expected` would have it; [] when it would read differently (a removed tag can't make a head).
 */
function tagEdit(
  entry: NoteEntry,
  note: KeyedNote,
  changes: readonly TextChange[],
  expected: { tags: string[]; resolved: boolean },
): TextChange[] {
  const merged = merge(changes);
  if (merged.length === 0) return [];
  const after = readNote(applyTo(entry.text, merged));
  if (
    JSON.stringify(after.head) !== JSON.stringify(note.head) ||
    after.resolved !== expected.resolved ||
    JSON.stringify(after.tags) !== JSON.stringify(expected.tags)
  ) {
    return [];
  }
  const at = entry.span.from + 2;
  return merged.map((c) => ({ from: at + c.from, to: at + c.to, insert: c.insert }));
}

/** The note's tag runs in inner offsets. */
function runsOf(entry: NoteEntry, note: KeyedNote) {
  const start = bodyStart(entry.text, note);
  return {
    start,
    runs: tagRuns(note.body).map((r) => ({ ...r, from: start + r.from, to: start + r.to })),
  };
}

/**
 * Resolve (` #resolved` after the body) or Reopen (every `#resolved` taken out, with the space
 * before it). Nothing else in the note changes. [] when it is already so, or for a note without a
 * status.
 */
export function setResolved(doc: Doc, entry: NoteEntry, resolved: boolean): TextChange[] {
  const note = entry.note;
  if (hasStrayBoneyard(doc) || !hasStatus(note) || note.resolved === resolved) return [];
  const inner = entry.text;
  const end = inner.trimEnd().length;
  const expected = { tags: note.tags, resolved };
  if (resolved) {
    return tagEdit(entry, note, [{ from: end, to: end, insert: ' #resolved' }], expected);
  }
  const { start, runs } = runsOf(entry, note);
  const removals = runs
    .filter((r) => r.tag === 'resolved')
    .map((r) => tagRemoval(inner, start, r.from, r.to));
  return tagEdit(entry, note, removals, expected);
}

/**
 * Set a note's tags (Set category): each dropped tag is taken out wherever it is, with the space
 * before it, and each new one is added at the body's end as ` #tag`; the rest of the note is kept
 * exactly. Tags are lowercased; one that isn't a tag word (or is `resolved`) throws a RangeError.
 * [] when nothing changes, or for a note without a status.
 */
export function setTags(doc: Doc, entry: NoteEntry, tags: readonly string[]): TextChange[] {
  const wanted: string[] = [];
  for (const tag of tags) {
    const word = tag.trim().toLowerCase();
    if (!isTagWord(word) || word === 'resolved') {
      throw new RangeError(`“${tag}” can't be a category tag.`);
    }
    if (!wanted.includes(word)) wanted.push(word);
  }
  const note = entry.note;
  if (hasStrayBoneyard(doc) || !hasStatus(note)) return [];
  const inner = entry.text;
  const { start, runs } = runsOf(entry, note);
  const removals = runs
    .filter((r) => r.tag !== 'resolved' && !wanted.includes(r.tag))
    .map((r) => tagRemoval(inner, start, r.from, r.to));
  const added = wanted.filter((tag) => !note.tags.includes(tag));
  const end = inner.trimEnd().length;
  const changes = [...removals];
  if (added.length > 0) {
    changes.push({ from: end, to: end, insert: added.map((tag) => ` #${tag}`).join('') });
  }
  const kept = note.tags.filter((tag) => wanted.includes(tag));
  return tagEdit(entry, note, changes, { tags: [...kept, ...added], resolved: note.resolved });
}

/**
 * Edit: the whole note written exactly (`writeNote`), replacing it. A head that wouldn't read back
 * throws `writeNote`'s RangeError. A body that starts with a head of its own (`TODO: x` with no head)
 * reads as that head afterwards, as it would typed. [] when the text is already that, or for a
 * boneyard.
 */
export function rewriteNote(
  doc: Doc,
  entry: NoteEntry,
  head: string | null,
  body: string,
): TextChange[] {
  if (hasStrayBoneyard(doc) || entry.kind !== 'note') return [];
  const written = writeNote(head, body);
  const { from, to } = entry.span;
  return doc.source.slice(from, to) === written ? [] : [{ from, to, insert: written }];
}

/** What a parse prints: each block's kind and its printing lines' text. */
const printedOf = (doc: Doc) =>
  JSON.stringify(
    doc.blocks.map((b) => [
      b.kind,
      b.lines.filter((l) => !l.transparent).map((l) => l.inline.map((r) => r.text).join('')),
    ]),
  );

/**
 * Delete a note or boneyard: its line (or lines) when it is alone there (`removeLine`). One that
 * shares its line is replaced by the line breaks inside it, so the lines around it print as they
 * did; checked by parsing, and [] when they wouldn't (a boneyard holding a blank line between two
 * printing lines would split their paragraph). [] where taking a line out would join printing
 * lines (a two-space line beside it).
 */
export function deleteEntry(doc: Doc, entry: NoteEntry): TextChange[] {
  if (hasStrayBoneyard(doc)) return [];
  const { from, to } = entry.span;
  if (!entry.alone) {
    const insert = (doc.source.slice(from, to).match(/\r?\n/g) ?? []).join('');
    const after = doc.source.slice(0, from) + insert + doc.source.slice(to);
    return printedOf(parse(after)) === printedOf(doc) ? [{ from, to, insert }] : [];
  }
  const block = doc.blocks[entry.block];
  if (!block || to > block.span.to) return [];
  const { lines } = block;
  const first = lines.findLastIndex((line) => line.span.from <= from);
  const last = lines.findLastIndex((line) => line.span.from < to);
  if (first < 0) return [];
  const removal = removeLine(doc, entry.block, first, last);
  return removal ? [removal] : [];
}

/** Resolve every open note among `entries` (not boneyards, fields, or marks), in order. */
export function resolveAll(doc: Doc, entries: readonly NoteEntry[]): TextChange[] {
  if (hasStrayBoneyard(doc)) return [];
  return entries
    .filter((entry) => hasStatus(entry.note) && !entry.note.resolved)
    .flatMap((entry) => setResolved(doc, entry, true))
    .sort((a, b) => a.from - b.from);
}

/** How a parse reads: the title page's keys, then each block's kind, marker, and line count. */
const shapeOf = (doc: Doc) => [
  doc.titlePage ? doc.titlePage.fields.map((f) => f.key).join('|') : '-',
  ...doc.blocks.map((b) => `${b.kind}${b.forced ? '!' : ''}:${b.lines.length}`),
];

const sameShape = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((s, i) => s === b[i]);

/**
 * A new note (`note`, as `writeNote` wrote it) at the end of the line holding `offset`, after one
 * space (Call 6), so it never adds a line that could join or split paragraphs. On a blank line it
 * goes at the end of the nearest line above with text; with none above, at the very start, on a
 * line of its own before a blank line. A line ending inside a note or boneyard takes it after that
 * region's end. The cursor goes before the note's `]]`.
 *
 * Without the space when the space would change how the line reads (`CUT TO: ` isn't a
 * transition); no changes when neither keeps every block as it was, inside the metadata or Beat
 * Board block, or while a `/*` is stray.
 */
export function insertNote(
  doc: Doc,
  offset: number,
  note: string,
): { changes: TextChange[]; cursor: number } {
  const none = { changes: [], cursor: offset };
  if (hasStrayBoneyard(doc)) return none;
  const { source } = doc;
  const back = note.endsWith(']]') ? 2 : 0;
  const before = shapeOf(doc);

  const cursorAt = Math.min(Math.max(offset, 0), source.length);
  let lineStart = cursorAt === 0 ? 0 : source.lastIndexOf('\n', cursorAt - 1) + 1;
  const lineEndOf = (start: number) => {
    const newline = source.indexOf('\n', start);
    return contentEnd(source, newline < 0 ? source.length : newline);
  };
  while (source.slice(lineStart, lineEndOf(lineStart)).trim() === '' && lineStart > 0) {
    lineStart = lineStart >= 2 ? source.lastIndexOf('\n', lineStart - 2) + 1 : 0;
  }

  if (source.slice(lineStart, lineEndOf(lineStart)).trim() === '') {
    // Nothing above: the very start, on a line of its own, then the blank line already there.
    const nl = lineBreakOf(source);
    const joins = source.slice(0, lineEndOf(0)) === '  ';
    const insert = `${note}${nl}${joins ? nl : ''}`;
    const after = shapeOf(parse(insert + source));
    if (after[1] !== 'note:1' || !sameShape(after.slice(2), before.slice(1))) return none;
    return { changes: [{ from: 0, to: 0, insert }], cursor: note.length - back };
  }

  let at = lineEndOf(lineStart);
  for (let moved = true; moved; ) {
    moved = false;
    for (const region of doc.regions) {
      if (region.span.from < at && at < region.span.to) {
        at = lineEndOf(region.span.to);
        moved = true;
      }
    }
  }
  const hidden = doc.blocks[bodyEnd(doc)];
  if (hidden && at >= hidden.span.from) return none;

  const spaced = isBlankChar(source[at - 1]) ? [note] : [` ${note}`, note];
  for (const insert of spaced) {
    const after = shapeOf(parse(source.slice(0, at) + insert + source.slice(at)));
    if (sameShape(after, before)) {
      return { changes: [{ from: at, to: at, insert }], cursor: at + insert.length - back };
    }
  }
  return none;
}
