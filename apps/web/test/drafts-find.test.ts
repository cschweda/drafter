import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test } from 'vitest';
import { findDrafts } from '../app/drafts/find';
import { freezeDraft } from '../app/drafts/store';
import { db } from '../app/storage/db';
import { createProject } from '../app/storage/projects';

// What the palette finds for a draft: by 4+ hex characters of its ID, in any script that is still
// here (named when it isn't the one open), and by its number in the open script.

const A = 'INT. HALL - DAY\n\nMarra waits.\n';
const B = 'INT. YARD - NIGHT\n\nRain.\n';

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

async function frozen(projectId: string, text: string) {
  const out = await freezeDraft(projectId, text, '');
  if (out.result !== 'frozen') throw new Error(out.why);
  return out.row;
}

describe('finding drafts for the palette', () => {
  test('finds a draft of another script by its ID, with that script’s title', async () => {
    const open = await createProject({ source: 'Title: Open\n' });
    const other = await createProject({ source: 'Title: The Weir\n' });
    const row = await frozen(other.id, B);
    const hits = await findDrafts(row.id.slice(0, 6), open.id);
    expect(hits).toEqual([{ projectId: other.id, row, title: 'The Weir' }]);
    // In the open script, no title.
    const mine = await frozen(open.id, A);
    expect(await findDrafts(mine.id.slice(0, 6), open.id)).toEqual([
      { projectId: open.id, row: mine },
    ]);
  });

  test('never offers a draft whose script is gone', async () => {
    const open = await createProject({ source: 'Title: Open\n' });
    const row = await frozen(open.id, A);
    // A row left behind with no script (as a script removed before drafts existed could leave).
    await db.drafts.put({ ...row, key: 'gone:1', projectId: 'gone' });
    const hits = await findDrafts(row.id.slice(0, 8), open.id);
    expect(hits.map((hit) => hit.projectId)).toEqual([open.id]);
  });

  test('a number finds the open script’s draft: 2, 02, draft 2, Draft 02', async () => {
    const open = await createProject({ source: 'Title: Open\n' });
    const other = await createProject({ source: 'Title: Other\n' });
    await frozen(open.id, A);
    const two = await frozen(open.id, B);
    await frozen(other.id, A);
    await frozen(other.id, B);
    for (const typed of ['2', '02', 'draft 2', 'Draft 02'])
      expect(await findDrafts(typed, open.id), typed).toEqual([{ projectId: open.id, row: two }]);
    expect(await findDrafts('3', open.id)).toEqual([]);
    expect(await findDrafts('2', null)).toEqual([]);
    expect(await findDrafts('abc', open.id)).toEqual([]);
  });
});
