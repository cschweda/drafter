import { EditorView } from '@codemirror/view';

// The Source pane's look (Phase 1 design §5.2). Every color is a design token
// (assets/css/tokens.css), so the theme switch needs no new editor state.
//
// CodeMirror's own rules for the selection and the completion list name the
// light or the dark variant, so these repeat their selectors to match their
// weight; a theme's rules come after the base theme's, and so win.
//
// Classic Mode's rules (design §8.2) are all under `.cm-classic`, which only the mode puts on the
// editor, so none of them applies in Fountain Mode. Nothing there moves: no `transition` or
// `animation` property, in any motion setting.
const CLASSIC = '&.cm-classic';

/**
 * The line's own 8 px, then the template's indent, as a share of a pane too narrow to hold it. The
 * width is what padding leaves: lines are `border-box` under the app's reset, and a `max-width`
 * would take the padding out of the text and shorten the current line's tint (§8.2).
 */
const classicRole = (role: string, share: number) => {
  const left = `calc(8px + min(calc(var(--c-${role}-indent, 0) * 1ch), ${share}%))`;
  const width = `var(--c-${role}-width, 60) * 1ch`;
  return { paddingLeft: left, paddingRight: `max(16px, calc(100% - ${left} - ${width}))` };
};

const HEADING = { fontWeight: '700' };

/** Space above a scene, for the second blank line the page has and the text doesn't (§8.2). */
const SCENE_START = { paddingTop: 'calc(10px * var(--text-scale, 1))' };

