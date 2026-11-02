import { desktop } from '../desktop';
import { applyTextChanges } from '../editor/apply-changes';
import { useEditor } from '../editor/session';
import { markSpeech, speechAt } from './quote-marks';

/**
 * The desktop app's right-click Use in story map and Never use in story map (story-map design
 * §3.1, Call 6): the page answers which speech is under a click, from the editor (a Fountain script
 * this tab can edit), and marks it when the item is chosen, as one undo. The web editor has no
 * right-click menu of its own, so on the web the two are in the palette and the dialog. Does
 * nothing in a browser. Returns the function that stops it.
 */
export function installSpeechMenu(): () => void {
  const bridge = desktop()?.editor;
  if (!bridge) return () => {};
  const editor = useEditor();
  const editable = () => editor.kind.value === 'fountain' && !editor.view.state.readOnly;
  const stopAsking = bridge.onSpeechAt((x, y) => {
    if (!editable()) return null;
    const at = editor.view.posAtCoords({ x, y });
    return at !== null && speechAt(editor.doc.value, at) !== null ? at : null;
  });
  const stopMarking = bridge.onMarkSpeech((at, mark) => {
    if (!editable()) return;
    const cue = speechAt(editor.doc.value, at);
    if (cue === null) return;
    const changes = markSpeech(editor.doc.value, cue, mark);
    if (changes.length > 0) applyTextChanges(editor.view, changes);
  });
  return () => {
    stopAsking();
    stopMarking();
  };
}
