<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import { useCompare } from '~/compare/use-compare';
import { useScriptTitle } from '~/composables/useScriptTitle';
import { CUTS_TAB, useCuts } from '~/cuts/use-cuts';
import { draftName } from '~/drafts/labels';
import { DRAFTS_TAB, READER_TAB, useDrafts } from '~/drafts/use-drafts';
import { STEPS_TAB, useDraftSteps } from '~/drafts/use-steps';
import { useProblems } from '~/editor/problems';
import { useEditor } from '~/editor/session';
import { contextGeneration } from '~/modules/context';
import { useModuleTabs } from '~/modules/host';
import { openCount } from '~/notes/filter';
import { useNotes } from '~/notes/use-notes';
import { isBackKey } from '~/scaffold/keys';
import { scaffoldBack } from '~/scaffold/show';
import { useSettings } from '~/settings/settings';
import { useScript } from '~/storage/script';
import {
  COMPARE_TAB,
  INSPECTOR_TOOLS_ID,
  inspectorTabs,
  TABS,
  type Tab,
  type TabId,
  VIEW_TABS,
} from '~/utils/panes';

// A pane (fresh-look design §3.2, §3.3). Side by side, the left one (`left`) is the editor: a 36px
// header with the script's name and the editor's toggles, the element bar, then the Source. The
// right one (`right`) is the Inspector: a 36px header with its own tabs, More, and the view's tools,
// then the view. Below 1024px (`phone`) one pane shows: a slim bar with the view's tools, the view,
// and the bottom tab bar under it (BottomTabBar, fresh-look design §6, Task 9).

const props = defineProps<{
  /** `left` (the editor), `right` (the Inspector), or `phone`; it names the tabs' ids. */
  pane: 'left' | 'right' | 'phone';
  /** The tab list's accessible name. */
  label: string;
  selected: TabId;
  /** The tabs showing in any pane: a tab points at its panel only when the panel exists. */
  shown: TabId[];
}>();
const emit = defineEmits<{ choose: [tab: TabId] }>();

const editorPane = computed(() => props.pane === 'left');
const inspector = computed(() => props.pane === 'right');

const { project } = useScript();
const { kind, view: editorView } = useEditor();
const markdown = computed(() => kind.value === 'markdown');
/** The Script tab is the Preview in a Markdown document. */
const labelOf = (tab: { id: string; label: string }) =>
  tab.id === 'script' && markdown.value ? 'Preview' : tab.label;
const { count } = useProblems();

// ---- The tabs -------------------------------------------------------------------------------

/** Each tab's icon in the Inspector (one line-icon style, design §1). */
const ICONS: Record<string, string> = {
  script: 'i-lucide-file-text',
  preview: 'i-lucide-eye',
  outline: 'i-lucide-list-tree',
  cards: 'i-lucide-layout-grid',
  stats: 'i-lucide-chart-column',
  scaffold: 'i-lucide-users',
  notes: 'i-lucide-notebook-pen',
  problems: 'i-lucide-triangle-alert',
  compare: 'i-lucide-git-compare',
  cuts: 'i-lucide-scissors',
  drafts: 'i-lucide-milestone',
  'draft-steps': 'i-lucide-git-commit-vertical',
  draft: 'i-lucide-book-open',
  module: 'i-lucide-puzzle',
};
const iconOf = (tab: Tab) =>
  tab.id === 'script' && markdown.value
    ? ICONS.preview
    : (ICONS[tab.id] ?? (tab.id.startsWith('module-') ? ICONS.module : undefined));

// The Notes tab's badge is the open notes in My notes and Readers (Call 15), named "Notes, 3 open".
const { entries: noteEntries } = useNotes();
const openNotes = computed(() => openCount(noteEntries.value));
// Compare and Cuts exist only while open (Phase 2 design §5.8, Call 16; drafts-and-cuts design
// §3.2).
const { current: comparison } = useCompare();
const { isOpen: cutsOpen } = useCuts();
// The Drafts list and the draft being read, while open (drafts-and-cuts design §2.3).
const { isOpen: draftsOpen, reading } = useDrafts();
const { isOpen: stepsOpen } = useDraftSteps();
const moduleTabs = useModuleTabs();
const moduleTab = computed(() => moduleTabs.value.find((tab) => tab.id === props.selected));

/** Every tab's label, by its id. */
const LABELS: Record<string, string> = Object.fromEntries(
  [...TABS, ...VIEW_TABS, COMPARE_TAB, CUTS_TAB, DRAFTS_TAB, STEPS_TAB, READER_TAB].map((tab) => [
    tab.id,
    tab.label,
  ]),
);
function tabOf(id: TabId): Tab {
  // The draft being read is named by its number: "Draft 3".
  if (id === READER_TAB.id && reading.value) return { id, label: draftName(reading.value.row.n) };
  if (id === 'notes' && openNotes.value > 0) {
    return {
      id,
      label: 'Notes',
      badge: String(openNotes.value),
      badgeName: `${openNotes.value} open`,
    };
  }
  const module = moduleTabs.value.find((tab) => tab.id === id);
  return { id, label: module?.label ?? LABELS[id] ?? id };
}

