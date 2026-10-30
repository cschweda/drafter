import { parse, print } from '@drafter/fountain';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { fromOsf, OsfError } from '../src';
import { CUSTOM_STYLES, osf, xmlText } from './osf-fixtures';

// Generated documents of the fixture's styles and runs, as `fromFdx: any file` generates Final
// Draft files: text made of the pieces that mean something to Fountain, in runs of every emphasis.

const piece = fc.constantFrom(
  'INT. ',
  'BOB',
  'bob',
  '(',
  ')',
  '*',
  '**',
  '_',
  '\\',
  '[[',
  ']]',
  '/*',
  '#',
  '=',
  '===',
  '~',
  '>',
  '<',
  '!',
  '@',
  '.',
  '^',
  ' TO:',
  'Title: ',
  ' ',
  '\n',
  '\n\n',
  'hello',
  '\t',
  ' #1#',
);
const emphasis = fc.constantFrom(
  '',
  'bold="1"',
  'italic="1"',
  'underline="1"',
  'bold="1" italic="1"',
  'italic="1" underline="1"',
  'strikethrough="1"',
);
const runs = fc.array(
  fc.tuple(
    fc.array(piece, { maxLength: 8 }).map((p) => p.join('')),
    emphasis,
  ),
  { minLength: 1, maxLength: 3 },
);
const para = (style: string, r: Array<[string, string]>, styleAttrs = '') =>
  `<para><style basestyle="${style}"${styleAttrs}/>${r
    .map(([t, a]) => `<text${a ? ` ${a}` : ''}>${xmlText(t)}</text>`)
    .join('')}</para>`;
/** A paragraph with nothing outside its notes may come in as a note; the property leaves those out. */
const plain = (r: Array<[string, string]>) => {
  const text = r.map(([t]) => t).join('');
  return text.includes('[[') ? '' : text.trim();
};

const item = fc.oneof(
  runs.map((r) => ({ xml: para('Action', r), kinds: plain(r) ? ['action'] : null })),
  runs.map((r) => ({ xml: para('Lower Third', r), kinds: plain(r) ? ['action'] : null })),
  runs.map((r) => ({ xml: para('Cast List', r), kinds: null })),
  fc.tuple(runs, runs).map(([c, d]) => ({
    xml: para('Character', c) + para('Dialogue', d),
    kinds: plain(c) && plain(d) ? ['character', 'dialogue'] : null,
  })),
  fc.tuple(runs, runs).map(([c, d]) => ({
    xml: para('Character', c) + para('Parenthetical', d),
    kinds: plain(c) && plain(d) ? ['character', 'parenthetical'] : null,
  })),
  runs.map((r) => ({
    xml: para('Scene Heading', r),
    kinds: plain(r) ? ['scene_heading'] : null,
  })),
  runs.map((r) => ({ xml: para('Transition', r), kinds: plain(r) ? ['transition'] : null })),
);

const documents = fc.array(item, { maxLength: 6 });

describe('fromOsf: any document', () => {
  it('never throws but OsfError', () => {
    // Whole documents, and every cut of one, which is mostly XML the reader refuses.
    fc.assert(
      fc.property(documents, fc.nat(), (items, cut) => {
        const xml = osf(items.map((i) => i.xml).join(''), { styles: CUSTOM_STYLES });
        for (const input of [xml, xml.slice(0, cut % (xml.length + 1))]) {
          try {
            fromOsf(input);
          } catch (error) {
            expect(error).toBeInstanceOf(OsfError);
          }
        }
      }),
      { numRuns: 500 },
    );
  });

  it('keeps each paragraph in its kind, or counts it as a note', () => {
    fc.assert(
      fc.property(documents, (items) => {
        const result = fromOsf(osf(items.map((i) => i.xml).join(''), { styles: CUSTOM_STYLES }));
        const doc = parse(result.text);
        expect(doc.titlePage).toBeNull();
        expect(print(doc)).toBe(result.text);
        if (result.mapped.length === 0 && items.every((i) => i.kinds)) {
          expect(doc.blocks.map((b) => b.kind)).toEqual(items.flatMap((i) => i.kinds ?? []));
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('the text is at most 4 × the XML’s length + 64', () => {
    fc.assert(
      fc.property(documents, (items) => {
        const xml = osf(items.map((i) => i.xml).join(''), { styles: CUSTOM_STYLES });
        expect(fromOsf(xml).text.length).toBeLessThanOrEqual(4 * xml.length + 64);
      }),
      { numRuns: 500 },
    );
    // The smallest paragraphs, with no style or text, and unknown styles: each note is still
    // smaller than four times the markup that asked for it.
    for (const body of [
      '<para/>'.repeat(1000),
      '<para><style basestyle="x"/></para>'.repeat(1000),
      '<a>b</a>'.repeat(1000),
    ]) {
      const xml = `<document><paragraphs>${body}</paragraphs></document>`;
      expect(fromOsf(xml).text.length).toBeLessThanOrEqual(4 * xml.length + 64);
    }
  });
});
