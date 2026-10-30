import { castOf, type IsWord } from '@drafter/cast';
import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { linesPerPage, sceneIndex } from '@drafter/outline';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import { isBackKey } from '../app/scaffold/keys';
import {
  characterFacts,
  characterSummary,
  filterFold,
  LINES_SHOWN,
  locationSummary,
  matchesFilter,
  sharePercents,
  speechesOf,
  timesOfDay,
} from '../app/scaffold/pages';
import { characterRows } from '../app/stats/characters';
import { DEFAULT_RATES } from '../app/stats/time-format';

// What Scaffold's character and location pages say (seeing-the-script design §5.3–§5.5): the
// summary lines, a character's figures, and the lists' filter. Read from the cast; nothing here
// counts anything again.

const screenplay = builtins['us-screenplay'] as Template;
const noWords: IsWord = () => false;

/** `n` lines of action, written for these tests, about `n / 55` pages. */
const filler = (n: number) =>
  Array.from({ length: n }, (_, i) => `Water turns the wheel, turn ${i + 1}.`).join('\n\n');

/**
 * A tide mill, written for these tests: MARA in scenes 1, 2, and 4, with a long stretch of the
 * miller alone between; GIL in 2 and 3; the mill floor inside by night twice and outside by day.
 */
const MILL = `INT. MILL FLOOR - NIGHT

MARA
The sluice is stuck again.

EXT. MILL POND - DAY

MARA
Hold the lantern up.

GIL
I am holding it up.

INT. MILL FLOOR - NIGHT

GIL works alone.

${filler(1200)}

EXT. MILL FLOOR - MORNING

MARA
You kept it turning.
`;

function build(text: string, pages: boolean) {
  const doc = parse(text);
  const layout = pages ? paginate(doc, screenplay) : null;
  const index = sceneIndex(doc, screenplay, layout);
  const cast = castOf(index, doc, screenplay, linesPerPage(layout), noWords);
  return { doc, index, cast };
}

const paged = build(MILL, true);
const unpaged = build(MILL, false);

describe('a character’s page', () => {
  test('the character summary names the first and last scene with pages', () => {
    const { cast, index } = paged;
    const mara = cast.figures.get('MARA');
    if (!mara) throw new Error('no MARA');
    const last = index.scenes[3]?.pages?.page;
    expect(last).toBeGreaterThan(20);
    expect(characterSummary(mara, index, index.scenes.length)).toBe(
      `In 3 of 4 scenes. First in scene 1 (page 1); last in scene 4 (page ${last}).`,
    );
    // Before the pages, the scenes alone.
    const early = unpaged.cast.figures.get('MARA');
    if (!early) throw new Error('no MARA');
    expect(characterSummary(early, unpaged.index, 4)).toBe(
      'In 3 of 4 scenes. First in scene 1; last in scene 4.',
    );
    // One scene: in it, once.
    const gil = build('INT. SHED - DAY\n\nGIL\nHere.\n', false);
    const f = gil.cast.figures.get('GIL');
    if (!f) throw new Error('no GIL');
    expect(characterSummary(f, gil.index, 1)).toBe(
      'In 1 of 1 scene. First in scene 1; last in scene 1.',
    );
  });

  test('facts give screen time, dialogue, and the longest absence', () => {
    const { cast, index } = paged;
    const mara = cast.figures.get('MARA');
    if (!mara) throw new Error('no MARA');
    const percent = sharePercents(cast).get('MARA') ?? -1;
    const facts = characterFacts(mara, DEFAULT_RATES, percent);
    expect(facts.map((f) => f.term)).toEqual([
      'Screen time',
      'Dialogue',
      'Longest absence',
      'Long absences',
    ]);
    const eighths = [0, 1, 3].reduce((n, s) => n + (index.scenes[s]?.pages?.eighths ?? 0), 0);
    expect(facts[0]?.value).toMatch(/ · about .+ at 1 minute a page$/);
    expect(mara.screenEighths).toBe(eighths);
    // 3 speeches, 13 words of the 18 spoken: 72%, the Stats tab's share.
    expect(facts[1]?.value).toBe('3 speeches · 13 words · 72% of all dialogue');
    const row = characterRows(cast, DEFAULT_RATES).find((r) => r.key === 'MARA');
    expect(`${percent}%`).toBe(row?.share);
    // The gap is the mill floor's long night, from scene 2 to scene 4, which it links to.
    const longest = mara.longest;
    if (!longest) throw new Error('no gap');
    const gap = longest.to.page - longest.from.page;
    expect(gap).toBeGreaterThanOrEqual(20);
    expect(facts[2]).toMatchObject({
      value: `page ${longest.from.page} to page ${longest.to.page} (${gap} pages)`,
      scene: 3,
    });
    expect(facts[3]?.value).toBe(
      `MARA: absent from page ${longest.from.page} to page ${longest.to.page} (${gap} pages).`,
    );
    // GIL's two scenes are next to each other: no gap at all.
    const gil = cast.figures.get('GIL');
    if (!gil) throw new Error('no GIL');
    const gilFacts = characterFacts(gil, DEFAULT_RATES, 28);
    expect(gilFacts[2]?.value).toBe('None');
    expect(gilFacts[3]?.value).toBe('None of 20 pages or more');
    expect(gilFacts[1]?.value).toBe('1 speech · 5 words · 28% of all dialogue');
  });

  test('absences wait for the pages', () => {
    const mara = unpaged.cast.figures.get('MARA');
    if (!mara) throw new Error('no MARA');
    const facts = characterFacts(mara, DEFAULT_RATES, 72);
    expect(facts[0]).toEqual({ term: 'Screen time', value: 'When the pages are ready' });
    expect(facts[2]).toEqual({ term: 'Longest absence', value: 'When the pages are ready' });
    expect(facts[3]).toEqual({ term: 'Long absences', value: 'When the pages are ready' });
  });

  test('a character’s speeches, everywhere they speak, with their scene', () => {
    const { index } = build(
      'MARA\nBefore anything.\n\nINT. SHED - DAY\n\nMARA\nIn the shed.\n\nGIL\nNot me.\n',
      false,
    );
    expect(speechesOf(index, 'MARA').map((s) => s.scene)).toEqual([null, 0]);
    expect(speechesOf(index, 'GIL').map((s) => s.scene)).toEqual([0]);
    expect(LINES_SHOWN).toBe(100);
  });
});

