import { readFileSync } from 'node:fs';
import type { LayoutLine } from '@drafter/layout';
import { FONT_FILES, type FontSet } from '@drafter/render-pdf';
import {
  decodePDFRawStream,
  PDFArray,
  PDFDocument,
  PDFName,
  PDFRawStream,
  type PDFRef,
} from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { DOCUMENT_FONT_FILES, type DocumentFontSet } from '../src/document/fonts';

/** Courier Prime, read from the package's `fonts/` folder the way the CLI reads it. */
export const fonts = Object.fromEntries(
  Object.entries(FONT_FILES).map(([style, file]) => [
    style,
    new Uint8Array(readFileSync(new URL(`../fonts/${file}`, import.meta.url))),
  ]),
) as unknown as FontSet;

/** Inter Tight's four styles and Courier Prime Regular, read from `fonts/` the way the CLI reads Courier Prime. */
export const documentFonts = Object.fromEntries(
  Object.entries(DOCUMENT_FONT_FILES).map(([face, file]) => [
    face,
    new Uint8Array(readFileSync(new URL(`../fonts/${file}`, import.meta.url))),
  ]),
) as unknown as DocumentFontSet;

export interface TextItem {
  str: string;
  x: number;
  y: number;
  /** pdfjs's id for the font, the same for every item in one font. */
  font: string;
  /** The font's base name (`CourierPrime-Regular`), when `extract` is asked for it. */
  fontName?: string;
  /** The item's drawn width, from the PDF's own glyph widths. */
  width: number;
}

export interface ExtractedPage {
  width: number;
  height: number;
  /** The text items that show something (or, with `spaces`, any text), in drawing order. */
  items: TextItem[];
}

/**
 * Text and positions, page by page, as pdfjs reads them back. With `fontNames`, each item also
 * names its font, which costs pdfjs loading the fonts; with `spaces`, the items that are only
 * spaces (pdfjs splits a string's trailing spaces into one of their own) are kept.
 */
export async function extract(
  bytes: Uint8Array,
  opts: { fontNames?: boolean; spaces?: boolean } = {},
): Promise<ExtractedPage[]> {
  // pdfjs takes ownership of the buffer it is given, so it gets a copy.
  const task = getDocument({
    data: bytes.slice(),
    verbosity: 0,
    fontExtraProperties: opts.fontNames === true,
  });
  const pdf = await task.promise;
  const pages: ExtractedPage[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const [x0, y0, x1, y1] = page.view as [number, number, number, number];
    // Drawing the page's operators loads its fonts, so their names can be read.
    if (opts.fontNames) await page.getOperatorList();
    const content = await page.getTextContent();
    const items: TextItem[] = [];
    for (const item of content.items) {
      if (!('str' in item) || (item.str.trim() === '' && !(opts.spaces && item.str !== '')))
        continue;
      items.push({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        font: item.fontName,
        width: item.width,
        ...(opts.fontNames
          ? { fontName: (page.commonObjs.get(item.fontName) as { name: string }).name }
          : {}),
      });
    }
    pages.push({ width: x1 - x0, height: y1 - y0, items });
  }
  await task.destroy();
  return pages;
}

const near = (a: number, b: number) => Math.abs(a - b) <= 0.5;

/** The item that starts at (x, y), within half a point. */
export const itemAt = (page: ExtractedPage | undefined, x: number, y: number) =>
  page?.items.find((item) => near(item.x, x) && near(item.y, y));

/** Everything printed on the baseline at `y`, left to right, with spaces collapsed. */
export const rowText = (page: ExtractedPage | undefined, y: number) =>
  (page?.items ?? [])
    .filter((item) => near(item.y, y))
    .sort((a, b) => a.x - b.x)
    .map((item) => item.str)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

export const textOf = (line: LayoutLine) => line.runs.map((run) => run.text).join('');

export interface LinkAnnotation {
  /** `[x1, y1, x2, y2]`, in points from the page's bottom-left corner. */
  rect: [number, number, number, number];
  url: string | undefined;
}

/** A page's link annotations (pdfjs's `getAnnotations`), in the order the page lists them. */
export async function annotations(bytes: Uint8Array, pageIndex: number): Promise<LinkAnnotation[]> {
  const task = getDocument({ data: bytes.slice(), verbosity: 0 });
  const pdf = await task.promise;
  const page = await pdf.getPage(pageIndex + 1);
  const found = (await page.getAnnotations()) as {
    subtype: string;
    rect: [number, number, number, number];
    url?: string;
  }[];
  await task.destroy();
  return found
    .filter((annotation) => annotation.subtype === 'Link')
    .map(({ rect, url }) => ({ rect: [...rect], url }));
}

/** Every indirect object of a PDF, written out as PDF syntax (a stream as its dictionary). */
export async function objects(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return doc.context.enumerateIndirectObjects().map(([, object]) => object.toString());
}

/** Each embedded TrueType font program (`/FontFile2`), decoded, by its font's base name. */
export async function fontPrograms(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const programs = new Map<string, Uint8Array>();
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!('get' in object) || typeof object.get !== 'function') continue;
    const dict = object as unknown as { get(key: PDFName): unknown };
    if (String(dict.get(PDFName.of('Type'))) !== '/FontDescriptor') continue;
    const stream = doc.context.lookup(dict.get(PDFName.of('FontFile2')) as PDFRef);
    if (!(stream instanceof PDFRawStream)) continue;
    programs.set(String(dict.get(PDFName.of('FontName'))), decodePDFRawStream(stream).decode());
  }
  return programs;
}

/** The decoded content streams of a page, as text: the drawing operators. */
export async function operators(bytes: Uint8Array, pageIndex: number): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const contents = doc.getPage(pageIndex).node.get(PDFName.of('Contents'));
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  return refs
    .map((ref) => doc.context.lookup(ref))
    .filter((stream): stream is PDFRawStream => stream instanceof PDFRawStream)
    .map((stream) => new TextDecoder().decode(decodePDFRawStream(stream).decode()))
    .join('\n');
}

/** The base names of the fonts a PDF embeds. */
export async function embeddedFonts(bytes: Uint8Array): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  const names: string[] = [];
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!('get' in object) || typeof object.get !== 'function') continue;
    const dict = object as unknown as { get(key: PDFName): unknown };
    if (String(dict.get(PDFName.of('Type'))) !== '/Font') continue;
    if (String(dict.get(PDFName.of('Subtype'))) !== '/Type0') continue;
    names.push(String(dict.get(PDFName.of('BaseFont'))));
  }
  return names.sort();
}
