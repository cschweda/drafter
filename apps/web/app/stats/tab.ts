import { nextTick } from 'vue';
import { useFocusMode } from '~/composables/useFocusMode';
import { usePanes } from '~/composables/usePanes';
import { openBeside, STATS_TAB_ID, WIDE_QUERY } from '~/utils/panes';

// Opening the Stats tab (seeing-the-script design §4.1): Show stats and the Counts panel's Stats…
// open it in the pane not showing Source, as Compare opens, or as the one pane's tab on a phone,
// and focus goes to a section's heading.

export type StatsSection = 'overview' | 'characters' | 'grid';

/** The id of a section's heading in StatsPane, which focus and the links at the top go to. */
export const sectionHeadingId = (section: StatsSection): string => `stats-${section}`;

/** Shows the Stats tab, then puts focus on `section`'s heading (or the tab's panel without one). */
export function showStats(section: StatsSection = 'overview'): void {
  // Focus mode shows only the Source.
  useFocusMode().leave();
  const panes = usePanes();
  if (window.matchMedia(WIDE_QUERY).matches) {
    panes.tabs.value = openBeside(panes.tabs.value, STATS_TAB_ID);
  } else {
    panes.phoneTab.value = STATS_TAB_ID;
  }
  void nextTick().then(() => {
    const heading = document.getElementById(sectionHeadingId(section));
    const target = heading ?? document.getElementById(`panel-${STATS_TAB_ID}`);
    target?.focus();
    heading?.scrollIntoView?.({ block: 'start' });
  });
}
