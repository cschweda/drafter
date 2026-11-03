<script setup lang="ts">
import { useEditor } from '~/editor/session';
import { CLASSIC_TIP, FOUNTAIN_TIP, setWritingMode } from '~/editor/writing-mode';
import { useSettings, type WritingMode } from '~/settings/settings';

// Fountain | Classic (Classic Mode design §3.2), which stays in sight the whole time a script is
// being written: in the top bar, and in focus mode's marker. Both words show on a wide screen, as
// the choice is the point; below 1024px, and in the marker, it's the word in use, and a tap switches.
// A Markdown document has no marks to type or not, so there it isn't shown at all. No transition.
const props = defineProps<{ compact?: boolean }>();

const { kind } = useEditor();
const { settings } = useSettings();
const wide = useWideScreen();

const MODES: ReadonlyArray<{ mode: WritingMode; word: string; tip: string }> = [
  { mode: 'fountain', word: 'Fountain', tip: FOUNTAIN_TIP },
  { mode: 'classic', word: 'Classic', tip: CLASSIC_TIP },
];
const current = computed(() => settings.value.writingMode);
const now = computed(() => MODES.find(({ mode }) => mode === current.value) ?? MODES[0]);
const other = computed(() => MODES.find(({ mode }) => mode !== current.value) ?? MODES[1]);
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
        v-for="{ mode, word, tip } in MODES"
        :key="mode"
        type="button"
        class="mode-button"
        :title="tip"
        :aria-pressed="current === mode ? 'true' : 'false'"
        @click="setWritingMode(mode)"
      >
        {{ word }}
      </button>
    </div>
    <button
      v-else
      type="button"
      class="mode-button mode-one"
      data-tour="mode"
      :title="now?.tip"
      :aria-label="`Writing mode: ${now?.word}. Switch to ${other?.word}.`"
      @click="setWritingMode(other?.mode ?? 'fountain')"
    >
      {{ now?.word }}
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
