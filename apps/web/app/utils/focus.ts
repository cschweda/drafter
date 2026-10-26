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
  if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return false;
  if (event.target instanceof Element && event.target.closest(OWNERS)) return false;
  // A modal dialog that is open is the page's one question, whatever has focus.
  return !document.querySelector('dialog[open], [role="dialog"], [role="alertdialog"]');
}
