// The parts of a manuscript's .docx, one function each, every one a string of XML. Written by hand
// from ECMA-376 (WordprocessingML), with only what a manuscript needs: no theme, no numbering, no
// fonts table, no footnotes. The look lives in named styles, not in each paragraph, so a writer or
// an editor who changes "Chapter Title" in Word changes every chapter.
//
// Word's field codes make it ask "This document contains links that may refer to other files…"
// on every open, so there are none, with one approved exception: the running header's `PAGE`
// field, written as a single `<w:fldSimple w:instr=" PAGE "/>` (a page number points at nothing
// outside the document, and needs no update). There is no `updateFields` in the settings.

import type { Manuscript, ManuscriptBlock, ManuscriptFont, Run } from '@drafter/novel';
import type { Paper } from '@drafter/templates';
import { xmlText } from './xml';

const DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

// Lengths in twips, a twentieth of a point: 1440 to the inch.
/** The page's size, portrait. */
const PAGE: Readonly<Record<Paper, { width: number; height: number }>> = {
  letter: { width: 12240, height: 15840 },
  a4: { width: 11906, height: 16838 },
};
/** One inch on every side. */
const MARGIN = 1440;
/** The running header half an inch from the top. */
const HEADER = 720;
/** Half an inch: the first-line indent, and a block quote's and a list's indent. */
const INDENT = 720;
/**
 * Double spacing, as Word's Paragraph dialog names it: 480 in the `line` units of `w:spacing`
 * (240 is single), twice the font's own line height. Writers and editors expect "Double", and it
 * grows with the font if they change it. Word's double line is a little taller than the PDF's
 * 24 pt (about 26.6 pt in Times New Roman), so the Word file can run to a few more pages; that is
 * accepted. As a length in twips (space before or after), 480 is one 24 pt line.
 */
const DOUBLE = 480;
/** Single spacing, in the `line` units of `w:spacing`: the contact lines and the header. */
const SINGLE = 240;
/**
 * A single-spaced line's height in twips, about: 12 pt type's own line in Times New Roman or
 * Courier New is about 13.8 pt. The title page counts the contact lines with it.
 */
const SINGLE_ROW = 276;

const FONT_NAME: Readonly<Record<ManuscriptFont, string>> = {
  times: 'Times New Roman',
  courier: 'Courier New',
};

/** Where a chapter's title sits: a third of the way down the page, as space above it. */
export function chapterBefore(paper: Paper): number {
  return Math.round(PAGE[paper].height / 3 - MARGIN);
}

/** Where a part's title sits: halfway down the page. */
export function partBefore(paper: Paper): number {
  return Math.round(PAGE[paper].height / 2 - MARGIN);
}

/** The text's width, margin to margin: where the word count's right tab stops. */
function textWidth(paper: Paper): number {
  return PAGE[paper].width - 2 * MARGIN;
}

/**
 * Text for a `w:t`: escaped, a line break as a space (a run never holds one, but an image's alt
 * text might).
 */
function plain(text: string): string {
  return xmlText(text.replace(/\r\n?|\n/g, ' '));
}

/** One run: its marks, then its text, each tab its own `w:tab` (inside `w:t` a tab is a space). */
function run(r: Run): string {
  const marks = `${r.bold ? '<w:b/><w:bCs/>' : ''}${r.italic ? '<w:i/><w:iCs/>' : ''}`;
  const rPr = marks === '' ? '' : `<w:rPr>${marks}</w:rPr>`;
  const pieces = r.text
    .split('\t')
    .map((piece) => (piece === '' ? '' : `<w:t xml:space="preserve">${plain(piece)}</w:t>`));
  const body = pieces.join('<w:tab/>');
  return body === '' ? '' : `<w:r>${rPr}${body}</w:r>`;
}

function paragraph(
  style: string | null,
  runs: readonly Run[],
  more: { pageBreak?: boolean; extra?: string } = {},
): string {
  const props =
    (style === null ? '' : `<w:pStyle w:val="${style}"/>`) +
    (more.pageBreak ? '<w:pageBreakBefore/>' : '') +
    (more.extra ?? '');
  const pPr = props === '' ? '' : `<w:pPr>${props}</w:pPr>`;
  return `<w:p>${pPr}${runs.map(run).join('')}</w:p>`;
}

