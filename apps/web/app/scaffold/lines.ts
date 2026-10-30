import type { Block, Doc } from '@drafter/fountain';
import type { OutlineItem, SceneIndex, Speech } from '@drafter/outline';

// A character's lines on their Scaffold page (seeing-the-script design §5.3): each speech's printed
// text, read from the parse at its cue. A speech is its cue and the parentheticals, dialogue, and
// lyrics right after it, as the layout groups them (no blank line between); notes and the boneyard
// don't print, so they are left out. Only text is read here: the speeches and their words are the
// scene index's.

/** A speech's printed text, for the character page's Lines, and the cue's block it goes to. */
export interface SpokenLine {
  /** The scene it is in, by index; null before the first scene or in a section's own stretch. */
  scene: number | null;
  /** The outline item that owns it (`index.items`), a scene or a section; null in the opening. */
  item: number | null;
  /** Whether it comes before the script's first scene (in the opening, or a section before it). */
  before: boolean;
  block: number;
  /** The speech's printed text, parentheticals in their parentheses, on one line. */
  text: string;
}

const PARTS = new Set<Block['kind']>(['parenthetical', 'dialogue', 'lyric']);

/** No blank line between this block and the one before it. */
const adjacent = (block: Block) => block.leading.split('\n').length === 2;

/** The printed text of a block's lines, without notes, the boneyard, or emphasis markers. */
function printed(block: Block): string[] {
  const out: string[] = [];
  for (const line of block.lines) {
    if (line.transparent) continue;
    let text = '';
    for (const run of line.inline) text += run.text;
    out.push(text);
  }
  return out;
}

/** The lines of `speeches`, in their order; each one's `scene` is kept, when it has one. */
export function linesOf(
  doc: Doc,
  speeches: ReadonlyArray<
    Speech & { scene?: number | null; item?: number | null; before?: boolean }
  >,
): SpokenLine[] {
  return speeches.map((speech) => {
    const parts: string[] = [];
    for (let b = speech.block + 1; b < doc.blocks.length; b++) {
      const block = doc.blocks[b] as Block;
      if (!PARTS.has(block.kind) || !adjacent(block)) break;
      parts.push(...printed(block));
    }
    // A note taken out of the middle of a line leaves two spaces.
    const text = parts.join(' ').split(/\s+/).filter(Boolean).join(' ');
    return {
      scene: speech.scene ?? null,
      item: speech.item ?? null,
      before: speech.before ?? false,
      block: speech.block,
      text,
    };
  });
}

/** A run of lines with one owner, each with its place among all the lines shown. */
export interface LineGroup {
  first: SpokenLine;
  lines: Array<{ at: number; line: SpokenLine }>;
}

/**
 * Runs of lines in one place: a scene, a section's own stretch, or the opening. A new run starts
 * whenever the owner changes, so two sections' stretches never run together under one heading.
 */
export function lineGroups(lines: readonly SpokenLine[]): LineGroup[] {
  const out: LineGroup[] = [];
  lines.forEach((line, at) => {
    const last = out.at(-1);
    if (last && last.first.item === line.item) last.lines.push({ at, line });
    else out.push({ first: line, lines: [{ at, line }] });
  });
  return out;
}

/** The basis a line was read from: its parse and index, and each scene's and item's id then. */
export interface LineBasis {
  doc: Doc;
  index: SceneIndex;
  ids: readonly string[];
  items: readonly string[];
}

/** The script as it is now: an item by its id, and where its first scene or section starts. */
export interface ScriptNow {
  itemById(id: string): OutlineItem | undefined;
  first: number;
}

/**
 * Where a line's Go to puts the cursor (seeing-the-script design §5.7): as far into its owner (a
 * scene, or a section's own stretch, found again by its id) as the cue was in the basis, never
 * past the owner's end; in the opening, where it was, never past the first heading. Text typed in
 * that place since the basis can move the cue a little, so the cursor goes to the start of the line
 * there (`lineStart`), never into the middle of a word. Null when the owner is gone.
 */
export function cueTarget(
  basis: LineBasis,
  line: SpokenLine,
  now: ScriptNow,
  lineStart: (at: number) => number,
): number | null {
  const cue = basis.doc.blocks[line.block]?.span.from;
  if (cue === undefined) return null;
  if (line.item === null) return lineStart(Math.min(cue, now.first));
  const then = basis.index.items[line.item];
  const id = basis.items[line.item];
  const item = id === undefined ? undefined : now.itemById(id);
  if (!then || !item || item.kind !== then.kind) return null;
  const end = item.kind === 'section' ? item.introEnd : item.span.to;
  return lineStart(Math.min(end, item.span.from + (cue - then.span.from)));
}
