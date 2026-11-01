import { sceneIndex } from '@drafter/outline';
import { describe, expect, test } from 'vitest';
import { defaultStatus, gapsOf, isPlanned, type MapGaps } from '../src';
import { build, HARBOUR, NO_ACTS } from './scripts';

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
    expect(build(SHIPYARD).map.gaps.sentence).toBe(
      'Act 1 is under way: 1 scene planned. Act 2 is under way: 2 scenes planned and 1 to do. Act 3 is still to come.',
    );
    expect(build(TWO_WRITTEN).map.gaps.sentence).toBe(
      'Acts 1 and 2 are written. Act 3 is under way: 2 scenes planned and 1 to do.',
    );
    expect(build(HARBOUR, { status: 'in-progress' }).map.gaps.sentence).toBe(
      'Acts 1, 2 and 3 are written.',
    );
    const one = `# Act One\n\nINT. KILN - DAY\n\nABEL stacks bricks.\n\n# Act Two\n`;
    expect(build(one).map.gaps.sentence).toBe('Act 1 is written. Act 2 is still to come.');
    // The tail after the last scene is the last act's.
    const tail = `# Act One\n\nINT. KILN - DAY\n\nABEL stacks bricks.\n\nINT. KILN - NIGHT\n\nEXT. YARD - DAY\n`;
    expect(build(tail, { plannedPages: 100 }).map.gaps.sentence).toBe(
      'Act 1 is under way: 2 scenes planned and the ending still to come.',
    );
    // No acts: the story.
    expect(build(NO_ACTS, { status: 'in-progress' }).map.gaps.sentence).toBe(
      'The story is written.',
    );
    expect(build(NO_ACTS, { plannedPages: 100 }).map.gaps.sentence).toBe(
      'The story is under way: the ending still to come.',
    );
    // Finished: no sentence.
    expect(build(SHIPYARD, { status: 'finished' }).map.gaps.sentence).toBe('');
  });

  test('a script of planned scenes only', () => {
    const { map } = build(PLANNED_ONLY);
    for (const n of numbers(map)) expect(Number.isFinite(n), String(n)).toBe(true);
    expect(map.gaps.planned).toEqual([1, 2, 3, 4]);
    expect(map.gaps.percent).toBeNull();
    expect(map.split).toBeNull();
    expect(map.facts.minutes).toBe(0);
    expect(map.acts[0]?.pages).toBe(0);
    expect(map.gaps.sentence).toBe('Act 1 is under way: 4 scenes planned.');
    expect(map.status).toBe('in-progress');
    // With a length, the percent is a number, never NaN.
    const planned = build(PLANNED_ONLY, { plannedPages: 90 }).map;
    expect(Number.isFinite(planned.gaps.percent)).toBe(true);
    // Only act headings.
    const bare = build('# Act One\n\n# Act Two\n').map;
    for (const n of numbers(bare)) expect(Number.isFinite(n), String(n)).toBe(true);
    expect(bare.gaps.sentence).toBe('Acts 1 and 2 are still to come.');
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
});
