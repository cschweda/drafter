import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createCutRecorder } from '../app/cuts/recorder';
import { listCuts } from '../app/cuts/store';
import { storageDeps } from '../app/cuts/use-recorder';
import { freezeDraft } from '../app/drafts/store';
import { db } from '../app/storage/db';
import { createProject } from '../app/storage/projects';
import { takeSnapshot } from '../app/storage/snapshots';
import { foundCuts } from '../app/workers/cuts-compute';

// Recording cuts as they happen (drafts-and-cuts design §3.1): found between kept snapshots, with
// the draft being written; a whole-text replacement records nothing; the point survives a reload.

const scene = (heading: string, body: string) => `${heading}\n\n${body}\n`;
const HALL = scene(
  'INT. HALL - DAY',
  'Marra waits by the door, turning the brass key over in her hands.',
);
const CELLAR = scene(
  'INT. CELLAR - NIGHT',
  'A lamp swings from a hook and the shelves of jars tilt with it as Osken counts them.',
);
const YARD = scene(
  'EXT. COAL YARD - DAWN',
  'Two carts wait under a tarpaulin, their wheels chocked.',
);
const ROOF = scene(
  'EXT. ROOF - NIGHT',
  'Wind drags the washing lines across the wet slates of the roof.',
);
const script = (...scenes: string[]) => `Title: The Weir\n\n${scenes.join('\n')}`;

function recorder(find = vi.fn(foundCuts as never)) {
  const made = createCutRecorder({
    ...storageDeps(),
    find: async (before, after, kind) => (find as typeof foundCuts)(before, after, kind),
  });
  return { recorder: made, find };
}

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
});

/** Keeps a snapshot of `text` and tells the recorder, as the app's `keep` does. */
async function keep(
  r: ReturnType<typeof createCutRecorder>,
  id: string,
  text: string,
  reason: Parameters<typeof takeSnapshot>[2] = 'manual',
) {
  void r.kept(id, text, reason);
  await takeSnapshot(id, text, reason);
  await r.idle();
}

