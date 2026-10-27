import { watch } from 'vue';
import { desktop } from '~/desktop';
import type { SettingsStore } from '~/settings/settings';
import { useScript } from '~/storage/script';
import { availableVersion, needRefresh, setUpdater, updateKind } from './state';

// The desktop app's source of updates, in place of the service worker (which the desktop build
// doesn't have): the bridge says when a newer version is found, and what the writer chooses
// (Restart, or Get it) goes back through it. The toast, Later, and the unsaved-changes question
// are the web's own (`UpdatePrompt.vue`, `flow.ts`); only the words and the last step differ.

/**
 * Listens for the desktop app's offers and tells it the Check for updates setting, from the time
 * the settings are read and whenever it changes. Does nothing in a browser. Returns the function
 * that stops listening.
 */
export function installDesktopUpdates(settings: SettingsStore): () => void {
  const bridge = desktop();
  if (!bridge?.updates) return () => {};
  const updates = bridge.updates;

  setUpdater(async () => {
    if (updateKind.value === 'get') {
      updates.openReleasePage();
      return;
    }
    // The recovery copy is written before the app goes, whichever way the writer chose.
    await useScript().flush();
    await updates.install();
  });

  const stopOffers = updates.onAvailable((version, how) => {
    availableVersion.value = version;
    updateKind.value = how;
    needRefresh.value = true;
  });

  let stopped = false;
  let stopWatching = () => {};
  void settings.ready.then(() => {
    if (stopped) return;
    updates.setEnabled(settings.settings.value.checkForUpdates);
    stopWatching = watch(
      () => settings.settings.value.checkForUpdates,
      (on) => updates.setEnabled(on),
    );
  });

  return () => {
    stopped = true;
    stopWatching();
    stopOffers();
  };
}
