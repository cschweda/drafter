import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type DocBlock, documentBlocks, MARKER_GAP, type Run } from '../src/document/blocks';
import { type DocLine, wrapBlock } from '../src/document/lines';
import type { Measure } from '../src/document/measure';
import { fontMeasure } from '../src/document/measure';
import { STYLE } from '../src/document/style';
import { fixedMeasure, md } from './document-helpers';
import { documentFonts } from './helpers';

/** At 10 pt, `fixedMeasure` makes every character 5 pt wide: a 50 pt line holds ten. */
const run = (text: string, over: Partial<Run> = {}): Run => ({
  text,
  face: 'text',
  size: 10,
  color: 'text',
  underline: false,
  link: null,
  ...over,
});
const block = (runs: Run[], over: Partial<DocBlock> = {}): DocBlock => ({
  kind: 'text',
  level: null,
  indent: 0,
  quoteBars: [],
  marker: null,
  runs,
  size: 10,
  leading: 14,
  spaceBefore: 8,
  keepWithNext: false,
  panel: false,
  ...over,
});
const BOLD = { face: 'textBold' } as const;

const wrap = (b: DocBlock, width: number, measure: Measure = fixedMeasure) => {
  const missing = new Set<string>();
  return { lines: wrapBlock(b, width, measure, missing), missing };
};
const textOf = (line: DocLine | undefined) =>
  (line?.fragments ?? []).map((fragment) => fragment.text).join('');
const textsOf = (lines: DocLine[]) => lines.map(textOf);

/** Every fragment ends at or before `right`, unless it is one character alone on its line. */
function expectWithin(lines: DocLine[], right: number) {
  for (const line of lines) {
    const last = line.fragments.at(-1);
    if (!last) continue;
    const alone = line.fragments.length === 1 && [...last.text].length === 1;
    if (!alone) expect(last.x + last.width, textOf(line)).toBeLessThanOrEqual(right);
    for (const fragment of line.fragments) {
      expect(fragment.x + fragment.width).toBeLessThanOrEqual(alone ? Infinity : right);
    }
  }
}

