// Export drafts and cuts (drafts-and-cuts design §4.1, Call 14): where files can't be written beside
// the work (other browsers, phones, a folder not granted), a `.zip` of what would be there: the
// drafts folder with every draft file, and the cuts file, made with `@drafter/archive`'s zip writer.
// Every browser has it, in the Drafts and Cuts lists.
import { type ZipWriteEntry, zipStored } from '@drafter/archive';
import { cutsFile, draftFile, type WorkKind } from '@drafter/history';
import { entryOf, listCuts } from '../cuts/store';
import { draftText, listDrafts } from '../drafts/store';
import { type BesideNames, draftName, factsOf } from './beside';

/**
 * The zip of a script's drafts and cuts, named as they would be beside its work: every draft in
 * `<Work> drafts/` (an outside draft as the next free `(k)` of its number) and `<file>.cuts.md`.
 */
export async function exportDraftsAndCuts(
  projectId: string,
  names: BesideNames,
  kind: WorkKind,
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const entries: ZipWriteEntry[] = [];
  const taken = new Set<string>();
  for (const row of (await listDrafts(projectId)).reverse()) {
    const text = await draftText(projectId, row.key);
    if (text === null) continue;
    let copy = 1;
    while (taken.has(draftName(names, row.n, kind, copy).toLowerCase())) copy++;
    const name = draftName(names, row.n, kind, copy);
    taken.add(name.toLowerCase());
    entries.push({
      name: `${names.folder}/${name}`,
      data: encoder.encode(draftFile(text, factsOf(row), kind)),
    });
  }
  const cuts = (await listCuts(projectId)).map(entryOf);
  entries.push({ name: names.cuts, data: encoder.encode(cutsFile(names.file, cuts)) });
  return zipStored(entries);
}

/** The zip's own name: `Boca drafts and cuts.zip`. */
export const exportName = (names: BesideNames): string => `${names.work} drafts and cuts.zip`;
