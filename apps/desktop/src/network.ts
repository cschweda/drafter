// A backstop for the rule that the desktop app makes one request of its own, the update check
// (Plan 6's Global Constraints): the page's CSP (`connect-src 'self'`) already keeps it to
// app://drafter/, and this cancels any web or socket request a page makes anyway. The main
// process's own requests (the update check, Task 6) come from no page and are left alone; so is
// app://, which never leaves the app.
import type { Session } from 'electron';

const REFUSED = new Set(['http:', 'https:', 'ws:', 'wss:']);

/** Whether a request is refused: one over the network that a page (a webContents) made. */
export function refusesRequest(details: { url: string; webContentsId?: number }): boolean {
  if (details.webContentsId === undefined) return false;
  try {
    return REFUSED.has(new URL(details.url).protocol);
  } catch {
    return true;
  }
}

export function refuseNetwork(session: Session): void {
  session.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (details, callback) => callback({ cancel: refusesRequest(details) }),
  );
}
