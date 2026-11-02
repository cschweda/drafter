import { parse } from '@drafter/fountain';
import { sceneIndex } from '@drafter/outline';
import { describe, expect, test } from 'vitest';
import { cleanSpeech, pickQuotes, type QuoteCandidate, quoteCandidates } from '../src';
import { build, HARBOUR, screenplay } from './scripts';

// Lines of dialogue (story-map design §3.1, Calls 4–6): one speech, cleaned for a reader who has
// never seen a script, picked here and there through the scenes.

const read = (source: string) => {
  const doc = parse(source);
  return { doc, index: sceneIndex(doc, screenplay) };
};
const candidates = (source: string) => {
  const { doc, index } = read(source);
  return quoteCandidates(doc, index);
};
/** The block of the first cue whose name is `name`. */
const cueOf = (source: string, name: string) =>
  read(source).doc.blocks.findIndex((b) => b.kind === 'character' && b.sem.name === name);

/** One speech a scene, in `scenes` scenes, the speakers taking turns. */
function rota(scenes: number, speakers: readonly string[]): string {
  const out: string[] = [];
  for (let s = 0; s < scenes; s++) {
    out.push(`INT. ROOM ${s + 1} - DAY`, '', 'A clock on the wall.', '');
    out.push(speakers[s % speakers.length] as string, `The kettle in room ${s + 1} is still warm.`);
    out.push('');
  }
  return out.join('\n');
}

// Each its own words: the same words are picked only once.
const candidate = (over: Partial<QuoteCandidate> & { scene: number }): QuoteCandidate => ({
  cue: over.scene * 10,
  character: 'ADA',
  text: `The kettle is still warm in scene ${over.scene + 1}.`,
  marked: null,
  score: 3,
  ...over,
});
const noAct = () => null;

describe('cleaning a speech', () => {
  test('cleaning removes extensions, parentheticals, emphasis, and notes', () => {
    const source = `INT. SHED - NIGHT

TESSA (V.O.)
(softly)
The *tide* is [[fix]] early tonight.
`;
    const { doc } = read(source);
    expect(cleanSpeech(doc, cueOf(source, 'TESSA'))).toBe('The tide is early tonight.');
  });

  test('a speech over lines and parentheticals is joined by spaces', () => {
    const source = `INT. SHED - NIGHT

OREN (CONT'D)
I counted the nets.
(beat)
**All** of them.
`;
    const { doc } = read(source);
    expect(cleanSpeech(doc, cueOf(source, 'OREN'))).toBe('I counted the nets. All of them.');
    // The cue never reaches the text.
    expect(candidates(source)[0]?.text).toBe('I counted the nets. All of them.');
  });

  test('a cue with only a parenthetical cleans to nothing', () => {
    const source = 'INT. SHED - NIGHT\n\nOREN\n(shrugs)\n';
    const { doc } = read(source);
    expect(cleanSpeech(doc, cueOf(source, 'OREN'))).toBe('');
  });
});

describe('the length rule', () => {
  test('dual dialogue is never a candidate', () => {
    const source = `INT. SHED - NIGHT

OREN
The boat is ready when you are.

TESSA ^
The boat is never ready, and nor am I.

OREN
Then we row out at first light.
`;
    expect(candidates(source).map((c) => c.text)).toEqual(['Then we row out at first light.']);
  });

  test('3 to 18 words and 110 characters, or 160 when marked', () => {
    const long = 'We waited on the quay for the boat to come in from the far side of the bay.';
    expect(long.split(' ')).toHaveLength(18);
    const tooMany = `${long.slice(0, -1)} again.`;
    const wide = `${'Abcdefghijklmnopqrstuvwxyz '.repeat(4)}abcdefghij.`;
    expect(wide.length).toBe(119);
    const source = `INT. SHED - NIGHT

ADA
Go.

BEN
Not yet, then.

CY
${long}

DEE
${tooMany}

EVE
${wide}

FAY
${wide} [[Quote]]

GUS
${'Abcdefghijklmnopqrstuvwxyz '.repeat(6)}abcdefghij.
[[Quote]]
`;
    const found = candidates(source);
    expect(found.map((c) => c.character)).toEqual(['BEN', 'CY', 'FAY']);
    expect(found.find((c) => c.character === 'FAY')).toMatchObject({ marked: 'quote' });
  });

  test('a line ends a sentence', () => {
    const source = `INT. SHED - NIGHT

ADA
I left the oars by the door

BEN
Did you see where the oars went?

CY
She said, "Bring the oars."

DEE
I only wanted to say that—
`;
    expect(candidates(source).map((c) => c.character)).toEqual(['BEN', 'CY']);
  });

  test('a filler opening is skipped', () => {
    const source = `INT. SHED - NIGHT

ADA
Well, here we are again.

BEN
No, the boat is not ours.

CY
So we bail until morning.

DEE
Nobody bails a boat like this one.
`;
    expect(candidates(source).map((c) => c.character)).toEqual(['DEE']);
  });
});

