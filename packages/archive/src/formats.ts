/**
 * The files Drafter turns away because they are a known kind that isn't a script (Imports and
 * Markdown out, Call 21): a short, closed table, by extension and by first bytes. The app's Open
 * and `drafter convert` both ask it first. Anything else that is UTF-8 text opens as Fountain,
 * which reads any text, and a zip named `.highland` or `.fadein` is imported.
 */

/** What a refused file is ("a Word document") and what the writer can do instead. */
export interface Refusal {
  format: string;
  advice: string;
}

const SAVE_AS_TEXT = 'Save it as plain text or Fountain in the app that made it, then open that.';

const RTF: Refusal = { format: 'an RTF document', advice: SAVE_AS_TEXT };
const PDF: Refusal = {
  format: 'a PDF',
  advice: 'Open the script it was made from instead, or copy its text into a new script.',
};

/**
 * A web page, Drafter's own HTML export among them: opened as a script, its markup would become
 * the script, and saving would write Fountain over the page.
 */
const WEB_PAGE: Refusal = {
  format: 'a web page',
  advice: 'Open the script it was made from instead.',
};

/**
 * An e-book, Drafter's own EPUB export among them: a zip of web pages, which would open as the
 * packed file it is, or, named as a script, as its bytes.
 */
const E_BOOK: Refusal = {
  format: 'an e-book',
  advice: 'Open the script it was made from instead.',
};

/** By extension, lowercased, without its dot. */
const BY_EXTENSION = new Map<string, Refusal>(
  Object.entries({
    rtf: RTF,
    doc: { format: 'a Word document', advice: SAVE_AS_TEXT },
    docx: { format: 'a Word document', advice: SAVE_AS_TEXT },
    odt: { format: 'an OpenDocument text file', advice: SAVE_AS_TEXT },
    pages: { format: 'a Pages document', advice: SAVE_AS_TEXT },
    pdf: PDF,
    fdr: {
      format: 'an older Final Draft file',
      advice: 'Open it in Final Draft and save it as .fdx, then open that.',
    },
    celtx: {
      format: 'a Celtx project',
      advice: 'Export it from Celtx as plain text, then open that.',
    },
    zip: { format: 'a zip archive', advice: 'Unpack it, then open the script inside.' },
    html: WEB_PAGE,
    htm: WEB_PAGE,
    epub: E_BOOK,
  }),
);

/** The zips Drafter imports (Highland's and Fade In's files), by extension, lowercased. */
const PACKED_SCRIPTS = new Set(['highland', 'fadein']);

/** By the file's first bytes, whatever its name, `unless` its extension says it is one Drafter reads. */
const BY_SIGNATURE: {
  bytes: number[];
  refusal: Refusal;
  unless?: (extension: string) => boolean;
}[] = [
  { bytes: [0x7b, 0x5c, 0x72, 0x74, 0x66], refusal: RTF }, // {\rtf
  { bytes: [0x25, 0x50, 0x44, 0x46, 0x2d], refusal: PDF }, // %PDF-
  {
    bytes: [0xd0, 0xcf, 0x11, 0xe0], // an OLE compound file
    refusal: {
      format: 'an older Office or Final Draft file',
      advice: 'Save it as plain text, Fountain, or .fdx in the app that made it, then open that.',
    },
  },
  {
    bytes: [0x50, 0x4b, 0x03, 0x04], // PK\3\4, a zip's first local header
    refusal: { format: 'a Word, OpenDocument, or other packed file', advice: SAVE_AS_TEXT },
    // A Highland or Fade In file is a zip too, and goes on to its importer (storage/open.ts).
    unless: (extension) => PACKED_SCRIPTS.has(extension),
  },
];

function extensionOf(name: string | undefined): string {
  const match = name === undefined ? null : /\.([^./\\]+)$/.exec(name);
  return match?.[1]?.toLowerCase() ?? '';
}

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  bytes.byteLength >= signature.length && signature.every((b, i) => bytes[i] === b);

const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));
const MIMETYPE = ascii('mimetype');
const EPUB_MIMETYPE = ascii('application/epub+zip');

/**
 * Whether the bytes start as an EPUB does: a zip whose first entry is named `mimetype` and holds
 * `application/epub+zip` (EPUB's own rule, so that its kind can be read at a fixed place), the
 * entry's content after its name and any extra field.
 */
function isEBook(bytes: Uint8Array): boolean {
  if (!startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) || bytes.byteLength < 30) return false;
  const nameLength = (bytes[26] as number) | ((bytes[27] as number) << 8);
  const extraLength = (bytes[28] as number) | ((bytes[29] as number) << 8);
  if (nameLength !== MIMETYPE.length || !startsWith(bytes.subarray(30), MIMETYPE)) return false;
  return startsWith(bytes.subarray(30 + nameLength + extraLength), EPUB_MIMETYPE);
}

/**
 * Whether the text starts as a web page does: `<!DOCTYPE html` or `<html` (any case, then a space,
 * `>`, or the end), after a byte order mark and white space. Only the first bytes are read.
 */
function isWebPage(bytes: Uint8Array): boolean {
  let start = 0;
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) start = 3;
  const head = String.fromCharCode(...bytes.subarray(start, start + 256))
    .trimStart()
    .slice(0, 16)
    .toLowerCase();
  return /^(?:<!doctype\s+html|<html)(?:[\s>]|$)/.test(head);
}

/**
 * A known non-script format, by its extension (any case) or, whatever its name, by its first bytes
 * (an e-book's before its name); or null.
 */
export function notAScript(name: string | undefined, bytes: Uint8Array): Refusal | null {
  const extension = extensionOf(name);
  return (
    // An e-book by its content first: renamed (`.zip`, `.highland`), it is still one.
    (isEBook(bytes) ? E_BOOK : undefined) ??
    BY_EXTENSION.get(extension) ??
    BY_SIGNATURE.find(
      ({ bytes: signature, unless }) => startsWith(bytes, signature) && !unless?.(extension),
    )?.refusal ??
    (isWebPage(bytes) ? WEB_PAGE : null)
  );
}

/** “Drafter can’t open a Word document (Notes.docx). Save it as plain text or Fountain in the app that made it, then open that.” */
export function refusalMessage(name: string, refusal: Refusal): string {
  return `Drafter can’t open ${refusal.format} (${name}). ${refusal.advice}`;
}

/** A file from another screenwriting app that is imported, never edited: by its extension. */
export type ImportKind = 'fdx' | 'highland' | 'fadein';

const IMPORT_EXTENSION = /\.(fdx|highland|fadein)$/i;

/**
 * The kind of import a file's name says it is (in any case): a Final Draft file (`.fdx`), a
 * Highland file (`.highland`), or a Fade In file (`.fadein`); null for anything else.
 */
export function importKindOf(name: string | undefined): ImportKind | null {
  const match = name === undefined ? null : IMPORT_EXTENSION.exec(name);
  return match ? (match[1]?.toLowerCase() as ImportKind) : null;
}

/** The most a script's text may be, in bytes: a feature film is well under 1 MB. */
export const MAX_SCRIPT_BYTES = 5 * 1024 * 1024;

/** A NUL byte in this many leading bytes means a file is not text. */
export const SNIFF_BYTES = 8 * 1024;
