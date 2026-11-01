import { sceneIndex } from '@drafter/outline';
import { describe, expect, test } from 'vitest';
import { intervalOf, movesSentence, type StoryMap, settingOf } from '../src';
import { BOATHOUSE, build, HARBOUR } from './scripts';

// A play's own parts (story-map design §5.1; Calls 16, 27, 28): the interval, the settings, who's
// on stage and when, and the pairs who share the stage most.

const PLAY_META = `
/* drafter
{"v":1,"template":"stage-play-standard"}
*/
`;

/**
 * An original two-act play of six scenes at a ferry crossing, written so each scene's lines can
 * be counted: every action paragraph and every speech is one line, except where it says.
 *
 * Scene 1 (16 lines): ROOK is named at line 0 and goes out at line 11; INES comes in at line 3
 * and leaves at line 8; PELL first speaks at line 6 and stays.
 */
const FERRY = `Title: The Ferry Bell
Author: Tamsin Royle

# Act One

## The waiting room

A bench and a timetable. ROOK reads.

ROOK
The four o'clock is never on time.

INES comes in with a wet umbrella.

INES
It is raining sideways.

PELL
It always is, on this side.

Ines leaves by the side door.

ROOK
She forgot her umbrella.

ROOK goes out to the pier.

PELL
Nobody ever waits for me.
And nobody ever will.
Not here.

## Scene 2

The same, an hour later.

ROOK
Still nothing.

Pell enters, shaking off the rain.

ROOK
You again.

PELL
Me again.

# Act Two

## Scene 3

A bench on the quay, at dusk.

INES
The bell has stopped.

PELL
Then the ferry is in.

Exeunt.

ROOK
Wait for me.

## Scene 4

ROOK and PELL at the table.

ROOK
Your move.

PELL
I moved.

## INT. PARLOUR - EVENING

INES and ROOK by the fire.

INES
Is it over?

All exit.

PELL
It is.

## the waiting room

PELL
Back where we started.

INES
We never left.
${PLAY_META}`;

const ferry = build(FERRY, { title: 'The Ferry Bell' });

/** The stage line of the character `key` in the scene at `s`. */
function lineOf(map: StoryMap, s: number, key: string) {
  const c = map.characters.findIndex((ch) => ch.key === key);
  return map.scenes[s]?.stage?.find((l) => l.character === c);
}

/** A play of `count` acts, one scene each; `extra[a]` goes in Act a+1's scene. */
function acts(count: number, extra: Record<number, string> = {}): string {
  const words = ['One', 'Two', 'Three', 'Four'];
  const out: string[] = [];
  for (let a = 0; a < count; a++) {
    out.push(`# Act ${words[a]}`, '', `## Scene ${a + 1}`, '', 'HESTER waits.', '');
    out.push('HESTER', 'Still here.', '');
    if (extra[a]) out.push(extra[a] as string, '');
  }
  return out.join('\n') + PLAY_META;
}

const intervalIn = (source: string) => build(source).map.interval;

