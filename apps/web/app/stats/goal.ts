import {
  type ComputedRef,
  computed,
  effectScope,
  type Ref,
  readonly,
  shallowRef,
  watch,
} from 'vue';
import { useEditor } from '../editor/session';
import type { DocumentKind } from '../markdown/kind';
import { db } from '../storage/db';
import { useScript } from '../storage/script';
import { useCounts } from './counts';
import { DAY_PREFIX, dayKey, goalKey } from './keys';

export interface Goal {
  unit: 'pages' | 'words';
  target: number;
}

export interface Progress {
  /** Growth since the day began, which a cut counts against; negative when the script is shorter than it was. */
  done: number;
  target: number;
  unit: 'pages' | 'words';
}

/** What a day began with, by unit. A unit is absent until its count was known. */
export interface DayStart {
  pages?: number;
  words?: number;
}

/** The counts as they stand; null is not known yet (the layout hasn't come back, a long Markdown document hasn't been read). */
export interface KnownCounts {
  pages: number | null;
  words: number | null;
}

export interface GoalDeps {
  /** The open script's id, or null before one is open. */
  project(): string | null;
  /** The open script is a sample, which is a shared record and keeps no goal. */
  sample(): boolean;
  kind(): DocumentKind;
  counts(): KnownCounts;
  /** The clock; tests move it. */
  now?(): Date;
}

export interface GoalStore {
  /** The open script's goal; null without one, and always null for a sample. */
  goal: Readonly<Ref<Goal | null>>;
  /** Growth since the day began; null without a goal, or until the day's start is known. */
  progress: Readonly<ComputedRef<Progress | null>>;
  /** A goal can be set: a script of the writer's own is open. */
  canSet: Readonly<ComputedRef<boolean>>;
  /**
   * Sets or (with null) clears the goal, and keeps it in this browser. A goal that can't be held
   * (not a whole number of words, a unit a Markdown document doesn't count) or a sample changes nothing.
   */
  setGoal(goal: Goal | null): Promise<void>;
  /** Looks at the clock now: a new day starts a new count. The timer and every count do this. */
  tick(): void;
  /** Settles when what has been asked of the table has been done. */
  settled(): Promise<void>;
  stop(): void;
}

/** Days of starting counts that are kept. */
export const KEEP_DAYS = 30;

/** The local date, `YYYY-MM-DD`. Local, because a writer's day ends at their midnight. */
export function dateKey(date: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** Whether `goal` is one that can be held: words in whole numbers, pages in tenths. */
export function isGoal(goal: unknown): goal is Goal {
  if (typeof goal !== 'object' || goal === null) return false;
  const { unit, target } = goal as Record<string, unknown>;
  if (typeof target !== 'number' || !Number.isFinite(target)) return false;
  if (unit === 'words') return Number.isInteger(target) && target >= 1 && target <= 1_000_000;
  if (unit === 'pages') {
    return (
      Math.abs(target * 10 - Math.round(target * 10)) < 1e-9 && target >= 0.1 && target <= 1000
    );
  }
  return false;
}

/** The part of a stored day row that can be used: one damaged field doesn't cost the other. */
function dayStartOf(value: unknown): DayStart {
  const start: DayStart = {};
  if (typeof value !== 'object' || value === null) return start;
  const { pages, words } = value as Record<string, unknown>;
  if (typeof pages === 'number' && Number.isFinite(pages)) start.pages = pages;
  if (typeof words === 'number' && Number.isFinite(words)) start.words = words;
  return start;
}

const tenth = (n: number) => Math.round(n * 10) / 10;

/** "1.5 of 3 pages today", "420 of 1,000 words today". A cut below where the day began shows 0. */
export function progressLabel(progress: Progress | null): string {
  if (!progress) return '';
  const done = Math.max(0, progress.done);
  const shown = (n: number) =>
    progress.unit === 'words' ? n.toLocaleString('en-US') : String(tenth(n));
  const noun = progress.unit === 'words' ? 'word' : 'page';
  return `${shown(done)} of ${shown(progress.target)} ${noun}${progress.target === 1 ? '' : 's'} today`;
}

/** The first day whose starting counts are kept, as of `today`. */
function cutoff(today: Date): string {
  return dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - KEEP_DAYS));
}

/** Milliseconds until the next local midnight. */
function untilMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(1, next.getTime() - now.getTime());
}

/**
 * The daily goal of the open script, and how far the day has got toward it.
 *
 * Progress is how much the script has grown since the day began, so cutting a scene counts
 * against it. The day's starting counts are taken lazily: the first time the script is seen on a
 * date, which is when the date changes during a session (a timer at local midnight, and every
 * count, look at the clock). They live in the `settings` table with the goal, in rows the
 * `Settings` shape doesn't know (`goal:<id>`, `day:<id>:<date>`), like a module's storage.
 *
 * It is a convenience, like settings: a table that can't be read or written leaves the goal
 * working for this visit.
 */
