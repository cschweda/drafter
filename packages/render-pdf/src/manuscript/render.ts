import type { Manuscript, ManuscriptBlock, Run } from '@drafter/novel';
import { PAPER_POINTS, type Paper } from '@drafter/templates';
import fontkit from '@pdf-lib/fontkit';
import { degrees, drawText, PDFDocument, type PDFFont, type PDFName, rgb } from 'pdf-lib';
import { faceMeasure } from '../document/measure';
import { embedFace } from '../document/render';
import type { RenderProgress } from '../progress';
import { drawable } from '../text';
import {
  MANUSCRIPT_FACES,
  MANUSCRIPT_FONT_FILES,
  type ManuscriptFace,
  type ManuscriptFontSet,
} from './fonts';
import { HEADER_Y, layoutManuscript, MARGIN, type ManuscriptRun, SIZE } from './layout';

export interface ManuscriptPdf {
  bytes: Uint8Array;
  /** Characters the font lacks, printed as `?`, in the order they were first seen. */
  missing: string[];
}

const BLACK = rgb(0, 0, 0);

/** A face's fixed font name, its file's (`LiberationSerif-Italic`), so a subset doesn't take pdf-lib's random tag. */
const fontName = (ms: Manuscript, face: ManuscriptFace) =>
  (MANUSCRIPT_FONT_FILES[ms.font] ?? MANUSCRIPT_FONT_FILES.times)[face]
    .replace(/^.*\//, '')
    .replace(/\.ttf$/, '');

const faceOf = (run: Run): ManuscriptFace =>
  run.bold ? (run.italic ? 'boldItalic' : 'bold') : run.italic ? 'italic' : 'regular';

/**
 * The manuscript with every string made drawable: control characters as spaces, lone surrogates
 * and characters the face lacks as `?`, each such character added to `missing`. The layout then
 * measures exactly what is drawn.
 */
function printable(
  ms: Manuscript,
  has: (codePoint: number, face: ManuscriptFace) => boolean,
  missing: Set<string>,
): Manuscript {
  const clean = (text: string, face: ManuscriptFace) => {
    let out = '';
    for (const ch of drawable(text, '?')) {
      if (ch !== ' ' && ch !== '?' && !has(ch.codePointAt(0) as number, face)) {
        missing.add(ch);
        out += '?';
      } else {
        out += ch;
      }
    }
    return out;
  };
  // A run's line breaks are spaces; `drawable` makes them so.
  const runs = (list: readonly Run[]) =>
    list.map((run) => ({ ...run, text: clean(run.text, faceOf(run)) }));
  const plain = (text: string) => clean(text, 'regular');
  const blocks = ms.blocks.map((block): ManuscriptBlock => {
    switch (block.kind) {
      case 'part':
      case 'chapter':
        return { ...block, title: plain(block.title) };
      case 'paragraph':
        return {
          ...block,
          runs: runs(block.runs),
          ...(block.marker === undefined ? {} : { marker: plain(block.marker) }),
        };
      default:
        return block;
    }
  });
  return {
    ...ms,
    title: plain(ms.title),
    byline: plain(ms.byline),
    legalName: plain(ms.legalName),
    contact: ms.contact.map(plain),
    surname: plain(ms.surname),
    shortTitle: plain(ms.shortTitle),
    wordsLabel: plain(ms.wordsLabel),
    blocks,
    notes: ms.notes.map(runs),
  };
}

/**
 * Draws a novel's standard manuscript as a PDF (manuscript design, "The PDF"): `layoutManuscript`'s
 * pages, each run with one text operator at its baseline, in the four faces of the manuscript's
 * font (Liberation Serif for `times`, Courier Prime for `courier`, passed in `fonts`), and the
 * running header right-aligned half an inch from the top of every page after the title page. Reads
 * no files; only the faces used are embedded, as subsets, with the features the layout measured
 * with. The title and author (the byline) are in the file's metadata, and `lang` is its language.
 * No dates or random IDs, so the same manuscript gives the same bytes.
 */
export async function renderManuscriptPdf(
  ms: Manuscript,
  opts: {
    fonts: ManuscriptFontSet;
    paper: Paper;
    lang?: string;
    /** Told how far the render is: the blocks laid out, the pages drawn, the file saved. */
    onProgress?: (progress: RenderProgress) => void;
  },
): Promise<ManuscriptPdf> {
  const absent = MANUSCRIPT_FACES.filter((face) => !(opts?.fonts?.[face] instanceof Uint8Array));
  if (absent.length > 0) {
    throw new TypeError(
      `renderManuscriptPdf needs all four faces of the manuscript's font; missing: ${absent.map((f) => `fonts.${f}`).join(', ')}`,
    );
  }
  const { fonts } = opts;
  const report = (stage: RenderProgress['stage'], done: number, total: number) =>
    opts.onProgress?.({ stage, done, total });
  const fontMeasure = faceMeasure(
    Object.fromEntries(MANUSCRIPT_FACES.map((face) => [face, fonts[face]])) as ManuscriptFontSet,
  );
  const measure = (text: string, face: ManuscriptFace) => fontMeasure.width(text, face, SIZE);
  const missing = new Set<string>();
  const book = printable(ms, (cp, face) => fontMeasure.has(cp, face), missing);

  report('layout', 0, book.blocks.length);
  const pages = layoutManuscript(book, {
    paper: opts.paper,
    measure,
    onProgress: (done, total) => report('layout', done, total),
  });
  const { width, height } = PAPER_POINTS[opts.paper];

  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.registerFontkit(fontkit);
  doc.setCreator('Drafter');
  doc.setProducer('Drafter, with pdf-lib');
  if (book.title.trim() !== '') doc.setTitle(book.title.trim(), { showInWindowTitleBar: true });
  if (book.byline.trim() !== '') doc.setAuthor(book.byline.trim());
  if (opts.lang) doc.setLanguage(opts.lang);

  const embedded = new Map<ManuscriptFace, PDFFont>();
  const fontFor = async (face: ManuscriptFace) => {
    let font = embedded.get(face);
    if (!font) {
      font = await embedFace(doc, fonts[face], fontName(ms, face));
      embedded.set(face, font);
    }
    return font;
  };

  report('draw', 0, pages.length);
  for (const [index, page] of pages.entries()) {
    const pdfPage = doc.addPage([width, height]);
    // One resource name for each face a page uses, as the document renderer does.
    const keys = new Map<ManuscriptFace, PDFName>();
    const draw = async (run: ManuscriptRun, x: number, y: number) => {
      const font = await fontFor(run.face);
      let key = keys.get(run.face);
      if (!key) {
        key = pdfPage.node.newFontDictionary(fontName(ms, run.face), font.ref);
        keys.set(run.face, key);
      }
      pdfPage.pushOperators(
        ...drawText(font.encodeText(run.text), {
          color: BLACK,
          font: key,
          size: SIZE,
          rotate: degrees(0),
          xSkew: degrees(0),
          ySkew: degrees(0),
          x,
          y: height - y,
        }),
      );
    };
    for (const line of page.lines) {
      let x = line.x;
      for (const run of line.runs) {
        if (run.text.trim() !== '') await draw(run, x, line.y);
        x += measure(run.text, run.face);
      }
    }
    if (page.header !== null) {
      const header: ManuscriptRun = { text: page.header, face: 'regular' };
      await draw(header, width - MARGIN - measure(header.text, 'regular'), HEADER_Y);
    }
    report('draw', index + 1, pages.length);
  }
  report('save', 0, 1);
  const bytes = await doc.save();
  report('save', 1, 1);
  return { bytes, missing: [...missing] };
}
