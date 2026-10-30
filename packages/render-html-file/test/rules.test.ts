import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  bandRules,
  colClass,
  colorRules,
  gridRules,
  pageClass,
  pageRules,
  rowClass,
} from '../src/rules';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

/** Nothing a rule may hold that would end the style element or change its hash. */
const clean = (css: string) => !css.includes('<') && !css.includes('\r');

describe('gridRules', () => {
  it('writes a rule for each row and column used, once, in order, on the Script tab’s grid', () => {
    expect(gridRules([12, 0, 12], [15, 3])).toBe(
      [
        '.r0{top:calc(0in / 6)}',
        '.r12{top:calc(12in / 6)}',
        '.c3{left:3ch}',
        '.c15{left:15ch}',
      ].join('\n'),
    );
    expect(rowClass(12)).toBe('r12');
    expect(colClass(15)).toBe('c15');
    expect(gridRules([], [])).toBe('');
  });

  it('refuses a row or column that is not a whole number', () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => gridRules([bad], [])).toThrow(RangeError);
      expect(() => gridRules([], [bad])).toThrow(RangeError);
      expect(() => rowClass(bad)).toThrow(RangeError);
    }
  });

  it('a property: the same rows and columns in any order give the same text, with nothing unsafe', () => {
    fc.assert(
      fc.property(fc.array(fc.nat(200)), fc.array(fc.nat(200)), (rows, cols) => {
        const css = gridRules(rows, cols);
        expect(css).toBe(gridRules(rows.toReversed(), cols.toReversed()));
        expect(clean(css)).toBe(true);
        expect(css.split('\n').filter(Boolean).length).toBe(
          new Set(rows).size + new Set(cols).size,
        );
      }),
    );
  });

  it(
    'is linear in the number of lines',
    () => {
      const make = (n: number) => Array.from({ length: n }, (_, i) => i % 9973);
      const { growth } = scaling(make, (rows) => gridRules(rows, rows), 20_000);
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );
});

describe('pageRules', () => {
  it('sizes each page size used, once', () => {
    expect(pageClass(85, 66)).toBe('p85x66');
    expect(
      pageRules([
        [85, 66],
        [85, 66],
        [82, 70],
      ]),
    ).toBe(
      [
        '.p82x70{width:82ch;height:calc(70in / 6)}',
        '.p85x66{width:85ch;height:calc(66in / 6)}',
      ].join('\n'),
    );
    expect(() => pageRules([[85.5, 66]])).toThrow(RangeError);
  });
});

describe('bandRules', () => {
  it('gives each block a class for its share in thousandths, and a rule for each share used', () => {
    const { classes, rules } = bandRules([30, 10, 60, 30]);
    expect(classes).toEqual(['g231', 'g77', 'g462', 'g231']);
    expect(rules).toBe(
      ['.band .g77{flex-grow:77}', '.band .g231{flex-grow:231}', '.band .g462{flex-grow:462}'].join(
        '\n',
      ),
    );
  });

  it('keeps a tiny block visible and copes with nothing at all', () => {
    expect(bandRules([1, 100_000]).classes[0]).toBe('g1');
    expect(bandRules([0, 0]).classes).toEqual(['g1', 'g1']);
    expect(bandRules([])).toEqual({ classes: [], rules: '' });
  });

  it('refuses a length that is not a number of lines', () => {
    expect(() => bandRules([-1])).toThrow(RangeError);
    expect(() => bandRules([Number.NaN])).toThrow(RangeError);
  });

  it(
    'is linear in the number of blocks',
    () => {
      const make = (n: number) => Array.from({ length: n }, (_, i) => (i * 7919) % 500);
      const { growth } = scaling(make, bandRules, 20_000);
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );
});

describe('colorRules', () => {
  it('gives each class its color, and a light one where a pair differs, printed light', () => {
    expect(colorRules(['#AABBCC'])).toBe('.k0{--c:#aabbcc}');
    const css = colorRules([{ dark: '#f2b84b', light: '#8a5800' }, '#4a90d9'], 'k');
    expect(css).toBe(
      [
        '.k0{--c:#f2b84b}',
        '.k1{--c:#4a90d9}',
        ':root[data-theme="light"] .k0{--c:#8a5800}',
        '@media print {\n.k0{--c:#8a5800}\n}',
      ].join('\n'),
    );
  });

  it('refuses anything but a #rrggbb color, and a prefix that is not letters', () => {
    for (const bad of ['red', '#abc', '#abcdefg', 'url(x)', '#zzzzzz', '</style>']) {
      expect(() => colorRules([bad]), bad).toThrow(RangeError);
    }
    expect(() => colorRules(['#000000'], 'k-')).toThrow(RangeError);
  });

  it('a property: deterministic and safe', () => {
    const hex = fc
      .integer({ min: 0, max: 0xffffff })
      .map((n) => `#${n.toString(16).padStart(6, '0')}`);
    fc.assert(
      fc.property(fc.array(fc.oneof(hex, fc.record({ dark: hex, light: hex }))), (colors) => {
        const css = colorRules(colors);
        expect(css).toBe(colorRules(colors));
        expect(clean(css)).toBe(true);
      }),
    );
  });
});