// The Inspector (Call 14): its row and More by the document's kind; the view it shows, when that is
// one from More, after the row's tabs; and tabs from the row's right end into More when the header
// is too narrow for them (`fit`, measured below).
const inspectorSet = computed(() => {
  const { row, more } = inspectorTabs(
    kind.value,
    moduleTabs.value.map((tab) => tab.id),
  );
  const open = (id: TabId) => {
    if (id === COMPARE_TAB.id) return !!comparison.value;
    if (id === CUTS_TAB.id) return cutsOpen.value;
    if (id === DRAFTS_TAB.id) return draftsOpen.value;
    if (id === STEPS_TAB.id) return stepsOpen.value;
    if (id === READER_TAB.id) return !!reading.value;
    return true;
  };
  return { row: row.map(tabOf), more: more.filter(open).map(tabOf) };
});
/** The tabs drawn in the Inspector's row: the row's own, and the view showing if it isn't one. */
const inspectorRow = computed<Tab[]>(() => {
  const { row, more } = inspectorSet.value;
  if (row.some((tab) => tab.id === props.selected)) return row;
  return [...row, more.find((tab) => tab.id === props.selected) ?? tabOf(props.selected)];
});
/** How many of the row's tabs fit, from the left; the one showing always does. */
const fit = ref(Number.POSITIVE_INFINITY);
const folded = (tab: Tab, index: number) => index >= fit.value && tab.id !== props.selected;

const row = computed(() => {
  const all = inspectorRow.value;
  const out = all.filter((tab, index) => folded(tab, index));
  return {
    row: all,
    more: [...out, ...inspectorSet.value.more.filter((tab) => tab.id !== props.selected)],
  };
});
const isFolded = (tab: Tab, index: number) => inspector.value && folded(tab, index);
const moreTabs = computed(() => row.value.more);
/**
 * With Problems under More (the Inspector's row, Call 14), More carries its count, seen and in its
 * name ("More tabs, 3 problems"), so a count isn't hidden behind a menu.
 */
const moreProblems = computed(() =>
  count.value > 0 && moreTabs.value.some((tab) => tab.id === 'problems') ? count.value : 0,
);
/** More's name: "More tabs", and the problems it holds ("More tabs, 3 problems"). */
const moreButtonName = computed(() => {
  const n = moreProblems.value;
  return n > 0 ? `More tabs, ${n} ${n === 1 ? 'problem' : 'problems'}` : 'More tabs';
});

/** A tab's name with its badge: "Notes, 3 open". */
function tabName(tab: Tab): string {
  if (!tab.badge) return tab.label;
  return `${tab.label}, ${tab.badgeName ?? tab.badge}`;
}
/** A tab's name in More: Problems with its count, as its tab shows it. */
function moreName(tab: Tab): string {
  if (tab.id === 'problems' && count.value > 0) return `${labelOf(tab)}, ${count.value}`;
  return tabName({ ...tab, label: labelOf(tab) });
}

/**
 * The row's tab buttons in the order they are drawn. (A `ref` in a `v-for` keeps the order they were
 * first made in, which a change of document kind leaves out of step with the row.)
 */
function tabButtons(): HTMLButtonElement[] {
  return [...(head.value?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])];
}

// More: a menu of the tabs that aren't in the row (MenuButton, as every menu is). Choosing one shows
// it here, and focus goes to its tab rather than back to More.
const moreItems = computed<DropdownMenuItem[]>(() =>
  moreTabs.value.map((tab) => ({
    label: moreName(tab),
    onSelect: () => chooseMore(tab.id),
  })),
);
let chosenTab: TabId | null = null;

function chooseMore(tab: TabId) {
  chosenTab = tab;
  emit('choose', tab);
}

function onMoreCloseAutoFocus(event: Event) {
  const tab = chosenTab;
  chosenTab = null;
  if (!tab) return;
  event.preventDefault();
  requestAnimationFrame(() => document.getElementById(`tab-${props.pane}-${tab}`)?.focus());
}

// Manual activation: arrow keys move focus along the tabs, and Enter or Space chooses one.
function onKeydown(event: KeyboardEvent) {
  const buttons = tabButtons().filter((button) => !button.dataset.folded);
  const index = buttons.indexOf(event.currentTarget as HTMLButtonElement);
  const lastIndex = buttons.length - 1;
  const moves: Record<string, number> = {
    ArrowRight: index === lastIndex ? 0 : index + 1,
    ArrowLeft: index === 0 ? lastIndex : index - 1,
    Home: 0,
    End: lastIndex,
  };
  const next = moves[event.key];
  if (next === undefined) return;
  event.preventDefault();
  buttons[next]?.focus();
}

// ---- Fitting the Inspector's header (Call 15) ------------------------------------------------
// When the tabs and the view's tools would collide, the tools that have an icon go icon-only first
// (their labels stay their names and tooltips), then tools fold into "⋯", one at a time from the
// left (so Fit · 100%, Close, and the like stay longest; a tool marked `data-fold-first` goes
// before them all), then tabs move into More from the right;
// the one showing always stays. Measured, never a fixed count: every tab and tool stays drawn
// (a folded one hidden, out of the flow), so their widths are known without drawing them twice.

const head = ref<HTMLElement>();
const toolsBox = ref<HTMLElement>();
const tablist = ref<HTMLElement>();
/** The tools are icon-only (the stage before any folds). */
const toolsCompact = ref(false);
/** How many of the view's tools, in their fold order (`foldOrder`), are folded into "⋯". */
const foldedTools = ref(0);
const toolsFolded = computed(() => foldedTools.value > 0);
const toolsOpen = ref(false);
const toolsButton = ref<HTMLButtonElement>();
const toolsPanel = ref<HTMLElement>();
const toolsPanelId = useId();
/** Room for the "⋯" button, its gap included. */
const FOLD_BUTTON = 34;
/** The gap between tools in the header (`.head .tools`). */
const TOOL_GAP = 8;
/** Between the tabs and the tools, at least. */
const SPARE = 4;

