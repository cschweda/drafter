import { castOf } from '@drafter/cast';
import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { estimateSeconds, linesPerPage, sceneIndex } from '@drafter/outline';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { fountainScript } from '../../../fixtures/generators/fountain';
import { buildStoryMap, STORY_MAP_LIMITS, type StoryMap } from '../src';
import { BOATHOUSE, build, generated, HARBOUR, NO_ACTS, options, screenplay } from './scripts';

// The story map's model (story-map design §3, §4, §5): acts, scenes, places, and people, read
// from the scene index and the cast, in plain words.

const harbour = build(HARBOUR);
const play = build(BOATHOUSE, { title: 'The Boathouse' });

/** Every string anywhere in `value`. */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === 'object')
    for (const v of Object.values(value)) strings(v, out);
  return out;
}

const byKey = (map: StoryMap, key: string) => map.characters.find((c) => c.key === key);

describe('the story map model', () => {
  test('acts, scenes, and pages come from the scene index', () => {
    const { doc, template, layout, map } = harbour;
    const index = sceneIndex(doc, template, layout);
    expect(map.kind).toBe('screenplay');
    expect(map.scenes).toHaveLength(14);
    expect(map.scenes.map((s) => s.n)).toEqual(index.scenes.map((_, i) => i + 1));
    expect(map.acts.map((a) => a.n)).toEqual([1, 2, 3]);
    expect(map.acts.map((a) => a.scenes.length)).toEqual([7, 6, 1]);
    // Every scene once, in order, across the acts.
    expect(map.acts.flatMap((a) => a.scenes)).toEqual(map.scenes.map((_, i) => i));
    for (const act of map.acts) {
      const eighths = act.scenes.reduce((n, s) => n + (index.scenes[s]?.pages?.eighths ?? 0), 0);
      expect(act.pages).toBeCloseTo(eighths / 8);
      expect(act.empty).toBe(false);
    }
    // The scenes run end to end along the page axis.
    for (let i = 1; i < map.scenes.length; i++) {
      expect(map.scenes[i]?.from).toBeCloseTo(map.scenes[i - 1]?.to as number);
    }
    expect(map.axis).toBeCloseTo(map.scenes.at(-1)?.to as number);
    expect(map.facts.scenes).toBe(14);
    expect(map.facts.pages).toBe(layout.pages.filter((p) => p.number > 0).length);
    expect(map.facts.minutes).toBe(Math.round(map.scenes.reduce((n, s) => n + s.minutes, 0)));
    expect(map.scenes[1]).toMatchObject({
      place: 'Lighthouse, Lamp Room',
      time: 'Night',
      timeKind: 'night',
      inside: 'Inside',
    });
    // CONTINUOUS takes the scene before's time; a locked number is never part of the place.
    expect(map.scenes[2]).toMatchObject({ place: 'Harbour Office', time: null, timeKind: 'night' });
    expect(map.scenes[6]?.place).toBe('Harbour Office');
    expect(map.title).toBe('Slack Tide');
    expect(map.writer).toEqual({ name: 'Wren Abernathy', initials: 'WA' });
    expect(map.draftLabel).toBe('Draft 01');
    expect(map.shortId).toBe('a3f9c2e');
  });

  test('a cold open counts as Act 1', () => {
    const { map } = harbour;
    // The breakwater at dawn comes before "# Act One" and is Act 1's first scene.
    expect(map.scenes[0]).toMatchObject({ act: 1, place: 'Breakwater', timeKind: 'twilight' });
    expect(map.acts[0]?.scenes[0]).toBe(0);
    expect(map.scenes.filter((s) => s.act === 1)).toHaveLength(7);
    expect(map.scenes.map((s) => s.act)).toEqual([1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 3]);
  });

  test('an act title drops its "Act One:" label', () => {
    expect(harbour.map.acts.map((a) => a.title)).toEqual(['The Lamp', 'The Storm', 'High Water']);
    const titled = (heading: string) => build(`# ${heading}\n\nINT. ROOM - DAY\n\nA chair.\n`).map;
    expect(titled('ACT I. Arrivals').acts[0]?.title).toBe('Arrivals');
    expect(titled('Act 2 - Departures').acts[0]?.title).toBe('Departures');
    expect(titled('act three — Home').acts[0]?.title).toBe('Home');
    expect(titled('Act One').acts[0]?.title).toBe('');
    expect(titled('Actors Arrive').acts[0]?.title).toBe('Actors Arrive');
    expect(titled('Act Ivy').acts[0]?.title).toBe('Act Ivy');
    expect(titled('Act Civil War').acts[0]?.title).toBe('Act Civil War');
    expect(titled('Act Victory').acts[0]?.title).toBe('Act Victory');
    expect(titled('Act XIV: Late').acts[0]?.title).toBe('Late');
    expect(titled('Act iv').acts[0]?.title).toBe('');
  });

  test('a script with no acts is one run', () => {
    const { map } = build(NO_ACTS);
    expect(map.acts).toEqual([]);
    expect(map.scenes).toHaveLength(3);
    expect(map.scenes.every((s) => s.act === null)).toBe(true);
  });

  test('an act with no scenes is empty', () => {
    const { map } = build(`# Act One\n\nINT. ROOM - DAY\n\nA chair.\n\n# Act Two\n`);
    expect(map.acts.map((a) => [a.n, a.scenes.length, a.empty])).toEqual([
      [1, 1, false],
      [2, 0, true],
    ]);
    expect(map.acts[1]?.pages).toBe(0);
  });

  test('scene minutes follow the rate', () => {
    const { doc, template, layout } = harbour;
    const index = sceneIndex(doc, template, layout);
    const map = buildStoryMap({
      ...harbour.input,
      options: options({ rates: { minutesPerPage: 1.2, wordsPerMinute: 150 } }),
    });
    map.scenes.forEach((scene, i) => {
      expect(scene.minutes).toBeCloseTo(((index.scenes[i]?.pages?.eighths ?? 0) / 8) * 1.2);
    });
    // A two-page scene at 1.2 minutes a page is 2.4 minutes.
    const long = build(`INT. ROOM - DAY\n\n${'A chair creaks.\n'.repeat(400)}`, {
      rates: { minutesPerPage: 1.2, wordsPerMinute: 150 },
    });
    const eighths = sceneIndex(long.doc, long.template, long.layout).scenes[0]?.pages?.eighths;
    expect(long.map.scenes[0]?.minutes).toBeCloseTo(((eighths as number) / 8) * 1.2);

    // A play is timed from its dialogue, as Stats times one.
    const playIndex = sceneIndex(play.doc, play.template, play.layout);
    play.map.scenes.forEach((scene, i) => {
      const timing = playIndex.scenes[i]?.timing as Parameters<typeof estimateSeconds>[0];
      expect(scene.minutes).toBeCloseTo(estimateSeconds(timing, 150) / 60);
    });
    // Character minutes are their scenes' minutes added up.
    for (const c of play.map.characters) {
      const sum = c.presence.reduce((n, p) => n + (play.map.scenes[p.scene]?.minutes ?? 0), 0);
      expect(c.minutes).toBeCloseTo(sum);
    }
  });

  test('leads are the top eight by screen time and get palette slots in order', () => {
    const { map, doc, template, layout } = harbour;
    const index = sceneIndex(doc, template, layout);
    const cast = castOf(index, doc, template, linesPerPage(layout), () => undefined);
    // Ten characters are kept; the first eight by screen time lead.
    expect(map.characters).toHaveLength(10);
    const minutes = map.characters.map((c) => c.minutes);
    expect(minutes).toEqual([...minutes].sort((a, b) => b - a));
    expect(map.characters.filter((c) => c.lead)).toHaveLength(STORY_MAP_LIMITS.leads);
    expect(map.characters.slice(0, 8).every((c) => c.lead)).toBe(true);
    expect(byKey(map, 'JUNO')?.lead).toBe(false);
    expect(byKey(map, 'JUNO')?.color).toBeNull();
    // Screen time is the cast's, at the page rate.
    for (const c of map.characters) {
      const eighths = cast.figures.get(c.key)?.screenEighths ?? 0;
      expect(c.minutes).toBeCloseTo(eighths / 8);
    }
    // Slots go in order to the leads that aren't only a voice.
    const colored = map.characters.filter((c) => c.lead && !c.voice);
    expect(colored.map((c) => c.color)).toEqual(colored.map((_, i) => i));
    expect(byKey(map, 'MARA')).toMatchObject({
      name: 'Mara',
      first: 'Mara',
      rest: '',
      initial: 'M',
      color: 0,
    });
    // Chips: the scene's people, leads first.
    const lamp = map.scenes[1]?.chips ?? [];
    expect(lamp.map((i) => map.characters[i]?.key).sort()).toEqual(['MARA', 'NELL', 'TEO']);
    expect(lamp).toEqual([...lamp].sort((a, b) => a - b));
  });

  test('a V.O.-only lead is a white ring', () => {
    const nell = byKey(harbour.map, 'NELL');
    expect(nell).toMatchObject({ lead: true, voice: true, color: null });
    expect(harbour.map.characters.filter((c) => c.voice).map((c) => c.key)).toEqual(['NELL']);
    // One cue without the extension and they're no longer only a voice.
    const seen = build(`${HARBOUR}\nINT. TOWER - NIGHT\n\nNELL\nI can see you from here.\n`).map;
    expect(byKey(seen, 'NELL')?.voice).toBe(false);
  });

  test('a silent one-scene extra is left out', () => {
    expect(byKey(harbour.map, 'DOCKHAND')).toBeUndefined();
    expect(harbour.map.facts.characters).toBe(10);
    expect(harbour.map.scenes[3]?.chips.map((i) => harbour.map.characters[i]?.key)).not.toContain(
      'DOCKHAND',
    );
  });

  test('shares add up to 100', () => {
    for (const { map } of [harbour, play, build(generated(40, 30, 14))]) {
      expect(map.characters.reduce((n, c) => n + c.share, 0)).toBe(100);
      expect(map.characters.every((c) => Number.isInteger(c.share))).toBe(true);
    }
  });

  test('a screenplay with times has two lanes and a split by minutes', () => {
    const { map } = harbour;
    expect(map.lanes).toBe('two');
    const known = map.scenes.filter((s) => s.inside !== null);
    const inside = known.filter((s) => s.inside === 'Inside');
    const total = known.reduce((n, s) => n + s.minutes, 0);
    expect(map.split?.indoors).toBe(
      Math.round((inside.reduce((n, s) => n + s.minutes, 0) / total) * 100),
    );
    expect(map.split?.night).toBeGreaterThan(0);
    expect(map.split?.night).toBeLessThan(100);
  });

  test('a play with few times has one lane and no split', () => {
    const { map } = play;
    expect(map.kind).toBe('play');
    expect(map.lanes).toBe('one');
    expect(map.split).toBeNull();
    expect(map.acts.map((a) => a.scenes.length)).toEqual([3, 3]);
    expect(map.scenes.map((s) => s.title)).toEqual([
      'Scene 1',
      'Scene 2',
      'Scene 3',
      'Scene 4',
      'Scene 5',
      'Scene 6',
    ]);
    // A title stays with the name.
    expect(byKey(map, 'MRS. AUBERT')).toMatchObject({
      name: 'Mrs. Aubert',
      first: 'Mrs. Aubert',
      rest: '',
    });
    const doctor = build('INT. CLINIC - DAY\n\nDR. RHEE OKAFOR\nSit down.\n').map;
    expect(doctor.characters[0]).toMatchObject({ first: 'Dr. Rhee', rest: 'Okafor' });
  });

  test('places are sized in five steps, the largest 5', () => {
    const { map } = harbour;
    expect(map.places[0]?.size).toBe(5);
    const minutes = map.places.map((p) => p.minutes);
    expect(minutes).toEqual([...minutes].sort((a, b) => b - a));
    const top = map.places[0]?.minutes as number;
    for (const p of map.places) {
      expect(p.size).toBe(Math.max(1, Math.ceil((p.minutes / top) * 5)));
    }
    expect(map.places.map((p) => p.name)).toContain("Lighthouse, Keeper's Kitchen");
    expect(map.facts.places).toBe(map.places.length);
    expect(map.placesMore).toBe(0);

    // Past 24, the rest are counted.
    const many = build(generated(30, 30, 6)).map;
    expect(many.places).toHaveLength(STORY_MAP_LIMITS.places);
    expect(many.placesMore).toBe(6);
    expect(many.facts.places).toBe(30);
  });

  test('the pace caption names the longest scene and the usual run', () => {
    expect(harbour.map.pace).toMatch(/^Longest: scene \d+, (\d+ min|under a minute)\. Most run /);
    const even = build(`INT. A - DAY\n\nA chair.\n\nINT. B - DAY\n\nA chair.\n`).map;
    expect(even.pace).toBe('Longest: scene 1, under a minute. Most run under a minute.');
  });

  test('the same script gives the same model', () => {
    fc.assert(
      fc.property(fountainScript, (text) => {
        const doc = parse(text);
        const layout = paginate(doc, screenplay);
        const input = { doc, template: screenplay, layout, options: options() };
        expect(buildStoryMap(input)).toEqual(buildStoryMap(input));
      }),
      { numRuns: 40 },
    );
  });

  test('no screenwriting words in any string the model holds', () => {
    const banned = /\b(INT|EXT)\.|\bV\.O\.|\bO\.S\.|CONT'D|slugline|eighths/i;
    for (const { map } of [harbour, play, build(NO_ACTS), build(generated(20, 12, 5))]) {
      for (const s of strings(map)) expect(s, s).not.toMatch(banned);
    }
  });

  test('no screenwriting words come through from the action or the headings', () => {
    const banned = /\b(INT|EXT|EST)\.|\bI\/E\b|\bV\.O\.|\bO\.S\.|\bO\.C\.|CONT['’]?D|\(MORE\)/i;
    const hostile = `INT. HOUSE - KITCHEN / EXT. GARDEN - DAY

A phone rings O.S. ANNA (30s), a nurse who hears the V.O. of her past, turns.

ANNA
Who is it this time?

EXT. CAR / INT. GARAGE - LATER THAT NIGHT
= Anna (CONT'D) talks to the dark, and a voice (O.C.) answers.

ANNA (CONT'D)
I can hear you breathing.

INT./EXT. VAN - NIGHT

BEN (O.S.) knocks twice. ANNA'S keys drop. (MORE)

BEN (O.S.)
Open the door, please.
`;
    const { map } = build(hostile);
    for (const s of strings(map)) expect(s, s).not.toMatch(banned);
    expect(map.scenes.map((s) => s.place)).toEqual([
      'House, Kitchen, Garden',
      'Car, Garage',
      'Van',
    ]);
    // Later that night: the scene before's colour, and one place, not two.
    expect(map.scenes[1]).toMatchObject({ time: 'Later That Night', timeKind: 'day' });
    expect(map.places.map((p) => p.name)).not.toContain('Car, Garage, Later That Night');
    expect(map.scenes[0]?.what).toBe('A phone rings.');
    expect(map.characters.find((c) => c.key === 'ANNA')).toMatchObject({ age: '30s' });
  });

  test('nothing private reaches the model: notes, the boneyard, and the marks', () => {
    const secret = ' [[SECRET]] /* BONE */';
    const screen = `Title: Hidden${secret}
Author: Ivo Marsh${secret}
Contact: ivo@example.com${secret}

# Act One: Dark${secret}
= The lights go out.${secret}

## A part${secret}

INT. CELLAR${secret} - NIGHT

= Ivo counts the jars.${secret} Then he stops.

IVO (30s)${secret}, a cellarman, counts jars.${secret}

IVO${secret}
(quietly)${secret}
Forty jars, and one of them is singing.${secret} [[Quote]]
[[No quote]]

~Down in the cellar the jars all sing.${secret}

> THE END${secret} <
`;
    const stage = `Title: Hidden Stage
Author: Ivo Marsh

# Act One${secret}

## The cellar${secret}

IVO enters.${secret}

IVO
The jars are quiet tonight, thank goodness.${secret}

/* drafter
{"v":1,"template":"stage-play-standard"}
*/
`;
    const banned = /SECRET|BONE|\[\[|\]\]|\/\*|\*\/|\bquote\b/i;
    for (const source of [screen, stage]) {
      const all = {
        a: build(source),
        b: build(source, {
          include: { summaries: true, lines: true, threads: true, contact: true },
          contact: 'ivo@example.com',
        }),
      };
      for (const { map } of Object.values(all)) {
        expect(map.scenes.length).toBeGreaterThan(0);
        for (const s of strings(map)) expect(s, s).not.toMatch(banned);
      }
    }
  });

  test('the writer, the contact, and the date are plain', () => {
    const map = build(HARBOUR, {
      include: { summaries: true, lines: true, threads: true, contact: true },
      contact: 'wren@example.com',
      updated: Date.UTC(2026, 10, 1),
      draft: { number: 103, id: 'b'.repeat(64) },
    }).map;
    expect(map.contact).toEqual({ text: 'wren@example.com', mailto: 'mailto:wren@example.com' });
    expect(map.updated).toBe('1 Nov 2026');
    expect(map.draftLabel).toBe('Draft 103');
    expect(map.shortId).toBe('bbbbbbb');
    expect(build(HARBOUR, { contact: 'wren@example.com' }).map.contact).toBeNull();
    const odd = build(HARBOUR, {
      include: { summaries: true, lines: true, threads: true, contact: true },
      contact: 'wren@example.com?subject=hi',
    }).map;
    expect(odd.contact).toEqual({ text: 'wren@example.com?subject=hi', mailto: null });
    // No author: no writer.
    expect(build(NO_ACTS).map.writer).toBeNull();
  });
});
