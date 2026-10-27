import { startCompletion } from '@codemirror/autocomplete';
import { type Extension, Prec, type StateCommand } from '@codemirror/state';
import { type Command, type EditorView, keymap } from '@codemirror/view';
import type { LintOptions } from '@drafter/lint';
import type { Template } from '@drafter/templates';
import { fountainKeymap } from './bindings';
import { fountainCompletion } from './complete';
import { type CursorElement, onCursorElement } from './cursor';
import { elementHint, elementStructure, structureOf, withCompletion } from './elements';
import { fountainFolding } from './fold';
import { fountainHighlighting } from './highlight';
import { fountainInput, startCue } from './input';
import { FORCED_KINDS, fountainTab } from './keymap';
import { fountainLint } from './lint';
import { parsedDoc } from './state';

export interface FountainOptions {
  /** The template the lint rules read. Without one, there is no lint. */
  template?: () => Template;
  lintOptions?: () => LintOptions;
  /** Called when the element under the cursor changes. */
  onCursorElement?: (element: CursorElement | null) => void;
  /** Told why an element key (Mod-Alt-1…7) did nothing, in a sentence, so the app can say so. */
  onHint?: (message: string) => void;
}

/**
 * Tab, and when it starts a cue, the list of names. Tab on a blank line puts in an `@` and
 * nothing else, which is too little for the completion to open on its own, and Phase 1 design
 * §5.3 has the names come up after Tab on a blank line.
 */
const tab: Command = (view) => {
  let startedCue = false;
  const handled = fountainTab({
    state: view.state,
    dispatch(transaction) {
      startedCue ||= transaction.effects.some((effect) => effect.is(startCue));
      view.dispatch(transaction);
    },
  });
  if (startedCue) startCompletion(view);
  return handled;
};

/**
 * Tab, and the element keys, which open the list after they begin a heading or a cue, and tell
 * `onHint` why they did nothing where they can't act, as the element bar's buttons do.
 */
function bindingsFor(onHint?: (message: string) => void) {
  return fountainKeymap.map((binding) => {
    if (binding.key === 'Tab') return { ...binding, run: tab };
    const match = /^Mod-Alt-([1-7])$/.exec(binding.key ?? '');
    if (!match || !binding.run) return binding;
    const kind = FORCED_KINDS[Number(match[1]) - 1];
    const run = withCompletion(binding.run as unknown as StateCommand);
    return {
      ...binding,
      run: (view: EditorView) => {
        const hint = kind ? elementHint(kind, view.state) : null;
        if (hint && !view.state.readOnly) onHint?.(hint);
        return run(view);
      },
    };
  });
}

/**
 * The whole editor extension for Fountain: the parse, highlighting, the input filters, the keymap
 * (at `Prec.high`, so it comes before the default keys), completion, and folding. With a
 * `template` it adds lint, and with `onCursorElement` the callback for the element under the
 * cursor. The app adds the rest of the editor around it: history, search, the theme, and so on.
 */
export function fountain(options: FountainOptions = {}): Extension {
  const { template, lintOptions } = options;
  return [
    parsedDoc,
    fountainHighlighting(),
    fountainInput(),
    Prec.high(keymap.of(bindingsFor(options.onHint))),
    template ? elementStructure.of(() => structureOf(template())) : [],
    fountainCompletion(),
    fountainFolding(),
    template ? fountainLint({ template, options: lintOptions }) : [],
    options.onCursorElement ? onCursorElement(options.onCursorElement) : [],
  ];
}
