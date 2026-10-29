// Which tab each pane shows, and how wide the left pane is. A tab shows in
// one pane at a time (Phase 1 design §5.1): choosing a tab that's open in
// the other pane swaps the two, so there's always one editor, one Script
// view, and one Problems list.

/** A tab's id: one of the core four, Cards or Notes, or a script module's (`moduleTabId`). */
export type TabId = string;
export type CoreTabId = 'source' | 'script' | 'problems' | 'outline';
export type ViewTabId = 'cards' | 'notes';
export type PaneId = 'left' | 'right';
export interface PaneTabs {
  left: TabId;
  right: TabId;
}

export interface Tab {
  id: TabId;
  label: string;
  /** A count drawn beside the label, as Problems has. */
  badge?: string;
  /** What the badge means, for the tab's name: `3 open` makes the name "Notes, 3 open". */
  badgeName?: string;
}

/** The core tabs, always in the row (Phase 2 design §5.8). A module adds its own after them while it is on. */
export const TABS: ReadonlyArray<{ id: CoreTabId; label: string }> = [
  { id: 'source', label: 'Source' },
  { id: 'script', label: 'Script' },
  { id: 'problems', label: 'Problems' },
  { id: 'outline', label: 'Outline' },
];

/** The core tabs a document of `kind` has: a Markdown document has no scenes, so no Outline. */
export function coreTabs(kind: 'fountain' | 'markdown'): ReadonlyArray<Tab> {
  return kind === 'markdown' ? TABS.filter((tab) => tab.id !== 'outline') : TABS;
}

/**
 * Cards and Notes (design §5.8): not core, so they share the slot and More with module tabs, first
 * in More, in the design's order, until one is chosen. None for Markdown: a Markdown document has no scenes or notes.
 */
export const VIEW_TABS: ReadonlyArray<{ id: ViewTabId; label: string }> = [
  { id: 'cards', label: 'Cards' },
  { id: 'notes', label: 'Notes' },
];

/** The view tabs a document of `kind` has, before any module's. */
export function viewTabs(kind: 'fountain' | 'markdown'): ReadonlyArray<Tab> {
  return kind === 'markdown' ? [] : VIEW_TABS;
}

/**
 * A pane's tab row (Phase 2 design §5.8): the core tabs, then one slot for another tab, then a
 * More menu with the rest. The slot holds the pane's own tab when it shows another one, else the
 * one chosen last (`last`), else nothing (controller ruling 4: never a tab nobody chose), at any
 * width; nine tabs never have to fit a pane's width.
 */
export function tabRow(
  core: ReadonlyArray<Tab>,
  others: ReadonlyArray<Tab>,
  selected: TabId,
  last: TabId | null,
): { row: Tab[]; more: Tab[] } {
  const slot = others.find((tab) => tab.id === selected) ?? others.find((tab) => tab.id === last);
  return {
    row: [...core, ...(slot ? [slot] : [])],
    more: others.filter((tab) => tab !== slot),
  };
}

export const DEFAULT_TABS: PaneTabs = { left: 'source', right: 'script' };

/** A first visit on a phone opens on the formatted script (design §12). */
export const PHONE_DEFAULT_TAB: CoreTabId = 'script';

/** The left pane's share of the width. */
export const SPLIT = { min: 0.25, max: 0.75, step: 0.05, initial: 0.5 } as const;

export function otherPane(pane: PaneId): PaneId {
  return pane === 'left' ? 'right' : 'left';
}

export function chooseTab(tabs: PaneTabs, pane: PaneId, tab: TabId): PaneTabs {
  if (tabs[pane] === tab) return tabs;
  const other = otherPane(pane);
  const swapped = tabs[other] === tab ? { [other]: tabs[pane] } : {};
  return { ...tabs, ...swapped, [pane]: tab };
}

/**
 * The tabs with `tab` showing. If it isn't already, it opens in the pane other than `from`, the
 * pane asking (so the writer keeps what they were looking at), or in the left pane when no pane
 * is asking.
 */
export function revealTab(tabs: PaneTabs, tab: TabId, from?: PaneId): PaneTabs {
  if (tabs.left === tab || tabs.right === tab) return tabs;
  return { ...tabs, [from ? otherPane(from) : 'left']: tab };
}

/**
 * The tabs with `tab` taken away (its module was turned off, or a Markdown document has no
 * Outline, Cards, or Notes): a pane that showed it shows the first core tab, in the order Source, Script,
 * Problems, that the other pane isn't showing.
 */
export function dropTab(tabs: PaneTabs, tab: TabId): PaneTabs {
  const next = { ...tabs };
  for (const pane of ['left', 'right'] as const) {
    if (next[pane] !== tab) continue;
    const other = next[otherPane(pane)];
    next[pane] = (TABS.find((t) => t.id !== other && t.id !== tab) as { id: TabId }).id;
  }
  return next;
}

/** The media query for two panes: 1024px, Tailwind's `lg`. */
export const WIDE_QUERY = '(min-width: 1024px)';

export function clampSplit(ratio: number): number {
  if (Number.isNaN(ratio)) return SPLIT.initial;
  return Math.min(SPLIT.max, Math.max(SPLIT.min, ratio));
}
