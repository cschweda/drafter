import { readdirSync, readFileSync } from 'node:fs';
import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { type FontSet, renderPdf } from '@drafter/render-pdf';
import { builtins, loadTemplate, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import { embeddedFonts, extract, fonts, itemAt, operators, rowText, textOf } from './helpers';

const screenplay = builtins['us-screenplay'] as Template;
const extend = (patch: Record<string, unknown>) =>
  loadTemplate({ id: 'test', name: 'Test', extends: 'us-screenplay', ...patch });
const render = (source: string, template = screenplay, sceneNumbers?: boolean) =>
  renderPdf(
    paginate(parse(source), template, sceneNumbers === undefined ? {} : { sceneNumbers }),
    template,
    { fonts },
  );

// The grid in points, for the us-screenplay letter page: 7.2 pt across, 12 pt down.
const x = (col: number) => (15 + col) * 7.2;
const y = (bodyLine: number) => 792 - (6 + bodyLine + 1) * 12;
const filler = (n: number) =>
  Array.from({ length: n }, (_, i) => `Filler line ${i + 1}: the room is quiet.`).join('\n');

describe('layout fixtures', () => {
  const dir = new URL('../../../fixtures/layout/', import.meta.url);
  const names = readdirSync(dir)
    .filter((file) => file.endsWith('.fountain'))
    .map((file) => file.replace(/\.fountain$/, ''));
  const templateFor = (spec: string): Template =>
    spec.endsWith('.json')
      ? loadTemplate(JSON.parse(readFileSync(new URL(spec, dir), 'utf8')))
      : (builtins[spec] as Template);

  for (const name of names) {
    it(`${name}: every line prints at its layout position`, async () => {
      const { template: spec } = JSON.parse(
        readFileSync(new URL(`${name}.expected.json`, dir), 'utf8'),
      );
      const template = templateFor(spec);
      const layout = paginate(
        parse(readFileSync(new URL(`${name}.fountain`, dir), 'utf8')),
        template,
      );
      const pdf = await extract(await renderPdf(layout, template, { fonts }));
      expect(pdf.length).toBe(layout.pages.length);

      const { margin } = template.page;
      layout.pages.forEach((page, p) => {
        expect([pdf[p]?.width, pdf[p]?.height]).toEqual([612, 792]);
        page.lines.forEach((row, line) => {
          for (const part of row.right ? [row, row.right] : [row]) {
            const text = textOf(part);
            if (text.trim() === '') continue;
            const lead = text.length - text.trimStart().length;
            const at = [(margin.left + part.col + lead) * 7.2, 792 - (margin.top + line + 1) * 12];
            const item = itemAt(pdf[p], at[0] as number, at[1] as number);
            expect(item, `page ${page.number}, line ${line}: "${text}"`).toBeDefined();
            expect(text.trimStart().startsWith(item?.str.trimEnd() ?? '\u0000')).toBe(true);
            expect(rowText(pdf[p], at[1] as number)).toContain(text.replace(/\s+/g, ' ').trim());
          }
        });
      });
    });
  }
});

describe('pages', () => {
  it('sizes each page from the paper', async () => {
    // A4's grid is 82 × 70; a 7-character right margin keeps the 60-character column.
    const a4 = extend({ page: { paper: 'a4', width: 82, height: 70, margin: { right: 7 } } });
    const [page] = await extract(await render('Margaret waits.', a4));
    expect([page?.width, page?.height]).toEqual([595.28, 841.89]);
    expect(itemAt(page, 15 * 7.2, 841.89 - 7 * 12)?.str).toBe('Margaret waits.');
  });

  it('draws page numbers in the top margin', async () => {
    const pdf = await extract(await render(filler(118)));
    expect(pdf.length).toBe(3);
    expect(pdf[0]?.items.some((item) => item.str === '1.')).toBe(false);
    expect(itemAt(pdf[1], x(58), 792 - 4 * 12)?.str).toBe('2.');
    expect(itemAt(pdf[2], x(58), 792 - 4 * 12)?.str).toBe('3.');
  });

  it('draws scene numbers in both margins', async () => {
    const [page] = await extract(
      await render('INT. HALL - DAY\n\nMargaret waits.', screenplay, true),
    );
    expect(itemAt(page, x(-10), y(0))?.str).toBe('1');
    expect(itemAt(page, x(61), y(0))?.str).toBe('1');
  });

  it('draws the header on the page-number line and the footer as far from the bottom', async () => {
    const template = extend({ page: { header: 'Draft {n}', footer: 'Private' } });
    const [page] = await extract(await render('Margaret waits.', template));
    expect(itemAt(page, x(0), 792 - 4 * 12)?.str).toBe('Draft 1');
    expect(itemAt(page, x(0), 792 - 63 * 12)?.str).toBe('Private');
  });

  it('prints one blank page, of the right paper, for an empty script', async () => {
    // Both papers: pdf-lib adds a default page of its own to an empty document.
    const a4 = extend({ page: { paper: 'a4', width: 82, height: 70, margin: { right: 7 } } });
    const blank = async (template: Template) =>
      (await extract(await render('', template))).map((page) => [
        page.items.length,
        page.width,
        page.height,
      ]);
    expect(await blank(screenplay)).toEqual([[0, 612, 792]]);
    expect(await blank(a4)).toEqual([[0, 595.28, 841.89]]);
  });

  it('prints the title page first', async () => {
    const pdf = await extract(
      await render('Title: The Call\nAuthor: A. Writer\n\nMargaret waits.'),
    );
    expect(pdf.length).toBe(2);
    expect(itemAt(pdf[0], x(26), y(16))?.str).toBe('The Call');
    expect(pdf[0]?.items.some((item) => item.str === '1.')).toBe(false);
  });

  it('is deterministic, with no dates in the metadata', async () => {
    const source = readFileSync(
      new URL('../../../samples/screenplay.fountain', import.meta.url),
      'utf8',
    );
    const bytes = await render(source);
    expect(await render(source)).toEqual(bytes);
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    expect([doc.getCreationDate(), doc.getModificationDate()]).toEqual([undefined, undefined]);
  });
});

describe('text', () => {
  it('uses a font for each style and embeds only the styles it uses', async () => {
    const bytes = await render('Plain *italic* **bold** ***both*** _under_.');
    const [page] = await extract(bytes);
    // pdfjs joins neighboring runs in the same font, so match the start of an item.
    const fontOf = (str: string) => page?.items.find((item) => item.str.startsWith(str))?.font;
    const used = ['Plain', 'italic', 'bold', 'both'].map(fontOf);
    expect(new Set(used).size).toBe(4);
    expect(fontOf('under')).toBe(fontOf('Plain'));
    expect((await embeddedFonts(bytes)).map((name) => name.replace(/^\/\w+\+/, '/'))).toEqual([
      '/CourierPrime-Bold',
      '/CourierPrime-BoldItalic',
      '/CourierPrime-Italic',
      '/CourierPrime-Regular',
    ]);
    expect(await embeddedFonts(await render('Plain.'))).toHaveLength(1);
  });

  it('underlines with a half-point rule 2 pt below the baseline', async () => {
    const ops = await operators(await render('An _underlined_ word.'), 0);
    expect(ops).toMatch(/\b0\.5 w\b/);
    const line = /(-?[\d.]+) (-?[\d.]+) m\s+(-?[\d.]+) (-?[\d.]+) l/.exec(ops)?.slice(1) ?? [];
    const want = [x(3), y(0) - 2, x(13), y(0) - 2];
    expect(line.map(Number).map((n, i) => Math.abs(n - (want[i] as number)) < 0.01)).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it('keeps leading spaces as columns, not glyphs', async () => {
    const [page] = await extract(await render('\tTabbed.'));
    expect(itemAt(page, x(4), y(0))?.str).toBe('Tabbed.');
  });

  it('prints control characters as spaces and survives text the font lacks', async () => {
    const [page] = await extract(
      await render('Bell\u0007rings. Smile 😀, 漢字, and a lone \ud800 half.'),
    );
    expect(rowText(page, y(0))).toMatch(/^Bell rings\. Smile/);
  });

  it('sets the document title from the title page', async () => {
    const bytes = await render('Title: The Call\n\nMargaret waits.');
    const { PDFDocument } = await import('pdf-lib');
    expect((await PDFDocument.load(bytes, { updateMetadata: false })).getTitle()).toBe('The Call');
  });

  it('refuses to run without all four fonts', async () => {
    const layout = paginate(parse('Margaret waits.'), screenplay);
    const partial = { ...fonts, bold: undefined } as unknown as FontSet;
    await expect(renderPdf(layout, screenplay, { fonts: partial })).rejects.toThrow(/bold/);
  });
});

describe('portability', () => {
  it('reads no files and needs no Node built-ins at runtime', () => {
    const src = new URL('../src/', import.meta.url);
    const files = readdirSync(src, { recursive: true, withFileTypes: true }).filter((entry) =>
      entry.isFile(),
    );
    expect(files.map((entry) => entry.name)).toContain('measure.ts');
    for (const entry of files) {
      const file = `${entry.parentPath}/${entry.name}`;
      const code = readFileSync(file, 'utf8');
      expect(code, file).not.toMatch(/from ['"](node:|fs['"]|path['"])/);
    }
  });
});
