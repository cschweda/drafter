import { EditorView } from '@codemirror/view';

// The Source pane's look (Phase 1 design §5.2). Every color is a design token
// (assets/css/tokens.css), so the theme switch needs no new editor state.
//
// CodeMirror's own rules for the selection and the completion list name the
// light or the dark variant, so these repeat their selectors to match their
// weight; a theme's rules come after the base theme's, and so win.
export const theme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--text)',
    backgroundColor: 'var(--bg)',
    fontFamily: 'var(--font-mono)',
    // The text size setting scales the Source pane through --text-scale (settings/apply.ts).
    fontSize: 'calc(13.5px * var(--text-scale, 1))',
  },
  // The focus ring goes around the whole editor, gutters too, inside the pane's edge.
  // `:focus-within` is there because CodeMirror adds `cm-focused` a moment after focus lands.
  '&.cm-focused, &:focus-within': { outline: '2px solid var(--heading)', outlineOffset: '-2px' },
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: 'calc(21px * var(--text-scale, 1))' },
  '.cm-content': { padding: '12px 0', caretColor: 'var(--text)' },
  '.cm-line': { padding: '0 16px 0 8px' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--text)' },
  '.cm-selectionBackground': { background: 'color-mix(in srgb, var(--cue) 18%, transparent)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    background: 'color-mix(in srgb, var(--cue) 30%, transparent)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--bg)',
    color: 'var(--gutter)',
    border: 'none',
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 16px' },

  // The highlighting classes of @drafter/cm-fountain.
  '.cm-f-scene_heading': { color: 'var(--heading)', fontWeight: '700' },
  '.cm-f-character': { color: 'var(--cue)', fontWeight: '700' },
  '.cm-f-transition': { color: 'var(--trans)', fontWeight: '700' },
  '.cm-f-note': { color: 'var(--note)', fontStyle: 'italic' },
  '.cm-f-section, .cm-f-title-key': { color: 'var(--title)' },
  '.cm-f-parenthetical, .cm-f-synopsis': { color: 'var(--paren)', fontStyle: 'italic' },
  '.cm-f-boneyard': { color: 'var(--faint)' },
  '.cm-f-b': { fontWeight: '700' },
  '.cm-f-i': { fontStyle: 'italic' },
  '.cm-f-u': { textDecoration: 'underline' },
  '.cm-f-marker': { color: 'var(--faint)' },

  // The highlighting classes of the Markdown mode (markdown/editor.ts).
  '.cm-md-heading': { color: 'var(--heading)', fontWeight: '700' },
  '.cm-md-b': { fontWeight: '700' },
  '.cm-md-i': { fontStyle: 'italic' },
  '.cm-md-code': { color: 'var(--cue)' },
  '.cm-md-quote': { color: 'var(--paren)', fontStyle: 'italic' },
  '.cm-md-marker': { color: 'var(--faint)' },
  '.cm-md-link': { color: 'var(--title)' },
  '.cm-md-url': { color: 'var(--faint)' },
  '.cm-md-footnote': { color: 'var(--paren)' },
  '.cm-md-html': { color: 'var(--note)' },

  // Folding, search, tooltips, and the completion list.
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--chrome-2)',
    color: 'var(--muted)',
    border: '1px solid var(--line)',
  },
  '.cm-panels': {
    backgroundColor: 'var(--chrome)',
    color: 'var(--text)',
    borderColor: 'var(--line)',
    fontFamily: 'var(--font-sans)',
  },
  '.cm-panels input, .cm-panels button, .cm-panels label': { fontFamily: 'inherit' },
  '.cm-panel.cm-search input.cm-textfield': {
    backgroundColor: 'var(--chrome-2)',
    color: 'var(--text)',
    border: '1px solid var(--line)',
  },
  '.cm-panel.cm-search button': {
    backgroundImage: 'none',
    backgroundColor: 'var(--chrome-2)',
    color: 'var(--text)',
    border: '1px solid var(--line)',
  },
  '.cm-panel.cm-search [name=close]': { color: 'var(--text)' },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--heading) 30%, transparent)' },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'color-mix(in srgb, var(--heading) 55%, transparent)',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--chrome-2)',
    color: 'var(--text)',
    border: '1px solid var(--line)',
    fontFamily: 'var(--font-sans)',
  },
  '.cm-tooltip-autocomplete ul': { fontFamily: 'var(--font-mono)' },
  '& .cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'var(--tab-on)',
    color: 'var(--text)',
  },
  '.cm-completionDetail': { color: 'var(--muted)' },
  '.cm-diagnostic': { borderLeftColor: 'var(--line)' },
});
