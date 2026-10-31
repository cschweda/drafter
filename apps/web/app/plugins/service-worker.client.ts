import { registerSW } from 'virtual:pwa-register';
import { allowLeaving } from '~/storage/leaving';
import { fetchNewest } from '~/update/check';
import {
  createControllerWatch,
  leavingRequested,
  needRefresh,
  replaced,
  setUpdater,
} from '~/update/state';

// Registers the service worker (`@vite-pwa/nuxt` writes it at build time: nuxt.config.ts `pwa`) and
// tells the page when a newer version is waiting. The module's own client plugin is off
// (`client.registerPlugin: false`), because with it a tab reloads itself as soon as ANY tab lets
// a new version take over; here a reload happens only in the tab whose writer chose it.

/**
 * How long the page waits, after telling the new version to take over, for the change of
 * controller that is its cue to reload. It takes moments; if it never comes (the waiting worker
 * is gone, or never answers), the page reloads regardless rather than leaving the writer's choice
 * looking ignored, and the new version is there on the next load.
 */
const TAKEOVER_MS = 3000;

export default defineNuxtPlugin(() => {
  // There is no worker in `nuxt dev`, and a registration there would only fail.
  if (import.meta.dev || !('serviceWorker' in navigator)) return;

  let fallback: ReturnType<typeof setTimeout> | undefined;
  /** The reload the writer chose. If it was "Reload anyway", the browser's own question is skipped, from now. */
  const reload = () => {
    clearTimeout(fallback);
    if (leavingRequested()) allowLeaving();
    window.location.reload();
  };

  // On a first visit the worker takes over a moment after it installs (`clientsClaim`): that first
  // change of controller is not an update (state.ts says how the rest are told apart).
  const watch = createControllerWatch({
    controlled: navigator.serviceWorker.controller !== null,
    reload,
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => watch.onChange());

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
      reload();
      return;
    }
    // The newest version on the server, not only the one waiting when the offer appeared
    // (update/check.ts says why).
    const registration = await navigator.serviceWorker.getRegistration().catch(() => undefined);
    await fetchNewest(registration);
    // Another tab may have let it take over meanwhile.
    if (replaced.value) {
      reload();
      return;
    }
    watch.apply();
    await skipWaiting(true);
    fallback = setTimeout(reload, TAKEOVER_MS);
  });
});
