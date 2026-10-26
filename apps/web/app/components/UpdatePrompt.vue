<script setup lang="ts">
import { useFiles } from '~/storage/files';
import { save } from '~/storage/save';
import { useScript } from '~/storage/script';
import { modalOpen, tourShowing } from '~/tour/state';
import {
  createUpdateFlow,
  DOWNLOADING_MESSAGE,
  reloadAnywayLabel,
  UPDATE_READY,
  unsavedMessage,
} from '~/update/flow';
import { applyUpdate, needRefresh } from '~/update/state';

// "A new version of Drafter is ready" (Phase 1 design §11): a toast with Reload, shown when the
// service worker has a newer version waiting. It never reloads by itself. With changes that aren't
// in a file, Reload asks first (Save first, Reload anyway, Cancel); those changes are in the
// recovery copy either way. It isn't a modal, so the page stays usable behind it, and it waits
// for the welcome dialog, the tour, and any other dialog to close rather than stacking on them.
const { dirty, recovery, flush } = useScript();

const flow = createUpdateFlow({
  unsaved: () => dirty.value,
  save,
  // Where the browser can't write the file itself, Save is a download.
  savedByDownload: () => !useFiles().canSaveInPlace,
  flush,
  apply: applyUpdate,
});

/** "Later": hidden until the page is loaded again. The app works as it is. */
const later = ref(false);
/** Nothing else is modal, and the tour isn't up: the toast may appear. Once it has, it stays. */
const clear = ref(false);

let timer: ReturnType<typeof setTimeout> | undefined;
function look() {
  timer = undefined;
  if (!needRefresh.value || clear.value) return;
  if (modalOpen() || tourShowing.value) {
    timer = setTimeout(look, 250);
    return;
  }
  clear.value = true;
}
watch(needRefresh, look, { immediate: true });
onBeforeUnmount(() => clearTimeout(timer));

const shown = computed(() => needRefresh.value && clear.value && !later.value);

const reloadButton = ref<HTMLButtonElement>();
const saveButton = ref<HTMLButtonElement>();

// The question replaces the toast's buttons, so focus goes to its first choice; Cancel puts it
// back on Reload.
watch(flow.stage, async (now) => {
  await nextTick();
  (now === 'confirm' ? saveButton.value : reloadButton.value)?.focus();
});

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || flow.stage.value !== 'confirm' || flow.saving.value) return;
  event.preventDefault();
  event.stopPropagation();
  flow.cancel();
}
</script>

<template>
  <div>
    <!--
      The region stays in the page and only its contents change, so a screen reader hears the
      offer when it appears.
    -->
    <div role="status" data-update-region>
      <section
        v-if="shown"
        class="update"
        aria-label="Update"
        data-update
        @keydown="onKeydown"
      >
        <template v-if="flow.stage.value === 'toast' || flow.stage.value === 'downloading'">
          <p>{{ flow.stage.value === 'downloading' ? DOWNLOADING_MESSAGE : UPDATE_READY }}</p>
          <div class="actions">
            <button ref="reloadButton" type="button" class="action" @click="flow.reload()">
              Reload
            </button>
            <button type="button" class="action quiet" @click="later = true">Later</button>
          </div>
        </template>
        <template v-else>
          <p>{{ unsavedMessage(recovery) }}</p>
          <div class="actions">
            <button
              ref="saveButton"
              type="button"
              class="action"
              :disabled="flow.saving.value"
              @click="flow.saveFirst()"
            >
              Save first
            </button>
            <button
              type="button"
              class="action"
              :disabled="flow.saving.value"
              @click="flow.reloadAnyway()"
            >
              {{ reloadAnywayLabel(recovery) }}
            </button>
            <button
              type="button"
              class="action quiet"
              :disabled="flow.saving.value"
              @click="flow.cancel()"
            >
              Cancel
            </button>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.update {
  position: fixed;
  left: 12px;
  bottom: 44px;
  z-index: 35;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  max-width: min(34rem, calc(100vw - 24px));
  padding: 10px 14px;
  border: 1px solid var(--line);
  border-left: 3px solid var(--heading);
  border-radius: 7px;
  background: var(--chrome-2);
  color: var(--text);
  font-size: 13px;
  line-height: 1.45;
  box-shadow: 0 6px 24px rgb(0 0 0 / 0.35);
}
p {
  flex: 1 1 14rem;
  margin: 0;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.action {
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
.action.quiet {
  border-color: var(--line);
  font-weight: 400;
}
.action:disabled {
  opacity: 0.6;
  cursor: default;
}
.action:focus-visible {
  outline: 2px solid var(--heading);
  outline-offset: 2px;
}
@media (max-width: 1023px) {
  .update {
    left: 8px;
    right: 8px;
    max-width: none;
  }
}
</style>
