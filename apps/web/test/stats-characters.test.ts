import { castOf, type IsWord } from '@drafter/cast';
import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { linesPerPage, sceneIndex } from '@drafter/outline';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import { characterRows, shares } from '../app/stats/characters';

// The Stats tab's Characters table (seeing-the-script design §4.3): one row per speaking
// character, read from the cast, so the tab, Scaffold, and the grid never disagree.

const screenplay = builtins['us-screenplay'] as Template;

/** No name is an ordinary word here: each counts as its cue spells it, or capitalised. */
const noWords: IsWord = () => false;

/** Original text for these tests: three scenes at a boatyard. */
const BOATYARD = `INT. BOATHOUSE - DAWN

ODELL hauls a rope across the floor. PIA watches from the door.

ODELL
Hold the line steady.

PIA
I am holding it.

ODELL
Then hold it better.

EXT. PIER - DAY

PIA
~Slow river, slow river, carry me home

RUFUS
Nobody sings on my pier.

ODELL
She does now.

INT. SHED - NIGHT

Odell sharpens a hook. Rufus sleeps in the corner.

ODELL
Quiet, all of you.
`;

/** The cast of `text`, with its pages unless `paged` is false. */
function castFor(text: string, paged = true) {
  const doc = parse(text);
  const layout = paged ? paginate(doc, screenplay) : null;
  const index = sceneIndex(doc, screenplay, layout);
  return castOf(index, doc, screenplay, linesPerPage(layout), noWords);
}

const RATES = { minutesPerPage: 1, wordsPerMinute: 150 };

describe('the Characters table', () => {
  test('rows in order of speeches', () => {
    const rows = characterRows(castFor(BOATYARD), RATES);
    expect(rows.map((r) => [r.key, r.name, r.speeches])).toEqual([
      ['ODELL', 'ODELL', 4],
      ['PIA', 'PIA', 2],
      ['RUFUS', 'RUFUS', 1],
    ]);
  });

  test('words include lyrics', () => {
    const rows = characterRows(castFor(BOATYARD), RATES);
    // PIA: "I am holding it." (4) and the lyric's seven words.
    expect(rows.find((r) => r.key === 'PIA')?.words).toBe(11);
    // ODELL: 4 + 4 + 3 + 4.
    expect(rows.find((r) => r.key === 'ODELL')?.words).toBe(15);
  });

  test('scenes count silent scenes and speaks in does not', () => {
    const rows = characterRows(castFor(BOATYARD), RATES);
    const of = (key: string) => rows.find((r) => r.key === key);
    // PIA speaks in two scenes, and is in no other.
    expect([of('PIA')?.scenes, of('PIA')?.speaksIn]).toEqual([2, 2]);
    // RUFUS speaks on the pier, and sleeps in the shed.
    expect([of('RUFUS')?.scenes, of('RUFUS')?.speaksIn]).toEqual([2, 1]);
    expect([of('ODELL')?.scenes, of('ODELL')?.speaksIn]).toEqual([3, 3]);
  });

  test('screen time in pages and minutes at the script’s rate', () => {
    const cast = castFor(BOATYARD);
    const eighths = cast.figures.get('ODELL')?.screenEighths as number;
    // The three scenes fill five eighths of a page.
    expect(eighths).toBe(5);
    const at = (minutesPerPage: number) =>
      characterRows(cast, { ...RATES, minutesPerPage }).find((r) => r.key === 'ODELL')?.screen;
    // 37.5 seconds, to the nearest 5.
    expect(at(1)).toEqual({ text: '5/8 p · about 40 s', words: '5/8 page, about 40 seconds' });
    // At two minutes a page the same pages take twice as long.
    expect(at(2)).toEqual({
      text: '5/8 p · about 1 min 15 s',
      words: '5/8 page, about 1 minute 15 seconds',
    });
  });

  test('screen time is null without pages', () => {
    const rows = characterRows(castFor(BOATYARD, false), RATES);
    expect(rows.map((r) => r.screen)).toEqual([null, null, null]);
  });

  test('most often with names three, with counts', () => {
    const text = `${BOATYARD}
EXT. YARD - DAY

ODELL
Everyone out.

PIA
Coming.

MAEVE
Wait for me.

JUNO
And me.
`;
    const rows = characterRows(castFor(text), RATES);
    const often = (key: string) => rows.find((r) => r.key === key)?.often;
    // ODELL shares three scenes with PIA, two with RUFUS, and one each with MAEVE and JUNO: three
    // are named, the most shared first.
    expect(often('ODELL')).toBe('PIA (3), RUFUS (2), MAEVE (1)');
    expect(often('JUNO')).toBe('ODELL (1), PIA (1), MAEVE (1)');
    // Someone who shares no scene names no one.
    expect(characterRows(castFor('INT. ROOM - DAY\n\nSOLO\nJust me.\n'), RATES)[0]?.often).toBe('');
  });

  test('the shares are whole percents that add up to 100', () => {
    const rows = characterRows(castFor(BOATYARD), RATES);
    // 15, 11, and 5 words of 31: 48.4, 35.5, and 16.1 round down to 48, 35, and 16, and the point
    // left goes to the largest remainder, 35.5 (rounding each would make 48, 35, and 16: 99).
    expect(rows.map((r) => r.share)).toEqual(['48%', '36%', '16%']);
  });
});

describe('shares by largest remainder', () => {
  test('sum to 100', () => {
    expect(shares([1, 1, 1])).toEqual([34, 33, 33]);
    expect(shares([2, 1, 1, 1, 1, 1])).toEqual([29, 15, 14, 14, 14, 14]);
    expect(shares([7, 0, 3])).toEqual([70, 0, 30]);
  });

  test('ties go to the earlier row', () => {
    // Four equal speakers: exact. Six: 16.67 each, and the four left go to the first four.
    expect(shares([5, 5, 5, 5])).toEqual([25, 25, 25, 25]);
    expect(shares([1, 1, 1, 1, 1, 1])).toEqual([17, 17, 17, 17, 16, 16]);
  });

  test('a single speaker has it all, and no words share nothing', () => {
    expect(shares([12])).toEqual([100]);
    expect(shares([0, 0])).toEqual([0, 0]);
    expect(shares([])).toEqual([]);
  });

  test('any words add up to 100', () => {
    for (let n = 1; n <= 40; n++) {
      const words = Array.from({ length: n }, (_, i) => ((i * 7919 + n * 104729) % 97) + 1);
      expect(
        shares(words).reduce((a, b) => a + b, 0),
        String(n),
      ).toBe(100);
    }
  });
});
