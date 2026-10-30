import { useFocusMode } from '~/composables/useFocusMode';
import { useSettings } from '~/settings/settings';
import { useGuard } from '~/storage/guard';

/**
 * Whether the element bar shows over the Source: Settings has it on, and it goes in focus mode and
 * in a script that can't be changed. The bar uses it, and so do the panes side by side, which
 * give the bar its row (AppPane.vue).
 */
export function useElementBarShown() {
  const focus = useFocusMode();
  const { readOnly } = useGuard();
  const { settings } = useSettings();
  return computed(() => settings.value.elementBar && !focus.on.value && !readOnly.value);
}
