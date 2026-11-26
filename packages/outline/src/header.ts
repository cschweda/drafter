import { type Block, type Doc, parse, type Span, type TextChange } from '@drafter/fountain';
import {
  contentEnd,
  deleteEntry,
  FIELD_ORDER,
  type FieldKey,
  fieldNote,
  hasStrayBoneyard,
  isLineBreak,
  lineBreakOf,
  type NoteEntry,
  noteEntries,
  readNote,
  removeLine,
  type SceneColor,
  safeBody,
  safeLine,
} from '@drafter/notes';
import { sceneNotes } from './scene-index';
import type { Scene, Section } from './types';

// A scene's header (Phase 2 design §5.4): the synopsis and note lines right under the heading's
// blank line, synopses first, then one note per field, each on its own line. Every line of it is
// transparent or a synopsis, so the pages don't change (§1, item 2).

/** The blocks of the scene's header: synopses and notes right after the heading, one line apart. */
function headerOf(doc: Doc, scene: Headed): number[] {
  const out: number[] = [];
  for (let i = scene.block + 1; i < doc.blocks.length; i++) {
    const block = doc.blocks[i] as Block;
    if (block.span.from >= scene.span.to) break;
    if (block.kind !== 'synopsis' && block.kind !== 'note') break;
    if (out.length > 0 && !isLineBreak(block.leading)) break;
    out.push(i);
  }
  return out;
}

const endOf = (doc: Doc, block: Block) => contentEnd(doc.source, block.span.to);

/** Blocks that never print: synopses and sections are outline marks; notes and boneyards are hidden. */
const HIDDEN = new Set(['synopsis', 'section', 'note', 'boneyard']);

/** The lines of a block that print: none for a hidden block, and none that hold only notes. */
const printingLines = (b: Block) =>
  HIDDEN.has(b.kind) ? [] : b.lines.filter((l) => !l.transparent);

/**
 * What a parse prints: each block that prints, its kind, its printing lines' text, and whether it
 * runs straight on from a block that prints (no blank line, and nothing hidden between). A hidden
 * block still ends what is above it: a lyric under a synopsis is its own paragraph, and under a
 * line of notes it joins the speech above, so the two print differently.
 */
const printing = (doc: Doc) =>
  JSON.stringify(
    doc.blocks.flatMap((b, i) => {
      const lines = printingLines(b);
      if (lines.length === 0) return [];
      const above = doc.blocks[i - 1];
      const joined =
        above !== undefined &&
        b.leading.split('\n').length === 2 &&
        printingLines(above).length > 0;
      return [[b.kind, joined, lines.map((l) => l.inline.map((r) => r.text).join(''))]];
    }),
  );

/**
 * The notes and boneyards after `from` on its line (and on the lines a region runs onto), and the
 * end of the last line they reach.
 */
function regionsOnLine(doc: Doc, from: number) {
  const { source } = doc;
  const lineEndAt = (at: number) => {
    const newline = source.indexOf('\n', at);
    return contentEnd(source, newline < 0 ? source.length : newline);
  };
  let end = lineEndAt(from);
  const found: Array<{ from: number; to: number }> = [];
  for (const region of doc.regions) {
    if (region.span.from <= from || !region.closed) continue;
    if (region.span.from >= end) break;
    found.push(region.span);
    if (region.span.to > end) end = lineEndAt(region.span.to);
  }
  return { found, end };
}

/**
 * What a synopsis edit reads of a scene: its heading's block, its span, and its synopses. A
 * section's own stretch has the same (`sectionHeader`), so its synopsis is set the same way.
 */
export type Headed = Pick<Scene, 'block' | 'span' | 'synopses'>;

/** A section as `setSynopsis` reads one: its heading, its own stretch, and its own synopses. */
export const sectionHeader = (section: Section): Headed => ({
  block: section.block,
  span: { from: section.span.from, to: section.introEnd },
  synopses: section.synopses,
});

