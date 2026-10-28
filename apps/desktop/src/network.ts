// A backstop for the rule that the desktop app makes one request of its own, the update check
// (Plan 6's Global Constraints): the page's CSP (`connect-src 'self'`) already keeps it to
// app://drafter/, and this cancels any web or socket request a page makes anyway. The main
// process's own requests (the update check, Task 6) come from no page and are left alone; so is
// app://, which never leaves the app.
//
// The one exception is a folder module's frame (module-folder.ts) asking for an origin the writer
// agreed to when they turned it on: it passes only from that module's own frame, and only to an
// origin its module.json declares (main.ts keeps the agreed origins, `grants`).
import type { Session } from 'electron';
import { moduleIdOf } from './module-folder';

const REFUSED = new Set(['http:', 'https:', 'ws:', 'wss:']);

/** The origins the writer agreed to for a module (none for a module that is off, or unknown). */
export type ModuleGrants = (moduleId: string) => readonly string[];

const none: ModuleGrants = () => [];

/**
 * Whether a request is refused: one over the network that a page (a webContents) made, unless it
 * came from a module's frame (`frameUrl` on drafter-module://<id>/) to an origin granted to it.
 */
export function refusesRequest(
  details: { url: string; webContentsId?: number; frameUrl?: string },
  grants: ModuleGrants = none,
): boolean {
  if (details.webContentsId === undefined) return false;
  let url: URL;
  try {
    url = new URL(details.url);
  } catch {
    return true;
  }
  if (!REFUSED.has(url.protocol)) return false;
  const id = details.frameUrl ? moduleIdOf(details.frameUrl) : null;
  return !(id && grants(id).includes(url.origin));
}

/** The URL of the frame a request came from, or undefined (none, or one that is gone). */
function frameUrlOf(details: { frame?: { url: string } | null }): string | undefined {
  try {
    return details.frame?.url;
  } catch {
    return undefined;
  }
}

export function refuseNetwork(session: Session, grants: ModuleGrants = none): void {
  session.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (details, callback) =>
      callback({ cancel: refusesRequest({ ...details, frameUrl: frameUrlOf(details) }, grants) }),
  );
}
