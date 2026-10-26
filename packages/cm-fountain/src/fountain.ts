import { startCompletion } from '@codemirror/autocomplete';
import { type Extension, Prec } from '@codemirror/state';
import { type Command, keymap } from '@codemirror/view';
import type { LintOptions } from '@drafter/lint';
import type { Template } from '@drafter/templates';
import { fountainCompletion } from './complete';
import { type CursorElement, onCursorElement } from './cursor';
import { fountainFolding } from './fold';
import { fountainHighlighting } from './highlight';
import { fountainInput, startCue } from './input';
import { fountainKeymap, fountainTab } from './keymap';
import { fountainLint } from './lint';
import { parsedDoc } from './state';

export interface FountainOptions {
  /** The template the lint rules read. Without one, there is no lint. */
  template?: () => Template;
  lintOptions?: () => LintOptions;
  /** Called when the element under the cursor changes. */
  onCursorElement?: (element: CursorElement | null) => void;
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

const bindings = fountainKeymap.map((binding) =>
  binding.key === 'Tab' ? { ...binding, run: tab } : binding,
);

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
    Prec.high(keymap.of(bindings)),
    fountainCompletion(),
    fountainFolding(),
    template ? fountainLint({ template, options: lintOptions }) : [],
    options.onCursorElement ? onCursorElement(options.onCursorElement) : [],
  ];
}