/**
 * The changes that make `text` the scene's first synopsis: its text replaced in place, or a new
 * `= text` line at the top of the header. Empty text removes the first synopsis's line, or, when it
 * holds notes or boneyards, only the `=` and its words, so they stay on the line (or nothing, where
 * that line would print differently among the lines it joins). The text is
 * written on one line, and can't open a note or a boneyard.
 */
export function setSynopsis(doc: Doc, scene: Headed, text: string): TextChange[] {
  if (hasStrayBoneyard(doc)) return [];
  const words = safeLine(text);
  const nl = lineBreakOf(doc.source);
  const first = scene.synopses[0];
  if (first) {
    const block = doc.blocks[first.block] as Block;
    const line = block.lines[0];
    if (!line) return [];
    // The text runs to the first note on the line, if one follows it there.
    const lineEnd = contentEnd(doc.source, line.span.to);
    const note = doc.regions.find((r) => r.span.from > line.span.from && r.span.from < lineEnd);
    const to = note ? note.span.from : lineEnd;
    if (words === '') {
      // Every note and boneyard on the line stays, one space apart, on a line that prints
      // nothing; the `=` and the synopsis's words around them go. With none, the line goes.
      const { found, end } = regionsOnLine(doc, line.span.from);
      if (found.length > 0) {
        // Checked by parsing: next to lines it would join (no blank line, or a two-space line),
        // the line of notes could change what prints, and then nothing changes.
        const kept = found.map((r) => doc.source.slice(r.from, r.to)).join(' ');
        const after = doc.source.slice(0, line.span.from) + kept + doc.source.slice(end);
        return printing(parse(after)) === printing(doc)
          ? [{ from: line.span.from, to: end, insert: kept }]
          : [];
      }
      const removal = removeLine(doc, first.block, 0);
      return removal ? [removal] : [];
    }
    const insert = `= ${words}${note ? ' ' : ''}`;
    if (doc.source.slice(line.span.from, to) === insert) return [];
    return [{ from: line.span.from, to, insert }];
  }
  if (words === '') return [];
  const header = headerOf(doc, scene);
  const top = header[0];
  if (top !== undefined) {
    const at = (doc.blocks[top] as Block).span.from;
    return [{ from: at, to: at, insert: `= ${words}${nl}` }];
  }
  const at = endOf(doc, doc.blocks[scene.block] as Block);
  return [{ from: at, to: at, insert: `${nl}${nl}= ${words}` }];
}

/**
 * The changes that give the scene `color` (design §5.4): its color note changed in place, or
 * `[[Color: blue]]` added to the header after the synopses and before other notes. Null takes the
 * color away, with its line when it is alone on one; beside other text only the note goes. A script
 * with an unclosed `/*` gets no changes.
 */
export function setColor(doc: Doc, scene: Scene, color: SceneColor | null): TextChange[] {
  return setSceneDetails(doc, scene, { color });
}

/** What Scene details sets. undefined: unchanged; '' or null: cleared (the note and its line go). */
export interface SceneDetails {
  synopsis?: string;
  color?: SceneColor | null;
  /** Comma-separated labels: `A, B` is written `[[Thread: A, B]]`, replacing any Storyline note it rewrites. */
  thread?: string;
  goal?: string;
  conflict?: string;
  outcome?: string;
  shift?: string;
}

/** Where a field sits in a header: synopses are 0, then each field in `FIELD_ORDER` from 1. */
const rankOf = (key: FieldKey) => FIELD_ORDER.indexOf(key) + 1;

/**
 * The header's lines, grouped so no note crosses from one group to the next (a note can run over
 * lines), each with its rank: 0 for a synopsis, a field's rank for the first field note in it, else
 * null (the writer's other notes).
 */
