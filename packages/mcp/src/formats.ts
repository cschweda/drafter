// Which files Drafter for Claude reads, by their names: the kinds Open reads in the app.
import { importKindOf, reopenFormatOf } from '@drafter/archive';

/** A file's kind, as its name says. `text` is plain `.txt`, read as Fountain. */
export type Format =
  | 'fountain'
  | 'text'
  | 'markdown'
  | 'fdx'
  | 'highland'
  | 'fadein'
  | 'html'
  | 'epub';

const NO_BYTES = new Uint8Array();

/**
 * The kind a file's name says it is, in any case: `.fountain` and `.spmd` are Fountain, `.txt`
 * plain text, `.md` and `.markdown` Markdown, then Final Draft, Highland, and Fade In files, and
 * the HTML and EPUB exports that may hold a script; null for anything else.
 */
export function formatOf(name: string): Format | null {
  const extension = /\.([^./\\]+)$/.exec(name)?.[1]?.toLowerCase();
  // A name that is only an extension (`.fountain`) is a dot file, not a script.
  if (extension === undefined || name.length === extension.length + 1) return null;
  if (extension === 'fountain' || extension === 'spmd') return 'fountain';
  if (extension === 'txt') return 'text';
  if (extension === 'md' || extension === 'markdown') return 'markdown';
  // By name only: no bytes, so the export's content is not sniffed here.
  return importKindOf(name) ?? reopenFormatOf(name, NO_BYTES);
}
