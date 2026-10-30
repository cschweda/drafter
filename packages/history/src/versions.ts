import type { PastSnapshot } from './deleted';
import { sameScene, similarity } from './match';
import type { ScenePrint, SceneSlot } from './print';

// History of this scene (version-history design §6.1, Calls 28 and 29).

/** One distinct version of a scene: consecutive snapshots that held the same hash. */
export interface SceneVersion {
  hash: string;
  /** The snapshots that held it, newest first. */
  snapshots: string[];
  newestAt: number;
  oldestAt: number;
  /** Where it was in the newest of them. */
  slot: SceneSlot;
  /** Its heading, as the print has it (a renamed scene's older versions have their own). */
  heading: string;
  /** Its printed words, for the change in words against the version before. */
  words: number;
}

/** A version, or a run of snapshots that held no version of the scene ("Not in this version"). */
export type VersionRow = SceneVersion | { gap: true; snapshots: string[] };

/**
 * The versions of the scene `start` (the scene now), walking `snapshots` newest first. In each,
 * the scene's version is the best match (§3.2) to the version found in the next newer snapshot,
 * else to `start`: the highest Jaccard, then the same heading, then the nearest place. Chaining
 * so follows a scene renamed and rewritten a little at a time (Call 28). A snapshot without a
 * match is a gap, and the walk goes on from the last version found. Consecutive snapshots with
 * the same version are one row (Call 29). Matching is `sameScene`, both ways, so an empty version
 * of the scene (emptied, or a heading written first) is one of its versions; only Deleted scenes
 * reads it one way (`coveredBy`).
 */
export function sceneVersions(
  start: ScenePrint,
  snapshots: readonly PastSnapshot[],
  prints: ReadonlyMap<string, ScenePrint>,
): VersionRow[] {
  const rows: VersionRow[] = [];
  let current = start;
  let ordinal: number | null = null;
  /** Each hash's Jaccard with `current` when they match, else -1; cleared when `current` changes. */
  let scores = new Map<string, number>();
  const score = (print: ScenePrint): number => {
    let found = scores.get(print.hash);
    if (found === undefined) {
      // The same version beats any estimate.
      if (print.hash === current.hash) found = 2;
      else found = sameScene(current, print) ? similarity(current, print).jaccard : -1;
      scores.set(print.hash, found);
    }
    return found;
  };

  for (const snapshot of snapshots) {
    let best: { slot: SceneSlot; print: ScenePrint; score: number } | null = null;
    for (const slot of snapshot.slots) {
      const print = prints.get(slot.hash);
      if (!print) continue;
      const s = score(print);
      if (s < 0) continue;
      if (!best || better(s, print, slot, best, current, ordinal)) best = { slot, print, score: s };
    }
    const last = rows[rows.length - 1];
    if (!best) {
      if (last && 'gap' in last) last.snapshots.push(snapshot.id);
      else rows.push({ gap: true, snapshots: [snapshot.id] });
      continue;
    }
    if (last && !('gap' in last) && last.hash === best.print.hash) {
      last.snapshots.push(snapshot.id);
      last.oldestAt = snapshot.at;
    } else {
      rows.push({
        hash: best.print.hash,
        snapshots: [snapshot.id],
        newestAt: snapshot.at,
        oldestAt: snapshot.at,
        slot: best.slot,
        heading: best.print.heading,
        words: best.print.words,
      });
    }
    ordinal = best.slot.ordinal;
    if (best.print.hash !== current.hash) {
      current = best.print;
      scores = new Map();
    }
  }
  return rows;
}

/** Whether a candidate beats the best so far: a higher score, then the same heading, then nearer. */
function better(
  score: number,
  print: ScenePrint,
  slot: SceneSlot,
  best: { slot: SceneSlot; print: ScenePrint; score: number },
  current: ScenePrint,
  ordinal: number | null,
): boolean {
  if (score !== best.score) return score > best.score;
  const same = print.headingKey === current.headingKey;
  const bestSame = best.print.headingKey === current.headingKey;
  if (same !== bestSame) return same;
  if (ordinal === null) return false;
  return Math.abs(slot.ordinal - ordinal) < Math.abs(best.slot.ordinal - ordinal);
}
