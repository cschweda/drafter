import { sameScene } from './match';
import type { ScenePrint, SceneSlot } from './print';

// Deleted scenes (version-history design §3.1 and §3.3).

/** A past version's scenes, as the history worker reads them. */
export interface PastSnapshot {
  id: string;
  /** When it was taken, in milliseconds. */
  at: number;
  slots: readonly SceneSlot[];
}

/** One scene of the past that no scene now matches, across every version that held it. */
export interface DeletedScene {
  /** The hash of its newest version: stable while that version is its newest. */
  key: string;
  /** Its newest version, and the snapshot it is from (the newest that held it). */
  newest: { snapshot: string; at: number; slot: SceneSlot; print: ScenePrint };
  /** How many snapshots held a version of it. */
  versions: number;
  /** When the oldest of them was taken. */
  oldestAt: number;
}

/** An entry as it is built: its newest version, and the version most recently added to it. */
interface Building {
  entry: DeletedScene;
  latest: ScenePrint;
  /** The last snapshot counted in `versions`, so a snapshot counts once. */
  counted: string;
  /** Its place in the order entries were started, which decides between two it matches. */
  order: number;
}

/**
 * Items filed by what `sameScene` needs two versions to share before it can match them: the
 * hash, the heading key, or a value in both sketches. Every rule but the first two needs one
 * (J above 0 needs a hash in both sketches, as does C above 0), so the items filed with any of
 * a version's are every one it could match, and usually a handful.
 */
class Candidates<T> {
  private readonly byHash = new Map<string, T[]>();
  private readonly byKey = new Map<string, T[]>();
  private readonly bySketch = new Map<number, T[]>();

  add(print: ScenePrint, item: T): void {
    file(this.byHash, print.hash, item);
    file(this.byKey, print.headingKey, item);
    for (const value of print.sketch) file(this.bySketch, value, item);
  }

  /** Every item filed with one of `print`'s, once each. */
  of(print: ScenePrint): Set<T> {
    const out = new Set<T>(this.byHash.get(print.hash));
    for (const item of this.byKey.get(print.headingKey) ?? []) out.add(item);
    for (const value of print.sketch)
      for (const item of this.bySketch.get(value) ?? []) out.add(item);
    return out;
  }
}

function file<K, T>(map: Map<K, T[]>, key: K, item: T): void {
  const list = map.get(key);
  if (!list) map.set(key, [item]);
  else if (list[list.length - 1] !== item) list.push(item);
}

/**
 * Every scene in `snapshots` that matches no scene in `now` (Call 2: many to one), one entry
 * per scene however many versions held it, newest deleted first (Call 7). `snapshots` are
 * newest first; `prints` holds every hash their slots name.
 *
 * Each distinct version is resolved once, against only the scenes now it could match (by hash,
 * heading key, or a sketch value in common). A deleted version joins the first entry started
 * whose newest or most recently added version it matches, again looked for among only those
 * that could match, else starts one. So the work grows with the versions, not their square.
 */
export function deletedScenes(
  snapshots: readonly PastSnapshot[],
  prints: ReadonlyMap<string, ScenePrint>,
  now: readonly ScenePrint[],
): DeletedScene[] {
  const nowCandidates = new Candidates<ScenePrint>();
  for (const p of now) nowCandidates.add(p, p);
  /** Whether each distinct version is present now. */
  const present = new Map<string, boolean>();
  const isPresent = (print: ScenePrint): boolean => {
    let found = present.get(print.hash);
    if (found === undefined) {
      found = false;
      for (const p of nowCandidates.of(print)) {
        if (p.hash === print.hash || sameScene(print, p)) {
          found = true;
          break;
        }
      }
      present.set(print.hash, found);
    }
    return found;
  };

  const building: Building[] = [];
  const entries = new Candidates<Building>();
  /** Which entry each deleted version joined. */
  const joined = new Map<string, Building>();
  for (const snapshot of snapshots) {
    for (const slot of snapshot.slots) {
      const print = prints.get(slot.hash);
      if (!print || isPresent(print)) continue;
      let into = joined.get(print.hash);
      if (!into) {
        into = [...entries.of(print)]
          .sort((a, b) => a.order - b.order)
          .find((b) => sameScene(print, b.entry.newest.print) || sameScene(print, b.latest));
        if (into) {
          into.latest = print;
        } else {
          into = {
            entry: {
              key: print.hash,
              newest: { snapshot: snapshot.id, at: snapshot.at, slot, print },
              versions: 0,
              oldestAt: snapshot.at,
            },
            latest: print,
            counted: '',
            order: building.length,
          };
          building.push(into);
        }
        // Filed under this version too, as it is now the one a later version is matched with.
        entries.add(print, into);
        joined.set(print.hash, into);
      }
      if (into.counted !== snapshot.id) {
        into.counted = snapshot.id;
        into.entry.versions++;
        into.entry.oldestAt = Math.min(into.entry.oldestAt, snapshot.at);
      }
    }
  }
  return building
    .map((b) => b.entry)
    .sort((a, b) => b.newest.at - a.newest.at || a.newest.slot.ordinal - b.newest.slot.ordinal);
}