describe('a location’s page', () => {
  test('a location summary gives scenes, pages, minutes, inside and outside', () => {
    const floor = paged.cast.locations.get('MILL FLOOR');
    if (!floor) throw new Error('no MILL FLOOR');
    const eighths = floor.eighths ?? 0;
    expect(eighths).toBeGreaterThan(160);
    expect(locationSummary(floor, DEFAULT_RATES)).toMatch(
      /^3 scenes · \d+( \d\/8)? pages · about \d+ min · inside 2, outside 1\.$/,
    );
    // Before the pages, the scenes and the split.
    const early = unpaged.cast.locations.get('MILL FLOOR');
    if (!early) throw new Error('no MILL FLOOR');
    expect(locationSummary(early, DEFAULT_RATES)).toBe('3 scenes · inside 2, outside 1.');
    const pond = unpaged.cast.locations.get('MILL POND');
    if (!pond) throw new Error('no MILL POND');
    expect(locationSummary(pond, DEFAULT_RATES)).toBe('1 scene · outside 1.');
    // Its times of day, most first.
    expect(timesOfDay(early)).toBe('NIGHT 2, MORNING 1');
  });
});

describe('the lists’ filter', () => {
  test('filters fold case and accents', () => {
    expect(filterFold('Zoë')).toBe('zoe');
    expect(filterFold('  ÉLODIE ')).toBe('elodie');
    expect(matchesFilter('ÉLODIE', 'elo')).toBe(true);
    expect(matchesFilter('Café Noir', 'CAFE N')).toBe(true);
    expect(matchesFilter('MARA', 'gil')).toBe(false);
    // An empty filter keeps everything.
    expect(matchesFilter('MARA', '  ')).toBe(true);
  });
});

describe('Back’s key', () => {
  const key = (over: Partial<Parameters<typeof isBackKey>[0]> = {}) => ({
    key: 'ArrowLeft',
    altKey: true,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    target: null,
    ...over,
  });

  test('Alt+Left goes Back, but not in a text field, where it moves by a word', () => {
    expect(isBackKey(key())).toBe(true);
    expect(isBackKey(key({ altKey: false }))).toBe(false);
    expect(isBackKey(key({ shiftKey: true }))).toBe(false);
    expect(isBackKey(key({ ctrlKey: true }))).toBe(false);
    expect(isBackKey(key({ key: 'ArrowRight' }))).toBe(false);
    expect(isBackKey(key({ target: { tagName: 'INPUT' } }))).toBe(false);
    expect(isBackKey(key({ target: { tagName: 'A' } }))).toBe(true);
  });
});