describe('the interval', () => {
  test('a two-act play has an interval after Act 1', () => {
    expect(ferry.map.kind).toBe('play');
    expect(ferry.map.interval).toMatchObject({ afterAct: 1 });
    expect(build(BOATHOUSE).map.interval).toMatchObject({ afterAct: 1 });
    const { doc, template, layout, map } = ferry;
    expect(intervalOf(doc, sceneIndex(doc, template, layout), map.acts)).toEqual({
      afterAct: 1,
      afterScene: 2,
    });
  });

  test('[[Interval]] moves it and [[No interval]] turns it off', () => {
    expect(intervalIn(acts(3, { 1: '[[Interval]]' }))).toMatchObject({ afterAct: 2 });
    expect(intervalIn(acts(2, { 0: '[[No interval]]' }))).toBeNull();
    // Any case and spacing; a note with more in it is no mark.
    expect(intervalIn(acts(3, { 1: '[[  interval ]]' }))).toMatchObject({ afterAct: 2 });
    expect(intervalIn(acts(3, { 1: '[[Interval: after the storm]]' }))).toMatchObject({
      afterAct: 1,
    });
  });

  test('interval notes in odd places', () => {
    // One act: none.
    expect(intervalIn(acts(1))).toBeNull();
    expect(intervalIn(acts(1, { 0: '[[Interval]]' }))).toBeNull();
    // Inside a scene of Act 2 of three: after Act 2.
    expect(intervalIn(acts(3, { 1: 'HESTER sits. [[Interval]]' }))).toMatchObject({ afterAct: 2 });
    // Twice: the first.
    expect(intervalIn(acts(3, { 1: '[[Interval]]', 2: '[[Interval]]' }))).toMatchObject({
      afterAct: 2,
    });
    // In the last act: never after it, so none.
    expect(intervalIn(acts(3, { 2: '[[Interval]]' }))).toBeNull();
    // [[No interval]] anywhere wins.
    expect(intervalIn(acts(3, { 0: '[[Interval]]', 2: '[[No interval]]' }))).toBeNull();
    // Before the first act: Act 1's.
    expect(intervalIn(`[[Interval]]\n\n${acts(3)}`)).toMatchObject({ afterAct: 1 });
  });

  test('a one-act play, or one with no acts, has an interval only where it is marked', () => {
    const scenes = (extra = '') =>
      [1, 2, 3]
        .map(
          (n) =>
            `## Scene ${n}\n\nHESTER waits.\n\nHESTER\nStill here.\n${n === 2 ? `\n${extra}\n` : ''}`,
        )
        .join('\n');
    // One act marked.
    expect(intervalIn(`# Act One\n\n${scenes()}${PLAY_META}`)).toBeNull();
    expect(intervalIn(`# Act One\n\n${scenes('[[Interval]]')}${PLAY_META}`)).toEqual({
      afterAct: null,
      afterScene: 2,
    });
    // No acts at all.
    expect(intervalIn(`${scenes()}${PLAY_META}`)).toBeNull();
    expect(intervalIn(`${scenes('[[Interval]]')}${PLAY_META}`)).toEqual({
      afterAct: null,
      afterScene: 2,
    });
    // Never before the first scene or after the last.
    expect(intervalIn(`[[Interval]]\n\n${scenes()}${PLAY_META}`)).toBeNull();
    expect(intervalIn(`${scenes()}\n[[Interval]]\n${PLAY_META}`)).toBeNull();
  });

  test('a screenplay never has an interval', () => {
    expect(build(HARBOUR).map.interval).toBeNull();
    expect(build(`${HARBOUR}\n[[Interval]]\n`).map.interval).toBeNull();
  });
});

describe('acts, only as the writer marks them', () => {
  test('acts are the # sections, or headings that start "Act"', () => {
    expect(build(HARBOUR).map.acts).toHaveLength(3);
    // Sequences at ## only: no acts.
    const sequences = build(
      `## The Harbour\n\nINT. ROOM - DAY\n\nA chair.\n\n## The Storm\n\nEXT. WALL - NIGHT\n\nRain.\n`,
    ).map;
    expect(sequences.acts).toEqual([]);
    expect(sequences.scenes.every((s) => s.act === null)).toBe(true);
    // A heading that says "Act", at any level, is an act.
    const named = build(
      `## Act One\n\nINT. ROOM - DAY\n\nA chair.\n\n## Act Two\n\nEXT. WALL - NIGHT\n\nRain.\n`,
    ).map;
    expect(named.acts.map((a) => a.scenes)).toEqual([[0], [1]]);
    // "Actors" is not "Act".
    expect(build(`## Actors Arrive\n\nINT. ROOM - DAY\n\nA chair.\n`).map.acts).toEqual([]);
    // A play of ## scenes and no # acts is one run.
    const play = build(
      `## Scene 1\n\nHESTER waits.\n\n## Scene 2\n\nFINCH waits.\n${PLAY_META}`,
    ).map;
    expect(play.acts).toEqual([]);
    expect(play.interval).toBeNull();
  });
});

