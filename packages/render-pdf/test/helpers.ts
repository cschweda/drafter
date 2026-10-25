import { readFileSync } from 'node:fs';
import type { LayoutLine } from '@drafter/layout';
import { FONT_FILES, type FontSet } from '@drafter/render-pdf';
import { decodePDFRawStream, PDFArray, PDFDocument, PDFName, PDFRawStream } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** Courier Prime, read from the package's `fonts/` folder the way the CLI reads it. */
export const fonts = Object.fromEntries(
  Object.entries(FONT_FILES).map(([style, file]) => [
    style,
    new Uint8Array(readFileSync(new URL(`../fonts/${file}`, import.meta.url))),
  ]),
) as unknown as FontSet;

export interface TextItem {
  str: string;
  x: number;
  y: number;
  font: string;
}

export interface ExtractedPage {
  width: number;
  height: number;
  /** The text items that show something, in drawing order. */
  items: TextItem[];
}

/** Text and positions, page by page, as pdfjs reads them back. */
export async function extract(bytes: Uint8Array): Promise<ExtractedPage[]> {
  // pdfjs takes ownership of the buffer it is given, so it gets a copy.
  const task = getDocument({ data: bytes.slice(), verbosity: 0 });
  const pdf = await task.promise;
  const pages: ExtractedPage[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const [x0, y0, x1, y1] = page.view as [number, number, number, number];
    const content = await page.getTextContent();
    const items: TextItem[] = [];
    for (const item of content.items) {
      if (!('str' in item) || item.str.trim() === '') continue;
      items.push({
        str: item.str,
        x: item.transform[4],
        y: item.transform[5],
        font: item.fontName,
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
