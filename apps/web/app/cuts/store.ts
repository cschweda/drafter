// Cuts in the browser's storage (drafts-and-cuts design §3, §5): everything that left the text,
// kept for good. One row per cut text and script, keyed `${projectId}:${id}` where `id` is the
// SHA-256 of the text, so the same text cut again is one entry with every date and draft it was
// cut in. Cuts are never thinned and have no Delete; they go only with the script (`removeProject`).
import {
  type CutEntry,
  type CutWhere,
  cutText,
  MAX_CUTS_PER_ENTRY,
  type WorkKind,
} from '@drafter/history';
import { db, type SettingRow } from '../storage/db';
import { hashText } from '../storage/hash';

export interface CutRow extends CutEntry {
  /** `${projectId}:${id}`. */
  key: string;
  projectId: string;
}

/** A cut as found (`findCuts`, with its place): what `recordCuts` keeps. */
export interface FoundCutAt {
  title: string;
  text: string;
  where: CutWhere;
}

export const cutKey = (projectId: string, id: string): string => `${projectId}:${id}`;

/** The settings row holding the recorder's comparison point for a script (`recorder.ts`). */
export const cutsPointKey = (projectId: string): string => `cuts-point:${projectId}`;

/** The settings row holding the recorder's first point for a script, where the backfill ends. */
export const cutsFirstPointKey = (projectId: string): string => `cuts-first:${projectId}`;

/** The settings row holding how far the first-run backfill of a script has got (`backfill.ts`). */
export const cutsBackfillKey = (projectId: string): string => `cuts-backfill:${projectId}`;

/** The newest date a cut was cut. */
export function lastCut(row: Pick<CutEntry, 'cuts'>): string {
  let latest = '';
  for (const cut of row.cuts) if (cut.at > latest) latest = cut.at;
  return latest;
}

/** Rows newest cut first; the same moment, by ID. */
export function newestFirst<T extends CutEntry>(rows: readonly T[]): T[] {
  return rows
    .map((row) => ({ row, at: lastCut(row) }))
    .sort((a, b) => (a.at !== b.at ? (a.at > b.at ? -1 : 1) : a.row.id < b.row.id ? -1 : 1))
    .map(({ row }) => row);
}

/**
 * Records `cuts`, cut at `at` while writing Draft `draft` (null: before drafts), in one
 * transaction, together with `extra` (a backfill's progress) so neither is written without the
 * other. A text already kept gains the date (once: the same date and draft twice is one), and the
 * place if this date is its newest; its title, kind and first dates stay. Resolves with the rows as written: none for a
 * script that isn't there. Cuts found together (`findCuts` gives them in the text's order) are
 * dated a millisecond apart, the first latest, so newest first lists them as they stood.
 */
export async function recordCuts(
  projectId: string,
  kind: WorkKind,
  cuts: readonly FoundCutAt[],
  draft: number | null,
  at: number,
  extra?: SettingRow,
): Promise<CutRow[]> {
  const made = await Promise.all(
    cuts.map(async (cut) => {
      const text = cutText(cut.text);
      return { cut, text, id: await hashText(text) };
    }),
  );
  return db.transaction('rw', db.cuts, db.settings, db.projects, async () => {
    // A script removed meanwhile keeps nothing: its cuts went with it.
    if (!(await db.projects.get(projectId))) return [];
    const out: CutRow[] = [];
    const seen = new Set<string>();
    for (const { cut, text, id } of made) {
      if (seen.has(id)) continue;
      const when = new Date(at - seen.size).toISOString();
      seen.add(id);
      const key = cutKey(projectId, id);
      const had = (await db.cuts.get(key)) as CutRow | undefined;
      let row: CutRow;
      if (had) {
        const dates = had.cuts.some((c) => c.at === when && c.draft === draft)
          ? had.cuts
          : [...had.cuts, { at: when, draft }];
        dates.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
        // The newest place wins (as `mergeCuts`): a backfill writing an older date keeps it.
        const newest = when >= lastCut(had);
        row = {
          ...had,
          cuts: dates.slice(-MAX_CUTS_PER_ENTRY),
          where: newest ? cut.where : had.where,
        };
      } else {
        row = {
          key,
          projectId,
          id,
          title: cut.title,
          text,
          kind,
          cuts: [{ at: when, draft }],
          where: cut.where,
        };
      }
      await db.cuts.put(row);
      out.push(row);
    }
    if (extra) await db.settings.put(extra);
    return out;
  });
}

/** The script's cuts, newest cut first. */
export async function listCuts(projectId: string): Promise<CutRow[]> {
  const rows = (await db.cuts.where('projectId').equals(projectId).toArray()) as CutRow[];
  return newestFirst(rows);
}

/** One cut of the script, or null. */
export async function cutRow(projectId: string, id: string): Promise<CutRow | null> {
  const row = (await db.cuts.get(cutKey(projectId, id))) as CutRow | undefined;
  return row && row.projectId === projectId ? row : null;
}

/** Marks the cut "put back on <date>". It stays listed: Cuts is a record, not a clipboard. */
export async function markPutBack(projectId: string, id: string, at: number): Promise<void> {
  await db.cuts.update(cutKey(projectId, id), { putBack: new Date(at).toISOString() });
}

/** Whether the cut was put back after it was last cut. */
export const isPutBack = (row: Pick<CutEntry, 'cuts' | 'putBack'>): boolean =>
  row.putBack !== undefined && row.putBack >= lastCut(row);
