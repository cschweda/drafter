import { describe, expect, it } from 'vitest';
import { type DocBlock, documentBlocks, type Run, safeLink } from '../src/document/blocks';
import { STYLE } from '../src/document/style';
import type { DocNode } from '../src/document/tree';
import { md } from './document-helpers';

/** US Letter's text width, 612 pt less two 72 pt margins. */
const LETTER = 468;
const blocksOf = (source: string, textWidth = LETTER) => documentBlocks(md(source), textWidth);
const textOf = (block: DocBlock | undefined) => (block?.runs ?? []).map((run) => run.text).join('');
/** The runs of a block whose text includes `part`. */
const runWith = (block: DocBlock | undefined, part: string): Run | undefined =>
  block?.runs.find((run) => run.text.includes(part));

describe('documentBlocks', () => {
  it("a heading's level, size, and space before follow the table", () => {
    const blocks = blocksOf(
      [
        'Opening lines.',
        '# The harbour',
        'Gulls.',
        '## The pier',
        'Rope.',
        '### The boathouse',
        'Oars.',
        '#### The shed',
        'Nets.',
        'The ferry\n---------',
        'Wake.',
      ].join('\n\n'),
    );
    const headings = blocks.filter((block) => block.kind === 'heading');
    expect(headings.map((h) => [h.level, h.size, h.leading, h.spaceBefore])).toEqual([
      [1, 22, 28, 24],
      [2, 17, 22, 20],
      [3, 14, 19, 16],
      [4, 11, 16, 12],
      [2, 17, 22, 20], // a Setext heading
    ]);
    for (const heading of headings) {
      expect(heading.keepWithNext).toBe(true);
      expect(
        heading.runs.every((run) => run.face === 'textBold' && run.size === heading.size),
      ).toBe(true);
      expect(heading.runs.every((run) => run.color === 'text')).toBe(true);
    }
    // What follows a heading has 6 pt before it; text after text, 8.
    const after = blocks.filter((_, i) => blocks[i - 1]?.kind === 'heading');
    expect(after.map((block) => block.spaceBefore)).toEqual([6, 6, 6, 6, 6]);
    expect(blocks[0]).toMatchObject({
      kind: 'text',
      level: null,
      size: 11,
      leading: 16,
      keepWithNext: false,
    });
  });

  it('a heading directly under a heading keeps its own space before', () => {
    const blocks = blocksOf('# Ledger\n\n## Spring accounts\n\nBarley sold.');
    expect(blocks.map((block) => block.spaceBefore)).toEqual([24, 20, 6]);
  });

  it('headings 5 and 6 are muted', () => {
    const blocks = blocksOf('#### Four\n\n##### Five\n\n###### Six');
    expect(blocks.map((block) => [block.level, block.size, block.runs[0]?.color])).toEqual([
      [4, 11, 'text'],
      [5, 11, 'muted'],
      [6, 11, 'muted'],
    ]);
  });

  it('emphasis is Italic, strong SemiBold, both SemiBold Italic', () => {
    const [para] = blocksOf('Plain *slanted* **heavy** ***both*** _under_ __double__.');
    expect(runWith(para, 'Plain')?.face).toBe('text');
    expect(runWith(para, 'slanted')?.face).toBe('textItalic');
    expect(runWith(para, 'heavy')?.face).toBe('textBold');
    expect(runWith(para, 'both')?.face).toBe('textBoldItalic');
    expect(runWith(para, 'under')?.face).toBe('textItalic');
    expect(runWith(para, 'double')?.face).toBe('textBold');
    expect(textOf(para)).toBe('Plain slanted heavy both under double.');
    const [heading] = blocksOf('## A *quiet* morning');
    expect(runWith(heading, 'quiet')?.face).toBe('textBoldItalic');
    expect(runWith(heading, 'morning')?.face).toBe('textBold');
  });

  it('inline code is Courier Prime at 10 pt', () => {
    const [para] = blocksOf('Type `ledger --close` and wait.');
    expect(runWith(para, 'ledger')).toMatchObject({
      text: 'ledger --close',
      face: 'code',
      size: 10,
    });
    expect(runWith(para, 'Type')).toMatchObject({ face: 'text', size: 11 });
    expect(para?.panel).toBe(false);
    // In a heading it keeps the same proportion to the heading's text.
    const [heading] = blocksOf('# Running `tally`');
    expect(runWith(heading, 'tally')).toMatchObject({ face: 'code', size: (22 * 10) / 11 });
  });

  it('a soft break is a space and a hard break a new line', () => {
    const [para] = blocksOf('The lamp\nwent out.  \nThen the stove\\\ncooled.');
    expect(para?.runs.map((run) => run.text)).toEqual([
      'The lamp went out.',
      '\n',
      'Then the stove',
      '\n',
      'cooled.',
    ]);
    const [tabbed] = blocksOf('Salt\tand pepper.');
    expect(textOf(tabbed)).toBe('Salt and pepper.');
  });

  it('a quote indents 16 pt with a bar, and a quote in a quote adds another', () => {
    const blocks = blocksOf(
      'Before.\n\n> Outer words.\n>\n> > Inner words.\n>\n> Outer again.\n\nAfter.',
    );
    expect(blocks.map((block) => [textOf(block), block.indent, block.quoteBars])).toEqual([
      ['Before.', 0, []],
      ['Outer words.', 16, [1]],
      ['Inner words.', 32, [1, 17]],
      ['Outer again.', 16, [1]],
      ['After.', 0, []],
    ]);
    expect(blocks.map((block) => block.spaceBefore)).toEqual([8, 8, 8, 8, 8]);
  });

  it("a quote's text keeps its own styles", () => {
    const [quote] = blocksOf('> Plain and *slanted* and **heavy**.');
    expect(runWith(quote, 'Plain')?.face).toBe('text');
    expect(runWith(quote, 'slanted')?.face).toBe('textItalic');
    expect(runWith(quote, 'heavy')?.face).toBe('textBold');
  });

  it('an ordered list counts from its start', () => {
    const blocks = blocksOf('3. Thistle\n4. Clover\n5. Sorrel');
    expect(blocks.map((block) => [block.marker?.text, textOf(block), block.indent])).toEqual([
      ['3.', 'Thistle', 18],
      ['4.', 'Clover', 18],
      ['5.', 'Sorrel', 18],
    ]);
    expect(blocks[0]?.marker).toMatchObject({
      face: 'text',
      size: 11,
      color: 'text',
      underline: false,
      link: null,
    });
    const ten = blocksOf(Array.from({ length: 10 }, (_, i) => `${i + 1}. Row`).join('\n'));
    expect(ten.map((block) => block.marker?.text).slice(8)).toEqual(['9.', '10.']);
  });

  it('nested lists indent 18 pt a level, with •, ◦, ▪', () => {
    const blocks = blocksOf(
      ['- Orchard', '  - Pears', '    - Bosc', '      - Ripe', '        - Soft', '- Meadow'].join(
        '\n',
      ),
    );
    expect(blocks.map((block) => [block.marker?.text, textOf(block), block.indent])).toEqual([
      ['•', 'Orchard', 18],
      ['◦', 'Pears', 36],
      ['▪', 'Bosc', 54],
      ['▪', 'Ripe', 72],
      ['▪', 'Soft', 90],
      ['•', 'Meadow', 18],
    ]);
    // A numbered list inside a bulleted one counts as a level.
    const mixed = blocksOf('1. First\n   - inner\n     - deeper');
    expect(mixed.map((block) => block.marker?.text)).toEqual(['1.', '◦', '▪']);
  });

  it("a list item's second paragraph has no marker", () => {
    const blocks = blocksOf('- The first thought.\n\n  The same thought, later.\n\n- Another.');
    expect(
      blocks.map((block) => [block.marker?.text ?? null, textOf(block), block.indent]),
    ).toEqual([
      ['•', 'The first thought.', 18],
      [null, 'The same thought, later.', 18],
      ['•', 'Another.', 18],
    ]);
  });

  it('an item that starts with a list, or is empty, still prints its marker', () => {
    const blocks = blocksOf('- - Nested at once\n-\n- Last');
    expect(
      blocks.map((block) => [block.marker?.text ?? null, textOf(block), block.indent]),
    ).toEqual([
      ['•', '', 18],
      ['◦', 'Nested at once', 36],
      ['•', '', 18],
      ['•', 'Last', 18],
    ]);
  });

  it('a loose list puts 4 pt between items, a tight one none', () => {
    const tight = blocksOf('Intro.\n\n- one\n- two\n- three');
    expect(tight.map((block) => block.spaceBefore)).toEqual([8, 8, 0, 0]);
    const loose = blocksOf('Intro.\n\n- one\n\n- two\n\n- three');
    expect(loose.map((block) => block.spaceBefore)).toEqual([8, 8, 4, 4]);
    const nested = blocksOf('- one\n  - inner\n- two');
    expect(nested.map((block) => block.spaceBefore)).toEqual([8, 0, 0]);
  });

  it('a code block keeps every space and turns tabs to four', () => {
    const [code] = blocksOf('```js\nif (dawn) {\n\twake();\n    stretch();  \n}\n```');
    expect(code).toMatchObject({ kind: 'code', panel: true, size: 9.5, leading: 13, indent: 0 });
    expect(code?.runs.map((run) => run.text)).toEqual([
      'if (dawn) {',
      '\n',
      '    wake();',
      '\n',
      '    stretch();  ',
      '\n',
      '}',
    ]);
    expect(code?.runs.every((run) => run.face === 'code' && run.size === 9.5)).toBe(true);
    const [, block] = blocksOf('Text.\n\n    first\n\n    third');
    expect(block?.runs.map((run) => run.text)).toEqual(['first', '\n', '\n', 'third']);
  });

  it('a raw HTML block is code-faced text with no panel, as typed', () => {
    const [raw] = blocksOf('<div class="note">\n  <b>Hold</b> the door\n</div>');
    expect(raw).toMatchObject({ kind: 'raw', panel: false, size: 9.5, leading: 13 });
    expect(raw?.runs.map((run) => run.text)).toEqual([
      '<div class="note">',
      '\n',
      '  <b>Hold</b> the door',
      '\n',
      '</div>',
    ]);
    expect(raw?.runs.every((run) => run.face === 'code')).toBe(true);
  });

  it('inline HTML prints as typed', () => {
    const [para] = blocksOf('A <span class="x">kept</span> tag.');
    expect(textOf(para)).toBe('A <span class="x">kept</span> tag.');
    expect(para?.runs).toHaveLength(1);
    expect(para?.runs[0]?.face).toBe('text');
  });

  it('an image is [Image: alt], muted and Italic, or [Image: no description]', () => {
    const [para] = blocksOf('See ![a lighthouse at dusk](tower.png) and ![](blank.png).');
    expect(runWith(para, 'lighthouse')).toMatchObject({
      text: '[Image: a lighthouse at dusk]',
      face: 'textItalic',
      color: 'muted',
      underline: false,
      link: null,
    });
    expect(runWith(para, 'no description')).toMatchObject({
      text: '[Image: no description]',
      color: 'muted',
    });
    expect(textOf(para)).toBe('See [Image: a lighthouse at dusk] and [Image: no description].');
    const [ref] = blocksOf('![the quay][q]\n\n[q]: quay.png');
    expect(textOf(ref)).toBe('[Image: the quay]');
  });

  it('an image inside a safe link is part of the link: blue, underlined, with its address', () => {
    const [para] = blocksOf('[![a map](m.png)](https://drafter.dev/)');
    expect(para?.runs).toMatchObject([
      {
        text: '[Image: a map]',
        face: 'textItalic',
        color: 'link',
        underline: true,
        link: 'https://drafter.dev/',
      },
    ]);
  });

  it('a thematic break is a rule', () => {
    const blocks = blocksOf('Above.\n\n---\n\nBelow.\n\n# Next part');
    expect(blocks.map((block) => block.kind)).toEqual(['text', 'rule', 'text', 'heading']);
    expect(blocks[1]).toMatchObject({ runs: [], spaceBefore: 12, marker: null, panel: false });
    expect(blocks[2]?.spaceBefore).toBe(12);
    expect(blocks[3]?.spaceBefore).toBe(24);
  });

  it("a reference link takes its definition's address, and the definition prints nothing", () => {
    const blocks = blocksOf(
      'Read [the almanac][alm] and [ALM] again.\n\n[alm]: https://drafter.dev/almanac\n\nEnd.',
    );
    expect(blocks.map(textOf)).toEqual(['Read the almanac and ALM again.', 'End.']);
    expect(runWith(blocks[0], 'the almanac')).toMatchObject({
      color: 'link',
      underline: true,
      link: 'https://drafter.dev/almanac',
    });
    expect(runWith(blocks[0], 'ALM')?.link).toBe('https://drafter.dev/almanac');
    // A definition inside a quote still gives its address.
    const [quoted] = blocksOf('[tide][t]\n\n> [t]: https://drafter.dev/tide');
    expect(runWith(quoted, 'tide')?.link).toBe('https://drafter.dev/tide');
  });

  it('a reference with no definition prints as typed', () => {
    const [para] = blocksOf('See [the map][nowhere] and [nothing].');
    expect(textOf(para)).toBe('See [the map][nowhere] and [nothing].');
    expect(para?.runs.every((run) => run.link === null && run.color === 'text')).toBe(true);
    // A tree with a reference whose definition isn't there: its text, plain.
    const tree = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'linkReference',
              identifier: 'gone',
              label: 'gone',
              children: [{ type: 'text', value: 'gone' }],
            },
          ],
        },
      ],
    };
    const [orphan] = documentBlocks(tree, LETTER);
    expect(orphan?.runs).toMatchObject([
      { text: 'gone', color: 'text', underline: false, link: null },
    ]);
  });

  it('only http, https, and mailto links get an address', () => {
    for (const url of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<b>hi</b>',
      'file:///etc/passwd',
      'notes.md',
      '#top',
      'https://exa mple.com',
      '',
      undefined,
    ]) {
      expect(safeLink(url), String(url)).toBeNull();
    }
    expect(safeLink('https://drafter.dev/')).toBe('https://drafter.dev/');
    expect(safeLink('http://drafter.dev/notes?a=1#b')).toBe('http://drafter.dev/notes?a=1#b');
    expect(safeLink('mailto:a@b.example')).toBe('mailto:a@b.example');
    expect(safeLink('https://例え.jp/パス')).toBe('https://xn--r8jz45g.jp/%E3%83%91%E3%82%B9');
    // Through the parser: an autolink, an email autolink, and an inline link.
    const [para] = blocksOf('<https://drafter.dev/> <a@b.example> [run](javascript:alert(1))');
    expect(runWith(para, 'https://drafter.dev/')?.link).toBe('https://drafter.dev/');
    expect(runWith(para, 'a@b.example')?.link).toBe('mailto:a@b.example');
    expect(runWith(para, 'run')?.link).toBeNull();
  });

  it('a link without an address is plain text, not blue or underlined', () => {
    const [para] = blocksOf(
      'Open [the notes](notes.md) or [the top](#top) or [*here*](https://drafter.dev/).',
    );
    expect(runWith(para, 'the notes')).toMatchObject({
      color: 'text',
      underline: false,
      link: null,
      face: 'text',
    });
    expect(runWith(para, 'the top')).toMatchObject({ color: 'text', underline: false, link: null });
    expect(runWith(para, 'here')).toMatchObject({
      color: 'link',
      underline: true,
      link: 'https://drafter.dev/',
      face: 'textItalic',
    });
  });

  it('deep nesting stops indenting at a quarter of the width', () => {
    const quotes = `${'> '.repeat(5)}${Array.from({ length: 20 }, (_, i) => `${'  '.repeat(i)}- level ${i + 1}`).join(`\n${'> '.repeat(5)}`)}`;
    for (const width of [468, 451.28]) {
      const blocks = blocksOf(quotes, width);
      expect(blocks).toHaveLength(20);
      for (const block of blocks) {
        expect(width - block.indent, `${width} ${textOf(block)}`).toBeGreaterThanOrEqual(width / 4);
        for (const bar of block.quoteBars) expect(bar).toBeLessThan(block.indent);
      }
      const indents = blocks.map((block) => block.indent);
      expect(indents.slice(0, 3)).toEqual([98, 116, 134]); // five quotes (80), then 18 a level
      expect(Math.max(...indents)).toBeGreaterThan(width * 0.75 - 18);
      expect(blocks.at(-1)?.quoteBars).toEqual([1, 17, 33, 49, 65]);
    }
    const deep = blocksOf(Array.from({ length: 40 }, (_, i) => `${'  '.repeat(i)}- x`).join('\n'));
    expect(Math.max(...deep.map((block) => block.indent))).toBeLessThanOrEqual(LETTER * 0.75);
    // The width has no default: the layout always passes the paper's.
    // @ts-expect-error textWidth is required
    expect(() => documentBlocks(md('x'))).not.toThrow();
  });

  it('no depth of nesting overflows the stack', () => {
    const DEEP = 10_000;
    /** `inner` wrapped `depth` times by `wrap`, built without recursion. */
    const nest = (depth: number, inner: DocNode, wrap: (child: DocNode) => DocNode) => {
      let node = inner;
      for (let i = 0; i < depth; i++) node = wrap(node);
      return node;
    };
    const para = (...children: DocNode[]): DocNode => ({ type: 'paragraph', children });
    const text = (value: string): DocNode => ({ type: 'text', value });
    const root = (...children: DocNode[]): DocNode => ({ type: 'root', children });
    const started = Date.now();

    const quoted = documentBlocks(
      root(
        nest(DEEP, para(text('Bottom.')), (child) => ({ type: 'blockquote', children: [child] })),
      ),
      LETTER,
    );
    expect(quoted.map(textOf)).toEqual(['Bottom.']);
    expect(quoted[0]?.indent).toBeLessThanOrEqual(LETTER * 0.75);

    const listed = documentBlocks(
      root(
        nest(DEEP, para(text('Bottom.')), (child) => ({
          type: 'list',
          children: [{ type: 'listItem', children: [child] }],
        })),
      ),
      LETTER,
    );
    expect(listed).toHaveLength(DEEP); // every marker but the last on a line of its own
    expect(textOf(listed.at(-1))).toBe('Bottom.');
    expect(listed.at(-1)?.marker?.text).toBe('▪');

    const slanted = documentBlocks(
      root(para(nest(DEEP, text('Bottom.'), (child) => ({ type: 'emphasis', children: [child] })))),
      LETTER,
    );
    expect(slanted[0]?.runs).toMatchObject([{ text: 'Bottom.', face: 'textItalic' }]);

    // A definition far down still gives its address.
    const [linked] = documentBlocks(
      root(
        para({
          type: 'linkReference',
          identifier: 'deep',
          children: [text('the well')],
        }),
        nest(
          DEEP,
          { type: 'definition', identifier: 'deep', url: 'https://drafter.dev/well' },
          (child) => ({ type: 'blockquote', children: [child] }),
        ),
      ),
      LETTER,
    );
    expect(runWith(linked, 'the well')?.link).toBe('https://drafter.dev/well');

    // And through the parser.
    expect(blocksOf(`${'>'.repeat(5000)} x`).map(textOf)).toEqual(['x']);
    expect(textOf(blocksOf(`${'- '.repeat(1000)}x`).at(-1))).toBe('x');
    expect(blocksOf(`${'*'.repeat(5000)}x${'*'.repeat(5000)}`).map(textOf)).toEqual(['x']);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('a document of only definitions prints nothing', () => {
    expect(blocksOf('[a]: https://drafter.dev/\n[b]: https://drafter.dev/b')).toEqual([]);
    expect(blocksOf('')).toEqual([]);
  });
});

describe('STYLE', () => {
  it('holds the design’s values', () => {
    expect(STYLE.headings.map((h) => [h.size, h.leading, h.before, h.muted])).toEqual([
      [22, 28, 24, false],
      [17, 22, 20, false],
      [14, 19, 16, false],
      [11, 16, 12, false],
      [11, 16, 12, true],
      [11, 16, 12, true],
    ]);
    expect(STYLE.colors).toEqual({
      text: '#000000',
      muted: '#555555',
      link: '#1f4e9a',
      panel: '#f3f3f3',
      rule: '#9a9a9a',
    });
  });
});