const text = (s: string): Run[] => (s === '' ? [] : [{ text: s }]);

/** `[Content_Types].xml`: the media type of every part. */
export function contentTypes(): string {
  const wml = 'application/vnd.openxmlformats-officedocument.wordprocessingml';
  const override = (part: string, type: string) =>
    `<Override PartName="/${part}" ContentType="${type}"/>`;
  return (
    DECLARATION +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    override('word/document.xml', `${wml}.document.main+xml`) +
    override('word/styles.xml', `${wml}.styles+xml`) +
    override('word/settings.xml', `${wml}.settings+xml`) +
    override('word/header1.xml', `${wml}.header+xml`) +
    override('docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml') +
    override(
      'docProps/app.xml',
      'application/vnd.openxmlformats-officedocument.extended-properties+xml',
    ) +
    '</Types>'
  );
}

/** `_rels/.rels`: the package's relationships, to the document and its properties. */
export function packageRels(): string {
  return (
    DECLARATION +
    `<Relationships xmlns="${PR}">` +
    `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
    `<Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/>` +
    '</Relationships>'
  );
}

/** `word/_rels/document.xml.rels`: the document's own parts, every one inside the package. */
export function documentRels(): string {
  return (
    DECLARATION +
    `<Relationships xmlns="${PR}">` +
    `<Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId2" Type="${REL}/settings" Target="settings.xml"/>` +
    `<Relationship Id="rId3" Type="${REL}/header" Target="header1.xml"/>` +
    '</Relationships>'
  );
}

