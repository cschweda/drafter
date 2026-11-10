import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, type PDFFont, rgb } from 'pdf-lib';
import type { DocumentFontSet } from './document/fonts';
import { faceMeasure } from './document/measure';
import { embedFace } from './document/render';

const PAGES = { letter: { width: 792, height: 612 }, a4: { width: 842, height: 595 } } as const;
const MARGIN = 36;
const SIZE = 9;
const LEADING = 11;
const HEAD_SIZE = 11;
const MIN_COLUMN = 40;
/** Space left and right of a cell's text, so columns don't touch. */
const PAD = 3;
const BLACK = rgb(0, 0, 0);

type Measure = ReturnType<typeof faceMeasure<'text' | 'textBold'>>;

/** Splits a word that is wider than `max` into pieces that fit, by characters. */
function breakWord(word: string, max: number, fit: (s: string) => number): string[] {
  const parts: string[] = [];
  let current = '';
  for (const ch of Array.from(word)) {
    if (current !== '' && fit(current + ch) > max) {
      parts.push(current);
      current = ch;
    } else current += ch;
  }
  if (current !== '') parts.push(current);
  return parts;
}

/** A cell's text as lines no wider than `max`: words wrap, a single over-long word breaks by characters. */
function wrap(text: string, max: number, fit: (s: string) => number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter((w) => w !== '')) {
      const joined = line === '' ? word : `${line} ${word}`;
      if (fit(joined) <= max) {
        line = joined;
        continue;
      }
      if (line !== '') lines.push(line);
      const pieces = fit(word) <= max ? [word] : breakWord(word, max, fit);
      line = pieces.pop() as string;
      lines.push(...pieces);
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Draws a table as a landscape PDF (production design §9): `<title> — <date>` in bold at the top,
 * the column header (bold, repeated on every page), then the rows in the Markdown PDF's regular
 * face. Columns are as wide as their longest cell (measured), at least 40 pt, fitted to the page
 * width; cells wrap by words; a row stays on one page unless it is taller than a page. Reads no
 * files, and writes no dates, so the same table gives the same bytes.
 */
export async function renderTablePdf(
  table: { title: string; date: string; columns: string[]; rows: string[][] },
  opts: { fonts: DocumentFontSet; paper: 'letter' | 'a4' },
): Promise<Uint8Array> {
  const page = PAGES[opts.paper] ?? PAGES.letter;
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.registerFontkit(fontkit);
  doc.setCreator('Drafter');
  doc.setProducer('Drafter, with pdf-lib');
  doc.setTitle(table.title, { showInWindowTitleBar: true });
  const regular: PDFFont = await embedFace(doc, opts.fonts.text, 'InterTight-Regular');
  const bold: PDFFont = await embedFace(doc, opts.fonts.textBold, 'InterTight-SemiBold');
  const measure: Measure = faceMeasure({ text: opts.fonts.text, textBold: opts.fonts.textBold });
  const fitRegular = (s: string) => measure.width(s, 'text', SIZE);
  const fitBold = (s: string) => measure.width(s, 'textBold', SIZE);

  const total = page.width - 2 * MARGIN;
  const widest = table.columns.map((name, c) =>
    Math.max(
      fitBold(name),
      ...table.rows.map((row) => Math.max(...(row[c] ?? '').split(/\r?\n/).map(fitRegular), 0)),
    ),
  );
  const natural = widest.map((w) => Math.max(w + 2 * PAD, MIN_COLUMN));
  const sum = natural.reduce((a, b) => a + b, 0);
  // Scale to the page; a column never goes under its minimum, so the scaled rest gives way for it.
  let widths = natural.map((w) => (w * total) / sum);
  if (widths.some((w) => w < MIN_COLUMN)) {
    const fixed = widths.map((w) => w < MIN_COLUMN);
    const free = natural.reduce((a, w, c) => a + (fixed[c] ? 0 : w), 0);
    const room = total - fixed.filter(Boolean).length * MIN_COLUMN;
    widths = natural.map((w, c) =>
      fixed[c] ? MIN_COLUMN : Math.max((w * room) / free, MIN_COLUMN),
    );
  }
  const xs = widths.map((_, c) => MARGIN + widths.slice(0, c).reduce((a, b) => a + b, 0));

  const headLines = table.columns.map((name, c) =>
    wrap(name, (widths[c] as number) - 2 * PAD, fitBold),
  );
  const headHeight = Math.max(...headLines.map((l) => l.length), 1) * LEADING + 3;
  const top = page.height - MARGIN;
  const bottom = MARGIN;

  let pdfPage = doc.addPage([page.width, page.height]);
  let y = top;
  const startPage = () => {
    pdfPage = doc.addPage([page.width, page.height]);
    y = top;
    drawHeader();
  };
  const drawHeader = () => {
    pdfPage.drawText(`${table.title} — ${table.date}`, {
      x: MARGIN,
      y: y - HEAD_SIZE,
      size: HEAD_SIZE,
      font: bold,
      color: BLACK,
    });
    y -= HEAD_SIZE + 8;
    for (const [c, lines] of headLines.entries()) {
      for (const [k, line] of lines.entries()) {
        pdfPage.drawText(line, {
          x: (xs[c] as number) + PAD,
          y: y - SIZE - k * LEADING,
          size: SIZE,
          font: bold,
          color: BLACK,
        });
      }
    }
    y -= headHeight;
    pdfPage.drawLine({
      start: { x: MARGIN, y: y + 1.5 },
      end: { x: MARGIN + total, y: y + 1.5 },
      thickness: 0.5,
      color: BLACK,
    });
  };
  drawHeader();

  const drawLines = (cells: string[][], from: number, to: number) => {
    for (const [c, lines] of cells.entries()) {
      for (let k = from; k < Math.min(to, lines.length); k++) {
        const text = lines[k] as string;
        if (text.trim() === '') continue;
        pdfPage.drawText(text, {
          x: (xs[c] as number) + PAD,
          y: y - SIZE - (k - from) * LEADING,
          size: SIZE,
          font: regular,
          color: BLACK,
        });
      }
    }
  };

  for (const row of table.rows) {
    const cells = table.columns.map((_, c) =>
      wrap(row[c] ?? '', (widths[c] as number) - 2 * PAD, fitRegular),
    );
    const height = Math.max(...cells.map((l) => l.length), 1);
    const fits = (rows: number) => y - rows * LEADING >= bottom;
    if (!fits(height) && y < top - HEAD_SIZE - 8 - headHeight - 0.5) {
      // A row that fits on a fresh page goes there whole.
      const fresh = top - (HEAD_SIZE + 8 + headHeight);
      if (height * LEADING <= fresh - bottom) startPage();
    }
    let done = 0;
    while (done < height) {
      const room = Math.max(1, Math.floor((y - bottom) / LEADING));
      const take = Math.min(room, height - done);
      drawLines(cells, done, done + take);
      y -= take * LEADING;
      done += take;
      if (done < height) startPage();
    }
    y -= 2;
  }
  return doc.save();
}
