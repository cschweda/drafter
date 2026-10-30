// @vitest-environment jsdom
import { webcrypto } from 'node:crypto';
import type { EditorState as State } from '@codemirror/state';
import { parse } from '@drafter/fountain';
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  DEFAULT_RATES,
  ESTIMATE_LABEL,
  estimateNote,
  pageSeconds,
  parseRate,
  RATE_LIMITS,
  ratesOf,
  shortTime,
  timeWords,
} from '../app/stats/timing';

// The editor session without Nuxt's aliases, as export-options.test.ts has it.
vi.mock('../app/editor/session', async () => {
  const { EditorState } = await import('@codemirror/state');
  const { shallowRef } = await import('vue');
  const TEXT = 'Title: The Call\n\nINT. KITCHEN - NIGHT\n\nA phone rings.\n';
  let state = EditorState.create({ doc: TEXT });
  const listeners = new Set<(state: State) => void>();
  const doc = shallowRef(parse(state.doc.toString()));
  const view = {
    get state() {
      return state;
    },
    dispatch(spec: Parameters<State['update']>[0]) {
      state = state.update(spec).state;
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
      state = EditorState.create({ doc: text });
      doc.value = parse(text);
      for (const l of listeners) l(state);
    },
    setKind() {},
    setReadOnly() {},
    reset() {
      listeners.clear();
      session.load(TEXT);
    },
    onState(listener: (state: State) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    goto() {},
  };
  return { useEditor: () => session };
});

describe('ratesOf', () => {
  test('reads a missing or out-of-range timing as the defaults', () => {
    expect(DEFAULT_RATES).toEqual({ minutesPerPage: 1, wordsPerMinute: 150 });
    expect(ratesOf(undefined)).toEqual(DEFAULT_RATES);
    expect(ratesOf(null)).toEqual(DEFAULT_RATES);
    expect(ratesOf({})).toEqual(DEFAULT_RATES);
    expect(ratesOf({ timing: {} })).toEqual(DEFAULT_RATES);
    expect(ratesOf({ timing: { minutesPerPage: 1.2, wordsPerMinute: 180 } })).toEqual({
      minutesPerPage: 1.2,
      wordsPerMinute: 180,
    });
    // Each field on its own: a bad one is its default, the other kept.
    expect(ratesOf({ timing: { minutesPerPage: 9, wordsPerMinute: 180 } })).toEqual({
      minutesPerPage: 1,
      wordsPerMinute: 180,
    });
    for (const bad of [0, -1, 0.4, 3.1, Number.NaN, Number.POSITIVE_INFINITY, '1.5', null]) {
      expect(ratesOf({ timing: { minutesPerPage: bad, wordsPerMinute: bad } as never })).toEqual(
        DEFAULT_RATES,
      );
    }
    expect(ratesOf({ timing: { wordsPerMinute: 99 } })).toEqual(DEFAULT_RATES);
    expect(ratesOf({ timing: { wordsPerMinute: 221 } })).toEqual(DEFAULT_RATES);
    expect(RATE_LIMITS).toEqual({
      minutesPerPage: { min: 0.5, max: 3, step: 0.1 },
      wordsPerMinute: { min: 100, max: 220, step: 5 },
    });
  });
});

describe('parseRate', () => {
  test('parseRate accepts the range and refuses the rest', () => {
    const minutes = { problem: 'Enter a number from 0.5 to 3, in tenths, such as 1.2.' };
    const words = { problem: 'Enter a whole number from 100 to 220, in steps of 5.' };
    for (const text of [
      '',
      '0',
      '-1',
      '1,2',
      'abc',
      '10',
      '0.55',
      '0.4',
      '3.1',
      '1.',
      'Infinity',
    ]) {
      expect(parseRate('minutesPerPage', text), text).toEqual(minutes);
    }
    expect(parseRate('minutesPerPage', '0.5')).toBe(0.5);
    expect(parseRate('minutesPerPage', ' 1.2 ')).toBe(1.2);
    expect(parseRate('minutesPerPage', '1.20')).toBe(1.2);
    expect(parseRate('minutesPerPage', '3')).toBe(3);
    expect(parseRate('minutesPerPage', '.5')).toBe(0.5);
    for (const text of ['', '0', '-150', '152', '99', '225', '150.5', 'abc', '1,50']) {
      expect(parseRate('wordsPerMinute', text), text).toEqual(words);
    }
    expect(parseRate('wordsPerMinute', '100')).toBe(100);
    expect(parseRate('wordsPerMinute', '155')).toBe(155);
    expect(parseRate('wordsPerMinute', '220')).toBe(220);
  });
});

describe('times', () => {
  test('pageSeconds is the eighths at the rate', () => {
    expect(pageSeconds(8, 1)).toBe(60);
    expect(pageSeconds(1, 1)).toBe(7.5);
    expect(pageSeconds(11, 1.2)).toBeCloseTo(99, 9);
  });

  test('shortTime rounds to 5 s under ten minutes and to the minute after', () => {
    expect(shortTime(7.5)).toBe('10 s');
    expect(shortTime(85)).toBe('1 min 25 s');
    expect(shortTime(601)).toBe('10 min');
    expect(shortTime(3900)).toBe('1 h 5 min');
    expect(shortTime(0)).toBe('0 s');
    // Anything at all is at least 5 seconds; never "0 s" for a scene with words in it.
    expect(shortTime(0.4)).toBe('5 s');
    expect(shortTime(35)).toBe('35 s');
    expect(shortTime(60)).toBe('1 min');
    expect(shortTime(598)).toBe('10 min');
    expect(shortTime(720)).toBe('12 min');
    expect(shortTime(7200)).toBe('2 h');
  });

  test('timeWords says the same in words', () => {
    expect(timeWords(7.5)).toBe('about 10 seconds');
    expect(timeWords(85)).toBe('about 1 minute 25 seconds');
    expect(timeWords(601)).toBe('about 10 minutes');
    expect(timeWords(3900)).toBe('about 1 hour 5 minutes');
    expect(timeWords(60)).toBe('about 1 minute');
    expect(timeWords(7200)).toBe('about 2 hours');
    expect(timeWords(3660)).toBe('about 1 hour 1 minute');
    expect(timeWords(0)).toBe('no time');
  });

  test('the estimate is labelled and explained at the script’s pace', () => {
    expect(ESTIMATE_LABEL).toBe('Estimate from the dialogue');
    expect(estimateNote(DEFAULT_RATES)).toBe(
      'The words spoken, at 150 words a minute, plus 1.5 seconds for each line of action. A rough guide, not a timing.',
    );
    expect(estimateNote({ minutesPerPage: 1, wordsPerMinute: 180 })).toContain(
      'at 180 words a minute',
    );
  });
});

/** A fresh session over an empty database, with a script of the writer's own open. */
async function visit() {
  vi.resetModules();
  vi.stubGlobal('crypto', webcrypto);
  const { db } = await import('../app/storage/db');
  await Promise.all(db.tables.map((table) => table.clear()));
  const { useEditor } = await import('../app/editor/session');
  (useEditor() as unknown as { reset(): void }).reset();
  const script = await import('../app/storage/script');
  const session = script.useScript();
  await vi.waitFor(() => expect(session.ready.value).toBe(true));
  await session.newScript('screenplay');
  const timing = await import('../app/stats/timing');
  const { useGuard } = await import('../app/storage/guard');
  return { session, db, editor: useEditor(), guard: useGuard(), ...timing };
}

describe('setRate', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('setRate keeps the rate on the open project, never in the text, and does nothing read-only', async () => {
    const t = await visit();
    const id = t.session.project.value?.id as string;
    const text = t.editor.view.state.doc.toString();
    const stored = async () => (await t.db.projects.get(id))?.timing;

    await t.setRate('minutesPerPage', 1.2);
    expect(t.session.project.value?.timing).toEqual({ minutesPerPage: 1.2, wordsPerMinute: 150 });
    expect(await stored()).toEqual({ minutesPerPage: 1.2, wordsPerMinute: 150 });
    expect(await t.setRate('wordsPerMinute', 180)).toEqual({
      minutesPerPage: 1.2,
      wordsPerMinute: 180,
    });
    expect(await stored()).toEqual({ minutesPerPage: 1.2, wordsPerMinute: 180 });
    expect(t.editor.view.state.doc.toString()).toBe(text);
    expect(t.session.dirty.value).toBe(false);

    // A rate out of range is never stored.
    expect(await t.setRate('wordsPerMinute', 152)).toEqual({
      minutesPerPage: 1.2,
      wordsPerMinute: 180,
    });
    await t.setRate('minutesPerPage', Number.NaN);
    expect(await stored()).toEqual({ minutesPerPage: 1.2, wordsPerMinute: 180 });

    // A tab that only shows the script keeps nothing.
    const readOnly = vi.spyOn(t.guard.readOnly, 'value', 'get').mockReturnValue(true);
    // What's kept comes back, for the field to show, not the rate that was asked for.
    expect(await t.setRate('minutesPerPage', 2)).toEqual({
      minutesPerPage: 1.2,
      wordsPerMinute: 180,
    });
    expect(await stored()).toEqual({ minutesPerPage: 1.2, wordsPerMinute: 180 });
    readOnly.mockRestore();

    // Export options and rates are kept side by side.
    const { setExportOption } = await import('../app/storage/export-options');
    await setExportOption('titlePage', 'none');
    expect((await t.db.projects.get(id))?.timing).toEqual({
      minutesPerPage: 1.2,
      wordsPerMinute: 180,
    });
  });
});
