import { nextTick } from 'vue';
import { useFocusMode } from '../composables/useFocusMode';
import { usePanes } from '../composables/usePanes';
import { useTabSlot } from '../composables/useTabSlot';
import { useEditor } from '../editor/session';
import {
  dropTab,
  PHONE_DEFAULT_TAB,
  showInInspector,
  type TabId,
  WIDE_QUERY,
} from '../utils/panes';

// The Drafts list and the draft being read are tabs that exist only while open, placed as Compare
// and Deleted scenes are (version-history design §9): in the Inspector beside the Source on a wide
// screen, the one pane on a phone.

const wide = () => window.matchMedia(WIDE_QUERY).matches;

/** Shows tab `id`, leaving focus mode, and focuses its panel unless `focusPanel` is false. */
export function showTempTab(id: TabId, focusPanel = true): void {
  const panes = usePanes();
  useFocusMode().leave();
  if (wide()) panes.tabs.value = showInInspector(panes.tabs.value, id);
  else panes.phoneTab.value = id;
  if (focusPanel) void nextTick().then(() => document.getElementById(`panel-${id}`)?.focus());
}

/** Whether a pane shows tab `id` now. */
export function tempTabShown(id: TabId): boolean {
  const panes = usePanes();
  return wide() ? panes.tabs.value.right === id : panes.phoneTab.value === id;
}

/**
 * Takes tab `id` away: the pane that showed it shows a core tab. Focus that was in it (or, with
 * `refocus`, wherever it was) goes to the tab that replaces it.
 */
export function closeTempTab(id: TabId, refocus = false): void {
  const panes = usePanes();
  const slot = useTabSlot();
  const editor = useEditor();
  const shownIn = document.getElementById(`panel-${id}`)?.closest('[data-pane]');
  const held = refocus || (!!shownIn && shownIn.contains(document.activeElement));
  let after: TabId | null = null;
  const tabs = panes.tabs.value;
  if (tabs.left === id || tabs.right === id) {
    const pane = tabs.left === id ? 'left' : 'right';
    panes.tabs.value = dropTab(tabs, id);
    if (wide()) after = panes.tabs.value[pane];
  }
  if (panes.phoneTab.value === id) {
    panes.phoneTab.value = PHONE_DEFAULT_TAB;
    if (!wide()) after = PHONE_DEFAULT_TAB;
  }
  if (slot.value === id) slot.value = null;
  if (held && after) {
    const panel = after;
    void nextTick().then(() => {
      if (panel === 'source') editor.view.focus();
      else document.getElementById(`panel-${panel}`)?.focus();
    });
  }
}
