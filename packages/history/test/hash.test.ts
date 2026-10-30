import { describe, expect, test } from 'vitest';
import { hash53 } from '../src';

describe('hash53', () => {
  test('hash53 is stable', () => {
    // Pinned: prints in the cache are keyed by these, so a change here must bump PRINT_VERSION.
    expect(hash53('')).toBe('0168dc270caa4c');
    expect(hash53('INT. FERRY OFFICE - DAWN')).toBe('10d271cc0b5bb3');
    expect(hash53('Rain ticks on the tin roof.\n\nNELL\nForty-two.')).toBe('187a7eb2466765');
    for (const text of ['', 'a', 'ab', 'ünïcödé ✓', 'x'.repeat(10_000)]) {
      expect(hash53(text)).toMatch(/^[0-9a-f]{14}$/);
      expect(hash53(text)).toBe(hash53(text));
    }
  });

  test('differs for one changed character', () => {
    const base = 'Nell weaves between the seats with a tin box, taking fares.';
    const seen = new Set([hash53(base)]);
    for (let i = 0; i < base.length; i++) {
      const changed = `${base.slice(0, i)}${base[i] === 'x' ? 'y' : 'x'}${base.slice(i + 1)}`;
      seen.add(hash53(changed));
    }
    expect(seen.size).toBe(base.length + 1);
    expect(hash53('ab')).not.toBe(hash53('ba'));
  });

  test('uses all 53 bits', () => {
    const top = new Set<string>();
    for (let i = 0; i < 200; i++) top.add(hash53(`scene ${i}`)[0] as string);
    // The first hex digit holds the top bit of 53: 0 or 1.
    expect([...top].sort()).toEqual(['0', '1']);
  });
});
