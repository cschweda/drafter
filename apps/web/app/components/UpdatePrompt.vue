<script setup lang="ts">
import { useScript } from '~/storage/script';
import { modalOpen, tourShowing } from '~/tour/state';
import {
  actionLabel,
  anywayLabel,
  applyingMessage,
  DOWNLOADING_MESSAGE,
  INSTALL_FAILED,
  offerText,
  unsavedMessage,
} from '~/update/flow';
import { clear, later, useUpdateFlow } from '~/update/prompt';
import { installError, needRefresh, updateKind } from '~/update/state';
import { justUpdated, UP_TO_DATE } from '~/update/updated';
import { takeUpdate } from '~/update/use-check';

// "A new version of Drafter is ready" (Phase 1 design §11): a toast with Reload (Restart on the desktop app, Get it for a .deb), shown when the
// service worker has a newer version waiting. It never reloads by itself. With changes that aren't
// in a file, Reload asks first (Save first, Reload anyway, Cancel); those changes are in the
// recovery copy either way. It isn't a modal, so the page stays usable behind it, and it waits
// for the welcome dialog, the tour, and any other dialog to close rather than stacking on them.
// What it has been told (Later, the stage) is `update/prompt.ts`'s, so focus mode, which takes
// this away with the toolbar, gives it back as it was.
const { recovery } = useScript();
const flow = useUpdateFlow();

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

// A .deb only opens the release page: nothing to save first.
function choose() {
  takeUpdate();
}

function putOff() {
  later.value = true;
  installError.value = false;
  flow.cancel();
}

const shown = computed(() => needRefresh.value && clear.value && !later.value);

const reloadButton = ref<HTMLButtonElement>();
const saveButton = ref<HTMLButtonElement>();

// Reload chosen in Help → Check for updates, with changes unsaved: the question is what appears,
// once that dialog has closed, and its first choice gets focus then.
watch(shown, async (now) => {
  if (!now || flow.stage.value !== 'confirm') return;
  await nextTick();
  saveButton.value?.focus();
});

// The question replaces the toast's buttons, so focus goes to its first choice; Cancel puts it
// back on Reload.
watch(flow.stage, async (now) => {
  await nextTick();
  (now === 'confirm' ? saveButton.value : reloadButton.value)?.focus();
});

// After a reload the writer chose, a brief note that it worked. Never while an offer is up: then
// this is not the newest version (the new one never took over, or there is a newer one still).
/** How long the note stays before it goes (it fades out, but not with reduced motion). */
const UPDATED_MS = 4000;
let updatedTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  justUpdated,
  (now) => {
    clearTimeout(updatedTimer);
    if (now) {
      updatedTimer = setTimeout(() => {
        justUpdated.value = false;
      }, UPDATED_MS);
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => clearTimeout(updatedTimer));

const applying = computed(() => flow.stage.value === 'applying');

function message(): string {
  if (flow.stage.value === 'downloading') return DOWNLOADING_MESSAGE;
  if (applying.value) return applyingMessage(updateKind.value);
  return offerText(updateKind.value);
}

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
      <!-- A caution in its quiet amber; an install that failed is an error (main.css's tones). -->
      <section
        v-if="shown"
        class="update"
        :class="installError ? 'tone-danger' : 'tone-warn'"
        aria-label="Update"
        data-update
        @keydown="onKeydown"
      >
        <template v-if="installError">
          <p>{{ INSTALL_FAILED }}</p>
          <div class="actions">
            <button ref="reloadButton" type="button" class="action quiet" @click="putOff">
              Later
            </button>
          </div>
        </template>
        <template v-else-if="flow.stage.value !== 'confirm'">
          <p>{{ message() }}</p>
          <!-- While the new version is applied, the buttons stay where they were, and can't be pressed. -->
          <div class="actions">
            <button
              ref="reloadButton"
              type="button"
              class="action"
              :disabled="applying"
              @click="choose"
            >
              {{ actionLabel(updateKind) }}
            </button>
            <button type="button" class="action quiet" :disabled="applying" @click="putOff">
              Later
            </button>
          </div>
        </template>
        <template v-else>
          <p>{{ unsavedMessage(recovery, updateKind) }}</p>
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
              {{ anywayLabel(recovery, updateKind) }}
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
    <div role="status" data-updated-region>
      <Transition name="updated">
        <section
          v-if="justUpdated && !needRefresh"
          class="update updated"
          aria-label="Updated"
          data-updated
        >
          <p>{{ UP_TO_DATE }}</p>
        </section>
      </Transition>
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
  border: 1px solid var(--border);
  border-left: 3px solid var(--tone-border);
  border-radius: var(--r-sm);
  background: var(--tone-bg);
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
  border: 1px solid var(--tone-border);
  border-radius: var(--r-sm);
  background: none;
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.action:hover:not(:disabled) {
  background: var(--tone-hover);
}
/* Later and Cancel: the quiet choices, the dismiss of this toast, in the hue. */
.action.quiet {
  border-color: transparent;
  color: var(--tone);
  font-weight: 500;
}
.action:disabled {
  opacity: 0.6;
  cursor: default;
}
/* "Drafter is up to date": news, not a caution, so the raised surface with an accent edge. */
.updated {
  --tone-bg: var(--raised);
  --tone-border: var(--accent-text);
}
.updated-leave-active {
  transition: opacity 0.6s ease;
}
.updated-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .updated-leave-active {
    transition: none;
  }
}
@media (max-width: 1023px) {
  .update {
    left: 8px;
    right: 8px;
    max-width: none;
  }
}
</style>
