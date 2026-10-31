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
  <div class="stats" :class="{ 'with-contents': !markdown }">
    <StatsContents />
    <StatsOverview />
    <StatsCharacters v-if="!markdown" />
    <section v-if="!markdown" class="section" aria-labelledby="stats-grid">
      <div class="title-row">
        <h2 id="stats-grid" tabindex="-1">Character by scene</h2>
        <DInfo v-if="view && view.model.rows.length > 0 && view.model.columns > 0 && !asList" label="About the grid">
          <p>
            Each cell is the character’s speeches in that scene; a dot is a scene they’re in without
            speaking. A dashed outline marks a long absence, 20 pages or more.
          </p>
        </DInfo>
        <span class="grow" />
        <DButton
          v-if="view && view.model.rows.length > 0 && view.model.columns > 0"
          variant="borderless"
          class="toggle"
          :aria-pressed="asList"
          @click="set('gridAsList', !asList)"
        >
          <UIcon name="i-lucide-list" aria-hidden="true" />
          List
        </DButton>
      </div>
      <p v-if="!view" class="note">Counting…</p>
      <DEmpty v-else-if="view.model.rows.length === 0" icon="i-lucide-users">No one speaks yet. A character’s cue starts their row.</DEmpty>
      <DEmpty v-else-if="view.model.columns === 0" icon="i-lucide-clapperboard">No scenes yet. Each scene heading you write shows here.</DEmpty>
      <template v-else>
        <CharacterList v-if="asList" :view="view" labelledby="stats-grid" />
        <CharacterGrid v-else :view="view" labelledby="stats-grid" />
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
/* The Stats page (fresh-look design §7): a centred column of 720px at most, the contents row stuck
   at its top (41px), under which the tables' headers stick and to which a jump scrolls a heading. */
.stats {
  box-sizing: border-box;
  max-width: 720px;
  margin: 0 auto;
  padding: 0 24px 32px;
  color: var(--text);
  font-size: 13px;
  line-height: 1.45;
}
.stats.with-contents {
  --table-sticky-top: 41px;
}
@media (max-width: 640px) {
  .stats {
    padding: 0 16px 24px;
  }
}
.stats:not(.with-contents) {
  padding-top: 20px;
}
.stats :deep(.section) {
  padding-top: 20px;
}
.stats :deep(.section + .section) {
  margin-top: 12px;
}
.stats :deep(h2) {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
  scroll-margin-top: 52px;
}
.stats:not(.with-contents) :deep(h2) {
  scroll-margin-top: 12px;
}
.stats :deep(.title-row) {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
}
.grow {
  flex: 1;
}
.toggle[aria-pressed='true'] {
  background: var(--highlight);
  box-shadow: inset 0 -2px 0 var(--accent-text);
}
.link:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.note {
  margin: 6px 0 0;
  color: var(--muted);
}
h3 {
  margin: 20px 0 6px;
  font-size: 15px;
  font-weight: 600;
}
.absences {
  margin: 0;
  padding: 0;
  list-style: none;
}
.absences li {
  display: flex;
  align-items: center;
  min-height: 36px;
  border-bottom: 1px solid var(--border);
}
.link {
  min-height: 24px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text);
  font: inherit;
  text-align: left;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
@media (forced-colors: active) {
  .toggle[aria-pressed='true'] {
    border: 2px solid ButtonText;
  }
}
</style>
