/**
 * What a script is: Fountain (a screenplay or a stage play, whose template the metadata block
 * names) or plain Markdown, which has no pages, no elements, and no checks. Markdown is a kind of
 * document beside Fountain, not a Fountain template.
 */
export type DocumentKind = 'fountain' | 'markdown';

/** A new Markdown document: a title to write over, then a blank line to start under. */
export const NEW_MARKDOWN = '# Untitled\n\n';

const MARKDOWN_EXTENSION = /\.(md|markdown)$/i;

/**
 * `.md` and `.markdown` open as Markdown; `.fountain`, `.txt`, and everything else as Fountain
 * (a `.fdx`, `.highland`, or `.fadein` is imported as Fountain, `isImportName`).
 */
export function kindOfFileName(name: string | undefined): DocumentKind {
  return name !== undefined && MARKDOWN_EXTENSION.test(name) ? 'markdown' : 'fountain';
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

/**
 * A file from another app (`importKindOf`): never a kind of document. Opening one imports it as a
 * new Fountain script with no file (`storage/open.ts`), so Save writes a `.fountain` and never the
 * file it came from.
 */
export function isImportName(name: string | undefined): boolean {
  return importKindOf(name) !== null;
}
