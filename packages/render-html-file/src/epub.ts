// An EPUB 3 (design §10a): the Reading view of a script, or a Markdown document as the HTML file
// draws it, reflowed by the reader's own e-reader. A zip (`zipStored`) of the `mimetype`, the
// container, the package, the contents (nav), one XHTML document per part, one small stylesheet,
// and, for a script, the Courier Prime styles it uses. No script, no network, no light/dark
// switch: the e-reader sets the theme and the type size.

import { zipStored } from '@drafter/archive';
import type { Doc } from '@drafter/fountain';
import type { Layout } from '@drafter/layout';
import { type DocumentHtmlInput, documentParts } from './document';
import { el, escapeHtml } from './escape';
import { type FontStyle, fontKind } from './fonts';
import { printedBlocks, type ReadingItem, type ReadingMark, readingItems } from './reading';
import type { ScriptHtmlInput } from './script';
import { titleField, titleLines } from './script';
import { sha256 } from './sha256';
import { langOf } from './shell';

/** What a script's EPUB is made from: the HTML file's input, less its kind line, and the book's. */
export type ScriptEpubInput = Omit<ScriptHtmlInput, 'kindLine'> & EpubBook;

/** What a document's EPUB is made from. */
export type DocumentEpubInput = DocumentHtmlInput & EpubBook;

/** The package's own facts. */
export interface EpubBook {
  /** `dc:creator`: the title page's Author (`scriptAuthor`), or the document's; none when empty. */
  author?: string;
  /** `dcterms:modified`, written in UTC to the second. */
  modified: Date;
  /** `dc:identifier`, the book's one id: `epubIdentifier(title, text)` makes one. */
  id: string;
}

const XHTML = 'http://www.w3.org/1999/xhtml';
const OPS = 'http://www.idpf.org/2007/ops';
const ROOT = 'EPUB/';
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>\n';
const encoder = new TextEncoder();

/**
 * A stable `urn:uuid` for an export, so a reader that keeps its place by the book's id finds it
 * again when the same draft is exported again, and a changed draft is a different book. The first
 * 16 bytes of the SHA-256 of "drafter-epub", the title's length, the title, and the text (each
 * apart, so nothing moves between them), with the version nibble set to 5 and the variant to
 * RFC 4122's, in the 8-4-4-4-12 shape. It has a name-based UUID's shape and properties (the same
 * name, the same id), not version 5's SHA-1 and namespace.
 */
