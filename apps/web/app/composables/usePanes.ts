import {
  clampSplit,
  DEFAULT_TABS,
  type PaneState,
  PHONE_DEFAULT_TAB,
  SPLIT,
  showInInspector,
  type TabId,
} from '~/utils/panes';

/**
 * The panes' tabs and split, shared across the app for this visit (nothing is stored, so there is
 * no old layout to move). On a wide screen `tabs.left` is always the editor and `tabs.right` the
 * Inspector's view; a phone shows `phoneTab` alone.
 */
export function usePanes() {
  const tabs = useState<PaneState>('pane-tabs', () => ({ ...DEFAULT_TABS }));
  const phoneTab = useState<TabId>('phone-tab', () => PHONE_DEFAULT_TAB);
  const split = useState<number>('pane-split', () => SPLIT.initial);

  /** Shows `tab` in the Inspector; the editor stays on the left. */
  function inspect(tab: TabId) {
    tabs.value = showInInspector(tabs.value, tab);
  }

  function resize(ratio: number) {
    split.value = clampSplit(ratio);
  }

  return { tabs, phoneTab, split, inspect, resize };
}
