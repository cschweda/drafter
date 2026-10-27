import { desktop } from '~/desktop';

/**
 * A help page's "Back to Drafter" in the desktop app: the page is a window of its own, so Back
 * brings the editor's window forward and closes this one, rather than load a second editor into
 * it. Returns true when it did that (and the link must not be followed). In a browser, and for a
 * click the browser should handle itself (a new tab, a middle click), it does nothing and returns
 * false, so the plain link and the layout's own handling stand.
 */
export function backToEditor(event: MouseEvent): boolean {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return false;
  }
  const bridge = desktop();
  if (!bridge) return false;
  event.preventDefault();
  bridge.backToEditor();
  return true;
}
