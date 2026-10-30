<script setup lang="ts">
import type { SpokenLine } from '~/scaffold/lines';
import { LINES_SHOWN } from '~/scaffold/pages';

// A character's Lines (seeing-the-script design §5.3, Call 29): every speech's printed text, in the
// script's face, grouped under the heading of the scene it is in, each a button that puts the
// cursor at its cue. A lead's hundreds open quickly: the first LINES_SHOWN, then "Show all {n}
// speeches", which shows the rest and puts focus on the first of them.
const props = defineProps<{
  lines: readonly SpokenLine[];
  /** A group's heading: the scene's title, or where a speech outside the scenes is. */
  title: (scene: number | null, before: boolean) => string;
}>();
const emit = defineEmits<{ go: [line: SpokenLine] }>();

const all = ref(false);
const shown = computed(() => (all.value ? props.lines : props.lines.slice(0, LINES_SHOWN)));
/** Runs of lines in one scene (or outside the scenes), in order. */
const groups = computed(() => {
  const out: Array<{
    scene: number | null;
    heading: string;
    lines: Array<{ at: number; line: SpokenLine }>;
  }> = [];
  let seenScene = false;
  shown.value.forEach((line, at) => {
    const last = out.at(-1);
    if (last && last.scene === line.scene) {
      last.lines.push({ at, line });
      return;
    }
    out.push({
      scene: line.scene,
      heading: props.title(line.scene, !seenScene),
      lines: [{ at, line }],
    });
    if (line.scene !== null) seenScene = true;
  });
  return out;
});
const lineId = (at: number) => `scaffold-line-${at}`;

function showAll() {
  all.value = true;
  void nextTick(() => document.getElementById(lineId(LINES_SHOWN))?.focus());
}
</script>

<template>
  <section class="lines" aria-labelledby="scaffold-lines">
    <h3 id="scaffold-lines" tabindex="-1">Lines ({{ props.lines.length.toLocaleString('en-US') }})</h3>
    <p v-if="props.lines.length === 0" class="note">No speeches yet.</p>
    <template v-for="(group, g) in groups" :key="g">
      <h4>{{ group.heading }}</h4>
      <ul>
        <li v-for="{ at, line } in group.lines" :key="line.block">
          <button :id="lineId(at)" type="button" class="line" @click="emit('go', line)">
            <span class="sr-only">Go to: </span>{{ line.text || '(no words)' }}
          </button>
        </li>
      </ul>
    </template>
    <button
      v-if="!all && props.lines.length > LINES_SHOWN"
      type="button"
      class="action more"
      @click="showAll"
    >
      Show all {{ props.lines.length.toLocaleString('en-US') }} speeches
    </button>
  </section>
</template>

<style scoped>
h4 {
  margin: 12px 0 2px;
  font-size: 12px;
  color: var(--muted);
  font-weight: 600;
  overflow-wrap: anywhere;
}
ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.line {
  display: block;
  width: 100%;
  min-height: 24px;
  padding: 2px 4px;
  border: 0;
  border-radius: 3px;
  background: none;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 13px;
  text-align: left;
  overflow-wrap: anywhere;
  cursor: pointer;
}
.line:hover {
  background: var(--chrome-2);
}
.line:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 1px;
}
.more {
  margin-top: 8px;
}
</style>
