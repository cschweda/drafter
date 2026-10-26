import type { EditorView } from '@codemirror/view';
import type { Settings } from '~/settings/settings';
import {
  lineNumbersExtension,
  lineNumbersGutter,
  relint,
  spellcheck,
  spellcheckAttribute,
  typewriter,
  typewriterExtension,
} from './extensions';

/**
 * Puts the settings that live in the editor's compartments into the editor: spellcheck, line
 * numbers, and typewriter scrolling, and a new lint for Strict Fountain (the lint reads the option on each run). `load`
 * gives the editor a fresh state with every compartment at its first value, so this runs after
 * each one as well as after each change.
 */
export function applyEditorSettings(view: EditorView, settings: Settings): void {
  view.dispatch({
    effects: [
      spellcheck.reconfigure(spellcheckAttribute(settings.spellcheck)),
      lineNumbersGutter.reconfigure(lineNumbersExtension(settings.lineNumbers)),
      typewriter.reconfigure(typewriterExtension(settings.typewriter)),
    ],
  });
  relint();
}
