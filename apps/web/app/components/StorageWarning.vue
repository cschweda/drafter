<script setup lang="ts">
import type { ButtonProps } from '@nuxt/ui';
import { useGuard } from '~/storage/guard';
import { save } from '~/storage/save';
import { rememberStorageToast, storageToastSeen, useStorageNotice } from '~/storage/storage-notice';
import { tourShowing, welcomeSettled } from '~/tour/state';

// The recovery copy's warnings (fresh-look design §3.5). "May be cleared" is a toast with the advice
// and Save to a file, shown in a browser until it is dismissed once; the status bar's chip keeps
// saying so. "Unavailable" is an alert above the panes while it lasts: the changes are only in memory.
// The first is a caution (`tone-warn`), the second an error (`tone-danger`).
const { mayBeCleared, unavailable, advice, dismiss } = useStorageNotice();
const { readOnly } = useGuard();
const toast = useToast();
const wide = useWideScreen();
const TOAST = 'storage-warning';

/** Save to a file, unless the tab can't save (read-only). */
function saveAction() {
  return readOnly.value
    ? []
    : [
        {
          label: 'Save to a file',
          color: 'neutral' as const,
          variant: 'subtle' as const,
          onClick: () => save().catch(() => {}),
        },
      ];
}

function show() {
  // A data attribute names the toast for the tests and the status bar; Nuxt UI passes it to the root.
  const attrs = { 'data-warning': 'not-persistent' };
  // The close button is named for what it does here; Nuxt UI passes the attribute to the button
  // (its props' type has no place for an attribute).
  const dismissButton = { 'aria-label': 'Dismiss' } as unknown as ButtonProps;
  // On a phone the advice is a paragraph that would cover half the screen: it waits behind "Why?".
  const brief = !wide.value;
  toast.add({
    ...attrs,
    id: TOAST,
    // A caution, in its quiet amber (main.css's tones).
    class: 'tone-warn',
    title: 'Autosave isn’t guaranteed in this browser',
    description: brief ? undefined : advice(),
    icon: 'i-lucide-triangle-alert',
    color: 'neutral',
    // It waits for the writer (no time limit to read it, WCAG 2.2.1), and is said politely.
    duration: 0,
    progress: false,
    type: 'background',
    close: dismissButton,
    actions: brief
      ? [
          {
            label: 'Why?',
            color: 'neutral',
            variant: 'subtle',
            closeOnClick: false,
            onClick: () => toast.update(TOAST, { description: advice(), actions: saveAction() }),
          },
          ...saveAction(),
        ]
      : saveAction(),
    'onUpdate:open': (open: boolean) => {
      if (open) return;
      dismiss();
      // Remembered on a wide screen only: a phone has no status bar to keep saying so (Task 6 hides
      // it below 640px), so there the toast comes back at each visit.
      if (wide.value) rememberStorageToast();
    },
  });
}

watch(
  // A first visit's welcome (and the tour, if taken) comes first: the toast waits for it to close,
  // so the two never show at once. The status bar's chip says so meanwhile.
  () => [mayBeCleared.value, welcomeSettled.value && !tourShowing.value] as const,
  ([now, clear]) => {
    if (!import.meta.client) return;
    // Shown while the warning stands, until the writer dismisses it (then it stays dismissed for the
    // visit: the status bar's chip still says so).
    const there = toast.toasts.value.some((t) => t.id === TOAST);
    if (now && clear && !there && !storageToastSeen()) show();
    else if (!now && there) toast.remove(TOAST);
  },
  { immediate: true },
);
</script>

<template>
  <!-- The alert region stays in the page and only its contents change, so a screen reader hears
       what is put in it. -->
  <div role="alert" data-warning-region="alert">
    <div v-if="unavailable" class="warning tone-danger" data-warning="unavailable">
      <UIcon name="i-lucide-triangle-alert" class="icon tone-icon" />
      <p>
        Autosave isn’t working in this browser right now. Your changes are only in this page
        until you save the script to a file.
      </p>
    </div>
  </div>
</template>

<style scoped>
.warning {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px 6px 11px;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
/* An error: the tone (main.css) is its tint, its edge, and the icon's colour. */
.icon {
  flex: none;
  width: 16px;
  height: 16px;
}
p {
  margin: 0;
}
</style>
