import { renderTablePdf } from '@drafter/render-pdf';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { documentFonts, extract, rowText } from './helpers';

const head = { title: 'Props', date: '9 November 2026', columns: ['Item', 'Scene', 'Notes'] };

describe('renderTablePdf', () => {
  it('is landscape, with the title and date in the header and every cell present', async () => {
    const rows = [
      ['Revolver', '12', 'Loaded'],
      ['Lantern', '3', 'Brass'],
    ];
    const bytes = await renderTablePdf(
      { ...head, rows },
      { fonts: documentFonts, paper: 'letter' },
    );
    const [page] = await extract(bytes);
    expect([page?.width, page?.height]).toEqual([792, 612]);
    const text = page?.items.map((i) => i.str).join(' ') ?? '';
    expect(text).toContain('Props — 9 November 2026');
    for (const cell of [...head.columns, ...rows.flat()]) expect(text).toContain(cell);
    expect((await PDFDocument.load(bytes)).getTitle()).toBe('Props');
    const a4 = await extract(
      await renderTablePdf({ ...head, rows }, { fonts: documentFonts, paper: 'a4' }),
    );
    expect([a4[0]?.width, a4[0]?.height]).toEqual([842, 595]);
  });

  it('repeats the column header on page 2 of a 200-row table', async () => {
    const rows = Array.from({ length: 200 }, (_, i) => [`Item ${i}`, String(i), 'note']);
    const pages = await extract(
      await renderTablePdf({ ...head, rows }, { fonts: documentFonts, paper: 'letter' }),
    );
    expect(pages.length).toBeGreaterThan(1);
    for (const p of pages) {
      const strs = p.items.map((i) => i.str);
      expect(strs).toContain('Item');
      expect(strs).toContain('Scene');
      expect(strs).toContain('Notes');
    }
    const all = pages.flatMap((p) => p.items.map((i) => i.str));
    expect(all).toContain('Item 199');
  });

  it('wraps a long cell, and breaks a word longer than the column', async () => {
    const long = 'the quick brown fox jumps over the lazy dog '.repeat(8).trim();
    const word = 'x'.repeat(300);
    const [page] = await extract(
      await renderTablePdf(
        { ...head, rows: [[long, '1', word]] },
        { fonts: documentFonts, paper: 'letter' },
      ),
    );
    const ys = new Set(page?.items.filter((i) => i.x < 100 && i.str.trim()).map((i) => i.y));
    expect(ys.size).toBeGreaterThan(3);
    for (const item of page?.items ?? []) expect(item.x + item.width).toBeLessThanOrEqual(792 - 35);
    expect(rowText(page, 0)).toBe('');
    const xs = (page?.items ?? []).map((i) => i.str).join('');
    expect(xs.replace(/\s/g, '')).toContain('x'.repeat(300));
  });
});
