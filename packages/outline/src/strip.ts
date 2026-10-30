import type { Layout } from '@drafter/layout';
import type { Scene, SceneIndex, Section } from './types';

// The Structure strip's geometry (docs/drafter-structure-strip-design.md §3): a row per section
// depth the script uses, then the scenes, along one axis of pages (or of printed words, without a
// layout). Pure, and one pass over the scene index.

/** Sections deeper than `###` are not drawn (the Outline still lists them). */
export const STRIP_DEPTHS = 3;

export interface StripBlock {
  kind: 'section' | 'scene';
  /** The item's block index, which the app maps to its session id. */
  block: number;
  /** On the axis: pages from the top of page 1, or words when the unit is `words`. */
  from: number;
  /** At least `from`; a section with no scenes has `to === from` (a tick). */
  to: number;
  /** "12 INT. KITCHEN - NIGHT" (the locked number, else the ordinal), or the section's title. */
  label: string;
  /** A scene's color note value, lowercased; null for a section or a scene with none. */
  color: string | null;
}

export interface StripRow {
  kind: 'section' | 'scenes';
  /** 1–3 for a section row, null for the scenes. */
  depth: number | null;
  blocks: StripBlock[];
}

export interface Strip {
  unit: 'pages' | 'words';
  /** The first scene's `from`. */
  start: number;
  /** The last scene's `to` less `start`; above 0 whenever `rows` isn't empty. */
  length: number;
  /** Section rows by depth (only the depths used), then the scenes; [] with no scenes. */
  rows: StripRow[];
}

export interface RulerMark {
  page: number;
  /** 0–1 along the axis. */
  at: number;
  numbered: boolean;
}

/** A body page's line count (the first page numbered above 0), or null without a layout. */
export function linesPerPage(layout: Layout | null | undefined): number | null {
  if (!layout) return null;
  const body = layout.pages.find((page) => page.number > 0) ?? layout.pages[0];
  const lines = body?.lines.length ?? 0;
  return lines > 0 ? lines : null;
}

const sceneLabel = (scene: Scene) =>
  `${scene.number ?? scene.ordinal} ${scene.heading || 'Untitled scene'}`;
const sectionLabel = (section: Section) => section.title || 'Untitled section';

/** Each scene's place on the axis by pages, or null when any scene has no pages. */
function byPages(scenes: readonly Scene[], perPage: number): Array<[number, number]> | null {
  const starts: number[] = [];
  for (const scene of scenes) {
    if (!scene.pages) return null;
    starts.push(scene.pages.page - 1 + (scene.pages.line - 1) / perPage);
  }
  const spans: Array<[number, number]> = [];
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i] as number;
    const last = scenes[i] as Scene;
    const to =
      i + 1 < starts.length ? (starts[i + 1] as number) : from + (last.pages?.eighths ?? 1) / 8;
    // A scene that prints nothing starts where the next one does; pages can't size it.
    if (!(to > from)) return null;
    spans.push([from, to]);
  }
  return spans;
}

/** Each scene's place on the axis by printed words, at least one each, end to end from 0. */
function byWords(scenes: readonly Scene[]): Array<[number, number]> {
  let at = 0;
  return scenes.map((scene) => {
    const from = at;
    at += Math.max(1, scene.words);
    return [from, at];
  });
}

/** The strip of `index`; by pages when `perPage` is given and every scene has pages, else by words. */
export function structureStrip(index: SceneIndex, perPage: number | null): Strip {
  const { scenes, sections } = index;
  const paged = perPage !== null && perPage > 0 ? byPages(scenes, perPage) : null;
  const unit = paged ? 'pages' : 'words';
  if (scenes.length === 0) return { unit, start: 0, length: 0, rows: [] };
  const spans = paged ?? byWords(scenes);
  const start = (spans[0] as [number, number])[0];
  const end = (spans[spans.length - 1] as [number, number])[1];

  // Each section's first and last scene, from the scenes' own lists of sections.
  const first = new Map<number, number>();
  const last = new Map<number, number>();
  scenes.forEach((scene, i) => {
    for (const block of scene.sections) {
      if (!first.has(block)) first.set(block, i);
      last.set(block, i);
    }
  });

  const byDepth = new Map<number, StripBlock[]>();
  let next = 0; // the first scene after the section, in source order
  for (const section of sections) {
    while (next < scenes.length && (scenes[next] as Scene).block < section.block) next++;
    if (section.depth > STRIP_DEPTHS) continue;
    const a = first.get(section.block);
    const b = last.get(section.block);
    const tick = next < scenes.length ? (spans[next] as [number, number])[0] : end;
    const from = a === undefined ? tick : (spans[a] as [number, number])[0];
    const to = b === undefined ? tick : (spans[b] as [number, number])[1];
    const row = byDepth.get(section.depth) ?? [];
    byDepth.set(section.depth, row);
    row.push({
      kind: 'section',
      block: section.block,
      from,
      to,
      label: sectionLabel(section),
      color: null,
    });
  }

  const rows: StripRow[] = [...byDepth.keys()]
    .sort((x, y) => x - y)
    .map((depth) => ({ kind: 'section', depth, blocks: byDepth.get(depth) as StripBlock[] }));
  rows.push({
    kind: 'scenes',
    depth: null,
    blocks: scenes.map((scene, i) => {
      const [from, to] = spans[i] as [number, number];
      return {
        kind: 'scene',
        block: scene.block,
        from,
        to,
        label: sceneLabel(scene),
        color: scene.color?.value ?? null,
      };
    }),
  });
  return { unit, start, length: end - start, rows };
}

/** The page spacings a ruler numbers at, smallest first. */
const STEPS = [1, 2, 5, 10, 20, 50];
/** How far apart, in pixels, the ruler's numbers are meant to be. */
const NUMBER_GAP_PX = 40;
/** The closest pages may be, in pixels, for each to get a tick. */
const TICK_GAP_PX = 6;

/**
 * One mark per page on the axis when pages are at least 6 px apart (else only numbered ones),
 * numbered at 1 and then every step of 1, 2, 5, 10, 20, or 50 pages, the one whose numbers fall
 * nearest 40 px apart. [] for words. A page's mark is at its top, or at the axis' start for the
 * page the axis starts in.
 */
export function rulerMarks(strip: Strip, widthPx: number): RulerMark[] {
  if (strip.unit !== 'pages' || !(strip.length > 0) || !(widthPx > 0)) return [];
  const pxPerPage = widthPx / strip.length;
  let step = STEPS[0] as number;
  for (const s of STEPS) {
    if (Math.abs(s * pxPerPage - NUMBER_GAP_PX) <= Math.abs(step * pxPerPage - NUMBER_GAP_PX)) {
      step = s;
    }
  }
  const ticks = pxPerPage >= TICK_GAP_PX;
  const end = strip.start + strip.length;
  const marks: RulerMark[] = [];
  for (let page = Math.floor(strip.start) + 1; page - 1 < end; page++) {
    const numbered = page === 1 || page % step === 0;
    if (!numbered && !ticks) continue;
    marks.push({ page, at: Math.max(0, (page - 1 - strip.start) / strip.length), numbered });
  }
  return marks;
}
