// Moved from apps/web/test/markdown-depth.test.ts with the code; how the Preview says a document
// too deep (`previewProblem`) is the app's, and its test stays there.
import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { containerDepth, MAX_NESTING, type MdNode, NestedTooDeeply, parseMarkdown } from '../src';

/** The Markdown sample the app opens. */
const sample = readFileSync(new URL('../../../samples/markdown.md', import.meta.url), 'utf8');

/** The containers a node sits in at its deepest: block quotes, list items, footnote definitions. */
function realDepth(tree: MdNode): number {
  let deepest = 0;
  const stack: [MdNode, number][] = [[tree, 0]];
  for (let top = stack.pop(); top; top = stack.pop()) {
    const [node, outer] = top;
    const depth =
      outer +
      (node.type === 'blockquote' || node.type === 'listItem' || node.type === 'footnoteDefinition'
        ? 1
        : 0);
    deepest = Math.max(deepest, depth);
    for (const child of node.children ?? []) stack.push([child, depth]);
  }
  return deepest;
}

/** The best of a few runs, in milliseconds: a busy machine only ever makes a run slower. */
function best(run: () => unknown, tries = 3): number {
  let fastest = Number.POSITIVE_INFINITY;
  for (let k = 0; k < tries; k++) {
    const start = performance.now();
    run();
    fastest = Math.min(fastest, performance.now() - start);
  }
  return fastest;
}

const deepError = (source: string): unknown => {
  try {
    parseMarkdown(source);
  } catch (error) {
    return error;
  }
  return undefined;
};

/** The two inputs that held the parser for seconds: definitions nested a line each, and a line of list marks. */
const NESTED_NOTES = Array.from({ length: 5_000 }, (_, i) => `${i ? '    ' : ''}[^a]: x`).join(
  '\n',
);
const LIST_LINE = `${'- '.repeat(2_400)}x`;

/** A long treatment of the usual shape: headings, paragraphs, lists two deep, quotes, notes. */
const TREATMENT = Array.from(
  { length: 60 },
  (_, i) =>
    `## Sequence ${i + 1}\n\nMargaret waits up in the kitchen; the clock is ten minutes fast.[^c${i}] Danny is late, as always, and the rain has not stopped since noon.\n\n- The phone\n  - It doesn’t ring.\n  - She lifts it, to check.\n- The knock\n\n> “Next year I’ll call from the bakery.”\n\n[^c${i}]: She sets it that way.\n\n    On purpose, she says.\n`,
).join('\n');

