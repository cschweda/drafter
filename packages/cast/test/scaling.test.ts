import { type Doc, parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { linesPerPage, type SceneIndex, sceneIndex } from '@drafter/outline';
import { describe, expect, test } from 'vitest';
import { castOf, type IsWord } from '../src';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';
import { screenplay } from './scripts';

// Generated scripts of invented words and names, from a seeded generator, so every run times the
// same text (design §11: `castOf` within 15 ms for a 120-page script; here, the growth, and a
// hang guard at ten times the budget on 120 pages (185 scenes) and 60 characters).

function generator(seed: number) {
  let state = seed;
  // Marsaglia's xorshift, in 32-bit integers.
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
  const syllables = ['bra', 'tol', 'mev', 'ska', 'rin', 'dou', 'pel', 'vax', 'quo', 'ten', 'lir'];
  const word = (parts = 1 + (next() % 3)) => {
    let w = '';
    for (let i = 0; i < parts; i++) w += syllables[next() % syllables.length];
    return w;
  };
  return { next, word };
}

const capitalised = (name: string) =>
  name.toLowerCase().replace(/(^| )(\p{L})/gu, (_, b: string, l: string) => b + l.toUpperCase());

interface Input {
  index: SceneIndex;
  doc: Doc;
  perPage: number | null;
}

/** `scenes` scenes among `people` invented characters (a third of them two words long). */
function make(scenes: number, people: number, pages = false): Input {
  const { next, word } = generator(7 + scenes * 31 + people);
  const names = Array.from({ length: people }, (_, i) =>
    `${word(2)}${i}${i % 3 === 0 ? ` ${word(2)}` : ''}`.toUpperCase(),
  );
  const pick = () => names[next() % names.length] as string;
  const sentence = (n: number) => Array.from({ length: n }, () => word()).join(' ');
  let text = `${pick()}\n${sentence(8)}.\n\n`;
  for (let s = 0; s < scenes; s++) {
    text += `${next() % 2 ? 'INT.' : 'EXT.'} ${word(2).toUpperCase()} ${next() % 12} - ${next() % 2 ? 'DAY' : 'NIGHT'}\n\n`;
    text += `${sentence(6)} ${pick()} ${sentence(10)} ${capitalised(pick())}'s ${sentence(12)}.\n${sentence(14)}.\n\n`;
    for (let k = 0; k < 4; k++) text += `${pick()}\n${sentence(5 + (next() % 15))}.\n\n`;
    text += `${sentence(20)} ${pick()} ${sentence(9)}.\n\n`;
  }
  const doc = parse(text);
  for (const block of doc.blocks) for (const line of block.lines) void line.inline;
  const layout = pages ? paginate(doc, screenplay) : null;
  return { doc, index: sceneIndex(doc, screenplay, layout), perPage: linesPerPage(layout) };
}

const isWord: IsWord = (name) => (name.length % 4 === 0 ? undefined : false);
const run = ({ index, doc, perPage }: Input) => castOf(index, doc, screenplay, perPage, isWord);

describe('the cast, timed', () => {
  test(
    'castOf grows linearly in scenes',
    () => {
      const { growth } = scaling((n) => make(n, 60), run, 150);
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );

  test(
    'castOf grows linearly in characters',
    () => {
      const { growth } = scaling((n) => make(150, n), run, 60);
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );

  test(
    'a 120-page script with 60 characters is within ten times the budget',
    () => {
      const input = make(185, 60, true);
      const pages = input.index.scenes.at(-1)?.pages?.page ?? 0;
      expect(pages).toBeGreaterThanOrEqual(120);
      const cast = run(input);
      expect(cast.characters.length).toBeGreaterThan(55);
      run(input);
      let best = Number.POSITIVE_INFINITY;
      for (let k = 0; k < 5; k++) {
        const start = performance.now();
        run(input);
        best = Math.min(best, performance.now() - start);
      }
      expect(best).toBeLessThan(150);
      // For DECISIONS, with DRAFTER_TIMING set (and `--silent=false`).
      if (process.env.DRAFTER_TIMING) {
        console.log(
          `castOf, ${input.index.scenes.length} scenes, ${pages} pages, ${cast.characters.length} characters, best of 5: ${best.toFixed(2)} ms`,
        );
      }
    },
    SCALING_TIMEOUT,
  );
});
