import { readFileSync } from 'node:fs';
import { parseMarkdown } from '@drafter/markdown';
import { type Manuscript, type ManuscriptFont, manuscriptOf, resolveDetails } from '@drafter/novel';
import {
  layoutManuscript,
  MANUSCRIPT_FONT_FILES,
  type ManuscriptFontSet,
  type RenderProgress,
  renderManuscriptPdf,
} from '@drafter/render-pdf';
import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { faceMeasure } from '../src/document/measure';
import { embeddedFonts, extract } from './helpers';

const book = readFileSync(
  new URL('../../novel/test/fixtures/manuscript-book.md', import.meta.url),
  'utf8',
);

/** A manuscript font's four faces, read from `fonts/` the way the CLI reads Courier Prime. */
const fontsOf = (font: ManuscriptFont) =>
  Object.fromEntries(
    Object.entries(MANUSCRIPT_FONT_FILES[font]).map(([face, file]) => [
      face,
      new Uint8Array(readFileSync(new URL(`../fonts/${file}`, import.meta.url))),
    ]),
  ) as unknown as ManuscriptFontSet;
const times = fontsOf('times');
const courier = fontsOf('courier');

const KEPT = { byline: 'R. Vale', legalName: 'Rosa Vale', contact: ['1 Quay Lane'] };
const manuscript = (kept: object = KEPT, source = book): Manuscript =>
  manuscriptOf(source, parseMarkdown(source), resolveDetails(source, 'File', kept));

const pageText = (page: { items: { str: string }[] } | undefined) =>
  (page?.items ?? []).map((item) => item.str).join(' ');