describe('a Markdown document’s nesting, scanned before it is parsed', () => {
  test('counts what a line could open: indentation, quote marks, list marks, footnote labels', () => {
    expect(containerDepth('Just a paragraph.\n\nAnother.', 100)).toBe(0);
    expect(containerDepth('- one\n- two', 100)).toBe(1);
    expect(containerDepth('> > - quoted item', 100)).toBe(3);
    expect(containerDepth('1. a\n   2) b', 100)).toBeGreaterThanOrEqual(2);
    expect(containerDepth('[^a]: note', 100)).toBe(1);
    expect(containerDepth(LIST_LINE, Number.POSITIVE_INFINITY)).toBe(2_400);
    // A definition indented under another opens one inside it, line after line.
    expect(containerDepth(NESTED_NOTES, Number.POSITIVE_INFINITY)).toBeGreaterThanOrEqual(5_000);
    // Indentation alone opens nothing.
    expect(containerDepth(' '.repeat(100_000), 100)).toBe(0);
    // A byte-order mark first is skipped, as the parser skips it.
    expect(containerDepth(`\uFEFF${LIST_LINE}`, Number.POSITIVE_INFINITY)).toBe(2_400);
  });

  test('stops as soon as it passes the limit', () => {
    const depth = containerDepth(LIST_LINE, 10);
    expect(depth).toBeGreaterThan(10);
    expect(depth).toBeLessThan(20);
  });

  test('never counts fewer containers than the parser opens', () => {
    const arbPrefix = fc.array(
      fc.constantFrom(
        '',
        ' ',
        '  ',
        '   ',
        '    ',
        '        ',
        '\t',
        ' \t',
        '> ',
        '>',
        '- ',
        '-\t',
        '* ',
        '+ ',
        '1. ',
        '10) ',
        '[^a]: ',
        '[^b]:',
        '[^a\\]]: ',
        '\0',
        '\t\t',
        '  \t',
      ),
      { maxLength: 10 },
    );
    const arbLine = fc.oneof(
      { weight: 6, arbitrary: arbPrefix.map((parts) => `${parts.join('')}word`) },
      { weight: 1, arbitrary: fc.constant('') },
      { weight: 1, arbitrary: arbPrefix.map((parts) => parts.join('')) },
    );
    // What the parser's reading skips or changes before it parses: a byte-order mark first, any
    // line ending, tabs (to the next multiple of 4), and NUL (read as U+FFFD).
    const arbDoc = fc
      .tuple(
        fc.constantFrom('', '\uFEFF', '\uFEFF\uFEFF', '\0'),
        fc.array(arbLine, { minLength: 1, maxLength: 40 }),
        fc.constantFrom('\n', '\r\n', '\r'),
      )
      .map(([start, lines, eol]) => start + lines.join(eol));
    fc.assert(
      fc.property(arbDoc, (source) => {
        expect(containerDepth(source, Number.POSITIVE_INFINITY)).toBeGreaterThanOrEqual(
          realDepth(parseMarkdown(source)),
        );
      }),
      { numRuns: 2_000 },
    );
  });

  test('scans in linear time, whatever the text (n and 8n)', () => {
    const MB = 1_000_000;
    const cases: [string, (n: number) => string][] = [
      ['quote marks', (n) => '>'.repeat(n)],
      ['list marks', (n) => '- '.repeat(n / 2)],
      ['spaces', (n) => ' '.repeat(n)],
      ['long indentation, line after line', (n) => `${' '.repeat(999)}x\n`.repeat(n / 1_000)],
      ['nested footnote labels', (n) => '    [^a]: x\n'.repeat(n / 12)],
      ['an unclosed footnote label', (n) => `[^${'a'.repeat(n)}`],
      ['digits', (n) => '1'.repeat(n)],
    ];
    for (const [name, make] of cases) {
      const small = make(MB / 8);
      const large = make(MB);
      best(() => containerDepth(small, Number.POSITIVE_INFINITY), 1);
      // A ratio that looks worse is measured again, up to three times, and the best kept: a busy
      // machine only ever slows a run, while quadratic work looks quadratic every time.
      let growth = Number.POSITIVE_INFINITY;
      for (let attempt = 0; attempt < 3 && growth >= 20; attempt++) {
        growth = Math.min(
          growth,
          best(() => containerDepth(large, Number.POSITIVE_INFINITY)) /
            Math.max(
              best(() => containerDepth(small, Number.POSITIVE_INFINITY)),
              0.1,
            ),
        );
      }
      console.log(`Nesting scan, ${name}: ${growth.toFixed(1)}× from n to 8n.`);
      // Linear is 8×, quadratic 64×: 20 tells them apart with room for a busy machine.
      expect(growth, name).toBeLessThan(20);
    }
  }, 120_000);
});

describe('a document nested too deeply', () => {
  test('is refused at once, as a RangeError that says so, whatever its mark or line endings', () => {
    const hostile = [NESTED_NOTES, LIST_LINE, `${'>'.repeat(5_000)} x`];
    // A byte-order mark, which the parser skips, or other line endings, change nothing.
    const variants = hostile.flatMap((source) => [
      source,
      `\uFEFF${source}`,
      source.replaceAll('\n', '\r\n'),
      `\uFEFF${source.replaceAll('\n', '\r')}`,
    ]);
    for (const source of variants) {
      const error = deepError(source);
      expect(error).toBeInstanceOf(NestedTooDeeply);
      expect(error).toBeInstanceOf(RangeError);
      expect((error as Error).message).toMatch(/nested too deeply/);
      expect(best(() => deepError(source))).toBeLessThan(100);
    }
  });

  test('is anything over the limit; the limit itself parses', () => {
    const at = (depth: number) => `${'- '.repeat(depth)}x`;
    expect(realDepth(parseMarkdown(at(MAX_NESTING)))).toBe(MAX_NESTING);
    expect(deepError(at(MAX_NESTING + 1))).toBeInstanceOf(RangeError);
  });

  test('leaves real documents alone: the sample, and a long treatment', () => {
    for (const source of [sample, TREATMENT, TREATMENT.repeat(4)]) {
      expect(containerDepth(source, MAX_NESTING)).toBeLessThanOrEqual(4);
      expect(deepError(source)).toBeUndefined();
    }
  });
});
