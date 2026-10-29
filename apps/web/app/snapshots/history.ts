import { type Ref, ref } from 'vue';
import type { DocumentKind } from '../markdown/kind';
import { dateKey } from '../stats/keys';
import type { SnapshotInfo } from '../storage/snapshots';
import { fileNameFor } from '../storage/text';
import { reasonLabel, wordsChange } from './labels';

// What the History dialog lists (Phase 2 design §11.1, Call 12): the script's snapshots by local
// day, newest first, each with its reason or label and its change in words; the keys on a focused
// row; and the name a snapshot saved as a file gets (Call 23). Pure but for `historyOpen`.

export interface HistoryRow extends SnapshotInfo {
  /** Its label, or why it was taken (`reasonLabel`). */
  said: string;
  /** The change in words from the next older snapshot (`wordsChange`); `words` stays the count. */
  change: string;
}

export interface HistoryDay {
  /** The local date, `YYYY-MM-DD`. */
  key: string;
  /** "Today", "Yesterday", "Tuesday, 27 October" (with the year when it isn't this one). */
  title: string;
  rows: HistoryRow[];
}

export type HistoryAction =
  | 'compare-now'
  | 'compare-with'
  | 'restore'
  | 'label'
  | 'save'
  | 'delete'
  | 'menu';

const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'long' });
const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long' });

function dayTitle(at: number, now: number): string {
  const date = new Date(at);
  const today = new Date(now);
  if (dateKey(date) === dateKey(today)) return 'Today';
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (dateKey(date) === dateKey(yesterday)) return 'Yesterday';
  const year = date.getFullYear() === today.getFullYear() ? '' : ` ${date.getFullYear()}`;
  return `${WEEKDAY.format(date)}, ${date.getDate()} ${MONTH.format(date)}${year}`;
}

/** `rows` by local day, newest first; each row's words change is against the next older row, across days. */
export function historyDays(rows: readonly SnapshotInfo[], now: number): HistoryDay[] {
  const sorted = [...rows].sort((a, b) => b.createdAt - a.createdAt || (a.id < b.id ? 1 : -1));
  const days: HistoryDay[] = [];
  sorted.forEach((info, i) => {
    const key = dateKey(new Date(info.createdAt));
    let day = days.at(-1);
    if (day?.key !== key) {
      day = { key, title: dayTitle(info.createdAt, now), rows: [] };
      days.push(day);
    }
    const older = sorted[i + 1];
    day.rows.push({
      ...info,
      said: reasonLabel(info),
      change: wordsChange(info.words, older ? older.words : null),
    });
  });
  return days;
}

const ACTIONS: Record<string, HistoryAction> = {
  Enter: 'compare-now',
  c: 'compare-with',
  C: 'compare-with',
  r: 'restore',
  R: 'restore',
  l: 'label',
  L: 'label',
  s: 'save',
  S: 'save',
  Delete: 'delete',
  Backspace: 'delete',
  ContextMenu: 'menu',
};

/**
 * What `key` does on row `focused` of `count` (Call 12): Up and Down move, Home and End go to the
 * first and last; Enter compares with now, C compares with…, R restores, L labels, S saves as a
 * file, Delete (Backspace, a Mac's delete key) deletes, and the context-menu key opens the row's
 * menu (the dialog maps Shift+F10 to it). Null for anything else.
 */
export function historyKey(
  count: number,
  focused: number,
  key: string,
): { focus?: number; action?: HistoryAction } | null {
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

const two = (n: number) => String(n).padStart(2, '0');

/** "The Call (snapshot 2026-10-29 1042).fountain", by local time; `.md` for Markdown. Never the script's own file name. */
export function snapshotFileName(title: string, at: number, kind: DocumentKind): string {
  const extension = kind === 'markdown' ? '.md' : '.fountain';
  // The title cleaned and cut as Save's is, so the time is never cut off.
  const base = fileNameFor(title, extension).slice(0, -extension.length);
  const date = new Date(at);
  const time = `${dateKey(date)} ${two(date.getHours())}${two(date.getMinutes())}`;
  return `${base} (snapshot ${time})${extension}`;
}

/** "10:42 AM": a snapshot's time, as the status bar says a save's. */
export function snapshotTime(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Whether History is open, and whether it opens on Take snapshot's label field (Call 13). */
export const historyOpen: Ref<{ focusLabel: boolean } | null> = ref(null);
