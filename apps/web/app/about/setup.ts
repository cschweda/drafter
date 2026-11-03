// The technical details a bug report carries (Help → Copy technical details, About, and Report a
// problem…): About's version info, then the writer's setup, so the maintainer can see where a
// problem happens: the address the web app came from (in words, never the name of a server of
// one's own), the language, the screen, touch or mouse, whether it is installed, works offline,
// saves in place, and keeps its storage, and Drafter's own settings that change how it behaves.
// Nothing personal: no paths, no names, no script, its title, or a file name. `setupLines` and
// `technicalDetails` are pure (test/setup.test.ts); `currentSetup` reads the page.

import { type AboutInfo, versionText } from './info';

export interface SetupInput {
  /** The page's host name, for the web app; never shown, only put in words. */
  host?: string;
  /** `en-US`. */
  language?: string;
  screen?: { width: number; height: number };
  window?: { width: number; height: number };
  pixelRatio?: number;
  /** The main pointer is a finger (`pointer: coarse`). */
  touch?: boolean;
  /** Opened as an installed app (`display-mode: standalone`), for the web app. */
  installed?: boolean;
  /** A service worker controls the page, so it works offline, for the web app. */
  offline?: boolean;
  /** Save writes back to the file (Chromium's file pickers, or the desktop app). */
  saveInPlace?: boolean;
  /** The browser was asked to keep the storage and agreed; null when it can't say. */
  storageKept?: boolean | null;
  online?: boolean;
  theme?: 'dark' | 'light';
  /** 1.15 for 115%. */
  textSize?: number;
  reducedMotion?: boolean;
  writingMode?: 'fountain' | 'classic';
  /** The open document's kind, in words: its template's name, or `Markdown document`. */
  document?: string;
  spellcheck?: boolean;
}

/** Where the web app was loaded from, in words: never the name of a server of one's own. */
export function addressOf(host: string): string {
  if (host === 'drafter.dev' || host.endsWith('.drafter.dev')) return 'drafter.dev';
  if (/^(?:localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(host) || host.endsWith('.localhost'))
    return 'this computer (localhost)';
  if (host.endsWith('.netlify.app')) return 'a preview on Netlify';
  return 'another address (self-hosted)';
}

const yesNo = (value: boolean) => (value ? 'yes' : 'no');
const size = (box: { width: number; height: number }) =>
  `${Math.round(box.width)}×${Math.round(box.height)}`;

/** The setup's lines, each `Name: value`, for what is known; the web app's own lines only on the web. */
export function setupLines(app: AboutInfo['app'], setup: SetupInput): string[] {
  const web = app === 'web';
  const lines: string[] = [];
  const add = (name: string, value: string | undefined | false) => {
    if (value) lines.push(`${name}: ${value}`);
  };
  if (web && setup.host !== undefined) add('Address', addressOf(setup.host));
  add('Language', setup.language);
  if (setup.screen) {
    const extra = [
      setup.window && `window ${size(setup.window)}`,
      setup.pixelRatio && setup.pixelRatio !== 1 && `${+setup.pixelRatio.toFixed(2)}× pixels`,
    ].filter(Boolean);
    add('Screen', `${size(setup.screen)}${extra.length ? ` (${extra.join(', ')})` : ''}`);
  }
  if (setup.touch !== undefined) add('Input', setup.touch ? 'touch' : 'mouse or trackpad');
  if (web && setup.installed !== undefined) add('Installed as an app', yesNo(setup.installed));
  if (web && setup.offline !== undefined)
    add('Works offline', setup.offline ? 'yes' : 'not yet (no offline copy)');
  if (setup.saveInPlace !== undefined)
    add('Saves in place', setup.saveInPlace ? 'yes' : 'no (saves as downloads)');
  if (web && setup.storageKept !== undefined && setup.storageKept !== null)
    add('Storage', setup.storageKept ? 'kept' : 'the browser may clear it');
  if (setup.online !== undefined) add('Online', yesNo(setup.online));
  add('Document', setup.document);
  if (setup.writingMode)
    add('Writing mode', setup.writingMode === 'classic' ? 'Classic' : 'Fountain');
  if (setup.theme) {
    const text =
      setup.textSize && setup.textSize !== 1 ? `, text ${Math.round(setup.textSize * 100)}%` : '';
    add('Look', `${setup.theme}${text}${setup.reducedMotion ? ', reduced motion' : ''}`);
  }
  if (setup.spellcheck !== undefined) add('Spellcheck', setup.spellcheck ? 'on' : 'off');
  return lines;
}

/** The plain text Copy technical details copies: About's version info, then the setup. */
export function technicalDetails(info: AboutInfo, setup: SetupInput): string {
  return [versionText(info), ...setupLines(info.app, setup)].join('\n');
}

/** Whether a media query matches, where the page can ask. */
const matches = (query: string) =>
  typeof matchMedia === 'function' ? matchMedia(query).matches : undefined;

/** Whether the browser keeps the storage: asked once, in the background, as the answer is a promise. */
let storageKept: boolean | null = null;
let askedStorage = false;
function askStorage() {
  if (askedStorage) return;
  askedStorage = true;
  navigator.storage
    ?.persisted?.()
    .then((kept) => {
      storageKept = kept;
    })
    .catch(() => {});
}

/**
 * The setup as this page sees it; `known` is what the app's own state says. Synchronous, so a copy
 * stays inside the click that asked for it (Safari refuses the clipboard after an `await`).
 */
export function currentSetup(
  known: Pick<
    SetupInput,
    'saveInPlace' | 'theme' | 'textSize' | 'writingMode' | 'document' | 'spellcheck'
  >,
): SetupInput {
  if (typeof window === 'undefined') return { ...known };
  askStorage();
  return {
    host: location.hostname,
    language: navigator.language,
    screen: { width: screen.width, height: screen.height },
    window: { width: innerWidth, height: innerHeight },
    pixelRatio: devicePixelRatio,
    touch: matches('(pointer: coarse)'),
    installed: matches('(display-mode: standalone)'),
    offline: Boolean(navigator.serviceWorker?.controller),
    storageKept,
    online: navigator.onLine !== false,
    reducedMotion: matches('(prefers-reduced-motion: reduce)'),
    ...known,
  };
}