describe('the cuts recorder', () => {
  test('a scene deleted between two kept snapshots is recorded with the current draft', async () => {
    const { id } = await createProject({ source: script(HALL, CELLAR, YARD) });
    const { recorder: r } = recorder();
    await keep(r, id, script(HALL, CELLAR, YARD));
    expect(await listCuts(id)).toEqual([]);
    await freezeDraft(id, script(HALL, CELLAR, YARD), 'first');
    await freezeDraft(id, script(HALL, CELLAR, YARD, ROOF), 'second');
    await keep(r, id, script(HALL, YARD));
    const rows = await listCuts(id);
    expect(rows.map((row) => [row.title, row.cuts.map((c) => c.draft)])).toEqual([
      ['INT. CELLAR - NIGHT', [3]],
    ]);
    expect(rows[0]?.where).toMatchObject({ after: 'INT. HALL - DAY', within: null, ordinal: 2 });
  });

  test('text typed and taken out again between two snapshots is never a cut', async () => {
    const { id } = await createProject({ source: script(HALL, YARD) });
    const { recorder: r, find } = recorder();
    await keep(r, id, script(HALL, YARD));
    // A burst of edits (CELLAR typed, then cut) between snapshots: never kept, never compared.
    await keep(r, id, script(HALL, YARD));
    expect(find).toHaveBeenCalledTimes(0);
    expect(await listCuts(id)).toEqual([]);
  });

  test('opening, importing, reloading, restoring a snapshot, and restoring a draft record nothing', async () => {
    const { id } = await createProject({ source: script(HALL, CELLAR) });
    const { recorder: r } = recorder();
    await keep(r, id, script(HALL, CELLAR), 'opened');
    // A file opened (or imported) arrives whole: only the point moves.
    await keep(r, id, script(ROOF), 'opened');
    await keep(r, id, script(YARD), 'imported');
    // Restore, reload, Revert, a restored draft: the text before is kept (and compared: nothing
    // left it), then the text is replaced, and the replacement is not compared.
    for (const reason of ['before-restore', 'before-reload', 'before-revert'] as const) {
      await keep(r, id, script(YARD), reason);
      await r.replaced(id, script(HALL));
      await keep(r, id, script(HALL), 'timed');
      await r.replaced(id, script(YARD));
      await keep(r, id, script(YARD), 'timed');
    }
    expect(await listCuts(id)).toEqual([]);
  });

  test('what was cut just before a restore is kept', async () => {
    const { id } = await createProject({ source: script(HALL, CELLAR) });
    const { recorder: r } = recorder();
    await keep(r, id, script(HALL, CELLAR));
    await keep(r, id, script(HALL), 'before-restore');
    await r.replaced(id, script(ROOF));
    await keep(r, id, script(ROOF), 'saved');
    expect((await listCuts(id)).map((row) => row.title)).toEqual(['INT. CELLAR - NIGHT']);
  });

  test('a restore undone at once records nothing either', async () => {
    const { id } = await createProject({ source: script(HALL, CELLAR) });
    const { recorder: r } = recorder();
    await keep(r, id, script(HALL, CELLAR), 'before-restore');
    await r.replaced(id, script(YARD, ROOF));
    // One undo brings the old text back, and the writer cuts a scene from it.
    await keep(r, id, script(HALL), 'timed');
    expect((await listCuts(id)).map((row) => row.title)).toEqual(['INT. CELLAR - NIGHT']);
  });

  test('a Markdown section cut is recorded', async () => {
    const ferry =
      '## The ferry\n\nThe ferry leaves at six and nobody on board admits to knowing the pilot.\n';
    const pier = '## The pier\n\nGulls quarrel over a crate of fish that nobody will claim.\n';
    const doc = (...parts: string[]) => `# Boca\n\n${parts.join('\n')}`;
    const { id } = await createProject({ source: doc(ferry, pier), kind: 'markdown' });
    const { recorder: r } = recorder();
    await keep(r, id, doc(ferry, pier));
    await keep(r, id, doc(pier));
    const rows = await listCuts(id);
    expect(rows.map((row) => [row.title, row.kind, row.cuts[0]?.draft])).toEqual([
      ['The ferry', 'markdown', 1],
    ]);
  });

  test('the comparison point survives a reload', async () => {
    const { id } = await createProject({ source: script(HALL, CELLAR, YARD) });
    await keep(recorder().recorder, id, script(HALL, CELLAR, YARD));
    // A new visit: a recorder with nothing in memory reads the point back.
    const { recorder: again } = recorder();
    await keep(again, id, script(HALL, YARD));
    expect((await listCuts(id)).map((row) => row.title)).toEqual(['INT. CELLAR - NIGHT']);
  });

  test('after a replacement and a reload, the point is the replacement', async () => {
    const { id } = await createProject({ source: script(HALL) });
    const { recorder: r } = recorder();
    await keep(r, id, script(HALL, CELLAR), 'before-restore');
    await r.replaced(id, script(YARD, ROOF));
    // Reloaded before any snapshot of the restored text: it still isn't compared with the old.
    const { recorder: again } = recorder();
    await keep(again, id, script(YARD), 'timed');
    expect((await listCuts(id)).map((row) => row.title)).toEqual(['EXT. ROOF - NIGHT']);
  });

  test('a point that can’t be found again records nothing, and moves on', async () => {
    const { id } = await createProject({ source: 'INT. A - DAY\n\nSomething else entirely.\n' });
    await db.settings.put({ key: `cuts-point:${id}`, value: { hash: 'f'.repeat(64) } });
    const { recorder: r } = recorder();
    await keep(r, id, script(HALL, CELLAR));
    await keep(r, id, script(HALL));
    expect((await listCuts(id)).map((row) => row.title)).toEqual(['INT. CELLAR - NIGHT']);
  });

  test('a failed comparison leaves the point, so the next snapshot finds the cut', async () => {
    const { id } = await createProject({ source: script(HALL, CELLAR) });
    let fail = false;
    const r = createCutRecorder({
      ...storageDeps(),
      find: async (before, after, kind) => {
        if (fail) throw new Error('The history worker stopped.');
        return foundCuts(before, after, kind);
      },
    });
    await keep(r, id, script(HALL, CELLAR));
    fail = true;
    await keep(r, id, script(HALL, YARD));
    fail = false;
    await keep(r, id, script(HALL, YARD, ROOF));
    expect((await listCuts(id)).map((row) => row.title)).toEqual(['INT. CELLAR - NIGHT']);
  });
});