export function epubIdentifier(title: string, text: string): string {
  const digest = sha256(encoder.encode(`drafter-epub\n${title.length}\n${title}\n${text}`));
  const bytes = digest.slice(0, 16);
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `urn:uuid:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** The script's author for `dc:creator`: its title page's Author (or Authors), else ''. */
export const scriptAuthor = (doc: Doc) => titleField(doc, 'author', 'authors');

/** `dcterms:modified` as EPUB 3 wants it: UTC, to the second, `Z`. Throws for a date that isn't one. */
function modifiedOf(date: Date): string {
  const time = date.getTime();
  if (!Number.isFinite(time)) throw new RangeError('The EPUB needs a modified date');
  const text = new Date(Math.floor(time / 1000) * 1000).toISOString().replace('.000Z', 'Z');
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(text)) {
    throw new RangeError(`Not a date an EPUB can say: ${text}`);
  }
  return text;
}

/**
 * An XML element for the package and the container, whose names and values are this file's own:
 * every value escaped, and an element with no content closed with `/>`.
 */
function x(name: string, attributes: Record<string, string | undefined>, content?: string): string {
  let out = `<${name}`;
  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined) out += ` ${key}="${escapeHtml(value)}"`;
  }
  return content === undefined ? `${out}/>` : `${out}>${content}</${name}>`;
}

/** One XHTML content document: the namespaces, the language, the title, and the stylesheet. */
function xhtml(o: {
  lang: string;
  title: string;
  generator: string;
  bodyClass: string;
  body: string;
}): string {
  const head =
    el('meta', { charset: 'utf-8' }) +
    el('title', {}, escapeHtml(o.title)) +
    el('meta', { name: 'generator', content: o.generator }) +
    el('link', { rel: 'stylesheet', type: 'text/css', href: 'style.css' });
  return `${XML_DECLARATION}<!DOCTYPE html>\n${el(
    'html',
    { xmlns: XHTML, 'xmlns:epub': OPS, lang: o.lang, 'xml:lang': o.lang },
    `\n${el('head', {}, head)}\n${el('body', { class: o.bodyClass }, o.body)}\n`,
  )}\n`;
}

/** The book's header, at the start of its first part: the title and a line each for the rest. */
const headerHtml = (title: string, lines: readonly string[]) =>
  el(
    'header',
    { class: 'head' },
    el('h1', { class: 'title' }, escapeHtml(title)) +
      lines.map((line) => el('p', { class: 'byline' }, escapeHtml(line))).join(''),
  );

/** A part of the book: its name in the contents, its file, its markup, and what the contents list beneath it. */
interface Part {
  title: string;
  file: string;
  html: string;
  beneath: { text: string; id: string }[];
}

const partFile = (i: number) => `part-${i + 1}.xhtml`;

/** One stylesheet, light by default (the e-reader may change it), every size in `em`. */
const BASE_CSS = `body{margin:0 .5em;line-height:1.45}
.head{margin:2em 0 2.5em;text-align:center}
.head .title{font-size:1.6em;margin:0 0 .6em}
.byline{margin:.2em 0}
h1,h2,h3,h4,h5,h6{line-height:1.25;page-break-after:avoid;break-after:avoid}
.b{font-weight:bold}
.i{font-style:italic}
.u{text-decoration:underline}
.note{font-family:serif;font-size:.9em;border-left:.25em solid #a8a29a;padding:.2em 0 .2em .7em;margin:1em 0}`;

const SCRIPT_CSS = `body.script{font-family:"Courier Prime",monospace}
.script h1,.script h2,.script h3,.script h4,.script h5,.script h6{font-weight:normal}
.sec{font-size:1.3em;margin:2em 0 1em}
.sh{font-size:1em;margin:1.8em 0 .8em}
.sn{color:#59616b}
.reading>p{margin:0 0 1em}
.speech{margin:0 0 1em}
.who{margin:0}
.ext{color:#59616b}
.said{margin:0 0 0 2em}
.said p{margin:0}
.paren{color:#59616b}
.tr{text-align:right;color:#59616b}
.ct{text-align:center}
.ly{font-style:italic}
.dual{margin:0 0 1em}`;

const DOCUMENT_CSS = `body.document{font-family:serif}
p{margin:0 0 1em}
blockquote{margin:1em 0 1em 1em;padding-left:.8em;border-left:.25em solid #a8a29a}
pre{white-space:pre-wrap;font-size:.85em;margin:0 0 1em}
code{font-family:monospace}
.raw{white-space:pre-wrap}
.image{font-style:italic}
sup{line-height:0}
.fnref a{padding:0 .1em}
.footnotes{font-size:.9em;margin-top:2em}
.fn p{margin:0 0 .5em}
.fn-n{font-weight:bold}`;

/** The Courier Prime styles, with each one's weight and style, and its file's name. */
const FACES: ReadonlyArray<readonly [FontStyle, number, 'normal' | 'italic', string]> = [
  ['regular', 400, 'normal', 'courier-prime-regular'],
  ['bold', 700, 'normal', 'courier-prime-bold'],
  ['italic', 400, 'italic', 'courier-prime-italic'],
  ['boldItalic', 700, 'italic', 'courier-prime-bold-italic'],
];

/**
 * The Courier Prime styles a script's EPUB draws in: Regular always; Bold, Italic, or Bold Italic
 * for a run with something to see in that style, a lyric's runs being italic. Nothing else in it
 * is bold or italic: its headings and names are in Regular.
 */
export function epubStylesUsed(doc: Doc, layout: Layout): Set<FontStyle> {
  const used = new Set<FontStyle>(['regular']);
  for (const i of printedBlocks(layout)) {
    const block = doc.blocks[i];
    if (!block || block.kind === 'section' || block.kind === 'scene_heading') continue;
    if (block.kind === 'character') continue;
    for (const line of block.lines) {
      if (line.transparent) continue;
      for (const run of line.inline) {
        const italic = run.italic || block.kind === 'lyric';
        if ((!run.bold && !italic) || run.text.trim() === '') continue;
        used.add(run.bold ? (italic ? 'boldItalic' : 'bold') : 'italic');
      }
    }
  }
  return used;
}

/** A font file in the book, and its rule. */
interface FontFile {
  path: string;
  type: string;
  data: Uint8Array;
  rule: string;
}

function fontFiles(
  fonts: Partial<Record<FontStyle, Uint8Array>>,
  used: ReadonlySet<FontStyle>,
): FontFile[] {
  const files: FontFile[] = [];
  for (const [style, weight, slant, name] of FACES) {
    if (!used.has(style)) continue;
    const bytes = fonts[style];
    if (Object.prototype.toString.call(bytes) !== '[object Uint8Array]' || !bytes) {
      throw new TypeError(`The EPUB needs Courier Prime's ${style} style, which the script uses`);
    }
    const kind = fontKind(bytes);
    if (!kind) throw new RangeError(`The ${style} bytes are not a font file`);
    const path = `fonts/${name}.${kind.mime}`;
    files.push({
      path,
      type: `font/${kind.mime}`,
      data: bytes,
      rule:
        `@font-face{font-family:"Courier Prime";src:url(${path}) format("${kind.format}");` +
        `font-weight:${weight};font-style:${slant}}`,
    });
  }
  return files;
}

/** The book's whole zip, from its parts, stylesheet, and fonts. */
function book(o: {
  title: string;
  lang: string;
  generator: string;
  author?: string;
  modified: Date;
  id: string;
  bodyClass: string;
  parts: Part[];
  css: string;
  fonts: FontFile[];
}): Uint8Array {
  const modified = modifiedOf(o.modified);
  const lang = langOf(o.lang);
  const title = o.title.trim() === '' ? 'Untitled' : o.title;
  const author = o.author?.trim() ? o.author : undefined;

  const navList = el(
    'ol',
    {},
    o.parts
      .map((part) => {
        const beneath =
          part.beneath.length > 0
            ? el(
                'ol',
                {},
                part.beneath
                  .map((b) =>
                    el('li', {}, el('a', { href: `${part.file}#${b.id}` }, escapeHtml(b.text))),
                  )
                  .join(''),
              )
            : '';
        return el('li', {}, el('a', { href: part.file }, escapeHtml(part.title)) + beneath);
      })
      .join(''),
  );
  const nav = xhtml({
    lang,
    title,
    generator: o.generator,
    bodyClass: 'contents',
    body: el(
      'nav',
      { 'epub:type': 'toc', id: 'toc', role: 'doc-toc', 'aria-labelledby': 'toc-title' },
      el('h1', { id: 'toc-title' }, 'Contents') + navList,
    ),
  });

  const manifest = [
    x('item', {
      id: 'nav',
      href: 'nav.xhtml',
      'media-type': 'application/xhtml+xml',
      properties: 'nav',
    }),
    ...o.parts.map((part, i) =>
      x('item', { id: `part-${i + 1}`, href: part.file, 'media-type': 'application/xhtml+xml' }),
    ),
    x('item', { id: 'css', href: 'style.css', 'media-type': 'text/css' }),
    ...o.fonts.map((font, i) =>
      x('item', { id: `font-${i + 1}`, href: font.path, 'media-type': font.type }),
    ),
  ];
  const metadata = [
    x('dc:identifier', { id: 'uid' }, escapeHtml(o.id)),
    x('dc:title', {}, escapeHtml(title)),
    author === undefined ? '' : x('dc:creator', {}, escapeHtml(author)),
    x('dc:language', {}, escapeHtml(lang)),
    x('meta', { property: 'dcterms:modified' }, modified),
  ].filter(Boolean);
  const opf =
    XML_DECLARATION +
    x(
      'package',
      {
        xmlns: 'http://www.idpf.org/2007/opf',
        version: '3.0',
        'unique-identifier': 'uid',
        'xml:lang': lang,
      },
      `\n${x('metadata', { 'xmlns:dc': 'http://purl.org/dc/elements/1.1/' }, `\n${metadata.join('\n')}\n`)}` +
        `\n${x('manifest', {}, `\n${manifest.join('\n')}\n`)}` +
        `\n${x('spine', {}, `\n${o.parts.map((_, i) => x('itemref', { idref: `part-${i + 1}` })).join('\n')}\n`)}\n`,
    );
  const container =
    XML_DECLARATION +
    x(
      'container',
      { version: '1.0', xmlns: 'urn:oasis:names:tc:opendocument:xmlns:container' },
      x(
        'rootfiles',
        {},
        x('rootfile', {
          'full-path': `${ROOT}package.opf`,
          'media-type': 'application/oebps-package+xml',
        }),
      ),
    );

  const css = [...o.fonts.map((f) => f.rule), BASE_CSS, o.css].filter(Boolean).join('\n');
  return zipStored([
    { name: 'mimetype', data: encoder.encode('application/epub+zip') },
    { name: 'META-INF/container.xml', data: encoder.encode(container) },
    { name: `${ROOT}package.opf`, data: encoder.encode(opf) },
    { name: `${ROOT}nav.xhtml`, data: encoder.encode(nav) },
    ...o.parts.map((part) => ({
      name: `${ROOT}${part.file}`,
      data: encoder.encode(
        xhtml({ lang, title, generator: o.generator, bodyClass: o.bodyClass, body: part.html }),
      ),
    })),
    { name: `${ROOT}style.css`, data: encoder.encode(css) },
    ...o.fonts.map((font) => ({ name: `${ROOT}${font.path}`, data: font.data })),
  ]);
}

/** Reading's pieces cut into parts at the top-level sections, what comes before them the title's. */
function scriptParts(items: readonly ReadingItem[], title: string): Omit<Part, 'file'>[] {
  const depths = items.flatMap((item) => (item.mark?.kind === 'section' ? [item.mark.depth] : []));
  const top = depths.length > 0 ? Math.min(...depths) : 0;
  const groups: { title: string; head?: ReadingMark; items: ReadingItem[] }[] = [
    { title, items: [] },
  ];
  for (const item of items) {
    if (item.mark?.kind === 'section' && item.mark.depth === top) {
      groups.push({ title: item.mark.text, head: item.mark, items: [item] });
    } else {
      groups[groups.length - 1]?.items.push(item);
    }
  }
  if (groups.length > 1 && groups[0]?.items.length === 0) groups.shift();
  return groups.map((group, i) => ({
    title: group.title || `Part ${i + 1}`,
    html: group.items.map((item) => item.html).join(''),
    beneath: group.items.flatMap((item) =>
      item.mark && item.mark !== group.head
        ? [
            {
              text: item.mark.text || (item.mark.kind === 'scene' ? 'Scene' : 'Section'),
              id: `r-b-${item.mark.block}`,
            },
          ]
        : [],
    ),
  }));
}

/**
 * A script's EPUB (design §10a): its Reading view, cut into one XHTML document per act (its
 * shallowest sections), with what comes before the first act as a part named by the title, or
 * the whole script as one part when it has none; the contents list the parts and, beneath each,
 * its scene headings and deeper sections. The first part opens with the header (the title, and
 * the title page's credit, author, source, and draft date). Notes as the export options say,
 * the boneyard never. Each character's name is printed in its color's light shade (a grey on a
 * monochrome screen; the name is what tells them apart). Courier Prime is embedded in the styles
 * the text uses (`epubStylesUsed`); a style it uses with no bytes throws a TypeError.
 */
export function renderScriptEpub(input: ScriptEpubInput): Uint8Array {
  const { doc, layout } = input;
  const { items, colors } = readingItems(doc, layout, input.notes);
  const parts = scriptParts(items, input.title).map((part, i) => ({
    ...part,
    file: partFile(i),
    html:
      (i === 0 ? headerHtml(input.title, titleLines(doc)) : '') +
      el('section', { class: 'reading', 'epub:type': 'chapter' }, part.html),
  }));
  const colorCss = colors.map((color, i) => `.k${i}{color:${color.light}}`).join('\n');
  return book({
    ...input,
    bodyClass: 'script',
    parts,
    css: [SCRIPT_CSS, colorCss].filter(Boolean).join('\n'),
    fonts: fontFiles(input.fonts, epubStylesUsed(doc, layout)),
  });
}

/**
 * A Markdown document's EPUB (design §10a): the document as the HTML file draws it, one XHTML
 * document per chapter (its root `#` headings; `documentParts`), footnotes as EPUB 3 footnotes at
 * the end of their chapter, linked both ways. The first part opens with the title (and the author,
 * when there is one). No font is embedded: the e-reader's own serif reads it.
 */
export function renderDocumentEpub(input: DocumentEpubInput): Uint8Array {
  const parts = documentParts(input.tree, input.title, partFile).map((part, i) => ({
    ...part,
    html:
      (i === 0 ? headerHtml(input.title, input.author?.trim() ? [input.author] : []) : '') +
      el('section', { class: 'document', 'epub:type': 'chapter' }, part.html),
    beneath: [],
  }));
  return book({ ...input, bodyClass: 'document', parts, css: DOCUMENT_CSS, fonts: [] });
}
