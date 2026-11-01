// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { history, undo } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { draftFrom, draftText, freezeDraft, listDrafts } from '../app/drafts/store';
import { createDrafts, type DraftsDeps } from '../app/drafts/use-drafts';
import { replaceText } from '../app/editor/replace-text';
import { db } from '../app/storage/db';
import { hashText } from '../app/storage/hash';
import { createProject } from '../app/storage/projects';

// The drafts session (drafts-and-cuts design §2): Start new draft freezes the editor's text as the
// draft being written and moves to the next number; Restore as a new draft freezes first, then puts
// the draft's text in as one change one undo takes back, and the new draft remembers where it came
// from; Read opens a draft read-only.

const ONE = 'INT. HALL - DAY\n\nMarra waits.\n';
const TWO = 'INT. HALL - DAY\n\nMarra runs.\n';

const views: EditorView[] = [];
beforeEach(async () => {
  // jsdom's Blob has no stream(), so these drafts are kept as plain text (drafts-store.test.ts
  // checks the gzip).
  vi.stubGlobal('CompressionStream', undefined);
  await Promise.all(db.tables.map((table) => table.clear()));
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const view of views.splice(0)) view.destroy();
});

async function setup(text = ONE, options: { readOnly?: string; notKept?: string } = {}) {
  const p = await createProject({ source: text });
  const view = new EditorView({
    state: EditorState.create({ doc: text, extensions: [history()] }),
    parent: document.body,
  });
  views.push(view);
  const said: string[] = [];
  const events: string[] = [];
  const deps: DraftsDeps = {
    projectId: () => p.id,
    text: () => view.state.doc.toString(),
    readOnly: () => options.readOnly ?? null,
    notKept: () => options.notKept ?? null,
    replace: (target) => replaceText(view, target),
    before: () => events.push('before-restore'),
    replaced: () => events.push('replaced'),
    say: (message) => said.push(message),
    showReader: () => events.push('reader'),
  };
  const drafts = createDrafts(deps);
  await drafts.load();
  const type = (insert: string) =>
    view.dispatch({ changes: { from: view.state.doc.length, insert }, userEvent: 'input.type' });
  return { p, view, said, events, drafts, type };
}

