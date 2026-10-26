import type { Block, Doc } from '@drafter/fountain';
import type { Layout, Page } from '@drafter/layout';
import { wordsIn } from '../markdown/words';

export interface Counts {
  /**
   * Body pages to one decimal, the title page left out: the full pages, and the last one by how
   * far down it the script runs, so 2 full pages and a last page two-fifths full are 1.4 + 1.
   * 0 without a layout.
   */
  pages: number;
  scenes: number;
  words: number;
  /** Minutes, at a page a minute, to the whole minute. */
  minutes: number;
}

/** Blocks that never print: the outline's sections and synopses, notes, and the boneyard. */
const SILENT = new Set<Block['kind']>(['section', 'synopsis', 'note', 'boneyard', 'page_break']);

const words = new WeakMap<Doc, number>();
const pagesOf = new WeakMap<Layout, number>();
const counted = new WeakMap<Doc, Map<Layout | null, Counts>>();

/** The words of the text that prints: the title page's values and every block that is not silent. */
function wordsOfDoc(doc: Doc): number {
  const known = words.get(doc);
  if (known !== undefined) return known;
  let total = 0;
  if (doc.titlePage) {
    for (const field of doc.titlePage.fields) {
      for (const line of field.runs) total += wordsIn(line.map((run) => run.text).join(''));
    }
  }
  for (const block of doc.blocks) {
    if (SILENT.has(block.kind)) continue;
    for (const line of block.lines) {
      if (line.transparent) continue;
      let text = '';
      for (const run of line.inline) text += run.text;
      total += wordsIn(text);
    }
  }
  words.set(doc, total);
  return total;
}

/** Whether a page's line prints anything. */
const printed = (line: Page['lines'][number]) =>
  !!line.right || line.runs.some((run) => run.text.length > 0);

function pagesOfLayout(layout: Layout): number {
  const known = pagesOf.get(layout);
  if (known !== undefined) return known;
  const body = layout.pages.filter((page) => page.number > 0);
  const last = body.at(-1);
  let pages = 0;
  if (last) {
    let filled = last.lines.length;
    while (filled > 0 && !printed(last.lines[filled - 1] as Page['lines'][number])) filled--;
    pages = body.length - 1 + (last.lines.length > 0 ? filled / last.lines.length : 0);
    pages = Math.round(pages * 10) / 10;
  }
  pagesOf.set(layout, pages);
  return pages;
}

/**
 * The pages, scenes, words, and running time of a script. Words count the text that prints:
 * notes, the boneyard, sections, synopses, and the metadata block (a boneyard) don't count, and
 * the title page's values do. Pages leave out the title page.
 *
 * The layout may lag the text by a moment (it is made in a worker), so pages can be a keystroke
 * behind the words. Both are remembered by the identity of the parse and the layout, so asking
 * again for the same two (the status bar and the panel both do) costs nothing.
 */
export function countScript(doc: Doc, layout: Layout | null): Counts {
  let byLayout = counted.get(doc);
  if (!byLayout) {
    byLayout = new Map();
    counted.set(doc, byLayout);
  }
  const known = byLayout.get(layout);
  if (known) return known;
  const pages = layout ? pagesOfLayout(layout) : 0;
  const result: Counts = {
    pages,
    scenes: doc.blocks.reduce((n, block) => n + (block.kind === 'scene_heading' ? 1 : 0), 0),
    words: wordsOfDoc(doc),
    minutes: Math.round(pages),
  };
  // One layout per parse is the usual case; a lagging layout adds a second.
  if (byLayout.size > 4) byLayout.clear();
  byLayout.set(layout, result);
  return result;
}

/** "Under a minute", "about 1 min", "about 1 h 5 min": the running time, at a page a minute. */
export function runningTime(minutes: number): string {
  if (minutes < 1) return 'Under a minute';
  if (minutes < 60) return `About ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `About ${hours} h` : `About ${hours} h ${rest} min`;
}
