<script setup lang="ts">
import { useCast } from '~/cast/use-cast';
import { useEditor } from '~/editor/session';
import { useSettings } from '~/settings/settings';
import { goToScene, useGridView } from '~/stats/grid-data';
import { absenceLine } from '~/stats/grid-labels';

// The Stats tab (seeing-the-script design §4): Overview, Characters, and Character by scene, each
// under its own heading, which the links in the slim bar go to. A Markdown document has the
// Overview alone. The tab holds the cast while it shows a script, so the cast is worked out only
// while someone looks.
const { kind } = useEditor();
const markdown = computed(() => kind.value === 'markdown');
const { need } = useCast();

let release: (() => void) | null = null;
watch(
  markdown,
  (isMarkdown) => {
    if (isMarkdown) {
      release?.();
      release = null;
    } else {
      release ??= need();
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  release?.();
  release = null;
});

// Character by scene (§4.4): the grid, or its List (remembered on this device), and the long
// absences under either, each going to the scene the character comes back in.
const view = useGridView();
const { settings, set } = useSettings();
const asList = computed(() => settings.value.gridAsList);
const absences = computed(() => {
  const v = view.value;
  if (!v) return null;
  // Without pages the absences aren't known yet.
  const paged = v.cast.characters.every((c) => v.cast.figures.get(c.key)?.absences !== null);
  if (!paged) return null;
  return v.model.gaps.map((gap) => ({
    key: `${gap.row}-${gap.absence.from.scene}`,
    line: absenceLine(v.names[gap.row] ?? '', gap.absence),
    scene: gap.absence.to.scene,
  }));
});
</script>

<template>
  <div class="stats">
    <StatsOverview />
    <StatsCharacters v-if="!markdown" />
    <section v-if="!markdown" class="section" aria-labelledby="stats-grid">
      <div class="title-row">
        <h2 id="stats-grid" tabindex="-1">Character by scene</h2>
        <button
          v-if="view && view.model.rows.length > 0 && view.model.columns > 0"
          type="button"
          class="toggle"
          :aria-pressed="asList"
          @click="set('gridAsList', !asList)"
        >
          List
        </button>
      </div>
      <p v-if="!view" class="note">Counting…</p>
      <p v-else-if="view.model.rows.length === 0" class="note">No one speaks yet. A character’s cue starts their row.</p>
      <p v-else-if="view.model.columns === 0" class="note">No scenes yet. Each scene heading you write shows here.</p>
      <template v-else>
        <CharacterList v-if="asList" :view="view" labelledby="stats-grid" />
        <CharacterGrid v-else :view="view" labelledby="stats-grid" />
        <p v-if="!asList" class="note">
          Each cell is the character’s speeches in that scene; a dot is a scene they’re in without
          speaking. A dashed outline marks a long absence, 20 pages or more.
        </p>
        <h3 id="stats-absences">Long absences</h3>
        <p v-if="!absences" class="note">When the pages are ready</p>
        <p v-else-if="absences.length === 0" class="note">No one is away for 20 pages or more.</p>
        <ul v-else class="absences" aria-labelledby="stats-absences">
          <li v-for="absence in absences" :key="absence.key">
            <button type="button" class="link" @click="goToScene(view, absence.scene)">
              {{ absence.line }}
            </button>
          </li>
        </ul>
      </template>
    </section>
  </div>
</template>

<style scoped>
.stats {
  max-width: 52rem;
  padding: 12px 16px 24px;
  color: var(--text);
  font-size: 13px;
  line-height: 1.45;
}
.stats :deep(.section + .section) {
  margin-top: 20px;
}
.stats :deep(h2) {
  margin: 0 0 8px;
  font-size: 15px;
}
.stats :deep(h2:focus-visible) {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
.title-row {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.title-row h2 {
  flex: 1;
}
.toggle {
  min-height: 24px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: none;
  color: var(--text);
}
.toggle[aria-pressed='true'] {
  background: var(--tab-on);
  border-color: var(--text);
}
.toggle:focus-visible,
.link:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
.note {
  margin: 6px 0 0;
  color: var(--muted);
}
h3 {
  margin: 14px 0 4px;
  font-size: 13px;
}
.absences {
  margin: 0;
  padding: 0;
  list-style: none;
}
.link {
  min-height: 24px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text);
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
@media (forced-colors: active) {
  .toggle[aria-pressed='true'] {
    border-width: 2px;
  }
}
</style>
