// The tour's announcements to screen readers. `nuxt-guided-tour` makes a polite live region itself
// when it isn't given a function; this is the same region (its id, `role="status"`) so that one
// message can say what Drafter does: the module's "Tour cancelled" points at a Tour button, and
// Drafter's way back is the Help section of its menu.
const REGION = 'nuxt-guided-tour-announcer';

/** The message as Drafter says it. */
export function tourMessage(message: string): string {
  return message.startsWith('Tour cancelled')
    ? 'Tour closed. You can take it again from Help, in the Drafter menu.'
    : message;
}

function region(): HTMLElement {
  const found = document.getElementById(REGION);
  if (found) return found;
  const el = document.createElement('div');
  el.id = REGION;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-atomic', 'true');
  // Visually hidden, as the module's own is.
  Object.assign(el.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: '0',
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: '0',
  });
  document.body.append(el);
  return el;
}

export function announceTour(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
  if (typeof document === 'undefined') return;
  const el = region();
  el.setAttribute('aria-live', priority);
  // Cleared first, so the same words said twice are still heard.
  el.textContent = '';
  requestAnimationFrame(() => {
    el.textContent = tourMessage(message);
  });
}
