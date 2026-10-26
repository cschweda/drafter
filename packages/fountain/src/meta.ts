import type { Doc, DrafterMeta, TextChange } from './types';

const OPENER = '/* drafter';

/** The script's own line break: the first one in it, `\r\n` or `\n`, else `\n`. */
function lineBreakOf(source: string): string {
  const at = source.indexOf('\n');
  return at > 0 && source[at - 1] === '\r' ? '\r\n' : '\n';
}

/**
 * The JSON of a metadata block, on one line. Every `/` is written `\/`, which JSON reads as `/`,
 * so no value can hold the `*\/` that would close the block, or a `/*` that would open another.
 */
function jsonOf(meta: DrafterMeta): string {
  const { v, ...rest } = meta;
  return JSON.stringify({ v: v ?? 1, ...rest }).replaceAll('/', '\\/');
}

/**
 * Where the existing block is: the `/* drafter … *\/` boneyard that `parse` reads as `doc.meta`,
 * the last block and alone in it. Only the boneyard itself, so the blank lines and indent around
 * it stay as they were.
 */
function existingBlock(doc: Doc): { from: number; to: number } | null {
  if (doc.meta === null) return null;
  const last = doc.blocks[doc.blocks.length - 1];
  if (last?.kind !== 'boneyard') return null;
  const region = doc.regions.find(
    (r) =>
      r.span.from >= last.span.from &&
      r.span.from < last.span.to &&
      r.closed &&
      doc.source.startsWith(OPENER, r.span.from),
  );
  return region ? { from: region.span.from, to: region.span.to } : null;
}

/**
 * The changes that make `meta` the script's metadata block (technical design §8.6): they
 * replace the existing block, or append one after a blank line. The JSON is on one line, with
 * every `/` in it written `\/`. `v` defaults to 1. An unchanged block gives [].
 *
 * The block is written with the script's own line break. A block that can't be read as JSON is
 * kept as the writer left it, and a good one is added after it.
 */
export function setMeta(doc: Doc, meta: DrafterMeta): TextChange[] {
  const { source } = doc;
  const json = jsonOf(meta);
  const nl = lineBreakOf(source);
  const block = `${OPENER}${nl}${json}${nl}*/`;

  const existing = existingBlock(doc);
  if (existing) {
    // The same settings, however the block is laid out, are left as they are.
    if (jsonOf(doc.meta as DrafterMeta) === json) return [];
    return [{ from: existing.from, to: existing.to, insert: block }];
  }

  // Appended at the very end: a blank line first (two line breaks, less those already there),
  // and a line break after.
  let breaks = 0;
  for (
    let at = source.length;
    at > 0 && source[at - 1] === '\n';
    at -= source[at - 2] === '\r' ? 2 : 1
  ) {
    breaks++;
  }
  const gap = source.length === 0 ? '' : nl.repeat(Math.max(0, 2 - breaks));
  return [{ from: source.length, to: source.length, insert: `${gap}${block}${nl}` }];
}
