import type { Paper } from '@drafter/templates';
import fontkit from '@pdf-lib/fontkit';
import {
  degrees,
  drawText,
  PDFDocument,
  type PDFFont,
  PDFHexString,
  type PDFName,
  type PDFPage,
  type RGB,
  rgb,
} from 'pdf-lib';
import { safeLink } from './blocks';
import { DOCUMENT_FONT_FILES, type DocumentFontSet, type Face, layoutFeatures } from './fonts';
import { type DocItem, layoutDocument } from './layout';
import { fontMeasure } from './measure';
import { STYLE } from './style';
import type { DocNode } from './tree';

export interface DocumentPdf {
  bytes: Uint8Array;
  /** Characters the fonts lack, printed as `?`, in the order they were first seen. */
  missing: string[];
}

const FACES = Object.keys(DOCUMENT_FONT_FILES) as Face[];
/** Fixed font names, so a subset's name doesn't take pdf-lib's random tag. */
const FONT_NAMES: Readonly<Record<Face, string>> = {
  text: 'InterTight-Regular',
  textItalic: 'InterTight-Italic',
  textBold: 'InterTight-SemiBold',
  textBoldItalic: 'InterTight-SemiBoldItalic',
  code: 'CourierPrime-Regular',
};

const fromHex = (hex: string): RGB =>
  rgb(
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  );
const COLORS = {
  text: fromHex(STYLE.colors.text),
  muted: fromHex(STYLE.colors.muted),
  link: fromHex(STYLE.colors.link),
  panel: fromHex(STYLE.colors.panel),
  rule: fromHex(STYLE.colors.rule),
} as const;

/** The part of fontkit's TrueType subset (`TTFSubset`, inside pdf-lib's subset embedder) that `evenGlyphs` changes. */
interface GlyfSubset {
  glyf: Uint8Array[];
  offset: number;
  /** The font being subset; a simple glyph's data is a slice of its stream's buffer. */
  font?: { stream?: { buffer?: Uint8Array } };
  _addGlyph(gid: number): number;
}

/** A buffer class with a zero-filled `alloc`, as fontkit's (Node's `Buffer`, or its bundled one). */
type ZeroAlloc = { alloc?: (size: number) => Uint8Array };
const canAlloc = (data: unknown): boolean =>
  typeof ((data as { constructor?: ZeroAlloc } | undefined)?.constructor as ZeroAlloc | undefined)
    ?.alloc === 'function';

/**
 * Pads each glyph of a font's subset to an even length. fontkit writes a small subset's `loca` in
 * the short format, which stores offsets halved, without padding the glyphs, so after the first
 * glyph of odd length every offset is wrong and a viewer draws blanks. Inter Tight has hundreds of
 * odd-length glyphs (Courier Prime has none, so its subset is unchanged). The padding is a zero
 * byte after the glyph's data, which the format allows. This reaches into pdf-lib's private
 * embedder (pdf-lib and fontkit are pinned for it), so it never throws: it returns false, and
 * installs nothing, when the subset isn't the shape it knows (no `_addGlyph`, or glyph data with no
 * zero-filled `alloc` to pad it with), and the caller embeds the face whole instead.
 * `document-render.test.ts` reads each embedded subset back and compares its glyphs with the font's.
 */
function evenGlyphs(font: PDFFont): boolean {
  const subset = (font as unknown as { embedder?: { subset?: GlyfSubset } }).embedder?.subset;
  if (typeof subset?._addGlyph !== 'function' || !canAlloc(subset.font?.stream?.buffer)) {
    return false;
  }
  const add = subset._addGlyph;
  subset._addGlyph = function (this: GlyfSubset, gid: number) {
    const index = add.call(this, gid);
    const data = this.glyf?.[index];
    // fontkit's own Buffer class, which its encoder checks for; `alloc` fills with zeros.
    if (data && data.length % 2 === 1 && canAlloc(data)) {
      const padded = (data.constructor as ZeroAlloc).alloc?.(data.length + 1) as Uint8Array;
      padded.set(data);
      this.glyf[index] = padded;
      this.offset += 1;
    }
    return index;
  };
  return true;
}

/**
 * Whether this pdf-lib's subsets of `bytes` can be padded, found on a scratch document that is
 * never saved, so a font that can't be padded is never left in the real one.
 */
async function canPad(bytes: Uint8Array): Promise<boolean> {
  try {
    const scratch = await PDFDocument.create({ updateMetadata: false });
    scratch.registerFontkit(fontkit);
    return evenGlyphs(await scratch.embedFont(bytes, { subset: true }));
  } catch {
    return false;
  }
}

/**
 * Takes a font out of the fonts pdf-lib writes at `save` (its private `fonts` list), so a subset
 * that couldn't be padded never reaches the file. Nothing refers to it yet: it has drawn nothing.
 */
function unembed(doc: PDFDocument, font: PDFFont): void {
  const list = (doc as unknown as { fonts?: unknown }).fonts;
  if (!Array.isArray(list)) return;
  const at = list.indexOf(font);
  if (at >= 0) list.splice(at, 1);
}

type LinkItem = Extract<DocItem, { kind: 'link' }>;

/**
 * An ASCII string (a link's `URL.href`) as a PDF hex string. pdf-lib writes `PDFString` as typed,
 * so an unbalanced parenthesis or a backslash in an address would end or escape a literal string
 * and break the file; hex has no such characters.
 */
