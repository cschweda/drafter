import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { describe, expect, test } from 'vitest';
import { linesPerPage, sceneIndex, structureStrip } from '../src';
import { screenplay } from './helpers';

/** A scene's action and speech; with its first five again, the 150 scenes run past 120 pages. */
const BODY = [
  'Margaret waits by the door while the rain beats on the glass and the phone rings twice.',
  'She looks at it. She does not answer. The kettle starts to whistle in the kitchen behind her.',
  'MARGARET\nNot now. Not tonight, and not after everything that happened at the lake.',
  'Danny comes in from the hall, shaking water from his coat, and stops when he sees her face.',
  'DANNY\nYou heard, then.',
  'She nods. Outside, a car pulls up, its headlights sweeping across the ceiling and away again.',
  'MARGARET\nThey said it was an accident. Nobody believes that, Danny. Not even them.',
  'He sits down across from her. Neither of them moves to turn the kettle off.',
];

/** 3 acts of 5 sequences of 10 beats, each beat one scene of action and speeches. */
function longScript(): string {
  const parts: string[] = ['Title: The Long One'];
  let scene = 0;
  for (let act = 1; act <= 3; act++) {
    parts.push(`# Act ${act}`);
    for (let seq = 1; seq <= 5; seq++) {
      parts.push(`## Sequence ${act}.${seq}`);
      for (let beat = 1; beat <= 10; beat++) {
        scene++;
        parts.push(`### Beat ${scene}`, `INT. ROOM ${scene} - DAY`, ...BODY, ...BODY.slice(0, 5));
      }
    }
  }
  return `${parts.join('\n\n')}\n`;
}

describe('structureStrip budget', () => {
  test('builds the strip of a 120-page script with 150 scenes and three section levels in under 2 ms', () => {
    const doc = parse(longScript());
    const layout = paginate(doc, screenplay);
    expect(layout.pages.filter((p) => p.number > 0).length).toBeGreaterThan(120);
    const index = sceneIndex(doc, screenplay, layout);
    expect(index.scenes).toHaveLength(150);
    expect(index.sections.map((s) => s.depth).filter((d) => d < 3)).toHaveLength(18);
    expect(new Set(index.sections.map((s) => s.depth))).toEqual(new Set([1, 2, 3]));
    const perPage = linesPerPage(layout);
    expect(structureStrip(index, perPage).unit).toBe('pages');

    // The median of 20 runs after one warm-up: a busy machine slows some runs, rarely half of them.
    structureStrip(index, perPage);
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const started = performance.now();
      structureStrip(index, perPage);
      times.push(performance.now() - started);
    }
    times.sort((a, b) => a - b);
    expect(((times[9] ?? 0) + (times[10] ?? 0)) / 2).toBeLessThan(2);
  });
});
