import { castOf, type IsWord, placeOf } from '@drafter/cast';
import { parse } from '@drafter/fountain';
import { type Scene, sceneIndex } from '@drafter/outline';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, test } from 'vitest';
import { NO_PLACE, rowsFor, sceneFacts, sceneRows, sceneTitle } from '../app/scaffold/labels';
import { DEFAULT_RATES } from '../app/stats/time-format';

// What Scaffold's scene page says (seeing-the-script design §5.2, Calls 27 and 28): the facts of a
// scene (where, when, how long), and a row for each character in it, speakers first.

const screenplay = builtins['us-screenplay'] as Template;
const play = builtins['stage-play-standard'] as Template;
const noWords: IsWord = () => false;

/** Original text for these tests: a ferry crossing at night. */
const FERRY = `INT. FERRY CABIN - NIGHT

BRAM sleeps on a bench. Ines watches the dark window. A steward, KOLL, passes.

INES
Are we nearly there?

KOLL
Twenty minutes, if the fog holds off.

INES
It won't.

KOLL
Then forty.

EXT. FERRY DECK - NIGHT

BRAM stands at the rail, alone. The horn sounds.

BRAM
Ines! Come and see the lights.
`;

function build(text: string, template = screenplay) {
  const doc = parse(text);
  const index = sceneIndex(doc, template, null);
  const cast = castOf(index, doc, template, null, noWords);
  return { doc, index, cast };
}

/** A scene with pages, as the layout gives them. */
const paged = (scene: Scene, page: number, eighths: number): Scene => ({
  ...scene,
  pages: { page, line: 1, eighths },
});

describe('a scene’s facts', () => {
  test('facts give where, when, and length with minutes at the page rate', () => {
    const { doc, index } = build(FERRY);
    const scene = paged(index.scenes[0] as Scene, 12, 11);
    const place = placeOf(scene, doc, screenplay);
    expect(sceneTitle(scene)).toBe('Scene 1 · INT. FERRY CABIN - NIGHT');
    expect(sceneFacts(scene, place, DEFAULT_RATES)).toEqual([
      {
        term: 'Where',
        value: 'FERRY CABIN · Inside',
        words: 'FERRY CABIN, inside',
        // The place is a link to its page, keyed by its name as the cast keys it.
        link: { text: 'FERRY CABIN', page: { kind: 'location', key: 'FERRY CABIN' } },
      },
      { term: 'When', value: 'NIGHT' },
      {
        term: 'Length',
        value: '1 3/8 pages · page 12 · about 1 min 25 s',
        words: '1 3/8 pages, page 12, about 1 minute 25 seconds',
      },
    ]);
    // At a script's own page rate: 1.2 minutes a page.
    const slower = sceneFacts(scene, place, { ...DEFAULT_RATES, minutesPerPage: 1.2 });
    expect(slower[2]?.value).toBe('1 3/8 pages · page 12 · about 1 min 40 s');
  });

  test('before pages, the length is from the dialogue and says so', () => {
    const { doc, index } = build(FERRY);
    const scene = index.scenes[0] as Scene;
    expect(scene.pages).toBeNull();
    const facts = sceneFacts(scene, placeOf(scene, doc, screenplay), DEFAULT_RATES);
    // 15 words spoken at 150 a minute (6 s), and 2 lines of action at 1.5 s each: 9 s, to 10 s.
    expect(facts[2]).toEqual({
      term: 'Length',
      value: 'about 10 s (from the dialogue)',
      words: 'about 10 seconds, from the dialogue',
    });
  });

  test('a play’s scene says its heading names no place', () => {
    const { doc, index } = build(
      '# Act One\n\n## The Lock Keeper\n\nA towpath.\n\n@PELL\nOpen it.\n',
      play,
    );
    const scene = index.scenes[0] as Scene;
    const facts = sceneFacts(scene, placeOf(scene, doc, play), DEFAULT_RATES);
    expect(NO_PLACE).toBe('This scene’s heading doesn’t name a place.');
    expect(facts[0]).toEqual({ term: 'Where', value: NO_PLACE });
    // No time of day either.
    expect(facts.map((f) => f.term)).toEqual(['Where', 'Length']);
  });
});