export function createGoal(deps: GoalDeps): GoalStore {
  const now = deps.now ?? (() => new Date());
  const goal = shallowRef<Goal | null>(null);
  const start = shallowRef<DayStart | null>(null);
  const scope = effectScope(true);

  /** Names the script and date the state is for; an answer for another is dropped. */
  let current = { project: deps.project(), sample: deps.sample(), date: dateKey(now()) };
  let tail: Promise<unknown> = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  /** Runs `work` after what was asked before it. */
  function queue<T>(work: () => Promise<T>): Promise<T> {
    const result = tail.then(work);
    tail = result.catch(() => {});
    return result;
  }

  /** The script whose goal and days are kept: none for a sample, which is a shared record. */
  const tracked = (): string | null => (current.sample ? null : current.project);
  const sameDay = (mine: typeof current) =>
    current.project === mine.project &&
    current.sample === mine.sample &&
    current.date === mine.date;

  const canSet = computed(() => deps.project() !== null && !deps.sample());

  /** Removes the starting counts of days older than `KEEP_DAYS`, whichever script they were for. */
  async function prune() {
    const oldest = cutoff(now());
    await db.settings
      .where('key')
      .between(DAY_PREFIX, `${DAY_PREFIX}\uffff`)
      .filter((row) => row.key.slice(-10) < oldest)
      .delete();
  }

  /**
   * Takes the start of each unit that is known now and wasn't yet: in this visit at once, and in
   * the table after what is already asked of it. An earlier answer in the table (another tab's)
   * wins over this one.
   */
  function capture() {
    const id = tracked();
    const known = start.value;
    if (id === null || known === null) return;
    const counts = deps.counts();
    const fresh: DayStart = {};
    if (known.pages === undefined && counts.pages !== null) fresh.pages = counts.pages;
    if (known.words === undefined && counts.words !== null) fresh.words = counts.words;
    if (Object.keys(fresh).length === 0) return;
    const mine = { ...current };
    start.value = { ...known, ...fresh };
    void queue(async () => {
      try {
        const key = dayKey(id, mine.date);
        const merged = await db.transaction('rw', db.settings, async () => {
          const row = dayStartOf((await db.settings.get(key))?.value);
          const next: DayStart = { ...fresh, ...row };
          await db.settings.put({ key, value: next });
          return next;
        });
        if (sameDay(mine) && start.value) start.value = { ...start.value, ...merged };
      } catch {
        // Held for this visit.
      }
    });
  }

  /** Another script opened: reads its goal and today's start from the table. */
  function open() {
    const mine = { ...current };
    const id = tracked();
    goal.value = null;
    start.value = null;
    if (id === null) return;
    void queue(async () => {
      let stored: DayStart = {};
      let kept: Goal | null = null;
      try {
        const [goalRow, dayRow] = await Promise.all([
          db.settings.get(goalKey(id)),
          db.settings.get(dayKey(id, mine.date)),
        ]);
        stored = dayStartOf(dayRow?.value);
        kept = isGoal(goalRow?.value) ? goalRow.value : null;
        await prune();
      } catch {
        // Held for this visit.
      }
      if (!sameDay(mine)) return;
      goal.value = kept;
      start.value = stored;
      capture();
    });
  }

  /** The date changed: today's start is what the script holds now, unless another tab took it first. */
  function rollOver() {
    start.value = tracked() === null ? null : {};
    capture();
    void queue(async () => {
      try {
        await prune();
      } catch {
        // Held for this visit.
      }
    });
  }

  function tick() {
    if (stopped) return;
    const date = dateKey(now());
    if (date !== current.date) {
      current = { ...current, date };
      rollOver();
    } else {
      // A count that wasn't known when the day began is taken as it comes.
      capture();
    }
  }

  function arm() {
    clearTimeout(timer);
    if (stopped) return;
    timer = setTimeout(() => {
      tick();
      arm();
    }, untilMidnight(now()));
  }

  scope.run(() => {
    // Another script (or a sample) opening starts again from what is stored for it.
    watch(
      () => [deps.project(), deps.sample()] as const,
      ([project, sample]) => {
        current = { project, sample, date: dateKey(now()) };
        open();
      },
      { flush: 'sync', immediate: true },
    );
    // Every count looks at the clock, so a day that began while no timer ran is noticed.
    watch(() => deps.counts(), tick, { flush: 'sync' });
  });
  arm();

  const progress = computed<Progress | null>(() => {
    const goalNow = goal.value;
    const began = start.value;
    if (!goalNow || !began) return null;
    // A Markdown document counts words only.
    if (deps.kind() === 'markdown' && goalNow.unit !== 'words') return null;
    const base = began[goalNow.unit];
    const counts = deps.counts();
    const here = counts[goalNow.unit];
    if (base === undefined || here === null) return null;
    const grown = goalNow.unit === 'pages' ? tenth(here - base) : here - base;
    return { done: grown, target: goalNow.target, unit: goalNow.unit };
  });

  async function setGoal(next: Goal | null): Promise<void> {
    // Whatever was asked first (the goal being read) is done before this takes its place.
    await tail;
    const id = tracked();
    if (id === null) return;
    if (next !== null && (!isGoal(next) || (deps.kind() === 'markdown' && next.unit !== 'words')))
      return;
    const mine = { ...current };
    goal.value = next === null ? null : { unit: next.unit, target: next.target };
    await queue(async () => {
      if (current.project !== mine.project) return;
      try {
        if (next === null) await db.settings.delete(goalKey(id));
        else
          await db.settings.put({
            key: goalKey(id),
            value: { unit: next.unit, target: next.target },
          });
      } catch {
        // Held for this visit.
      }
    });
  }

  function stop() {
    stopped = true;
    clearTimeout(timer);
    scope.stop();
  }

  return {
    goal: readonly(goal),
    progress,
    canSet,
    setGoal,
    tick,
    settled: async () => {
      let seen: Promise<unknown>;
      do {
        seen = tail;
        await seen;
      } while (seen !== tail);
    },
    stop,
  };
}

let shared: GoalStore | undefined;

/** The open script's daily goal: created on first use in the browser, kept for the visit. */
export function useGoal(): GoalStore {
  if (!shared) {
    const { project } = useScript();
    const { kind } = useEditor();
    const counts = useCounts();
    shared = createGoal({
      project: () => project.value?.id ?? null,
      sample: () => !!project.value?.sample,
      kind: () => kind.value,
      counts: () => counts.known.value,
    });
    // The window coming back to the front looks at the clock (a laptop that slept through midnight).
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) shared?.tick();
      });
    }
  }
  return shared;
}
