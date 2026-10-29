import { readFileSync } from 'node:fs';
import en from 'dictionary-en';
import { describe, expect, test } from 'vitest';
import { createChecker } from '../src/checker';
import { type CheckInput, createSpellSession } from '../src/session';

// A session over each fixture. Each fixture holds one planted misspelling and nothing else a
// writer would want marked: names, locations, the script's dictionary, short capitals, digits,
// addresses, transitions, and the title page are all words the dictionary doesn't know, or would
// be checked if the rules didn't skip them.

const checker = createChecker(en);
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

function flagged(name: string, options: Partial<CheckInput> = {}): string[] {
  const source = fixture(name);
  const kind = name.endsWith('.md') ? 'markdown' : 'fountain';
  const session = createSpellSession(checker);
  const marks = session.check({ source, kind, notes: false, mine: [], ...options });
  for (const mark of marks) {
    expect(source.slice(mark.from, mark.to).replaceAll('*', '').replaceAll('’', "'")).toBe(
      mark.word,
    );
  }
  return marks.map((m) => m.word);
}

describe('never flagged', () => {
  test('names are never flagged', () => {
    // The dictionary alone would mark them.
    for (const name of ['Odalys', 'Brennigan', 'Quillon', 'McKittrick']) {
      expect(checker.correct(name)).toBe(false);
    }
    expect(flagged('names.fountain')).toEqual(['kettel']);
  });

  test('locations are never flagged', () => {
    for (const word of ['Halversham', 'Zephyrine', 'Ormsby']) {
      expect(checker.correct(word)).toBe(false);
    }
    expect(flagged('locations.fountain')).toEqual(['windoe']);
  });

  test("the script's dictionary words are never flagged", () => {
    // `ORMSBY` is in the action, and `Ormsby` in the metadata block's dictionary.
    expect(flagged('skips.fountain')).toEqual(['stikker']);
    expect(flagged('notes.fountain', { notes: true })).toEqual(['recieve']);
    const undictionaried = fixture('skips.fountain').replace('"dictionary":["Ormsby"]', '"x":1');
    const session = createSpellSession(checker);
    const words = session
      .check({ source: undictionaried, kind: 'fountain', notes: false, mine: [] })
      .map((m) => m.word);
    expect(words).toEqual(['ORMSBY', 'stikker']);
  });

  test("My dictionary's words are never flagged", () => {
    expect(flagged('names.fountain', { mine: ['Kettel'] })).toEqual([]);
    expect(flagged('stage.fountain', { mine: ['STVOE'] })).toEqual([]);
    expect(flagged('doc.md', { mine: ['dragz'] })).toEqual([]);
  });

  test('short capitals, digits, and addresses are never flagged', () => {
    // `LN`, `44B`, `ormsby.example.org`, and `pell@example.com` in the action.
    expect(flagged('skips.fountain')).toEqual(['stikker']);
    // Markdown's autolinks and its e-mail address too.
    expect(flagged('doc.md')).toEqual(['dragz']);
    // One- and two-letter pieces are never marked: a missed check is better than a false mark.
    const session = createSpellSession(checker);
    const words = session
      .check({
        source: "Rock 'n' roll, e.g. tell 'em, ok? Zq it. XQZ and ZQXW. Room 4b.\n",
        kind: 'fountain',
        notes: false,
        mine: [],
      })
      .map((m) => m.word);
    expect(words).toEqual(['ZQXW']);
  });

  test('transitions and the title page are never flagged', () => {
    // The title page's `Pell Varga`, and `SMASH CUT TO:` and `> FADE TO BLACK.`
    expect(checker.correct('Varga')).toBe(false);
    expect(checker.correct('Pell')).toBe(false);
    expect(flagged('skips.fountain')).toEqual(['stikker']);
    expect(flagged('stage.fountain')).toEqual(['stvoe']);
  });

  test('the planted misspelling is flagged', () => {
    expect(flagged('names.fountain')).toEqual(['kettel']);
    expect(flagged('locations.fountain')).toEqual(['windoe']);
    expect(flagged('skips.fountain')).toEqual(['stikker']);
    expect(flagged('stage.fountain')).toEqual(['stvoe']);
    expect(flagged('doc.md')).toEqual(['dragz']);
    // The notes fixture's is in a note, so it's marked only with notes on.
    expect(flagged('notes.fountain')).toEqual([]);
    expect(flagged('notes.fountain', { notes: true })).toEqual(['recieve']);
  });
});
