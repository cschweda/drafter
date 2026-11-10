import { describe, expect, it } from 'vitest';
import { headerLines } from '../src/header';

describe('headerLines', () => {
  it('keeps a header that fits on one line', () => {
    expect(headerLines('Blue Revision — 9 November 2026', 60)).toEqual([
      'Blue Revision — 9 November 2026',
    ]);
  });

  it('wraps a long header onto a second line, each within the width', () => {
    const header = `${'Blue pages for the shooting draft of the long weir '.repeat(2)}`.trim();
    const lines = headerLines(header, 60);
    expect(lines).toHaveLength(2);
    for (const line of lines) expect([...line].length).toBeLessThanOrEqual(60);
    expect(lines.join(' ')).toBe(header);
  });

  it('breaks at the edge when words would need a third line, and never gives more than two', () => {
    const header = 'abcdefghij '.repeat(11).trim(); // 120 characters
    const lines = headerLines(header, 60);
    expect(lines).toHaveLength(2);
    for (const line of lines) expect([...line].length).toBeLessThanOrEqual(60);
    const narrow = headerLines('x'.repeat(120), 40);
    expect(narrow).toHaveLength(2);
    expect(narrow[1]?.endsWith('…')).toBe(true);
    expect([...(narrow[1] ?? '')].length).toBe(40);
  });

  it('with room for one line only, prints one, cut with … (ruling F5)', () => {
    const header = `Blue Pages, the shooting draft of the long weir, for every department on the ${'x'.repeat(33)}`;
    const [line, ...rest] = headerLines(header, 60, 1);
    expect(rest).toEqual([]);
    expect([...(line ?? '')].length).toBe(60);
    expect(line?.endsWith('…')).toBe(true);
    expect(header.startsWith((line ?? '').slice(0, -1))).toBe(true);
    // A header that fits is as it was.
    expect(headerLines('Blue Revision — 9 November 2026', 60, 1)).toEqual([
      'Blue Revision — 9 November 2026',
    ]);
  });
});