describe('who is in a scene', () => {
  test('rows list speakers first, then the silent', () => {
    const { index, cast } = build(FERRY);
    const rows = sceneRows(cast, 0, index.scenes[0] as Scene, DEFAULT_RATES);
    // INES speaks first, then KOLL; BRAM sleeps (named first in the action), silent.
    expect(rows.map((r) => r.name)).toEqual(['INES', 'KOLL', 'BRAM']);
    expect(rows.map((r) => r.speeches)).toEqual(['2', '2', 'Silent']);
    expect(rows.map((r) => r.words)).toEqual([6, 9, 0]);
    // The second scene: BRAM speaks; INES is named only in his dialogue, so isn't there.
    expect(sceneRows(cast, 1, index.scenes[1] as Scene, DEFAULT_RATES).map((r) => r.name)).toEqual([
      'BRAM',
    ]);
  });

  test('time speaking is a share of the scene’s estimate, capped at 100%', () => {
    const { index, cast } = build(FERRY);
    const scene = index.scenes[0] as Scene;
    // The scene's estimate: 15 words at 150 a minute (6 s) and 2 lines of action (3 s), 9 s.
    const rows = sceneRows(cast, 0, scene, DEFAULT_RATES);
    // INES: 6 words, 2.4 s of 9: 27%.
    expect(rows[0]?.time).toEqual({ text: 'about 5 s', words: 'about 5 seconds', share: '27%' });
    // KOLL: 9 words, 3.6 s of 9: 40%.
    expect(rows[1]?.time?.share).toBe('40%');
    // A scene whose estimate is shorter than someone's words (as a dual pair's two sides can be)
    // gives them all of it, never more.
    const short = { ...scene, timing: { spoken: 3, actionLines: 0 } };
    expect(sceneRows(cast, 0, short, DEFAULT_RATES)[1]?.time?.share).toBe('100%');
  });

  test('a silent character says Silent and has no share', () => {
    const { index, cast } = build(FERRY);
    const bram = sceneRows(cast, 0, index.scenes[0] as Scene, DEFAULT_RATES)[2];
    expect(bram?.speeches).toBe('Silent');
    expect(bram?.time).toBeNull();
  });

  test('first seen here is marked', () => {
    const { index, cast } = build(FERRY);
    const first = sceneRows(cast, 0, index.scenes[0] as Scene, DEFAULT_RATES);
    expect(first.map((r) => [r.key, r.first, r.more])).toEqual([
      ['INES', true, 0],
      ['KOLL', true, 0],
      ['BRAM', true, 1],
    ]);
    // In the second scene BRAM is seen again, not for the first time.
    const second = sceneRows(cast, 1, index.scenes[1] as Scene, DEFAULT_RATES);
    expect(second.map((r) => [r.key, r.first, r.more])).toEqual([['BRAM', false, 1]]);
  });
});

// The cast is worked out after a pause; meanwhile the writer may add a scene above the one shown, so
// its place in the cast's scenes is no longer its place in the script. The rows find it by its id.
describe('the rows of the scene shown, while the cast catches up', () => {
  test('a scene heading added above never shows another scene’s people', () => {
    const { doc, index, cast } = build(FERRY);
    const basis = { index, doc, ids: ['cabin', 'deck'] };
    // The script now has a new scene first, so the deck is the third scene; its id is the same.
    expect(rowsFor(cast, basis, 'deck', DEFAULT_RATES)?.map((r) => r.name)).toEqual(['BRAM']);
    expect(rowsFor(cast, basis, 'cabin', DEFAULT_RATES)?.map((r) => r.name)).toEqual([
      'INES',
      'KOLL',
      'BRAM',
    ]);
    // The new scene isn't in the cast yet: no rows (Counting…), never the cabin's.
    expect(rowsFor(cast, basis, 'new', DEFAULT_RATES)).toBeNull();
    expect(rowsFor(null, basis, 'deck', DEFAULT_RATES)).toBeNull();
    expect(rowsFor(cast, null, 'deck', DEFAULT_RATES)).toBeNull();
  });
});
