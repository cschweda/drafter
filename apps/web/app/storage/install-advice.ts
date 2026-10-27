// What the storage warning says about installing Drafter as an app, which depends on the browser.
// The browser is found by what it can do, not by its name: a browser that can offer its own install
// prompt (`beforeinstallprompt`: Chrome, Edge, and the others built on Chromium) is told to use it;
// WebKit (Safari, and every browser on an iPhone or iPad) has no such prompt and has gesture events,
// which no other engine has; anything else gets the general advice. `navigator.standalone` is the
// iPhone and iPad's own flag, there whether or not the page is installed. No user-agent string is read.

export type InstallKind = 'chromium' | 'safari' | 'other';

/** The parts of `window` and `navigator` that `installKindOf` asks about; tests pass plain objects. */
type Features = object;

export function installKindOf(win: Features, nav: Features = {}): InstallKind {
  if ('onbeforeinstallprompt' in win || 'BeforeInstallPromptEvent' in win) return 'chromium';
  if ('GestureEvent' in win || 'standalone' in nav) return 'safari';
  return 'other';
}

const LEAD =
  'This browser may clear your recovery copy. Save the script to a file to keep it safe, or install Drafter as an app';

/** The warning's sentence for `kind`, from "This browser may clear your recovery copy" on. */
export function installAdvice(kind: InstallKind): string {
  if (kind === 'chromium') {
    return `${LEAD}: use Install in the address bar (or the browser menu’s Install Drafter).`;
  }
  if (kind === 'safari') {
    return `${LEAD}: in Safari, choose File → Add to Dock on a Mac, or Share → Add to Home Screen on an iPhone or iPad.`;
  }
  return `${LEAD}, if your browser offers that.`;
}

/** The advice for the browser running this page. */
export function installAdviceHere(): string {
  return installAdvice(installKindOf(window, navigator));
}
