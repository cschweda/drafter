// Lists, quotes and footnotes that end (src/closings.ts): what the parser's rereading costs, and
// the documents refused for it.
import { describe, expect, test } from 'vitest';
import { parseMarkdown } from '../src';
import { CLOSING_BUDGET, closesTooOften, closingCost } from '../src/closings';
import { readWhole } from '../src/parse';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

/**
 * Each of these, over and over, took the parser the square of its length when this was written
 * (8,000 of them: 3 to 18 seconds; micromark 4.0.3). A fence, so that none of them can be cut.
 */
const SLOW = [
  '- a\n\nb\n\n',
  '- a\n\n1\n\n',
  '- a\n\n***\n\n',
  '- a\n\n b\n\n',
  '1. a\n\n  b\n\n',
  '- a\n  - b\n\n  c\n\n',
  '> a\n\n',
  '> a\n\n> b\n\n',
  '> a\n>\n> b\n\n',
  '> - a\n\n> b\n\n',
  '>- a\n>\n>  b\n>\n',
  '> a\nb\n',
  '- # h\nb\n',
  '- ***\nb\n',
  '-\nb\n',
  '-\n\n  b\n\n',
  '> # h\nb\n',
  '> ```\nb\n',
  '> ```\n> x\nb\n\n',
  '- a\n  ===\nb\n',
  '-     c\nb\n',
  '[^a]: x\n\nb\n\n',
  '[^a\\]b]: x\n\nb\n\n',
  '- a\n\n# b\n\n',
  '- a\n  - c\n',
  '- a\n- > a\n',
  '1. a\n   > b\n2. a\n',
  '-\n  - c\n',
  '   - a\n\nb\n\n',
  '- a\r\n\r\nb\r\n\r\n',
  '- a\r\rb\r\r',
];

/** Ordinary writing, however long: none of it makes the parser reread. */
const QUICK: Array<[string, string, number]> = [
  ['paragraphs', 'One paragraph.\n\nAnother one.\n\n', 40_000],
  ['a tight list', '- one item\n', 60_000],
  ['a loose list', '- one item\n\n', 40_000],
  ['a numbered list', '1. one\n2. two\n3. three\n', 20_000],
  ['items that wrap, indented', '- an item that wraps\n  onto a second line\n', 30_000],
  ['items of two paragraphs', '- an item\n\n  and more of it\n\n', 20_000],
  ['a quote marked on every line', '> a line\n> and another\n>\n', 20_000],
  ['headings and paragraphs', '# A heading\n\nWords under it.\n\n', 30_000],
  ['a rule between paragraphs', 'Words.\n\n***\n\n', 30_000],
  ['notes at the end', '[^a]: one note\n[^b]: another\n', 20_000],
  ['indented code', '    code\n\nWords.\n\n', 30_000],
  // A tab is four columns, so this is code, not a list.
  ['code that looks like a list', '\t- a\n\nb\n\n', 30_000],
  // A line that leaves a quote and starts a list: one closes the other, and nothing is reread.
  ['a quote and a list in turn', '> a\n2. b\n> a\n', 20_000],
];

describe('what a document costs the parser in lists and quotes that end', () => {
  test.each(SLOW)('refuses %j, over and over', (unit) => {
    const text = `\`\`\`\nx\n\`\`\`\n\n${unit.repeat(20_000)}`;
    expect(closesTooOften(text)).toBe(true);
    expect(() => parseMarkdown(text)).toThrow(/too many marks/);
  });

  test.each(QUICK)('reads %s, however long', (_name, unit, n) => {
    expect(closingCost(unit.repeat(n))).toBeLessThan(CLOSING_BUDGET / 100);
  });

  test('reads a few thousand lists that each end at a paragraph', () => {
    const text = `\`\`\`\nx\n\`\`\`\n\n${'- a\n\nb\n\n'.repeat(2000)}`;
    expect(closesTooOften(text)).toBe(false);
    expect(parseMarkdown(text).children).toHaveLength(4001);
  });

  test('reads lists whose items wrap without an indent, as many people write them', () => {
    const lazy = '- an item that is long\nand wraps to the margin\n'.repeat(6000);
    expect(closesTooOften(`<b>x</b>\n\n${lazy}`)).toBe(false);
    const spaced = '- an item that is long\nand wraps to the margin\n\n'.repeat(6000);
    expect(closesTooOften(`<b>x</b>\n\n${spaced}`)).toBe(false);
  });

  test('reads an outline of a few thousand items that each hold a list', () => {
    expect(closesTooOften('- a\n  - b\n  - c\n'.repeat(4000))).toBe(false);
    // A list of another kind closes the last one without the parser moving anything.
    expect(closingCost('- a\n  - b\n1. c\n  - d\n'.repeat(4000))).toBe(0);
  });

  test('reads a long changelog: a heading, a list, a heading, a list', () => {
    const section = '## 1.2.3\n\n### Fixed\n\n- one thing\n- another, with `code`\n\n';
    expect(closesTooOften(`\`\`\`\nx\n\`\`\`\n\n${section.repeat(3000)}`)).toBe(false);
  });

  test('charges nothing in a document with no list, quote or note', () => {
    expect(closingCost('Words.\n\n# Heading\n\n    code\n\n***\n'.repeat(1000))).toBe(0);
    expect(closingCost('')).toBe(0);
  });

  test('stops counting once past what it was given', () => {
    const text = '- a\n\nb\n\n'.repeat(50_000);
    expect(closingCost(text, 1000)).toBeGreaterThan(1000);
    expect(closingCost(text, 1000)).toBeLessThan(10_000);
  });

  test(
    'is counted in linear time, however deep the lists',
    () => {
      const deep = (n: number) => `${'- '.repeat(40)}a\n\nb\n\n`.repeat(n);
      const flat = (n: number) => '> a\nb\n'.repeat(n);
      for (const make of [deep, flat]) {
        const { growth } = scaling(make, (text) => closingCost(text), 2000);
        expect(growth).toBeLessThan(MAX_GROWTH);
      }
    },
    SCALING_TIMEOUT,
  );

  /** A small random generator, seeded, so a failure comes back the same. */
  function random(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  }
  const LINES = [
    '',
    '',
    'b',
    ' b',
    '  b',
    '    b',
    '- a',
    '-',
    '1. a',
    '2) a',
    '> a',
    '>',
    '> - a',
    '- > a',
    '# h',
    '***',
    '```',
    '===',
    '[^a]: x',
    '>  b',
    '  - c',
    '* * *',
    '<div>',
    '+ a',
    '   > a',
  ];

  // Whatever the lines, a document this counts as cheap is cheap: the parser reads it at once.
  // One it missed would hold the parser for a minute at this size.
  test(
    'never calls a slow document cheap',
    () => {
      const next = random(20261123);
      for (let i = 0; i < 12; i++) {
        const unit = Array.from(
          { length: 1 + Math.floor(next() * 4) },
          () => LINES[Math.floor(next() * LINES.length)] as string,
        );
        const text = `${unit.join('\n')}\n`.repeat(Math.ceil(30_000 / unit.length));
        if (closesTooOften(text)) continue;
        const start = performance.now();
        readWhole(text);
        expect(performance.now() - start, JSON.stringify(unit)).toBeLessThan(10_000);
      }
    },
    SCALING_TIMEOUT,
  );
});
