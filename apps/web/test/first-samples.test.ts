// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import { history, undo } from '@codemirror/commands';
import type { EditorState as State } from '@codemirror/state';
import { parse } from '@drafter/fountain';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// The first New of each kind opens with that kind's annotated sample, as the writer's own document,
// with Start blank; every later New of the kind is the usual blank one (decided 2026-10-27).

vi.mock('../app/editor/samples', () => {
  const screenplay =
    'Title: The Call\nAuthor: A. Writer\n\n# Act One\n\nINT. KITCHEN - NIGHT\n\nA phone rings.\n';
  const stagePlay = 'Title: The Call\n\n## Scene 1\n\nA kitchen.\n';
  const markdown = '# Writing in Markdown\n\nA sample.\n';
  return {
    SAMPLE_SCREENPLAY: screenplay,
    SAMPLE_STAGE_PLAY: stagePlay,
    SAMPLE_MARKDOWN: markdown,
    SAMPLE_TEXT: { screenplay, 'stage-play': stagePlay, markdown },
  };
});
vi.mock('../app/editor/session', async () => {
  const { EditorState } = await import('@codemirror/state');
  const { shallowRef } = await import('vue');
  const { SAMPLE_SCREENPLAY } = await import('../app/editor/samples');
  // With an undo history, so Start blank's one step can be undone.
  const make = (text: string) => EditorState.create({ doc: text, extensions: [history()] });
  let state = make(SAMPLE_SCREENPLAY);
  const listeners = new Set<(state: State) => void>();
  const doc = shallowRef(parse(state.doc.toString()));
  const view = {
    get state() {
      return state;
    },
    dispatch(spec: Parameters<State['update']>[0] | ReturnType<State['update']>) {
      state = ('startState' in spec ? spec : state.update(spec)).state;
      doc.value = parse(state.doc.toString());
      for (const l of listeners) l(state);
    },
    focus() {},
  };
  const session = {
    view,
    doc,
    kind: shallowRef<'fountain' | 'markdown'>('fountain'),
    load(text: string) {
      state = make(text);
      doc.value = parse(text);
      for (const l of listeners) l(state);
    },
    setKind() {},
    setReadOnly() {},
    reset() {
      listeners.clear();
      session.load(SAMPLE_SCREENPLAY);
    },
    onState(listener: (state: State) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    goto() {},
  };
  return { useEditor: () => session };
});

/** A session over the database as it is: `keep` leaves the stored scripts and settings alone (a later visit). */
async function visit(
  options: { keep?: boolean; breakDb?: (db: typeof import('../app/storage/db').db) => void } = {},
) {
  vi.resetModules();
  vi.stubGlobal('crypto', webcrypto);
  const { db } = await import('../app/storage/db');
  if (!options.keep) await Promise.all(db.tables.map((table) => table.clear()));
  const { useEditor } = await import('../app/editor/session');
  (useEditor() as unknown as { reset(): void }).reset();
  options.breakDb?.(db);
  const script = await import('../app/storage/script');
  const samples = await import('../app/editor/samples');
  const session = script.useScript();
  await vi.waitFor(() => expect(session.ready.value).toBe(true));
  const editor = useEditor();
  return {
    ...script,
    ...samples,
    session,
    editor,
    db,
    text: () => editor.view.state.doc.toString(),
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the first New of a kind', () => {
  test('a first stage play opens with the stage-play sample, as the writer’s own; the second is blank', async () => {
    const t = await visit();
    await t.session.newScript('stage-play');
    expect(t.text()).toBe(t.SAMPLE_STAGE_PLAY);
    const first = t.session.project.value;
    // The writer's own document, not the shared sample record, and not changed until it is.
    expect(first?.sample).toBeUndefined();
    expect(first?.blank?.text).toMatch(/^Title: Untitled Play\n/);
    expect(t.session.dirty.value).toBe(false);
    expect(t.session.canStartBlank.value).toBe(true);

    await t.session.newScript('stage-play');
    expect(t.text()).toMatch(/^Title: Untitled Play\n/);
    expect(t.session.project.value?.id).not.toBe(first?.id);
    expect(t.session.project.value?.blank).toBeUndefined();
    expect(t.session.canStartBlank.value).toBe(false);
  });

  test('Start blank empties it to the new-document text as one change, which one Undo reverses', async () => {
    const t = await visit();
    await t.session.newScript('stage-play');
    const before = t.text();

    const spy = vi.spyOn(t.editor.view, 'dispatch');
    const state = t.editor.view.state;
    expect(t.session.startBlank()).toBe(true);
    // Drafter's change, not the writer's: no writing time for it.
    const { writersEdit } = await import('../app/stats/writing');
    expect(writersEdit(state.update(spy.mock.calls[0]?.[0] as never))).toBe(false);
    expect(t.text()).toMatch(/^Title: Untitled Play\nCredit: Written by\n/);
    expect(t.text()).toContain('"template":"stage-play-standard"');
    // The blank document is the one it is measured from now, and the bar's offer is spent.
    expect(t.session.dirty.value).toBe(false);
    expect(t.session.canStartBlank.value).toBe(false);
    expect(t.session.project.value?.blank).toBeUndefined();

    undo(t.editor.view as never);
    expect(t.text()).toBe(before);
    // A second Start blank has nothing to offer.
    expect(t.session.startBlank()).toBe(false);
  });

  test('is offered only on the untouched sample: an edit ends it for good', async () => {
    const t = await visit();
    await t.session.newScript('stage-play');
    t.editor.view.dispatch({ changes: { from: 0, insert: 'MY PLAY ' }, userEvent: 'input.type' });
    // At once: Start blank would wipe what the writer wrote.
    expect(t.session.canStartBlank.value).toBe(false);
    expect(t.session.startBlank()).toBe(false);
    expect(t.text().startsWith('MY PLAY ')).toBe(true);
    // And for good, once the recovery copy has the edit: undoing it doesn't bring the offer back.
    await t.session.flush();
    const id = t.session.project.value?.id ?? '';
    expect((await t.db.projects.get(id))?.blank).toBeUndefined();
    expect(t.session.project.value?.blank).toBeUndefined();
    undo(t.editor.view as never);
    expect(t.text()).toBe(t.SAMPLE_STAGE_PLAY);
    expect(t.session.canStartBlank.value).toBe(false);

    const later = await visit({ keep: true });
    expect(later.session.project.value?.id).toBe(id);
    expect(later.session.canStartBlank.value).toBe(false);
  });

  test('a change of kind ends the offer', async () => {
    const t = await visit();
    await t.session.newScript('stage-play');
    await t.session.setKind('markdown');
    expect(t.session.project.value?.blank).toBeUndefined();
    expect(t.session.canStartBlank.value).toBe(false);
    const id = t.session.project.value?.id ?? '';
    expect((await t.db.projects.get(id))?.blank).toBeUndefined();
  });

  test('forgetBlank ends the offer, and says so if it can’t be kept', async () => {
    const t = await visit();
    await t.session.newScript('stage-play');
    vi.spyOn(t.db.projects, 'put').mockRejectedValue(new Error('QuotaExceededError'));
    t.session.forgetBlank();
    expect(t.session.canStartBlank.value).toBe(false);
    await vi.waitFor(() => expect(t.blankError.value).not.toBe(''));
  });

  test('the first visit remembers that it showed the screenplay sample', async () => {
    const t = await visit();
    await vi.waitFor(async () =>
      expect(await t.db.settings.get('sample-seen:screenplay')).toEqual({
        key: 'sample-seen:screenplay',
        value: true,
      }),
    );
  });

  test('a first Markdown document opens with the Markdown sample; the second is blank', async () => {
    const t = await visit();
    await t.session.newScript('markdown');
    expect(t.text()).toBe(t.SAMPLE_MARKDOWN);
    expect(t.session.project.value?.kind).toBe('markdown');
    expect(t.session.project.value?.title).toBe('Writing in Markdown');
    expect(t.session.startBlank()).toBe(true);
    expect(t.text()).toBe('# Untitled\n\n');

    await t.session.newScript('markdown');
    expect(t.text()).toBe('# Untitled\n\n');
  });

  test('a first screenplay is blank when the first visit already showed the screenplay sample', async () => {
    const t = await visit();
    expect(t.session.project.value?.sample).toBe('screenplay');
    await t.session.newScript('screenplay');
    expect(t.text()).toMatch(/^Title: Untitled Screenplay\n/);
    expect(t.session.canStartBlank.value).toBe(false);
  });

  test('“seen” is kept in the settings table, so a later visit starts blank', async () => {
    const first = await visit();
    await first.session.newScript('stage-play');
    await first.session.newScript('markdown');
    expect(await first.db.settings.get('sample-seen:stage-play')).toEqual({
      key: 'sample-seen:stage-play',
      value: true,
    });
    // Only the rows say so: the documents made from the samples are gone.
    await first.db.projects.clear();

    const later = await visit({ keep: true });
    await later.session.newScript('stage-play');
    expect(later.text()).toMatch(/^Title: Untitled Play\n/);
    await later.session.newScript('markdown');
    expect(later.text()).toBe('# Untitled\n\n');
  });

  test('a damaged row is not “seen”', async () => {
    const t = await visit();
    await t.db.settings.put({ key: 'sample-seen:stage-play', value: 'yes' });
    await t.session.newScript('stage-play');
    expect(t.text()).toBe(t.SAMPLE_STAGE_PLAY);
  });

  test('a settings table that can’t be read starts blank, never forcing the sample', async () => {
    const t = await visit({
      breakDb: (db) => {
        vi.spyOn(db.settings, 'get').mockRejectedValue(new Error('IndexedDB is not available'));
      },
    });
    await t.session.newScript('stage-play');
    expect(t.text()).toMatch(/^Title: Untitled Play\n/);
  });

  test('a writer who opened a sample has met it: the first New of that kind is blank', async () => {
    const t = await visit();
    await t.session.openSample('markdown');
    await t.session.newScript('markdown');
    expect(t.text()).toBe('# Untitled\n\n');
  });
});

describe('Help’s sample scripts', () => {
  test('one opened as a new script is not a meeting with the annotated sample, nor the writer’s own of that kind', async () => {
    const t = await visit();
    const text =
      'Title: Sample: Stage play\n\n## Scene 1\n\nA bench.\n\n/* drafter\n{ "v": 1, "template": "stage-play-standard" }\n*/\n';
    const made = await t.session.addScript(text, {
      kind: 'fountain',
      baseline: text,
      sampleScript: 'stage-play',
    });
    await t.session.open(made.id);
    expect(t.text()).toBe(text);
    expect(t.session.project.value?.sampleScript).toBe('stage-play');
    expect(t.session.project.value?.sample).toBeUndefined();
    // Opened unchanged, with no file.
    expect(t.session.dirty.value).toBe(false);
    await t.session.newScript('stage-play');
    expect(t.text()).toBe(t.SAMPLE_STAGE_PLAY);
  });
});

describe('the Markdown sample', () => {
  test('opens as a Markdown sample, and Reset sample puts it back', async () => {
    const t = await visit();
    await t.session.openSample('markdown');
    expect(t.session.project.value?.sample).toBe('markdown');
    expect(t.session.project.value?.kind).toBe('markdown');
    expect(t.text()).toBe(t.SAMPLE_MARKDOWN);
    t.editor.view.dispatch({ changes: { from: 0, insert: 'EDIT ' } });
    const spy = vi.spyOn(t.editor.view, 'dispatch');
    const state = t.editor.view.state;
    expect(t.session.resetSample()).toBe(true);
    expect(t.text()).toBe(t.SAMPLE_MARKDOWN);
    // Drafter's change, not the writer's.
    const { writersEdit } = await import('../app/stats/writing');
    expect(writersEdit(state.update(spy.mock.calls[0]?.[0] as never))).toBe(false);
    expect(t.editor.view.state.selection.main.head).toBe(0);
  });
});
