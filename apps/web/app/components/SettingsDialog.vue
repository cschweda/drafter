<script setup lang="ts">
import { desktop } from '~/desktop';
import { settingsOpen } from '~/settings/dialog';
import { type Settings, TEXT_SIZES, useSettings } from '~/settings/settings';

// The Settings dialog (Phase 1 design §8): a labeled switch for each on/off setting, a select
// for the text size. A change takes effect and is kept at once, so there is nothing to confirm.
const { settings, set } = useSettings();
const dialog = ref<HTMLDialogElement>();

watch(settingsOpen, async (open) => {
  await nextTick();
  const el = dialog.value;
  if (!el) return;
  if (open && !el.open) el.showModal();
  else if (!open && el.open) el.close();
});

// Escape goes through `settingsOpen`, so the state is false at once (a Mod+, pressed straight after
// it opens the dialog again), instead of staying true until the close event.
function onCancel() {
  settingsOpen.value = false;
}

// A close event that comes after the dialog was opened again is the old close: it changes nothing.
function onClose() {
  if (!dialog.value?.open) settingsOpen.value = false;
}

interface Switch {
  key: Exclude<keyof Settings, 'textSize'>;
  label: string;
  why: string;
  /** Shown only in the desktop app. */
  desktopOnly?: boolean;
  /** What it says in the desktop app on a Mac, where that differs. */
  whyOnMac?: string;
}
const SWITCHES: Switch[] = [
  {
    key: 'matchSystem',
    label: 'Match system appearance',
    why: 'Use the light or dark appearance your device is set to.',
  },
  {
    key: 'spellcheck',
    label: 'Spellcheck',
    why: 'Underline misspelled words in the Source pane, using your browser’s spellcheck.',
  },
  {
    key: 'strict',
    label: 'Strict Fountain',
    why: 'Warn where Drafter reads your script more loosely than the Fountain spec does.',
  },
  {
    key: 'lineNumbers',
    label: 'Line numbers',
    why: 'Number the lines in the Source pane, so you can refer to one.',
  },
  {
    key: 'typewriter',
    label: 'Typewriter scrolling',
    why: 'Keep the line you are writing at the middle of the Source pane.',
  },
  {
    key: 'scrollSync',
    label: 'Sync scrolling',
    why: 'Scroll the Source and the Script pane (or the Preview) together, so both show the same part of your script.',
  },
  {
    key: 'elementBar',
    label: 'Element bar',
    why: 'Show a row of buttons above the Source that writes Fountain’s marks for you, and names the element you’re in.',
  },
  {
    key: 'sprintSound',
    label: 'Sprint sound',
    why: 'Play a short tone when a sprint ends. Drafter makes no sound unless you turn this on.',
  },
  {
    key: 'checkForUpdates',
    label: 'Check for updates',
    why: 'When Drafter starts, look on GitHub for a newer version. Nothing from your scripts is sent, and Drafter never installs an update without asking.',
    desktopOnly: true,
    // The Mac app is built on the writer's Mac and signed by no one, so it can't update itself.
    whyOnMac:
      'When Drafter starts, look on GitHub for a newer version, and say when one is out. Nothing from your scripts is sent. On a Mac, Drafter can’t update itself yet: build the new version the way you built this one.',
  },
];
// The desktop check is the one request the desktop app makes; the web has no such setting.
// Known only in the browser, after the page is up, so the prerendered page and hydration agree.
const onDesktop = ref(false);
const onMac = ref(false);
onMounted(() => {
  const bridge = desktop();
  onDesktop.value = bridge !== null;
  onMac.value = bridge?.platform === 'darwin';
});
const shown = computed(() =>
  SWITCHES.filter((item) => !item.desktopOnly || onDesktop.value).map((item) =>
    onMac.value && item.whyOnMac ? { ...item, why: item.whyOnMac } : item,
  ),
);

const percent = (size: number) => `${Math.round(size * 100)}%`;

function onSize(event: Event) {
  void set('textSize', Number((event.target as HTMLSelectElement).value));
}
</script>

<template>
  <dialog ref="dialog" class="settings"
    aria-labelledby="settings-title"
    @cancel.prevent="onCancel"
    @close="onClose"
  >
    <h2 id="settings-title">Settings</h2>
    <div class="row">
      <div class="text">
        <label for="settings-text-size" class="name">Text size</label>
        <p id="settings-text-size-why" class="why">Scales the Source and Script panes together.</p>
      </div>
      <select
        id="settings-text-size"
        class="size"
        aria-describedby="settings-text-size-why"
        :value="String(settings.textSize)"
        @change="onSize"
      >
        <option v-for="size in TEXT_SIZES" :key="size" :value="String(size)">
          {{ percent(size) }}
        </option>
      </select>
    </div>
    <div v-for="item in shown" :key="item.key" class="row">
      <div class="text">
        <label :for="`settings-${item.key}`" class="name">{{ item.label }}</label>
        <p :id="`settings-${item.key}-why`" class="why">{{ item.why }}</p>
      </div>
      <input
        :id="`settings-${item.key}`"
        type="checkbox"
        role="switch"
        class="switch"
        :aria-describedby="`settings-${item.key}-why`"
        :checked="settings[item.key]"
        @change="set(item.key, ($event.target as HTMLInputElement).checked)"
      >
    </div>
    <ModulesSettings />
    <div class="buttons">
      <button type="button" class="btn" @click="settingsOpen = false">Done</button>
    </div>
  </dialog>
</template>

<style scoped>
.settings {
  box-sizing: border-box;
  width: min(28rem, calc(100vw - 32px));
  max-height: calc(100dvh - 32px);
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--chrome-2);
  color: var(--text);
  font-size: 13px;
  overflow: auto;
}
.settings::backdrop {
  background: rgb(0 0 0 / 0.5);
}
h2 {
  margin: 0 0 8px;
  font-size: 15px;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
  border-top: 1px solid var(--line);
}
.text {
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
.size {
  flex: none;
  min-height: 28px;
  padding: 0 6px;
  border: 1px solid var(--muted);
  border-radius: 5px;
  background: var(--chrome);
  color: var(--text);
  font: inherit;
}
/* A switch: a track with a knob, drawn on the checkbox itself so it keeps its keyboard and
   screen-reader behavior. */
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
.buttons {
  display: flex;
  justify-content: flex-end;
  padding-top: 10px;
  border-top: 1px solid var(--line);
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
