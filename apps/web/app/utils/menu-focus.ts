// Giving focus back after a menu has closed happens a moment later (a timer, or the next frame),
// and by then the writer may have put focus somewhere else: clicked another button, opened another
// menu. Taking it back then closes that menu under their pointer, which a slow machine made happen
// (and made the browser tests fail now and then). So whatever gives focus back asks this first.

/**
 * Whether focus is still where the closed menu left it: nowhere (the page's body), or on `opener`,
 * with no menu open now. False once another control has focus or another menu is showing.
 */
export function focusIsFree(opener?: Element | null): boolean {
  if (document.querySelector('[data-reka-menu-content]')) return false;
  const active = document.activeElement;
  return !active || active === document.body || active === opener;
}
