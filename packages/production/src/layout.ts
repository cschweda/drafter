import { metadataSpan, parse } from '@drafter/fountain';
import {
  applyMarks,
  type Layout,
  type LockedPages,
  type Marks,
  paginate,
  type SceneNumbering,
} from '@drafter/layout';
import type { Template } from '@drafter/templates';
import { resolveAnchors } from './anchors';
import { decodeBaseline } from './baseline';
import { readProduction } from './block';
import { productionMarks } from './marks';
import type { LockedPage, ProductionSet } from './types';

/**
 * A locked script's pages in `current` (production design §7.2): where each locked page starts now,
 * and each page with no place left folded into the kept page before it, whose label then prints as
 * a range (`13-14`). A page is dropped when its start falls on or before a kept page's start, so
 * the kept page before it in the page map is the one whose start it shares.
 */
export function lockedPagesOf(
  pages: readonly LockedPage[],
  baseline: string,
  current: string,
): LockedPages {
  const { anchors, dropped } = resolveAnchors(pages, baseline, current);
  const gone = new Set(dropped);
  const folded: Array<{ into: string; label: string }> = [];
  let into: string | null = null;
  for (const { label } of pages) {
    if (!gone.has(label)) into = label;
    else if (into !== null) folded.push({ into, label });
  }
  return { anchors, folded };
}

/**
 * Which revision marks a layout carries: `'open'` the open set's only (the full PDF's default,
 * spec §8), `'all'` every set's, open and closed (what the screen shows), or `'none'`.
 */
export type MarkChoice = 'open' | 'all' | 'none';

export interface ProductionLayoutResult {
  /** Locked labels, with revision marks applied per `marks`. */
  layout: Layout;
  locked: boolean;
  /** The open set (for headers); null when the script is not locked. */
  open: ProductionSet | null;
  sets: readonly ProductionSet[];
}

/**
 * One locked-layout pipeline for the screen and the exports: the script laid out on its locked
 * pages, with its revision marks as `marks` says. Offsets are into the whole source: the marks are
 * found in the text without the `/* drafter *\/` block, which is the last thing in the source, so
 * its offsets before the block are the whole source's. An unlocked script, one whose block can't
 * be read, or one whose baseline won't decode is laid out exactly as `paginate` does, unlocked.
 */
export async function productionLayout(
  source: string,
  template: Template,
  opts: { sceneNumbers: SceneNumbering; marks: MarkChoice },
): Promise<ProductionLayoutResult> {
  const { sceneNumbers, marks } = opts;
  const doc = parse(source);
  const unlocked = (): ProductionLayoutResult => ({
    layout: paginate(doc, template, { sceneNumbers }),
    locked: false,
    open: null,
    sets: [],
  });
  const production = readProduction(doc.meta);
  if (!production) return unlocked();
  const baseline = await decodeBaseline(production.baseline);
  if (baseline === null) return unlocked();
  const span = metadataSpan(doc);
  const current = span ? source.slice(0, span.from) + source.slice(span.to) : source;

  const sets = production.sets;
  const open = sets.at(-1) ?? null;
  let lockedPages: LockedPages;
  try {
    lockedPages = lockedPagesOf(production.pages, baseline, current);
  } catch (error) {
    // As on the screen: pages that can't be placed are laid out unlocked.
    console.error(`Locked pages failed: ${error instanceof Error ? error.message : String(error)}`);
    return unlocked();
  }
  let layout = paginate(doc, template, { sceneNumbers, locked: lockedPages });
  if (marks !== 'none' && open) {
    try {
      const found = await productionMarks({
        current,
        baseline,
        open: open.name,
        // A closed set with no marks marks nothing; leaving it out spares fingerprinting every line.
        closed: sets
          .slice(0, -1)
          .filter((set) => (set.lines?.length ?? 0) + (set.gaps?.length ?? 0) > 0),
      });
      const wanted: Marks =
        marks === 'all'
          ? found
          : {
              spans: found.spans.filter((s) => s.set === open.name),
              gaps: found.gaps.filter((g) => g.set === open.name),
            };
      layout = applyMarks(layout, wanted);
    } catch (error) {
      // As on the screen: the locked layout, without marks.
      console.error(
        `Revision marks failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return { layout, locked: true, open, sets };
}
