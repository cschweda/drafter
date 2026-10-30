import { type ComputedRef, computed, effectScope } from 'vue';
import { useGuard } from '../storage/guard';
import type { Project } from '../storage/projects';
import { useScript } from '../storage/script';
import { DEFAULT_RATES, type Rates } from './time-format';

/**
 * Running time (out-the-door design §3): where a script's two rates are kept, and how they are
 * set. The rates are the script's own, kept on its project in this browser (Call 9, as the export
 * options are), never in the text; the Stats tab sets them, and every time shown reads them.
 * How a time reads is `stats/time-format.ts`; the counting itself is `@drafter/outline`'s
 * (`TimingTally`, `estimateSeconds`).
 */

export const RATE_LIMITS = Object.freeze({
  minutesPerPage: Object.freeze({ min: 0.5, max: 3, step: 0.1 }),
  wordsPerMinute: Object.freeze({ min: 100, max: 220, step: 5 }),
} as const);

const PROBLEMS: Record<keyof Rates, string> = {
  minutesPerPage: 'Enter a number from 0.5 to 3, in tenths, such as 1.2.',
  wordsPerMinute: 'Enter a whole number from 100 to 220, in steps of 5.',
};

/** Whether `value` is a rate `key` can take: in range, and on a step. */
function isRate(key: keyof Rates, value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  const { min, max, step } = RATE_LIMITS[key];
  if (value < min || value > max) return false;
  const steps = (value - min) / step;
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

/** The project's rates, any missing, unknown, or out-of-range one read as its default. */
export function ratesOf(project: Pick<Project, 'timing'> | null | undefined): Rates {
  const minutesPerPage = project?.timing?.minutesPerPage;
  const wordsPerMinute = project?.timing?.wordsPerMinute;
  return {
    minutesPerPage: isRate('minutesPerPage', minutesPerPage)
      ? minutesPerPage
      : DEFAULT_RATES.minutesPerPage,
    wordsPerMinute: isRate('wordsPerMinute', wordsPerMinute)
      ? wordsPerMinute
      : DEFAULT_RATES.wordsPerMinute,
  };
}

let openRates: ComputedRef<Rates> | null = null;

/**
 * The open script's rates: one computed, shared by every view that shows a time. It keeps the
 * same object while both numbers stay the same, so saving the script, which changes its project,
 * doesn't make every time on screen work itself out again.
 */
export function useRates(): ComputedRef<Rates> {
  // In a scope of its own, so it outlives whichever component asked first.
  openRates ??= effectScope(true).run(() =>
    computed((previous?: Rates) => {
      const next = ratesOf(useScript().project.value);
      return previous &&
        previous.minutesPerPage === next.minutesPerPage &&
        previous.wordsPerMinute === next.wordsPerMinute
        ? previous
        : next;
    }),
  ) as ComputedRef<Rates>;
  return openRates;
}

/** A typed rate, or the message the field shows. */
export function parseRate(key: keyof Rates, text: string): number | { problem: string } {
  const typed = text.trim();
  const shape = key === 'wordsPerMinute' ? /^\d+$/ : /^(\d+(\.\d+)?|\.\d+)$/;
  const value = shape.test(typed) ? Number(typed) : Number.NaN;
  return isRate(key, value) ? value : { problem: PROBLEMS[key] };
}

/**
 * Keeps one rate on the open script's project (no-op in a read-only tab, or for a rate out of
 * range), and gives back the open script's rates as they then are, for the field to show: what was
 * kept, never a value that wasn't.
 */
export async function setRate(key: keyof Rates, value: number): Promise<Rates> {
  const script = useScript();
  if (script.project.value && !useGuard().readOnly.value && isRate(key, value)) {
    // Made from the project as it is when this write's turn comes, after any choice before it.
    await script.keepOnProject((project) => ({
      timing: { ...ratesOf(project), [key]: value },
    }));
  }
  return ratesOf(script.project.value);
}

export const RATES_READ_ONLY =
  'Another tab has this script open, so its rates can’t be changed here.';
