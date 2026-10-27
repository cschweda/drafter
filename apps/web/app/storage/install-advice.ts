// What the storage warning says about installing Drafter as an app, which depends on the browser.
// The browser is found by what it can do, not by its name: a browser that can offer its own install
// prompt (`beforeinstallprompt`: Chrome, Edge, and the others built on Chromium) is told to use it;
// WebKit (Safari, and every browser on an iPhone or iPad) has no such prompt and has gesture events,
// which no other engine has; anything else gets the general advice. `navigator.standalone` is the
// iPhone and iPad's own flag, `true` only in an installed home-screen app. A page that is already an
// installed app (`display-mode: standalone`, or that flag) is told nothing about installing. WebKit
// cannot be told apart from Chrome on an iPhone or iPad, so the advice names Safari only for the Mac's
// Dock. No user-agent string is read.

export type InstallKind = 'installed' | 'chromium' | 'safari' | 'other';

/** The parts of `window` and `navigator` that `installKindOf` asks about; tests pass plain objects. */
type Features = object;

/** Whether the page is running as an installed app: a standalone window, or an iPhone's home-screen app. */
function isInstalled(win: Features, nav: Features): boolean {
  try {
    const query = (win as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia;
    if (query?.call(win, '(display-mode: standalone)').matches) return true;
  } catch {
    // No media query to ask: it is a tab.
  }
  return (nav as { standalone?: boolean }).standalone === true;
}

export function installKindOf(win: Features, nav: Features = {}): InstallKind {
  if (isInstalled(win, nav)) return 'installed';
  if ('onbeforeinstallprompt' in win || 'BeforeInstallPromptEvent' in win) return 'chromium';
  if ('GestureEvent' in win || 'standalone' in nav) return 'safari';
  return 'other';
}

const LEAD_INSTALLED =
  'This browser may clear your recovery copy. Save the script to a file to keep it safe.';
const LEAD =
  'This browser may clear your recovery copy. Save the script to a file to keep it safe, or install Drafter as an app';

/** The warning's sentence for `kind`, from "This browser may clear your recovery copy" on. */
export function installAdvice(kind: InstallKind): string {
  if (kind === 'installed') return LEAD_INSTALLED;
  if (kind === 'chromium') {
    return `${LEAD}: use Install in the address bar (or the browser menu’s Install Drafter).`;
  }
  if (kind === 'safari') {
    return `${LEAD}: on a Mac, in Safari, choose File → Add to Dock; on an iPhone or iPad, choose Share → Add to Home Screen.`;
  }
  return `${LEAD}, if your browser offers that.`;
}

/** The advice for the browser running this page. */
export function installAdviceHere(): string {
  return installAdvice(installKindOf(window, navigator));
}
