import { readMarkdownMeta, setMarkdownMeta } from '@drafter/markdown';

/**
 * A novel is a Markdown document whose trailing metadata comment names the template
 * `"template":"novel"`. It is not a new kind of document: it is `kind: 'markdown'`, and this reads
 * the one fact that makes it a novel.
 */
export function isNovel(text: string): boolean {
  return readMarkdownMeta(text).meta?.template === 'novel';
}

/** A new novel: a chapter heading, an empty line under it to start on, and the comment that makes it one. */
export const NEW_NOVEL = '# Chapter One\n\n\n\n<!-- drafter {"template":"novel"} -->\n';

/** Where typing starts in a new novel: the empty line under the heading. */
export const NEW_NOVEL_CURSOR = '# Chapter One\n\n'.length;

/**
 * The text with its comment naming the novel template (`on`), or not. Every other key in the comment
 * stays, the novel's facts among them; plain Markdown with nothing else left in the comment drops it
 * and the blank line before it. An existing comment is changed where it is.
 */
export function withNovel(text: string, on: boolean): string {
  const { body, meta } = readMarkdownMeta(text);
  const { template: _template, ...rest } = meta ?? {};
  const facts = on ? { ...rest, template: 'novel' } : rest;
  if (Object.keys(facts).length === 0) return body;
  return setMarkdownMeta(text, facts);
}
