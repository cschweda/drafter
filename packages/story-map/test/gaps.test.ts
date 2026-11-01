import { sceneIndex } from '@drafter/outline';
import { describe, expect, test } from 'vitest';
import { defaultStatus, gapsOf, isPlanned, type MapGaps, STORY_MAP_LIMITS } from '../src';
import { build, HARBOUR } from './scripts';

// What isn't written yet (story-map design §6): empty acts, planned scenes, to-dos, and the
// planned length; the progress read, the sentence, and the status they give.

/**
 * An original three-act screenplay with every kind of gap: Act One has a written scene and a stub
 * with a synopsis; Act Two has a written scene with a to-do, a heading with only a note, and a
 * bare heading; Act Three has nothing under it.
 */
const SHIPYARD = `Title: Low Water
Author: Ada Pryce

# Act One

INT. BOATYARD - DAY

FERN paints a hull the colour of wet slate.

FERN
Two more coats and she floats.

INT. LOCATION - DAY

= Fern finds the leak.

# Act Two

EXT. SLIPWAY - NIGHT

OSRIC hauls a rope up the ramp. [[TODO: the gull-feather speech goes here]]

OSRIC
Pull when I say pull.

EXT. SLIPWAY - LATER

[[Ask about the tide tables]]

INT. SHED - NIGHT

# Act Three
`;

/** Two written acts, and a third with two planned scenes and a #todo-tagged written one. */
const TWO_WRITTEN = `# Act One

INT. KILN - DAY

ABEL stacks bricks.

ABEL
Hot.

# Act Two

INT. KILN - NIGHT

ABEL sleeps by the door.

# Act Three

EXT. YARD - DAWN

ABEL sweeps ash. [[check the ending of this #todo]]

INT. KILN - DAY

EXT. YARD - DAY

= Abel leaves.
`;

/** Only act headings and planned scenes: nothing is written yet. */
const PLANNED_ONLY = `Title: Nothing Yet

# Act One

INT. KILN - DAY

INT. KILN - NIGHT

= Abel lights it.

INT. LOCATION - DAY

= Somebody comes.

EXT. YARD - DAWN

[[a quiet scene]]
`;

/** Every number anywhere in `value`. */
function numbers(value: unknown, out: number[] = []): number[] {
  if (typeof value === 'number') out.push(value);
  else if (Array.isArray(value)) for (const v of value) numbers(v, out);
  else if (value && typeof value === 'object')
    for (const v of Object.values(value)) numbers(v, out);
  return out;
}

/**
 * An original script of acts split by `|`, each a run of scenes: `w` written (about `pages` pages
 * of action), `p` planned (a heading and a synopsis), `t` written with a TODO, `-` an empty act.
 * One act or more, as `#` acts, unless `acts` is false; a play with `play`.
 */
function drafted(spec: string, pages = 1, play = false, acts = true): string {
  const words = ['One', 'Two', 'Three', 'Four', 'Five'];
  const out: string[] = ['Title: Long Reach', ''];
  let n = 0;
  spec.split('|').forEach((act, a) => {
    if (acts) out.push(`# Act ${words[a]}`, '');
    for (const kind of act.trim().split(/\s+/)) {
      if (kind === '-' || kind === '') continue;
      n++;
      out.push(play ? `## Scene ${n}` : `INT. ROOM NUMBER ${n} - DAY`, '');
      if (kind === 'p') {
        out.push('= Somebody finds the key.', '');
        continue;
      }
      out.push(`GRETA opens window ${n}.${kind === 't' ? ' [[TODO: tighten]]' : ''}`, '');
      for (let l = 0; l < pages * 50; l++)
        out.push(`The rain keeps on, a little harder, ${l + 1}.`);
      out.push('', 'GRETA', 'Still raining.', '');
    }
  });
  if (play) out.push('/* drafter', '{"v":1,"template":"stage-play-standard"}', '*/');
  return out.join('\n');
}

