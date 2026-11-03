<script setup lang="ts">
import { useEditor } from '~/editor/session';
import { CLASSIC_HELP } from '~/editor/writing-mode';
import { useSettings } from '~/settings/settings';

// The first-run hint (Classic Mode design §9.3): a small card under the top bar, the first time
// Classic Mode is on, which stays until dismissed. It takes no focus, so the writer can go on
// typing, and a screen reader hears it through a polite live region that's there before its words.
// A Markdown document has no Classic keys, so the card waits for a script.
const HINT =
  'Classic Mode. Press Enter and Tab to move through the script, and Enter on an empty line to choose an element. Your file stays Fountain. To leave the text, press Esc, then Tab; if a list is open, press Esc twice.';

const { settings, set } = useSettings();
const { kind, view } = useEditor();
const shown = computed(
  () =>
    settings.value.writingMode === 'classic' &&
    !settings.value.classicHintSeen &&
    kind.value === 'fountain',
);

// Set after the region is drawn: a live region that first appears with its words says nothing.
const said = ref('');
onMounted(() => {
  watch(
    shown,
    (now) => {
      said.value = now ? HINT : '';
    },
    { immediate: true },
  );
});

const card = ref<HTMLElement>();
function seen() {
  // A press from the keyboard has focus in the card, which is about to go: it goes back to the text.
  const inCard = card.value?.contains(document.activeElement);
  void set('classicHintSeen', true);
  if (inCard) view.focus();
}
function learnMore() {
  window.open(CLASSIC_HELP, '_blank');
  seen();
}
</script>

<template>
  <!-- One box, with no height until the card shows: the region is out of the flow. -->
  <div>
    <div class="sr-only" aria-live="polite" aria-atomic="true" data-classic-hint-said>{{ said }}</div>
    <div
      v-if="shown"
      ref="card"
      class="hint"
      role="group"
      aria-label="Classic Mode hint"
      data-classic-hint
    >
      <p class="words">{{ HINT }}</p>
      <button type="button" class="action" @mousedown.prevent @click="seen">Got it</button>
      <button type="button" class="action" @mousedown.prevent @click="learnMore">Learn more</button>
    </div>
  </div>
</template>

<style scoped>
.hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  padding: 6px 10px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  color: var(--text);
  font-size: 13px;
  line-height: 1.4;
}
.words {
  flex: 1 1 20rem;
  min-width: 0;
  margin: 0;
}
.action {
  min-height: 24px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--r-sm);
  background: var(--raised);
  color: var(--text);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
.action:hover {
  background: var(--overlay);
}
</style>
