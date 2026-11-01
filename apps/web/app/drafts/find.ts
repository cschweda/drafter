import { listProjects } from '../storage/projects';
import { typedDraftNumber } from './labels';
import { type DraftRow, draftRow, draftsByPrefix, isIdPrefix } from './store';

// What the palette finds for a draft (drafts-and-cuts design §2.2): 4 or more hex characters find
// every draft whose ID begins with them, of any script; a number ("2", "02", "Draft 02") finds the
// open script's draft of that number. Only drafts of scripts that are still here: a draft whose
// script is gone is never offered.

export interface DraftHit {
  projectId: string;
  row: DraftRow;
  /** The script's title, when it isn't the one open. */
  title?: string;
}

export async function findDrafts(query: string, openId: string | null): Promise<DraftHit[]> {
  const typed = query.trim();
  const number = typedDraftNumber(typed);
  const byId = isIdPrefix(typed);
  if (!byId && (number === null || openId === null)) return [];
  const found: { projectId: string; row: DraftRow }[] = [];
  if (number !== null && openId !== null) {
    const row = await draftRow(openId, number);
    if (row) found.push({ projectId: openId, row });
  }
  if (byId) {
    for (const hit of await draftsByPrefix(typed))
      if (!found.some((f) => f.row.key === hit.row.key)) found.push(hit);
  }
  if (found.length === 0) return [];
  const titles = new Map((await listProjects()).map((p) => [p.id, p.title]));
  return found
    .filter((hit) => titles.has(hit.projectId))
    .map((hit) =>
      hit.projectId === openId ? hit : { ...hit, title: titles.get(hit.projectId) as string },
    );
}
