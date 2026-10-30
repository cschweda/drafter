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
}

/**
 * Every scene in `snapshots` that matches no scene in `now` (Call 2: many to one), one entry
 * per scene however many versions held it, newest deleted first (Call 7). `snapshots` are
 * newest first; `prints` holds every hash their slots name.
 *
 * Each distinct version is resolved once: by hash among the scenes now, then against the
 * scenes now with its heading key, then against all of them. A deleted version joins the
 * entry whose newest or most recently added version it matches, else starts one.
 */
export function deletedScenes(
  snapshots: readonly PastSnapshot[],
  prints: ReadonlyMap<string, ScenePrint>,
  now: readonly ScenePrint[],
): DeletedScene[] {
  const nowHashes = new Set(now.map((p) => p.hash));
  const nowByKey = new Map<string, ScenePrint[]>();
  for (const p of now) {
    const group = nowByKey.get(p.headingKey);
    if (group) group.push(p);
    else nowByKey.set(p.headingKey, [p]);
  }
  /** Whether each distinct version is present now. */
  const present = new Map<string, boolean>();
  const isPresent = (print: ScenePrint): boolean => {
    let found = present.get(print.hash);
    if (found === undefined) {
      found =
        nowHashes.has(print.hash) ||
        (nowByKey.get(print.headingKey) ?? []).some((p) => sameScene(print, p)) ||
        now.some((p) => sameScene(print, p));
      present.set(print.hash, found);
    }
    return found;
  };

  const building: Building[] = [];
  /** Which entry each deleted version joined. */
  const joined = new Map<string, Building>();
  for (const snapshot of snapshots) {
    for (const slot of snapshot.slots) {
      const print = prints.get(slot.hash);
      if (!print || isPresent(print)) continue;
      let into = joined.get(print.hash);
      if (!into) {
        into = building.find(
          (b) => sameScene(print, b.entry.newest.print) || sameScene(print, b.latest),
        );
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
          };
          building.push(into);
        }
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
