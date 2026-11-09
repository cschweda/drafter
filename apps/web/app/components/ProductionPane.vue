<script setup lang="ts">
import { numbersScenes } from '@drafter/production';
import { useLayout } from '~/editor/layout';
import { useEditor } from '~/editor/session';
import { useOutline } from '~/outline/use-outline';
import { firstSceneNumber, productionAsking } from '~/production/commands';
import { longDate, openSetLine, pagesMarked, swatchOf } from '~/production/labels';
import { useProductionActions } from '~/production/use-commands';
import { DAMAGED_MESSAGE, useProduction } from '~/production/use-production';

// The Production tab (production design §5): the script's state, the lock, the next revision with
// the earlier ones under it, and Scene numbers start at. Each word is explained once, where it
// first shows, since a writer may be meeting them here. The exports come with Plan 2.
const editor = useEditor();
const { state, openSet, damaged } = useProduction();
const { layout } = useLayout();
const actions = useProductionActions();
const outline = useOutline();

const fountain = computed(() => editor.kind.value === 'fountain');
const screenplay = computed(() => numbersScenes(editor.template.value));
const locked = computed(() => state.value !== null);
/** Why nothing can be changed here now (another tab is editing the script), or null. */
const readOnly = computed(() => outline.readOnly.value);
const working = ref(false);
const stateLine = ref<HTMLElement>();

const marked = computed(() => (openSet.value ? pagesMarked(layout.value, openSet.value.name) : 0));
/** Earlier sets, newest first, each with its swatch. */
const earlier = computed(() =>
  (state.value?.sets.slice(0, -1) ?? [])
    .map((set) => ({ ...set, swatch: swatchOf(set) }))
    .reverse(),
);
const openSwatch = computed(() => (openSet.value ? swatchOf(openSet.value) : null));
const nextName = computed(() => (state.value ? actions.nextName() : ''));

/** Runs an action, one at a time; focus goes to the state line, as the buttons change under it. */
async function run(act: () => Promise<boolean>) {
  if (working.value) return;
  working.value = true;
  try {
    if (await act()) {
      await nextTick();
      stateLine.value?.focus();
    }
  } finally {
    working.value = false;
  }
}

function onFirstScene(event: Event) {
  const value = Number((event.target as HTMLInputElement).value);
  if (Number.isInteger(value) && value >= 1) firstSceneNumber.value = value;
}
</script>

