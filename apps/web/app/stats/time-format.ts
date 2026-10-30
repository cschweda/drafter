import { ACTION_SECONDS_PER_LINE, DEFAULT_WORDS_PER_MINUTE } from '@drafter/outline';

/**
 * How a running time reads (out-the-door design §3): the two rates a script times itself at, and
 * the words for a time. Pure, so the Outline's and the strip's labels use it with no script open;
 * where the rates are kept, and how they are set, is `stats/timing.ts`.
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
