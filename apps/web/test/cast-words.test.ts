// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { SpellLanguage } from '@drafter/spell';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { type ShallowRef, shallowRef } from 'vue';
import { createSpellWorker, type SpellRequest } from '../app/workers/spell-compute';
import { FILES } from './dictionary-files';

// The dictionary's answer for the cast (seeing-the-script design §3.3, Calls 6 and 7): which names
// are ordinary words, asked of the spell worker through `useSpell`, kept for the visit by language
// and name. The editor, the script, and the settings are stand-ins; the worker runs the real
// worker code with the real dictionaries, answering on a later turn as a worker does.
const env = vi.hoisted(() => ({
  view: null as unknown as EditorView,
  ready: null as unknown as ShallowRef<boolean>,
  settings: null as unknown as ShallowRef<{
    spellcheck: boolean;
    spellLanguage: SpellLanguage;
    spellNotes: boolean;
    personalDictionary: string[];
  }>,
}));
vi.mock('../app/editor/session', async () => {
  const { shallowRef } = await import('vue');
  const kind = shallowRef('fountain');
  const loaded = shallowRef(0);
  return {
    useEditor: () => ({
      get view() {
        return env.view;
      },
      kind,
      loaded,
      onChange: () => () => {},
    }),
  };
});
vi.mock('../app/storage/script', () => ({ useScript: () => ({ ready: env.ready }) }));
vi.mock('../app/settings/settings', () => ({
  useSettings: () => ({ settings: env.settings, ready: Promise.resolve() }),
}));

/** Loads every language unless told to fail. */
const loads = vi.hoisted(() => ({ fail: false, count: [] as SpellLanguage[] }));

class FakeWorker {
  static made: FakeWorker[] = [];
  posted: SpellRequest[] = [];
  terminated = false;
  readonly listeners = new Map<string, Array<(event: unknown) => void>>();
  readonly worker = createSpellWorker(async (language) => {
    loads.count.push(language);
    if (loads.fail) throw new Error('offline');
    return FILES[language];
  });
  constructor(readonly url: URL) {
    FakeWorker.made.push(this);
  }
  postMessage(message: SpellRequest) {
    const copy = structuredClone(message);
    this.posted.push(copy);
    void this.worker.handle(copy).then((reply) => {
      if (reply && !this.terminated) {
        for (const listener of this.listeners.get('message') ?? []) listener({ data: reply });
      }
    });
  }
  addEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  terminate() {
    this.terminated = true;
  }
  asked() {
    return this.posted.filter((p) => p.type === 'words');
  }
}

async function modules() {
  const { useWordAnswers } = await import('../app/cast/words');
  return { answers: useWordAnswers() };
}

