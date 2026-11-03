<script setup lang="ts">
import { useEditor } from '~/editor/session';
import { CLASSIC_TIP, FOUNTAIN_TIP, setWritingMode } from '~/editor/writing-mode';
import { useSettings, WRITING_MODES, type WritingMode } from '~/settings/settings';

// Fountain | Classic (Classic Mode design §3.2), which stays in sight the whole time a script is
// being written: in the top bar, and in focus mode's marker. Both words show on a wide screen, as
// the choice is the point; below 1024px, and in the marker, it's the word in use, and a tap switches.
// A Markdown document has no marks to type or not, so there it isn't shown at all. No transition.
const props = defineProps<{ compact?: boolean }>();

const { kind } = useEditor();
const { settings } = useSettings();
const wide = useWideScreen();

const MODES: Readonly<Record<WritingMode, { word: string; tip: string }>> = {
  fountain: { word: 'Fountain', tip: FOUNTAIN_TIP },
  classic: { word: 'Classic', tip: CLASSIC_TIP },
};
const current = computed(() => settings.value.writingMode);
const next = computed<WritingMode>(() => (current.value === 'classic' ? 'fountain' : 'classic'));
</script>

<template>
  <template v-if="kind === 'fountain'">
    <div
      v-if="wide && !props.compact"
      role="group"
      aria-label="Writing mode"
      class="mode-switch"
      data-tour="mode"
    >
      <button
        v-for="mode in WRITING_MODES"
        :key="mode"
        type="button"
        class="mode-button"
        :title="MODES[mode].tip"
        :aria-pressed="current === mode ? 'true' : 'false'"
        @click="setWritingMode(mode)"
      >
        {{ MODES[mode].word }}
      </button>
    </div>
    <button
      v-else
      type="button"
      class="mode-button mode-one"
      data-tour="mode"
      :title="MODES[current].tip"
      :aria-label="`Writing mode: ${MODES[current].word}. Switch to ${MODES[next].word}.`"
      @click="setWritingMode(next)"
    >
      {{ MODES[current].word }}
    </button>
  </template>
</template>

<style scoped>
.mode-switch {
  display: inline-flex;
  flex: none;
  gap: 2px;
  padding: 2px;
  border-radius: var(--r-sm);
  background: var(--raised);
}
.mode-button {
  flex: none;
  min-height: 24px;
  padding: 0 9px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}
.mode-button:hover {
  color: var(--text);
}
.mode-button:focus-visible {
  outline: 2px solid var(--accent-text);
  outline-offset: 1px;
}
.mode-button[aria-pressed='true'],
.mode-one {
  border-color: var(--accent-text);
  background: var(--accent-soft);
  color: var(--accent-text);
  font-weight: 600;
}
@media (forced-colors: active) {
  .mode-button[aria-pressed='true'],
  .mode-one {
    border-color: CanvasText;
  }
}
</style>
