import { parse } from '@drafter/fountain';
import { type Layout, paginate } from '@drafter/layout';
import { renderPdf } from '@drafter/render-pdf';
import { builtins, type Template } from '@drafter/templates';
import fontkit from '@pdf-lib/fontkit';
import { describe, expect, it } from 'vitest';
import { extract, fonts, itemAt, rowText, textOf } from './helpers';

// Revision marks in the PDF (production design §8): an asterisk in the right margin for each
// marked printed line, and the revision header under the page number on every body page.

const screenplay = builtins['us-screenplay'] as Template;
const { width, margin, numbering } = screenplay.page;
// The asterisk's column from the page's left edge: 5 in from the grid's right edge, as Compare's.
const STAR_X = (width - 5) * 7.2;
const yOfBody = (line: number) => 792 - (margin.top + line + 1) * 12;
const yOfLine = (line: number) => 792 - (line + 1) * 12;

const filler = (n: number) =>
  Array.from({ length: n }, (_, i) => `Filler line ${i + 1}: the room is quiet.`).join('\n\n');
const SOURCE = `Title: Marks\n\nINT. HALL - DAY\n\n${filler(60)}\n\nBOB ^\nLeft.\n\nANN ^\nRight.\n`;

/** The layout with `pick` lines marked (and, for a dual row, its right part). */
function marked(pick: (text: string) => boolean): Layout {
  const layout = paginate(parse(SOURCE), screenplay);
  return {
    ...layout,
    pages: layout.pages.map((page) => ({
      ...page,
      lines: page.lines.map((line) => {
        const right =
          line.right && pick(textOf(line.right))
            ? { ...line.right, mark: { set: 'Blue' } }
            : line.right;
        const own = pick(textOf(line)) ? { mark: { set: 'Blue' } } : {};
        return { ...line, ...own, ...(right ? { right } : {}) };
      }),
    })),
  };
}

describe('revision marks in the PDF', () => {
  it('draws an asterisk for each marked line at the margin column', async () => {
    const layout = marked((t) => t === 'Filler line 3: the room is quiet.' || t === 'Right.');
    const pdf = await extract(await renderPdf(layout, screenplay, { fonts }));
    const stars = pdf.flatMap((page, p) =>
      page.items.filter((item) => item.str === '*').map((item) => ({ p, x: item.x, y: item.y })),
    );
    // One for the filler line and one for the dual row whose right part is marked.
    expect(stars).toHaveLength(2);
    expect(stars.every((s) => Math.abs(s.x - STAR_X) < 0.5)).toBe(true);
    // Each on its line's row.
    const rowOf = (text: string) => {
      for (const [p, page] of layout.pages.entries()) {
        const k = page.lines.findIndex(
          (l) => textOf(l) === text || (l.right && textOf(l.right) === text),
        );
        if (k >= 0) return { p, y: yOfBody(k) };
      }
      throw new Error(text);
    };
    for (const text of ['Filler line 3: the room is quiet.', 'Right.']) {
      const at = rowOf(text);
      expect(itemAt(pdf[at.p], STAR_X, at.y)?.str).toBe('*');
    }
  });

  it('one asterisk for a dual row with both parts marked', async () => {
    const layout = marked((t) => t === 'Left.' || t === 'Right.');
    const pdf = await extract(await renderPdf(layout, screenplay, { fonts }));
    expect(pdf.flatMap((page) => page.items.filter((i) => i.str === '*'))).toHaveLength(1);
  });

  it('draws the revision header on every page', async () => {
    const layout = paginate(parse(SOURCE), screenplay);
    expect(layout.pages.length).toBeGreaterThan(2);
    const header = 'Blue Revision — 12 November 2026';
    const pdf = await extract(
      await renderPdf(layout, screenplay, { fonts, revisionHeader: header }),
    );
    const textWidth = width - margin.left - margin.right;
    layout.pages.forEach((page, p) => {
      const row = rowText(pdf[p], yOfLine(numbering.line + 1));
      if (page.number === 0) {
        expect(row).toBe('');
        return;
      }
      expect(row).toBe(header);
      // Right-aligned on the text width, as the page number is.
      const item = pdf[p]?.items.find((i) => i.str.startsWith('Blue'));
      expect(item?.x).toBeCloseTo((margin.left + textWidth - [...header].length) * 7.2, 1);
    });
  });

  it("the header's em dash and every other character draw in the embedded Courier Prime", async () => {
    const header = 'Double Pink Revision — 12 November 2026';
    const regular = fontkit.create(Buffer.from(fonts.regular));
    if (!('hasGlyphForCodePoint' in regular)) throw new Error('not a single font');
    // No character falls back to the missing glyph.
    const lacking = [...header].filter(
      (c) => !regular.hasGlyphForCodePoint(c.codePointAt(0) as number),
    );
    expect(lacking).toEqual([]);
    const layout = paginate(parse(SOURCE), screenplay);
    const pdf = await extract(
      await renderPdf(layout, screenplay, { fonts, revisionHeader: header }),
      {
        fontNames: true,
      },
    );
    const item = pdf[1]?.items.find((i) => i.str.includes('Revision'));
    expect(item?.str).toBe(header);
    expect(item?.fontName).toMatch(/CourierPrime-Regular$/);
  });

  it('an unmarked layout draws exactly as before', async () => {
    const layout = paginate(parse(SOURCE), screenplay);
    const before = await renderPdf(layout, screenplay, { fonts });
    const again = await renderPdf(layout, screenplay, { fonts, revisionHeader: undefined });
    expect(again).toEqual(before);
    expect((await extract(before)).flatMap((p) => p.items.filter((i) => i.str === '*'))).toEqual(
      [],
    );
  });
});
