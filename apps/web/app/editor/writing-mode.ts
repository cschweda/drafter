import type { DocumentKind } from '~/markdown/kind';
import { type Settings, useSettings, type WritingMode } from '~/settings/settings';
import { applyEditorSettings } from './apply-settings';
import { sayClassic } from './element-notice';
import { useEditor } from './session';

// The switch's one action (Classic Mode design §3.4), for the top bar, focus mode, the palette, and
// Mod+Alt+0. Settings sets the same row, and leaves focus in its dialog.

export const CLASSIC_NOTICE = 'Classic Mode. Enter and Tab move between elements.';
export const FOUNTAIN_NOTICE = 'Fountain Mode. You type the marks.';

/** The Classic Mode help page. */
export const CLASSIC_HELP = '/docs/classic-mode/';

export const CLASSIC_TIP =
  'Classic Mode: Enter and Tab move you through the script, the way many screenwriting apps work. Your file stays Fountain.';
export const FOUNTAIN_TIP =
  'Fountain Mode: you type the script as plain text, with Fountain’s marks.';

/** The first-run hint is showing (§9.3): Classic Mode on a script, and the hint not yet seen. */
export const hintDue = (settings: Settings, kind: DocumentKind): boolean =>
  settings.writingMode === 'classic' && !settings.classicHintSeen && kind === 'fountain';

/**
 * Sets the setting, says the notice (or, the first time, leaves the words to the hint, which says
 * more and begins the same way), and gives focus back to the editor. The editor is changed here
 * rather than by the settings' watcher, so the focus lands on the mode just chosen; the watcher then
 * finds nothing to do. Nothing goes in the file, and with `view.scrollSnapshot()` in the
 * reconfiguring dispatch the writer's place stays.
 */
export function setWritingMode(mode: WritingMode): void {
  const { settings, set } = useSettings();
  const { view, kind } = useEditor();
  void set('writingMode', mode);
  applyEditorSettings(view, settings.value, kind.value);
  if (!hintDue(settings.value, kind.value)) {
    void sayClassic(mode === 'classic' ? CLASSIC_NOTICE : FOUNTAIN_NOTICE);
  }
  view.focus();
}