describe("who's on stage", () => {
  test('"goes" is an exit only as "goes out", "goes off", or at the end', () => {
    const scene = (direction: string) =>
      build(
        `## Scene 1\n\nPELL and ROOK wait.\n\nPELL\nHm.\n\n${direction}\n\nROOK\nWell.\n\nROOK\nWell then.\n${PLAY_META}`,
      ).map;
    const pell = (direction: string) => lineOf(scene(direction), 0, 'PELL');
    expect(pell('PELL goes to the window.')).toMatchObject({ from: 0, to: 1 });
    expect(pell('PELL goes out.')?.to).toBeLessThan(1);
    expect(pell('PELL goes off into the rain.')?.to).toBeLessThan(1);
    expect(pell('PELL goes.')?.to).toBeLessThan(1);
  });

  test('a verb before a name counts only when it opens the sentence or is unclaimed', () => {
    const map = build(
      `## Scene 1\n\nPELL and ROOK wait.\n\nPELL\nHm.\n\nPELL leaves ROOK alone.\n\nROOK\nWell.\n\nExit ROOK.\n\nINES\nGone.\n${PLAY_META}`,
    ).map;
    // Lines: 0 wait, 1–2 Pell, 3 leaves, 4–5 Rook, 6 exit, 7–8 Ines: 9 in all.
    expect(lineOf(map, 0, 'PELL')).toMatchObject({ from: 0, to: 4 / 9 });
    expect(lineOf(map, 0, 'ROOK')).toMatchObject({ from: 0, to: 7 / 9 });
  });

  test('on stage from first speech or mention to "exits"', () => {
    const { map } = ferry;
    const at = (n: number) => n / 16;
    expect(lineOf(map, 0, 'ROOK')).toMatchObject({ from: 0, to: at(12) });
    expect(lineOf(map, 0, 'INES')).toMatchObject({ from: at(3), to: at(9) });
    expect(lineOf(map, 0, 'PELL')).toMatchObject({ from: at(6), to: 1 });
    // In the chips' order.
    const chars = map.scenes[0]?.stage?.map((l) => l.character) ?? [];
    expect(chars).toEqual([...chars].sort((a, b) => a - b));
    expect(chars).toHaveLength(3);
  });

  test('"enters" moves an arrival earlier than the first speech', () => {
    // Scene 2 has 8 lines: Pell enters at line 3 and first speaks at line 6.
    expect(lineOf(ferry.map, 1, 'PELL')).toMatchObject({ from: 3 / 8, to: 1 });
    expect(lineOf(ferry.map, 1, 'ROOK')).toMatchObject({ from: 1 / 8, to: 1 });
  });

  test('Exeunt ends everyone', () => {
    // Scene 3 has 8 lines: Exeunt at line 5, then Rook speaks.
    const { map } = ferry;
    expect(lineOf(map, 2, 'INES')).toMatchObject({ from: 1 / 8, to: 6 / 8 });
    expect(lineOf(map, 2, 'PELL')).toMatchObject({ from: 3 / 8, to: 6 / 8 });
    expect(lineOf(map, 2, 'ROOK')).toMatchObject({ from: 6 / 8, to: 1 });
    // "All exit": Scene 5 has 6 lines, all exit at line 3.
    expect(lineOf(map, 4, 'INES')).toMatchObject({ from: 0, to: 4 / 6 });
    expect(lineOf(map, 4, 'ROOK')).toMatchObject({ from: 0, to: 4 / 6 });
    expect(lineOf(map, 4, 'PELL')).toMatchObject({ from: 4 / 6, to: 1 });
  });

  test('the sentence says who moves and when', () => {
    const moves = ferry.map.scenes[0]?.moves ?? '';
    expect(moves).toContain('Pell enters halfway');
    expect(moves).toContain('Ines comes in, then leaves');
    expect(moves).toContain('Rook leaves near the end');
    expect(moves.split('. ')).toHaveLength(3);
    expect(
      movesSentence(
        [
          { character: 0, from: 0.1, to: 1 },
          { character: 1, from: 0, to: 0.6 },
          { character: 2, from: 0.6, to: 1 },
        ],
        ['Ada', 'Mr. Fell', 'Bo'],
      ),
    ).toBe('Ada enters early. Mr. Fell leaves late. Bo enters late');
  });

  test('nobody moves, no sentence', () => {
    expect(ferry.map.scenes[3]?.moves).toBeNull();
    expect(ferry.map.scenes[3]?.stage).toHaveLength(2);
    expect(movesSentence([{ character: 0, from: 0, to: 1 }], ['Ada'])).toBeNull();
    expect(movesSentence([], [])).toBeNull();
    // A screenplay keeps its chips: no stage lines.
    expect(build(HARBOUR).map.scenes.every((s) => s.stage === null && s.moves === null)).toBe(true);
  });
});

