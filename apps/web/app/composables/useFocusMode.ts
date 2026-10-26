/**
 * Focus mode (Phase 1 design §7.1): the toolbar, the tabs, the slim bars, the status bar, and the
 * other pane go, and the Source shows alone in a centered column. The state is shared by the
 * toolbar's Focus button, the command, and the page that draws the layout.
 */
export function useFocusMode() {
  const state = useState<boolean>('focus-mode', () => false);
  const on = computed(() => state.value);

  return {
    on,
    toggle() {
      state.value = !state.value;
    },
    /** Leaves focus mode; nothing happens when it is not on. */
    leave() {
      state.value = false;
    },
  };
}
