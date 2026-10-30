import { ref } from 'vue';
import { currentAbout } from '~/about/info';
import { desktop } from '~/desktop';
import { createUpdateCheck } from './check';
import { later, useUpdateFlow } from './prompt';
import { applyUpdate, availableVersion, needRefresh, updateKind } from './state';

// Help → Check for updates, in the page: the dialog's open state, the one check for the visit,
// and what a found update does. A found update becomes the offer the app already has
// (`UpdatePrompt.vue`): Reload or Restart goes through its flow, which asks first when changes
// are unsaved, and Close leaves that offer up.

/** Whether the Check for updates dialog is open; the command sets it, `UpdateCheckDialog.vue` shows it. */
export const updateCheckOpen = ref(false);

let check: ReturnType<typeof createUpdateCheck> | undefined;

/** The check, made once. */
export function useUpdateCheck(): ReturnType<typeof createUpdateCheck> {
  if (!check) {
    const bridge = desktop();
    const sw = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
    check = createUpdateCheck({
      current: currentAbout().version,
      desktop: bridge?.updates?.check ? { check: () => bridge.updates.check() } : null,
      // A dev server and the desktop build register no worker (plugins/service-worker.client.ts).
      serviceWorker: sw && !import.meta.dev ? navigator.serviceWorker : null,
      offered: () =>
        needRefresh.value ? { version: availableVersion.value, how: updateKind.value } : null,
    });
  }
  return check;
}

/** Runs the check; a found update is held as the offer, which `UpdatePrompt` shows once nothing modal is open. */
export async function runUpdateCheck(): Promise<void> {
  const result = await useUpdateCheck().run();
  if (result.status !== 'ready') return;
  if (result.how) updateKind.value = result.how;
  if (result.version) availableVersion.value = result.version;
  needRefresh.value = true;
}

/** The writer chose Reload, Restart, or Get it: the offer's own choice, after its question if changes are unsaved. */
export function takeUpdate(): void {
  // Later, chosen before, is undone: the writer asked for this one.
  later.value = false;
  if (updateKind.value === 'get') void applyUpdate();
  else void useUpdateFlow().reload();
}
