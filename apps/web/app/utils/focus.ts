// Focus mode's Escape (Phase 1 design §7.1): Escape leaves focus mode only when nothing else
// wanted it. CodeMirror closes its completion list and its search panel on Escape and marks the
// event handled; the command palette, menus, and dialogs close on it, too.

/** What Escape belongs to when it comes from inside one of these. */
const OWNERS = 'dialog, [role="dialog"], [role="alertdialog"], [role="menu"], [popover]';

/**
 * Whether this `keydown`, seen after the page has had its turn (a listener on the window, not in
 * the capture phase), means "leave focus mode": a plain Escape that no one used (CodeMirror
 * prevents the default of a key it handled), not typed into an input method, and not from or
 * over a dialog, a menu, or the palette.
 */
export function leavesOnEscape(event: KeyboardEvent): boolean {
  if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return false;
  // Safari ends an input method's composition before it sends the key, so `isComposing` is already
  // false; the key code 229 still says the key belonged to it.
  if (event.keyCode === 229) return false;
  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return false;
  if (event.target instanceof Element && event.target.closest(OWNERS)) return false;
  // A modal dialog that is open is the page's one question, whatever has focus. One that is open
  // without being modal (`<dialog open>`, `show()`) is not.
  return !modalOpen();
}

function modalOpen(): boolean {
  for (const dialog of document.querySelectorAll('dialog[open]')) {
    try {
      if (dialog.matches(':modal')) return true;
    } catch {
      // A browser that doesn't know `:modal` can't say: it counts as modal, as every dialog did.
      return true;
    }
  }
  // The palette and other dialogs of the page's own are not native elements.
  return !!document.querySelector('[role="dialog"], [role="alertdialog"]');
}

/**
 * Whether a keydown is a Backspace that would do nothing where it was pressed but take the page
 * back (WebKit's Backspace goes back a page outside a text field): not in an input, a text area,
 * or editable content, and with no modifier.
 */
export function backspaceGoesBack(event: KeyboardEvent): boolean {
  if (event.key !== 'Backspace' || event.ctrlKey || event.metaKey || event.altKey) return false;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return true;
  return !target.closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
  );
}

/**
 * Lets go of the editor's selection in the page when focus goes to `target`, somewhere other than
 * the editor (decided 2026-10-29). Safari types into a contenteditable that holds the page's
 * selection even when focus is elsewhere, so keys pressed in the Outline, Cards, Notes, Problems,
 * or Compare tab would change the script. CodeMirror keeps its own selection and puts it back in
 * the page when the editor has focus again, so the cursor is where it was.
 */
export function releaseEditorSelection(target: EventTarget | null, content: Element): void {
  if (target instanceof Node && content.contains(target)) return;
  const selection = target instanceof Node ? target.ownerDocument?.getSelection() : null;
  const anchor = selection?.anchorNode;
  if (selection && anchor && content.contains(anchor)) selection.removeAllRanges();
}