function headerUnits(doc: Doc, scene: Scene) {
  const units: Array<{ from: number; to: number; rank: number | null }> = [];
  for (const index of headerOf(doc, scene)) {
    const block = doc.blocks[index] as Block;
    for (const line of block.lines) {
      const to = contentEnd(doc.source, line.span.to);
      const last = units[units.length - 1];
      if (last && doc.regions.some((r) => r.span.from < last.to && r.span.to > last.to)) {
        last.to = to;
        continue;
      }
      units.push({ from: line.span.from, to, rank: block.kind === 'synopsis' ? 0 : null });
    }
  }
  for (const unit of units) {
    if (unit.rank !== null) continue;
    for (const region of doc.regions) {
      if (region.kind !== 'note' || region.span.from < unit.from || region.span.from >= unit.to) {
        continue;
      }
      const head = readNote(doc.source.slice(region.span.from + 2, region.span.to - 2)).head;
      if (head?.kind === 'field') {
        unit.rank = rankOf(head.key);
        break;
      }
    }
  }
  return units;
}

/**
 * A new field's note on a line of its own in the header: after every field before it in
 * `FIELD_ORDER` (and the synopses), and before every field after it; with neither, at the top of
 * the header; with no header, after the heading's blank line.
 */
function insertField(doc: Doc, scene: Scene, key: FieldKey, note: string): TextChange[] {
  const nl = lineBreakOf(doc.source);
  const rank = rankOf(key);
  const units = headerUnits(doc, scene);
  let anchor: (typeof units)[number] | undefined;
  for (const unit of units) {
    if (unit.rank === null) continue;
    if (unit.rank > rank) break;
    anchor = unit;
  }
  if (anchor) return [{ from: anchor.to, to: anchor.to, insert: `${nl}${note}` }];
  const top = units[0];
  if (top) return [{ from: top.from, to: top.from, insert: `${note}${nl}` }];
  const at = endOf(doc, doc.blocks[scene.block] as Block);
  return [{ from: at, to: at, insert: `${nl}${nl}${note}` }];
}

/** The span of the scene's first `[[Key:]]` note with nothing in it, if there is one. */
function emptyField(doc: Doc, scene: Scene, key: FieldKey): Span | undefined {
  for (const region of doc.regions) {
    if (region.span.from < scene.span.from || region.span.from >= scene.span.to) continue;
    if (region.kind !== 'note' || !region.closed) continue;
    const note = readNote(doc.source.slice(region.span.from + 2, region.span.to - 2));
    if (note.head?.kind === 'field' && note.head.key === key && note.body === '') {
      return { ...region.span };
    }
  }
  return undefined;
}

/**
 * One field: changed where it is, wherever the writer typed it (§5.3); taken out (with its line
 * when it is alone on one) when `value` is empty; or added to the header. A field already holding
 * `value` isn't rewritten, however it was typed (a color in any case). An empty note of the key is
 * filled in where it is.
 */
function setField(doc: Doc, scene: Scene, key: FieldKey, value: string): TextChange[] {
  const body = safeBody(value);
  const existing = scene.fields[key];
  if (body === '') {
    if (!existing) return [];
    const entry = noteEntries(doc).find((e) => e.span.from === existing.span.from);
    return entry ? deleteEntry(doc, entry) : [];
  }
  const same = (a: string) =>
    key === 'color' ? a.toLowerCase() === body.toLowerCase() : a === body;
  if (existing && same(existing.body)) return [];
  const note = fieldNote(key, value);
  // An empty note of the key (no field for reading) is filled in where it is.
  const target = existing?.span ?? emptyField(doc, scene, key);
  if (target) return [{ ...target, insert: note }];
  return insertField(doc, scene, key, note);
}

/** The closed Thread (or Storyline) notes in the scene's header, in order. */
function headerThreads(doc: Doc, scene: Scene) {
  const blocks = new Set(headerOf(doc, scene));
  return noteEntries(doc).filter(
    (e) =>
      e.kind === 'note' &&
      blocks.has(e.block) &&
      e.span.from >= scene.span.from &&
      e.span.to <= scene.span.to &&
      e.note?.head?.kind === 'field' &&
      e.note.head.key === 'thread',
  );
}

/**
 * The scene's thread field (design §7.1): every Thread and Storyline note in its header becomes
 * one `Thread` note (the first one's place, or the field's rank), or none when `value` is empty.
 * Notes outside the header are touched only when the header holds none. One change, so it is one
 * transaction however many notes there were.
 */