/** A view's tools, one by one: what it draws in the flow (not its words for a screen reader alone). */
function toolItems(box: HTMLElement | null | undefined): HTMLElement[] {
  if (!box) return [];
  return [...box.children].filter((el): el is HTMLElement => {
    if (!(el instanceof HTMLElement) || el.classList.contains('sr-only')) return false;
    if (el.classList.contains('spacer')) return false;
    return true;
  });
}

/**
 * The order the tools fold in: one marked `data-fold-first` (Scaffold's page name, so Back stays
 * one click away) before the rest, then from the left. Indexes into `toolItems`.
 */
function foldOrder(items: HTMLElement[]): number[] {
  const indexes = items.map((_, i) => i);
  const first = indexes.filter((i) => items[i]?.hasAttribute('data-fold-first'));
  return [...first, ...indexes.filter((i) => !first.includes(i))];
}

/** The first `k` tools to fold, by index. */
function foldedSet(items: HTMLElement[], k: number): Set<number> {
  return new Set(foldOrder(items).slice(0, k));
}

/** Marks the header's tools folded (hidden, still measured) and the panel's others hidden. */
function applyFold() {
  const header = toolItems(toolsBox.value);
  const folded = foldedSet(header, foldedTools.value);
  header.forEach((el, i) => {
    el.toggleAttribute('data-tool-folded', folded.has(i));
  });
  // The panel draws the same tools, in the same order.
  const panel = toolItems(toolsPanel.value);
  const shown = foldedSet(panel, foldedTools.value);
  panel.forEach((el, i) => {
    el.toggleAttribute('data-tool-shown-above', !shown.has(i));
  });
}

/**
 * The tools box's width once the tools are icon-only and folded as measured; -1 with labels. A box
 * narrower than this later lost a tool, not a label, so the fitting starts over.
 */
let compactWidth = -1;
/**
 * Marks the tools box `data-fitting` while a fitting is under way: it takes a frame or more (the
 * labels back, then icon-only, then folds), and a tool drawn in between may yet fold. The browser
 * tests wait for it to go before they look for a tool.
 */
let fittingNow = false;
function fitting(on: boolean) {
  fittingNow = on;
  toolsBox.value?.toggleAttribute('data-fitting', on);
  // The panel "⋯" opened closes once nothing is folded, as the fitting ends: not while it is under
  // way, when every tool comes back for a frame to be measured, or a fitting would close it.
  if (!on && !toolsFolded.value) toolsOpen.value = false;
}
function measure() {
  const header = head.value;
  if (!inspector.value || !header) return fitting(false);
  compactWidth = -1;
  const style = getComputedStyle(header);
  const room =
    header.clientWidth -
    Number.parseFloat(style.paddingLeft) -
    Number.parseFloat(style.paddingRight);
  const gap = Number.parseFloat(style.columnGap) || 0;
  const widths = tabButtons().map((button) => button.getBoundingClientRect().width);
  const more = header.querySelector<HTMLElement>('[data-more]')?.getBoundingClientRect().width ?? 0;
  const items = toolItems(toolsBox.value);
  const tools = items.map((el) => el.getBoundingClientRect().width);
  const order = foldOrder(items);
  const tabsWidth = widths.reduce((sum, w) => sum + w, 0) + Math.max(0, widths.length - 1) * 2;
  /** The tools left in the header once `k` have folded, as wide as they draw. */
  const toolsFrom = (k: number) => {
    const gone = new Set(order.slice(0, k));
    const rest = tools.filter((_, i) => !gone.has(i));
    return rest.length === 0
      ? 0
      : rest.reduce((sum, w) => sum + w, 0) + (rest.length - 1) * TOOL_GAP + gap + SPARE;
  };
  const base = tabsWidth + gap + more;
  if (
    !toolsCompact.value &&
    base + toolsFrom(0) > room &&
    toolsBox.value?.querySelector('[data-tool-icon]')
  ) {
    // Icon-only first, measured again once drawn so.
    toolsCompact.value = true;
    foldedTools.value = 0;
    fit.value = Number.POSITIVE_INFINITY;
    applyFold();
    fitting(true);
    void nextTick(measureSoon);
    return;
  }
  let k = 0;
  while (k < tools.length && base + toolsFrom(k) + (k > 0 ? FOLD_BUTTON : 0) > room) k++;
  foldedTools.value = k;
  fit.value = Number.POSITIVE_INFINITY;
  if (base + toolsFrom(k) + (k > 0 ? FOLD_BUTTON : 0) > room) {
    // Every tool is folded and the tabs still don't fit: tabs move into More from the right.
    const budget = room - gap - more - (k > 0 ? FOLD_BUTTON : 0);
    const selected = inspectorRow.value.findIndex((tab) => tab.id === props.selected);
    let used = selected >= 0 ? (widths[selected] ?? 0) : 0;
    let n = 0;
    for (let i = 0; i < widths.length; i++) {
      if (i === selected) {
        n = i + 1;
        continue;
      }
      const next = used + (widths[i] ?? 0) + 2;
      if (next > budget) break;
      used = next;
      n = i + 1;
    }
    fit.value = n;
  }
  applyFold();
  // Measured once drawn: "⋯" comes with the first fold, in the next render, and takes its room
  // from the box when the header is full. Measured before it, the box would at once look narrower
  // than this, as if a tool had gone, and the fitting would start over and fold again, frame after
  // frame, for as long as the header stayed that width (seen on a shared macOS runner).
  void nextTick(() => {
    if (toolsCompact.value) compactWidth = toolsBox.value?.getBoundingClientRect().width ?? -1;
    fitting(false);
  });
}