describe('wrapBlock', () => {
  it('breaks at spaces, first fit', () => {
    const { lines } = wrap(block([run('aaa bbb ccc dddd')]), 50);
    expect(textsOf(lines)).toEqual(['aaa bbb', 'ccc dddd']);
    expect(lines[0]?.fragments).toEqual([
      {
        x: 0,
        text: 'aaa bbb',
        face: 'text',
        size: 10,
        color: 'text',
        underline: false,
        link: null,
        width: 35,
      },
    ]);
    expect(lines.map((line) => line.height)).toEqual([14, 14]);
  });

  it('breaks a word wider than the line at the edge', () => {
    expect(textsOf(wrap(block([run('abcdefghijklmnop')]), 50).lines)).toEqual([
      'abcdefghij',
      'klmnop',
    ]);
    // The word starts a line of its own before it breaks.
    expect(textsOf(wrap(block([run('ab abcdefghijkl')]), 50).lines)).toEqual([
      'ab',
      'abcdefghij',
      'kl',
    ]);
    // A character wider than the line itself still takes a line, alone.
    expect(textsOf(wrap(block([run('abc')]), 3).lines)).toEqual(['a', 'b', 'c']);
  });

  it('breaks after a zero-width space', () => {
    const { lines } = wrap(block([run('aaaa​bbbbbbbb')]), 50);
    expect(textsOf(lines)).toEqual(['aaaa', 'bbbbbbbb']);
    // Unbroken, it is dropped: it has no width to draw.
    expect(textsOf(wrap(block([run('aa​bb')]), 50).lines)).toEqual(['aabb']);
  });

  it('never breaks a no-break space', () => {
    const { lines } = wrap(block([run('aaa bbb cccc')]), 50);
    expect(textsOf(lines)).toEqual(['aaa', 'bbb cccc']);
  });

  it('drops a soft hyphen', () => {
    const { lines, missing } = wrap(block([run('fan­tastic fan­tastic')]), 50);
    expect(textsOf(lines)).toEqual(['fantastic', 'fantastic']);
    expect(lines[0]?.fragments[0]?.width).toBe(45);
    expect(missing.size).toBe(0);
  });

  it('merges runs of one style on a line, spaces included', () => {
    const { lines } = wrap(block([run('alpha '), run('beta')]), 100);
    expect(lines[0]?.fragments.map((f) => [f.x, f.text, f.width])).toEqual([[0, 'alpha beta', 50]]);
    const styled = wrap(block([run('one '), run('two', BOLD), run(' three')]), 100).lines;
    expect(styled[0]?.fragments.map((f) => [f.x, f.text, f.face, f.width])).toEqual([
      [0, 'one ', 'text', 20],
      [20, 'two', 'textBold', 15],
      [35, ' three', 'text', 30],
    ]);
  });

  it('a run that changes style mid-word stays on one line with its word', () => {
    const { lines } = wrap(block([run('xx abcd'), run('efgh', BOLD), run(' i')]), 50);
    expect(lines.map((line) => line.fragments.map((f) => [f.x, f.text]))).toEqual([
      [[0, 'xx']],
      [
        [0, 'abcd'],
        [20, 'efgh'],
        [40, ' i'],
      ],
    ]);
  });

  it('a trailing space is not drawn', () => {
    const { lines } = wrap(block([run('one '), run('two ', BOLD)]), 100);
    expect(lines[0]?.fragments.map((f) => f.text)).toEqual(['one ', 'two']);
    expect(textsOf(wrap(block([run('aaaa     bbbb')]), 30).lines)).toEqual(['aaaa', 'bbbb']);
  });

  it('a hard break starts a new line', () => {
    const { lines } = wrap(block([run('one'), run('\n'), run('two'), run('\n')]), 100);
    expect(textsOf(lines)).toEqual(['one', 'two', '']);
    expect(lines.map((line) => line.height)).toEqual([14, 14, 14]);
  });

  it("wraps a long code line at the panel's edge, keeping its spaces", () => {
    const code = (panel: boolean) =>
      block(
        [
          run('ab  cd  efgh  ij', { face: 'code' }),
          run('\n', { face: 'code' }),
          run('  k', { face: 'code' }),
        ],
        {
          kind: panel ? 'code' : 'raw',
          panel,
        },
      );
    // The panel's padding takes 8 pt each side of 66: ten characters a line.
    const panel = wrap(code(true), 66).lines;
    expect(textsOf(panel)).toEqual(['ab  cd  ef', 'gh  ij', '  k']);
    expect(panel.map((line) => line.fragments[0]?.x)).toEqual([8, 8, 8]);
    // The padding above and below the code is the first and last lines'.
    const pad = STYLE.codePadding;
    expect(panel.map((line) => line.height)).toEqual([14 + pad, 14, 14 + pad]);
    const plainAscent = wrap(block([run('x')]), 100).lines[0]?.ascent as number;
    expect(panel[0]?.ascent).toBe(plainAscent + pad);
    expect(panel[1]?.ascent).toBe(plainAscent);
    // Raw HTML has no panel: the line's own edge.
    expect(textsOf(wrap(code(false), 50).lines)).toEqual(['ab  cd  ef', 'gh  ij', '  k']);
    expect(wrap(code(false), 50).lines[0]?.fragments[0]?.x).toBe(0);
  });

  it('prints a character its face lacks as ? and reports it once', () => {
    const { lines, missing } = wrap(block([run('漢 and '), run('漢', { face: 'code' })]), 100);
    expect(lines[0]?.fragments.map((f) => f.text)).toEqual(['? and ', '?']);
    expect([...missing]).toEqual(['漢']);
  });

  it('a lone surrogate prints as ? and a control character as a space', () => {
    const { lines, missing } = wrap(block([run('a\ud800b\u0007c')]), 100);
    expect(textsOf(lines)).toEqual(['a?b c']);
    expect(missing.size).toBe(0);
  });

  it('an empty block is one line, with its marker if it has one', () => {
    expect(wrap(block([]), 100).lines).toEqual([
      { fragments: [], height: 14, ascent: expect.any(Number) },
    ]);
    const [item] = documentBlocks(md('-\n'), 468);
    const { lines } = wrap(item as DocBlock, 468);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.height).toBe(STYLE.textLeading);
    const marker = lines[0]?.fragments[0];
    expect(marker?.text).toBe('•');
    expect((marker?.x ?? 0) + (marker?.width ?? 0)).toBe(STYLE.listIndent - MARKER_GAP);
    const [heading] = documentBlocks(md('#\n'), 468);
    expect(wrap(heading as DocBlock, 468).lines).toEqual([
      { fragments: [], height: 28, ascent: expect.any(Number) },
    ]);
  });

  it('a rule is one line its own thickness high', () => {
    const [rule] = documentBlocks(md('---\n'), 468);
    expect(wrap(rule as DocBlock, 468).lines).toEqual([{ fragments: [], height: 0.5, ascent: 0 }]);
  });

  it("a marker sits on its block's first baseline", () => {
    for (const source of ['- ```\n  let x\n  ```\n', '- # Title\n', '- <div>\n']) {
      const [first] = documentBlocks(md(source), 468);
      const { lines } = wrap(first as DocBlock, 468);
      const [marker, text] = lines[0]?.fragments ?? [];
      expect(marker?.text, source).toBe('•');
      expect((marker?.x ?? 0) + (marker?.width ?? 0)).toBe(STYLE.listIndent - MARKER_GAP);
      expect(text?.x, source).toBeGreaterThanOrEqual(STYLE.listIndent);
    }
  });

  it('a list ten deep in a quote five deep stays inside the margin', () => {
    const quotes = '> '.repeat(5);
    const source = Array.from(
      { length: 10 },
      (_, depth) => `${quotes}${'  '.repeat(depth)}- ${'word '.repeat(30)}${'x'.repeat(400)}`,
    ).join('\n');
    for (const b of documentBlocks(md(source), 468)) expectWithin(wrap(b, 468).lines, 468);
  });

  it("with Inter Tight's widths, every fragment is as wide as it is drawn", () => {
    const measure = fontMeasure(documentFonts);
    // "1x2" draws wider whole than its characters do one by one, and "->" narrower:
    // contextual alternates, so a line is checked by measuring what it draws.
    const text = `${'1x2'.repeat(40)} -> ${'a->b '.repeat(30)}office`;
    for (const width of [40, 61.5, 100, 233, 468]) {
      const { lines } = wrap(
        block([run(text, { size: 11 }), run(' 1x2 ->', { ...BOLD, size: 11 })]),
        width,
        measure,
      );
      expectWithin(lines, width);
      for (const line of lines) {
        for (const f of line.fragments) expect(f.width).toBe(measure.width(f.text, f.face, f.size));
        for (const [a, b] of line.fragments.slice(1).map((f, i) => [line.fragments[i], f])) {
          expect(b?.x).toBe((a?.x ?? 0) + (a?.width ?? 0));
        }
      }
      expect(lines.map(textOf).join('').replace(/ /g, '')).toBe(`${text} 1x2 ->`.replace(/ /g, ''));
    }
  });

  it("checks the fonts' characters: control, lone surrogate, emoji, soft hyphen", () => {
    const measure = fontMeasure(documentFonts);
    expect(measure.has(0x1f600, 'text')).toBe(false);
    expect(measure.has(0x1f600, 'code')).toBe(false);
    expect(measure.has(0xad, 'text')).toBe(true);
    const source = 'a\u0007b\ud800c\u{1f600}d­e';
    const { lines, missing } = wrap(
      block([run(source, { size: 11 }), run(` ${source}`, { face: 'code', size: 10 })]),
      468,
      measure,
    );
    expect(lines[0]?.fragments.map((f) => f.text)).toEqual(['a b?c?de', ' a b?c?de']);
    expect([...missing]).toEqual(['\u{1f600}']);
  });
});

