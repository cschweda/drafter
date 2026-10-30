<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui';
import { baselineLabel, useShowChanges } from '~/compare/baseline';
import { historyOpen } from '~/snapshots/history';

// Show changes on the Script pane's slim bar (version-history design §4.1): a toggle button
// **Changes**, pressed while on, and while on a menu button **since: Last save** naming the
// baseline: Last save (First version for a script never saved), the labelled snapshots, the one
// picked from History, and Another version…, which opens History to pick one (its row menu's Show
// changes since this). Where it can't be on (nothing saved or snapshotted yet), the button says
// why when pressed, and is described by the reason.

const changes = useShowChanges();
const { on, why, choices, baseline } = changes;
const whyId = useId();

const sameBaseline = (a: (typeof choices.value)[number]['baseline']) => {
  const b = baseline.value;
  return a.kind === b.kind && (a.kind !== 'snapshot' || (b.kind === 'snapshot' && a.id === b.id));
};

const items = computed<DropdownMenuItem[][]>(() => [
  choices.value.map((choice) => ({
    label: choice.label,
    type: 'checkbox' as const,
    checked: sameBaseline(choice.baseline),
    onSelect: () => changes.since(choice.baseline),
  })),
  [
    {
      label: 'Another version…',
      icon: 'i-lucide-history',
      onSelect: () => {
        historyOpen.value = { focusLabel: false };
      },
    },
  ],
]);
</script>

<template>
  <button
    type="button"
    class="zoom-button changes-toggle"
    :aria-pressed="on ? 'true' : 'false'"
    :aria-disabled="why ? 'true' : undefined"
    :aria-describedby="why ? whyId : undefined"
    @click="changes.toggle()"
  >
    Changes
  </button>
  <span v-if="why" :id="whyId" class="sr-only">{{ why }}</span>
  <MenuButton v-if="on" :items="items" :content="{ align: 'start' }">
    <button type="button" class="zoom-button since">
      since: {{ baselineLabel(baseline) }}
      <UIcon name="i-lucide-chevron-down" class="chevron" aria-hidden="true" />
    </button>
  </MenuButton>
</template>

<style scoped>
.since {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.chevron {
  width: 14px;
  height: 14px;
}
</style>
