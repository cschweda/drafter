import type { Compartment, Extension, StateEffect } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { Settings } from '~/settings/settings';
import {
  lineNumbersExtension,
  lineNumbersGutter,
  relint,
  spellcheck,
  spellcheckExtension,
  typewriter,
  typewriterExtension,
} from './extensions';

/**
 * Puts the settings that live in the editor's compartments into the editor: spellcheck (the
 * spelling marks), line numbers, and typewriter scrolling, and a new lint for Strict Fountain (the lint reads the option on each run). `load`
 * gives the editor a fresh state with every compartment at its first value, so this runs after
 * each one as well as after each change.
 */
export function applyEditorSettings(view: EditorView, settings: Settings): void {
  // Only a compartment whose value changed is reconfigured: the others keep what they hold (the
  // typewriter plugin, in particular, keeps the room it made above and below the text).
  const effects: StateEffect<unknown>[] = [];
  const set = (compartment: Compartment, next: Extension) => {
    if (compartment.get(view.state) !== next) effects.push(compartment.reconfigure(next));
  };
  set(spellcheck, spellcheckExtension(settings.spellcheck));
  set(lineNumbersGutter, lineNumbersExtension(settings.lineNumbers));
  set(typewriter, typewriterExtension(settings.typewriter));
  if (effects.length > 0) view.dispatch({ effects });
  relint();
}