let observer: ResizeObserver | undefined;
let frame = 0;
function measureSoon() {
  fitting(true);
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(measure);
}
/**
 * Starts the fitting over: labels back, nothing folded, then measured. For a change that may give
 * room back (a wider header, another view, other tabs); a change the fitting itself makes (a tool
 * going icon-only, a tab moving into More) only measures again, or the two would chase each other.
 */
function refit() {
  toolsCompact.value = false;
  foldedTools.value = 0;
  fit.value = Number.POSITIVE_INFINITY;
  applyFold();
  fitting(true);
  void nextTick(measureSoon);
}
let headWidth = -1;
onMounted(() => {
  if (!inspector.value || typeof ResizeObserver === 'undefined') return;
  // Measured in the next frame: folding changes sizes the observer watches, which within its own
  // callback is a loop (WebKit reports it). The tab list and More are watched too, so a web font
  // that arrives late, or a badge, measures again.
  observer = new ResizeObserver((entries) => {
    const header = entries.find((entry) => entry.target === head.value);
    const box = entries.find((entry) => entry.target === toolsBox.value);
    // A pixel or more: at a fractional width the header can move by a fraction as its tools fold,
    // and rounding that (633.4 one frame, 633.6 the next) started the fitting over each time.
    if (header && Math.abs(header.contentRect.width - headWidth) >= 1) {
      headWidth = header.contentRect.width;
      refit();
    } else if (
      box &&
      toolsCompact.value &&
      compactWidth >= 0 &&
      box.target.getBoundingClientRect().width < compactWidth - 1
    ) {
      // Icon-only, the tools got fewer or narrower (a button gone): their labels may fit now.
      refit();
    } else measureSoon();
  });
  for (const el of [head.value, toolsBox.value, tablist.value]) if (el) observer.observe(el);
  const more = head.value?.querySelector('[data-more]');
  if (more) observer.observe(more);
  measure();
});
onUpdated(() => {
  // A view's tools drawn again (Updating…, a choice that adds a button) keep their fold.
  if (inspector.value) applyFold();
});
onBeforeUnmount(() => {
  observer?.disconnect();
  cancelAnimationFrame(frame);
  document.removeEventListener('pointerdown', onOutside, true);
  document.removeEventListener('keydown', onToolsKeydown);
});
watch(
  () => props.selected,
  () => {
    toolsOpen.value = false;
  },
);
// Another script (New stage play over a screenplay), or another template, draws other tools: the
// labels come back and the fitting starts over, or tools left icon-only by the last script stay so.
const { template } = useEditor();
watch(
  () => [
    props.selected,
    inspectorRow.value.map((tab) => tab.id).join(),
    kind.value,
    project.value?.id,
    template.value,
  ],
  () => refit(),
);
// A badge (Notes' open count, Problems' count) changes a width: measured again, from where it is.
watch(
  () => [inspectorRow.value.map((tab) => tab.badge ?? '').join(), count.value],
  () => void nextTick(measureSoon),
);
watch(toolsOpen, (open) => {
  if (open) void nextTick(applyFold);
});

// The folded tools: a button that shows them in a panel under the header; Escape or a click
// elsewhere puts them away, and Escape gives focus back to the button.
function onOutside(event: PointerEvent) {
  const target = event.target as Node;
  if (toolsPanel.value?.contains(target) || toolsButton.value?.contains(target)) return;
  // A menu opened from a tool (Changes' since:, Scaffold's Pages) is drawn outside the panel.
  if ((target as Element).closest?.('[data-reka-menu-content], [role="menu"]')) return;
  toolsOpen.value = false;
}
watch(toolsOpen, (open) => {
  if (open) {
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onToolsKeydown);
  } else {
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onToolsKeydown);
  }
});
watch(toolsFolded, (now) => {
  if (!now && !fittingNow) toolsOpen.value = false;
});
// The panel going while focus is in it (the header grew, and the tools came back out): focus goes
// to the same tool in the header, else to "⋯", never to the page's body.
const panelShown = computed(() => inspector.value && toolsFolded.value && toolsOpen.value);
watch(
  panelShown,
  (now, was) => {
    const panel = toolsPanel.value;
    const active = document.activeElement;
    if (now || !was || !panel || !active || !panel.contains(active)) return;
    const index = toolItems(panel).findIndex((item) => item.contains(active));
    void nextTick(() => {
      const item = index >= 0 ? toolItems(toolsBox.value)[index] : undefined;
      const target =
        item && !item.hasAttribute('data-tool-folded')
          ? item.matches('button, a, input, select, [tabindex]')
            ? item
            : item.querySelector<HTMLElement>('button, a, input, select, [tabindex]')
          : null;
      (target ?? toolsButton.value)?.focus();
    });
  },
  { flush: 'pre' },
);
/**
 * Focus gone from the panel to somewhere else (a Stats section's heading, the view): the panel
 * goes, as a popover does. A menu a tool opens (Changes' since:, Scaffold's Pages) keeps it.
 */
function onToolsFocusout(event: FocusEvent) {
  const next = event.relatedTarget as Element | null;
  if (!next || toolsPanel.value?.contains(next) || toolsButton.value === next) return;
  if (next.closest('[data-reka-menu-content], [role="menu"]')) return;
  toolsOpen.value = false;
}
/** Escape, with focus on the button or in the panel (a menu of a tool's own closes first). */
function onToolsKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  const target = event.target as Node | null;
  // Safari and WebKit don't focus a clicked button: focus is then on the page itself.
  const inside =
    !!target &&
    (toolsPanel.value?.contains(target) ||
      toolsButton.value === target ||
      target === document.body);
  if (!inside) return;
  event.preventDefault();
  toolsOpen.value = false;
  toolsButton.value?.focus();
}

