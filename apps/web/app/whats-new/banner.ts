import type { WhatsNewEntry } from './entries';

// The What's new banner's rules (docs/DECISIONS.md, What's new): which entry the writing screen
// shows, and what this browser remembers. Pure apart from `readSeen` and `rememberSeen`, which
// use localStorage and never throw.
//
// - It shows the newest entry marked `banner`, and only that one: an older one never comes back.
// - Never on a first visit (the welcome covers that): the first visit marks every banner entry
//   seen, so the next one shown is a change that came after it.
// - Never in focus mode, never while the tour is up, and never while the update prompt (or its
//   "Drafter is up to date" note) is showing: it waits, so the two never stack.
// - Dismissing it (or following its link) marks it, and every older banner entry, seen.

/** The browser's note of the banner entries seen: a JSON array of their ids. */
export const WHATS_NEW_SEEN = 'drafter-whats-new-v1';

export interface BannerState {
  /** The ids this browser has seen or dismissed. */
  seen: ReadonlySet<string>;
  firstVisit: boolean;
  focus: boolean;
  /** The update prompt, or its "up to date" note, is on the screen. */
  updateShowing: boolean;
  tourShowing: boolean;
}

/** The entries the banner may show, newest first. */
export const bannerEntries = (entries: readonly WhatsNewEntry[]): WhatsNewEntry[] =>
  entries.filter((entry) => entry.banner);

/** The entry to show now, or null. */
export function bannerEntry(
  entries: readonly WhatsNewEntry[],
  state: BannerState,
): WhatsNewEntry | null {
  if (state.firstVisit || state.focus || state.updateShowing || state.tourShowing) return null;
  const newest = bannerEntries(entries)[0];
  if (!newest || state.seen.has(newest.id)) return null;
  return newest;
}

/** What dismissing `id` marks seen: it, and every banner entry older than it. */
export function dismissedWith(entries: readonly WhatsNewEntry[], id: string): string[] {
  const banners = bannerEntries(entries);
  const at = banners.findIndex((entry) => entry.id === id);
  return at < 0 ? [id] : banners.slice(at).map((entry) => entry.id);
}

/** What this visit has seen, for a browser whose storage is blocked: the banner stays dismissed until a reload. */
const seenThisVisit = new Set<string>();

/** The ids seen in this browser (and this visit). Storage that throws, or holds junk, counts as none. */
export function readSeen(storage: Pick<Storage, 'getItem'> | undefined = local()): Set<string> {
  const seen = new Set(seenThisVisit);
  try {
    const stored: unknown = JSON.parse(storage?.getItem(WHATS_NEW_SEEN) ?? '[]');
    if (Array.isArray(stored)) {
      for (const id of stored) if (typeof id === 'string') seen.add(id);
    }
  } catch {
    // Blocked or unreadable: only this visit's.
  }
  return seen;
}

/** Adds `ids` to what this browser has seen. A browser that keeps nothing remembers them for the visit. */
export function rememberSeen(
  ids: readonly string[],
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = local(),
): void {
  for (const id of ids) seenThisVisit.add(id);
  try {
    storage?.setItem(WHATS_NEW_SEEN, JSON.stringify([...readSeen(storage)]));
  } catch {
    // Storage is blocked or full: it shows again on the next visit.
  }
}

/** Forgets this visit's ids, for the unit tests. */
export function forgetVisit(): void {
  seenThisVisit.clear();
}

function local(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    // Some browsers throw on the mere mention of localStorage when site data is blocked.
    return undefined;
  }
}
