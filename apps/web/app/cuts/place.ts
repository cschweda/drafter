// Where a cut goes back (drafts-and-cuts design §3.2): pure, so it runs in the history worker
// (`cutOrdinal`, as a cut is recorded) and on the page (Put back, Insert at cursor) alike.
//
// A text is read as units: a script's scenes (`scenePrints`), or a Markdown document's opening and
// its `#`–`###` headings (`markdownAnchors`). Put back finds a cut's old neighbours among them by
// heading, and of several with the same heading (five `INT. CAR - NIGHT`, three `## Notes`) takes
// the one nearest the cut's old place, never simply the first.
import { markdownAnchors, splitLines } from '@drafter/compare';
import type { TextChange } from '@drafter/fountain';
import {
  type CutWhere,
  cutText,
  headingKey,
  putBackChanges,
  scenePrints,
  type WorkKind,
} from '@drafter/history';
import { findMarkdownMeta } from '@drafter/markdown';

/** A scene, or a Markdown document's opening or section, in a text. */
export interface Unit {
  /** Its heading as written ('' for a Markdown opening). */
  heading: string;
  key: string;
  /** Its start, and the end of its own text (before the next unit). */
  from: number;
  to: number;
}

/**
 * The text's units, numbered as a cut's `where.ordinal` and `within.ordinal` are: a script's
 * scenes from index 0 (ordinal 1), a Markdown document's opening at index 0 (ordinal 0) and its
 * headings after it (ordinal 1, 2, 3…).
 */
export function unitsOf(text: string, kind: WorkKind): Unit[] {
  if (kind === 'fountain') {
    const { slots, prints } = scenePrints(text);
    const headings = new Map(prints.map((p) => [p.hash, p.heading]));
    return slots.map((slot) => {
      const heading = (headings.get(slot.hash) ?? '').trim();
      return { heading, key: headingKey(heading), from: slot.from, to: slot.to };
    });
  }
  const { starts } = splitLines(text);
  const end = markdownEnd(text);
  const anchors = markdownAnchors(text).map((a) => ({
    heading: a.title,
    from: starts[a.line] as number,
  }));
  const units: Unit[] = [{ heading: '', key: '', from: 0, to: anchors[0]?.from ?? end }];
  anchors.forEach((a, i) => {
    units.push({
      heading: a.heading,
      key: headingKey(a.heading),
      from: a.from,
      to: Math.max(a.from, anchors[i + 1]?.from ?? end),
    });
  });
  return units;
}

/** Where a Markdown document's body ends: before its trailing `<!-- drafter … -->`, if it has one. */
function markdownEnd(text: string): number {
  return findMarkdownMeta(text)?.from ?? text.length;
}

/** A unit's index from a cut's ordinal (a script's scenes count from 1, a document's from 0). */
const indexOf = (ordinal: number, kind: WorkKind) => (kind === 'fountain' ? ordinal - 1 : ordinal);

/**
 * The ordinal of the unit that starts where a whole cut's `text` stood in `before` (the cut's own
 * place), or undefined when it can't be found. Linear.
 */
export function cutOrdinal(before: string, text: string, kind: WorkKind): number | undefined {
  const at = cutText(before).indexOf(text);
  if (at < 0) return undefined;
  const units = unitsOf(cutText(before), kind);
  let found = -1;
  for (let i = 0; i < units.length; i++) if ((units[i] as Unit).from <= at) found = i;
  if (found < 0) return undefined;
  return kind === 'fountain' ? found + 1 : found;
}

/** The unit with `heading`'s key nearest index `near` (the first, without one); or null. */
function nearest(units: readonly Unit[], heading: string, near: number | undefined): number | null {
  const key = headingKey(heading);
  let best: number | null = null;
  units.forEach((unit, i) => {
    if (unit.key !== key) return;
    if (best === null || (near !== undefined && Math.abs(i - near) < Math.abs(best - near)))
      best = i;
  });
  return best;
}

