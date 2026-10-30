import { nextTick } from 'vue';
import { useFocusMode } from '~/composables/useFocusMode';
import { usePanes } from '~/composables/usePanes';
import { openBeside, SCAFFOLD_TAB_ID, WIDE_QUERY } from '~/utils/panes';
import { type ScaffoldPage, useScaffold } from './session';

// Opening Scaffold (seeing-the-script design §5.1, §5.6): Show Scaffold opens the tab beside the
// Source, in the pane not showing it, as the Stats tab opens (or as the phone's one pane's tab), on
// the scene page following the cursor, as a fresh visit would (the controller's ruling on Task 6);
// Scaffold for this scene opens it on that scene, pinned. Focus goes to the page's heading.

/** The id of the shown page's heading, which focus goes to when the tab or a page opens. */
export const SCAFFOLD_HEADING_ID = 'scaffold-heading';

/**
 * Shows the Scaffold tab on `page`, or without one on the cursor's scene, following, and puts focus
 * on the page's heading.
 */
export function showScaffold(page: ScaffoldPage = { kind: 'scene', pinned: null }): void {
  // Focus mode shows only the Source.
  useFocusMode().leave();
  useScaffold().open(page);
  const panes = usePanes();
  if (window.matchMedia(WIDE_QUERY).matches) {
    panes.tabs.value = openBeside(panes.tabs.value, SCAFFOLD_TAB_ID);
  } else {
    panes.phoneTab.value = SCAFFOLD_TAB_ID;
  }
  void nextTick().then(() => {
    const heading = document.getElementById(SCAFFOLD_HEADING_ID);
    (heading ?? document.getElementById(`panel-${SCAFFOLD_TAB_ID}`))?.focus();
  });
}
