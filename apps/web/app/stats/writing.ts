import type { Transaction } from '@codemirror/state';
import { type ComputedRef, computed, effectScope, shallowRef, watch } from 'vue';
import { useEditor } from '../editor/session';
import { appChange } from '../editor/typewriter';
import { db } from '../storage/db';
import { useGuard } from '../storage/guard';
import { useScript } from '../storage/script';
import { useCounts } from './counts';
import { type DayStart, type KnownCounts, useGoal } from './goal';
import type { StatsDay } from './history';
import { dateKey, statsDayKey, statsDaysOf } from './keys';
import { createTimeTracker, type TimeTracker } from './writing-time';

export type { StatsDay };

/** How long after an edit the writing time is kept: at most one write in this long. */
export const WRITE_MS = 5000;

/**
 * Whether a transaction is the writer's own edit: typing, deleting, pasting, undoing, a drag of
 * text. Not the app's (a template block, a fix, a module's change, all marked `appChange`), not a
 * whole text put in (`input.replace`: a reset sample, Start blank, a file reloaded, Revert to
 * Saved), and not a change without a user event (a load).
 */
export function writersEdit(tr: Transaction): boolean {
  if (!tr.docChanged || tr.annotation(appChange) || tr.isUserEvent('input.replace')) return false;
  return ['input', 'delete', 'undo', 'redo', 'move'].some((event) => tr.isUserEvent(event));
}

export interface WritingDeps {
  /** The open script's id, or null before one is open. */
  project(): string | null;
  /** The open script is a sample, a shared record: nothing is kept for it. */
  sample(): boolean;
  /** This tab can't edit the script (another tab has it): nothing is kept here either. */
  readOnly?(): boolean;
  /** The counts as of the last pause in typing. */
  counts(): KnownCounts;
  /** What the day began with: the daily goal's own day start, so there is one record of it. */
  dayStart(): DayStart | null;
  /**
   * Counts the texts loaded into the editor. Another script's text is loaded before it becomes
   * the open one, so in between its counts aren't measured against this script's day start.
   */
  loaded?(): number;
  /** The clock; tests move it. */
  now?(): number;
}

export interface Today {
  /** Writing time today. It changes as the minute shown does (and when it is written), not at every key. */
  ms: number;
  /** Net words added today; null until the day's start is known. */
  words: number | null;
  /** Net pages added today, to one decimal; null until known, and for a Markdown document. */
  pages: number | null;
}

export interface WritingStore {
  /** Today on the open script; null when nothing is kept (a sample, a read-only tab, no script). */
  today: Readonly<ComputedRef<Today | null>>;
  /** The writer edited the script, now. */
  edit(): void;
  /** The stretch of writing ends (the tab is hidden or closing), and what was counted is kept. */
  end(): void;
  /** Keeps what was counted now, not after `WRITE_MS`. */
  flush(): Promise<void>;
  /** Every kept day of the open script, by date, this visit's time included; none for a sample. */
  days(): Promise<Map<string, StatsDay>>;
  /** Settles when what has been asked of the table has been done. */
  settled(): Promise<void>;
  stop(): void;
}

const tenth = (n: number) => Math.round(n * 10) / 10;

/** The part of a stored day that can be used: a damaged field doesn't cost the others. */
function statsDayOf(value: unknown): StatsDay {
  const day: StatsDay = { ms: 0 };
  if (typeof value !== 'object' || value === null) return day;
  const { ms, words, pages } = value as Record<string, unknown>;
  if (typeof ms === 'number' && Number.isFinite(ms) && ms > 0) day.ms = ms;
  if (typeof words === 'number' && Number.isFinite(words)) day.words = words;
  if (typeof pages === 'number' && Number.isFinite(pages)) day.pages = pages;
  return day;
}

/** Milliseconds until the next local midnight. */
function untilMidnight(now: number): number {
  const date = new Date(now);
  return Math.max(
    1,
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() - now,
  );
}

