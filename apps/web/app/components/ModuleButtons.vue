<script setup lang="ts">
import { runContextFor } from '~/modules/context';
import { useModuleButtons } from '~/modules/host';
import { buttonsInMenu, moduleError, moduleNotice, runModuleAction } from '~/modules/registry';
import type { ScriptModule } from '~/modules/types';

// The top bar's buttons for the modules that are on, after Export: borderless, an icon and a label
// (the label drops below 1024px, as the others' do). On a phone they are icon buttons while they
// fit at 320px (two do); past two they go into one Modules menu button. A
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
    <MenuButton v-if="asMenu" :items="items" :content="{ align: 'end' }">
      <button type="button" class="act" title="Modules" data-modules-menu>
        <UIcon name="i-lucide-puzzle" class="icon" />
        <span class="label">Modules</span>
      </button>
    </MenuButton>
    <template v-else>
      <button
        v-for="module in modules"
        :key="module.id"
        type="button"
        class="act"
        :data-module="module.id"
        :title="module.action?.label"
        @click="run(module)"
      >
        <UIcon :name="module.icon" class="icon" />
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
  flex: none;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--r-sm);
  background: none;
  color: var(--muted);
  font: 500 13px/1 var(--font-sans);
  white-space: nowrap;
  cursor: pointer;
}
.act:hover,
.act[aria-expanded="true"] {
  background: var(--raised);
  color: var(--text);
}
.icon {
  flex: none;
  width: 16px;
  height: 16px;
}
.module-toast {
  position: fixed;
  z-index: 30;
  right: 16px;
  bottom: 40px;
  box-sizing: border-box;
  max-width: min(26rem, calc(100vw - 32px));
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent);
  border-radius: var(--r-sm);
  background: var(--overlay);
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
/* Icons alone below 1024px, as the other buttons: 30×30, with the label as a tooltip. */
@media (max-width: 1023.98px) {
  .act {
    justify-content: center;
    width: 30px;
    padding: 0;
  }
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
