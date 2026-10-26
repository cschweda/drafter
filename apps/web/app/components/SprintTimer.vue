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
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 10px;
}
.time {
  font-variant-numeric: tabular-nums;
}
button {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
  cursor: pointer;
}
button:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
</style>
