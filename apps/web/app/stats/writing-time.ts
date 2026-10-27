import { dateKey } from './keys';

// Active writing time (docs/drafter-stats-design.md §2): time counts while the writer edits. Pure
// timing over the times it is given, so a test moves the clock; `writing.ts` keeps it.

/** A pause with no edit longer than this ends a stretch of writing, and isn't counted. */
export const GAP_MS = 2 * 60_000;
/** The least a stretch counts: one burst of typing is real work, even a single key. */
export const BURST_MS = 30_000;

export interface TimeTracker {
  /** The writer edited the script at `at` (milliseconds, the clock's). */
  edit(at: number): void;
  /** The stretch ends at its last edit: the tab was hidden or closed, or another script opened. */
  end(): void;
  /** The writing time counted so far, by local date (`YYYY-MM-DD`). */
  counted(): ReadonlyMap<string, number>;
  /**
   * What was counted since the last take, by date: what is to be added to the stored days. A day
   * can be negative, when a burst already taken was cut short by the next edit.
   */
  take(): Map<string, number>;
  /** Hands back what a take returned that couldn't be kept (a failed write), so the next take has it again. */
  giveBack(due: ReadonlyMap<string, number>): void;
}

/** The start of the local day after the one `time` falls in. */
function nextMidnight(time: number): number {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
}

/**
 * Counts writing time in stretches. A stretch runs from its first edit to its last, and an edit
 * more than `GAP_MS` after the one before starts a new one. A stretch counts at least `BURST_MS`,
 * but never past the edit that starts the next (after a hidden tab, that can be sooner than the
 * gap), nor past the midnight after its last edit, so a key just before midnight doesn't make the
 * next day one written. The time counted is the span from a stretch's start, so it is split between days at local
 * midnight as it falls.
 */
export function createTimeTracker(): TimeTracker {
  const counted = new Map<string, number>();
  const taken = new Map<string, number>();
  /** The stretch: its first and last edit, and how much of it from the start is counted. */
  let start: number | null = null;
  let last = 0;
  let credited = 0;
  let open = false;

  /** Adds `sign` times the span from `from` to `to` to the days it falls in. */
  function add(from: number, to: number, sign: 1 | -1) {
    let at = from;
    while (at < to) {
      const end = Math.min(to, nextMidnight(at));
      const day = dateKey(new Date(at));
      counted.set(day, (counted.get(day) ?? 0) + sign * (end - at));
      at = end;
    }
  }

  /** Counts the stretch's first `next` milliseconds, adding or taking back the difference. */
  function creditTo(next: number) {
    if (start === null) return;
    if (next > credited) add(start + credited, start + next, 1);
    else if (next < credited) add(start + next, start + credited, -1);
    credited = next;
  }

  /** The stretch's due: first edit to last, or the burst, which stops at the midnight after the last edit. */
  const due = (from: number, to: number) =>
    Math.max(to - from, Math.min(BURST_MS, nextMidnight(to) - from));

  function edit(at: number) {
    if (start !== null && open && at >= last && at - last <= GAP_MS) {
      last = at;
      creditTo(due(start, last));
      return;
    }
    // A new stretch. The last one's burst never reaches past this edit.
    if (start !== null && at >= start && start + credited > at) {
      creditTo(Math.max(last - start, at - start));
    }
    start = at;
    last = at;
    credited = 0;
    open = true;
    creditTo(due(at, at));
  }

  function take(): Map<string, number> {
    const due = new Map<string, number>();
    for (const [day, ms] of counted) {
      const diff = ms - (taken.get(day) ?? 0);
      if (diff !== 0) due.set(day, diff);
      taken.set(day, ms);
    }
    return due;
  }

  function giveBack(returned: ReadonlyMap<string, number>) {
    for (const [day, ms] of returned) taken.set(day, (taken.get(day) ?? 0) - ms);
  }

  return {
    edit,
    giveBack,
    end: () => {
      open = false;
    },
    counted: () => counted,
    take,
  };
}
