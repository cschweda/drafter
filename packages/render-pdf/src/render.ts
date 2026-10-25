import type { Layout, LayoutRun, Page } from '@drafter/layout';
import { CHAR_WIDTH_PT, LINE_HEIGHT_PT, PAPER_POINTS, type Template } from '@drafter/templates';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, type PDFFont, type PDFPage, rgb } from 'pdf-lib';

/** Courier Prime's four styles, as font file bytes. */
export interface FontSet {
  regular: Uint8Array;
  bold: Uint8Array;
  italic: Uint8Array;
  boldItalic: Uint8Array;
}

type Style = keyof FontSet;

/** The font files in the package's `fonts/` folder, by style, for callers that read them. */
export const FONT_FILES: Readonly<Record<Style, string>> = Object.freeze({
  regular: 'CourierPrime-Regular.ttf',
  bold: 'CourierPrime-Bold.ttf',
  italic: 'CourierPrime-Italic.ttf',
  boldItalic: 'CourierPrime-BoldItalic.ttf',
});

const STYLES = Object.keys(FONT_FILES) as Style[];
/** Fixed font names, so a subset's name doesn't take pdf-lib's random tag. */
const FONT_NAMES: Readonly<Record<Style, string>> = {
  regular: 'CourierPrime-Regular',
  bold: 'CourierPrime-Bold',
  italic: 'CourierPrime-Italic',
  boldItalic: 'CourierPrime-BoldItalic',
};
const SIZE_PT = 12;
const BLACK = rgb(0, 0, 0);
/** Underlines are half-point rules, 2 pt below the baseline. */
const UNDERLINE = { thickness: 0.5, drop: 2 };

const styleOf = (run: LayoutRun): Style =>
  run.bold ? (run.italic ? 'boldItalic' : 'bold') : run.italic ? 'italic' : 'regular';

const columns = (s: string) => {
  let n = 0;
  for (let i = 0; i < s.length; n++) i += (s.codePointAt(i) as number) > 0xffff ? 2 : 1;
  return n;
};

const REPLACEMENT = String.fromCharCode(0xfffd);

/**
 * Text pdf-lib can draw on one line: control characters (which it would treat
 * as line breaks) become spaces, and unpaired surrogates become U+FFFD. Each
 * replacement takes one column, as the character did.
 */
function drawable(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const next = s.charCodeAt(i + 1);
    if (c < 0x20 || c === 0x7f || c === 0x85 || c === 0x2028 || c === 0x2029) {
      out += ' ';
    } else if (c >= 0xd800 && c <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
      out += s.slice(i, i + 2);
      i++;
    } else {
      out += c >= 0xd800 && c <= 0xdfff ? REPLACEMENT : s.charAt(i);
    }
  }
  return out;
}

/**
 * Draws laid-out pages as a PDF (technical design §6.2): one page per layout
 * page, sized from `template.page.paper`, with Courier Prime embedded. Text sits
 * on the template's grid of 7.2 pt columns and 12 pt lines. Reads no files:
 * the caller passes the four font files in `opts.fonts`, and only the styles
 * the script uses are embedded.
 */
export async function renderPdf(
  layout: Layout,
  template: Template,
  opts: { fonts: FontSet },
): Promise<Uint8Array> {
  const missing = STYLES.filter((style) => !(opts?.fonts?.[style] instanceof Uint8Array));
  if (missing.length > 0) {
    throw new TypeError(
      `renderPdf needs all four Courier Prime styles; missing: ${missing.map((s) => `fonts.${s}`).join(', ')}`,
    );
  }
  const { page: spec } = template;
  const paper = PAPER_POINTS[spec.paper];
  // No dates or random IDs in the metadata, so the same input gives the same bytes.
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.registerFontkit(fontkit);
  doc.setCreator('Drafter');
  doc.setProducer('Drafter, with pdf-lib');
  const title = layout.pages
    .find((page) => page.number === 0)
    ?.lines.flatMap((line) => (line.right ? [line, line.right] : [line]))
    .filter((line) => line.role === 'title')
    .map((line) => line.runs.map((run) => run.text).join(''))
    .join(' ');
  if (title) doc.setTitle(title, { showInWindowTitleBar: true });

  const embedded = new Map<Style, PDFFont>();
  const fontFor = async (style: Style) => {
    let font = embedded.get(style);
    if (!font) {
      font = await doc.embedFont(opts.fonts[style], {
        subset: true,
        customName: FONT_NAMES[style],
      });
      embedded.set(style, font);
    }
    return font;
  };

  // x from a column measured from the left margin; y from a line measured from the top edge.
  const xOf = (col: number) => (spec.margin.left + col) * CHAR_WIDTH_PT;
  const yOf = (line: number) => paper.height - (line + 1) * LINE_HEIGHT_PT;

  const drawText = async (
    pdfPage: PDFPage,
    runs: readonly LayoutRun[],
    col: number,
    line: number,
  ) => {
    let at = col;
    for (const run of runs) {
      const text = drawable(run.text);
      const width = columns(text);
      const visible = text.trim();
      if (visible !== '') {
        const start = at + width - columns(text.trimStart());
        const x = xOf(start);
        const y = yOf(line);
        pdfPage.drawText(visible, {
          x,
          y,
          size: SIZE_PT,
          font: await fontFor(styleOf(run)),
          color: BLACK,
        });
        if (run.underline) {
          const end = xOf(start + columns(visible));
          const ruleY = y - UNDERLINE.drop;
          pdfPage.drawLine({
            start: { x, y: ruleY },
            end: { x: end, y: ruleY },
            thickness: UNDERLINE.thickness,
            color: BLACK,
          });
        }
      }
      at += width;
    }
  };

  const plain = (text: string): LayoutRun[] => [
    { text, bold: false, italic: false, underline: false, span: { from: 0, to: 0 } },
  ];

  const pages: readonly Page[] =
    layout.pages.length > 0
      ? layout.pages
      : [{ number: 1, lines: [], sceneNumbersLeft: [], sceneNumbersRight: [] }];
  for (const page of pages) {
    const pdfPage = doc.addPage([paper.width, paper.height]);
    for (const [k, row] of page.lines.entries()) {
      for (const part of row.right ? [row, row.right] : [row]) {
        await drawText(pdfPage, part.runs, part.col, spec.margin.top + k);
      }
    }
    if (page.pageNumber) {
      const { text, line, col } = page.pageNumber;
      await drawText(pdfPage, plain(text), col, line);
    }
    for (const { line, text } of page.sceneNumbersLeft) {
      await drawText(pdfPage, plain(text), template.sceneNumbers.left, spec.margin.top + line);
    }
    for (const { line, text } of page.sceneNumbersRight) {
      await drawText(pdfPage, plain(text), template.sceneNumbers.right, spec.margin.top + line);
    }
    // The header shares the page number's line; the footer sits as far from the bottom edge.
    if (page.header) await drawText(pdfPage, plain(page.header), 0, spec.numbering.line);
    if (page.footer) {
      await drawText(pdfPage, plain(page.footer), 0, spec.height - 1 - spec.numbering.line);
    }
  }
  return doc.save();
}