function setThreadField(doc: Doc, scene: Scene, value: string): TextChange[] {
  const body = safeBody(value);
  const note = body === '' ? '' : fieldNote('thread', value);
  let cur = doc;
  let to = scene.span.to;
  const view = () => rescan(cur, scene, { from: scene.span.from, to });
  const apply = (changes: TextChange[]) => {
    const [change] = changes;
    if (!change || changes.length !== 1) return false;
    cur = parse(cur.source.slice(0, change.from) + change.insert + cur.source.slice(change.to));
    to += change.insert.length - (change.to - change.from);
    return true;
  };
  // A note on a line of its own goes with its line. One the action starts right under is not
  // refused: its line goes up to the next block when parsing shows that prints the same.
  const remove = (entry: NoteEntry): TextChange[] => {
    const gone = deleteEntry(cur, entry);
    if (gone.length > 0 || !entry.alone) return gone;
    const block = cur.blocks[entry.block];
    const next = cur.blocks[entry.block + 1];
    if (!block || !next || block.kind !== 'note' || block.lines.length !== 1) return [];
    const change = { from: block.span.from, to: next.span.from, insert: '' };
    const after = parse(cur.source.slice(0, change.from) + cur.source.slice(change.to));
    return printing(after) === printing(cur) ? [change] : [];
  };
  // Every header note but the first goes, last first.
  for (;;) {
    const found = headerThreads(cur, view());
    const keep = note === '' ? 0 : 1;
    const last = found[found.length - 1];
    if (!last || found.length <= keep) break;
    if (!apply(remove(last))) return [];
  }
  const header = headerThreads(cur, view())[0];
  if (header) {
    if (note === '') return [];
    if (cur.source.slice(header.span.from, header.span.to) !== note) {
      apply([{ ...header.span, insert: note }]);
    }
  } else {
    const scene2 = view();
    const outside = scene2.fields.thread?.span ?? emptyField(cur, scene2, 'thread');
    if (!outside) {
      if (note !== '') apply(insertField(cur, scene2, 'thread', note));
    } else if (note !== '') {
      apply([{ ...outside, insert: note }]);
    } else {
      const entry = noteEntries(cur).find((e) => e.span.from === outside.from);
      if (entry) apply(remove(entry));
    }
  }
  const change = smallest(doc.source, { from: 0, to: doc.source.length, insert: cur.source });
  return change ? [change] : [];
}

/** The scene as it reads in `doc`: its synopses, fields, and the rest of its notes, within `span`. */
function rescan(doc: Doc, scene: Scene, span: Span): Scene {
  const synopses: Scene['synopses'] = [];
  for (let i = scene.block; i < doc.blocks.length; i++) {
    const block = doc.blocks[i] as Block;
    if (block.span.from >= span.to) break;
    if (block.kind === 'synopsis')
      synopses.push({ text: block.sem.text, block: i, span: block.span });
  }
  const regions = doc.regions.filter((r) => r.span.from >= span.from && r.span.from < span.to);
  return { ...scene, span, synopses, ...sceneNotes(doc.source, regions) };
}

/**
 * The whole header written at once (Scene details, design §9): one set of non-overlapping changes
 * that sets the synopsis, Color, Thread, Goal, Conflict, Outcome, and Shift, in that order
 * (§5.4). Each is changed in place wherever it was typed; a new one goes into the header after the
 * ones before it and before the ones after it; a cleared one goes with its line. A second note of
 * the same key is left alone, except Thread: that field's notes in the header become one. [] while a `/*` is stray, or when nothing changes.
 */