describe('gaps', () => {
  test('an act with no scenes is an empty act', () => {
    const { map } = build(SHIPYARD);
    expect(map.acts.map((a) => a.empty)).toEqual([false, false, true]);
    expect(map.gaps.emptyActs).toEqual([3]);
    expect(map.gaps.found).toBe(true);
  });

  test('a heading-only scene, a heading and synopsis, a heading and notes, and a stub are planned', () => {
    const { doc, template, layout, map } = build(SHIPYARD);
    const index = sceneIndex(doc, template, layout);
    expect(index.scenes.map(isPlanned)).toEqual([false, true, false, true, true]);
    expect(map.gaps.planned).toEqual([2, 4, 5]);
    expect(map.scenes.map((s) => s.planned)).toEqual([false, true, false, true, true]);
    // A planned scene counts no time and no pages.
    for (const n of map.gaps.planned) expect(map.scenes[n - 1]?.minutes).toBe(0);
    expect(map.acts[0]?.pages).toBeCloseTo((index.scenes[0]?.pages?.eighths ?? 0) / 8);
    // Expand outline's stand-in heading names no place.
    expect(map.scenes[1]?.place).toBeNull();
    expect(map.places.map((p) => p.name)).not.toContain('Location');

    // A play's stub and a play's heading with only a synopsis.
    const play = build(`# Act One

## Scene 1

HESTER waits.

HESTER
Late again.

## New scene

## Scene 3

= Finch comes home.

/* drafter
{"v":1,"template":"stage-play-standard"}
*/
`);
    expect(play.map.kind).toBe('play');
    expect(play.map.gaps.planned).toEqual([2, 3]);
  });

  test('a TODO note and a #todo tag mark the scene, and the text is nowhere in the model', () => {
    const { map } = build(SHIPYARD);
    expect(map.gaps.todo).toEqual([3]);
    expect(map.scenes.map((s) => s.todo)).toEqual([false, false, true, false, false]);
    const json = JSON.stringify(map);
    expect(json).not.toContain('gull-feather');
    expect(json).not.toContain('tide tables');

    const tagged = build(TWO_WRITTEN).map;
    expect(tagged.gaps.todo).toEqual([3]);
    expect(JSON.stringify(tagged)).not.toContain('check the ending');

    // A resolved to-do is done.
    const done = build('INT. KILN - DAY\n\nABEL stacks bricks. [[TODO: fix this #resolved]]\n').map;
    expect(done.gaps.todo).toEqual([]);
  });

  test('a planned length gives the percent and the tail', () => {
    const { doc, template, layout, map } = build(HARBOUR);
    const index = sceneIndex(doc, template, layout);
    const gaps = gapsOf(index, doc, map.acts, map.scenes, 120, 98);
    expect(gaps).toMatchObject({
      percent: 82,
      tail: { from: 98, to: 120 },
      written: 98,
      plannedPages: 120,
      found: true,
    });
    // Through the model: written is the pages.
    const planned = build(HARBOUR, { plannedPages: 40 }).map;
    expect(planned.gaps.written).toBe(planned.facts.pages);
    expect(planned.gaps.percent).toBe(Math.round((planned.facts.pages / 40) * 100));
    expect(planned.gaps.tail).toEqual({ from: planned.facts.pages, to: 40 });
    expect(planned.status).toBe('in-progress');
  });

  test('the percent never passes 100', () => {
    const { doc, template, layout, map } = build(HARBOUR);
    const index = sceneIndex(doc, template, layout);
    const gaps = gapsOf(index, doc, map.acts, map.scenes, 90, 98);
    expect(gaps.percent).toBe(100);
    expect(gaps.tail).toBeNull();
    expect(gaps.found).toBe(false);
  });

  test('no planned length, no percent and no tail', () => {
    const { map } = build(SHIPYARD);
    expect(map.gaps.percent).toBeNull();
    expect(map.gaps.tail).toBeNull();
    expect(map.gaps.plannedPages).toBeNull();
    // Nothing guessed from a length that isn't one.
    expect(build(HARBOUR, { plannedPages: 0 }).map.gaps.percent).toBeNull();
  });

  test('the sentence names written, under way, and still to come', () => {
    expect(build(drafted('w w w w | w w w w | w w p p t')).map.gaps.sentence).toBe(
      'Acts 1 and 2 are written. Act 3 is under way: 2 scenes planned and 1 to do.',
    );
    expect(build(drafted('w w w w | w w w w | w w w | -')).map.gaps.sentence).toBe(
      'Acts 1, 2 and 3 are written. Act 4 is still to come.',
    );
    expect(
      build(drafted('w w w w w w w w w w | -'), { status: 'in-progress' }).map.gaps.sentence,
    ).toBe('Act 1 is written. Act 2 is still to come.');
    // An act is written only with no gap in it: never while its scenes are planned or to do.
    expect(build(drafted('w w w w w w w w w p | w t')).map.gaps.sentence).toBe(
      'Act 1 is under way: 1 scene planned. Act 2 is under way: 1 to do.',
    );
    // Finished: no sentence.
    expect(build(SHIPYARD, { status: 'finished' }).map.gaps.sentence).toBe('');
  });

  test('with pages still to write, no act is called written', () => {
    const { map } = build(drafted('w w w w | w w w w | w w w | -'), { plannedPages: 200 });
    expect(map.gaps.tail).not.toBeNull();
    expect(map.gaps.sentence).toBe(
      'The writing has reached Act 3: 11 scenes so far. Act 4 is still to come.',
    );
    expect(map.gaps.sentence).not.toMatch(/written/);
    const gappy = build(drafted('w w w w w p | w w w w w t'), { plannedPages: 200 }).map;
    expect(gappy.gaps.sentence).toBe(
      'The writing has reached Act 2: 11 scenes so far. Act 1 is under way: 1 scene planned. Act 2 is under way: 1 to do.',
    );
  });

  test('an early draft says only its pages and scenes', () => {
    expect(STORY_MAP_LIMITS.earlyPages).toBe(10);
    expect(STORY_MAP_LIMITS.earlyScenes).toBe(6);
    const small = build(SHIPYARD).map;
    expect(small.facts.pages).toBeLessThan(10);
    expect(small.gaps.sentence).toBe(`${small.facts.pages} page · 2 scenes so far`);
    const planned = build(SHIPYARD, { plannedPages: 40 }).map;
    expect(planned.gaps.sentence).toBe(
      `${planned.facts.pages} of 40 planned pages · 2 scenes so far`,
    );
    // Ten pages or more, but under six scenes written.
    const few = build(drafted('w w w w w', 3), { status: 'in-progress' }).map;
    expect(few.facts.pages).toBeGreaterThanOrEqual(10);
    expect(few.gaps.sentence).toBe(`${few.facts.pages} pages · 5 scenes so far`);
    expect(few.gaps.sentence).not.toMatch(/Act|written/);
  });

  test('one act or none: the play or the script as a whole', () => {
    // One act marked.
    const one = build(drafted('w w w w w w w w w w p')).map;
    expect(one.acts).toHaveLength(1);
    expect(one.gaps.sentence).toBe('The script is under way: 1 scene planned.');
    const play = build(drafted('w w w w w w w w w w p', 1, true)).map;
    expect(play.kind).toBe('play');
    expect(play.gaps.sentence).toBe('The play is under way: 1 scene planned.');
    // No acts.
    const none = build(drafted('w w w w w w w w w w', 1, false, false), {
      status: 'in-progress',
    }).map;
    expect(none.acts).toEqual([]);
    expect(none.gaps.sentence).toBe('The script is written.');
    const tail = build(drafted('w w w w w w w w w w', 1, false, false), { plannedPages: 300 }).map;
    expect(tail.gaps.sentence).toBe('The script is under way: the ending still to come.');
  });

  test('a script of planned scenes only', () => {
    const { map } = build(PLANNED_ONLY);
    for (const n of numbers(map)) expect(Number.isFinite(n), String(n)).toBe(true);
    expect(map.gaps.planned).toEqual([1, 2, 3, 4]);
    expect(map.gaps.percent).toBeNull();
    expect(map.split).toBeNull();
    expect(map.facts.minutes).toBe(0);
    expect(map.acts[0]?.pages).toBe(0);
    expect(map.gaps.sentence).toBe(
      `${map.facts.pages} ${map.facts.pages === 1 ? 'page' : 'pages'} · 0 scenes so far`,
    );
    expect(map.status).toBe('in-progress');
    // With a length, the percent is a number, never NaN.
    const planned = build(PLANNED_ONLY, { plannedPages: 90 }).map;
    expect(Number.isFinite(planned.gaps.percent)).toBe(true);
    // Only act headings.
    const bare = build('# Act One\n\n# Act Two\n').map;
    for (const n of numbers(bare)) expect(Number.isFinite(n), String(n)).toBe(true);
    expect(bare.gaps.sentence).toMatch(/^\d+ pages? · 0 scenes so far$/);
  });

  test('the default status is in progress when a gap is found, else finished', () => {
    const found = { found: true } as MapGaps;
    expect(defaultStatus(found)).toBe('in-progress');
    expect(defaultStatus({ ...found, found: false })).toBe('finished');
    expect(build(SHIPYARD).map.status).toBe('in-progress');
    expect(build(HARBOUR).map.status).toBe('finished');
    expect(build(HARBOUR, { status: 'in-progress' }).map.status).toBe('in-progress');
    expect(build(SHIPYARD, { status: 'finished' }).map.status).toBe('finished');
  });

  test('finished drops planned scenes and to-do marks', () => {
    const { map } = build(SHIPYARD, { status: 'finished' });
    expect(map.scenes).toHaveLength(2);
    expect(map.scenes.map((s) => s.n)).toEqual([1, 2]);
    expect(map.scenes.every((s) => !s.planned && !s.todo)).toBe(true);
    expect(map.facts.scenes).toBe(2);
    expect(map.acts.map((a) => a.scenes)).toEqual([[0], [1], []]);
    expect(map.gaps).toMatchObject({ planned: [], todo: [], tail: null, percent: null });
    for (const c of map.characters) {
      expect(c.scenes).toBe(c.presence.length);
      for (const p of c.presence) expect(map.scenes[p.scene]).toBeDefined();
    }
    for (const q of map.quotes) expect(map.scenes[q.scene]).toBeDefined();
    // A planned length is ignored once finished.
    const long = build(SHIPYARD, { status: 'finished', plannedPages: 200 }).map;
    expect(long.gaps.tail).toBeNull();
    expect(long.gaps.percent).toBeNull();
    // In progress keeps everything.
    expect(build(SHIPYARD).map.scenes).toHaveLength(5);
  });

  test('finished lays the kept scenes end to end, with no hole where a planned one was', () => {
    const source = drafted('w p w | p w w | w');
    const progress = build(source).map;
    const { map } = build(source, { status: 'finished' });
    expect(map.scenes).toHaveLength(5);
    expect(map.scenes[0]?.from).toBeCloseTo(progress.scenes[0]?.from as number);
    for (let i = 1; i < map.scenes.length; i++) {
      expect(map.scenes[i]?.from).toBeCloseTo(map.scenes[i - 1]?.to as number);
    }
    // Each keeps its own length, and the axis ends where the last one does.
    const kept = progress.scenes.filter((s) => !s.planned);
    map.scenes.forEach((scene, i) => {
      const was = kept[i] as (typeof kept)[number];
      expect(scene.to - scene.from).toBeCloseTo(was.to - was.from);
    });
    expect(map.axis).toBeCloseTo(map.scenes.at(-1)?.to as number);
    expect(map.axis).toBeLessThan(progress.axis);
  });
});