describe('renderManuscriptPdf', () => {
  it('draws the layout’s pages: the title page with no header, then the header from page 2', async () => {
    const ms = manuscript();
    const { bytes, missing } = await renderManuscriptPdf(ms, {
      fonts: times,
      paper: 'letter',
      lang: 'en-GB',
    });
    expect(missing).toEqual([]);
    const pages = await extract(bytes);
    const m = faceMeasure(times);
    const laid = layoutManuscript(ms, {
      paper: 'letter',
      measure: (text, face) => m.width(text, face, 12),
    });
    expect(pages).toHaveLength(laid.length);
    expect([pages[0]?.width, pages[0]?.height]).toEqual([612, 792]);
    expect(pageText(pages[0])).toContain('The Salt Road');
    expect(pageText(pages[0])).toContain('by R. Vale');
    expect(pageText(pages[0])).toContain('Rosa Vale');
    expect(pageText(pages[0])).not.toMatch(/\/ 1/);
    // The title page draws nothing above the top margin's line.
    expect(pages[0]?.items.some((item) => item.y > 792 - 72 + 1)).toBe(false);
    // The header: right-aligned to the right margin, half an inch from the top.
    for (const [i, page] of pages.entries()) {
      if (i === 0) continue;
      const header = page.items.find((item) => Math.abs(item.y - (792 - 36)) < 0.5);
      expect(header?.str, `page ${i + 1}`).toBe(`Vale / THE SALT ROAD / ${i + 1}`);
      expect((header?.x ?? 0) + (header?.width ?? 0)).toBeCloseTo(540, 0);
    }
    // Each line where the layout put it: the chapter's title on page 3, a third of the way down.
    const chapter = pages[2]?.items.find((item) => item.str === 'The Salt Road');
    expect(chapter?.y).toBeCloseTo(792 - 264, 1);
    expect(pageText(pages[2])).toContain('The causeway appeared only at low water');
    expect(pageText(pages.at(-1))).toContain('Notes');
  });

  it('draws each run at the layout’s positions, in its face', async () => {
    const ms = manuscript();
    const { bytes } = await renderManuscriptPdf(ms, { fonts: times, paper: 'letter' });
    const pages = await extract(bytes, { fontNames: true });
    const italic = pages.flatMap((p) => p.items).find((item) => item.str.includes('promised'));
    expect(italic?.fontName).toBe('LiberationSerif-Italic');
    const bold = pages.flatMap((p) => p.items).find((item) => item.str.includes('nearly'));
    expect(bold?.fontName).toBe('LiberationSerif-Bold');
    const body = pages.flatMap((p) => p.items).find((item) => item.str.startsWith('The causeway'));
    expect(body?.fontName).toBe('LiberationSerif-Regular');
    expect(body?.x).toBeCloseTo(108, 1);
  });

  it('sets the title, the author, and the language', async () => {
    const { bytes } = await renderManuscriptPdf(manuscript(), {
      fonts: times,
      paper: 'letter',
      lang: 'en-GB',
    });
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(doc.getTitle()).toBe('The Salt Road');
    expect(doc.getAuthor()).toBe('R. Vale');
    expect(doc.catalog.get(PDFName.of('Lang'))).toEqual(PDFString.of('en-GB'));
    expect([doc.getCreator(), doc.getProducer()]).toEqual(['Drafter', 'Drafter, with pdf-lib']);
    // With no byline, no author.
    const bare = await PDFDocument.load(
      (await renderManuscriptPdf(manuscript({}), { fonts: times, paper: 'a4' })).bytes,
      { updateMetadata: false },
    );
    expect(bare.getAuthor()).toBeUndefined();
    expect(bare.catalog.get(PDFName.of('Lang'))).toBeUndefined();
    const [a4] = await extract(
      (await renderManuscriptPdf(manuscript({}), { fonts: times, paper: 'a4' })).bytes,
    );
    expect([a4?.width, a4?.height]).toEqual([595.28, 841.89]);
  });

  it('embeds Liberation Serif for times and Courier Prime for courier', async () => {
    const serif = await renderManuscriptPdf(manuscript(), { fonts: times, paper: 'letter' });
    const names = await embeddedFonts(serif.bytes);
    expect(names.every((name) => name.startsWith('/LiberationSerif-'))).toBe(true);
    expect(names).toEqual(
      expect.arrayContaining([
        '/LiberationSerif-Regular',
        '/LiberationSerif-Italic',
        '/LiberationSerif-Bold',
      ]),
    );
    const mono = await renderManuscriptPdf(manuscript({ ...KEPT, font: 'courier' }), {
      fonts: courier,
      paper: 'letter',
    });
    const monoNames = await embeddedFonts(mono.bytes);
    expect(monoNames.every((name) => name.startsWith('/CourierPrime-'))).toBe(true);
    expect(monoNames).toContain('/CourierPrime-Regular');
    const [, , chapter] = await extract(mono.bytes, { fontNames: true });
    expect(chapter?.items.find((i) => i.str.startsWith('The causeway'))?.fontName).toBe(
      'CourierPrime-Regular',
    );
  });

  it('prints a character neither font has as ? and lists it', async () => {
    const source = 'The stone was carved with 𓀀 and a gull.\n';
    for (const fonts of [times, courier]) {
      const { bytes, missing } = await renderManuscriptPdf(manuscript(KEPT, source), {
        fonts,
        paper: 'letter',
      });
      expect(missing).toEqual(['𓀀']);
      const [, body] = await extract(bytes);
      expect(pageText(body)).toContain('carved with ? and a gull');
    }
    // In the details too: the title page and the header.
    const { bytes, missing } = await renderManuscriptPdf(
      manuscript({ ...KEPT, title: 'Stone 𓀀', surname: 'V𓀀le' }, 'Words.\n'),
      { fonts: times, paper: 'letter' },
    );
    expect(missing).toEqual(['𓀀']);
    const [first, second] = await extract(bytes);
    expect(pageText(first)).toContain('Stone ?');
    expect(pageText(second)).toContain('V?le / STONE ? / 2');
  });

  it('names the absent faces', async () => {
    const partial = { ...times, italic: undefined, boldItalic: 'not bytes' };
    await expect(
      renderManuscriptPdf(manuscript(), {
        fonts: partial as unknown as ManuscriptFontSet,
        paper: 'letter',
      }),
    ).rejects.toThrow(/missing: fonts\.italic, fonts\.boldItalic$/);
    await expect(
      renderManuscriptPdf(manuscript(), {
        fonts: undefined as unknown as ManuscriptFontSet,
        paper: 'letter',
      }),
    ).rejects.toThrow(TypeError);
  });

  it('reports its progress: the blocks laid out, the pages drawn, then the saving', async () => {
    const ms = manuscript();
    const seen: RenderProgress[] = [];
    const { bytes } = await renderManuscriptPdf(ms, {
      fonts: times,
      paper: 'letter',
      onProgress: (p) => seen.push({ ...p }),
    });
    const pages = (await PDFDocument.load(bytes)).getPageCount();
    const stages = seen.map((p) => p.stage).filter((s, i, all) => s !== all[i - 1]);
    expect(stages).toEqual(['layout', 'draw', 'save']);
    for (const stage of stages) {
      const of = seen.filter((p) => p.stage === stage);
      expect(of[0]?.done, stage).toBe(0);
      expect(of.at(-1)?.done, stage).toBe(of[0]?.total);
      expect(
        of.every((p, i) => i === 0 || p.done >= (of[i - 1]?.done ?? 0)),
        stage,
      ).toBe(true);
    }
    expect(seen.find((p) => p.stage === 'layout')?.total).toBe(ms.blocks.length);
    expect(seen.find((p) => p.stage === 'draw')?.total).toBe(pages);
    expect(seen.at(-1)).toEqual({ stage: 'save', done: 1, total: 1 });
  });

  it('gives the same bytes for the same manuscript', async () => {
    const a = await renderManuscriptPdf(manuscript(), { fonts: times, paper: 'letter' });
    const b = await renderManuscriptPdf(manuscript(), { fonts: times, paper: 'letter' });
    expect(a.bytes).toEqual(b.bytes);
  });
});
