<script setup lang="ts">
import { useCompare } from '~/compare/use-compare';
import { sayOutline } from '~/outline/notice';

// The Compare tab's slim bar: what is compared ("Comparing 10:42 with now (10:58)"), the view
// (Changes | Pages, version-history design §5.1; a Markdown document has only Changes), the Changes
// view's layout (Unified | Side by side, shown where the pane is wide enough), Update when one side
// is now (Call 15: now is the text when Compare opened), and Close comparison. Each group is two
// toggle buttons, the chosen one pressed, and each choice is remembered.

const compare = useCompare();
const { current, view, hasPages, layout, splitAllowed } = compare;

function update() {
  compare.update();
  const n = current.value?.changes.length ?? 0;
  void sayOutline(
    `Compared with the text as it is now: ${n === 0 ? 'no changes' : `${n} ${n === 1 ? 'change' : 'changes'}`}.`,
  );
}
</script>

<template>
  <template v-if="current">
    <span class="what">Comparing {{ current.older.label }} with {{ current.newer.label }}</span>
    <span class="spacer" />
    <div v-if="hasPages" role="group" aria-label="View" class="choice">
      <button
        type="button"
        class="slim-button"
        :aria-pressed="view === 'changes' ? 'true' : 'false'"
        @click="compare.setView('changes')"
      >
        Changes
      </button>
      <button
        type="button"
        class="slim-button"
        :aria-pressed="view === 'pages' ? 'true' : 'false'"
        @click="compare.setView('pages')"
      >
        Pages
      </button>
    </div>
    <div v-if="view === 'changes' && splitAllowed" role="group" aria-label="Layout" class="choice">
      <button
        type="button"
        class="slim-button"
        :aria-pressed="layout === 'unified' ? 'true' : 'false'"
        @click="compare.setLayout('unified')"
      >
        Unified
      </button>
      <button
        type="button"
        class="slim-button"
        :aria-pressed="layout === 'split' ? 'true' : 'false'"
        @click="compare.setLayout('split')"
      >
        Side by side
      </button>
    </div>
    <button v-if="current.newer.at === null" type="button" class="slim-button" @click="update">
      Update
    </button>
    <button type="button" class="slim-button" @click="compare.close(true)">Close comparison</button>
  </template>
</template>

<style scoped>
.what {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.choice {
  display: inline-flex;
}
.choice .slim-button {
  border-radius: 0;
}
.choice .slim-button:first-child {
  border-radius: 5px 0 0 5px;
}
.choice .slim-button + .slim-button {
  margin-left: -1px;
  border-radius: 0 5px 5px 0;
}
.slim-button {
  min-height: 24px;
  padding: 0 10px;
  border: 1px solid var(--heading);
  border-radius: 5px;
  background: none;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
}
.slim-button[aria-pressed='true'] {
  background: var(--heading);
  color: var(--bg);
}
</style>