/** Where a cut goes, and the words that say so ("after INT. KITCHEN - DAY"). */
export interface CutPlace {
  /** Where it goes in the text; null: at the end of the body. */
  at: number | null;
  said: string;
}

const AT_END: CutPlace = { at: null, said: 'at the end' };

/**
 * Where Put back puts a cut in `now`. A whole scene or section goes after the unit now under its
 * old previous heading, else before the one under its old next heading, else at the end. A
 * passage goes at the end of the scene or section it was cut from, found by its heading now
 * (`where.after`), else as it was (`within.heading`), else at the end.
 */
export function putBackPlace(where: CutWhere, now: string, kind: WorkKind): CutPlace {
  const units = unitsOf(now, kind);
  const within = where.within;
  if (within) {
    const near = indexOf(within.ordinal, kind);
    for (const heading of [where.after, within.heading]) {
      if (heading === null) continue;
      // A document's opening has no heading: it is index 0.
      const i = heading === '' && kind === 'markdown' ? 0 : nearest(units, heading, near);
      if (i === null) continue;
      const unit = units[i] as Unit;
      return { at: unit.to, said: `at the end of ${unit.heading || 'the opening'}` };
    }
    if (within.heading === '' && kind === 'markdown')
      return { at: (units[0] as Unit).to, said: 'at the end of the opening' };
    return AT_END;
  }
  const own = where.ordinal === undefined ? undefined : indexOf(where.ordinal, kind);
  if (where.after !== null) {
    const i = nearest(units, where.after, own === undefined ? undefined : own - 1);
    if (i !== null)
      return { at: (units[i] as Unit).to, said: `after ${(units[i] as Unit).heading}` };
  }
  if (where.before !== null) {
    const i = nearest(units, where.before, own);
    if (i !== null)
      return { at: (units[i] as Unit).from, said: `before ${(units[i] as Unit).heading}` };
  }
  return AT_END;
}

const BLANK = /^[ \t]*$/;

/**
 * Where Insert at cursor puts a cut: a whole scene of a script at the start of the next scene
 * after the cursor (Call 10); anything else at the start of the next paragraph after it. With
 * none after it, at the end of the body.
 */
export function insertPlace(now: string, cursor: number, kind: WorkKind, scene: boolean): CutPlace {
  if (kind === 'fountain' && scene) {
    const next = unitsOf(now, kind).find((unit) => unit.from >= cursor);
    return next ? { at: next.from, said: `before ${next.heading}` } : AT_END;
  }
  const { lines, starts } = splitLines(now);
  const end = kind === 'markdown' ? markdownEnd(now) : null;
  let line = 0;
  while (line + 1 < starts.length && (starts[line + 1] as number) <= cursor) line++;
  // The cursor's paragraph runs to its first blank line; the next starts after the blank lines.
  while (line < lines.length && !BLANK.test(lines[line] as string)) line++;
  while (line < lines.length && BLANK.test(lines[line] as string)) line++;
  const at = starts[line];
  if (line >= lines.length || at === undefined || (end !== null && at >= end)) return AT_END;
  if (kind === 'fountain' && isMetaStart(now, at)) return AT_END;
  return { at, said: 'at the next paragraph' };
}

/** Whether a script's settings block (`/* drafter`) starts at `at`. */
const isMetaStart = (text: string, at: number) => text.startsWith('/* drafter', at);

/**
 * The one change that puts `text` at `place` in `now`, with a blank line either side (only the
 * line breaks missing are added), in the text's own line breaks. A script's end is after its last
 * block, before its settings; a document's, before its trailing comment.
 */
export function cutChanges(
  now: string,
  place: CutPlace,
  text: string,
  kind: WorkKind,
): TextChange[] {
  if (place.at === null) {
    if (kind === 'fountain')
      return putBackChanges(now, { at: now.length, side: 'end', anchor: null }, text);
    return putBackChanges(now, { at: markdownEnd(now), side: 'after', anchor: '' }, text);
  }
  return putBackChanges(now, { at: place.at, side: 'after', anchor: '' }, text);
}