describe('the drafts session', () => {
  test('a script with no drafts is in Draft 1', async () => {
    const { drafts } = await setup();
    expect(drafts.current.value).toBe(1);
    expect(drafts.rows.value).toEqual([]);
  });

  test('start freezes the current text and moves to the next number', async () => {
    const { p, drafts, said, type } = await setup();
    expect(await drafts.start('sent to Sam')).toBe(true);
    expect(drafts.current.value).toBe(2);
    expect(drafts.rows.value.map((row) => [row.n, row.note])).toEqual([[1, 'sent to Sam']]);
    expect(drafts.rows.value[0]?.id).toBe(await hashText(ONE));
    expect(said.at(-1)).toBe('Draft 1 is kept. You’re writing Draft 2 now.');
    type('More.\n');
    const version = drafts.version.value;
    expect(await drafts.start('')).toBe(true);
    expect(drafts.version.value).toBeGreaterThan(version);
    expect(drafts.current.value).toBe(3);
    expect(await draftText(p.id, 2)).toBe(`${ONE}More.\n`);
  });

  test('the same text asks before a new number', async () => {
    const { drafts, type } = await setup();
    expect(await drafts.sameAs()).toBeNull();
    await drafts.start('');
    expect((await drafts.sameAs())?.n).toBe(1);
    type('x');
    expect(await drafts.sameAs()).toBeNull();
  });

  test('restore freezes first, replaces as one undo, and records from', async () => {
    const { p, view, drafts, events, said, type } = await setup();
    await drafts.start('first');
    const one = drafts.rows.value[0];
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: TWO } });
    type('Then stops.\n');
    const now = view.state.doc.toString();
    expect(await drafts.restore(1)).toBe(true);
    // The text as it was is Draft 2, noted; the editor has Draft 1's text in Draft 3.
    const rows = await listDrafts(p.id);
    expect(rows.map((row) => [row.n, row.note])).toEqual([
      [2, 'before restoring Draft 1'],
      [1, 'first'],
    ]);
    expect(await draftText(p.id, 2)).toBe(now);
    expect(view.state.doc.toString()).toBe(ONE);
    expect(drafts.current.value).toBe(3);
    expect(drafts.from.value).toEqual({ n: 1, id: one?.id });
    expect(await draftFrom(p.id)).toEqual({ n: 1, id: one?.id });
    expect(events).toEqual(['before-restore', 'replaced']);
    expect(said.at(-1)).toBe('Draft 1’s text is now Draft 3. Undo brings back what it replaced.');
    // The next draft frozen records where it came from.
    await drafts.start('');
    expect(drafts.rows.value[0]).toMatchObject({ n: 3, from: { n: 1, id: one?.id } });
    expect(drafts.from.value).toBeNull();
  });

  test('restore then undo gives the old text back', async () => {
    const { view, drafts, type } = await setup();
    await drafts.start('');
    type('A new line.\n');
    const now = view.state.doc.toString();
    await drafts.restore(1);
    expect(view.state.doc.toString()).toBe(ONE);
    undo(view);
    expect(view.state.doc.toString()).toBe(now);
  });

  test('restore of a text the same as the last draft freezes nothing more', async () => {
    const { p, view, drafts, type } = await setup();
    await drafts.start('');
    type('x\n');
    await drafts.start('');
    // The text is Draft 2's: it is safe already, so no third draft is frozen.
    expect(await drafts.restore(1)).toBe(true);
    expect((await listDrafts(p.id)).map((row) => row.n)).toEqual([2, 1]);
    expect(drafts.current.value).toBe(3);
    expect(view.state.doc.toString()).toBe(ONE);
  });

  test('restore says why and changes nothing in a read-only tab, or when the freeze fails', async () => {
    const ro = await setup(ONE, { readOnly: 'This script is open for editing in another tab.' });
    await freezeDraft(ro.p.id, TWO, '');
    await ro.drafts.load();
    expect(await ro.drafts.restore(1)).toBe(false);
    expect(ro.view.state.doc.toString()).toBe(ONE);
    expect(ro.said.at(-1)).toBe('This script is open for editing in another tab.');

    const { p, view, drafts, said, events } = await setup();
    await freezeDraft(p.id, TWO, '');
    await drafts.load();
    const add = db.drafts.add.bind(db.drafts);
    db.drafts.add = () =>
      Promise.reject(Object.assign(new Error(), { name: 'QuotaExceededError' }));
    try {
      expect(await drafts.restore(1)).toBe(false);
    } finally {
      db.drafts.add = add;
    }
    expect(view.state.doc.toString()).toBe(ONE);
    expect(said.at(-1)).toMatch(/storage is full/);
    expect(events).not.toContain('replaced');
    expect((await listDrafts(p.id)).map((row) => row.n)).toEqual([1]);
  });

  test('a draft that can’t be read restores nothing', async () => {
    const { drafts, said, view } = await setup();
    expect(await drafts.restore(4)).toBe(false);
    expect(view.state.doc.toString()).toBe(ONE);
    expect(said.at(-1)).toBe('That draft can’t be read, so nothing was changed.');
  });

  test('start says why when drafts aren’t kept here', async () => {
    const { drafts, said } = await setup(ONE, { notKept: 'Not for a sample.' });
    expect(await drafts.start('')).toBe(false);
    expect(said.at(-1)).toBe('Not for a sample.');
    expect(drafts.rows.value).toEqual([]);
  });

  test('read opens the draft read-only', async () => {
    const { drafts, events, type } = await setup();
    await drafts.start('');
    type('x');
    await drafts.read(1);
    expect(drafts.reading.value).toMatchObject({ row: { n: 1 }, text: ONE });
    expect(events.at(-1)).toBe('reader');
    drafts.closeReader();
    expect(drafts.reading.value).toBeNull();
  });
});
