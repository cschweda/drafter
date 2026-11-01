// The page axis every chart on the story map shares (design §2.5, §10.1): each scene placed end to
// end in order, as wide as it runs, with fixed slots for an empty act and for a play's interval,
// and the unwritten tail at the end. Positions are percentages of the chart's width, so an SVG
// with no viewBox stretches to any width while its text stays crisp.

import { STORY_MAP_LIMITS } from '../model';
import type { StoryMap } from '../types';

/** A drawn span, in percent of the chart's width. */
export interface Placed {
  x: number;
  w: number;
}

export interface Slot extends Placed {
  kind: 'interval' | 'empty';
  /** The act it follows (an interval; 0 within one act or none) or is (an empty act). */
  act: number;
}

export interface Axis {
  /** One per scene, by index: where it starts and how wide it runs (unclamped); a planned one a page. */
  scenes: Placed[];
  slots: Slot[];
  /** The planned length still to write, after the last scene; null when none or finished. */
  tail: Placed | null;
  /** Where each act after the first starts, when the writer set two acts or more. */
  starts: Array<{ act: number; x: number }>;
  /** The pages the axis spans: the scenes, or the planned length when that is more. */
  pages: number;
  /** No scene has a length: they are drawn evenly, and pages aren't named. */
  even: boolean;
  /** The x of a page on the axis (slots before it pushed in). */
  at(page: number): number;
}

/**
 * Below this a draft is early (my call, story-map Task 5): fewer than 10 pages or 6 written
 * scenes. An early draft keeps its shape simple: no act band, act labels as small markers.
 */
export const EARLY_DRAFT = Object.freeze({
  pages: STORY_MAP_LIMITS.earlyPages,
  scenes: STORY_MAP_LIMITS.earlyScenes,
} as const);

/** Whether the draft is too small to divide into big act blocks (maintainer, 2026-11-01). */
export function isEarlyDraft(map: StoryMap): boolean {
  const written = map.scenes.filter((s) => !s.planned).length;
  return map.facts.pages < EARLY_DRAFT.pages || written < EARLY_DRAFT.scenes;
}

/** Acts the writer set: two or more. One act, or none, is one run of scenes. */
export const hasActs = (map: StoryMap) => map.acts.length >= 2;

/** Big act blocks: acts the writer set, and enough written to show them. */
export const showsBand = (map: StoryMap) => hasActs(map) && !isEarlyDraft(map);

/** The width of an interval slot and of an empty act's, in percent; together at most 30. */
const INTERVAL = 3;
const EMPTY = 8;
const MAX_SLOTS = 30;

/** A scene's length in pages: never negative, never NaN. */
const spanOf = (from: number, to: number) =>
  Number.isFinite(to - from) ? Math.max(0, to - from) : 0;

/**
 * Lays the map's scenes out end to end in their order, from their lengths (not their stored
 * positions, which Finished leaves with holes where planned scenes were).
 */