// ---- The editor's header -----------------------------------------------------------------

const { settings, set } = useSettings();
/** The script's title: the header shows it while focus is outside the editor's pane. */
const scriptTitle = useScriptTitle();
const TOGGLES = [
  { key: 'lineNumbers', label: 'Line numbers', icon: 'i-lucide-list-ordered' },
  { key: 'typewriter', label: 'Typewriter', icon: 'i-lucide-text-cursor' },
  { key: 'scrollSync', label: 'Sync scrolling', icon: 'i-lucide-arrow-down-up' },
] as const;

// The element bar shows while focus is anywhere in the editor's pane (the editor, the bar, the
// toggles), or nowhere (the page's body: after a load, or a click on the Script's pages), and gives
// way to the script's title while focus is in another region, such as the Inspector or the top bar
// (design §3.2; docs/DECISIONS.md). A menu or a dialog drawn over the page leaves things as they
// were, so the bar's own menus keep it. Worked out once focus has settled: between a focusout and
// the focusin after it, focus is on the page's body.
const editorSection = ref<HTMLElement>();
const editing = ref(true);
/** Where focus may go without being "elsewhere": menus, dialogs, and lists drawn over the page. */
const OVERLAYS =
  '[data-reka-menu-content], [role="menu"], [role="dialog"], [role="alertdialog"], [role="listbox"]';
let focusTimer: ReturnType<typeof setTimeout> | undefined;
function followFocus() {
  clearTimeout(focusTimer);
  focusTimer = setTimeout(() => {
    const section = editorSection.value;
    const active = document.activeElement;
    if (!section) return;
    if (!active || active === document.body || section.contains(active)) editing.value = true;
    else if (active.closest(OVERLAYS)) return;
    else editing.value = false;
  });
}
/**
 * A press on the header's empty space (between the chips, the title) keeps focus where it is, so
 * the bar doesn't go from under the pointer; from elsewhere, it puts the cursor in the editor.
 */
function onEditorHeadMousedown(event: MouseEvent) {
  const target = event.target as Element | null;
  if (target?.closest('button, a, input, select, textarea, [tabindex]')) return;
  event.preventDefault();
  if (!editing.value) editorView.focus();
}
onMounted(() => {
  if (!editorPane.value) return;
  document.addEventListener('focusin', followFocus);
  document.addEventListener('focusout', followFocus);
  followFocus();
});
onBeforeUnmount(() => {
  clearTimeout(focusTimer);
  document.removeEventListener('focusin', followFocus);
  document.removeEventListener('focusout', followFocus);
});

// ---- The panel -----------------------------------------------------------------------------

// Side by side, a pane with a bar of its own under its header (the Source's element bar, the
// Outline's filter) puts it in the row the panes share for it, and its text under it (index.vue).
const barShown = useElementBarShown();
// The editor's own element bar is in its header (Task 4), so the editor's pane has no second bar.
const barred = computed(
  () =>
    (props.selected === 'source' && barShown.value && !editorPane.value) ||
    (props.selected === 'outline' && !markdown.value),
);
/** A view on the desk: the band over it (in the shared bar row) is the desk's colour too. */
const onDesk = computed(() => props.selected === 'script' || props.selected === 'compare');

/**
 * Side by side, the Outline's tree scrolls under its filter rather than the panel, so the keys
 * that scroll a focused panel (F6 puts focus there) scroll the tree, as they scrolled the panel.
 */
function onPanelKeydown(event: KeyboardEvent) {
  // Scaffold's Back key, heard anywhere in its panel, the panel itself too (design §5.1). Alt+Left
  // is the browser's Back as well: the page stays where it is.
  if (props.selected === 'scaffold' && !event.defaultPrevented && isBackKey(event)) {
    event.preventDefault();
    scaffoldBack();
    return;
  }
  if (!barred.value || event.target !== event.currentTarget || event.defaultPrevented) return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const panel = event.currentTarget as HTMLElement;
  const area = [...panel.querySelectorAll<HTMLElement>(':scope > * > :not([data-pane-bar])')].find(
    (el) => el.scrollHeight > el.clientHeight,
  );
  if (!area) return;
  const page = area.clientHeight * 0.875;
  const by: Record<string, number> = {
    ArrowDown: 40,
    ArrowUp: -40,
    PageDown: page,
    PageUp: -page,
    ' ': event.shiftKey ? -page : page,
    Home: -area.scrollHeight,
    End: area.scrollHeight,
  };
  const delta = by[event.key];
  if (delta === undefined) return;
  event.preventDefault();
  area.scrollBy({ top: delta });
}
</script>

