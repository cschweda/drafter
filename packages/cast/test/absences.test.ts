import { structureStrip } from '@drafter/outline';
import { describe, expect, test } from 'vitest';
import { LONG_ABSENCE_PAGES } from '../src';
import { build, filler } from './scripts';

/** A script of scenes, each a page of filler unless given its own body. */
function script(bodies: Array<string | null>): string {
  return bodies.map((body, n) => `INT. ROOM ${n + 1} - DAY\n\n${body ?? filler(50)}\n`).join('\n');
}

const tom = 'TOM\nStill here.';

describe('absences', () => {
  test('a gap of 20 pages or more between appearances is long', () => {
    expect(LONG_ABSENCE_PAGES).toBe(20);
    const bodies: Array<string | null> = Array(30).fill(null);
    bodies[0] = tom;
    bodies[23] = tom;
    bodies[29] = tom;
    const { cast, index, perPage } = build(script(bodies), { pages: true });
    const figures = cast.figures.get('TOM');
    const strip = structureStrip(index, perPage);
    expect(strip.unit).toBe('pages');
    const spans = strip.rows.at(-1)?.blocks ?? [];
    const gap = (spans[23]?.from ?? 0) - (spans[0]?.to ?? 0);
    expect(gap).toBeGreaterThanOrEqual(LONG_ABSENCE_PAGES);
    const long = {
      from: { scene: 0, page: Math.floor(spans[0]?.to ?? 0) + 1 },
      to: { scene: 23, page: index.scenes[23]?.pages?.page },
      pages: gap,
    };
    expect(figures?.absences).toEqual([long]);
    expect(figures?.longest).toEqual(long);
    // Scene 24 to 30 is about six pages: not long.
    expect(figures?.absences).toHaveLength(1);
  });

  test('nothing before the first or after the last', () => {
    const bodies: Array<string | null> = Array(50).fill(null);
    bodies[24] = tom;
    const { cast } = build(script(bodies), { pages: true });
    expect(cast.figures.get('TOM')).toMatchObject({ absences: [], longest: null });
  });

  test('the longest is kept whatever its length', () => {
    const bodies: Array<string | null> = Array(8).fill(null);
    bodies[0] = tom;
    bodies[2] = tom;
    bodies[5] = tom;
    bodies[6] = 'ANN\nAnd me.';
    bodies[7] = 'ANN\nStill me.';
    const { cast, index } = build(script(bodies), { pages: true });
    const figures = cast.figures.get('TOM');
    expect(figures?.absences).toEqual([]);
    // A page away, then two: the two.
    expect(figures?.longest).toMatchObject({ from: { scene: 2 }, to: { scene: 5 } });
    expect(figures?.longest?.pages).toBeGreaterThan(1.5);
    expect(figures?.longest?.pages).toBeLessThan(LONG_ABSENCE_PAGES);
    expect(figures?.longest?.to.page).toBe(index.scenes[5]?.pages?.page);
    // Back to back is no absence at all.
    expect(cast.figures.get('ANN')?.longest).toBeNull();
  });
});
