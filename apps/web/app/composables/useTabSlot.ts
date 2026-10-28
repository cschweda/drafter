import type { TabId } from '~/utils/panes';

/**
 * The tab other than the core four that was chosen last, in any pane (Phase 2 design §5.8): it
 * keeps the tab row's one slot after the pane goes back to a core tab. For this visit only.
 */
export function useTabSlot() {
  return useState<TabId | null>('tab-slot', () => null);
}
