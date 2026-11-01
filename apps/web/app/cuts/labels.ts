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

/** The heading a cut is listed under: the scene or section it was cut from, or its own. */
function homeOf(row: Pick<CutEntry, 'where' | 'title' | 'kind'>): string {
  const within = row.where.within;
  if (within) return within.heading;
  return row.title;
}

const openingLabel = (kind: WorkKind) => (kind === 'markdown' ? 'The opening' : 'Untitled scene');

/**
 * The cuts in groups (`rows` newest first, as `listCuts` gives them): by scene or chapter, each
 * passage under the heading it was cut from and a whole scene or section under its own, so a scene
 * cut down over several drafts reads as one group; or by the draft each was last cut in. Groups
 * are newest first, and so are the cuts in each.
 */
export function groupCuts<T extends Pick<CutEntry, 'where' | 'title' | 'kind' | 'cuts'>>(
  rows: readonly T[],
  by: GroupBy,
  ids: ReadonlyMap<number, string> = new Map(),
): CutGroup<T>[] {
  const groups = new Map<string, CutGroup<T>>();
  for (const row of rows) {
    let key: string;
    let label: string;
    if (by === 'draft') {
      const latest = [...row.cuts].sort((a, b) => (a.at < b.at ? 1 : -1))[0];
      const n = latest?.draft ?? null;
      key = n === null ? 'before' : `draft-${n}`;
      label = n === null ? 'Before drafts' : draftLabel(n, ids);
    } else {
      const home = homeOf(row).trim();
      key = `h:${headingKey(home)}`;
      label = home || openingLabel(row.kind);
    }
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else groups.set(key, { key, label, rows: [row] });
  }
  // Rows came newest first, so each group's first row is its newest, and the map is in that order.
  return [...groups.values()];
}

/**
 * The cuts a filter finds: words in the text, title, or the heading it was cut from, case and
 * accents folded; a
 * draft number ("3", "draft 03") finds the cuts cut while writing it.
 */
export function filterCuts<T extends Pick<CutEntry, 'where' | 'title' | 'text' | 'cuts'>>(
  rows: readonly T[],
  typed: string,
): T[] {
  const words = foldText(typed);
  if (!words) return [...rows];
  const n = typedDraftNumber(words);
  return rows.filter(
    (row) =>
      (n !== null && row.cuts.some((c) => c.draft === n)) ||
      foldText(`${row.title}\n${row.where.within?.heading ?? ''}\n${row.text}`).includes(words),
  );
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