/** Lets the settings' `ready`, the watchers, and the worker's replies run. */
async function settle() {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

const NAMES = ['WILL', 'Hope', 'THE DRIVER', 'ANN LEE', 'MARGARET'];

beforeEach(async () => {
  vi.resetModules();
  const cm = await import('@drafter/cm-fountain');
  FakeWorker.made = [];
  loads.fail = false;
  loads.count = [];
  env.ready = shallowRef(true);
  env.settings = shallowRef({
    spellcheck: true,
    spellLanguage: 'en-US',
    spellNotes: false,
    personalDictionary: [],
  });
  env.view = new EditorView({
    state: EditorState.create({ doc: 'INT. ROOM - DAY\n', extensions: [cm.spellMarks()] }),
    parent: document.body,
  });
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => {
  env.view.destroy();
  vi.unstubAllGlobals();
});

describe('the dictionary’s answer', () => {
  test('the worker answers names whose every word is a dictionary word', async () => {
    const { answers } = await modules();
    await settle();
    answers.ask(NAMES);
    await settle();
    expect(NAMES.map(answers.isWord)).toEqual([true, true, true, false, false]);
    // Names that differ only in case are one answer, and nothing is asked twice.
    expect(answers.isWord('THE Driver')).toBe(true);
    answers.ask(['will', ...NAMES]);
    await settle();
    // Spellcheck is on: its own worker answers, and no other is made.
    expect(FakeWorker.made).toHaveLength(1);
    expect(FakeWorker.made[0]?.asked()).toEqual([
      {
        type: 'words',
        seq: expect.any(Number),
        names: NAMES.map((n) => n.toUpperCase()),
        language: 'en-US',
      },
    ]);
    expect(answers.version.value).toBe(1);
  });

  test('it loads the dictionary for words even with spellcheck off', async () => {
    env.settings.value = { ...env.settings.value, spellcheck: false };
    const { answers } = await modules();
    await settle();
    expect(FakeWorker.made).toEqual([]);
    answers.ask(NAMES);
    await settle();
    expect(FakeWorker.made).toHaveLength(1);
    expect(loads.count).toEqual(['en-US']);
    expect(answers.isWord('WILL')).toBe(true);
    expect(answers.isWord('MARGARET')).toBe(false);
    // It checks nothing: only the words question.
    expect(FakeWorker.made[0]?.posted.map((p) => p.type)).toEqual(['words']);
    // Spellcheck turned on: its worker takes over, and the one for words alone ends.
    env.settings.value = { ...env.settings.value, spellcheck: true };
    await settle();
    expect(FakeWorker.made).toHaveLength(2);
    expect(FakeWorker.made[0]?.terminated).toBe(true);
    answers.ask(['TOM']);
    await settle();
    expect(FakeWorker.made[1]?.asked()).toHaveLength(1);
    expect(answers.isWord('TOM')).toBe(true);
  });

  test('before the answer every name reads as a word', async () => {
    const { answers } = await modules();
    await settle();
    expect(answers.isWord('MARGARET')).toBeUndefined();
    answers.ask(['MARGARET']);
    // Asked, not answered yet.
    expect(answers.isWord('MARGARET')).toBeUndefined();
    expect(answers.version.value).toBe(0);
    await settle();
    expect(answers.isWord('MARGARET')).toBe(false);
    expect(answers.version.value).toBe(1);
  });

  test('answers are kept per language', async () => {
    const { answers } = await modules();
    await settle();
    answers.ask(['COLOUR']);
    await settle();
    expect(answers.isWord('COLOUR')).toBe(false);
    const before = answers.version.value;
    env.settings.value = { ...env.settings.value, spellLanguage: 'en-GB' };
    await settle();
    // Another language: not known yet, and the change is news to whoever reads the answers.
    expect(answers.isWord('COLOUR')).toBeUndefined();
    expect(answers.version.value).toBeGreaterThan(before);
    answers.ask(['COLOUR']);
    await settle();
    expect(answers.isWord('COLOUR')).toBe(true);
    env.settings.value = { ...env.settings.value, spellLanguage: 'en-US' };
    await settle();
    const asked = FakeWorker.made[0]?.asked().length;
    answers.ask(['COLOUR']);
    await settle();
    // Kept: US English isn't asked again.
    expect(answers.isWord('COLOUR')).toBe(false);
    expect(FakeWorker.made[0]?.asked()).toHaveLength(asked as number);
  });

  test('a failed worker leaves names as words, and the next ask makes another', async () => {
    loads.fail = true;
    env.settings.value = { ...env.settings.value, spellcheck: false };
    const { answers } = await modules();
    await settle();
    answers.ask(NAMES);
    await settle();
    expect(FakeWorker.made).toHaveLength(1);
    expect(NAMES.map(answers.isWord)).toEqual(NAMES.map(() => undefined));
    expect(answers.version.value).toBe(0);
    // Asked again while it still fails: the failed worker ends, another is made and asked, and
    // the names stay words.
    answers.ask(NAMES);
    await settle();
    expect(FakeWorker.made).toHaveLength(2);
    expect(FakeWorker.made[0]?.terminated).toBe(true);
    expect(FakeWorker.made[1]?.asked()).toHaveLength(1);
    expect(answers.isWord('WILL')).toBeUndefined();
    // The dictionary loads now (back online): the next ask is answered.
    loads.fail = false;
    answers.ask(NAMES);
    await settle();
    expect(FakeWorker.made).toHaveLength(3);
    expect(FakeWorker.made[1]?.terminated).toBe(true);
    expect(NAMES.map(answers.isWord)).toEqual([true, true, true, false, false]);
    expect(answers.version.value).toBe(1);
  });
});
