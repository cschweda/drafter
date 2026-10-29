// @vitest-environment jsdom
import type { ChangeSet } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { SpellMark } from '@drafter/cm-fountain';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { type ShallowRef, shallowRef } from 'vue';
import type { SpellRequest } from '../app/workers/spell-compute';

// The spellcheck as the app wires it (`useSpell`), over an editor that is a real view with the
// marks in it, a session that tells its change listeners as the real one does, settings that are
// read at once, and a worker the test answers.
// Made again before each test (`beforeEach`), so what an earlier test's session watches is never
// this test's: the mocks themselves are made once.
const editor = vi.hoisted(() => ({
  view: null as unknown as EditorView,
  listeners: new Set<(changes: ChangeSet | null) => void>(),
  kind: null as unknown as ShallowRef<'fountain' | 'markdown'>,
  loaded: null as unknown as ShallowRef<number>,
  ready: null as unknown as ShallowRef<boolean>,
  settings: null as unknown as ShallowRef<{
    spellcheck: boolean;
    spellLanguage: string;
    spellNotes: boolean;
    personalDictionary: string[];
  }>,
}));
vi.mock('../app/editor/session', () => ({
  useEditor: () => {
    const { listeners, kind, loaded } = editor;
    return {
      get view() {
        return editor.view;
      },
      kind,
      loaded,
      onChange: (listener: (changes: ChangeSet | null) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
  },
}));
vi.mock('../app/storage/script', () => ({
  useScript: () => ({ ready: editor.ready }),
}));
vi.mock('../app/settings/settings', async () => {
  const { shallowRef } = await import('vue');
  return {
    useSettings: () => ({
      settings: editor.settings,
      ready: Promise.resolve(),
      read: shallowRef(true),
    }),
  };
});
const checkSpy = vi.hoisted(() => vi.fn());
vi.mock('../app/spell/spell-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../app/spell/spell-client')>();
  return {
    ...actual,
    createSpellClient: (...args: Parameters<typeof actual.createSpellClient>) => {
      const client = actual.createSpellClient(...args);
      const check = client.check;
      client.check = (input) => {
        checkSpy(input);
        return check(input);
      };
      return client;
    },
  };
});

class FakeWorker {
  static made: FakeWorker[] = [];
  posted: SpellRequest[] = [];
  terminated = false;
  readonly listeners = new Map<string, Array<(event: unknown) => void>>();
  constructor(readonly url: URL) {
    FakeWorker.made.push(this);
  }
  postMessage(message: SpellRequest) {
    // What the real one does: a value it can't clone (a Vue proxy) throws.
    this.posted.push(structuredClone(message));
  }
  addEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  terminate() {
    this.terminated = true;
  }
  reply(data: unknown) {
    for (const listener of this.listeners.get('message') ?? []) listener({ data });
  }
  checks() {
    return this.posted.filter(
      (p): p is Extract<SpellRequest, { type: 'check' }> => p.type === 'check',
    );
  }
}

const TEXT = 'INT. KITCHEN - NIGHT\n\nMargaret waits by the phnoe.\n\nShe wuold call.\n';
const marksIn = (text: string, ...words: string[]): SpellMark[] =>
  words.map((word) => ({ from: text.indexOf(word), to: text.indexOf(word) + word.length, word }));

// The editor package as the app's modules import it after `resetModules`: a state field from an
// earlier copy would be another field.
let cm: typeof import('@drafter/cm-fountain');
const spellMarksOf = (state: EditorState) => cm.spellMarksOf(state);

function makeState(doc: string) {
  return EditorState.create({
    doc,
    extensions: [
      cm.spellMarks(),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) for (const listener of editor.listeners) listener(update.changes);
      }),
    ],
  });
}

async function modules() {
  const { useEditor } = await import('../app/editor/session');
  const { useSettings } = await import('../app/settings/settings');
  const { useSpell } = await import('../app/spell/use-spell');
  const session = useEditor() as unknown as {
    kind: { value: string };
    loaded: { value: number };
  };
  const settings = useSettings().settings as unknown as {
    value: {
      spellcheck: boolean;
      spellLanguage: string;
      spellNotes: boolean;
      personalDictionary: string[];
    };
  };
  return { session, settings, useSpell };
}

