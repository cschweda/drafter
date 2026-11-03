// Which tab each pane shows, and how wide the left pane is. On a wide screen the left pane is
// always the editor and every other view lives in the right one, the Inspector (fresh-look design
// §3.2, §3.3, Calls 4, 5, 13, 14): there is no swap rule and no choice of tab on the left. Below
// 1024px one pane shows, switched by the bottom tab bar (`phoneTabs`, design §6, Task 9).

/**
 * What a document's tabs follow: a script, plain Markdown, or a novel (Markdown with an Outline of
 * its parts, chapters, and sections).
 */
export type TabsKind = 'fountain' | 'markdown' | 'novel';

/** A tab's id: one of the core four, a view tab (Cards, Notes, Stats), or a script module's (`moduleTabId`). */
export type TabId = string;
export type CoreTabId = 'source' | 'script' | 'problems' | 'outline';
export type ViewTabId = 'cards' | 'notes' | 'stats' | 'scaffold';
export type PaneId = 'left' | 'right';
export interface PaneTabs {
  left: TabId;
  right: TabId;
}
/** What the panes show: on a wide screen `left` is always `source` and `right` the Inspector's view. */
export type PaneState = PaneTabs;

/**
 * A view the Inspector shows. The Preview is the Script tab in a Markdown document, and keeps its
 * id (`script`, `#panel-script`); a module's tab is `moduleTabId`'s `module-<module>--<tab>`.
 */
export type InspectorTabId =
  | 'script'
  | 'outline'
  | 'cards'
  | 'stats'
  | 'scaffold'
  | 'notes'
  | 'problems'
  | 'compare'
  | 'cuts'
  | 'drafts'
  | 'draft-steps'
  | 'draft'
  | `module-${string}`;

/**
 * Cuts, the Drafts list, Draft by draft, and the draft being read (drafts-and-cuts design §2.3,
 * §2.4, §3.2): tabs that
 * exist only while open, as Compare is, for scripts and Markdown documents alike.
 */
const DRAFT_TABS: InspectorTabId[] = ['cuts', 'drafts', 'draft-steps', 'draft'];

/**
 * The Inspector's tabs for a document of `kind` (Call 14): the row, and More with the rest, in
 * order. A script: Script, Outline, Cards, Stats, Scaffold in the row; Notes, Problems, Compare,
 * Cuts, Drafts, the draft being read, then the modules' tabs (`modules`) under More. A Markdown
 * document: Preview and Stats; Problems, Compare, Cuts, Drafts, the draft being read, and the
 * modules' tabs under More. A novel: Preview, Outline, Cards, and Stats, and the same More. Compare, Cuts, and the drafts' two are listed only while open
 * (AppPane leaves them out otherwise); when the Inspector is too narrow for its row, AppPane moves
 * tabs from the row's right end into More, measured.
 */
export function inspectorTabs(
  kind: TabsKind,
  modules: ReadonlyArray<string> = [],
): { row: InspectorTabId[]; more: InspectorTabId[] } {
  const own = modules as InspectorTabId[];
  if (kind !== 'fountain') {
    const row: InspectorTabId[] =
      kind === 'novel' ? ['script', 'outline', 'cards', 'stats'] : ['script', 'stats'];
    return { row, more: ['problems', 'compare', ...DRAFT_TABS, ...own] };
  }
  return {
    row: ['script', 'outline', 'cards', 'stats', 'scaffold'],
    more: ['notes', 'problems', 'compare', ...DRAFT_TABS, ...own],
  };
}

/**
 * The panes with `tab` in the Inspector (Calls 4, 5): the editor stays on the left whatever is
 * shown, and a view is only ever in the Inspector. Unchanged when it shows already.
 */
export function showInInspector(state: PaneState, tab: InspectorTabId | TabId): PaneState {
  if (state.left === 'source' && (tab === 'source' || state.right === tab)) return state;
  if (tab === 'source')
    return { left: 'source', right: state.right === 'source' ? 'script' : state.right };
  return { left: 'source', right: tab };
}

/** The id of the Inspector header's place for the view's tools (Call 15). */
export const INSPECTOR_TOOLS_ID = 'inspector-tools';

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

/** The Stats tab (seeing-the-script design §4.1), which replaced the Stats window. */
export const STATS_TAB_ID = 'stats';

/** Scaffold (seeing-the-script design §5.1): who is in the cursor's scene, beside the Source. */
export const SCAFFOLD_TAB_ID = 'scaffold';

/**
 * Cards, Notes, Stats, and Scaffold (design §5.8; seeing-the-script design §4.1, §5.1): not core,
 * so they share the slot and More with module tabs, first in More, in the design's order, until
 * one is chosen.
 */
