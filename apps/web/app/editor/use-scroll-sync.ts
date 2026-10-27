import { effectScope, watch } from 'vue';
import { useSettings } from '../settings/settings';
import { createScrollSync, type ScrollSync } from './scroll-sync';
import { useEditor } from './session';

let shared: ScrollSync | undefined;

/** The app's scroll sync, made on first use (in the browser) and kept for the visit. */
export function useScrollSync(): ScrollSync {
  if (!shared) {
    const { settings } = useSettings();
    const { view } = useEditor();
    const sync = createScrollSync({
      enabled: () => settings.value.scrollSync,
      cursor: () => view.state.selection.main.head,
    });
    // Turned on, the panes are put in step at once. The watcher lives for the visit.
    effectScope(true).run(() => {
      watch(
        () => settings.value.scrollSync,
        (on) => {
          if (on) sync.resync();
        },
      );
    });
    shared = sync;
  }
  return shared;
}
