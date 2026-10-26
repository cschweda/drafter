import { completionKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, redo } from '@codemirror/commands';
import { foldGutter, foldKeymap } from '@codemirror/language';
import { lintKeymap, previousDiagnostic } from '@codemirror/lint';
import { search, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { drawSelection, EditorView, keymap, lineNumbers, ViewPlugin } from '@codemirror/view';
import {
  type CursorElement,
  fountain,
  parsedDoc,
  relint as relintView,
} from '@drafter/cm-fountain';
import type { Template } from '@drafter/templates';
import { markdownMode } from '../markdown/editor';
import type { DocumentKind } from '../markdown/kind';
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
 * What the Source pane knows about the kind of document: `fountain()` for a screenplay or a stage
 * play, `markdownMode()` for a Markdown one. In Markdown, Fountain's keys, completion, folding,
 * highlighting, and lint are all off, because they are all in `fountain()`.
 */
export const language = new Compartment();

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

/** `lineNumbersGutter.reconfigure(lineNumbersExtension(on))` shows or hides the numbers. */
export function lineNumbersExtension(on: boolean): Extension {
  return on ? lineNumbers() : [];
}

export interface EditorHooks {
  template: () => Template;
  /** Read at each lint; the Strict Fountain setting is in it. */
  lintOptions?: () => { strict?: boolean };
  onCursorElement: (element: CursorElement | null) => void;
}

/** The language extension for a kind of document: `language.reconfigure(languageExtension(…))` switches it. */
export function languageExtension(
  { template, lintOptions, onCursorElement }: EditorHooks,
  kind: DocumentKind,
): Extension {
  return kind === 'markdown'
    ? markdownMode()
    : fountain({ template, lintOptions, onCursorElement });
}

/**
 * Everything the one editor is made of, around `fountain()` (technical design §3) or, for a
 * Markdown document, `markdownMode()`. The parse of the text as Fountain (`parsedDoc`) is kept in
 * both: the session and the layout read it, and it is cheap, so a switch of kind is one
 * reconfigure of the language and nothing else.
 */
export function editorExtensions(hooks: EditorHooks, kind: DocumentKind = 'fountain'): Extension {
  return [
    remember,
    lineNumbersGutter.of([]),
    parsedDoc,
    language.of(languageExtension(hooks, kind)),
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
    // Save, Save As, Open, and New are the page's: the command registry binds their keys on the
    // window, before the editor sees them. These two commands' keys are the editor's own.
    keymap.of([
      { key: 'Shift-F8', run: previousDiagnostic },
      { key: 'Mod-Shift-z', run: redo, preventDefault: true },
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
