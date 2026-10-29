import type { Block, Doc, TextChange } from '@drafter/fountain';

// The shape of the text that every structural edit shares (moved here from @drafter/outline in
// Plan B): line breaks, blank lines as Fountain reads them, the stray-`/*` gate, the script's body,
// and taking a line out so the lines around it close up.

/** The script's own line break: the first one in it, `\r\n` or `\n`, else `\n`. */
export function lineBreakOf(source: string): string {
  const at = source.indexOf('\n');
  return at > 0 && source[at - 1] === '\r' ? '\r\n' : '\n';
}

/** A single line break, with nothing else: the gap between two lines of one header. */
export const isLineBreak = (leading: string) => leading === '\n' || leading === '\r\n';

/**
 * `to` moved back before a CRLF's `\r`: a block's span ends with its last line, `\r` and all, and
 * what Drafter writes goes before the line break, never inside it.
 */
export function contentEnd(source: string, to: number): number {
  return to > 0 && source[to - 1] === '\r' ? to - 1 : to;
}

const firstLine = (block: Block) => block.lines[0]?.raw.trimStart() ?? '';

/**
 * The number of blocks that belong to the script's body: the metadata block (the last block, a
 * `/* drafter` boneyard) and a Beat Board block just before it (`/* beat board`) are left out,
 * so no scene or section ever holds them (§5.5, §5.6).
 */
export function bodyEnd(doc: Doc): number {
  const { blocks } = doc;
  let end = blocks.length;
  const last = blocks[end - 1];
  if (last?.kind === 'boneyard' && firstLine(last).startsWith('/* drafter')) end--;
  const board = blocks[end - 1];
  if (board?.kind === 'boneyard' && firstLine(board).startsWith('/* beat board')) end--;
  return end;
}

/**
 * Whether a `/*` in the script isn't closed by a `*\/` of its own: it runs to the end unclosed, or
 * it is closed only by a later boneyard's `*\/` (its text holds another `/*`, such as the metadata
 * block's opener). Either way a scene's span may hold what should never move, so Drafter changes
 * nothing structural until the writer closes it.
 */
export function hasStrayBoneyard(doc: Doc): boolean {
  return doc.regions.some(
    (region) =>
      !region.closed ||
      (region.kind === 'boneyard' &&
        doc.source.slice(region.span.from + 2, region.span.to - 2).includes('/*')),
  );
}

/** The whole lines inside a gap between two blocks (a gap starts and ends inside a line). */
const gapLines = (gap: string) =>
  gap
    .split('\n')
    .slice(1, -1)
    .map((line) => line.replace(/\r$/, ''));

/**
 * Whether a gap between blocks holds a blank line, as Fountain reads one: empty or spaces only, but
 * not exactly two spaces (which joins lines). A heading needs one before it.
 */
export function hasBlankLine(gap: string): boolean {
  return gapLines(gap).some((line) => line.trim() === '' && line !== '  ');
}

/** Whether every line inside a gap is blank as Fountain reads it: nothing in it joins anything. */
export function isPlainGap(gap: string): boolean {
  return gapLines(gap).every((line) => line.trim() === '' && line !== '  ');
}

const endOf = (doc: Doc, block: Block) => contentEnd(doc.source, block.span.to);

/**
 * The change that removes lines `line` to `last` of block `index` along with one line break, so the
 * lines around them close up: the break after them inside a block, or the gap before them
 * otherwise. Null when two-space lines join them to what's around them, which would then join each
 * other.
 */
export function removeLine(
  doc: Doc,
  index: number,
  line: number,
  last: number = line,
): TextChange | null {
  const block = doc.blocks[index] as Block;
  const lines = block.lines;
  const here = lines[line];
  const end = lines[last];
  if (!here || !end || last < line) {
    throw new RangeError(`No lines ${line} to ${last} in block ${index}.`);
  }
  const nextLine = lines[last + 1];
  if (nextLine) return { from: here.span.from, to: nextLine.span.from, insert: '' };
  const previousLine = lines[line - 1];
  if (previousLine) {
    return {
      from: contentEnd(doc.source, previousLine.span.to),
      to: contentEnd(doc.source, end.span.to),
      insert: '',
    };
  }
  const next = doc.blocks[index + 1];
  const previous = doc.blocks[index - 1];
  // A two-space line joins lines; taking this one out next to one would join its neighbours.
  const twoSpaces = (raw: string | undefined) => raw?.replace(/\r$/, '') === '  ';
  if (twoSpaces(previous?.lines.at(-1)?.raw) || twoSpaces(next?.lines[0]?.raw)) return null;
  if (next && isLineBreak(next.leading)) {
    // Only inside a header, where what closes up behind it prints nothing either.
    if (next.kind !== 'note' && next.kind !== 'synopsis') return null;
    return { from: block.span.from, to: next.span.from, insert: '' };
  }
  // Two-space lines around it join it to its neighbours: taking it out would join them instead.
  if (!isPlainGap(block.leading) || (next && !isPlainGap(next.leading))) return null;
  const from = previous ? endOf(doc, previous) : block.span.from;
  return { from, to: endOf(doc, block), insert: '' };
}
