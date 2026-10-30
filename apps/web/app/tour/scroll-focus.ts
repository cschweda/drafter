// The intro card's text scrolls when it is taller than the module's 60vh limit (a short window, or a
// long card). A region that scrolls must be reachable by keyboard (WCAG 2.1.1; axe's
// `scrollable-region-focusable`), and the module doesn't make it so: this gives it a tab stop
// while it scrolls, and takes it away when it fits.

/** Gives `el` a tab stop exactly when its content overflows it. */
export function syncScrollFocus(el: HTMLElement): void {
  if (el.scrollHeight > el.clientHeight) el.tabIndex = 0;
  else el.removeAttribute('tabindex');
}

/** Keeps `el`'s tab stop in step with its size and content until the returned function is called. */
export function watchScrollFocus(el: HTMLElement): () => void {
  syncScrollFocus(el);
  if (typeof ResizeObserver === 'undefined') return () => {};
  const observer = new ResizeObserver(() => syncScrollFocus(el));
  observer.observe(el);
  // The content changes size as the slides change; the region's own box may not.
  for (const child of Array.from(el.children)) observer.observe(child);
  return () => observer.disconnect();
}
