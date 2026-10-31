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
      <ToolButton
        icon="i-lucide-diff"
        label="Changes"
        class="slim-button compare-tool"
        :aria-pressed="view === 'changes' ? 'true' : 'false'"
        @click="compare.setView('changes')"
      />
      <ToolButton
        icon="i-lucide-files"
        label="Pages"
        class="slim-button compare-tool"
        :aria-pressed="view === 'pages' ? 'true' : 'false'"
        @click="compare.setView('pages')"
      />
    </div>
    <div v-if="view === 'changes' && splitAllowed" role="group" aria-label="Layout" class="choice">
      <ToolButton
        icon="i-lucide-rows-2"
        label="Unified"
        class="slim-button compare-tool"
        :aria-pressed="layout === 'unified' ? 'true' : 'false'"
        @click="compare.setLayout('unified')"
      />
      <ToolButton
        icon="i-lucide-columns-2"
        label="Side by side"
        class="slim-button compare-tool"
        :aria-pressed="layout === 'split' ? 'true' : 'false'"
        @click="compare.setLayout('split')"
      />
    </div>
    <ToolButton
      v-if="current.newer.at === null"
      icon="i-lucide-refresh-cw"
      label="Update"
      class="slim-button compare-tool"
      @click="update"
    />
    <ToolButton
      icon="i-lucide-x"
      label="Close comparison"
      class="slim-button compare-tool"
      @click="compare.close(true)"
    />
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
</style>

<style>
/* Unscoped: each button is a ToolButton, whose root this component's scope doesn't reach. */
.choice .slim-button.compare-tool {
  border-radius: 0;
}
.choice .slim-button.compare-tool:first-child {
  border-radius: 5px 0 0 5px;
}
.choice .slim-button.compare-tool + .slim-button.compare-tool {
  margin-left: -1px;
  border-radius: 0 5px 5px 0;
}
.slim-button.compare-tool {
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
.slim-button.compare-tool[aria-pressed='true'] {
  background: var(--heading);
  color: var(--bg);
}
</style>