describe('the marks', () => {
  test('a mark at the end of a line or on the line under the speech belongs to it', () => {
    const source = `INT. SHED - NIGHT

ADA
The oars are in the loft. [[Quote]]

BEN
The loft has been empty since June.
[[No quote]]

CY
Then someone has been up there.

[[Quote]]
`;
    const found = candidates(source);
    expect(found.map((c) => [c.character, c.marked])).toEqual([
      ['ADA', 'quote'],
      ['BEN', 'no-quote'],
      // After a blank line the note is no longer the speech's.
      ['CY', null],
    ]);
  });

  test('[[No quote]] is never used, [[Quote]] always is', () => {
    const scenes = rota(12, ['ADA', 'BEN', 'CY', 'DEE']).split('\n');
    // Scene 2's line marked wanted, scene 1's never: they are next to each other.
    const at = (n: number) => scenes.indexOf(`The kettle in room ${n} is still warm.`);
    scenes[at(1)] = `${scenes[at(1)]} [[No quote]]`;
    scenes[at(2)] = `${scenes[at(2)]} [[Quote]]`;
    const map = build(scenes.join('\n')).map;
    const used = map.quotes.filter((q) => q.inScene).map((q) => q.scene);
    expect(used).toContain(1);
    expect(used).not.toContain(0);
    expect(map.quotes.find((q) => q.scene === 1)?.marked).toBe(true);
  });
});

