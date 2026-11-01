import { ref, watch } from 'vue';
import { useFiles } from '~/storage/files';
import { save } from '~/storage/save';
import { useScript } from '~/storage/script';
import { createUpdateFlow } from './flow';
import { applyingUpdate, applyUpdate, setBeforeReload } from './state';

// What "A new version of Drafter is ready" has been told, kept for the visit and not by the
// component: `UpdatePrompt` sits in the toolbar's part of the page, which focus mode takes away,
// and a remount must not bring back an offer put off with Later, or forget a download under way.

/** "Later": hidden until the page is loaded again. The app works as it is. */
export const later = ref(false);
/** Nothing else was modal, and the tour wasn't up, when the offer came: it may appear. Once it has, it stays. */
export const clear = ref(false);

let flow: ReturnType<typeof createUpdateFlow> | undefined;

/** The offer's choices (the toast, the question, a download under way): one for the visit. */
export function useUpdateFlow(): ReturnType<typeof createUpdateFlow> {
  if (!flow) {
    const { dirty, flush } = useScript();
    flow = createUpdateFlow({
      unsaved: () => dirty.value,
      save,
      // Where the browser can't write the file itself, Save is a download.
      savedByDownload: () => !useFiles().canSaveInPlace,
      flush,
      apply: applyUpdate,
    });
    setBeforeReload(flush);
    // Nothing typed while the new version is fetched and takes over is lost to the reload.
    watch(
      flow.stage,
      (stage) => {
        applyingUpdate.value = stage === 'applying';
      },
      { flush: 'sync' },
    );
  }
  return flow;
}
