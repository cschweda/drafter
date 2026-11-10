import { metadataSpan, parse } from '@drafter/fountain';
import {
  applyMarks,
  type Layout,
  type LockedPages,
  type Marks,
  paginate,
  type SceneNumbering,
  type TitlePageMode,
  titlePageFor,
} from '@drafter/layout';
import type { Template } from '@drafter/templates';
import { numbersScenes } from './actions';
import { resolveAnchors } from './anchors';
import { decodeBaseline } from './baseline';
import { readProduction } from './block';
import { productionMarks } from './marks';
import { lockedSceneNumbers } from './numbers';
import type { LockedPage, Production, ProductionSet } from './types';

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
  /** The production's own revision header (`Production.header`); null for the default, or unlocked. */
  header: string | null;
  /**
   * A locked screenplay's scene numbers as shown (`lockedSceneNumbers`), by block index: what the
   * layout prints in its margins, and what the breakdown and the sides call each scene. Null when
   * the script isn't locked (its scenes keep their ordinals), or isn't a screenplay.
   */
  sceneNumbers: ReadonlyMap<number, string> | null;
}

/**
 * A locked script's production and its open set's baseline text; null when it isn't locked, its
 * block can't be read, or its baseline won't decode (the Production tab's "damaged").
 */
async function readLocked(
  meta: Parameters<typeof readProduction>[0],
): Promise<{ production: Production; baseline: string } | null> {
  const production = readProduction(meta);
  if (!production) return null;
  const baseline = await decodeBaseline(production.baseline);
  return baseline === null ? null : { production, baseline };
}

/** `lockedSceneNumbers` for a locked screenplay; null for any other script. */
function sceneNumbersOf(
  blocks: Parameters<typeof lockedSceneNumbers>[0],
  template: Template,
  production: Production,
): Map<number, string> | null {
  return numbersScenes(template) ? lockedSceneNumbers(blocks, production.numbers) : null;
}

/**
 * The scene numbers `productionLayout` gives `source`, without laying it out (the Sides dialog's
 * scene list): a locked screenplay's written numbers and A-numbers; null otherwise.
 */
export async function productionSceneNumbers(
  source: string,
  template: Template,
): Promise<ReadonlyMap<number, string> | null> {
  const doc = parse(source);
  const locked = await readLocked(doc.meta);
  return locked && sceneNumbersOf(doc.blocks, template, locked.production);
}

/**
 * One locked-layout pipeline for the screen and the exports: the script laid out on its locked
 * pages, with its revision marks as `marks` says. Offsets are into the whole source: the marks are
 * found in the text without the `/* drafter *\/` block, which is the last thing in the source, so
 * its offsets before the block are the whole source's. An unlocked script, one whose block can't
 * be read, or one whose baseline won't decode is laid out exactly as `paginate` does, unlocked. A
 * locked screenplay's scenes print their written numbers, and a new one the A-number it will have
 * (`sceneNumbers`), as the Script pane shows them (design §7.1).
 * `titlePage` is an export's choice of how much title page prints (`titlePageFor`); absent, all
 * of it, as the screen shows.
 */
export async function productionLayout(
  source: string,
  template: Template,
  opts: { sceneNumbers: SceneNumbering; marks: MarkChoice; titlePage?: TitlePageMode },
): Promise<ProductionLayoutResult> {
  const { sceneNumbers, marks } = opts;
  const parsed = parse(source);
  const doc =
    opts.titlePage === undefined
      ? parsed
      : { ...parsed, titlePage: titlePageFor(parsed.titlePage, opts.titlePage) };
  const unlocked = (): ProductionLayoutResult => ({
    layout: paginate(doc, template, { sceneNumbers }),
    locked: false,
    open: null,
    sets: [],
    header: null,
    sceneNumbers: null,
  });
  const read = await readLocked(doc.meta);
  if (!read) return unlocked();
  const { production, baseline } = read;
  const numbers = sceneNumbersOf(doc.blocks, template, production);
  const given = numbers ? { numbers } : {};
  const span = metadataSpan(doc);
  const current = span ? source.slice(0, span.from) + source.slice(span.to) : source;

  const sets = production.sets;
  const open = sets.at(-1) ?? null;
  let lockedPages: LockedPages;
  try {
    lockedPages = lockedPagesOf(production.pages, baseline, current);
  } catch (error) {
    // As on the screen: pages that can't be placed are laid out unlocked, with the scenes'
    // numbers still the locked ones.
    console.error(`Locked pages failed: ${error instanceof Error ? error.message : String(error)}`);
    return {
      ...unlocked(),
      layout: paginate(doc, template, { sceneNumbers, ...given }),
      sceneNumbers: numbers,
    };
  }
  let layout = paginate(doc, template, { sceneNumbers, locked: lockedPages, ...given });
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
  return {
    layout,
    locked: true,
    open,
    sets,
    header: production.header ?? null,
    sceneNumbers: numbers,
  };
}
