import { describe, expect, it } from 'vitest';
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
    const para = `${'x <!A '.repeat(MAX_OPENERS)}\n\n`;
    expect(denseMarks(para.repeat(MAX_OPENERS_IN_ALL / MAX_OPENERS))).toBe(false);
    expect(denseMarks(para.repeat(MAX_OPENERS_IN_ALL / MAX_OPENERS + 1))).toBe(true);
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
