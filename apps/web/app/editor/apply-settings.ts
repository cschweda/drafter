import type { Compartment, EditorSelection, Extension, StateEffect } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { selectionClear, tidiedSpeech } from '@drafter/cm-fountain';
import type { Settings } from '~/settings/settings';
import type { DocumentKind } from '../markdown/kind';
import {
  CLASSIC_OFF,
  lineNumbersExtension,
  lineNumbersGutter,
  relint,
  spellcheck,
  spellcheckExtension,
  typewriter,
  typewriterExtension,
  writingMode,
  writingModeExtension,
} from './extensions';

/**
 * What a change of writing mode dispatches, with no text in it (Classic Mode design §3.4). Leaving
 * Classic Mode first takes a line Enter made in a speech, which would stay to cut it in two, and is
 * the one thing a switch can write. A selection is stopped above the metadata block Classic Mode is
 * about to hide, and the snapshot keeps the writer's place on the screen.
 */
export function writingModeSwitch(
  view: EditorView,
  next: Extension,
): { effects: StateEffect<unknown>[]; selection?: EditorSelection } {
  const tidy = view.composing ? null : tidiedSpeech(view.state);
  if (tidy) view.dispatch(tidy);
  const selection = next === CLASSIC_OFF ? null : selectionClear(view.state);
  return {
    effects: [writingMode.reconfigure(next), view.scrollSnapshot()],
    ...(selection ? { selection } : null),
  };
}

/**
 * Puts the settings that live in the editor's compartments into the editor: spellcheck (the
 * spelling marks), line numbers, typewriter scrolling, and the writing mode, and a new lint for
 * Strict Fountain (the lint reads the option on each run). `load` gives the editor a fresh state
 * with every compartment at its first value, so this runs after each one as well as after each
 * change. `kind` is the document's: a Markdown one gets no Classic Mode.
 */
export function applyEditorSettings(
  view: EditorView,
  settings: Settings,
  kind: DocumentKind,
): void {
  // Only a compartment whose value changed is reconfigured: the others keep what they hold (the
  // typewriter plugin, in particular, keeps the room it made above and below the text).
  const effects: StateEffect<unknown>[] = [];
  const set = (compartment: Compartment, next: Extension) => {
    if (compartment.get(view.state) !== next) effects.push(compartment.reconfigure(next));
  };
  const mode = writingModeExtension(settings.writingMode, kind);
  const parts = writingMode.get(view.state) === mode ? null : writingModeSwitch(view, mode);
  set(spellcheck, spellcheckExtension(settings.spellcheck));
  set(lineNumbersGutter, lineNumbersExtension(settings.lineNumbers));
  set(typewriter, typewriterExtension(settings.typewriter));
  if (parts) effects.push(...parts.effects);
  if (effects.length > 0) view.dispatch({ ...parts, effects });
  relint();
}
