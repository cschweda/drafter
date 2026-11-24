import { describe, expect, it, test } from 'vitest';
import {
  DEEP_BRACKETS,
  denseMarks,
  MAX_BRACKETS,
  MAX_MARKS,
  MAX_OPENERS,
  MAX_OPENERS_IN_ALL,
  MAX_UNDERLINED,
  MarkedTooDensely,
  parseMarkdown,
} from '../src';
import { readWhole } from '../src/parse';

// A paragraph thick with emphasis or link marks costs the parsers time in their number squared:
// one is refused before it is parsed (red/blue audit, 2026-11-03).
describe('a paragraph with too many marks', () => {
  it('counts each paragraph apart, and only past the limit', () => {
    expect(denseMarks('*_'.repeat(MAX_MARKS / 2))).toBe(false);
    expect(denseMarks(`${'*_'.repeat(MAX_MARKS / 2)}*`)).toBe(true);
    // Split by a blank line (or one of spaces), the marks are two paragraphs' worth.
    const half = '*'.repeat(MAX_MARKS);
    expect(denseMarks(`${half}\n\n${half}`)).toBe(false);
    expect(denseMarks(`${half}\n  \t\n${half}`)).toBe(false);
    expect(denseMarks(`${half}\n${half}`)).toBe(true);
    // A Windows or old Mac line ending is one line ending, not a blank line between halves.
    expect(denseMarks(`${half}\r\n${half}`)).toBe(true);
    expect(denseMarks(`${half}\r${half}`)).toBe(true);
    expect(denseMarks(`${half}\r\n\r\n${half}`)).toBe(false);
    expect(denseMarks(']'.repeat(MAX_BRACKETS))).toBe(false);
    expect(denseMarks(']'.repeat(MAX_BRACKETS + 1))).toBe(true);
    // Links and footnotes, however many, open what they close.
    expect(denseMarks('x[^a]'.repeat(50_000))).toBe(false);
    expect(denseMarks('[^'.repeat(50_000))).toBe(false);
    expect(denseMarks('A *quiet* [line](x).\n'.repeat(500))).toBe(false);
  });

  it('is refused at once, not parsed for a minute', () => {
    const start = performance.now();
    expect(() => parseMarkdown('*_'.repeat(80_000))).toThrow(MarkedTooDensely);
    expect(() => parseMarkdown(']]'.repeat(30_000))).toThrow(MarkedTooDensely);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it('leaves an ordinary document alone', () => {
    const text = '# Title\n\nSome *words* and **more** and a [link](https://example.com).\n'.repeat(
      200,
    );
    expect(parseMarkdown(text).type).toBe('root');
  });

  it('refuses brackets nested past any link, closed in their thousands (red/blue audit, W6)', () => {
    const nested = (n: number) => `${'['.repeat(n)}${']'.repeat(n)}`;
    expect(denseMarks(nested(DEEP_BRACKETS + MAX_BRACKETS))).toBe(false);
    expect(denseMarks(nested(DEEP_BRACKETS + MAX_BRACKETS + 1))).toBe(true);
    expect(() => parseMarkdown(nested(80_000))).toThrow(MarkedTooDensely);
    // Links and footnotes, however many, never nest: they are read as before.
    expect(denseMarks('[a](b) '.repeat(50_000))).toBe(false);
    expect(denseMarks('x[^a]'.repeat(50_000))).toBe(false);
    expect(denseMarks('[^'.repeat(50_000))).toBe(false);
    // And each paragraph is counted alone.
    const half = nested(DEEP_BRACKETS + MAX_BRACKETS / 2 + 10);
    expect(denseMarks(`${half}\n\n${half}`)).toBe(false);
  });

  it('refuses a paragraph of thousands of HTML openers that never close (the audit of W6)', () => {
    // `<!A`, `<?`, `<![CDATA[`, and `<!--` each made the parser look to the paragraph's end for
    // the close: 80 KB of `x <!A ` held it for 26 seconds.
    for (const opener of ['<!A', '<?', '<![CDATA[', '<!--']) {
      const many = (n: number) => `x ${opener} `.repeat(n);
      expect(denseMarks(many(MAX_OPENERS)), opener).toBe(false);
      expect(denseMarks(many(MAX_OPENERS + 1)), opener).toBe(true);
      expect(() => parseMarkdown(many(13_000)), opener).toThrow(MarkedTooDensely);
    }
    // Each paragraph alone, up to a count for the whole document.
    const para = `${'x <!A '.repeat(100)}\n\n`;
    expect(denseMarks(para.repeat(MAX_OPENERS_IN_ALL / 100))).toBe(false);
    expect(denseMarks(para.repeat(MAX_OPENERS_IN_ALL / 100 + 1))).toBe(true);
    // A few hundred in a very long paragraph cost as much: what counts is how far each looks.
    const spread = `${'word '.repeat(20_000)}${'x <!A '.repeat(500)}`;
    expect(denseMarks(spread)).toBe(true);
    expect(denseMarks(`${'word '.repeat(20_000)}\n\n${'x <!A '.repeat(500)}`)).toBe(false);
    expect(denseMarks(`${'word '.repeat(200_000)}x <!-- a --> y`)).toBe(false);
    // Comments that close, and tags, are read as before.
    expect(parseMarkdown('<!-- a --> text\n\n'.repeat(500)).type).toBe('root');
    expect(denseMarks('a < b and c <d> '.repeat(50_000))).toBe(false);
  });

  it('refuses a document of thousands of underlined headings (W6)', () => {
    const underlined = (n: number, rule = '===') => `a\n${rule}\n\n`.repeat(n);
    expect(denseMarks(underlined(MAX_UNDERLINED))).toBe(false);
    expect(denseMarks(underlined(MAX_UNDERLINED + 1))).toBe(true);
    expect(denseMarks(underlined(MAX_UNDERLINED + 1, '---'))).toBe(true);
    // The last line counts with no line break after it.
    expect(
      denseMarks(`${underlined(MAX_UNDERLINED)}a
===`),
    ).toBe(true);
    expect(() => parseMarkdown(underlined(20_000))).toThrow(MarkedTooDensely);
    // Inside a block quote too, however deep, and in a list item.
    expect(denseMarks('> a\n> ===\n>\n'.repeat(MAX_UNDERLINED + 1))).toBe(true);
    expect(denseMarks('> > a\n> > ---\n\n'.repeat(MAX_UNDERLINED + 1))).toBe(true);
    expect(denseMarks('- a\n  ===\n\n'.repeat(MAX_UNDERLINED + 1))).toBe(true);
    expect(() => parseMarkdown('> a\n> ===\n>\n'.repeat(20_000))).toThrow(MarkedTooDensely);
    // A rule with a blank line above it is a break between scenes, not a heading: any number.
    expect(denseMarks('a\n\n---\n\n'.repeat(MAX_UNDERLINED * 3))).toBe(false);
    // And a heading written with `#` is never counted.
    expect(denseMarks('# a\n\n'.repeat(MAX_UNDERLINED * 3))).toBe(false);
    expect(denseMarks('a\n=-=\n\n'.repeat(MAX_UNDERLINED * 3))).toBe(false);
  });
});

// A fenced code block at the margin is not read for marks: the parser keeps it as it is, so a long
// listing of ordinary code (`snake_case` names, rules of `-`, brackets) was refused for nothing.
describe('marks inside a fenced code block', () => {
  const MANY = '*_'.repeat(MAX_MARKS);
  const fenced = (body: string, fence = '```') =>
    `# Notes\n\n${fence}\n${body}\n${fence}\n\nAfter.\n`;

  test('are not counted: a long listing is no dense paragraph', () => {
    expect(denseMarks(fenced('total_count = other_count + my_value\n'.repeat(1500)))).toBe(false);
    expect(denseMarks(fenced('name\n----\n'.repeat(MAX_UNDERLINED + 500)))).toBe(false);
    expect(denseMarks(fenced(']'.repeat(MAX_BRACKETS + 1)))).toBe(false);
    expect(denseMarks(fenced('x <!A '.repeat(MAX_OPENERS + 1)))).toBe(false);
    expect(denseMarks(fenced(MANY, '~~~'))).toBe(false);
    expect(denseMarks(fenced(MANY, '`````'))).toBe(false);
    // To the end, when it never closes.
    expect(denseMarks(`\`\`\`python\n${MANY}\n`)).toBe(false);
  });

  test('are counted again once the block has closed', () => {
    expect(denseMarks(`${fenced('code')}\n${MANY}\n`)).toBe(true);
    expect(denseMarks(`\`\`\`\ncode\n   \`\`\`  \n${MANY}\n`)).toBe(true);
    expect(denseMarks(`\`\`\`\ncode\n\`\`\`\`\`\n${MANY}\n`)).toBe(true);
    expect(denseMarks(`~~~\ncode\n~~~\r\n${MANY}\n`)).toBe(true);
  });

  test('are counted wherever a fence may not be one', () => {
    for (const before of [
      ' ```', // indented: it may be inside a list item
      '- ```',
      '> ```',
      '    ```',
      '``` a`b', // a backtick after the fence: code in a line, not a block
      '``',
      '<div>\n```', // after any `<`, which may be HTML that holds the fence
      'x\n\n<!--\n\n```',
    ]) {
      expect(denseMarks(`${before}\n${MANY}\n`), JSON.stringify(before)).toBe(true);
    }
  });

  /** A small random generator, seeded, so a failure comes back the same. */
  function random(seed: number) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 2 ** 32;
    };
  }
  const LINES = [
    '```',
    '```',
    '~~~',
    '````',
    '~~~~',
    '   ```',
    '    ```',
    '\t```',
    '```js',
    '``` a`b',
    '~~~ a`b',
    '```  ',
    '',
    '',
    'text',
    '- a',
    '> a',
    '1. a',
    '<div>',
    '<!--',
    '-->',
    '[^a]: x',
    '  ~~~',
    '`',
  ];
  type Node = { type: string; value?: string; children?: Node[] };
  /** The kind of node that holds `word` in `tree`. */
  const holderOf = (tree: Node, word: string): string | null => {
    if (typeof tree.value === 'string' && tree.value.includes(word)) return tree.type;
    for (const child of tree.children ?? []) {
      const found = holderOf(child, word);
      if (found) return found;
    }
    return null;
  };

  // Whatever the lines around it, a line the parser reads as text is read for marks here: the
  // parser itself says where the line ended up.
  test('are skipped only where the parser, too, reads a code block', () => {
    const next = random(20261124);
    let asText = 0;
    let asCode = 0;
    for (let i = 0; i < 3000; i++) {
      const lines = Array.from(
        { length: Math.floor(next() * 7) },
        () => LINES[Math.floor(next() * LINES.length)] as string,
      );
      const at = Math.floor(next() * (lines.length + 1));
      const doc = (line: string) => [...lines.slice(0, at), line, ...lines.slice(at)].join('\n');
      const holder = holderOf(readWhole(doc('MARKS')) as Node, 'MARKS');
      if (holder === 'text') {
        asText++;
        expect(denseMarks(doc(MANY)), JSON.stringify(doc('MARKS'))).toBe(true);
      } else if (holder === 'code') asCode++;
    }
    // Both happen often, so the test tests something.
    expect(asText).toBeGreaterThan(500);
    expect(asCode).toBeGreaterThan(500);
  });
});

