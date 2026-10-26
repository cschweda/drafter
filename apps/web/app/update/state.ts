import { ref } from 'vue';

// What the service worker has told the page (Phase 1 design §11). `app/plugins/service-worker.client.ts`
// sets these; `UpdatePrompt.vue` reads them.

/** A new version is installed and waiting: the writer is offered a reload. */
export const needRefresh = ref(false);

/**
 * Another tab already let the new version take over. This tab still runs the old files, so a
 * reload is all it needs (there is no waiting worker left to tell).
 */
export const replaced = ref(false);

let updater: () => Promise<void> = async () => {};

/** The plugin says how an update is applied. */
export function setUpdater(apply: () => Promise<void>): void {
  updater = apply;
}

/** Lets the waiting version take over and reloads this page. Only ever called by a choice the writer made. */
export function applyUpdate(): Promise<void> {
  return updater();
}
