import { createTimeTracker } from '../stats/writing-time';

// When a timed snapshot is due (Phase 2 design §11.1, Call 7): after 10 minutes of active writing,
// as the writing-time tracker counts it (stretches end after a 2-minute pause, stats design §2),
// since the last snapshot of any kind. Pure timing over the times it is given, so a test moves the clock.

export const SNAPSHOT_EVERY_MS = 10 * 60_000;

export interface SnapshotSchedule {
  /** A writer's edit, fed to its own `createTimeTracker`. */
  edit(at: number): void;
  /** The tab hid or the script changed. */
  end(): void;
  /** Active writing since the last snapshot ≥ `SNAPSHOT_EVERY_MS`. */
  due(): boolean;
  /** Any snapshot was taken: the count starts again. */
  taken(): void;
}

export function createSnapshotSchedule(): SnapshotSchedule {
  const tracker = createTimeTracker();
  const total = () => {
    let ms = 0;
    for (const day of tracker.counted().values()) ms += day;
    return ms;
  };
  let since = 0;
  return {
    edit: (at) => tracker.edit(at),
    end: () => tracker.end(),
    due: () => total() - since >= SNAPSHOT_EVERY_MS,
    taken: () => {
      since = total();
    },
  };
}
