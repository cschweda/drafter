import { parse } from '@drafter/fountain';
import { sceneIndex } from '@drafter/outline';
import { describe, expect, test } from 'vitest';
import { hooksOf } from '../src';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';
import { build, screenplay } from './scripts';

// Two hostile scripts stay linear: a long name padded with marks, said again and again (each
// mention could compare the whole written name); and many speakers, each with a few lines (each
// card line could look through every speaker's lines).

/** ZED's cue is "ZED" and `n` marks; the action names ZED `n` times. */
function padded(n: number) {
  const name = `@ZED ${'<'.repeat(n)}`;
  const action = 'ZED waits by the wall and '.repeat(n);
  const doc = parse(`INT. HALL - DAY\n\n${action}\n\n${name}\nStill here, by the long wall.\n`);
  return { doc, index: sceneIndex(doc, screenplay) };
}

/** A name for the `k`th speaker: letters only, all different. */
const speaker = (k: number) =>
  `SPEAKER ${Array.from(k.toString(26), (d) => String.fromCharCode(65 + Number.parseInt(d, 26))).join('')}`;

/** `n` speakers, each with three lines of their own, in scenes of ten speakers. */
function crowd(n: number) {
  const out: string[] = [];
  for (let k = 0; k < n; k++) {
    if (k % 10 === 0) out.push(`INT. HALL ${k / 10 + 1} - DAY`, '', 'They gather.', '');
    for (let l = 0; l < 3; l++) {
      out.push(speaker(k), `I came here on the ${l + 1} train from the coast, ${k}.`, '');
    }
  }
  return out.join('\n');
}

describe('names and lines on a hostile script', () => {
  test(
    'a long, mark-padded name said many times is linear',
    () => {
      const result = scaling(padded, ({ doc, index }) => hooksOf(doc, index), 2000);
      expect(result.growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );

  test(
    'many speakers, each with a few lines, is linear',
    () => {
      const result = scaling(crowd, (source) => build(source), 1000);
      expect(result.growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );
});