export const VIEW_TABS: ReadonlyArray<{ id: ViewTabId; label: string }> = [
  { id: 'cards', label: 'Cards' },
  { id: 'notes', label: 'Notes' },
  { id: STATS_TAB_ID, label: 'Stats' },
  { id: SCAFFOLD_TAB_ID, label: 'Scaffold' },
];

/**
 * Compare (Phase 2 design §5.8, §11.2, Call 16): an other tab that exists only while a comparison is
 * open, first among the others then, so opening it puts it in the slot of the pane it opens in.
 */
export const COMPARE_TAB: Tab = { id: 'compare', label: 'Compare' };

/**
 * The view tabs a document of `kind` has, before any module's. A Markdown document has no scenes or
 * notes, so no Cards, Notes, or Scaffold; it has Stats, with its words, headings, and reading time.
 */
export function viewTabs(kind: 'fountain' | 'markdown'): ReadonlyArray<Tab> {
  return kind === 'markdown' ? VIEW_TABS.filter((tab) => tab.id === STATS_TAB_ID) : VIEW_TABS;
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

/**
 * A phone, and every width below 1024px, opens on Write, the Source (fresh-look design §6, Call 19:
 * it opened on the Script). The tab isn't stored between visits.
 */
export const PHONE_DEFAULT_TAB: CoreTabId = 'source';

/** The bottom tab bar's own words for a tab: the Source is where one writes. */
export const PHONE_LABELS: Readonly<Record<string, string>> = { source: 'Write' };

/** More's last item on the bottom tab bar: History, a dialog rather than a tab. */
export const HISTORY_ITEM = 'history';

/**
 * The bottom tab bar (fresh-look design §6): Write, Script (a Markdown document's Preview), and
 * Outline (not in a plain Markdown document; a novel has its own), then More with Cards, Stats, Scaffold, Notes, Problems,
 * the modules' tabs, and History, which opens its dialog. Compare, Cuts, Drafts, and the draft
 * being read lead More while they are open. A tab from More shows on the bar while it is the one showing (BottomTabBar).
 */
export function phoneTabs(
  kind: TabsKind,
  modules: ReadonlyArray<string> = [],
  open: {
    compare?: boolean;
    cuts?: boolean;
    drafts?: boolean;
    steps?: boolean;
    draft?: boolean;
  } = {},
): { row: TabId[]; more: TabId[] } {
  const lead = [
    ...(open.compare ? ['compare'] : []),
    ...(open.cuts ? ['cuts'] : []),
    ...(open.drafts ? ['drafts'] : []),
    ...(open.steps ? ['draft-steps'] : []),
    ...(open.draft ? ['draft'] : []),
  ];
  if (kind !== 'fountain') {
    return {
      row: kind === 'novel' ? ['source', 'script', 'outline'] : ['source', 'script'],
      more: [
        ...lead,
        ...(kind === 'novel' ? ['cards'] : []),
        'stats',
        'problems',
        ...modules,
        HISTORY_ITEM,
      ],
    };
  }
  return {
    row: ['source', 'script', 'outline'],
    more: [...lead, 'cards', 'stats', 'scaffold', 'notes', 'problems', ...modules, HISTORY_ITEM],
  };
}

/** The left pane's share of the width. */
export const SPLIT = { min: 0.25, max: 0.75, step: 0.05, initial: 0.5 } as const;

/**
 * The tabs with `tab` taken away (its module was turned off, or a Markdown document has no
 * Outline, Cards, or Notes): a pane that showed it shows the first core tab, in the order Source, Script,
 * Problems, that the other pane isn't showing.
 */
export function dropTab(tabs: PaneTabs, tab: TabId): PaneTabs {
  const next = { ...tabs };
  for (const pane of ['left', 'right'] as const) {
    if (next[pane] !== tab) continue;
    const other = next[pane === 'left' ? 'right' : 'left'];
    next[pane] = (TABS.find((t) => t.id !== other && t.id !== tab) as { id: TabId }).id;
  }
  return next;
}

/** The media query for two panes: 1024px, Tailwind's `lg`. */
export const WIDE_QUERY = '(min-width: 1024px)';

/** Screens with a status bar (fresh-look design §3.1, Task 6): 640px and up. */
export const STATUS_BAR_QUERY = '(min-width: 640px)';

export function clampSplit(ratio: number): number {
  if (Number.isNaN(ratio)) return SPLIT.initial;
  return Math.min(SPLIT.max, Math.max(SPLIT.min, ratio));
}
