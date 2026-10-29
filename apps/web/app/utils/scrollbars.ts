// Scrollbars that float over the content (macOS's default, and iOS) take no room of their own: a
// row that scrolls sideways has its scrollbar drawn over the lower part of its buttons while it
// shows. Safari hit-tests that scrollbar, so a click on the lower half of a button just after the
// row scrolled lands on the row, not the button, and does nothing. Classic scrollbars (Windows,
// Linux) take room below the row and never cover it.

/** Whether this browser's scrollbars float over the content instead of taking room. */
export function scrollbarsFloat(): boolean {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;top:-9999px;left:-9999px;width:100px;height:100px;overflow:scroll';
  document.body.append(probe);
  const float = probe.offsetHeight === probe.clientHeight;
  probe.remove();
  return float;
}
