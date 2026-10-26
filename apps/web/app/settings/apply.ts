import { watch } from 'vue';
import { applyEditorSettings } from '~/editor/apply-settings';
import { useEditor } from '~/editor/session';
import { useSettings } from './settings';

/**
 * Puts the settings into effect, and keeps them in effect as they change. It starts once the
 * settings table has been read, so the first paint is not undone by the defaults. Call it from
 * the page's setup; it returns the function that stops it.
 *
 * - Spellcheck, line numbers, and Strict Fountain's lint go to the editor (`applyEditorSettings`;
 *   `load` does the same for a script that is opened).
 * - The text size is `--text-scale` on the root, which the Source pane's theme and the Script
 *   pane's 100% zoom multiply by.
 * - Match system appearance sets the color mode's preference to `system`, and turning it off
 *   puts back the theme that was chosen last. The theme stays in localStorage (Plan 1), so the
 *   first paint has no flash. Choosing a theme by hand while it is on turns it off.
 */
export function applySettings(): () => void {
  const { settings, set, ready } = useSettings();
  const { view } = useEditor();
  const colorMode = useColorMode();
  const stops: Array<() => void> = [];
  let stopped = false;

  void ready.then(() => {
    if (stopped) return;

    stops.push(
      watch(
        () => [settings.value.spellcheck, settings.value.lineNumbers, settings.value.strict],
        () => applyEditorSettings(view, settings.value),
        { immediate: true },
      ),
      watch(
        () => settings.value.textSize,
        (size) => {
          document.documentElement.style.setProperty('--text-scale', String(size));
          // The editor measures its lines itself, and a different font size is no edit.
          view.requestMeasure();
        },
        { immediate: true },
      ),
    );

    // The theme that was chosen last by hand, for when following the system stops.
    let chosen: 'light' | 'dark' | undefined;
    stops.push(
      watch(
        () => settings.value.matchSystem,
        (on) => {
          if (on) {
            if (colorMode.preference !== 'system')
              chosen = colorMode.preference as 'light' | 'dark';
            colorMode.preference = 'system';
          } else if (colorMode.preference === 'system') {
            colorMode.preference = chosen ?? (colorMode.value === 'light' ? 'light' : 'dark');
          }
        },
        { immediate: true },
      ),
      watch(
        () => colorMode.preference,
        (preference) => {
          if (preference === 'system' || !settings.value.matchSystem) return;
          chosen = preference as 'light' | 'dark';
          void set('matchSystem', false);
        },
      ),
    );
  });

  return () => {
    stopped = true;
    for (const stop of stops) stop();
  };
}
