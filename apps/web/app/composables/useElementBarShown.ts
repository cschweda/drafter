import { useFocusMode } from '~/composables/useFocusMode';
import { useOnScreenKeyboard } from '~/composables/useOnScreenKeyboard';
import { elementRowShown } from '~/editor/classic-key-line';
import { useEditor } from '~/editor/session';
import { useSettings } from '~/settings/settings';
import { useGuard } from '~/storage/guard';

/**
 * Whether the element bar shows over the Source: Settings has it on, and it goes in focus mode and
 * in a script that can't be changed. In Classic Mode with a phone's keyboard up it shows whatever
 * the setting, focus mode too, for its Next button (Classic Mode design §10). The bar uses it, and
 * so do the panes side by side, which give the bar its row (AppPane.vue).
 */
export function useElementBarShown() {
  const focus = useFocusMode();
  const { readOnly } = useGuard();
  const { settings } = useSettings();
  const keyboard = useOnScreenKeyboard();
  const { kind } = useEditor();
  return computed(() =>
    elementRowShown({
      setting: settings.value.elementBar,
      focus: focus.on.value,
      readOnly: readOnly.value,
      classicKeyboard:
        keyboard.open.value &&
        settings.value.writingMode === 'classic' &&
        kind.value !== 'markdown',
    }),
  );
}
