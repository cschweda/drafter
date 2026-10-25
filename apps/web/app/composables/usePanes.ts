import {
  chooseTab,
  clampSplit,
  DEFAULT_TABS,
  type PaneId,
  type PaneTabs,
  PHONE_DEFAULT_TAB,
  SPLIT,
  type TabId,
} from '~/utils/panes';

/** The panes' tabs and split, shared across the app for this visit. */
export function usePanes() {
  const tabs = useState<PaneTabs>('pane-tabs', () => ({ ...DEFAULT_TABS }));
  const phoneTab = useState<TabId>('phone-tab', () => PHONE_DEFAULT_TAB);
  const split = useState<number>('pane-split', () => SPLIT.initial);

  function choose(pane: PaneId, tab: TabId) {
    tabs.value = chooseTab(tabs.value, pane, tab);
  }

  function resize(ratio: number) {
    split.value = clampSplit(ratio);
  }

  return { tabs, phoneTab, split, choose, resize };
}
