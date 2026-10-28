<script setup lang="ts">
import { runContextFor } from '~/modules/context';
import { useModuleButtons } from '~/modules/host';
import { buttonsInMenu, moduleError, moduleNotice, runModuleAction } from '~/modules/registry';
import type { ScriptModule } from '~/modules/types';

// The toolbar's buttons for the modules that are on, after Focus. On a phone they are round icon
// buttons while they fit at 320px (two do); past two they go into one Modules menu button. A
// module's `notify` and a failure it can't handle are toasts here, as the export's are.
const modules = useModuleButtons();
const wide = useWideScreen();
const asMenu = computed(() => buttonsInMenu(modules.value.length, wide.value));

function run(module: ScriptModule) {
  const action = module.action;
  if (action) void runModuleAction(module.name, () => action.run(runContextFor(module)));
}

const items = computed(() =>
  modules.value.map((module) => ({
    label: module.action?.label ?? module.name,
    icon: module.icon,
    onSelect: () => run(module),
  })),
);
</script>

<template>
  <div class="modules">
    <UDropdownMenu :modal="false" v-if="asMenu" :items="items" :content="{ align: 'end' }">
      <button type="button" class="act" data-modules-menu>
        <span class="round module"><UIcon name="i-lucide-puzzle" class="icon" /></span>
        <span class="label">Modules</span>
      </button>
    </UDropdownMenu>
    <template v-else>
      <button
        v-for="module in modules"
        :key="module.id"
        type="button"
        class="act"
        :data-module="module.id"
        @click="run(module)"
      >
        <span class="round module"><UIcon :name="module.icon" class="icon" /></span>
        <span class="label">{{ module.action?.label }}</span>
      </button>
    </template>
    <div class="module-toast" :class="{ shown: moduleNotice || moduleError }">
      <span role="status">{{ moduleNotice }}</span>
      <span v-if="moduleError" role="alert" class="failed">{{ moduleError }}</span>
    </div>
  </div>
</template>

<style scoped>
.modules {
  display: contents;
}
.act {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--text);
  font: 600 13px/1 var(--font-sans);
  cursor: pointer;
}
.round {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  color: #111216;
}
.round.module {
  background: #c4b3ee;
}
.icon {
  width: 13px;
  height: 13px;
}
.module-toast {
  position: fixed;
  z-index: 30;
  right: 16px;
  bottom: 40px;
  box-sizing: border-box;
  max-width: min(26rem, calc(100vw - 32px));
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-left: 3px solid var(--heading);
  border-radius: 6px;
  background: var(--chrome-2);
  color: var(--text);
  font-size: 13px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.35);
}
/* The regions stay in the page, so a screen reader hears their text change; the box is drawn only with text. */
.module-toast:not(.shown) {
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  border: 0;
  box-shadow: none;
  clip-path: inset(50%);
  white-space: nowrap;
}
/* Icons alone below 1024px, as the other buttons. */
@media (max-width: 1023.98px) {
  .label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}
</style>
