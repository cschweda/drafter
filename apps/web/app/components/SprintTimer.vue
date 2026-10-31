<script setup lang="ts">
import { useEditor } from '~/editor/session';
import { clockText, useSprint } from '~/stats/sprint';

// A sprint's time left, with Pause, Stop, and Hide (WCAG 2.2.2), in the status bar and in focus
// mode's corner marker. It is plain text in a group: not a live region and not a `timer`, so a
// screen reader is never told the time as it passes. The end is announced elsewhere, once
// (`SprintNotice`). Under reduced motion it shows whole minutes and changes once a minute.
const { state, hidden, pause, resume, stop } = useSprint();
const { view } = useEditor();

const reduced = ref(false);
let query: MediaQueryList | undefined;
const onChange = () => {
  reduced.value = !!query?.matches;
};
onMounted(() => {
  query = window.matchMedia('(prefers-reduced-motion: reduce)');
  onChange();
  query.addEventListener('change', onChange);
});
onBeforeUnmount(() => query?.removeEventListener('change', onChange));

const paused = computed(() => state.value.status === 'paused');
const text = computed(() => {
  const now = state.value;
  if (now.status === 'idle') return '';
  return `${paused.value ? 'Paused · ' : ''}${clockText(now.remaining, reduced.value)} left`;
});

const group = ref<HTMLElement>();
const showButton = ref<HTMLButtonElement>();
const pauseButton = ref<HTMLButtonElement>();

// A control that goes away (Stop, or the end of the sprint) must not take focus with it.
watch(
  () => state.value.status === 'idle',
  async (idle) => {
    if (!idle || !group.value?.contains(document.activeElement)) return;
    await nextTick();
    view.focus();
  },
  { flush: 'pre' },
);

function onPause() {
  if (paused.value) resume();
  else pause();
}

async function onHide() {
  hidden.value = true;
  await nextTick();
  showButton.value?.focus();
}

async function onShow() {
  hidden.value = false;
  await nextTick();
  pauseButton.value?.focus();
}
</script>

<template>
  <span v-if="state.status !== 'idle'" ref="group" class="sprint" role="group" aria-label="Sprint" data-sprint>
    <template v-if="!hidden">
      <span class="time" data-sprint-time>{{ text }}</span>
      <button ref="pauseButton" type="button" @click="onPause">{{ paused ? 'Resume' : 'Pause' }}</button>
      <button type="button" @click="stop">Stop</button>
      <button type="button" @click="onHide">Hide</button>
    </template>
    <button v-else ref="showButton" type="button" @click="onShow">Show sprint</button>
  </span>
</template>

<style scoped>
.sprint {
  display: inline-flex;
  align-items: center;
  gap: 0 2px;
  white-space: nowrap;
}
.time {
  padding: 0 4px;
  font-variant-numeric: tabular-nums;
}
/* Borderless buttons that fill on hover, as the status bar's are (fresh-look design §3.4, §5). */
button {
  display: inline-flex;
  align-items: center;
  /* A 24px target (WCAG 2.5.8); the status bar's row draws them a little shorter, far apart. */
  min-height: 24px;
  padding: 0 6px;
  border: 0;
  border-radius: var(--r-sm);
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
button:hover {
  background: var(--raised);
  color: var(--text);
}
</style>
