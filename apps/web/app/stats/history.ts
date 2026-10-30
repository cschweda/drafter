import { dateKey } from './keys';

// What the kept days say (docs/drafter-stats-design.md §3 and §4): the status bar's labels, the
// last 30 days, and the script's totals. Pure, so a test gives it any days and any today.

/** A script's day, as kept: the writing time, and how much the script grew that day. */
export interface StatsDay {
  /** Writing time, in milliseconds. */
  ms: number;
  /** Net words added (a cut counts against it); absent until known. */
  words?: number;
  /** Net pages added, to one decimal; absent for a Markdown document. */
  pages?: number;
}

/** Days in the Stats tab's chart, today included. */
export const MONTH_DAYS = 30;

export interface DayFigure {
  date: string;
  words: number;
  ms: number;
}

export interface Month {
  /** Oldest first, today last; a day not written is 0 and 0. */
  days: DayFigure[];
  /** Days with writing time. */
  daysWritten: number;
  /** The day the script grew most; null when no day grew. */
  best: { date: string; words: number } | null;
  /** Net words per day written, to the whole word; null with none written. */
  average: number | null;
  /**
   * Days in a row with writing time, back from today (or from yesterday, when today has none yet),
   * over every kept day, not only the 30.
   */
  streak: number;
}

/** The last `MONTH_DAYS` days of `rows` (by local date), as of `today`. */
export function lastDays(rows: ReadonlyMap<string, StatsDay>, today: Date): Month {
  const days: DayFigure[] = [];
  for (let back = MONTH_DAYS - 1; back >= 0; back--) {
    const date = dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - back));
    const row = rows.get(date);
    days.push({ date, words: row?.words ?? 0, ms: row?.ms ?? 0 });
  }
  const written = days.filter((day) => day.ms > 0);
  let best: Month['best'] = null;
  for (const day of days) {
    if (day.words > 0 && (!best || day.words > best.words)) {
      best = { date: day.date, words: day.words };
    }
  }
  const sum = written.reduce((total, day) => total + day.words, 0);
  let streak = 0;
  // Today counts when written; otherwise the streak may still end yesterday.
  const isWritten = (back: number) =>
    (rows.get(dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - back)))
      ?.ms ?? 0) > 0;
  let back = isWritten(0) ? 0 : 1;
  while (isWritten(back)) {
    streak++;
    back++;
  }
  return {
    days,
    daysWritten: written.length,
    best,
    average: written.length === 0 ? null : Math.round(sum / written.length),
    streak,
  };
}

export interface ScriptTotals {
  ms: number;
  daysWritten: number;
  /** The first day with writing time; null with none. */
  firstDay: string | null;
}

/** All the writing time kept for a script, the days written, and the first of them. */
export function scriptTotals(rows: ReadonlyMap<string, StatsDay>): ScriptTotals {
  let ms = 0;
  let daysWritten = 0;
  let firstDay: string | null = null;
  for (const [date, row] of rows) {
    if (row.ms <= 0) continue;
    ms += row.ms;
    daysWritten++;
    if (firstDay === null || date < firstDay) firstDay = date;
  }
  return { ms, daysWritten, firstDay };
}

export interface ChartBar {
  /** From the top of the chart, in its units. */
  y: number;
  height: number;
}

/**
 * The 30-day chart's bars, in a box `height` units tall: growth up from the zero line, a cut down
 * from it, each to scale on its own side. A day written with no growth is a sliver of 1 above the
 * line, so a month of rewriting still shows; a day not written is nothing.
 */
export function chartBars(
  days: readonly DayFigure[],
  height: number,
): { zero: number; bars: ChartBar[] } {
  const up = Math.max(0, ...days.map((day) => day.words));
  const down = Math.max(0, ...days.map((day) => -day.words));
  // The line sits where the share of growth puts it, and never at the very top: the sliver needs room.
  const zero =
    up + down === 0 ? height : Math.min(height, Math.max(1, (up / (up + down)) * height));
  const upScale = up > 0 ? zero / up : 0;
  const downScale = down > 0 ? (height - zero) / down : 0;
  const bars = days.map((day): ChartBar => {
    if (day.words > 0) {
      const size = day.words * upScale;
      return { y: zero - size, height: size };
    }
    if (day.words < 0) return { y: zero, height: -day.words * downScale };
    return day.ms > 0 ? { y: zero - 1, height: 1 } : { y: zero, height: 0 };
  });
  return { zero, bars };
}

/** "<1 min", "38 min", "1 h 05 min": a writing time, to the minute below. */
export function duration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/** The status bar's "38 min today". */
export const timeTodayLabel = (ms: number): string => `${duration(ms)} today`;

/** "+1,234", "−35" (a true minus sign), "0", "+0.3": a change, with its sign. */
export function signed(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 1 })}`;
}

/** "+420 words today", "−35 words today", "0 words today". */
export function wordsTodayLabel(words: number): string {
  return `${signed(words)} word${Math.abs(words) === 1 ? '' : 's'} today`;
}
