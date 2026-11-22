import { EditorView } from '@codemirror/view';

// The cursor stays where the writer left it when focus comes back to the editor.
//
// A browser that gives an editable element focus while no selection is inside it puts the caret at
// the element's start. CodeMirror knows this and puts the caret back where its own cursor is, but
// only when it hears of the browser's caret within 200 ms of the focus (`readSelectionRange` in
// @codemirror/view). When the page is busy for longer than that just then, it takes the caret at
// the start for the writer's, and the next thing typed goes in at the top of the script. Focus
// comes back that way whenever the palette or a dialog closes, and a long script laid out again
// is busy for longer than 200 ms.
//
// So the caret is put back here, in the focus event itself, before the browser has said anything:
// by the time CodeMirror hears of the caret, however late, it is where the cursor is. A click or a
// tap still puts the cursor where it lands: the browser places that caret after the focus.
//
// Only a cursor in the lines CodeMirror has drawn can be put back this way. One scrolled far out
// of view is left to CodeMirror, as before.
export const keepCursorOnFocus = EditorView.domEventHandlers({
  focus(_event, view) {
    const { anchor, head } = view.state.selection.main;
    const { from, to } = view.viewport;
    if (Math.min(anchor, head) < from || Math.max(anchor, head) > to) return false;
    const selection = view.dom.ownerDocument.getSelection();
    if (!selection) return false;
    try {
      const start = view.domAtPos(anchor);
      const end = view.domAtPos(head);
      selection.setBaseAndExtent(start.node, start.offset, end.node, end.offset);
    } catch {
      // A place the page can't name just now: CodeMirror's own correction is what is left.
    }
    return false;
  },
});
