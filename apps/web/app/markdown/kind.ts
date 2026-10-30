import { importKindOf } from '@drafter/archive';

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

// The rule is `@drafter/archive`'s, shared with `drafter convert`.
export { type ImportKind, importKindOf } from '@drafter/archive';

/**
 * A file from another app (`importKindOf`): never a kind of document. Opening one imports it as a
 * new Fountain script with no file (`storage/open.ts`), so Save writes a `.fountain` and never the
 * file it came from.
 */
export function isImportName(name: string | undefined): boolean {
  return importKindOf(name) !== null;
}