<template>
  <!-- The editor, side by side: always on the left (Call 13). -->
  <section
    v-if="editorPane"
    ref="editorSection"
    class="pane side editor-pane"
    data-pane="left"
    aria-label="Source"
  >
    <!-- The element bar while focus is in this pane, else the script's title (design §3.2). -->
    <div class="head" @mousedown="onEditorHeadMousedown">
      <div class="bar-slot">
        <ElementBar in-header :away="!editing" />
        <span
          v-show="!barShown || !editing"
          class="name"
          :class="{ over: barShown }"
          data-script-title
          :title="scriptTitle"
        >{{ scriptTitle }}</span>
      </div>
      <div role="group" aria-label="Source view" class="toggles">
        <UTooltip v-for="toggle in TOGGLES" :key="toggle.key" :text="toggle.label" :delay-duration="400">
          <button
            type="button"
            class="icon-toggle"
            :aria-label="toggle.label"
            :aria-pressed="settings[toggle.key] ? 'true' : 'false'"
            @click="set(toggle.key, !settings[toggle.key])"
          >
            <UIcon :name="toggle.icon" class="toggle-icon" aria-hidden="true" />
          </button>
        </UTooltip>
      </div>
    </div>
    <div class="band" aria-hidden="true" />
    <div id="panel-source" class="panel editing" data-tour="source" @keydown="onPanelKeydown">
      <SourcePane :bar="false" />
    </div>
  </section>

  <section
    v-else
    class="pane"
    :class="{ side: props.pane !== 'phone', phone: props.pane === 'phone', barred, inspector }"
    :data-pane="props.pane"
  >
    <div v-if="inspector" ref="head" class="tabs head">
      <div ref="tablist" role="tablist" :aria-label="props.label" class="tablist">
        <button
          v-for="(tab, index) in row.row"
          :id="`tab-${props.pane}-${tab.id}`"
          :key="tab.id"
          type="button"
          role="tab"
          class="tab"
          :class="{ on: tab.id === props.selected, folded: isFolded(tab, index) }"
          :data-folded="isFolded(tab, index) ? 'true' : undefined"
          :aria-selected="tab.id === props.selected ? 'true' : 'false'"
          :aria-controls="props.shown.includes(tab.id) ? `panel-${tab.id}` : undefined"
          :tabindex="tab.id === props.selected ? 0 : -1"
          :aria-label="tab.badge ? tabName(tab) : undefined"
          @click="emit('choose', tab.id)"
          @keydown="onKeydown($event)"
        >
          <UIcon
            v-if="inspector && iconOf(tab)"
            :name="iconOf(tab) as string"
            class="tab-icon"
            aria-hidden="true"
          />{{ labelOf(tab) }}
          <span v-if="tab.id === 'problems' && count > 0" class="badge">{{ count }}</span>
          <span v-else-if="tab.badge" class="badge" aria-hidden="true">{{ tab.badge }}</span>
        </button>
      </div>
      <MenuButton
        v-if="moreTabs.length > 0"
        :items="moreItems"
        :content="{ align: 'start', onCloseAutoFocus: onMoreCloseAutoFocus }"
      >
        <button type="button" class="tab more-button" data-more :aria-label="moreButtonName">
          <span class="more-word">More</span>
          <span v-if="moreProblems > 0" class="badge" aria-hidden="true" data-more-count>{{
            moreProblems
          }}</span>
          <UIcon name="i-lucide-chevron-down" class="chevron" aria-hidden="true" />
        </button>
      </MenuButton>
      <template v-if="inspector">
        <span class="grow" />
        <!-- The view's tools (Call 15). A folded one stays here unseen, to be measured, and shows
             in the panel "⋯" opens. -->
        <div
          :id="INSPECTOR_TOOLS_ID"
          ref="toolsBox"
          class="tools slim"
          :class="{ compact: toolsCompact }"
        >
          <InspectorTools :selected="props.selected" :compact="toolsCompact" />
        </div>
        <UTooltip v-if="toolsFolded" text="More tools" :delay-duration="400">
          <button
            ref="toolsButton"
            type="button"
            class="tab fold-button"
            aria-label="More tools"
            :aria-expanded="toolsOpen ? 'true' : 'false'"
            :aria-controls="toolsOpen ? toolsPanelId : undefined"
            @click="toolsOpen = !toolsOpen"
          >
            <UIcon name="i-lucide-ellipsis" class="tab-icon" aria-hidden="true" />
          </button>
        </UTooltip>
      </template>
    </div>
    <div
      v-if="inspector && toolsFolded && toolsOpen"
      :id="toolsPanelId"
      ref="toolsPanel"
      role="group"
      aria-label="View tools"
      class="tools-panel slim"
      @focusout="onToolsFocusout"
    >
      <InspectorTools :selected="props.selected" />
    </div>
    <!-- The slim bar below 1024px: the Source's toggles, or the view's tools. The top bar names
         the script already, so the Source's row doesn't, and a long title never makes the row
         taller. -->
    <div v-if="!inspector" class="slim">
      <template v-if="props.selected === 'source'">
        <span class="spacer" />
        <div role="group" aria-label="Source view" class="toggles">
          <button
            v-for="toggle in TOGGLES"
            :key="toggle.key"
            type="button"
            class="icon-toggle"
            :aria-label="toggle.label"
            :title="toggle.label"
            :aria-pressed="settings[toggle.key] ? 'true' : 'false'"
            @click="set(toggle.key, !settings[toggle.key])"
          >
            <UIcon :name="toggle.icon" class="toggle-icon" aria-hidden="true" />
          </button>
        </div>
      </template>
      <InspectorTools v-else :selected="props.selected" />
    </div>
    <div v-else-if="!barred" class="band" :class="{ desk: onDesk }" aria-hidden="true" />
    <div
      :id="`panel-${props.selected}`"
      role="tabpanel"
      :aria-labelledby="`tab-${props.pane}-${props.selected}`"
      tabindex="0"
      class="panel"
      :class="{
        editing:
          props.selected === 'source' ||
          props.selected === 'script' ||
          props.selected === 'compare',
      }"
      :data-tour="props.selected"
      @keydown="onPanelKeydown"
    >
      <SourcePane v-if="props.selected === 'source'" />
      <!-- Keyed by the script as well: a tab keeps the context it is drawn with, so another
           script draws it afresh with that script's context. -->
      <ModuleBoundary
        v-else-if="moduleTab"
        :key="`${moduleTab.id}:${contextGeneration()}`"
        :name="moduleTab.module.name"
        what="tab"
      >
        <component :is="moduleTab.module.tab?.component" :context="moduleTab.context" />
      </ModuleBoundary>
      <MarkdownPane v-else-if="props.selected === 'script' && markdown" />
      <ScriptPane v-else-if="props.selected === 'script'" />
      <OutlinePane v-else-if="props.selected === 'outline'" />
      <CardsPane v-else-if="props.selected === 'cards'" />
      <NotesPane v-else-if="props.selected === 'notes'" />
      <StatsPane v-else-if="props.selected === 'stats'" />
      <ScaffoldPane v-else-if="props.selected === 'scaffold'" />
      <ComparePane v-else-if="props.selected === 'compare'" />
      <CutsPane v-else-if="props.selected === 'cuts'" />
      <DraftsPane v-else-if="props.selected === 'drafts'" />
      <DraftStepsPane v-else-if="props.selected === 'draft-steps'" />
      <DraftReader v-else-if="props.selected === 'draft'" />
      <ProblemsPane v-else />
    </div>
    <BottomTabBar
      v-if="props.pane === 'phone'"
      :selected="props.selected"
      :shown="props.shown"
      @choose="emit('choose', $event)"
    />
  </section>
