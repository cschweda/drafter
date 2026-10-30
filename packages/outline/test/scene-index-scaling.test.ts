import { type Doc, parse } from '@drafter/fountain';
import { describe, expect, test } from 'vitest';
import { sceneIndex } from '../src';
import { screenplay } from './helpers';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

// The scene index with each scene's speeches (design §3.4, budget §11: no more than 10% slower
// than v0.19.0's). A scene of action, two speeches, a dual pair, and a lyric; the script opens
// with a speech, so the opening is tallied too.

const scene = (n: number, cues: boolean) => {
  const cue = (name: string) => (cues ? name : `${name.toLowerCase()} waits.`);
  return `INT. ROOM ${n} - DAY

A long action line that goes on for a while so the page fills up with words and words.

${cue('ANNA')}
Words said aloud, a few of them, to nobody in particular.

${cue('BRUNO')}
(low)
Then say them again.

${cue('ANNA ^')}
I won't.

${cue('CORA')}
~La la, the rain on the road.

`;
};

/** `n` scenes, parsed, after a cold open. */
function make(n: number, cues = true): Doc {
  let text = `${cues ? 'ANNA' : 'Anna waits.'}\nBefore it all.\n\n`;
  for (let i = 0; i < n; i++) text += scene(i, cues);
  const doc = parse(text);
  for (const block of doc.blocks) for (const line of block.lines) void line.inline;
  return doc;
}

/** The best of five runs of the scene index of `doc`, in milliseconds, after a warm-up. */
function best(doc: Doc): number {
  sceneIndex(doc, screenplay);
  let fastest = Number.POSITIVE_INFINITY;
  for (let k = 0; k < 5; k++) {
    const start = performance.now();
    sceneIndex(doc, screenplay);
    fastest = Math.min(fastest, performance.now() - start);
  }
  return fastest;
}

describe('the scene index with speeches', () => {
  test(
    'sceneIndex grows linearly',
    () => {
      const { growth } = scaling(
        (n) => make(n),
        (doc) => sceneIndex(doc, screenplay),
        300,
      );
      expect(growth).toBeLessThan(MAX_GROWTH);
      // For DECISIONS: the 1,200-scene script against the same script with no cues in it.
      const withSpeeches = make(1200);
      const index = sceneIndex(withSpeeches, screenplay);
      expect(index.scenes).toHaveLength(1200);
      expect(index.scenes[0]?.speeches).toHaveLength(4);
      expect(index.opening?.speeches).toHaveLength(1);
      const timed = best(withSpeeches);
      const baseline = best(make(1200, false));
      console.log(
        `sceneIndex, 1,200 scenes, best of 5: ${timed.toFixed(2)} ms with speeches; ${baseline.toFixed(2)} ms with no cues`,
      );
    },
    SCALING_TIMEOUT,
  );
});