<template>
  <div class="production">
    <section aria-labelledby="production-title">
      <h2 id="production-title">Production</h2>
      <p v-if="!fountain" class="note">Production is for screenplays and stage plays.</p>
      <template v-else>
        <p v-if="damaged" class="problem">
          {{ DAMAGED_MESSAGE }}. Unlock… takes the damaged lock away; your text stays as it is.
        </p>
        <p ref="stateLine" class="state" tabindex="-1" data-production-state>
          <template v-if="state">
            Pages and scene numbers locked on {{ longDate(state.lockedAt) }}
          </template>
          <template v-else>Not locked</template>
        </p>
        <p v-if="openSet" class="set" data-production-set>
          <span
            v-if="openSwatch"
            class="swatch"
            :style="{ backgroundColor: openSwatch }"
            aria-hidden="true"
          />
          {{ openSetLine(openSet, marked) }}
        </p>
        <p v-if="readOnly" class="note">{{ readOnly }}</p>

        <!-- Not locked: the lock, and where its numbers start. -->
        <template v-if="!locked && !damaged">
          <label v-if="screenplay" class="field">
            <span>Scene numbers start at</span>
            <input
              type="number"
              min="1"
              step="1"
              inputmode="numeric"
              :value="firstSceneNumber"
              :disabled="!!readOnly"
              @change="onFirstScene"
            />
          </label>
          <div class="action">
            <DButton
              variant="primary"
              :disabled="!!readOnly || working"
              @click="run(actions.lock)"
            >
              Lock pages and scene numbers
            </DButton>
            <p class="hint">
              Locking numbers every scene and fixes each page’s number, so the pages a crew has keep
              their numbers. Changes after this are marked in color.
            </p>
          </div>
        </template>

        <!-- Locked: the next revision, the earlier ones, then the numbers, Clear marks, and Unlock. -->
        <template v-if="locked">
          <div class="action">
            <DButton :disabled="!!readOnly || working" @click="run(actions.nextSet)">
              Start the next revision ({{ nextName }})
            </DButton>
            <p class="hint">
              A revision is one round of changes, sent out on its own color of paper.
              {{ openSet?.name }}’s marks are kept, and changes from now on are marked
              {{ nextName }}.
            </p>
          </div>
          <h3 id="production-earlier">Earlier revisions</h3>
          <ul class="sets" aria-labelledby="production-earlier">
            <li v-for="set in earlier" :key="`${set.name}-${set.date}`">
              <span
                v-if="set.swatch"
                class="swatch"
                :style="{ backgroundColor: set.swatch }"
                aria-hidden="true"
              />
              {{ set.name }}, {{ longDate(set.date) }}
              <span v-if="set.name === 'White'" class="muted">(the locked script)</span>
            </li>
          </ul>
          <template v-if="screenplay">
            <p class="field-line">Scene numbers start at {{ state?.firstScene }}</p>
            <div class="action">
              <DButton :disabled="!!readOnly || working" @click="run(actions.writeNumbers)">
                Write new scene numbers
              </DButton>
              <p class="hint">
                A scene added after the lock shows the number it will have, such as 5A between 5
                and 6, dimmed after its heading. This writes those numbers into the headings.
              </p>
            </div>
          </template>
        </template>
        <div v-if="locked || damaged" class="action row">
          <DButton
            v-if="locked"
            :disabled="!!readOnly"
            @click="productionAsking = 'clear-marks'"
          >
            Clear marks…
          </DButton>
          <DButton :disabled="!!readOnly" @click="productionAsking = 'unlock'">Unlock…</DButton>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
/* A centred column of 720px at most, as Stats and Scaffold are (fresh-look design §7). */
.production {
  box-sizing: border-box;
  max-width: 720px;
  margin: 0 auto;
  padding: 20px 24px 32px;
  color: var(--text);
  font-size: 13px;
  line-height: 1.45;
}
@media (max-width: 640px) {
  .production {
    padding: 16px 16px 24px;
  }
}
h2 {
  margin: 0 0 12px;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
}
h3 {
  margin: 20px 0 6px;
  font-size: 15px;
  font-weight: 600;
}
p {
  margin: 0;
}
.state {
  font-weight: 600;
}
.state:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.set,
.sets li {
  display: flex;
  align-items: center;
  gap: 8px;
}
.set {
  margin-top: 4px;
}
/* A set's color for the screen; its name always says it too (design §6.1). */
.swatch {
  flex: none;
  width: 12px;
  height: 12px;
  border-radius: 3px;
}
.action {
  margin-top: 16px;
}
.action.row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 24px;
}
.hint {
  margin-top: 6px;
  color: var(--muted);
  max-width: 60ch;
}
.note,
.muted {
  color: var(--muted);
}
.note {
  margin-top: 8px;
}
.problem {
  margin-bottom: 8px;
  padding-left: 8px;
  border-left: 3px solid var(--danger-border);
}
.field {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
}
.field input {
  box-sizing: border-box;
  width: 6rem;
  min-height: 30px;
  padding: 4px 8px;
  border: 1px solid var(--muted);
  border-radius: 5px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
}
.field input:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}
.field-line {
  margin-top: 20px;
}
.sets {
  margin: 0;
  padding: 0;
  list-style: none;
}
.sets li {
  min-height: 28px;
  border-bottom: 1px solid var(--border);
}
@media (forced-colors: active) {
  .swatch {
    border: 1px solid CanvasText;
  }
}
</style>
