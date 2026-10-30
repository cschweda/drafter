import type { TextChange } from '@drafter/fountain';
import type { SceneVersion, VersionRow } from '@drafter/history';
import { type Ref, ref } from 'vue';
import type { ApplyOptions } from '../editor/apply-changes';
import { useEditor } from '../editor/session';
import { sayOutline } from '../outline/notice';
import { useOutline } from '../outline/use-outline';
import { snapshotTime } from '../snapshots/history';
import { wordsChange } from '../snapshots/labels';
import { useSnapshots } from '../snapshots/use-snapshots';
import { sceneText } from './client';
import { dayOf } from './labels';

// History of this scene (version-history design §6.1, Calls 28 to 30): a dialog, as History is,
// listing the scene's versions newest first (one row per distinct version, chained through renamed
// headings and through snapshots without it), with the diff of the selected one. This module holds
// what isn't drawn: which scene the dialog is open on, the list's keys (History's), the rows'
// words, and Use this version, which keeps a "Before restoring a scene" snapshot and then puts the
// version's text in place of the scene now as one change, one undo.

/**
 * The scene the dialog is open on: by its span in the script now (from the Outline, the Cards, the
 * strip, or the palette's cursor), or by its place in a snapshot (a deleted scene, from Deleted
 * scenes), with its heading for the dialog's title.
 */
export type SceneHistoryTarget =
  | {
      /** The Outline's id for the scene (`useOutline().idOf`), which follows it through edits. */
      id?: string;
      from: number;
      to: number;
      heading: string;
    }
  | { snapshot: string; slot: number; heading: string };

/** The scene History of this scene is open on, or null while it is closed. */
export const sceneHistoryOpen: Ref<SceneHistoryTarget | null> = ref(null);

/** Opens History of this scene on `target`. */
export function openSceneHistory(target: SceneHistoryTarget): void {
  sceneHistoryOpen.value = { ...target };
}

/** Use this version's words for a deleted scene, whose action is Put back. */
export const NOT_NOW = 'That scene isn’t in the script now. Put it back from Deleted scenes.';

/** Why Use this version and Copy text do nothing on a "Not in n versions" row. */
export const NOT_IN_VERSION =
  'The scene isn’t in this version, so there is no text to use or copy. Choose another version.';

/** Use this version's words when the scene now isn't the one the dialog opened on. */
export const CHANGED =
  'That scene changed after History of this scene opened. Open it again to use a version.';

export type VersionAction = 'compare' | 'use' | 'menu';

const ACTIONS: Record<string, VersionAction> = {
  Enter: 'compare',
  u: 'use',
  U: 'use',
  ContextMenu: 'menu',
};

/**
 * What `key` does on row `focused` of `count`, as History's list: Up and Down move, Home and End go
 * to the first and last; Enter compares the version with now, U uses it, and the context-menu key
 * (the dialog maps Shift+F10 to it) opens the row's menu. Null for anything else.
 */
export function versionKey(
  count: number,
  focused: number,
  key: string,
  repeat = false,
): { focus?: number; action?: VersionAction } | null {
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
  // A held key repeats a move, never an action (one Put back, one Use this version).
  const action = repeat ? undefined : ACTIONS[key];
  return action ? { action } : null;
}

/**
 * Where `previous` (the selected row) is in `rows`, a listing read again (a snapshot taken or
 * deleted while the dialog is open), so the selection and focus stay on it: the row of the same
 * kind that shares one of its snapshots, else a version with the same text. Null when it is gone.
 */
export function rowAgain(previous: VersionRow | null, rows: readonly VersionRow[]): number | null {
  if (!previous) return null;
  const isGap = 'gap' in previous;
  const had = new Set(previous.snapshots);
  let at = rows.findIndex(
    (row) => 'gap' in row === isGap && row.snapshots.some((id) => had.has(id)),
  );
  if (at < 0 && !isGap) at = rows.findIndex((row) => !('gap' in row) && row.hash === previous.hash);
  return at < 0 ? null : at;
}

const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'long' });
const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long' });
const DAY_MS = 86_400_000;

/** "today", "yesterday", a weekday within the week, else "27 October": a short day for a range. */
function shortDay(at: number, now: number): string {
  const long = dayOf(at, now);
  if (long === 'today' || long === 'yesterday') return long;
  const date = new Date(at);
  return now - at < 6 * DAY_MS ? WEEKDAY.format(date) : `${date.getDate()} ${MONTH.format(date)}`;
}

/** What a version's row says: when, why the snapshot was taken, its change in words, how long it held. */
export interface VersionRowLabel {
  /** "Today, 10:42 AM"; "Tuesday, 27 October, 10:42 AM": its newest snapshot's time. */
  when: string;
  /** That snapshot's label or reason, as History says it. */
  said: string;
  /** Against the next older version: "+12 words", "No change in words"; the oldest, its count. */
  change: string;
  /** "Unchanged in 14 versions, Monday 9:10 AM to Tuesday 10:42 AM", or null for one snapshot. */
  held: string | null;
}

