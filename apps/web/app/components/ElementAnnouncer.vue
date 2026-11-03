<script setup lang="ts">
import { structureOf } from '@drafter/cm-fountain';
import { announcer } from '~/editor/element-announcer';
import { classicElementName, ELEMENT_NAMES } from '~/editor/element-names';
import { useEditor } from '~/editor/session';
import { useSettings } from '~/settings/settings';

// A visually hidden live region: when the cursor moves to another kind of element, it says which,
// in words. In Fountain Mode a blank line has no element, so it says nothing (technical design §13).
// In Classic Mode it reads `element`, so it says a pending element too, and every key that moves
// says where it went, even when the word is the same (Classic Mode design §12).
const { cursor, element, kind, moved, template } = useEditor();
const { settings } = useSettings();

const classic = computed(
  () => settings.value.writingMode === 'classic' && kind.value === 'fountain',
);
const word = computed(() => {
  if (classic.value) {
    return element.value ? classicElementName(element.value, structureOf(template.value)) : '';
  }
  const now = cursor.value?.kind;
  return now ? ELEMENT_NAMES[now] : '';
});
const announcement = announcer(
  () => word.value,
  () => moved.value,
);
</script>

<template>
  <div class="announcer sr-only" aria-live="polite" aria-atomic="true">{{ announcement }}</div>
</template>
