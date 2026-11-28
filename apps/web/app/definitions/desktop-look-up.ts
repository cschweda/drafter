import { desktop } from '../desktop';
import { useEditor } from '../editor/session';
import { useDefinitions } from './use-definitions';
import { wordToLookUp } from './word';

/**
 * The desktop app's right-click Look up (definitions design §7.5): the page answers which word is
 * under a click (the selection, when the click is in it, else the word there), and opens
 * Definitions on it when the item is chosen. Only a click in the editor's own text has a word.
 * Does nothing in a browser, or in a desktop app from before Definitions. Returns the function
 * that stops it.
 */
export function installDesktopLookUp(): () => void {
  const bridge = desktop()?.editor;
  if (!bridge?.onWordAt || !bridge.onLookUp) return () => {};
  const editor = useEditor();
  const definitions = useDefinitions();
  const stopAsking = bridge.onWordAt((x, y) => {
    const hit = document.elementFromPoint(x, y);
    if (!hit || !editor.view.contentDOM.contains(hit)) return null;
    const at = editor.view.posAtCoords({ x, y });
    return at === null ? null : wordToLookUp(editor.view.state, at);
  });
  const stopLooking = bridge.onLookUp((word) => definitions.open(word));
  return () => {
    stopAsking();
    stopLooking();
  };
}
