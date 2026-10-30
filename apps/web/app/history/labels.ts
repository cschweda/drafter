import type { DeletedScene } from '@drafter/history';
import { snapshotTime } from '../snapshots/history';
import { reasonLabel } from '../snapshots/labels';
import { dateKey } from '../stats/keys';
import type { SnapshotInfo } from '../storage/snapshots';

// What the Deleted scenes tab says (version-history design §3.3): the snapshot an entry was last in,
// in History's words for it; how many versions held it, and from when; the filter, which folds case
// and accents; the slim bar's count and progress; and the list's keys (History's pattern, Call 12).

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

/**
 * "Last in Tuesday, 27 October, 10:42 AM (Saved)": the snapshot the entry's newest version is from,
 * with its label or reason as History says it (`info`, when it is still listed).
 */
export function lastInLabel(
  entry: DeletedScene,
  info: Pick<SnapshotInfo, 'reason' | 'label' | 'detail'> | undefined,
  now: number,
): string {
  const at = entry.newest.at;
  const when = `${dayOf(at, now)}, ${snapshotTime(at)}`;
  return info ? `Last in ${when} (${reasonLabel(info)})` : `Last in ${when}`;
}

/** "In 6 versions, from 21 October". */
export function versionsLabel(entry: DeletedScene, now: number): string {
  const n = entry.versions;
  return `In ${n.toLocaleString('en-US')} ${n === 1 ? 'version' : 'versions'}, from ${dateOf(entry.oldestAt, now)}`;
}

/** Text folded for the filter: no accents, lower case, spaces as one. */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** The entries whose heading or preview holds `filter`, case and accents folded. */
export function filterDeleted(rows: readonly DeletedScene[], filter: string): DeletedScene[] {
  const wanted = foldText(filter);
  if (wanted === '') return [...rows];
  return rows.filter((row) =>
    foldText(`${row.newest.print.heading}\n${row.newest.print.preview}`).includes(wanted),
  );
}

/** "12 deleted scenes". */
export function countLabel(n: number): string {
  return `${n.toLocaleString('en-US')} deleted ${n === 1 ? 'scene' : 'scenes'}`;
}

/** "Reading versions… 120 of 300". */
export function progressLabel(read: number, total: number): string {
  return `Reading versions… ${read.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}`;
}

export type DeletedAction = 'show-text' | 'put-back' | 'history' | 'menu';

const ACTIONS: Record<string, DeletedAction> = {
  Enter: 'show-text',
  p: 'put-back',
  P: 'put-back',
  h: 'history',
  H: 'history',
  ContextMenu: 'menu',
};

/**
 * What `key` does on entry `focused` of `count`: Up and Down move, Home and End go to the first and
 * last; Enter shows or hides the text, P puts it back, H opens History of this scene, and the context-menu key (the tab maps
 * Shift+F10 to it) opens the entry's menu. Null for anything else.
 */
export function deletedKey(
  count: number,
  focused: number,
  key: string,
): { focus?: number; action?: DeletedAction } | null {
  if (count <= 0) return null;
  const at = Math.min(Math.max(focused, 0), count - 1);
  const to: Record<string, number> = {
    ArrowDown: at + 1,
    ArrowUp: at - 1,
    Home: 0,
    End: count - 1,
  };
  const next = to[key];
  if (next !== undefined) return next >= 0 && next < count ? { focus: next } : null;
  const action = ACTIONS[key];
  return action ? { action } : null;
}
