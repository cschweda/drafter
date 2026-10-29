<script setup lang="ts">
import type { SpellMark } from '@drafter/cm-fountain';
import type { DropdownMenuItem } from '@nuxt/ui';
import { useEditor } from '~/editor/session';
import { useOutline } from '~/outline/use-outline';
import { addToMine, ignoreWordHere, replaceWord, tryAddToScript } from '~/spell/actions';
import { type SpellMenuRequest, spellMenu } from '~/spell/menu';
import { spellMenuItems } from '~/spell/menu-items';
import { saySpell } from '~/spell/notice';
import { useSpell } from '~/spell/use-spell';

// The spelling menu (Phase 2 design §12; Plan D): a MenuButton, as every menu is, whose trigger is
// a 1×1 button placed where the request says (under the word, or by the phone's button) and opened
// as the request arrives. It is non-modal: Escape and Tab close it, and the editor gets focus back
// with its cursor where it was; a suggestion leaves the cursor after the word it put in. Each
// action runs once the menu has closed and given focus back, on the word as it is then.

const editor = useEditor();
const spell = useSpell();
const outline = useOutline();

const open = ref(false);
/** The request the menu is for; kept after it closes, so the trigger stays where it was. */
const current = shallowRef<SpellMenuRequest | null>(null);
/** The word's suggestions, or null while they are coming. */
const suggestions = shallowRef<readonly string[] | null>(null);
/** What to do once the menu has closed. */
let after: (() => void) | null = null;

watch(spellMenu, async (request) => {
  if (!request) return;
  // Taken, so the same word asked for again is a new request.
  spellMenu.value = null;
  current.value = request;
  suggestions.value = null;
  open.value = false;
  // The trigger is moved first, so the menu opens by it.
  await nextTick();
  open.value = true;
  const found = await spell.suggest(request.mark.word);
  if (current.value === request) suggestions.value = found;
});

/** Runs `act` on the word once the menu has closed and given focus back. */
const later = (act: (mark: SpellMark) => void) => {
  const mark = current.value?.mark;
  if (mark) after = () => act(mark);
};

const hooks = {
  replace: (suggestion: string) =>
    later((mark) => {
      if (!replaceWord(editor.view, mark, suggestion)) {
        void saySpell('Nothing was changed: the word isn’t there now, or this tab can’t edit it.');
      }
    }),
  addToScript: () =>
    later((mark) =>
      tryAddToScript(editor.view, mark.word, editor.kind.value, outline.locked.value),
    ),
  addToMine: () => later((mark) => void addToMine(editor.view, mark.word)),
  ignore: () => later((mark) => ignoreWordHere(editor.view, mark)),
};

const items = computed<DropdownMenuItem[][]>(() =>
  current.value && open.value
    ? spellMenuItems(editor.view, suggestions.value, editor.kind.value, outline.locked.value, hooks)
    : [],
);

function onCloseAutoFocus(event: Event) {
  event.preventDefault();
  const act = after;
  after = null;
  requestAnimationFrame(() => {
    act?.();
    // Not when the menu closed because something else was clicked: focus is that thing's.
    const active = document.activeElement;
    if (act || !active || active === document.body) editor.view.focus();
  });
}

const CONTENT = { align: 'start' as const, sideOffset: 2, onCloseAutoFocus };

const place = computed(() => {
  const at = current.value?.at;
  return at ? { left: `${at.left}px`, top: `${at.top}px` } : undefined;
});
</script>

<template>
  <MenuButton v-if="current" v-model:open="open" :items="items" :content="CONTENT">
    <button
      type="button"
      class="spell-anchor"
      tabindex="-1"
      aria-label="Spelling suggestions"
      :style="place"
    />
  </MenuButton>
</template>

<style scoped>
/* Where the menu opens from, and nothing to see or point at itself. */
.spell-anchor {
  position: fixed;
  width: 1px;
  height: 1px;
  padding: 0;
  border: 0;
  opacity: 0;
  pointer-events: none;
}
</style>
