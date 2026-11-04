// A long document read in pieces (src/pieces.ts): the same tree as reading it whole, and fast.
import { describe, expect, test } from 'vitest';
import { parseMarkdown } from '../src';
import { readWhole } from '../src/parse';
import { cutsOf, PIECE, readInPieces, readPlain } from '../src/pieces';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

/** `n` parts, as the novel-deep-parts trap has 20,000 of them (fixtures/trap/traps.ts). */
const parts = (n: number) =>
  Array.from(
    { length: n },
    (_, i) => `# Part ${i}\n\n# Chapter ${i}\n\n## Section ${i}\n\nWords.\n\n***\n\nMore words.\n`,
  ).join('\n');

/** The same, with emphasis in every part, so every piece goes to the parser. */
const marked = (n: number) => parts(n).replaceAll('More words.', 'More *words*.');

/** The tree as JSON, so the order of keys and every position count. */
const json = (tree: unknown) => JSON.stringify(tree);

/** Read in pieces cut as small as they can be, and whole: the two must be the same. */
const same = (text: string, piece = 1) => {
  const cuts = cutsOf(text, piece);
  expect(json(readInPieces(text, cuts, readWhole))).toBe(json(readWhole(text)));
  return cuts;
};

/** A small random generator, seeded, so a failure comes back the same. */
function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const BLOCKS = [
  '# Heading',
  '## Heading *two*',
  '###### Six',
  '#',
  '#notaheading',
  '####### seven',
  'A paragraph with *emphasis*, **strong**, `code` and a [link](http://x.y).',
  'Two lines\nof one paragraph.',
  'Setext\n===',
  'Setext two\n---',
  '***',
  '- one\n- two',
  '- loose\n\n- list',
  '1. one\n2. two\n\n   more of two',
  '> a quote\n> # heading inside',
  '> lazy\ncontinued',
  '    indented code\n\n    more code',
  '- item\n\n      code in an item',
  'Hard break  \nafter it',
  'Tab\tin\ta line',
  '\t# tab-indented',
  '   # three spaces',
  'Ends in a CR\r\nline',
  '# CRLF heading\r\n',
  'A [ref] and a [^note] with no definitions.',
  '* star item\n\n  second paragraph',
  '+ plus item',
  'Entity &amp; &copy; &#35;',
  '\\# escaped',
];

describe('a long document read in pieces', () => {
  test('cuts the novel of many parts, and reads it as it reads it whole', () => {
    const text = parts(400);
    const cuts = same(text, 256);
    expect(cuts.length).toBeGreaterThan(50);
    for (const cut of cuts) expect(text[cut]).toBe('#');
  });

  test('reads a flood of headings with no blank lines between them the same', () => {
    expect(same('#\n'.repeat(3000)).length).toBeGreaterThan(2000);
    expect(same('# a\r\n## b\r\n'.repeat(500)).length).toBeGreaterThan(500);
  });

  test('reads random documents of every kind of block the same, cut wherever it can be', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const next = random(seed);
      const blocks: string[] = [];
      for (let i = 0; i < 40; i++) {
        const block = BLOCKS[Math.floor(next() * BLOCKS.length)] as string;
        const gap = ['\n', '\n\n', '\n\n\n', '\r\n\r\n', '\n  \n'][Math.floor(next() * 5)];
        blocks.push(block, gap as string);
      }
      same(blocks.join(''));
    }
  });

  test('never cuts a document with a fence, HTML, or a definition', () => {
    const long = parts(200);
    expect(cutsOf(long, 64).length).toBeGreaterThan(0);
    for (const spoiler of ['```\n', '~~~\n', '<!-- x\n', '<div>\n', '[a]: /u\n', '[^n]: note\n'])
      expect(cutsOf(`${spoiler}\n${long}`, 64)).toEqual([]);
    // Each of those reaches past a heading, so a cut there would have changed the tree.
    expect(json(readWhole(`\`\`\`\n${long}`).children?.length)).toBe('1');
  });

  test('never cuts a document that still starts with a byte-order mark', () => {
    const long = parts(200);
    expect(cutsOf(`\uFEFF${long}`, 64)).toEqual([]);
    const text = `\uFEFF\uFEFF${parts(2000)}`;
    expect(json(parseMarkdown(text))).toBe(json(readWhole(text.slice(1))));
  });

  test('never cuts a short document', () => {
    expect(cutsOf(parts(10))).toEqual([]);
    expect(parts(10).length).toBeLessThan(2 * PIECE);
  });

  test('parseMarkdown reads the novel of many parts as it reads it whole', () => {
    const text = parts(2000);
    expect(cutsOf(text).length).toBeGreaterThan(10);
    expect(json(parseMarkdown(text))).toBe(json(readWhole(text)));
  });

  test.each([
    ['plain', parts],
    ['with emphasis', marked],
  ] as const)(
    'reads many parts %s in linear time',
    (name, make) => {
      const { small, large, growth } = scaling(make, (text) => parseMarkdown(text), 2500, 3);
      console.log(
        `Parts ${name}: ${small.toFixed(1)} ms at n, ${large.toFixed(1)} ms at 4n (growth ${growth.toFixed(1)}).`,
      );
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );

  test('reads parts with emphasis, through the parser piece by piece, as it reads them whole', () => {
    const text = marked(1000);
    expect(readPlain(text.slice(0, PIECE))).toBeNull();
    expect(json(parseMarkdown(text))).toBe(json(readWhole(text)));
  });

  test(
    'reads a long novel at the rate it reads a short one, and faster than reading it whole',
    () => {
      // Read whole, the parser's cost per character grows with the document (its token array),
      // which a growth check from n to 4n is too coarse to see: the rate of one piece against the
      // rate of 160 times as much is. The novel-deep-parts trap took a second that way.
      const short = parts(50);
      const long = parts(8000);
      const best = (run: () => unknown) => {
        run();
        let ms = Number.POSITIVE_INFINITY;
        for (let i = 0; i < 3; i++) {
          const start = performance.now();
          run();
          ms = Math.min(ms, performance.now() - start);
        }
        return ms;
      };
      const perShort = best(() => parseMarkdown(short)) / short.length;
      const perLong = best(() => parseMarkdown(long)) / long.length;
      const perWhole = best(() => readWhole(long)) / long.length;
      console.log(
        `Per MB: short ${(perShort * 1e6).toFixed(0)} ms, long ${(perLong * 1e6).toFixed(0)} ms, long read whole ${(perWhole * 1e6).toFixed(0)} ms.`,
      );
      expect(perLong).toBeLessThan(perShort * 1.5);
      expect(perLong).toBeLessThan(perWhole);
    },
    SCALING_TIMEOUT,
  );
});