/** A script loaded into the editor, as `load` does it. */
async function load(text: string) {
  const { session } = await modules();
  editor.view.setState(makeState(text));
  session.loaded.value++;
  for (const listener of editor.listeners) listener(null);
  // The first one opened makes the script session ready.
  editor.ready.value = true;
}

/** Lets the settings' `ready`, Vue's watchers, and the client's timer run. */
async function settle(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(async () => {
  vi.resetModules();
  cm = await import('@drafter/cm-fountain');
  vi.useFakeTimers();
  FakeWorker.made = [];
  checkSpy.mockClear();
  editor.listeners = new Set();
  editor.kind = shallowRef('fountain');
  editor.loaded = shallowRef(0);
  editor.ready = shallowRef(false);
  editor.settings = shallowRef({
    spellcheck: true,
    spellLanguage: 'en-US',
    spellNotes: false,
    personalDictionary: [],
  });
  editor.view = new EditorView({ state: makeState(TEXT), parent: document.body });
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => {
  editor.view.destroy();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useSpell', () => {
  test('maps a late reply through the edits since', async () => {
    const { useSpell } = await modules();
    const spell = useSpell();
    await load(TEXT);
    await settle(300);
    const [worker] = FakeWorker.made;
    if (!worker) throw new Error('no worker');
    expect(worker.url.pathname).toMatch(/spell\.worker\.ts$/);
    expect(worker.posted[0]).toEqual({ type: 'language', language: 'en-US' });
    const [request] = worker.checks();
    expect(request?.source).toBe(TEXT);
    worker.reply({ type: 'ready', language: 'en-US' });
    expect(spell.state.value).toBe('ready');

    // While the worker checks, the writer types above both words and between them.
    editor.view.dispatch({ changes: { from: 0, insert: 'FADE IN:\n\n' } });
    const between = editor.view.state.doc.toString().indexOf('She');
    editor.view.dispatch({ changes: { from: between, insert: 'Then ' } });
    worker.reply({ type: 'checked', seq: request?.seq, marks: marksIn(TEXT, 'phnoe', 'wuold') });

    const state = editor.view.state;
    const marks = spellMarksOf(state);
    expect(marks.map((m) => m.word)).toEqual(['phnoe', 'wuold']);
    for (const mark of marks) expect(state.sliceDoc(mark.from, mark.to)).toBe(mark.word);

    // The pause after the typing sends the text as it is now.
    await settle(300);
    expect(worker.checks().at(-1)?.source).toBe(state.doc.toString());
  });

  test('clears the marks on a new script and ignores the old script’s reply', async () => {
    const { useSpell } = await modules();
    useSpell();
    await load(TEXT);
    await settle(300);
    const worker = FakeWorker.made[0] as FakeWorker;
    const first = worker.checks()[0];
    worker.reply({ type: 'checked', seq: first?.seq, marks: marksIn(TEXT, 'phnoe') });
    expect(spellMarksOf(editor.view.state)).toHaveLength(1);

    // A check is under way when another script is opened.
    editor.view.dispatch({ changes: { from: TEXT.length, insert: 'More.\n' } });
    await settle(300);
    const stale = worker.checks().at(-1);
    const other = 'EXT. YARD - DAY\n\nThe dgo barks.\n';
    await load(other);
    expect(spellMarksOf(editor.view.state)).toEqual([]);
    worker.reply({ type: 'checked', seq: stale?.seq, marks: marksIn(TEXT, 'phnoe') });
    expect(spellMarksOf(editor.view.state)).toEqual([]);
    // The new script is checked, and its reply is shown.
    await settle(300);
    const fresh = worker.checks().at(-1);
    expect(fresh?.source).toBe(other);
    worker.reply({ type: 'checked', seq: fresh?.seq, marks: marksIn(other, 'dgo') });
    expect(spellMarksOf(editor.view.state).map((m) => m.word)).toEqual(['dgo']);
    // Still one worker.
    expect(FakeWorker.made).toHaveLength(1);
  });

  test('makes no worker while spellcheck is off', async () => {
    const { settings, useSpell } = await modules();
    settings.value = { ...settings.value, spellcheck: false };
    const spell = useSpell();
    await load(TEXT);
    await settle(1000);
    expect(FakeWorker.made).toEqual([]);
    expect(spell.state.value).toBe('off');
    // Turned on, it starts; turned off again, the worker ends.
    settings.value = { ...settings.value, spellcheck: true };
    await settle(300);
    expect(FakeWorker.made).toHaveLength(1);
    expect(FakeWorker.made[0]?.checks()).toHaveLength(1);
    settings.value = { ...settings.value, spellcheck: false };
    await settle();
    expect(FakeWorker.made[0]?.terminated).toBe(true);
    expect(spell.state.value).toBe('off');
  });

  test('makes no worker before the first script', async () => {
    const { useSpell } = await modules();
    useSpell();
    await settle(1000);
    expect(FakeWorker.made).toEqual([]);
    // A first visit: the sample already in the editor is the first script, with no load.
    editor.ready.value = true;
    await settle();
    expect(FakeWorker.made).toHaveLength(1);
    expect(FakeWorker.made[0]?.checks().map((c) => c.source)).toEqual([TEXT]);
  });

  test('a keystroke does no spell work until the pause', async () => {
    const { useSpell } = await modules();
    useSpell();
    await load(TEXT);
    await settle(300);
    const worker = FakeWorker.made[0] as FakeWorker;
    const calls = checkSpy.mock.calls.length;
    for (const letter of 'abc') {
      editor.view.dispatch({ changes: { from: 0, insert: letter } });
      expect(checkSpy.mock.calls.length).toBe(calls);
      await settle(100);
    }
    expect(checkSpy.mock.calls.length).toBe(calls);
    await settle(300);
    expect(checkSpy.mock.calls.length).toBe(calls + 1);
    expect(worker.checks().at(-1)?.source).toBe(`cba${TEXT}`);
  });

  test('a change of language, of kind, or of My dictionary checks again', async () => {
    const { session, settings, useSpell } = await modules();
    useSpell();
    await load(TEXT);
    await settle(300);
    const worker = FakeWorker.made[0] as FakeWorker;
    const first = worker.checks()[0];
    worker.reply({ type: 'checked', seq: first?.seq, marks: marksIn(TEXT, 'phnoe') });

    settings.value = { ...settings.value, spellLanguage: 'en-GB' };
    await settle(300);
    expect(worker.posted.filter((p) => p.type === 'language').at(-1)).toEqual({
      type: 'language',
      language: 'en-GB',
    });
    // The other language's marks are not this one's.
    expect(spellMarksOf(editor.view.state)).toEqual([]);
    expect(worker.checks()).toHaveLength(2);

    settings.value = { ...settings.value, personalDictionary: ['phnoe'] };
    await settle(300);
    expect(worker.checks().at(-1)?.mine).toEqual(['phnoe']);

    settings.value = { ...settings.value, spellNotes: true };
    await settle(300);
    expect(worker.checks().at(-1)?.notes).toBe(true);

    session.kind.value = 'markdown';
    await settle(300);
    expect(worker.checks().at(-1)?.kind).toBe('markdown');
    expect(worker.checks()).toHaveLength(5);
  });

  test('a failed load is said once, marks nothing, and the next script tries again', async () => {
    const { useSpell } = await modules();
    const spell = useSpell();
    await load(TEXT);
    await settle(300);
    const worker = FakeWorker.made[0] as FakeWorker;
    worker.reply({ type: 'failed', message: 'offline' });
    expect(spell.state.value).toBe('failed');
    expect(spell.problem.value).toMatch(/dictionary/);
    // Typing sends nothing more until another script is opened.
    const sent = worker.checks().length;
    editor.view.dispatch({ changes: { from: 0, insert: 'x' } });
    await settle(1000);
    expect(worker.checks()).toHaveLength(sent);
    await load(TEXT);
    await settle(300);
    expect(worker.checks()).toHaveLength(sent + 1);
    const again = worker.checks().at(-1);
    worker.reply({ type: 'checked', seq: again?.seq, marks: [] });
    expect(spell.state.value).toBe('ready');
    expect(spell.problem.value).toBe('');
    // A second failure in the visit isn't said again.
    worker.reply({ type: 'failed', message: 'offline' });
    expect(spell.state.value).toBe('failed');
    expect(spell.problem.value).toBe('');
  });
});
