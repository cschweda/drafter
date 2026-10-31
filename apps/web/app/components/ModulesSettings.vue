<script setup lang="ts">
import DDialog from '~/components/ui/DDialog.vue';
import { desktop } from '~/desktop';
import { contextFor, contextGeneration } from '~/modules/context';
import { folderFailures, folderIdOf } from '~/modules/folder';
import {
  consentMessage,
  folderModuleProblems,
  isFolderModule,
  networkNotice,
  useModules,
} from '~/modules/registry';
import type { ScriptModule } from '~/modules/types';

// Settings → Modules (Phase 1 design §5.8): every module built into this copy of Drafter, with
// what it is, what it may do, and a switch. All are off until turned on, and the choice is kept.
// A module that uses the network asks first, in plain words; without a yes it stays off.
// In the desktop app, the modules from its modules folder follow, under a warning of their own.
const { modules, enabled, lapsed, setEnabled } = useModules();
/** The desktop app, which has a modules folder; drafter.dev has none. */
const hasFolder = desktop() !== null;
/** Where the folder's modules start in the list (they come after the built-in ones), or -1. */
/** Why a folder module that is on couldn't start, and what the desktop app skipped. */
const failures = computed(() => folderFailures.value);
const skipped = computed(() => folderModuleProblems.value);
const firstFolder = computed(() => modules.value.findIndex((m) => isFolderModule(m.id)));

const asking = ref<{ module: ScriptModule; question: string } | null>(null);
const dialog = ref<InstanceType<typeof DDialog>>();

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
  // A close that comes after the dialog was opened again is the old close: it changes nothing.
  if (dialog.value?.open) return;
  if (asking.value) answer(false);
}

const switchId = (module: ScriptModule) => `module-switch-${module.id}`;
const isOn = (module: ScriptModule) => enabled.value.includes(module.id);
</script>

<template>
  <section v-if="modules.length > 0" class="modules" aria-labelledby="modules-title">
    <h3 id="modules-title" tabindex="-1">Modules</h3>
    <p class="intro">Optional features built into Drafter. Each is off until you turn it on.</p>
    <template v-for="(module, i) in modules" :key="module.id">
    <div v-if="i === firstFolder" class="folder-intro">
      <h4 id="modules-folder-title">From your modules folder</h4>
      <p class="intro">
        Modules you add to Drafter’s modules folder (Help → Open Modules Folder). Restart Drafter
        after adding one.
      </p>
      <p class="warning" data-folder-warning>
        A module from this folder is code that Drafter didn’t write and hasn’t checked. It runs on
        its own, with only its own permissions, apart from Drafter and your files, but while it is on
        it can read the open script and change it. Turn one on only if you trust where it came from.
      </p>
    </div>
    <div class="module" :data-module="module.id">
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
            <template v-if="isOn(module) && failures.get(folderIdOf(module.id))">
              It couldn’t start: {{ failures.get(folderIdOf(module.id)) }}.
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
      <!-- Drawn afresh when another script opens, with that script's context (see AppPane). -->
      <ModuleBoundary
        v-if="module.settings && isOn(module)"
        :key="contextGeneration()"
        :name="module.name"
        what="settings"
      >
        <component :is="module.settings" :context="contextFor(module)" />
      </ModuleBoundary>
    </div>
    </template>
    <div v-if="hasFolder && firstFolder === -1" class="folder-intro">
      <h4 id="modules-folder-title">From your modules folder</h4>
      <p class="intro">
        There are no modules in Drafter’s modules folder. Help → Open Modules Folder shows it; restart
        Drafter after adding one.
      </p>
    </div>
    <ul v-if="hasFolder && skipped.length > 0" class="skipped" data-folder-problems>
      <li v-for="problem in skipped" :key="problem">{{ problem }}</li>
    </ul>
    <DDialog
      ref="dialog"
      size="sm"
      class="confirm"
      aria-labelledby="module-consent-title"
      aria-describedby="module-consent-why"
      @close="onClose"
    >
      <template v-if="asking">
        <h2 id="module-consent-title" class="d-dialog-title">Turn on {{ asking.module.name }}?</h2>
        <p id="module-consent-why">{{ asking.question }}</p>
        <div class="d-dialog-footer">
          <DButton autofocus @click="answer(false)">Cancel</DButton>
          <DButton variant="primary" @click="answer(true)">Turn on</DButton>
        </div>
      </template>
    </DDialog>
  </section>
</template>

<style scoped>
/* A section of Settings, under its heading (SettingsDialog.vue draws the rule above it). */
h3 {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 600;
  line-height: 20px;
}
.intro {
  margin: 2px 0 4px;
  color: var(--muted);
  line-height: 1.4;
}
.module {
  padding: 8px 0;
}
.folder-intro {
  margin-top: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}
h4 {
  margin: 0;
  font-size: 13px;
}
.warning {
  margin: 4px 0;
  padding: 6px 8px;
  border-left: 3px solid var(--accent-text);
  line-height: 1.4;
}
.skipped {
  margin: 4px 0 0;
  padding-left: 18px;
  color: var(--muted);
  line-height: 1.4;
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
  background: var(--surface);
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
  border-color: var(--accent-text);
  background: color-mix(in srgb, var(--accent) 30%, var(--surface));
}
.switch:checked::after {
  background: var(--accent-text);
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
.confirm p {
  margin: 0;
}
</style>
