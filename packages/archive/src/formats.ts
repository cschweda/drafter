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

/** A known non-script format, by its extension (any case) or, whatever its name, by its first bytes; or null. */
export function notAScript(name: string | undefined, bytes: Uint8Array): Refusal | null {
  const extension = extensionOf(name);
  return (
    BY_EXTENSION.get(extension) ??
    BY_SIGNATURE.find(
      ({ bytes: signature, unless }) => startsWith(bytes, signature) && !unless?.(extension),
    )?.refusal ??
    null
  );
}

/** “Drafter can’t open a Word document (Notes.docx). Save it as plain text or Fountain in the app that made it, then open that.” */
export function refusalMessage(name: string, refusal: Refusal): string {
  return `Drafter can’t open ${refusal.format} (${name}). ${refusal.advice}`;
}
