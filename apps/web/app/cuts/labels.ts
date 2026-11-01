import { type CutEntry, draftName, headingKey, type WorkKind } from '@drafter/history';
import { draftDay, draftWhen, shortId, typedDraftNumber } from '../drafts/labels';
import { foldText } from '../history/labels';
import { isPutBack } from './store';

// The Cuts list's words and order (drafts-and-cuts design §3.2): a list to browse for ideas, so
// each passage is shown under the scene or chapter it was cut from, newest first, and every cut
// says when it was cut and while writing which draft.

/** "1 cut", "12 cuts". */
export const cutsCount = (n: number): string =>
  `${n.toLocaleString('en-US')} ${n === 1 ? 'cut' : 'cuts'}`;

/** A cut's draft as the list names it: "Draft 03", with its short ID once it is frozen. */
function draftLabel(n: number, ids: ReadonlyMap<number, string>): string {
  const id = ids.get(n);
  return id ? `${draftName(n)} (${shortId(id)})` : draftName(n);
}

/**
 * "Cut while writing Draft 03 · 3 Nov 2026, 10:42", or "Cut before drafts · 21 Oct 2026"; cut
 * more than once, "· cut 3 times"; put back since, "· put back on 4 Nov 2026".
 */
export function cutLine(
  row: Pick<CutEntry, 'cuts' | 'putBack'>,
  ids: ReadonlyMap<number, string> = new Map(),
): string {
  const latest = [...row.cuts].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))[0];
  if (!latest) return '';
  const at = Date.parse(latest.at);
  const parts = [
    latest.draft === null
      ? `Cut before drafts · ${draftDay(at)}`
      : `Cut while writing ${draftLabel(latest.draft, ids)} · ${draftWhen(at)}`,
  ];
  if (row.cuts.length > 1) parts.push(`cut ${row.cuts.length.toLocaleString('en-US')} times`);
  if (row.putBack !== undefined && isPutBack(row))
    parts.push(`put back on ${draftDay(Date.parse(row.putBack))}`);
  return parts.join(' · ');
}

/** What a whole cut was: "Whole scene", "Whole section"; null for a passage. */
export function wholeLabel(row: Pick<CutEntry, 'where' | 'kind'>): string | null {
  if (row.where.within) return null;
  return row.kind === 'fountain' ? 'Whole scene' : 'Whole section';
}

export type GroupBy = 'scene' | 'draft';

export interface CutGroup<T> {
  key: string;
  /** "INT. HALL - DAY", "The opening", "Draft 03", "Before drafts". */
  label: string;
  rows: T[];
}

type Listed = Pick<CutEntry, 'where' | 'title' | 'text' | 'kind' | 'cuts'>;

/**
 * A cut as the list uses it, worked out once when the list is read (so a filter or a regrouping of
 * thousands of cuts folds no text again): its newest date and that date's draft, its text folded
 * for the filter, and the heading (and number) it is listed under.
 */
export interface IndexedCut<T> {
  row: T;
  latest: string;
  latestDraft: number | null;
  /** The drafts it was cut in. */
  drafts: ReadonlySet<number | null>;
  fold: string;
  home: string;
  homeKey: string;
  /** The number of the scene or section it is listed under, when known. */
  homeOrdinal: number | undefined;
}

export function indexCuts<T extends Listed>(rows: readonly T[]): IndexedCut<T>[] {
  return rows.map((row) => {
    let latest = '';
    let latestDraft: number | null = null;
    for (const c of row.cuts) {
      if (c.at > latest) {
        latest = c.at;
        latestDraft = c.draft;
      }
    }
    const within = row.where.within;
    const home = (within ? within.heading : row.title).trim();
    return {
      row,
      latest,
      latestDraft,
      drafts: new Set(row.cuts.map((c) => c.draft)),
      fold: foldText(`${row.title}\n${within?.heading ?? ''}\n${row.text}`),
      home,
      homeKey: headingKey(home),
      homeOrdinal: within ? within.ordinal : row.where.ordinal,
    };
  });
}

const openingLabel = (kind: WorkKind) => (kind === 'markdown' ? 'The opening' : 'Untitled scene');

