// Which tab each pane shows, and how wide the left pane is. A tab shows in
// one pane at a time (Phase 1 design §5.1): choosing a tab that's open in
// the other pane swaps the two, so there's always one editor, one Script
// view, and one Problems list.

export type TabId = 'source' | 'script' | 'problems';
export type PaneId = 'left' | 'right';
export interface PaneTabs {
  left: TabId;
  right: TabId;
}

export const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'source', label: 'Source' },
  { id: 'script', label: 'Script' },
  { id: 'problems', label: 'Problems' },
];

export const DEFAULT_TABS: PaneTabs = { left: 'source', right: 'script' };

/** A first visit on a phone opens on the formatted script (design §12). */
export const PHONE_DEFAULT_TAB: TabId = 'script';

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

/** The media query for two panes: 1024px, Tailwind's `lg`. */
export const WIDE_QUERY = '(min-width: 1024px)';

export function clampSplit(ratio: number): number {
  if (Number.isNaN(ratio)) return SPLIT.initial;
  return Math.min(SPLIT.max, Math.max(SPLIT.min, ratio));
}