describe('settings and pairs', () => {
  test('settings come from the heading, the title, or the first line', () => {
    const { doc, template, layout, map } = ferry;
    const index = sceneIndex(doc, template, layout);
    const scene = (s: number) => index.scenes[s] as (typeof index.scenes)[number];
    expect(settingOf(scene(0), doc, template, null)).toMatchObject({
      name: 'The waiting room',
      time: null,
    });
    expect(settingOf(scene(2), doc, template, null)).toMatchObject({
      name: 'A bench on the quay',
      time: 'dusk',
    });
    expect(settingOf(scene(4), doc, template, null)).toEqual({ name: 'Parlour', time: 'EVENING' });
    // "Scene 4" is no setting, and a first line naming someone in capitals isn't either.
    expect(settingOf(scene(3), doc, template, null)).toBeNull();
    expect(map.scenes.map((s) => s.place)).toEqual([
      'The waiting room',
      'The waiting room',
      'A bench on the quay',
      null,
      'Parlour',
      'The waiting room',
    ]);
    // The time split off a first line is the scene's.
    expect(map.scenes[2]).toMatchObject({ time: 'Dusk', timeKind: 'twilight' });
    // Settings are grouped as places are, shown as first written.
    expect(map.places.map((p) => [p.name, p.scenes])).toEqual([
      ['The waiting room', 3],
      ['A bench on the quay', 1],
      ['Parlour', 1],
    ]);
    expect(map.facts.places).toBe(3);
  });

  test('"The same" keeps the setting before', () => {
    const { doc, template, layout } = ferry;
    const index = sceneIndex(doc, template, layout);
    const second = index.scenes[1] as (typeof index.scenes)[number];
    expect(settingOf(second, doc, template, 'The waiting room')).toMatchObject({
      name: 'The waiting room',
      time: null,
    });
    expect(settingOf(second, doc, template, null)).toBeNull();
  });

  test("a play's pairs are ranked by the scenes they share the stage in", () => {
    const { map } = ferry;
    const name = (i: number) => map.characters[i]?.key;
    // On stage together, not just in the same scene: in Scene 3, Rook comes on as the others go.
    const pairs = map.pairs.map((p) => [[name(p.a), name(p.b)].sort().join('+'), p.scenes]);
    expect(pairs.map(([, n]) => n)).toEqual([3, 3, 2]);
    expect(new Map(pairs as Array<[string, number]>)).toEqual(
      new Map([
        ['PELL+ROOK', 3],
        ['INES+PELL', 3],
        ['INES+ROOK', 2],
      ]),
    );
    // A screenplay's pairs are every pair of leads.
    const screen = build(HARBOUR).map;
    const leads = screen.characters.filter((c) => c.lead).length;
    expect(screen.pairs).toHaveLength((leads * (leads - 1)) / 2);
    for (const p of screen.pairs) {
      expect(p.a).toBeLessThan(p.b);
      const a = new Set(screen.characters[p.a]?.presence.map((x) => x.scene));
      const shared = screen.characters[p.b]?.presence.filter((x) => a.has(x.scene)).length;
      expect(p.scenes).toBe(shared);
    }
  });
});