export function axisOf(map: StoryMap): Axis {
  const wip = map.status !== 'finished';
  const acts = hasActs(map);
  type Item =
    | { kind: 'scene'; s: number; pages: number }
    | { kind: 'slot'; slot: 'interval' | 'empty'; act: number }
    | { kind: 'start'; act: number }
    | { kind: 'tail'; pages: number };
  const items: Item[] = [];
  // A planned scene is drawn as a one-page placeholder (design §6.1), out of the planned length.
  let lengths = map.scenes.map((s) =>
    s.planned && wip ? Math.max(1, spanOf(s.from, s.to)) : spanOf(s.from, s.to),
  );
  let written = lengths.reduce((a, b) => a + b, 0);
  const planned = map.gaps.tail && wip ? map.gaps.tail.to : 0;
  // Nothing with a length at all: the scenes share the width evenly, and no ruler names pages.
  const even = written <= 0 && !(planned > 0);
  if (even) {
    lengths = lengths.map(() => 1);
    written = lengths.length;
  }
  const pages = Math.max(written, Number.isFinite(planned) ? planned : 0);
  const tailPages = pages - written;
  const lastScene = map.scenes.length - 1;

  // Within one act or none, the interval goes after the scene the writer marked.
  const ivScene =
    map.interval && map.interval.afterAct === null && map.interval.afterScene > 0
      ? map.interval.afterScene - 1
      : -1;
  const pushScene = (s: number) => {
    items.push({ kind: 'scene', s, pages: lengths[s] ?? 0 });
    if (s === lastScene && tailPages > 0) items.push({ kind: 'tail', pages: tailPages });
    if (s === ivScene && s < lastScene) items.push({ kind: 'slot', slot: 'interval', act: 0 });
  };
  if (acts) {
    const seen = new Set<number>();
    map.acts.forEach((act, a) => {
      if (a > 0) items.push({ kind: 'start', act: act.n });
      if (act.scenes.length === 0) {
        if (wip) items.push({ kind: 'slot', slot: 'empty', act: act.n });
      } else {
        for (const s of act.scenes) {
          seen.add(s);
          pushScene(s);
        }
      }
      if (map.interval?.afterAct === act.n && a < map.acts.length - 1) {
        items.push({ kind: 'slot', slot: 'interval', act: act.n });
      }
    });
    // Anything no act holds (never, from the model) still gets drawn, at the end.
    map.scenes.forEach((_, s) => {
      if (!seen.has(s)) pushScene(s);
    });
  } else {
    map.scenes.forEach((_, s) => {
      pushScene(s);
    });
  }
  if (map.scenes.length === 0 && tailPages > 0) items.push({ kind: 'tail', pages: tailPages });

  const slotCount = (kind: 'interval' | 'empty') =>
    items.filter((i) => i.kind === 'slot' && i.slot === kind).length;
  let intervalW = INTERVAL;
  let emptyW = EMPTY;
  const wanted = slotCount('interval') * intervalW + slotCount('empty') * emptyW;
  if (wanted > MAX_SLOTS) {
    intervalW *= MAX_SLOTS / wanted;
    emptyW *= MAX_SLOTS / wanted;
  }
  const slotTotal = Math.min(MAX_SLOTS, wanted);
  const scale = pages > 0 ? (100 - slotTotal) / pages : 0;

  const scenes: Placed[] = map.scenes.map(() => ({ x: 0, w: 0 }));
  const slots: Slot[] = [];
  const starts: Axis['starts'] = [];
  const anchors: Array<{ page: number; w: number }> = [];
  let tail: Placed | null = null;
  let page = 0;
  let off = 0;
  for (const item of items) {
    const x = page * scale + off;
    if (item.kind === 'scene') {
      scenes[item.s] = { x, w: item.pages * scale };
      page += item.pages;
    } else if (item.kind === 'tail') {
      tail = { x, w: item.pages * scale };
      page += item.pages;
    } else if (item.kind === 'start') {
      starts.push({ act: item.act, x });
    } else {
      const w = item.slot === 'interval' ? intervalW : emptyW;
      slots.push({ kind: item.slot, act: item.act, x, w });
      anchors.push({ page, w });
      off += w;
    }
  }
  const at = (p: number) =>
    p * scale + anchors.filter((a) => a.page < p).reduce((n, a) => n + a.w, 0);
  return { scenes, slots, tail, starts, pages, even, at };
}

/** The narrowest a block is drawn: a sliver, so every scene shows (design §10.4). */
export const MIN_WIDTH = STORY_MAP_LIMITS.minWidth * 100;

/** A percentage for an SVG attribute: three decimals at most, never negative zero. */
export const pct = (n: number) => `${Number((Math.max(0, n) || 0).toFixed(3))}%`;

/**
 * A scene block as drawn: at least the sliver, a hair narrower than its span when it is wide
 * enough to leave a gap between it and the next.
 */
export function drawn(span: Placed): Placed {
  const gutter = span.w > 0.6 ? 0.15 : 0;
  return { x: span.x, w: Math.max(MIN_WIDTH, span.w - gutter) };
}

/**
 * Labels along a chart (ruler numbers, act markers), each kept only when it can't touch one kept
 * before it. Widths are estimated for Courier Prime at 11 px on the narrowest chart a phone shows
 * (about 270 px), so labels kept here never overlap at 390 px or wider.
 */
export interface Label {
  x: number;
  text: string;
}

const CHART_PX = 270;
const CHAR_PX = 6.7;
const GAP = 1.5;

export function placeLabels(
  wanted: readonly Label[],
): Array<Label & { anchor: 'start' | 'middle' | 'end'; from: number; to: number }> {
  const kept: Array<Label & { anchor: 'start' | 'middle' | 'end'; from: number; to: number }> = [];
  for (const label of wanted) {
    const w = (Array.from(label.text).length * CHAR_PX * 100) / CHART_PX;
    let anchor: 'start' | 'middle' | 'end' = 'middle';
    let from = label.x - w / 2;
    let to = label.x + w / 2;
    if (from < 0) [anchor, from, to] = ['start', label.x, label.x + w];
    if (to > 100) [anchor, from, to] = ['end', label.x - w, label.x];
    if (kept.some((k) => from < k.to + GAP && to > k.from - GAP)) continue;
    kept.push({ ...label, anchor, from, to });
  }
  return kept.sort((a, b) => a.x - b.x);
}

/** The page numbers a ruler names: about five at most, at a round step. */
export function rulerSteps(pages: number): { step: number; tick: number } {
  const steps = [5, 10, 20, 30, 60, 120, 300, 600, 1200];
  const step = steps.find((s) => pages / s <= 5) ?? Math.ceil(pages / 5);
  return { step, tick: step >= 30 ? step / 3 : step >= 10 ? step / 2 : step };
}
