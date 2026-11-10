<script setup lang="ts">
import DDialog from '~/components/ui/DDialog.vue';
import { useEditor } from '~/editor/session';
import {
  type SidesChoices,
  scenesOfCharacters,
  sidesChoice,
  sidesInfo,
  sidesOpen,
} from '~/production/sides';
import { exportSides } from '~/storage/export';
import { useScript } from '~/storage/script';

// Export sides (production design §10): choose the characters, whose scenes are ticked; the ticks
// stay editable, since a day's shoot is often a few scenes, not all of a character's. The lists
// come from the export worker (never parsed here). Everything from the script is shown as text.
const dialog = ref<InstanceType<typeof DDialog>>();
const { view } = useEditor();
const script = useScript();

/** The script's characters and scenes, from the export worker; null while it works them out. */
const info = ref<SidesChoices | null | 'failed'>(null);
const found = computed(() => (info.value === null || info.value === 'failed' ? null : info.value));
const keys = ref<string[]>([]);
const ticked = ref<number[]>([]);
const ready = computed(() => found.value !== null && ticked.value.length > 0);

let opener: HTMLElement | null = null;
let opening = 0;
let openedFor: string | undefined;

async function load() {
  const mine = ++opening;
  try {
    const result = await sidesInfo();
    if (mine === opening) info.value = result;
  } catch {
    if (mine === opening) info.value = 'failed';
  }
}

watch(sidesOpen, async (open) => {
  await nextTick();
  if (open && dialog.value && !dialog.value.open) {
    const active = document.activeElement;
    opener = active instanceof HTMLElement && !active.closest('[role="menu"]') ? active : null;
    keys.value = [];
    ticked.value = [];
    info.value = null;
    openedFor = script.project.value?.id;
    dialog.value.showModal();
    void load();
  }
  if (!open && dialog.value?.open) dialog.value.close();
});

function onClose() {
  sidesOpen.value = false;
  opening++;
  if (opener?.isConnected) opener.focus();
  else if (view.dom.offsetParent !== null) view.focus();
  opener = null;
}

/** Choosing characters ticks their scenes (the ticks before are replaced; they stay editable). */
watch(keys, () => {
  if (found.value) ticked.value = scenesOfCharacters(found.value, keys.value);
});

function exportNow() {
  if (!found.value || !ready.value) return;
  const choice = sidesChoice(found.value, keys.value, new Set(ticked.value));
  dialog.value?.close();
  void exportSides(choice, openedFor);
}
</script>

<template>
  <DDialog
    ref="dialog"
    size="md"
    class="sides-dialog"
    aria-labelledby="sides-title"
    aria-describedby="sides-what"
    @close="onClose"
  >
    <form @submit.prevent="exportNow">
      <h2 id="sides-title" class="d-dialog-title">Export sides</h2>
      <p id="sides-what" class="lead">
        One actor’s pages: every page a ticked scene is on, at its page number, with the other
        scenes on those pages crossed out.
      </p>
      <p v-if="info === null" class="status" role="status">Finding the characters and scenes…</p>
      <p v-else-if="info === 'failed'" class="status" role="alert">
        The characters and scenes couldn’t be found. Close this and try again.
      </p>
      <template v-if="found">
        <fieldset class="group">
          <legend>Characters</legend>
          <p v-if="found.characters.length === 0" class="hint">
            No character has a cue yet. Tick scenes below instead.
          </p>
          <ul class="list">
            <li v-for="character in found.characters" :key="character.key">
              <label class="check">
                <input
                  v-model="keys"
                  type="checkbox"
                  :value="character.key"
                />
                {{ character.name }}
              </label>
            </li>
          </ul>
        </fieldset>
        <fieldset class="group">
          <legend>Scenes</legend>
          <p class="hint">Choosing a character ticks their scenes again, replacing any ticks you changed by hand; you can then untick any you won’t need.</p>
          <ul class="list scenes">
            <li v-for="scene in found.scenes" :key="scene.ordinal">
              <label class="check">
                <input v-model="ticked" type="checkbox" :value="scene.ordinal" />
                <span class="num">{{ scene.label }}</span>
                {{ scene.heading || 'Untitled scene' }}
              </label>
            </li>
          </ul>
        </fieldset>
      </template>
      <p v-if="found && ticked.length === 0" class="hint" role="status">
        Tick at least one scene to export.
      </p>

      <div class="d-dialog-footer">
        <DButton @click="dialog?.close()">Cancel</DButton>
        <DButton variant="primary" type="submit" :disabled="!ready">Export</DButton>
      </div>
    </form>
  </DDialog>
</template>

<style scoped>
.sides-dialog {
  overflow-y: auto;
}
p {
  margin: 0 0 12px;
  color: var(--muted);
}
.status {
  color: var(--text);
}
.group {
  margin: 0 0 12px;
  padding: 0;
  border: 0;
}
legend {
  padding: 0;
  margin: 0 0 4px;
  font-weight: 600;
}
.list {
  max-height: 200px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}
.check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 3px 0;
  font-weight: 400;
}
.check input {
  flex: none;
  width: 16px;
  height: 16px;
  margin: 2px 0 0;
}
.num {
  min-width: 2.5em;
  font-weight: 600;
}
.hint {
  display: block;
  margin: 0 0 6px;
  font-size: 12px;
}
@media (max-width: 639.98px) {
  .sides-dialog {
    width: 100vw;
    max-width: 100vw;
    max-height: 92dvh;
    margin: auto 0 0;
    padding: 20px 16px calc(16px + env(safe-area-inset-bottom));
    border-bottom: 0;
    border-radius: var(--r-lg) var(--r-lg) 0 0;
  }
}
</style>