// Three more shapes that took the parser the square of a paragraph's length (found by the review
// of the branch that closed the audit's leftovers): a link's title in parentheses or quotes that
// never closes, and closing brackets whose opening one was escaped, or was inside code.
describe('marks that only look paired', () => {
  it('refuses link titles that never close, by how far each looks', () => {
    for (const unit of ['[a](b (c ', '[a](b (c\n', '[a](b "c ', "[a](b 'c ", '[a](<b> (c ']) {
      expect(denseMarks(unit.repeat(16_000)), JSON.stringify(unit)).toBe(true);
    }
  });

  it('reads links with titles, and lists of links, however many', () => {
    expect(denseMarks('[a](b "title") and [c](d (title)) '.repeat(20_000))).toBe(false);
    expect(denseMarks('- [a](https://example.com/b) (see c)\n'.repeat(20_000))).toBe(false);
    expect(denseMarks('- [a](b)\n'.repeat(50_000))).toBe(false);
  });

  it('counts a closing bracket whose opening one was escaped or in code', () => {
    expect(denseMarks('\\[ ] '.repeat(MAX_BRACKETS + 1))).toBe(true);
    expect(denseMarks('`[` ] '.repeat(MAX_BRACKETS + 1))).toBe(true);
    expect(denseMarks('\\[ ] '.repeat(100))).toBe(false);
    // An escaped closing bracket closes nothing, and is no stray either.
    expect(denseMarks('\\] '.repeat(MAX_BRACKETS + 1))).toBe(false);
  });
});
