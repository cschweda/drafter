import { dateKey } from '../stats/keys';

// Words the history views share (version-history design §3.3, §6): a day in a sentence, as
// History titles its days; the filter's folding of case and accents; and a scan's progress.

const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'long' });
const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long' });

/** "27 October", with the year when it isn't `now`'s: "5 January 2025". */
function dateOf(at: number, now: number): string {
  const date = new Date(at);
  const year = date.getFullYear() === new Date(now).getFullYear() ? '' : ` ${date.getFullYear()}`;
  return `${date.getDate()} ${MONTH.format(date)}${year}`;
}

/** "today", "yesterday", or "Tuesday, 27 October" (History's day titles, in a sentence). */
export function dayOf(at: number, now: number): string {
  const date = new Date(at);
  const today = new Date(now);
  if (dateKey(date) === dateKey(today)) return 'today';
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (dateKey(date) === dateKey(yesterday)) return 'yesterday';
  return `${WEEKDAY.format(date)}, ${dateOf(at, now)}`;
}

/** Text folded for a filter: no accents, lower case, spaces as one. */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** "Reading versions… 120 of 300". */
export function progressLabel(read: number, total: number): string {
  return `Reading versions… ${read.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}`;
}