describe('a plain piece read without the parser', () => {
  const both = (text: string) => {
    const plain = readPlain(text);
    if (plain) expect(json(plain)).toBe(json(readWhole(text)));
    return plain;
  };

  test('reads the novel of many parts, and a flood of headings, as the parser does', () => {
    expect(both(parts(300))).not.toBeNull();
    expect(both('#\n'.repeat(500))).not.toBeNull();
    expect(both('# One\nWords.\n***\nMore\nwords.\n## Two')).not.toBeNull();
    expect(
      both('A café 😀 “quoted” — and ‘so’ on! (Yes?) 50% of $3; a:b|c^d {e} @f / g=h-i+j.\n'),
    ).not.toBeNull();
  });

  test('leaves every mark, and every line that starts a block, to the parser', () => {
    for (const text of [
      'Some *emphasis*.',
      'Some _emphasis_.',
      '`code`',
      'A [link](x)',
      'A \\ escape',
      'An &amp; entity',
      'A <b>tag</b>',
      '~~struck~~',
      '# Closing #',
      '#Tight',
      '####### Seven',
      '#  Two spaces',
      '# ',
      '- item',
      '+ item',
      '1. item',
      'Text\n===',
      'Text\n---',
      ' indented',
      'trailing ',
      'a\ttab',
      'a\r\nCRLF',
      'a\u0000nul',
      '* * *',
      '﻿bom',
    ])
      expect(both(text), JSON.stringify(text)).toBeNull();
  });

  test('reads random plain documents as the parser does, and refuses the rest', () => {
    // Mostly plain pieces, and now and then one that may not be, so both sides are tried.
    const good = [
      '\n# ',
      '\n## ',
      '\n###### ',
      '\n#\n',
      'Word',
      'word',
      'a b',
      '\n',
      '\n\n',
      '\n***\n',
      'x1',
      '.',
      ',',
      '!',
      '😀',
      'é',
      'x-y',
      'x=y',
    ];
    const bad = [
      '  ',
      '*',
      '_',
      '\t',
      '+',
      '>',
      '\r',
      '#',
      '***',
      '\n-',
      '\n=',
      '\n1',
      ' \n',
      '\n ',
    ];
    let plainOnes = 0;
    for (let seed = 1; seed <= 5000; seed++) {
      const next = random(seed);
      let text = '';
      for (let i = 0; i < 30; i++) {
        const from = next() < 0.97 ? good : bad;
        text += from[Math.floor(next() * from.length)];
      }
      if (both(text)) plainOnes++;
    }
    // Enough of them plain that the comparison means something.
    expect(plainOnes).toBeGreaterThan(100);
  });
});
