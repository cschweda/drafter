import { parse, type TextChange } from '@drafter/fountain';
import { bodyEnd, lineBreakOf } from '@drafter/outline';
import { sameScene, similarity } from './match';
import type { ScenePrint, SceneSlot } from './print';

// Put back (version-history design §3.5, Call 11): where a deleted scene goes in the script now,
// and the text change that puts it there.

/**
 * Where a scene is put back: after the scene now matching its old previous scene, before the
 * one matching its old next scene, or at the end. `anchor` is that scene's heading, for the
 * message ("Put back … after …").
 */
export type Place =
  | { at: number; side: 'after' | 'before'; anchor: string }
  | { at: number; side: 'end'; anchor: null };

/** A scene in the script now, with its span. */
export interface NowScene {
  print: ScenePrint;
  from: number;
  to: number;
}

/**
 * Where the scene at `index` of `snapshot` goes back (Call 11). It anchors on its old previous
 * scene P, after the scene now matching P; or, when a section heading came right before it (it
 * opened an act), on its old next scene N, before the scene now matching N. If that neighbour
 * has no match now, the other is tried, then the next ones out on each side, nearest first,
 * alternating; with none left, it goes at the end (`nowLength`). `prints` holds the snapshot's.
 */
export function putBackPlace(
  snapshot: readonly SceneSlot[],
  index: number,
  prints: ReadonlyMap<string, ScenePrint>,
  nowScenes: readonly NowScene[],
  nowLength: number,
): Place {
  const first = snapshot[index]?.section ? 1 : -1;
  for (let distance = 1; distance < snapshot.length; distance++) {
    for (const k of [index + first * distance, index - first * distance]) {
      const neighbour = snapshot[k];
      const print = neighbour && prints.get(neighbour.hash);
      if (!neighbour || !print) continue;
      const match = matchNow(print, neighbour.ordinal - 1, nowScenes);
      if (!match) continue;
      return k < index
        ? { at: match.to, side: 'after', anchor: match.print.heading }
        : { at: match.from, side: 'before', anchor: match.print.heading };
    }
  }
  return { at: nowLength, side: 'end', anchor: null };
}

/**
 * The scene now that is `print`: one with its hash, else the closest that matches (§3.2), the
 * highest Jaccard first; a tie goes to the one nearest `near`, the neighbour's old place.
 */
function matchNow(
  print: ScenePrint,
  near: number,
  nowScenes: readonly NowScene[],
): NowScene | null {
  let best: NowScene | null = null;
  let bestScore = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  nowScenes.forEach((scene, i) => {
    let score: number;
    if (scene.print.hash === print.hash) score = 2;
    else if (sameScene(print, scene.print)) score = similarity(print, scene.print).jaccard;
    else return;
    const distance = Math.abs(i - near);
    if (score > bestScore || (score === bestScore && distance < bestDistance)) {
      best = scene;
      bestScore = score;
      bestDistance = distance;
    }
  });
  return best;
}

/** Where the script's body ends: after its last block before the settings (`/* drafter`) at the end. */
function endOfBody(text: string): number {
  const doc = parse(text);
  const last = doc.blocks[bodyEnd(doc) - 1];
  const to = last?.span.to ?? doc.titlePage?.span.to ?? 0;
  return to > 0 && text[to - 1] === '\r' ? to - 1 : to;
}

/** How many line breaks `text` ends with (`fromEnd`) or starts with. */
function breaks(text: string, fromEnd: boolean): number {
  const found = fromEnd ? text.match(/(?:\r?\n)*$/) : text.match(/^(?:\r?\n)*/);
  return (found?.[0].match(/\n/g) ?? []).length;
}

/**
 * The change that puts `sceneText` back at `place` in `nowText`: one insertion, in the text's
 * own line breaks, with a blank line on each side (only the line breaks missing are added). At
 * the end, it goes after the last block of the script, before its settings.
 */
export function putBackChanges(nowText: string, place: Place, sceneText: string): TextChange[] {
  const br = lineBreakOf(nowText);
  const scene = sceneText.replace(/\s+$/, '').replace(/\r?\n/g, br);
  const at = place.side === 'end' ? endOfBody(nowText) : place.at;
  const before = nowText.slice(0, at);
  const after = nowText.slice(at);
  const pre = /\S/.test(before) ? br.repeat(Math.max(0, 2 - breaks(before, true))) : '';
  const post = /\S/.test(after) ? br.repeat(Math.max(0, 2 - breaks(after, false))) : '';
  return [{ from: at, to: at, insert: `${pre}${scene}${post}` }];
}
