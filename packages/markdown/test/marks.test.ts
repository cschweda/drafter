import { describe, expect, it } from 'vitest';
import { denseMarks, MAX_BRACKETS, MAX_MARKS, MarkedTooDensely, parseMarkdown } from '../src';

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
});
