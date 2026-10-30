import { ACTION_SECONDS_PER_LINE, DEFAULT_WORDS_PER_MINUTE } from '@drafter/outline';
import { useGuard } from '../storage/guard';
import type { Project } from '../storage/projects';
import { useScript } from '../storage/script';

/**
 * Running time (out-the-door design §3): the two rates a script times itself at, and how its
 * times read. The rates are the script's own, kept on its project in this browser (Call 9, as the
 * export options are), never in the text; the Stats window sets them, and every time shown reads
 * them. The counting itself is `@drafter/outline`'s (`blockTiming`, `estimateSeconds`).
 */

export interface Rates {
  /** Minutes a page takes, for the running time. */
  minutesPerPage: number;
  /** Words spoken a minute, for the estimate from the dialogue. */
  wordsPerMinute: number;
}

export const DEFAULT_RATES: Rates = Object.freeze({
  minutesPerPage: 1,
  wordsPerMinute: DEFAULT_WORDS_PER_MINUTE,
});

export const RATE_LIMITS = Object.freeze({
  minutesPerPage: Object.freeze({ min: 0.5, max: 3, step: 0.1 }),
  wordsPerMinute: Object.freeze({ min: 100, max: 220, step: 5 }),
} as const);

const PROBLEMS: Record<keyof Rates, string> = {
  minutesPerPage: 'Enter a number from 0.5 to 3.',
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

/** A typed rate, or the message the field shows. */
export function parseRate(key: keyof Rates, text: string): number | { problem: string } {
  const typed = text.trim();
  const shape = key === 'wordsPerMinute' ? /^\d+$/ : /^(\d+(\.\d+)?|\.\d+)$/;
  const value = shape.test(typed) ? Number(typed) : Number.NaN;
  return isRate(key, value) ? value : { problem: PROBLEMS[key] };
}

/** Keeps one rate on the open script's project (no-op in a read-only tab, or for a rate out of range). */
export async function setRate(key: keyof Rates, value: number): Promise<void> {
  const script = useScript();
  if (!script.project.value || useGuard().readOnly.value || !isRate(key, value)) return;
  // Made from the project as it is when this write's turn comes, after any choice before it.
  await script.keepOnProject((project) => ({
    timing: { ...ratesOf(project), [key]: value },
  }));
}

/** Seconds that `eighths` of a page take at `minutesPerPage`. */
export function pageSeconds(eighths: number, minutesPerPage: number): number {
  return (eighths / 8) * 60 * minutesPerPage;
}

/** A time in hours, minutes, and seconds: to 5 s under ten minutes, then to the minute (Call 17). */
function parts(seconds: number): { h: number; m: number; s: number } {
  if (seconds < 600) {
    // Anything at all is at least 5 seconds.
    const rounded = seconds > 0 ? Math.max(5, Math.round(seconds / 5) * 5) : 0;
    if (rounded < 600) return { h: 0, m: Math.floor(rounded / 60), s: rounded % 60 };
  }
  const minutes = Math.round(seconds / 60);
  return { h: Math.floor(minutes / 60), m: minutes % 60, s: 0 };
}

/** '10 s', '1 min 25 s', '12 min', '1 h 5 min'. */
export function shortTime(seconds: number): string {
  const { h, m, s } = parts(seconds);
  const out: string[] = [];
  if (h > 0) out.push(`${h} h`);
  if (m > 0) out.push(`${m} min`);
  if (s > 0 || out.length === 0) out.push(`${s} s`);
  return out.join(' ');
}

const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The same in words, for accessible names: 'about 1 minute 25 seconds'; 'no time' for none. */
export function timeWords(seconds: number): string {
  const { h, m, s } = parts(seconds);
  const out: string[] = [];
  if (h > 0) out.push(unit(h, 'hour'));
  if (m > 0) out.push(unit(m, 'minute'));
  if (s > 0) out.push(unit(s, 'second'));
  return out.length === 0 ? 'no time' : `about ${out.join(' ')}`;
}

export const ESTIMATE_LABEL = 'Estimate from the dialogue';

/** The line under the estimate: how it is made, at the script's pace. */
export function estimateNote(rates: Rates): string {
  return `The words spoken, at ${rates.wordsPerMinute} words a minute, plus ${ACTION_SECONDS_PER_LINE} seconds for each line of action. A rough guide, not a timing.`;
}

/** '1 minute a page', '1.2 minutes a page': the page rate, for the running time's line. */
export function pageRatePhrase(minutesPerPage: number): string {
  return `${minutesPerPage} minute${minutesPerPage === 1 ? '' : 's'} a page`;
}

export const RATES_READ_ONLY =
  'Another tab has this script open, so its rates can’t be changed here.';
