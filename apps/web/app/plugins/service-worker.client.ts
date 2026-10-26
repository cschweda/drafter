import { registerSW } from 'virtual:pwa-register';
import { needRefresh, replaced, setUpdater } from '~/update/state';

// Registers the service worker (`@vite-pwa/nuxt` writes it at build time: nuxt.config.ts `pwa`) and
// tells the page when a newer version is waiting. The module's own client plugin is off
// (`client.registerPlugin: false`), because with it a tab reloads itself as soon as ANY tab lets
// a new version take over; here a reload happens only in the tab whose writer chose it.
export default defineNuxtPlugin(() => {
  // There is no worker in `nuxt dev`, and a registration there would only fail.
  if (import.meta.dev || !('serviceWorker' in navigator)) return;

  /** This tab asked for the new version to take over, so this tab reloads when it has. */
  let applying = false;
  /**
   * Whether a worker has controlled this page yet. On a first visit the worker takes over a moment
   * after it installs (`clientsClaim`): that first change of controller is not an update.
   */
  let controlled = navigator.serviceWorker.controller !== null;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!controlled) {
      controlled = true;
      return;
    }
    // A new version has taken over. If this tab didn't ask, the writer didn't choose a reload
    // here: the offer stays, and Reload then needs only to reload.
    if (applying) window.location.reload();
    else replaced.value = true;
  });

  const skipWaiting = registerSW({
    immediate: true,
    onNeedRefresh() {
      needRefresh.value = true;
    },
    // Called when a new version takes over, in place of the reload the library would do on its own
    // (and only if the page was controlled when it registered). The controller change above
    // decides what a take-over means here.
    onNeedReload() {},
  });

  setUpdater(async () => {
    if (replaced.value) {
      window.location.reload();
      return;
    }
    applying = true;
    await skipWaiting(true);
  });
});