describe('the spread', () => {
  test('at most one per scene, three apart, three per speaker, twelve in all', () => {
    const list: QuoteCandidate[] = [];
    for (let s = 0; s < 80; s++) {
      list.push(candidate({ scene: s, character: s % 2 === 0 ? 'ADA' : 'BEN' }));
      list.push(candidate({ scene: s, cue: s * 10 + 1, character: 'CY', score: 1 }));
    }
    const picks = pickQuotes(list, 80, noAct);
    const scenes = picks.map((p) => p.scene);
    expect(new Set(scenes).size).toBe(scenes.length);
    for (const a of scenes)
      for (const b of scenes) if (a !== b) expect(Math.abs(a - b) >= 3).toBe(true);
    for (const who of ['ADA', 'BEN', 'CY']) {
      expect(picks.filter((p) => p.character === who).length).toBeLessThanOrEqual(3);
    }
    // Three speakers, three each.
    expect(picks).toHaveLength(9);

    const many = Array.from({ length: 200 }, (_, s) =>
      candidate({ scene: s, character: `P${s % 20}` }),
    );
    expect(pickQuotes(many, 200, noAct)).toHaveLength(12);
  });

  test('about one per four scenes', () => {
    const map = build(rota(40, ['ADA', 'BEN', 'CY', 'DEE', 'EVE', 'FAY', 'GUS', 'HAL'])).map;
    expect(map.quotes.filter((q) => q.inScene)).toHaveLength(10);
  });

  test('lines are spread here and there, never bunched at the start', () => {
    const map = build(rota(40, ['ADA', 'BEN', 'CY', 'DEE', 'EVE', 'FAY', 'GUS', 'HAL'])).map;
    const scenes = map.quotes.filter((q) => q.inScene).map((q) => q.scene);
    // One in each stretch of four scenes.
    expect(scenes.map((s) => Math.floor(s / 4))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test('one per act when the act has a candidate', () => {
    // Eight scenes: two lines by the rule of four, but three acts; the last act's only line is in
    // its last scene.
    const list = [
      candidate({ scene: 0, score: 5 }),
      candidate({ scene: 4, character: 'BEN', score: 5 }),
      candidate({ scene: 7, character: 'CY', score: 1 }),
    ];
    const actOf = (s: number) => (s < 3 ? 1 : s < 7 ? 2 : 3);
    expect(pickQuotes(list, 8, actOf).map((p) => p.scene)).toEqual([0, 4, 7]);
  });

  test('the scorer prefers 6 to 12 words, the last speech, and a new speaker', () => {
    const list = [
      candidate({ scene: 0, cue: 1, score: 1 }),
      candidate({ scene: 0, cue: 2, score: 3 }),
      candidate({ scene: 1, cue: 3, score: 5 }),
    ];
    expect(pickQuotes(list, 4, noAct).map((p) => p.cue)).toEqual([3]);
    // The script's scores: 6–12 words 3, otherwise 1; and 2 more for the scene's last speech.
    const found = candidates(`INT. SHED - NIGHT

ADA
Hold the lamp up higher.

BEN
Higher than this?

ADA
Up where the gulls can see it.
`);
    expect(found.map((c) => c.score)).toEqual([1, 1, 5]);
  });

  test('a speaker with no line yet wins a tie', () => {
    const list = [
      candidate({ scene: 0, character: 'ADA' }),
      candidate({ scene: 4, cue: 40, character: 'ADA' }),
      candidate({ scene: 4, cue: 41, character: 'BEN' }),
    ];
    expect(pickQuotes(list, 8, noAct).map((p) => p.character)).toEqual(['ADA', 'BEN']);
  });

  test('a script with only dual dialogue has no lines and no signatures', () => {
    const source = `INT. SHED - NIGHT

OREN
The boat is ready when you are.

TESSA ^
The boat is never ready, and nor am I.

EXT. QUAY - DAY

OREN
We row out at first light, then.

TESSA ^
We row out when the fog has gone.
`;
    const map = build(source).map;
    expect(map.quotes).toEqual([]);
    expect(map.characters.map((c) => c.signature)).toEqual([null, null]);
  });
});

describe('the lines in the model', () => {
  const harbour = build(HARBOUR).map;

  test('each scene line points at a scene that points back', () => {
    const placed = harbour.quotes.filter((q) => q.inScene);
    expect(placed.length).toBeGreaterThan(0);
    expect(placed.length).toBeLessThanOrEqual(12);
    placed.forEach((quote) => {
      const i = harbour.quotes.indexOf(quote);
      expect(harbour.scenes[quote.scene]?.quote).toBe(i);
      expect(harbour.characters[quote.character]).toBeDefined();
    });
    expect(harbour.scenes.filter((s) => s.quote !== null)).toHaveLength(placed.length);
  });

  test('a signature is the character’s best line, a marked one first', () => {
    for (const c of harbour.characters) {
      if (c.signature === null) continue;
      expect(harbour.quotes[c.signature]?.character).toBe(harbour.characters.indexOf(c));
    }
    const source = HARBOUR.replace(
      'You were meant to keep it lit.',
      'You were meant to keep it lit. [[Quote]]',
    );
    const map = build(source).map;
    const mara = map.characters.find((c) => c.key === 'MARA');
    expect(map.quotes[mara?.signature as number]).toMatchObject({
      text: 'You were meant to keep it lit.',
      marked: true,
    });
  });

  test('the same script gives the same lines', () => {
    expect(build(HARBOUR).map.quotes).toEqual(harbour.quotes);
  });

  test('lines off empties the lines and the signatures', () => {
    const map = build(HARBOUR, {
      include: { summaries: true, lines: false, threads: true, contact: false },
    }).map;
    expect(map.quotes).toEqual([]);
    expect(map.scenes.every((s) => s.quote === null)).toBe(true);
    expect(map.characters.every((c) => c.signature === null)).toBe(true);
  });
});
