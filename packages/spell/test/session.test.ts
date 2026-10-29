import en from 'dictionary-en';
import { describe, expect, test } from 'vitest';
import { createChecker } from '../src/checker';
import { type CheckInput, createSpellSession } from '../src/session';

const checker = createChecker(en);

const script = [
  'INT. KITCHEN - NIGHT',
  '',
  'Margaret waits by the phnoe.',
  '',
  'MARGARET',
  'You said you wuold call.',
  '',
  'The rain doesn’t stop. [[Fix the rian later]]',
  '',
].join('\n');
const input = (source: string, more: Partial<CheckInput> = {}): CheckInput => ({
  source,
  kind: 'fountain',
  notes: false,
  mine: [],
  ...more,
});

describe('createSpellSession', () => {
  test('finds each misspelling, in order, with its offsets', () => {
    const session = createSpellSession(checker);
    const marks = session.check(input(script));
    expect(marks.map((m) => m.word)).toEqual(['phnoe', 'wuold']);
    for (const mark of marks) expect(script.slice(mark.from, mark.to)).toBe(mark.word);
    expect(session.suggest('phnoe')).toContain('phone');
    expect(session.suggest('phnoe').length).toBeLessThanOrEqual(5);
  });

  test('a second check of the same text checks nothing new', () => {
    const session = createSpellSession(checker);
    const first = session.check(input(script));
    expect(session.work().units).toBeGreaterThan(0);
    expect(session.check(input(script))).toEqual(first);
    expect(session.work()).toEqual({ units: 0, words: 0 });
  });

  test('an edit to one block tokenizes one unit', () => {
    const session = createSpellSession(checker);
    session.check(input(script));
    session.work();
    const edited = script.replace('wuold call.', 'would call.');
    const marks = session.check(input(edited));
    expect(marks.map((m) => m.word)).toEqual(['phnoe']);
    // Only the dialogue is tokenized again, and only `would` is new to the checker.
    expect(session.work()).toEqual({ units: 1, words: 1 });
    // A block moved down by text inserted before it keeps its tokens; its offsets follow.
    const shifted = `INT. HALL - DAY\n\n${edited}`;
    const moved = session.check(input(shifted));
    expect(moved.map((m) => [m.word, shifted.slice(m.from, m.to)])).toEqual([['phnoe', 'phnoe']]);
    expect(session.work().units).toBe(1);
  });

  test('a word added to mine is unflagged without checking again', () => {
    const session = createSpellSession(checker);
    session.check(input(script));
    session.work();
    const marks = session.check(input(script, { mine: ['PHNOE'] }));
    expect(marks.map((m) => m.word)).toEqual(['wuold']);
    expect(session.work()).toEqual({ units: 0, words: 0 });
    // And taken out again, it's marked again, from the cached verdict.
    expect(session.check(input(script)).map((m) => m.word)).toEqual(['phnoe', 'wuold']);
    expect(session.work()).toEqual({ units: 0, words: 0 });
  });

  test('checks a Markdown document, skipping code', () => {
    const session = createSpellSession(checker);
    const source =
      '# A draft\n\nThe secnod act. Run `zzqxcode` first.\n\n```\nzzqxfence\n```\n\n    zzqxindented\n';
    const marks = session.check({ source, kind: 'markdown', notes: false, mine: [] });
    expect(marks.map((m) => m.word)).toEqual(['secnod']);
    // A Markdown document has no cues or headings to harvest: a name in it is checked.
    const named = session.check({
      source: 'MARGARET\nHello, Brennigan.\n',
      kind: 'markdown',
      notes: false,
      mine: [],
    });
    expect(named.map((m) => m.word)).toEqual(['Brennigan']);
  });

  test('checks notes only when asked', () => {
    const session = createSpellSession(checker);
    expect(session.check(input(script)).map((m) => m.word)).toEqual(['phnoe', 'wuold']);
    expect(session.check(input(script, { notes: true })).map((m) => m.word)).toEqual([
      'phnoe',
      'wuold',
      'rian',
    ]);
    expect(session.check(input(script)).map((m) => m.word)).toEqual(['phnoe', 'wuold']);
  });

  test('the caches stay within their bounds and still give the same answer', () => {
    const session = createSpellSession(checker, { units: 2, words: 3 });
    const fresh = createSpellSession(checker);
    for (let n = 0; n < 5; n++) {
      const source = `${script}\nZzqx${'ab'.repeat(n + 2)} waits.\n`;
      expect(session.check(input(source))).toEqual(fresh.check(input(source)));
    }
    expect(session.check(input(script))).toEqual(fresh.check(input(script)));
    session.work();
    // Evicted, so checked again.
    session.check(input(`${script}\nZzqxabab waits.\n`));
    expect(session.work().units).toBeGreaterThan(0);
  });
});
