import { nextTick } from 'vue';
import { useFocusMode } from '~/composables/useFocusMode';
import { usePanes } from '~/composables/usePanes';
import { openBeside, SCAFFOLD_TAB_ID, WIDE_QUERY } from '~/utils/panes';
import { type ScaffoldPage, useScaffold } from './session';

// Opening Scaffold (seeing-the-script design §5.1, §5.6): Show Scaffold opens the tab beside the
// Source, in the pane not showing it, as the Stats tab opens (or as the phone's one pane's tab), on
// the scene page following the cursor, as a fresh visit would (the controller's ruling on Task 6);
// Scaffold for this scene opens it on that scene, pinned. Focus goes to the page's heading, or to
// a section's (a character's Scenes, from a scene page's "{n} more"). Inside the tab, a link opens
// another page and Back returns (§5.7); focus goes to the new page's heading as well.

/** The id of the shown page's heading, which focus goes to when the tab or a page opens. */
export const SCAFFOLD_HEADING_ID = 'scaffold-heading';

/** The id of a character page's Scenes heading, which a scene page's "{n} more" goes to. */
export const SCAFFOLD_SCENES_ID = 'scaffold-scenes';

/** Puts focus on the element `id` once the page is drawn, else on the page's heading. */
function focusLater(id: string) {
  void nextTick().then(() => {
    const target = document.getElementById(id) ?? document.getElementById(SCAFFOLD_HEADING_ID);
    (target ?? document.getElementById(`panel-${SCAFFOLD_TAB_ID}`))?.focus();
  });
}

/** Opens `page` in the Scaffold tab already shown (a link on a page), focus on `focus`. */
export function goScaffold(page: ScaffoldPage, focus: string = SCAFFOLD_HEADING_ID): void {
  useScaffold().open(page);
  focusLater(focus);
}

/** Back, from the tab's slim bar or Alt+Left: focus goes to the page shown again's heading. */
export function scaffoldBack(): void {
  if (useScaffold().back()) focusLater(SCAFFOLD_HEADING_ID);
}

/**
 * Shows the Scaffold tab on `page`, or without one on the cursor's scene, following, and puts focus
 * on the page's heading (or on `focus`).
 */
export function showScaffold(
  page: ScaffoldPage = { kind: 'scene', pinned: null },
  focus: string = SCAFFOLD_HEADING_ID,
): void {
  // Focus mode shows only the Source.
  useFocusMode().leave();
  useScaffold().open(page);
  const panes = usePanes();
  if (window.matchMedia(WIDE_QUERY).matches) {
    panes.tabs.value = openBeside(panes.tabs.value, SCAFFOLD_TAB_ID);
  } else {
    panes.phoneTab.value = SCAFFOLD_TAB_ID;
  }
  focusLater(focus);
}