const asciiString = (text: string) =>
  PDFHexString.of(
    Array.from(text, (ch) => (ch.charCodeAt(0) & 0x7f).toString(16).padStart(2, '0')).join(''),
  );

/**
 * A page's link rectangles, one per line a link covers: fragments of one link side by side on a
 * line (a link with emphasis inside) join into one rectangle. Only a safe address is kept, checked
 * again here so nothing else can reach an annotation.
 */
function linkRects(items: readonly DocItem[]): LinkItem[] {
  const rects: LinkItem[] = [];
  for (const item of items) {
    if (item.kind !== 'link' || safeLink(item.uri) !== item.uri) continue;
    const last = rects.at(-1);
    if (
      last &&
      last.uri === item.uri &&
      last.y === item.y &&
      last.height === item.height &&
      Math.abs(last.x + last.width - item.x) < 1e-6
    ) {
      last.width = item.x + item.width - last.x;
    } else {
      rects.push({ ...item });
    }
  }
  return rects;
}

/**
 * Draws a Markdown document as a PDF (Markdown PDF design §2–§5): `layoutDocument`'s pages, each
 * text item with one text operator at its baseline, code panels under their text, rules, quote
 * bars, and underlines, and each link a `/Link` annotation to its address. Reads no files: the five
 * font files come in `fonts`; only the faces used are embedded, as subsets, with the same OpenType
 * features the layout measured with (`layoutFeatures`). No dates or random IDs, so the same tree,
 * paper, title, and language give the same bytes.
 */
export async function renderDocumentPdf(
  tree: DocNode,
  opts: { fonts: DocumentFontSet; paper: Paper; title?: string; lang?: string },
): Promise<DocumentPdf> {
  const absent = FACES.filter((face) => !(opts?.fonts?.[face] instanceof Uint8Array));
  if (absent.length > 0) {
    throw new TypeError(
      `renderDocumentPdf needs all five document fonts; missing: ${absent.map((f) => `fonts.${f}`).join(', ')}`,
    );
  }
  const { fonts } = opts;
  const layout = layoutDocument(tree, { paper: opts.paper, measure: fontMeasure(fonts) });

  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.registerFontkit(fontkit);
  doc.setCreator('Drafter');
  doc.setProducer('Drafter, with pdf-lib');
  if (opts.title) doc.setTitle(opts.title, { showInWindowTitleBar: true });
  if (opts.lang) doc.setLanguage(opts.lang);

  const embedded = new Map<Face, PDFFont>();
  const fontFor = async (face: Face) => {
    let font = embedded.get(face);
    if (!font) {
      // A subset, padded; or, if this pdf-lib can't be padded, the whole font: a bigger file,
      // never blank letters.
      const embedFace = (subset: boolean) =>
        doc.embedFont(fonts[face], {
          subset,
          customName: FONT_NAMES[face],
          features: layoutFeatures(),
        });
      const subset = await canPad(fonts[face]);
      font = await embedFace(subset);
      if (subset && !evenGlyphs(font)) {
        // This document's subset isn't the shape the scratch one was: drop it before it's
        // written, and embed the face whole.
        unembed(doc, font);
        font = await embedFace(false);
      }
      embedded.set(face, font);
    }
    return font;
  };

  const addLink = (pdfPage: PDFPage, link: LinkItem) => {
    const annotation = doc.context.obj({
      Type: 'Annot',
      Subtype: 'Link',
      Rect: [link.x, link.y, link.x + link.width, link.y + link.height],
      Border: [0, 0, 0],
      A: { Type: 'Action', S: 'URI', URI: asciiString(link.uri) },
    });
    pdfPage.node.addAnnot(doc.context.register(annotation));
  };

  for (const page of layout.pages) {
    const pdfPage = doc.addPage([layout.width, layout.height]);
    // One resource name for each face a page uses. (`PDFPage.drawText` with a font adds a new
    // name to the page's resources at every call, and these pages make thousands of calls.)
    const keys = new Map<Face, PDFName>();
    const keyFor = (face: Face, font: PDFFont) => {
      let key = keys.get(face);
      if (!key) {
        key = pdfPage.node.newFontDictionary(FONT_NAMES[face], font.ref);
        keys.set(face, key);
      }
      return key;
    };
    // Panels first, so the code on them is drawn over them.
    for (const item of page.items) {
      if (item.kind !== 'rect') continue;
      pdfPage.drawRectangle({
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        color: COLORS[item.color],
        borderWidth: 0,
      });
    }
    for (const item of page.items) {
      if (item.kind === 'text' && item.text !== '') {
        // Each item is one text operator, at its baseline, as the layout measured it.
        const font = await fontFor(item.face);
        pdfPage.pushOperators(
          ...drawText(font.encodeText(item.text), {
            color: COLORS[item.color],
            font: keyFor(item.face, font),
            size: item.size,
            rotate: degrees(0),
            xSkew: degrees(0),
            ySkew: degrees(0),
            x: item.x,
            y: item.y,
          }),
        );
      } else if (item.kind === 'line') {
        pdfPage.drawLine({
          start: { x: item.x1, y: item.y1 },
          end: { x: item.x2, y: item.y2 },
          thickness: item.thickness,
          color: COLORS[item.color],
        });
      }
    }
    for (const link of linkRects(page.items)) addLink(pdfPage, link);
  }
  return { bytes: await doc.save(), missing: layout.missing };
}
