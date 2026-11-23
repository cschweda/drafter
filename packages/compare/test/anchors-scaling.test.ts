import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { markdownAnchors } from '../src/rows';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

// A Markdown heading with a long run of spaces in it (the audit of the red/blue audit of 23
// November 2026, W7): Cuts and draft steps on a Markdown document read headings with the pattern
// the outline's own reader had replaced.

describe('a Markdown heading with a run of spaces', () => {
  for (const [name, fill] of [
    ['spaces', ' '],
    ['tabs', '\t'],
  ] as const) {
    test(
      `of ${name} is read in time that grows with it`,
      () => {
        const { growth } = scaling(
          (n: number) => `# Act${fill.repeat(n)}x\n`,
          markdownAnchors,
          5000,
        );
        expect(growth).toBeLessThan(MAX_GROWTH);
      },
      SCALING_TIMEOUT,
    );
  }

  test('a heading is read exactly as the pattern read it', () => {
    const OLD = /^ {0,3}(#{1,3})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
    const old = (line: string) => {
      const heading = OLD.exec(line);
      if (!heading) return [];
      const title = (heading[2] ?? '').trim();
      return [{ line: 0, title: /^#+$/.test(title) ? '' : title }];
    };
    fc.assert(
      fc.property(fc.stringMatching(/^[ #ab\t\u00a0]{0,14}$/), (line) => {
        expect(markdownAnchors(line)).toEqual(old(line));
      }),
      { numRuns: 20_000 },
    );
  });
});
