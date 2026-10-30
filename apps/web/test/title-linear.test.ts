import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { markdownTitle, retitleMarkdown } from '../app/markdown/title';
import * as before from './fixtures/title-before';

/** The best of a few runs, in milliseconds. */
function best(run: () => unknown, tries = 5): number {
  let fastest = Number.POSITIVE_INFINITY;
  for (let k = 0; k < tries; k++) {
    const start = performance.now();
    run();
    fastest = Math.min(fastest, performance.now() - start);
  }
  return fastest;
}

/**
 * How much longer `run` takes on `make(8n)` than on `make(n)`: about 8 when it is linear. A ratio
 * that looks worse is measured again, up to three times, and the best kept: a busy machine only
 * ever slows a run, while work that grows faster than the text looks so every time.
 */
function growth(make: (n: number) => string, run: (s: string) => unknown, n: number): number {
  const small = make(n);
  const large = make(8 * n);
  run(small);
  let ratio = Number.POSITIVE_INFINITY;
  for (let attempt = 0; attempt < 3 && ratio >= 20; attempt++) {
    ratio = Math.min(
      ratio,
      best(() => run(large)) /
        Math.max(
          best(() => run(small)),
          0.1,
        ),
    );
  }
  return ratio;
}

describe('the title of a Markdown document, on hostile headings', () => {
  const cases: [string, (n: number) => string][] = [
    ['spaces before a last `#` that closes nothing', (n) => `# x${' '.repeat(n)}#y\n`],
    ['spaces and `#`s in turn', (n) => `# x${' #'.repeat(n)}y\n`],
    ['opening brackets', (n) => `# ${'['.repeat(n)}\n`],
    ['images and brackets with no address', (n) => `# ${'![a]'.repeat(n)}(\n`],
    ['a link with no closing parenthesis', (n) => `# [a](${'b'.repeat(n)}\n`],
    ['a setext line', (n) => `Title\n${'='.repeat(n)}x\n`],
    ['a definition line of quote and list marks', (n) => `# T[^a]\n\n${'> - '.repeat(n)}[^b\n`],
  ];
  for (const [name, make] of cases) {
    test(`reads ${name} in linear time (n and 8n)`, () => {
      const g = growth(make, (s) => markdownTitle(s), 20_000);
      console.log(`Title, ${name}: ${g.toFixed(1)}× from n to 8n.`);
      expect(g).toBeLessThan(20);
    }, 60_000);
  }
  test('renames a copy in linear time too', () => {
    const g = growth(
      (n) => `# x${' '.repeat(n)}#y\n`,
      (s) => retitleMarkdown(s, 'New'),
      5_000,
    );
    expect(g).toBeLessThan(20);
  }, 60_000);
});

describe('the title, as it was', () => {
  // Short strings of the characters a heading's markup is made of.
  const arbLine = fc
    .array(
      fc.constantFrom(
        '#',
        '##',
        ' ',
        '  ',
        '\t',
        '[',
        ']',
        '(',
        ')',
        '!',
        'x',
        'yz',
        '*',
        '_',
        '`',
        '[^a]',
        ':',
        '=',
        '-',
        '\\',
      ),
      { maxLength: 14 },
    )
    .map((parts) => parts.join(''));
  const arbDoc = fc.array(arbLine, { minLength: 1, maxLength: 5 }).map((lines) => lines.join('\n'));
  /** A heading of only `#`s: the old pattern kept them as its text; CommonMark's heading is empty. */
  const onlyHashes = (line: string) => /^ {0,3}#{1,6}[ \t]+[# \t]*$/.test(line);
  /** A definition behind a list mark, which now counts for the title. */
  const listedDefinition = (line: string) =>
    /[-*+)][ \t>-]*\[\^/.test(line) || /\.[ \t>]*\[\^/.test(line);

  test('reads every ordinary heading as before', () => {
    fc.assert(
      fc.property(arbDoc, (source) => {
        const lines = source.split('\n');
        fc.pre(!lines.some(onlyHashes) && !lines.some(listedDefinition));
        expect(markdownTitle(source)).toBe(before.markdownTitle(source));
        expect(retitleMarkdown(source, 'New')).toBe(before.retitleMarkdown(source, 'New'));
      }),
      { numRuns: 3_000 },
    );
  });

  test('a heading of only closing `#`s is empty, as in CommonMark', () => {
    expect(markdownTitle('# ###\n\n# Real\n')).toBe('Real');
    expect(markdownTitle('#\n## ##\nText\n')).toBeUndefined();
  });

  test('a footnote defined in a list item counts for the title', () => {
    expect(markdownTitle('# Shore[^a]\n\n- [^a]: In a list.\n')).toBe('Shore');
    expect(markdownTitle('# Shore[^a]\n\n> 1. [^a]: In a quote’s list.\n')).toBe('Shore');
    expect(markdownTitle('# Shore[^a]\n\n-[^a]: Not a list.\n')).toBe('Shore[^a]');
  });
});
