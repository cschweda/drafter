import en from 'dictionary-en';
import { describe, expect, test } from 'vitest';
import { buildScript } from '../../../fixtures/generators/script';
import { createChecker } from '../src/checker';
import { createSpellSession } from '../src/session';

// Both run in the worker in the app, so these are ceilings, not the typing path. The budgets are
// generous so a loaded CI machine passes; the checker is loaded (and warmed) outside the timing.

const checker = createChecker(en);

/** The `n`th invented word: `zq` and `n` in base 26 as letters, never a dictionary word. */
const invented = (n: number) =>
  `zq${n
    .toString(26)
    .split('')
    .map((d) => String.fromCharCode(97 + Number.parseInt(d, 26)))
    .join('')}`;

/**
 * Well over 120 pages, some 200,000 characters: every line of action and dialogue ends with an
 * invented word, so no two blocks share a cache entry and each invented word reaches the checker.
 */
function longScript(): string {
  let n = 0;
  return buildScript(200_000).replace(
    /^([A-Z][a-z].*[.?-])$/gm,
    (line) => `${line} ${invented(n++)}`,
  );
}

describe('spellcheck budget', () => {
  test("a 120-page script's first check takes under 3 seconds", () => {
    const source = longScript();
    createSpellSession(checker).check({
      source: 'Warm up the recieve path.\n',
      kind: 'fountain',
      notes: false,
      mine: [],
    });
    const session = createSpellSession(checker);
    const started = performance.now();
    const marks = session.check({ source, kind: 'fountain', notes: true, mine: [] });
    const took = performance.now() - started;
    expect(marks.length).toBeGreaterThan(100);
    expect(took).toBeLessThan(3000);
  });

  test('a check after a one-letter edit takes under 50 ms', () => {
    const source = longScript();
    const session = createSpellSession(checker);
    session.check({ source, kind: 'fountain', notes: true, mine: [] });
    session.work();
    const at = source.indexOf('the rain hasn') + 4;
    let best = Number.POSITIVE_INFINITY;
    // The best of a few, each a new one-letter edit, so a pause elsewhere on the machine doesn't count.
    for (const letter of 'abcde') {
      const edited = source.slice(0, at) + letter + source.slice(at);
      const started = performance.now();
      session.check({ source: edited, kind: 'fountain', notes: true, mine: [] });
      best = Math.min(best, performance.now() - started);
    }
    expect(session.work().units).toBe(5);
    expect(best).toBeLessThan(50);
  });
});