/** The minute a time shows as, and whether it is any time at all: what the status bar can tell apart. */
const shownAs = (ms: number) => (ms <= 0 ? -1 : Math.floor(ms / 60_000));

/**
 * The writing time of the open script, kept per local day (docs/drafter-stats-design.md §2).
 *
 * Time counts while the writer edits (`edit`, told of the writer's own edits only): see
 * `writing-time.ts` for the stretches. Each day is a row in the `settings` table,
 * `stats-day:<id>:<date>`, holding the time and the day's growth (the counts now, less the daily
 * goal's start of the day), written `WRITE_MS` after an edit, when the stretch ends, and when
 * another script opens. Nothing is kept for a sample or in a read-only tab.
 *
 * Like the goal, it is a convenience: a table that can't be read or written leaves the time
 * counting for this visit.
 */
export function createWritingStats(deps: WritingDeps): WritingStore {
  const now = deps.now ?? (() => Date.now());
  const loaded = deps.loaded ?? (() => 0);
  const scope = effectScope(true);

  interface Current {
    /** The script whose time is kept; null for none. */
    id: string | null;
    tracker: TimeTracker;
    /** The day rows read when it opened (today's), which this visit's time adds to. */
    stored: Map<string, StatsDay>;
    /** The load this script's text came with: counts after another load are not its own. */
    load: number;
    /** The growth as last measured on this script's own text. */
    growth: Pick<StatsDay, 'words' | 'pages'> | null;
  }

  const tracked = () =>
    deps.project() !== null && !deps.sample() && !(deps.readOnly?.() ?? false)
      ? deps.project()
      : null;

  const fresh = (id: string | null): Current => ({
    id,
    tracker: createTimeTracker(),
    stored: new Map(),
    load: loaded(),
    growth: null,
  });
  let current = fresh(null);
  /** Moves when `today` should be looked at again: a new minute shown, a write, a new day, a read. */
  const version = shallowRef(0);
  let shown = -1;
  let tail: Promise<unknown> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let midnight: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  function queue<T>(work: () => Promise<T>): Promise<T> {
    const result = tail.then(work);
    tail = result.catch(() => {});
    return result;
  }

  /** Today's growth on the open script, or null when the counts or the day's start aren't known. */
  function growthNow(): Pick<StatsDay, 'words' | 'pages'> | null {
    const start = deps.dayStart();
    if (!start || loaded() !== current.load) return null;
    const counts = deps.counts();
    const growth: Pick<StatsDay, 'words' | 'pages'> = {};
    if (start.words !== undefined && counts.words !== null)
      growth.words = counts.words - start.words;
    if (start.pages !== undefined && counts.pages !== null) {
      growth.pages = tenth(counts.pages - start.pages);
    }
    return Object.keys(growth).length === 0 ? null : growth;
  }

  function msToday(of: Current): number {
    const date = dateKey(new Date(now()));
    return (of.stored.get(date)?.ms ?? 0) + (of.tracker.counted().get(date) ?? 0);
  }

  function look() {
    shown = shownAs(msToday(current));
    version.value++;
  }

  /** Writes what `of` has counted since it was last written, with today's growth. */
  function write(of: Current): Promise<void> {
    const id = of.id;
    if (id === null) return Promise.resolve();
    const due = of.tracker.take();
    const today = dateKey(new Date(now()));
    const growth = of.growth;
    // Today's growth is kept with its time, also when no time is new (a pause at the end of a stretch).
    if (growth && (of.tracker.counted().get(today) ?? 0) > 0 && !due.has(today)) due.set(today, 0);
    if (due.size === 0) return Promise.resolve();
    return queue(async () => {
      try {
        await db.transaction('rw', db.settings, async () => {
          for (const [date, ms] of due) {
            const key = statsDayKey(id, date);
            const row = statsDayOf((await db.settings.get(key))?.value);
            const next: StatsDay = { ...row, ms: Math.max(0, row.ms + ms) };
            if (date === today && growth) Object.assign(next, growth);
            await db.settings.put({ key, value: next });
          }
        });
      } catch {
        // Held for this visit: the time shown still counts it.
      }
    });
  }

  function flush(): Promise<void> {
    clearTimeout(timer);
    timer = undefined;
    const done = write(current);
    if (current.id !== null) look();
    return done;
  }

  /** Another script (or none) is the open one: the last one's time is kept, and this one's read. */
  function open(id: string | null) {
    const last = current;
    last.tracker.end();
    clearTimeout(timer);
    timer = undefined;
    void write(last);
    current = fresh(id);
    look();
    if (id === null) return;
    const mine = current;
    const date = dateKey(new Date(now()));
    void queue(async () => {
      try {
        const row = await db.settings.get(statsDayKey(id, date));
        if (row) mine.stored.set(date, statsDayOf(row.value));
      } catch {
        // Counted from nothing for this visit.
      }
      if (mine === current) look();
    });
  }

  function arm() {
    clearTimeout(midnight);
    if (stopped) return;
    midnight = setTimeout(() => {
      look();
      arm();
    }, untilMidnight(now()));
  }

  scope.run(() => {
    watch(tracked, open, { flush: 'sync', immediate: true });
    // The growth is measured as it changes, while the counts are this script's, so a switch writes
    // the last script's as it was.
    watch(
      growthNow,
      (growth) => {
        if (growth) current.growth = growth;
      },
      { flush: 'sync', immediate: true },
    );
  });
  arm();

  const today = computed<Today | null>(() => {
    version.value;
    if (current.id === null) return null;
    const growth = growthNow();
    return {
      ms: msToday(current),
      words: growth?.words ?? null,
      pages: growth?.pages ?? null,
    };
  });

  function edit() {
    if (stopped || current.id === null) return;
    current.tracker.edit(now());
    if (shownAs(msToday(current)) !== shown) look();
    timer ??= setTimeout(() => void flush(), WRITE_MS);
  }

  async function days(): Promise<Map<string, StatsDay>> {
    await flush();
    const id = current.id;
    const kept = new Map<string, StatsDay>();
    if (id === null) return kept;
    await queue(async () => {
      try {
        const rows = await db.settings
          .where('key')
          .between(...statsDaysOf(id))
          .toArray();
        for (const row of rows) kept.set(row.key.slice(-10), statsDayOf(row.value));
      } catch {
        // None to show.
      }
    });
    return kept;
  }

  return {
    today,
    edit,
    end: () => {
      current.tracker.end();
      void flush();
    },
    flush,
    days,
    settled: async () => {
      let seen: Promise<unknown>;
      do {
        seen = tail;
        await seen;
      } while (seen !== tail);
    },
    stop: () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(midnight);
      scope.stop();
    },
  };
}

let shared: WritingStore | undefined;

/** The open script's writing time: created on first use in the browser, kept for the visit. */
export function useWritingStats(): WritingStore {
  if (!shared) {
    const { project } = useScript();
    const guard = useGuard();
    const editor = useEditor();
    const counts = useCounts();
    const goal = useGoal();
    shared = createWritingStats({
      project: () => project.value?.id ?? null,
      sample: () => !!project.value?.sample,
      readOnly: () => guard.readOnly.value,
      counts: () => counts.steady.value,
      dayStart: () => goal.dayStart.value,
      loaded: () => editor.loaded.value,
    });
    // Only the writer's own edits count: not a template block, a fix, a reset, or a file reloaded.
    editor.onEdit((transactions) => {
      if (transactions.some(writersEdit)) shared?.edit();
    });
    // Hiding or closing the page ends the stretch at its last edit, and keeps it.
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) shared?.end();
      });
      window.addEventListener('pagehide', () => shared?.end());
    }
  }
  return shared;
}
