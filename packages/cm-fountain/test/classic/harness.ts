import type { EditorState, Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import {
  elementStructure,
  elementTemplate,
  fountainInput,
  fountainKeymap,
  parsedDoc,
  structureOf,
} from '@drafter/cm-fountain';
import { builtins, type Template } from '@drafter/templates';
import { classic } from '../../src/classic';
import { editor, type } from '../helpers';

export { editor, press, render, run, type } from '../helpers';

const SCREENPLAY = builtins['us-screenplay'] as Template;

/** The editor's state with Classic Mode on, a screenplay's unless a template is given. `|` marks as `editor` does. */
export function classicEditor(
  marked: string,
  { template = SCREENPLAY }: { template?: Template } = {},
): EditorState {
  const extensions: Extension[] = [
    parsedDoc,
    fountainInput(),
    elementStructure.of(() => structureOf(template)),
    elementTemplate.of(() => template),
    classic(),
  ];
  return editor(marked, extensions);
}

/** The bindings of a state, those it has first, then Fountain's, in the order a key tries them. */
const bindingsOf = (state: EditorState) => [...state.facet(keymap).flat(), ...fountainKeymap];

/** The state after a key: each binding runs until one takes it, as it does in the editor. */
function pressKey(state: EditorState, key: string): EditorState {
  const view = new EditorView({ state });
  try {
    for (const binding of bindingsOf(state)) {
      if (binding.key === key && binding.run?.(view)) break;
    }
    return view.state;
  } finally {
    view.destroy();
  }
}

/** Each step in turn: a key that is bound (`Enter`, `Tab`) is pressed, and any other text is typed. */
export function keys(state: EditorState, ...steps: string[]): EditorState {
  let next = state;
  for (const step of steps) {
    const bound = bindingsOf(next).some((binding) => binding.key === step);
    next = bound ? pressKey(next, step) : type(next, step);
  }
  return next;
}
