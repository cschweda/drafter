import { completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { foldGutter, foldKeymap } from '@codemirror/language';
import { lintKeymap } from '@codemirror/lint';
import { search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { drawSelection, EditorView, keymap, ViewPlugin } from '@codemirror/view';
import { type CursorElement, fountain, relint as relintView } from '@drafter/cm-fountain';
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

/**
 * Read-only, for a script that another tab is editing. `readOnlyExtension(true)` stops the keymap's
 * commands and the text's `contenteditable`, so nothing can be typed, pasted, or dropped in.
 */
export const readOnly = new Compartment();

export function readOnlyExtension(on: boolean): Extension {
  return [EditorState.readOnly.of(on), EditorView.editable.of(!on)];
}

/**
 * What Mod-s and Mod-Shift-s do. `storage/save.ts` fills them in (it can't be imported here:
 * it reaches the editor session, which reaches this file), and the window's own listener in the
 * capture phase usually gets there first. Plan 4's command registry takes over both.
 */
export const fileKeys: { save: () => void; saveAs: () => void } = {
  save: () => {},
  saveAs: () => {},
};

let active: EditorView | undefined;

/**
 * Remembers the view the extensions are in, for `relint`. The one editor lives for the visit, and
 * `setState` (a project opened) makes this plugin again on the same view, so it never lets go.
 */
const remember = ViewPlugin.define((view) => {
  active = view;
  return {};
});

/**
 * Lints again now, through cm-fountain's `relint` (a bare `forceLinting` doesn't re-run its
 * source). `fountain()` reads the template and the lint options on each run, so the settings and a
 * template change call this to have the new ones read.
 */
export function relint(): void {
  if (active) relintView(active);
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
    // A dropped file is the page's to open (`DropZone.vue`), not CodeMirror's to paste in: its own
    // drop handler reads a file's text into the script at the pointer. Returning true stops that
    // handler (and its default), and the event goes on to the window. Dragged text still drops in.
    EditorView.domEventHandlers({
      drop: (event) => Array.from(event.dataTransfer?.types ?? []).includes('Files'),
    }),
    keymap.of([
      {
        key: 'Mod-s',
        run: () => {
          fileKeys.save();
          return true;
        },
        preventDefault: true,
      },
      {
        key: 'Mod-Shift-s',
        run: () => {
          fileKeys.saveAs();
          return true;
        },
        preventDefault: true,
      },
    ]),
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
    readOnly.of(readOnlyExtension(false)),
    theme,
  ];
}