/** A date as W3CDTF, to the second, in UTC. */
function w3cdtf(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

/**
 * `docProps/core.xml`: the title, and the byline as the creator. Nothing else about the writer:
 * not the legal name, not the contact lines, no "last modified by". A date only when given one,
 * so the same manuscript makes the same file.
 */
export function coreProps(ms: Manuscript, created?: Date): string {
  const title = ms.title.trim();
  const byline = ms.byline.trim();
  return (
    DECLARATION +
    '<cp:coreProperties' +
    ' xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"' +
    ' xmlns:dc="http://purl.org/dc/elements/1.1/"' +
    ' xmlns:dcterms="http://purl.org/dc/terms/"' +
    ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    (title === '' ? '' : `<dc:title>${plain(title)}</dc:title>`) +
    (byline === '' ? '' : `<dc:creator>${plain(byline)}</dc:creator>`) +
    (created
      ? `<dcterms:created xsi:type="dcterms:W3CDTF">${w3cdtf(created)}</dcterms:created>`
      : '') +
    '</cp:coreProperties>'
  );
}

/** `docProps/app.xml`: the application's name, and nothing about the writer or their machine. */
export function appProps(): string {
  return (
    DECLARATION +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
    '<Application>Drafter</Application>' +
    '</Properties>'
  );
}

/**
 * `word/settings.xml`: Word 2013 and later's layout (compatibility mode 15), half-inch tab stops,
 * the document's language for the theme fonts. No `updateFields`, no tracked changes, no
 * protection.
 */
export function settings(lang: string): string {
  return (
    DECLARATION +
    `<w:settings xmlns:w="${W}">` +
    '<w:zoom w:percent="100"/>' +
    `<w:defaultTabStop w:val="${INDENT}"/>` +
    '<w:characterSpacingControl w:val="doNotCompress"/>' +
    '<w:compat>' +
    '<w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>' +
    '</w:compat>' +
    `<w:themeFontLang w:val="${xmlText(lang)}"/>` +
    '</w:settings>'
  );
}

/** A paragraph style. `pPr` and `rPr` are the inside of those elements, in the schema's order. */
function style(id: string, name: string, pPr: string, rPr = ''): string {
  return (
    `<w:style w:type="paragraph" w:styleId="${id}">` +
    `<w:name w:val="${name}"/>` +
    (id === 'Normal' ? '' : '<w:basedOn w:val="Normal"/><w:next w:val="Normal"/>') +
    '<w:qFormat/>' +
    (pPr === '' ? '' : `<w:pPr>${pPr}</w:pPr>`) +
    (rPr === '' ? '' : `<w:rPr>${rPr}</w:rPr>`) +
    '</w:style>'
  );
}

/** No first-line indent. */
const FLUSH = '<w:ind w:firstLine="0"/>';
const CENTRED = '<w:jc w:val="center"/>';

/**
 * `word/styles.xml`. The defaults are the manuscript: 12 pt Times New Roman (or Courier New),
 * double-spaced (Word's Double), a half-inch first-line indent, two lines kept on each side of a
 * page break, in the document's language. Every other style changes only what it must. A code
 * line and inline code stay in the manuscript's own font, as the PDF prints them.
 */
export function styles(font: ManuscriptFont, lang: string, paper: Paper): string {
  const face = FONT_NAME[font];
  const l = xmlText(lang);
  const double = `<w:spacing w:before="0" w:after="0" w:line="${DOUBLE}" w:lineRule="auto"/>`;
  return (
    DECLARATION +
    `<w:styles xmlns:w="${W}">` +
    '<w:docDefaults>' +
    '<w:rPrDefault><w:rPr>' +
    `<w:rFonts w:ascii="${face}" w:hAnsi="${face}" w:eastAsia="${face}" w:cs="${face}"/>` +
    '<w:sz w:val="24"/><w:szCs w:val="24"/>' +
    `<w:lang w:val="${l}" w:eastAsia="${l}" w:bidi="${l}"/>` +
    '</w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr>' +
    '<w:widowControl/>' +
    double +
    `<w:ind w:firstLine="${INDENT}"/>` +
    '</w:pPr></w:pPrDefault>' +
    '</w:docDefaults>' +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
    style('Title', 'Title', `${FLUSH}${CENTRED}`) +
    style('Byline', 'Byline', `${FLUSH}${CENTRED}`) +
    style(
      'Contact',
      'Contact',
      `<w:spacing w:before="0" w:after="0" w:line="${SINGLE}" w:lineRule="auto"/>${FLUSH}`,
    ) +
    style(
      'PartTitle',
      'Part Title',
      `<w:keepNext/><w:pageBreakBefore/><w:spacing w:before="${partBefore(paper)}" w:after="0"/>${FLUSH}${CENTRED}<w:outlineLvl w:val="0"/>`,
    ) +
    // The text starts two double-spaced lines below the title: one blank line between.
    style(
      'ChapterTitle',
      'Chapter Title',
      `<w:keepNext/><w:pageBreakBefore/><w:spacing w:before="${chapterBefore(paper)}" w:after="${DOUBLE}"/>${FLUSH}${CENTRED}<w:outlineLvl w:val="1"/>`,
    ) +
    // A scene break keeps the next paragraph's first lines with it.
    style('SceneBreak', 'Scene Break', `<w:keepNext/>${FLUSH}${CENTRED}`) +
    style(
      'Quote',
      'Block Quote',
      `<w:ind w:left="${INDENT}" w:right="${INDENT}" w:firstLine="0"/>`,
    ) +
    style('ListParagraph', 'List Paragraph', `<w:ind w:left="${INDENT}" w:firstLine="0"/>`) +
    style('Code', 'Code', FLUSH) +
    // END one blank line after the last text.
    style('End', 'End', `<w:spacing w:before="${DOUBLE}"/>${FLUSH}${CENTRED}`) +
    style(
      'NotesTitle',
      'Notes Title',
      `<w:keepNext/><w:pageBreakBefore/><w:spacing w:after="${DOUBLE}"/>${FLUSH}${CENTRED}`,
    ) +
    style(
      'Header',
      'header',
      `<w:spacing w:before="0" w:after="0" w:line="${SINGLE}" w:lineRule="auto"/>${FLUSH}<w:jc w:val="right"/>`,
    ) +
    '</w:styles>'
  );
}

/**
 * The running header's text before the page number: `Surname / SHORT TITLE / `, leaving out an
 * empty part, or nothing when both are empty (the PDF's `Surname / SHORT TITLE / N`).
 */
export function headerText(ms: Manuscript): string {
  const parts = [ms.surname.trim(), ms.shortTitle.trim()].filter((s) => s !== '');
  return parts.map((p) => `${p} / `).join('');
}

/** `word/header1.xml`: the running header, right-aligned, ending in the one `PAGE` field. */
export function header(ms: Manuscript): string {
  return (
    DECLARATION +
    `<w:hdr xmlns:w="${W}">` +
    '<w:p><w:pPr><w:pStyle w:val="Header"/></w:pPr>' +
    run({ text: headerText(ms) }) +
    '<w:fldSimple w:instr=" PAGE "/>' +
    '</w:p>' +
    '</w:hdr>'
  );
}

/** A book block's style id, or null for Normal. */
function blockStyle(block: Extract<ManuscriptBlock, { kind: 'paragraph' }>): string | null {
  switch (block.style) {
    case 'quote':
      return 'Quote';
    case 'list':
      return 'ListParagraph';
    case 'code':
      return 'Code';
    default:
      // A body paragraph, and a heading below a section's, which prints as text.
      return null;
  }
}

/**
 * The title page: the legal name and contact lines single-spaced at the top left, the word count
 * on the first line's row at a right tab, then the title halfway down the page and the byline one
 * double-spaced line below it. The title's place is space above it, less the contact lines'
 * height: each line counts as one single-spaced row (`SINGLE_ROW`), since the file can't measure
 * the font or where Word will wrap.
 */
function titlePage(ms: Manuscript, paper: Paper): string[] {
  const details = [ms.legalName, ...ms.contact].map((d) => d.trim()).filter((d) => d !== '');
  const rows = Math.max(1, details.length);
  const out: string[] = [];
  const count = ms.wordsLabel.trim();
  const tabs = `<w:tabs><w:tab w:val="right" w:pos="${textWidth(paper)}"/></w:tabs>`;
  out.push(
    paragraph('Contact', [...text(details[0] ?? ''), ...text(count === '' ? '' : `\t${count}`)], {
      extra: tabs,
    }),
  );
  for (const detail of details.slice(1)) out.push(paragraph('Contact', text(detail)));
  const before = Math.max(0, partBefore(paper) - rows * SINGLE_ROW);
  out.push(
    paragraph('Title', text(ms.title.trim()), {
      extra: `<w:spacing w:before="${before}"/>`,
    }),
  );
  const byline = ms.byline.trim();
  if (byline !== '') out.push(paragraph('Byline', text(`by ${byline}`)));
  return out;
}

/**
 * `word/document.xml`: the title page, the book, END, and the notes, in one section whose first
 * page (the title page) has no header (`w:titlePg`). A part's and a chapter's styles start a new
 * page; text right after the title page or a part's page starts one with `w:pageBreakBefore`.
 */
export function document(ms: Manuscript, paper: Paper): string {
  const body = titlePage(ms, paper);
  /** The next block must start a page: the title page or a part's page is behind it. */
  let fresh = true;
  for (const block of ms.blocks) {
    if (block.kind === 'part' || block.kind === 'chapter') {
      const id = block.kind === 'part' ? 'PartTitle' : 'ChapterTitle';
      body.push(paragraph(id, text(block.title.trim())));
      fresh = block.kind === 'part';
      continue;
    }
    const pageBreak = fresh;
    fresh = false;
    if (block.kind === 'break') {
      body.push(paragraph('SceneBreak', text('#'), { pageBreak }));
    } else if (block.kind === 'end') {
      body.push(paragraph('End', text('END'), { pageBreak }));
    } else {
      const runs =
        block.marker === undefined ? block.runs : [{ text: `${block.marker} ` }, ...block.runs];
      body.push(paragraph(blockStyle(block), runs, { pageBreak }));
    }
  }
  if (ms.notes.length > 0) {
    body.push(paragraph('NotesTitle', text('Notes')));
    for (const [i, note] of ms.notes.entries()) {
      body.push(paragraph(null, [{ text: `${i + 1}. ` }, ...note]));
    }
  }
  const { width, height } = PAGE[paper];
  const sectPr =
    '<w:sectPr>' +
    '<w:headerReference w:type="default" r:id="rId3"/>' +
    `<w:pgSz w:w="${width}" w:h="${height}"/>` +
    `<w:pgMar w:top="${MARGIN}" w:right="${MARGIN}" w:bottom="${MARGIN}" w:left="${MARGIN}" w:header="${HEADER}" w:footer="${HEADER}" w:gutter="0"/>` +
    '<w:cols w:space="720"/>' +
    '<w:titlePg/>' +
    '</w:sectPr>';
  return (
    DECLARATION +
    `<w:document xmlns:w="${W}" xmlns:r="${R}">` +
    `<w:body>${body.join('')}${sectPr}</w:body>` +
    '</w:document>'
  );
}
