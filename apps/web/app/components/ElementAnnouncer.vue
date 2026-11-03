<script setup lang="ts">
import { structureOf } from '@drafter/cm-fountain';
import { announcedWord, announcer } from '~/editor/element-announcer';
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
const word = computed(() =>
  announcedWord(
    classic.value,
    element.value,
    cursor.value?.kind ?? null,
    structureOf(template.value),
  ),
);
const announcement = announcer(
  () => word.value,
  () => moved.value,
  () => (classic.value ? 'classic' : 'fountain'),
);
</script>

<template>
  <div class="announcer sr-only" aria-live="polite" aria-atomic="true">{{ announcement }}</div>
</template>
