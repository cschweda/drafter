import { Candidates } from './candidates';
import { coveredBy, sameScene } from './match';
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
 * Every scene in `snapshots` that no scene in `now` covers (`coveredBy`, Call 2: many to one): an
 * empty scene now covers only an empty past one, so a bare heading never hides a cut. One entry
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
        if (coveredBy(print, p)) {
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
