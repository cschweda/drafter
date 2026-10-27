// What the page may ask the browser for (Plan 6, Ruling D6): deny by default. Electron grants a
// permission request unless the app says otherwise, so the default session gets handlers that
// allow only what Drafter uses, and only to the app's own pages:
//   - `persistent-storage`: `navigator.storage.persist()` (storage/health.ts), for the recovery copy.
// (Copy and paste in the editor are the browser's own, which need no permission; nothing calls
// `navigator.clipboard`, so that permission is not given.)
// Everything else (the camera and microphone, location, notifications, MIDI, devices, the screen,
// full screen, the File System Access pickers) is refused, and a device picker is cancelled before
// it is shown. drafter.dev's Permissions-Policy header, sent on app:// too, refuses the camera,
// microphone, location, payment, and USB before they get here.
import type { Session } from 'electron';
import { navigationFor } from './protocol';

export const ALLOWED_PERMISSIONS: ReadonlySet<string> = new Set(['persistent-storage']);

/** Whether `permission` may be had by the page at `url` (a URL or an origin). */
export function allowsPermission(permission: string, url: string | undefined): boolean {
  return ALLOWED_PERMISSIONS.has(permission) && navigationFor(url ?? '') === 'app';
}

/** Puts the rules on `session`: requests, checks, devices, and screen capture. */
export function denyPermissions(session: Session): void {
  session.setPermissionRequestHandler((_contents, permission, callback, details) => {
    callback(allowsPermission(permission, details.requestingUrl));
  });
  session.setPermissionCheckHandler((_contents, permission, origin, details) =>
    allowsPermission(permission, details.requestingUrl ?? origin),
  );
  session.setDevicePermissionHandler(() => false);
  session.setDisplayMediaRequestHandler((_request, callback) => callback(null));
  session.on('select-hid-device', (event, _details, callback) => {
    event.preventDefault();
    callback();
  });
  session.on('select-usb-device', (event, _details, callback) => {
    event.preventDefault();
    callback();
  });
  session.on('select-serial-port', (event, _ports, _contents, callback) => {
    event.preventDefault();
    callback('');
  });
}