export function setSceneDetails(doc: Doc, scene: Scene, details: SceneDetails): TextChange[] {
  if (hasStrayBoneyard(doc)) return [];
  const steps: Array<(doc: Doc, scene: Scene) => TextChange[]> = [];
  const { synopsis } = details;
  if (synopsis !== undefined) {
    steps.push((d, s) =>
      s.synopses[0]?.text === safeLine(synopsis) ? [] : setSynopsis(d, s, synopsis),
    );
  }
  for (const key of FIELD_ORDER) {
    const value = details[key];
    if (value === undefined) continue;
    steps.push((d, s) =>
      key === 'thread' ? setThreadField(d, s, value ?? '') : setField(d, s, key, value ?? ''),
    );
  }
  // Each field is set on the text as the ones before it left it, and every change is kept in the
  // first text's offsets, so the result is one set of changes for one transaction.
  let current = doc;
  let text = doc.source;
  let edits = Edits.from(text.length);
  let to = scene.span.to;
  for (const step of steps) {
    const changes = step(current, rescan(current, scene, { from: scene.span.from, to }));
    if (changes.length === 0) continue;
    for (const change of [...changes].sort((a, b) => b.from - a.from)) {
      text = text.slice(0, change.from) + change.insert + text.slice(change.to);
      edits = edits.replace(change);
      to += change.insert.length - (change.to - change.from);
    }
    current = parse(text);
  }
  return edits.changes(doc.source);
}

/** A piece of the edited text: a range of the first text, or text written since. */
type Piece = { from: number; to: number } | { text: string };

const lengthOf = (piece: Piece) => ('text' in piece ? piece.text.length : piece.to - piece.from);

/** Edits made one after another, kept as pieces of the first text and new text. */
class Edits {
  private constructor(private readonly pieces: readonly Piece[]) {}

  static from(length: number): Edits {
    return new Edits(length > 0 ? [{ from: 0, to: length }] : []);
  }

  /** The pieces between offsets `from` and `to` of the text as it is now. */
  private slice(from: number, to: number): Piece[] {
    const out: Piece[] = [];
    let at = 0;
    for (const piece of this.pieces) {
      const length = lengthOf(piece);
      const start = Math.max(from, at);
      const end = Math.min(to, at + length);
      if (start < end) {
        out.push(
          'text' in piece
            ? { text: piece.text.slice(start - at, end - at) }
            : { from: piece.from + start - at, to: piece.from + end - at },
        );
      }
      at += length;
    }
    return out;
  }

  /** These edits, then `change` (in the offsets of the text as it is now). */
  replace(change: TextChange): Edits {
    const total = this.pieces.reduce((n, piece) => n + lengthOf(piece), 0);
    return new Edits([
      ...this.slice(0, change.from),
      { text: change.insert },
      ...this.slice(change.to, total),
    ]);
  }

  /** The edits as changes to `source` (the first text), sorted, apart, and each as small as it can be. */
  changes(source: string): TextChange[] {
    const out: TextChange[] = [];
    let at = 0;
    let insert = '';
    const flush = (to: number) => {
      const change = smallest(source, { from: at, to, insert });
      if (change) out.push(change);
      insert = '';
    };
    for (const piece of this.pieces) {
      if ('text' in piece) {
        insert += piece.text;
        continue;
      }
      if (piece.from !== at || insert !== '') flush(piece.from);
      at = piece.to;
    }
    if (at !== source.length || insert !== '') flush(source.length);
    return out;
  }
}

/**
 * `change` without the text it keeps at either end, never splitting a CRLF; null when it keeps
 * everything.
 */
function smallest(source: string, change: TextChange): TextChange | null {
  const old = source.slice(change.from, change.to);
  const { insert } = change;
  let start = 0;
  while (start < old.length && start < insert.length && old[start] === insert[start]) start++;
  let end = 0;
  while (
    end < old.length - start &&
    end < insert.length - start &&
    old[old.length - 1 - end] === insert[insert.length - 1 - end]
  ) {
    end++;
  }
  const crlf = (at: number) => source[at - 1] === '\r' && source[at] === '\n';
  if (start > 0 && crlf(change.from + start)) start--;
  if (end > 0 && crlf(change.to - end)) end--;
  const from = change.from + start;
  const to = change.to - end;
  const written = insert.slice(start, insert.length - end);
  return from === to && written === '' ? null : { from, to, insert: written };
}
