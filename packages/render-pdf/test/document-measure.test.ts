import fontkit from '@pdf-lib/fontkit';
import { PDFDocument } from 'pdf-lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Face } from '../src/document/fonts';
import { fontMeasure } from '../src/document/measure';
import { documentFonts } from './helpers';

/** Counts every `layout` call on a font fontkit creates; otherwise the real fontkit. */
const layouts = vi.hoisted(() => ({ count: 0 }));
vi.mock('@pdf-lib/fontkit', async (importOriginal) => {
  const actual = (await importOriginal<{ default: typeof fontkit }>()).default;
  return {
    default: {
      ...actual,
      create(...args: Parameters<typeof actual.create>) {
        const font = actual.create(...args);
        const layout = font.layout.bind(font);
        font.layout = (...a: Parameters<typeof layout>) => {
          layouts.count++;
          return layout(...a);
        };
        return font;
      },
    },
  };
});

const FACES: Face[] = ['text', 'textItalic', 'textBold', 'textBoldItalic', 'code'];
const SAMPLES = [
  'The office filled with fluffy ffi waffles.',
  'Café naïve façade, Ångström and Øresund.',
  'Chapter 12: 3,456,789 words in 2026.',
  'Quiet lantern',
];

describe('fontMeasure', () => {
  beforeEach(() => {
    layouts.count = 0;
  });

  it("width matches pdf-lib's widthOfTextAtSize for text in every face", async () => {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const measure = fontMeasure(documentFonts);
    for (const face of FACES) {
      const font = await doc.embedFont(documentFonts[face], { subset: true });
      for (const text of SAMPLES) {
        for (const size of [9, 11, 22]) {
          expect(
            Math.abs(measure.width(text, face, size) - font.widthOfTextAtSize(text, size)),
            `${face} ${size} ${text}`,
          ).toBeLessThan(0.001);
        }
      }
    }
  });

  it('width of a run is the sum of its words and spaces', () => {
    const measure = fontMeasure(documentFonts);
    const words = ['Marrow', 'kettles', 'whisper', 'beneath', 'Tuesday’s', 'orchard.'];
    for (const face of FACES) {
      const sum =
        words.reduce((total, word) => total + measure.width(word, face, 11), 0) +
        measure.width(' ', face, 11) * (words.length - 1);
      expect(measure.width(words.join(' '), face, 11), face).toBeCloseTo(sum, 6);
    }
  });

  it('width of nothing is nothing', () => {
    expect(fontMeasure(documentFonts).width('', 'text', 11)).toBe(0);
  });

  it('has() is true for Latin, Greek, and Cyrillic letters and false for a character Inter Tight lacks', () => {
    const measure = fontMeasure(documentFonts);
    for (const face of ['text', 'textItalic', 'textBold', 'textBoldItalic'] as const) {
      for (const char of 'AzéßΩλЖя')
        expect(measure.has(char.codePointAt(0) as number, face), `${face} ${char}`).toBe(true);
      expect(measure.has(0x6f22, face), face).toBe(false);
    }
    expect(measure.has('A'.codePointAt(0) as number, 'code')).toBe(true);
    expect(measure.has(0x6f22, 'code')).toBe(false);
  });

  it('the bullets •, ◦, ▪ are checked', () => {
    const measure = fontMeasure(documentFonts);
    const found = Object.fromEntries(
      ['•', '◦', '▪'].map((b) => [b, measure.has(b.codePointAt(0) as number, 'text')]),
    );
    // Recorded for the bullets by depth (Call 6): Inter Tight has all three.
    expect(found).toEqual({ '•': true, '◦': true, '▪': true });
  });

  it("caches: a second width of the same string doesn't lay it out again", () => {
    const measure = fontMeasure(documentFonts);
    const first = measure.width('Lanterns over the harbor', 'text', 11);
    const afterFirst = layouts.count;
    expect(afterFirst).toBe(1);
    expect(measure.width('Lanterns over the harbor', 'text', 22)).toBeCloseTo(first * 2, 9);
    expect(layouts.count).toBe(afterFirst);
    measure.width('Lanterns over the harbor', 'textBold', 11);
    expect(layouts.count).toBe(afterFirst + 1);
  });
});