/**
 * The cuts in groups (newest first, as `listCuts` gives them): by scene or chapter, each passage
 * under the heading it was cut from and a whole scene or section under its own, so a scene cut down
 * over several drafts reads as one group; or by the draft each was last cut in. A heading the list
 * holds at more than one place (five `INT. CAR - NIGHT`) is a group per place, "(scene 4)". Groups
 * are newest first, and so are the cuts in each.
 */
export function groupIndexed<T extends Listed>(
  cuts: readonly IndexedCut<T>[],
  by: GroupBy,
  ids: ReadonlyMap<number, string> = new Map(),
): CutGroup<T>[] {
  // The headings held at more than one place.
  const places = new Map<string, Set<number>>();
  if (by === 'scene') {
    for (const c of cuts) {
      if (c.homeOrdinal === undefined) continue;
      const set = places.get(c.homeKey) ?? new Set();
      set.add(c.homeOrdinal);
      places.set(c.homeKey, set);
    }
  }
  const groups = new Map<string, CutGroup<T>>();
  for (const c of cuts) {
    let key: string;
    let label: string;
    if (by === 'draft') {
      const n = c.latestDraft;
      key = n === null ? 'before' : `draft-${n}`;
      label = n === null ? 'Before drafts' : draftLabel(n, ids);
    } else {
      label = c.home || openingLabel(c.row.kind);
      key = `h:${c.homeKey}`;
      if ((places.get(c.homeKey)?.size ?? 0) > 1 && c.homeOrdinal !== undefined) {
        key += `#${c.homeOrdinal}`;
        label += ` (${c.row.kind === 'fountain' ? 'scene' : 'section'} ${c.homeOrdinal})`;
      }
    }
    const group = groups.get(key);
    if (group) group.rows.push(c.row);
    else groups.set(key, { key, label, rows: [c.row] });
  }
  // The cuts came newest first, so each group's first is its newest, and the map is in that order.
  return [...groups.values()];
}

/** `groupIndexed` of plain rows. */
export function groupCuts<T extends Listed>(
  rows: readonly T[],
  by: GroupBy,
  ids: ReadonlyMap<number, string> = new Map(),
): CutGroup<T>[] {
  return groupIndexed(indexCuts(rows), by, ids);
}

/**
 * The cuts a filter finds: words in the text, title, or the heading it was cut from, case and
 * accents folded; a draft number ("3", "draft 03") finds the cuts cut while writing it.
 */
export function filterIndexed<T>(cuts: readonly IndexedCut<T>[], typed: string): IndexedCut<T>[] {
  const words = foldText(typed);
  if (!words) return [...cuts];
  const n = typedDraftNumber(words);
  return cuts.filter((c) => (n !== null && c.drafts.has(n)) || c.fold.includes(words));
}

/** `filterIndexed` of plain rows. */
export function filterCuts<T extends Listed>(rows: readonly T[], typed: string): T[] {
  return filterIndexed(indexCuts(rows), typed).map((c) => c.row);
}

/** What the list says, politely, of a filter: "3 cuts match.", "No cut matches." */
export function matchesLabel(n: number): string {
  if (n === 0) return 'No cut matches.';
  return n === 1 ? '1 cut matches.' : `${n.toLocaleString('en-US')} cuts match.`;
}

/** A cut's name for its actions: "“INT. HALL - DAY”", "“Marra keeps the key…”". */
export const cutName = (row: Pick<CutEntry, 'title'>): string => `“${row.title || 'Untitled cut'}”`;

/** Says what the list says when it is empty. */
export const NO_CUTS =
  'No cuts yet. Whatever you cut from this script, a scene, a speech, or a paragraph, is kept here for good, from its next snapshot.';
export const NO_CUTS_MARKDOWN =
  'No cuts yet. Whatever you cut from this document, a chapter, a section, or a paragraph, is kept here for good, from its next snapshot.';
export const NOT_KEPT_SAMPLE =
  'Cuts aren’t kept for a sample. Save it to a file, and it becomes a script of your own that keeps them.';