export const theme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--text)',
    backgroundColor: 'var(--bg)',
    fontFamily: 'var(--font-mono)',
    // The text size setting scales the Source pane through --text-scale (settings/apply.ts).
    fontSize: 'calc(13.5px * var(--text-scale, 1))',
  },
  // No box around the editor (fresh-look design §8, Call 11). Focus shows as a 3 px bar in the
  // focus color at the left of the current line, there while the caret blinks off or a selection
  // hides it, and as the caret itself, 2 px in the same color. (CodeMirror's own theme draws a
  // dotted outline, and the global ring would draw one around the text; both go.)
  '&.cm-focused': { outline: 'none' },
  '.cm-content:focus-visible': { outline: 'none' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  // The current line (fresh-look design §3.2) is tinted faintly as well, while the editor has focus.
  '&.cm-focused .cm-activeLine': {
    boxShadow: 'inset 3px 0 0 var(--focus)',
    backgroundColor: 'var(--current-line)',
  },
  // The line a click on a note showed (reveal-line.ts), for a moment; no fade when the writer asks
  // for no motion, and an outline where colours are forced.
  '.cm-revealed': {
    boxShadow: 'inset 3px 0 0 var(--focus)',
    backgroundColor: 'var(--current-line)',
    animation: 'cm-revealed 1.6s ease-out',
  },
  '@keyframes cm-revealed': {
    from: { backgroundColor: 'color-mix(in srgb, var(--focus) 35%, transparent)' },
    to: { backgroundColor: 'var(--current-line)' },
  },
  '@media (prefers-reduced-motion: reduce)': { '.cm-revealed': { animation: 'none' } },
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: 'calc(21px * var(--text-scale, 1))' },
  '.cm-content': { padding: '12px 0', caretColor: 'var(--focus)' },
  '.cm-line': { padding: '0 16px 0 8px' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--focus)', borderLeftWidth: '2px' },
  '.cm-selectionBackground': { background: 'color-mix(in srgb, var(--cue) 18%, transparent)' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground': {
    background: 'color-mix(in srgb, var(--cue) 30%, transparent)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--bg)',
    color: 'var(--muted)',
    border: 'none',
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 16px' },

  // The highlighting classes of @drafter/cm-fountain.
  '.cm-f-scene_heading': { color: 'var(--accent-text)', fontWeight: '700' },
  '.cm-f-character': { color: 'var(--cue)', fontWeight: '700' },
  '.cm-f-transition': { color: 'var(--trans)', fontWeight: '700' },
  '.cm-f-note': { color: 'var(--note)', fontStyle: 'italic' },
  '.cm-f-section, .cm-f-title-key': { color: 'var(--title)' },
  '.cm-f-parenthetical, .cm-f-synopsis': { color: 'var(--muted)', fontStyle: 'italic' },
  // Boneyard is cut and never prints: struck through, as well as quiet, so it isn't told apart
  // by its color alone.
  '.cm-f-boneyard': {
    color: 'var(--muted)',
    textDecoration: 'line-through',
    textDecorationColor: 'color-mix(in srgb, var(--muted) 60%, transparent)',
  },
  '.cm-f-b': { fontWeight: '700' },
  '.cm-f-i': { fontStyle: 'italic' },
  '.cm-f-u': { textDecoration: 'underline' },
  '.cm-f-marker': { color: 'var(--muted)' },

  // The highlighting classes of the Markdown mode (markdown/editor.ts).
  '.cm-md-heading': { color: 'var(--accent-text)', fontWeight: '700' },
  '.cm-md-b': { fontWeight: '700' },
  '.cm-md-i': { fontStyle: 'italic' },
  '.cm-md-code': { color: 'var(--cue)' },
  '.cm-md-quote': { color: 'var(--muted)', fontStyle: 'italic' },
  '.cm-md-marker': { color: 'var(--muted)' },
  '.cm-md-link': { color: 'var(--title)' },
  '.cm-md-url': { color: 'var(--muted)' },
  '.cm-md-footnote': { color: 'var(--muted)' },
  '.cm-md-html': { color: 'var(--note)' },

  // Folding, search, tooltips, and the completion list.
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--raised)',
    color: 'var(--muted)',
    border: '1px solid var(--border)',
  },
  '.cm-panels': {
    backgroundColor: 'var(--surface)',
    color: 'var(--text)',
    borderColor: 'var(--border)',
    fontFamily: 'var(--font-sans)',
  },
  '.cm-panels input, .cm-panels button, .cm-panels label': { fontFamily: 'inherit' },
  '.cm-panel.cm-search input.cm-textfield': {
    backgroundColor: 'var(--raised)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
  },
  '.cm-panel.cm-search button': {
    backgroundImage: 'none',
    backgroundColor: 'var(--raised)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
  },
  '.cm-panel.cm-search [name=close]': { color: 'var(--text)' },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--accent-text) 30%, transparent)' },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'color-mix(in srgb, var(--accent-text) 55%, transparent)',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--raised)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    fontFamily: 'var(--font-sans)',
  },
  '.cm-tooltip-autocomplete ul': { fontFamily: 'var(--font-mono)' },
  '& .cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'var(--overlay)',
    color: 'var(--text)',
  },
  '.cm-completionDetail': { color: 'var(--muted)' },
  '.cm-diagnostic': { borderLeftColor: 'var(--border)' },

  // Classic Mode: no colour per element, and the weight and slant are the role's.
  [`${CLASSIC} .cm-f-scene_heading, ${CLASSIC} .cm-f-character, ${CLASSIC} .cm-f-transition`]: {
    color: 'var(--text)',
    fontWeight: 'inherit',
  },
  [`${CLASSIC} .cm-f-section`]: { color: 'var(--text)' },
  [`${CLASSIC} .cm-f-parenthetical`]: { color: 'var(--text)', fontStyle: 'inherit' },

  // A line with no role of its own (a note, a cut, a synopsis) keeps to the page's 60 characters.
  [`${CLASSIC} .cm-line`]: { paddingRight: 'max(16px, calc(100% - 8px - 60ch))' },

  // Each role, from the template's numbers. A narrow pane takes the share (§8.2).
  [`${CLASSIC} .cm-c-scene_heading`]: {
    ...classicRole('scene_heading', 0),
    ...HEADING,
    ...SCENE_START,
  },
  [`${CLASSIC} .cm-c-action`]: classicRole('action', 0),
  [`${CLASSIC} .cm-c-character`]: classicRole('character', 30),
  [`${CLASSIC} .cm-c-parenthetical`]: classicRole('parenthetical', 26),
  [`${CLASSIC} .cm-c-dialogue`]: classicRole('dialogue', 16),
  [`${CLASSIC} .cm-c-lyric`]: classicRole('lyric', 16),
  [`${CLASSIC} .cm-c-transition`]: classicRole('transition', 45),
  [`${CLASSIC} .cm-c-centered`]: classicRole('centered', 0),
  [`${CLASSIC} .cm-c-stage_direction`]: classicRole('stage_direction', 16),
  [`${CLASSIC} .cm-c-act_heading`]: {
    ...classicRole('act_heading', 0),
    ...HEADING,
    textTransform: 'uppercase',
  },
  [`${CLASSIC} .cm-c-scene_heading_play`]: { ...classicRole('scene_heading_play', 0), ...HEADING },

  [`${CLASSIC} .cm-c-page_break`]: classicRole('action', 0),

  // What a role's alignment and style ask for.
  [`${CLASSIC} .cm-c-center`]: { textAlign: 'center' },
  [`${CLASSIC} .cm-c-right`]: { textAlign: 'right' },
  [`${CLASSIC} .cm-c-italic`]: { fontStyle: 'italic' },
  [`${CLASSIC} .cm-c-bold`]: { fontWeight: '700' },
  [`${CLASSIC} .cm-c-underline`]: { textDecoration: 'underline' },

  // A section's depth is its size and weight; its mark is hidden.
  [`${CLASSIC} .cm-c-section`]: { fontWeight: '700' },
  [`${CLASSIC} .cm-c-depth-1`]: { fontSize: '1.25em' },
  [`${CLASSIC} .cm-c-depth-2`]: { fontSize: '1.125em' },

  // What stands for a hidden mark. The rule at each end shows where a note or a cut stops, and
  // keeps apart the two places a cursor can be at its end, which would look the same without it.
  [`${CLASSIC} .cm-c-note-rule, ${CLASSIC} .cm-c-boneyard-rule`]: {
    display: 'inline-block',
    height: '1em',
    margin: '0 3px',
    verticalAlign: '-0.15em',
    borderLeft: '2px solid var(--note)',
  },
  [`${CLASSIC} .cm-c-boneyard-rule`]: { borderLeftColor: 'var(--muted)' },
  [`${CLASSIC} .cm-c-page-break`]: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '1ch',
    width: '100%',
    color: 'var(--muted)',
    fontStyle: 'normal',
  },
  [`${CLASSIC} .cm-c-page-break::after`]: {
    content: '""',
    flex: '1',
    borderTop: '1px solid var(--muted)',
  },
  [`${CLASSIC} .cm-c-dual`]: {
    marginLeft: '0.5ch',
    padding: '0 0.5ch',
    border: '1px solid var(--muted)',
    borderRadius: '3px',
    color: 'var(--muted)',
    fontSize: '0.8em',
    fontWeight: '400',
  },
  '@media (forced-colors: active)': {
    '.cm-revealed': { outline: '2px solid Highlight' },
    // style-mod doesn't resolve `&` inside an at-rule, so these can't name `.cm-classic`. The
    // classes are only ever in Classic Mode's DOM.
    '.cm-content .cm-c-note-rule, .cm-content .cm-c-boneyard-rule': {
      borderLeftColor: 'CanvasText',
    },
    '.cm-content .cm-c-page-break::after': { borderTopColor: 'CanvasText' },
  },
});
