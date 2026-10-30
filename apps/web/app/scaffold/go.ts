import type { Ref } from 'vue';
import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue';
import type { CastBasis } from '../cast/use-cast';
import { useEditor } from '../editor/session';
import { useOutline } from '../outline/use-outline';
import { cueTarget, type SpokenLine } from './lines';
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
 * Puts the cursor at a line's cue: as far into its scene or section's own stretch (found by its id)
 * as the cue was when the cast was worked out, at the start of that line (`cueTarget`); in the
 * opening, where it was.
 */
export function goToCue(basis: CastBasis, line: SpokenLine): void {
  const editor = useEditor();
  const outline = useOutline();
  const text = editor.view.state.doc;
  const first = outline.index.value.items[0]?.span.from ?? text.length;
  const at = cueTarget(
    basis,
    line,
    { itemById: outline.itemById, first },
    (n) => text.lineAt(Math.min(text.length, Math.max(0, n))).from,
  );
  if (at !== null) editor.goto(at, { keepFocus: true });
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

/**
 * When a row with focus in it is taken out of `root` (its scene left the script, or the writer's
 * edit moved it out of the table), focus goes to `heading` (the table's caption) rather than to
 * nowhere. The element that had focus is remembered while it has it; a removal is seen by a
 * MutationObserver, as no browser reliably says when a focused element is removed.
 */
export function keepFocusOnRemoval(
  root: Readonly<Ref<HTMLElement | undefined>>,
  heading: () => HTMLElement | null,
) {
  let held: Element | null = null;
  const onFocusIn = (event: FocusEvent) => {
    held = event.target instanceof Element ? event.target : null;
  };
  // Focus moved on by the writer: the element is still there, so let it go.
  const onFocusOut = () => {
    queueMicrotask(() => {
      if (held?.isConnected) held = null;
    });
  };
  const observer =
    typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(() => {
          if (!held || held.isConnected) return;
          held = null;
          const active = document.activeElement;
          if (active && active !== document.body) return;
          heading()?.focus();
        });
  onMounted(() => {
    const el = root.value;
    if (!el) return;
    el.addEventListener('focusin', onFocusIn);
    el.addEventListener('focusout', onFocusOut);
    observer?.observe(el, { childList: true, subtree: true });
  });
  onBeforeUnmount(() => {
    observer?.disconnect();
    root.value?.removeEventListener('focusin', onFocusIn);
    root.value?.removeEventListener('focusout', onFocusOut);
  });
}