</template>

<style scoped>
.pane {
  position: relative;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  background: var(--bg);
}
/* A pane's 36px header: the editor's name and toggles, or the Inspector's tabs and tools. */
.head {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  min-height: 36px;
  padding: 0 8px;
  overflow: hidden;
  white-space: nowrap;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}
.grow {
  flex: 1 1 0;
  min-width: 0;
}
.name {
  min-width: 0;
  overflow: hidden;
  padding-left: 4px;
  color: var(--muted);
  font-size: 12px;
  text-overflow: ellipsis;
}
.bar-slot {
  position: relative;
  display: flex;
  flex: 1 1 0;
  align-items: center;
  align-self: stretch;
  min-width: 0;
}
/* The title over the (unseen) element bar while focus is in another region. */
.name.over {
  position: absolute;
  top: 50%;
  right: 0;
  left: 0;
  transform: translateY(-50%);
}
.toggles {
  display: flex;
  flex: none;
  gap: 2px;
}
.icon-toggle {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: var(--r-sm);
  background: none;
  color: var(--muted);
  cursor: pointer;
}
.icon-toggle:hover {
  background: var(--raised);
  color: var(--text);
}
/* Pressed: the accent's soft fill, and the icon in the accent's text colour, a second cue where
   the light theme's fill is faint. */
.icon-toggle[aria-pressed='true'] {
  background: var(--accent-soft);
  color: var(--accent-text);
}
.toggle-icon {
  width: 16px;
  height: 16px;
}
@media (forced-colors: active) {
  .icon-toggle[aria-pressed='true'] {
    border: 1px solid CanvasText;
  }
}
/* One pane below 1024px: the slim bar, the view, and the bottom tab bar. */
.pane.phone {
  grid-template-rows: auto minmax(0, 1fr) auto;
}
.tablist {
  position: relative;
  display: flex;
  flex: none;
  gap: 2px;
}
.more-button {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 4px;
}
.chevron {
  width: 12px;
  height: 12px;
}
.tab {
  padding: 7px 10px 9px;
  border: 0;
  border-radius: 7px 7px 0 0;
  background: none;
  color: var(--muted);
  font: 600 13px/1 var(--font-sans);
  white-space: nowrap;
  cursor: pointer;
}
.tab.on {
  background: var(--overlay);
  color: var(--text);
  box-shadow: inset 0 -2px 0 var(--accent-text);
}
/* The Inspector's tabs (design §3.3): icon + label, 32px, the one showing in the text colour over a
   2px accent line, no fill. */
.head .tab {
  position: relative;
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 6px;
  border-radius: var(--r-sm);
  font-weight: 500;
}
.head .tab:hover {
  color: var(--text);
}
.head .tab.on {
  background: none;
  box-shadow: none;
}
.head .tab.on::after {
  position: absolute;
  right: 6px;
  bottom: -2px;
  left: 6px;
  height: 2px;
  border-radius: 2px;
  background: var(--accent-text);
  content: '';
}
.head .tab.folded {
  position: absolute;
  visibility: hidden;
  pointer-events: none;
}
.tab-icon {
  width: 15px;
  height: 15px;
  flex: none;
}
.fold-button {
  justify-content: center;
  width: 30px;
  padding: 0;
}
/* Forced colors (Windows High Contrast) drop the background and the box-shadow, so a border marks
   the selected tab there. */
@media (forced-colors: active) {
  .tab.on {
    border-bottom: 2px solid CanvasText;
  }
}
.slim {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  min-height: 24px;
  padding: 5px 12px;
  background: var(--raised);
  border-bottom: 1px solid var(--border);
  color: var(--muted);
  font-size: 12px;
}
/* The tools in the Inspector's header: one row, right of the tabs, nothing of a bar of their own. */
.head .tools {
  flex: none;
  flex-wrap: nowrap;
  gap: 8px;
  min-height: 0;
  padding: 0;
  background: none;
  border: 0;
}
/* A folded tool: still laid out, to be measured, but neither seen nor reached here; the panel
   "⋯" opens shows it, and only the folded ones. */
