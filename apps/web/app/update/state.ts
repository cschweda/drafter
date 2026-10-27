import { ref } from 'vue';

// What the service worker has told the page (Phase 1 design §11). `app/plugins/service-worker.client.ts`
// sets these; `UpdatePrompt.vue` reads them.

/** A new version is installed and waiting: the writer is offered a reload. */
export const needRefresh = ref(false);

/**
 * What the offer asks of the writer: `reload` (the web), `restart` (the desktop app, the new
 * version is downloaded), or `get` (a .deb, which opens the release page). The service worker
 * (`plugins/service-worker.client.ts`) is the web's source of updates and leaves this as it is;
 * the desktop's (`desktop-source.ts`) sets it.
 */
export type UpdateKind = 'reload' | 'restart' | 'get';
export const updateKind = ref<UpdateKind>('reload');
/** The version the desktop app found (empty on the web). */
export const availableVersion = ref('');

/**
 * Another tab already let the new version take over. This tab still runs the old files, so a
 * reload is all it needs (there is no waiting worker left to tell).
 */
export const replaced = ref(false);

export interface ApplyOptions {
  /** The writer chose to leave with changes that aren't in a file (the recovery copy keeps them). */
  anyway?: boolean;
}

let updater: () => Promise<void> = async () => {};
let leaving = false;

/** The plugin says how an update is applied. */
export function setUpdater(apply: () => Promise<void>): void {
  updater = apply;
}

/** Lets the waiting version take over and reloads this page. Only ever called by a choice the writer made. */
export function applyUpdate(options: ApplyOptions = {}): Promise<void> {
  leaving = options.anyway === true;
  return updater();
}

/** Whether the reload about to happen is one the writer chose to make with unsaved changes. */
export function leavingRequested(): boolean {
  return leaving;
}

/**
 * Tells a change of the page's controlling worker apart (the browser's `controllerchange`):
 * - In the tab whose writer asked for the update (`apply`), it is the cue to reload.
 * - Anywhere else, the new version has taken over without this tab's writer choosing it: the tab
 *   is left as it is, with the offer still up (`replaced`), and its Reload only has to reload.
 * - The first change on a first visit is the worker claiming the page (`clientsClaim`), not an
 *   update. A tab that was offered an update has seen a worker already, whether or not one
 *   controlled the page (a hard reload loads the page without one), so its changes always count.
 */
export function createControllerWatch(options: { controlled: boolean; reload: () => void }) {
  let controlled = options.controlled;
  let applying = false;
  return {
    /** This tab's writer asked for the new version. */
    apply() {
      applying = true;
    },
    onChange() {
      if (applying) {
        options.reload();
        return;
      }
      const claiming = !controlled && !needRefresh.value;
      controlled = true;
      if (!claiming) replaced.value = true;
    },
  };
}
