import type { Ref } from 'vue';
import { nextTick, watch } from 'vue';
import type { CastBasis } from '../cast/use-cast';
import { useEditor } from '../editor/session';
import { useOutline } from '../outline/use-outline';
import type { SpokenLine } from './lines';
import { SCAFFOLD_HEADING_ID } from './show';

// Going from a Scaffold page to the script (seeing-the-script design §5.7): the cursor goes there
// and the Source scrolls to it, while focus stays in Scaffold, as the scene page's Go to does. A
// page's tables are read from the cast's basis, which the writer may have typed past since, so a
// scene is found again by its id, never by its place, and a cue by where it sits in its scene.

/** Puts the cursor at the heading of the scene whose session id is `id`, if it is still there. */
export function goToSceneId(id: string | undefined): void {
  const item = id === undefined ? undefined : useOutline().itemById(id);
  if (item) useEditor().goto(item.span.from, { keepFocus: true });
}

/**
 * Puts the cursor at a line's cue: in a scene, as far into the scene (found by its id) as the cue
 * was when the cast was worked out, never past its end; outside the scenes, where it was.
 */
export function goToCue(basis: CastBasis, line: SpokenLine): void {
  const cue = basis.doc.blocks[line.block]?.span.from;
  if (cue === undefined) return;
  if (line.scene === null) {
    useEditor().goto(cue, { keepFocus: true });
    return;
  }
  const then = basis.index.scenes[line.scene];
  const id = basis.ids[line.scene];
  const now = id === undefined ? undefined : useOutline().itemById(id);
  if (!then || !now) return;
  const at = Math.min(now.span.to, now.span.from + (cue - then.span.from));
  useEditor().goto(at, { keepFocus: true });
}

/**
 * When the page's subject leaves the script (`gone` turns true) while focus is inside `root`, the
 * control that had it goes, and focus goes to the page's heading rather than to nowhere.
 */
export function rescueFocus(
  root: Readonly<Ref<HTMLElement | undefined>>,
  gone: Readonly<Ref<boolean>>,
) {
  watch(
    gone,
    (now) => {
      const el = root.value;
      if (!now || !el?.contains(document.activeElement)) return;
      void nextTick().then(() => document.getElementById(SCAFFOLD_HEADING_ID)?.focus());
    },
    // Before the page is drawn again, while the control with focus is still there.
    { flush: 'pre' },
  );
}