.head .tools :deep([data-tool-folded]) {
  position: absolute;
  right: 0;
  visibility: hidden;
  pointer-events: none;
}
.tools-panel :deep([data-tool-shown-above]) {
  display: none;
}
.tools-panel {
  position: absolute;
  z-index: 20;
  top: 38px;
  right: 8px;
  max-width: calc(100% - 16px);
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: var(--r);
  background: var(--overlay);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.3);
}
/* Icon-only: the label stays the button's name and its tooltip (ToolButton). */
.head .tools.compact :deep(.tool-label) {
  display: none;
}
.head .tools.compact :deep(.tool-button) {
  padding-inline: 6px;
}
/* `:deep`, so a view's own tools (CardsSlim) draw their buttons the same. */
.slim :deep(.spacer) {
  flex: 1;
}
.head .tools :deep(.spacer) {
  display: none;
}
.slim :deep(.zoom) {
  display: flex;
  gap: 2px;
}
.slim :deep(.zoom-button) {
  min-height: 24px;
  padding: 0 8px;
  border: 0;
  /* Always there, so the pressed one's line moves nothing. */
  border-bottom: 1px solid transparent;
  border-radius: 5px 5px 0 0;
  background: none;
  color: var(--muted);
  font: inherit;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.slim :deep(.zoom-button[aria-pressed='true']) {
  background: var(--overlay);
  color: var(--text);
  border-bottom-color: var(--accent-text);
}
/* In the header, a choice of two (Fit · 100%, the card sizes) is a segmented control. */
.head .tools :deep(.zoom),
.tools-panel :deep(.zoom) {
  padding: 2px;
  border-radius: 7px;
  background: var(--raised);
}
.head .tools :deep(.zoom .zoom-button),
.tools-panel :deep(.zoom .zoom-button) {
  border-bottom: 0;
  border-radius: 5px;
}
.head .tools :deep(.zoom .zoom-button[aria-pressed='true']),
.tools-panel :deep(.zoom .zoom-button[aria-pressed='true']) {
  background: var(--overlay);
  color: var(--text);
  box-shadow: inset 0 -2px 0 var(--accent-text);
}
.head .tools :deep(.zoom-button),
.tools-panel :deep(.zoom-button) {
  border-radius: 5px;
}
/* Forced colors drops the background, so a border marks the pressed one. */
@media (forced-colors: active) {
  .slim :deep(.zoom-button[aria-pressed='true']) {
    border: 1px solid CanvasText;
  }
}
.slim :deep(.fix-all) {
  min-height: 24px;
  padding: 0 10px;
  border: 1px solid var(--accent-text);
  border-radius: 5px;
  background: none;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.panel {
  min-height: 0;
  overflow: auto;
}
/* The editor, the Script view, and Compare scroll themselves. */
.panel.editing {
  overflow: hidden;
}
.band {
  background: var(--bg);
}
.band.desk {
  background: var(--desk);
}
.badge {
  margin-left: 4px;
  padding: 1px 6px;
  border-radius: 9px;
  background: var(--raised);
  color: var(--text);
  font-size: 11px;
}
.head .badge {
  margin-left: 0;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--raised);
}
.tab.on .badge {
  background: var(--surface);
}
@media (forced-colors: active) {
  .badge {
    border: 1px solid CanvasText;
  }
}
</style>

<style>
/* Side by side, the two panes share the rows of index.vue's grid (the header, a second bar, and the
   text), so the first lines of text in both start at the same height (decided 2026-10-29). A pane
   without a second bar fills that row with a band of its text's background; a pane with one (the
   Source's element bar, the Outline's filter) puts it in that row, and the part under it scrolls
   itself. Unscoped, to reach into the tabs' panes; a phone's one pane keeps the layout above. */
@supports (grid-template-rows: subgrid) {
  .panes.wide > .pane.side {
    grid-template-rows: subgrid;
  }
  /* WebKit sizes a subgrid's row by a bar's min-height instead of its content. */
  .pane.side.barred > .panel > * > [data-pane-bar] {
    min-height: auto;
  }
  .pane.side > .head {
    grid-row: 1;
  }
  .pane.side > .band {
    grid-row: 2;
  }
  .pane.side > .panel {
    grid-row: 3;
  }
  .pane.side.barred > .panel {
    display: grid;
    grid-row: 2 / span 2;
    grid-template-rows: subgrid;
    overflow: hidden;
  }
  .pane.side.barred > .panel > * {
    display: grid;
    grid-row: 1 / -1;
    grid-template-rows: subgrid;
    height: auto;
    min-height: 0;
  }
  .pane.side.barred > .panel > * > [data-pane-bar] {
    grid-row: 1;
  }
  .pane.side.barred > .panel > * > :not([data-pane-bar]) {
    grid-row: 2;
    min-height: 0;
  }
  /* The editor scrolls itself already; the Outline's tree does here, under its filter. */
  .pane.side.barred > .panel > .outline > :not([data-pane-bar]) {
    overflow: auto;
  }
  /* Under the bars, the Source's first line has the editor's 12px of padding over it and half its
     line's leading inside it. The other panes' first text stands level with that: the Script's
     page and Compare's first box (a page's margin above its first line belongs to the page), the
     Preview's first line (its sheet starts at the top), and the first row or words of the rest. */
  .pane.side :is(.script-host, .compare-host) {
    padding-top: calc(12px + 2px * var(--text-scale, 1));
  }
  .pane.side .preview {
    padding-top: 0;
  }
  .pane.side .preview .sheet {
    padding-top: calc(11px + 2px * var(--text-scale, 1));
  }
  .pane.side .panel > * > .empty:first-child {
    padding-top: 12px;
  }
  .pane.side .problems > .problem:first-child {
    padding-top: 7px;
  }
  /* As tall as the element bar, so neither stretches the other. */
  .pane.side .outline > .tools {
    padding-block: 0;
  }
}
</style>
