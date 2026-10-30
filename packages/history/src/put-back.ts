import { parse, type TextChange } from '@drafter/fountain';
import { bodyEnd, lineBreakOf } from '@drafter/outline';
import { sameScene, similarity } from './match';
import { headingKey, type ScenePrint, type SceneSlot, type SectionPlace } from './print';

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
 * opened an act), on its old next scene N, before the scene now matching N, and if N has none,
 * right after that section heading, when a heading of its title is in `nowSections` (so it opens
 * the act again rather than closing the one before). Otherwise, the other neighbour is tried,
 * then the next ones out on each side, nearest first, alternating; with none left, it goes at
 * the end (`nowLength`). `prints` holds the snapshot's.
 */
export function putBackPlace(
  snapshot: readonly SceneSlot[],
  index: number,
  prints: ReadonlyMap<string, ScenePrint>,
  nowScenes: readonly NowScene[],
  nowLength: number,
  nowSections: readonly SectionPlace[] = [],
): Place {
  const slot = snapshot[index];
  const first = slot?.section ? 1 : -1;
  for (let distance = 1; distance < snapshot.length || distance === 1; distance++) {
    for (const k of [index + first * distance, index - first * distance]) {
      const neighbour = snapshot[k];
      const print = neighbour && prints.get(neighbour.hash);
      const match = neighbour && print ? matchNow(print, neighbour.ordinal - 1, nowScenes) : null;
      if (match) {
        return k < index
          ? { at: match.to, side: 'after', anchor: match.print.heading }
          : { at: match.from, side: 'before', anchor: match.print.heading };
      }
      if (distance === 1 && k > index && slot?.sectionTitle !== undefined) {
        const opening = sectionNow(
          slot.sectionTitle,
          nowSections,
          snapshot,
          index,
          prints,
          nowScenes,
        );
        if (opening) return { at: opening.at, side: 'after', anchor: opening.title };
      }
    }
  }
  return { at: nowLength, side: 'end', anchor: null };
}

/**
 * The section heading now with `title`'s key: of several, the first after the scene now
 * matching the old previous scene, if one does, else the first.
 */
function sectionNow(
  title: string,
  nowSections: readonly SectionPlace[],
  snapshot: readonly SceneSlot[],
  index: number,
  prints: ReadonlyMap<string, ScenePrint>,
  nowScenes: readonly NowScene[],
): SectionPlace | null {
  const key = headingKey(title);
  const named = nowSections.filter((s) => headingKey(s.title) === key);
  if (named.length < 2) return named[0] ?? null;
  const previous = snapshot[index - 1];
  const print = previous && prints.get(previous.hash);
  const after = previous && print ? matchNow(print, previous.ordinal - 1, nowScenes)?.to : null;
  return (after != null && named.find((s) => s.at >= after)) || (named[0] as SectionPlace);
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

/**
 * Whether a line (its `\r` aside) is blank: nothing but spaces and tabs. Two spaces alone are
 * not: Fountain keeps such a line, as a blank line inside a speech.
 */
function isBlank(line: string): boolean {
  const text = line.endsWith('\r') ? line.slice(0, -1) : line;
  return text !== '  ' && /^[ \t]*$/.test(text);
}

/**
 * How many line breaks `text` ends with (`fromEnd`) or starts with, through blank lines: the
 * part of a line at the insertion point and every whole line out to the first that isn't
 * blank. Spaces at the insertion point's side don't stop the count.
 */
function breaks(text: string, fromEnd: boolean): number {
  const lines = text.split('\n');
  if (fromEnd) lines.reverse();
  if (!isBlank(lines[0] as string)) return 0;
  let count = 0;
  for (let i = 1; i < lines.length; i++) {
    count++;
    if (!isBlank(lines[i] as string)) break;
  }
  return count;
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