export function versionRowLabel(
  row: SceneVersion,
  said: string,
  olderWords: number | null,
  now: number,
): VersionRowLabel {
  const day = dayOf(row.newestAt, now);
  const when = `${day.charAt(0).toUpperCase()}${day.slice(1)}, ${snapshotTime(row.newestAt)}`;
  const n = row.snapshots.length;
  const from = `${shortDay(row.oldestAt, now)} ${snapshotTime(row.oldestAt)}`;
  const to = `${shortDay(row.newestAt, now)} ${snapshotTime(row.newestAt)}`;
  // Both ends in the same minute read the same: no range then.
  const held =
    n > 1
      ? `Unchanged in ${n.toLocaleString('en-US')} versions${from === to ? '' : `, ${from} to ${to}`}`
      : null;
  return { when, said, change: wordsChange(row.words, olderWords), held };
}

/** A run of snapshots without the scene: "Not in this version", "Not in 3 versions". */
export function gapRowLabel(snapshots: readonly string[]): string {
  const n = snapshots.length;
  return n === 1 ? 'Not in this version' : `Not in ${n.toLocaleString('en-US')} versions`;
}

/** "Tuesday, 27 October at 10:42 AM": when a version was, in Use this version's sentence. */
function onWhen(at: number, now: number): string {
  const date = new Date(at);
  const year = date.getFullYear() === new Date(now).getFullYear() ? '' : ` ${date.getFullYear()}`;
  return `${WEEKDAY.format(date)}, ${date.getDate()} ${MONTH.format(date)}${year} at ${snapshotTime(at)}`;
}

/** What Use this version reads and drives, so it can be tested without the app. */
export interface UseThisVersionDeps {
  /** The scene the dialog is open on. */
  target(): SceneHistoryTarget | null;
  /** Why the script can't be changed from a view now (the Outline's), or null. */
  readOnly(): string | null;
  /** The script's text now. */
  text(): string;
  sceneText(snapshot: string, slot: { from: number; to: number }): Promise<string | null>;
  /** The scene's span and heading in the script now (found by its id), or null when it isn't there. */
  sceneNow(target: SceneHistoryTarget): { from: number; to: number; heading: string } | null;
  /** Keeps a "Before restoring a scene" snapshot of the text now (captured at once). */
  before(): void;
  /** One transaction, one undo; false when nothing could change. */
  apply(changes: readonly TextChange[], options?: ApplyOptions): boolean;
  say(message: string): void;
}

export function createUseThisVersion(
  deps: UseThisVersionDeps,
): (version: SceneVersion, on?: SceneHistoryTarget) => Promise<boolean> {
  return async (version, on) => {
    const target = on ?? deps.target();
    if (!target) return false;
    if ('snapshot' in target) {
      deps.say(NOT_NOW);
      return false;
    }
    const refused = () => {
      const why = deps.readOnly();
      if (why) deps.say(why);
      return why !== null;
    };
    if (refused()) return false;
    const heading = version.heading || 'the untitled scene';
    const snapshot = version.snapshots[0];
    const text = snapshot === undefined ? null : await deps.sceneText(snapshot, version.slot);
    if (text === null) {
      deps.say(`That version of ${heading} can’t be read.`);
      return false;
    }
    // The read took a moment: the tab and the scene are checked again before anything changes.
    if (refused()) return false;
    const span = deps.sceneNow(target);
    if (!span) {
      deps.say('That scene isn’t in the script now.');
      return false;
    }
    // The scene found now must be the one the dialog opened on, not another in its place.
    if (span.heading !== target.heading) {
      deps.say(CHANGED);
      return false;
    }
    const when = onWhen(version.newestAt, Date.now());
    if (deps.text().slice(span.from, span.to) === text) {
      deps.say(`${heading} is already as it was on ${when}.`);
      return false;
    }
    // Unlike Put back, this takes text away: what it replaces is kept first (Call 30).
    deps.before();
    const change = { from: span.from, to: span.to, insert: text };
    if (!deps.apply([change], { selection: { anchor: span.from } })) {
      deps.say('Nothing was changed: this tab can’t edit the script now.');
      return false;
    }
    deps.say(`${heading} is as it was on ${when}. Undo brings back what it replaced.`);
    return true;
  };
}

let shared: ((version: SceneVersion, on?: SceneHistoryTarget) => Promise<boolean>) | undefined;

/**
 * Replaces the scene History of this scene is open on (or `on`, when the dialog has closed first)
 * with `version`'s text (design §6.1): a `before-scene-restore` snapshot first, then one change
 * through the Outline's `apply`; says what it did, or why it didn't.
 */
export function useThisVersion(version: SceneVersion, on?: SceneHistoryTarget): Promise<boolean> {
  if (!shared) {
    const editor = useEditor();
    const outline = useOutline();
    const snapshots = useSnapshots();
    shared = createUseThisVersion({
      target: () => sceneHistoryOpen.value,
      readOnly: () => outline.readOnly.value,
      text: () => editor.view.state.doc.toString(),
      sceneText,
      sceneNow: (target) => {
        if ('snapshot' in target) return null;
        const scenes = outline.index.value.scenes;
        const byId = target.id ? outline.itemById(target.id) : undefined;
        const found =
          (byId?.kind === 'scene' ? byId : undefined) ??
          scenes.find((s) => s.span.from === target.from) ??
          scenes.find((s) => s.span.from <= target.from && target.from < s.span.to);
        return found ? { from: found.span.from, to: found.span.to, heading: found.heading } : null;
      },
      before: () => snapshots.before('before-scene-restore'),
      apply: (changes, options) => outline.apply(changes, options),
      say: (message) => void sayOutline(message),
    });
  }
  return shared(version, on);
}
