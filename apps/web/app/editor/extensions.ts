import { completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { foldGutter, foldKeymap } from '@codemirror/language';
import { forceLinting, lintKeymap } from '@codemirror/lint';
import { search, searchKeymap } from '@codemirror/search';
import { Compartment, type Extension } from '@codemirror/state';
import { drawSelection, EditorView, keymap, ViewPlugin } from '@codemirror/view';
import { type CursorElement, fountain } from '@drafter/cm-fountain';
import type { Template } from '@drafter/templates';
import { theme } from './theme';

/**
 * The browser's spellcheck in the Source pane (Phase 1 design §5.3): on to start with, and a
 * setting turns it off. Phase 2's nspell replaces it.
 */
export const spellcheck = new Compartment();

/** `spellcheck.reconfigure(spellcheckAttribute(on))` switches it. */
export function spellcheckAttribute(on: boolean): Extension {
  return EditorView.contentAttributes.of({ spellcheck: on ? 'true' : 'false' });
}

/**
 * The line numbers, which Plan 4's setting turns on with `lineNumbers()`. It starts empty, and it
 * comes before every other gutter, so the numbers sit at the far left of the source.
 */
export const lineNumbersGutter = new Compartment();

let active: EditorView | undefined;

/** Remembers the view the extensions are in, for `relint`. */
const remember = ViewPlugin.define((view) => {
  active = view;
  return {
    destroy() {
      if (active === view) active = undefined;
    },
  };
});

/**
 * Lints again now. `fountain()` reads the template and the lint options on each run, so the
 * settings and a template change call this to have the new ones read.
 */
export function relint(): void {
  if (active) forceLinting(active);
}

export interface EditorHooks {
  template: () => Template;
  onCursorElement: (element: CursorElement | null) => void;
}

/** Everything the one editor is made of, around `fountain()` (technical design §3). */
export function editorExtensions({ template, onCursorElement }: EditorHooks): Extension {
  return [
    remember,
    lineNumbersGutter.of([]),
    fountain({ template, onCursorElement }),
    history(),
    drawSelection(),
    foldGutter(),
    search(),
    EditorView.lineWrapping,
    // Below fountain()'s own keys, which sit at Prec.high.
    keymap.of([
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...lintKeymap,
      ...completionKeymap,
      ...defaultKeymap,
    ]),
    // The explicit tabindex is for axe, which doesn't count a contenteditable as focusable
    // content of the scroller (`scrollable-region-focusable`); the text is a tab stop anyway.
    EditorView.contentAttributes.of({ 'aria-label': 'Source', tabindex: '0' }),
    spellcheck.of(spellcheckAttribute(true)),
    theme,
  ];
}
