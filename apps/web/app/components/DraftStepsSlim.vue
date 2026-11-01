<script setup lang="ts">
import { useDraftSteps } from '~/drafts/use-steps';

// Draft by draft's slim bar (drafts-and-cuts design §2.4): how many steps, and Close.

const session = useDraftSteps();
const { steps, state } = session;
const count = computed(() => {
  const n = steps.value.length;
  return n === 1 ? '1 step' : `${n.toLocaleString('en-US')} steps`;
});
</script>

<template>
  <span v-if="state === 'ready'">{{ count }}</span>
  <span class="spacer" />
  <ToolButton
    icon="i-lucide-x"
    label="Close"
    class="slim-button steps-tool"
    aria-label="Close Draft by draft"
    @click="session.close(true)"
  />
</template>

<style>
/* Unscoped: each button is a ToolButton, whose root this component's scope doesn't reach. */
.slim-button.steps-tool {
  min-height: 24px;
  padding: 0 8px;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.slim-button.steps-tool:hover {
  background: var(--overlay);
}
</style>