/** A measure whose widths aren't additive: "xy" is wider drawn together than apart. */
const contextualMeasure: Measure = {
  width: (text, face, size) =>
    fixedMeasure.width(text, face, size) + (text.split('xy').length - 1) * 0.4 * size,
  has: fixedMeasure.has,
};

const FACES = ['text', 'textBold', 'textItalic', 'code'] as const;
const arbRun = fc.record({
  text: fc
    .array(
      fc.constantFrom(
        'a',
        'b',
        'x',
        'y',
        ' ',
        ' ',
        '​',
        ' ',
        '­',
        '漢',
        'xyxyxyxyxyxyxyxyxyxy',
        '\n',
      ),
      { maxLength: 30 },
    )
    .map((parts) => parts.join('')),
  face: fc.constantFrom(...FACES),
  size: fc.constantFrom(9.5, 10, 11, 22),
  color: fc.constantFrom('text', 'muted', 'link') as fc.Arbitrary<Run['color']>,
});
const arbBlock = fc
  .record({
    runs: fc.array(arbRun, { maxLength: 8 }),
    kind: fc.constantFrom('text', 'heading', 'code', 'raw') as fc.Arbitrary<DocBlock['kind']>,
    width: fc.double({ min: 20, max: 500, noNaN: true }),
    depth: fc.double({ min: 0, max: 0.75, noNaN: true }),
  })
  .map(({ runs, kind, width, depth }) => ({
    width,
    block: block(
      runs.flatMap((r) =>
        r.text.split('\n').flatMap((text, i) => [
          ...(i > 0 ? [run('\n', r)] : []),
          run(text, {
            ...r,
            underline: r.color === 'link',
            link: r.color === 'link' ? 'https://drafter.dev/' : null,
          }),
        ]),
      ),
      { kind, panel: kind === 'code', indent: width * depth },
    ),
  }));

