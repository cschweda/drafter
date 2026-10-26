<script setup lang="ts">
import { contextFor } from '~/modules/context';
import { consentMessage, networkNotice, useModules } from '~/modules/registry';
import type { ScriptModule } from '~/modules/types';

// Settings → Modules (Phase 1 design §5.8): every module built into this copy of Drafter, with
// what it is, what it may do, and a switch. All are off until turned on, and the choice is kept.
// A module that uses the network asks first, in plain words; without a yes it stays off.
const { modules, enabled, lapsed, setEnabled } = useModules();

const asking = ref<{ module: ScriptModule; question: string } | null>(null);
const dialog = ref<HTMLDialogElement>();

watch(asking, async (question) => {
  if (!question) return;
  await nextTick();
  if (dialog.value && !dialog.value.open) dialog.value.showModal();
});

function toggle(module: ScriptModule, event: Event) {
  const input = event.target as HTMLInputElement;
  if (!input.checked) {
    void setEnabled(module.id, false);
    return;
  }
  const question = consentMessage(module);
  if (!question) {
    void setEnabled(module.id, true);
    return;
  }
  // Off until the writer says yes.
  input.checked = false;
  asking.value = { module, question };
}

function answer(yes: boolean) {
  const current = asking.value;
  asking.value = null;
  dialog.value?.close();
  if (current && yes) void setEnabled(current.module.id, true);
  if (current)
    void nextTick().then(() => document.getElementById(switchId(current.module))?.focus());
}

// Escape closes the dialog without a button: that is No.
function onClose() {
  if (asking.value) answer(false);
}

const switchId = (module: ScriptModule) => `module-switch-${module.id}`;
const isOn = (module: ScriptModule) => enabled.value.includes(module.id);
</script>

<template>
  <section v-if="modules.length > 0" class="modules" aria-labelledby="modules-title">
    <h3 id="modules-title">Modules</h3>
    <p class="intro">Optional features built into Drafter. Each is off until you turn it on.</p>
    <div v-for="module in modules" :key="module.id" class="module" :data-module="module.id">
      <div class="row">
        <UIcon :name="module.icon" class="icon" />
        <div class="text">
          <label :for="switchId(module)" class="name">{{ module.name }}</label>
          <p :id="`module-${module.id}-why`" class="why">
            {{ module.description }}
            {{ networkNotice(module) ?? 'It needs no network: your script stays on this device.' }}
            <template v-if="lapsed.includes(module.id)">
              It now asks for network access you haven’t agreed to, so it is off until you turn it on again.
            </template>
          </p>
        </div>
        <input
          :id="switchId(module)"
          type="checkbox"
          role="switch"
          class="switch"
          :aria-describedby="`module-${module.id}-why`"
          :checked="isOn(module)"
          @change="toggle(module, $event)"
        >
      </div>
      <ModuleBoundary v-if="module.settings && isOn(module)" :name="module.name" what="settings">
        <component :is="module.settings" :context="contextFor(module)" />
      </ModuleBoundary>
    </div>
    <dialog
      ref="dialog"
      class="confirm"
      aria-labelledby="module-consent-title"
      aria-describedby="module-consent-why"
      @close="onClose"
    >
      <template v-if="asking">
        <h2 id="module-consent-title">Turn on {{ asking.module.name }}?</h2>
        <p id="module-consent-why">{{ asking.question }}</p>
        <div class="buttons">
          <button type="button" class="btn" autofocus @click="answer(false)">Cancel</button>
          <button type="button" class="btn" @click="answer(true)">Turn on</button>
        </div>
      </template>
    </dialog>
  </section>
</template>

<style scoped>
.modules {
  padding-top: 10px;
  border-top: 1px solid var(--line);
}
h3 {
  margin: 0;
  font-size: 14px;
}
.intro {
  margin: 2px 0 4px;
  color: var(--muted);
  line-height: 1.4;
}
.module {
  padding: 8px 0;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.icon {
  flex: none;
  width: 16px;
  height: 16px;
}
.text {
  flex: 1;
  min-width: 0;
}
.name {
  font-weight: 600;
}
.why {
  margin: 2px 0 0;
  color: var(--muted);
  line-height: 1.4;
}
/* The same switch as the other settings'. */
.switch {
  appearance: none;
  flex: none;
  position: relative;
  width: 36px;
  height: 20px;
  margin: 0;
  border: 1px solid var(--muted);
  border-radius: 999px;
  background: var(--chrome);
  cursor: pointer;
}
.switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--muted);
  transition: transform 0.12s;
}
.switch:checked {
  border-color: var(--heading);
  background: color-mix(in srgb, var(--heading) 30%, var(--chrome));
}
.switch:checked::after {
  background: var(--heading);
  transform: translateX(16px);
}
@media (prefers-reduced-motion: reduce) {
  .switch::after {
    transition: none;
  }
}
@media (forced-colors: active) {
  .switch:checked {
    background: Highlight;
  }
  .switch::after {
    background: CanvasText;
  }
}
.confirm {
  box-sizing: border-box;
  width: min(26rem, calc(100vw - 32px));
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--chrome-2);
  color: var(--text);
  font-size: 13px;
}
.confirm::backdrop {
  background: rgb(0 0 0 / 0.5);
}
h2 {
  margin: 0 0 8px;
  font-size: 15px;
}
.confirm p {
  margin: 0 0 14px;
  line-height: 1.45;
}
.buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.btn {
  min-height: 24px;
  padding: 0 10px;
  border: 1px solid var(--muted);
  border-radius: 5px;
  background: none;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
</style>
