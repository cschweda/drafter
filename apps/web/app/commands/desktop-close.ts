// Closing the desktop app's window or quitting it (docs/drafter-desktop-design.md §5), seen from
// the page. The desktop app decides and shows the dialog; the page only answers: whether closing
// would lose text that is in no file, how to Save, and how to write the recovery copy now. In a
// browser the page's own `beforeunload` question does this job (`storage/script.ts`).
import { type DesktopCloseState, desktop } from '~/desktop';
import { save } from '~/storage/save';
import { useScript } from '~/storage/script';

/** What the page holds that closing would lose; the title is for the dialog. */
export function closeState(): DesktopCloseState {
  const script = useScript();
  return {
    unsaved: script.wouldLose.value,
    title: script.project.value?.title ?? '',
    // With no recovery copy to write, the dialog must not say there is one.
    recoverable: script.recovery.value !== 'unavailable',
  };
}

/** Answers the desktop app's close requests. Does nothing in a browser. Returns the function that stops it. */
export function installDesktopClose(): () => void {
  const bridge = desktop();
  if (!bridge) return () => {};
  return bridge.onCloseRequest({
    state: async () => closeState(),
    // Save says why it didn't in the status bar (a failed write, a file changed elsewhere); a
    // Save As the writer cancelled isn't an error. Either way the window stays.
    save: async () => {
      try {
        return (await save()) === 'saved';
      } catch {
        return false;
      }
    },
    flush: () => useScript().flush(),
  });
}