/** The block's text as its lines should read it: soft hyphens and zero-width spaces gone, hard breaks and spaces collapsed to one. */
const expectedText = (b: DocBlock) =>
  b.runs
    .map((r) => r.text)
    .join('')
    .replace(/[­​]/g, '')
    .replace(/\n/g, ' ')
    .replace(/ +/g, ' ')
    .replace(/^ | $/g, ''); // spaces only: a no-break space is text

describe('wrapBlock, properties', () => {
  it('never puts a line past the right margin, however deep the nesting', () => {
    fc.assert(
      fc.property(
        arbBlock,
        fc.constantFrom(fixedMeasure, contextualMeasure),
        ({ block: b, width }, measure) => {
          const { lines } = wrap(b, width, measure);
          expect(lines.length).toBeGreaterThan(0);
          const right = b.panel ? width - STYLE.codePadding : width;
          expectWithin(lines, right);
          for (const line of lines) {
            for (const f of line.fragments) {
              expect(f.x).toBeGreaterThanOrEqual(b.indent);
              expect(f.width).toBe(measure.width(f.text, f.face, f.size));
            }
          }
        },
      ),
      { numRuns: 400 },
    );
  });

  it("the text of the lines is the block's text", () => {
    fc.assert(
      fc.property(arbBlock, ({ block: b, width }) => {
        const { lines } = wrap(b, width);
        const expected = expectedText(b).replace(/漢/g, '?');
        // Each line's text, then a space or nothing (a broken word, or a zero-width space).
        let at = 0;
        for (const line of lines) {
          const text = textOf(line).replace(/ +/g, ' ').replace(/^ | $/g, '');
          expect(expected.slice(at, at + text.length)).toBe(text);
          at += text.length;
          if (expected[at] === ' ') at++;
        }
        expect(at).toBe(expected.length);
      }),
      { numRuns: 400 },
    );
  });
});
