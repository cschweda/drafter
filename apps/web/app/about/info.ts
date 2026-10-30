// What About Drafter says (Help → About Drafter), and the plain text its Copy version info button
// copies for a bug report: the version, which app this is, the system, and the browser (or, in
// the desktop app, Electron and Chromium). Nothing personal: no paths, no names, no scripts.
// Pure apart from `buildInfo` and `currentAbout`, which read the build's constants and the page.

import { type DesktopBridge, desktop } from '../desktop';

/** Set by nuxt.config.ts (`vite.define`, from scripts/version.mjs); undefined in the unit tests. */
declare const __DRAFTER_VERSION__: string | undefined;
declare const __DRAFTER_COMMIT__: string | undefined;
declare const __DRAFTER_COMMIT_DATE__: string | undefined;

/** The open specification of the .drafter package (docs/spec/drafter-package.md), on GitHub. */
export const SPEC_URL =
  'https://github.com/cschweda/drafter/blob/main/docs/spec/drafter-package.md';

/** About's links, each opened outside the app (a new tab; the desktop app's system browser). */
export const ABOUT_LINKS: readonly { id: string; label: string; href: string }[] = [
  { id: 'repo', label: 'Source code on GitHub', href: 'https://github.com/cschweda/drafter' },
  { id: 'releases', label: 'Releases', href: 'https://github.com/cschweda/drafter/releases' },
  {
    id: 'changelog',
    label: 'Changelog',
    href: 'https://github.com/cschweda/drafter/blob/main/CHANGELOG.md',
  },
  {
    id: 'spec',
    label: 'The .drafter file format (an open specification)',
    href: SPEC_URL,
  },
  { id: 'site', label: 'drafter.dev', href: 'https://drafter.dev/' },
];

/** The one-line description About shows. */
export const ABOUT_DESCRIPTION = 'Screenplays and stage plays, written in plain text (Fountain).';

/** The licence About names. */
export const ABOUT_LICENSE = 'Free and open source, under the MIT License.';

export interface BuildInfo {
  /** `0.13.1`, or '' when the build defined none. */
  version: string;
  /** The commit's short hash, when git could say at build time. */
  commit?: string;
  /** The commit's date, `2026-10-29`. */
  date?: string;
}

export interface AboutInfo {
  version: string;
  app: 'web' | 'desktop';
  /** `macOS`; on the desktop with the processor, `Linux x64`. */
  platform: string;
  /** The web's browser, `Chrome 142`. */
  browser?: string;
  /** The desktop app's Electron and Chromium. */
  electron?: string;
  chrome?: string;
  commit?: string;
  date?: string;
}

/** The build's version and commit, as nuxt.config.ts defined them. */
export function buildInfo(): BuildInfo {
  const version = typeof __DRAFTER_VERSION__ === 'string' ? __DRAFTER_VERSION__ : '';
  const commit = typeof __DRAFTER_COMMIT__ === 'string' ? __DRAFTER_COMMIT__ : '';
  const date = typeof __DRAFTER_COMMIT_DATE__ === 'string' ? __DRAFTER_COMMIT_DATE__ : '';
  return { version, ...(commit && { commit }), ...(date && { date }) };
}

/** The browser and its major version (Safari's minor too, as it numbers its releases), from a user agent. */
export function browserOf(userAgent: string): string {
  const found = (name: string, pattern: RegExp) => {
    const match = pattern.exec(userAgent);
    return match ? `${name} ${match[1]}` : null;
  };
  return (
    found('Edge', /Edg(?:e|A|iOS)?\/(\d+)/) ??
    found('Firefox', /(?:Firefox|FxiOS)\/(\d+)/) ??
    found('Chrome', /(?:Chrome|CriOS)\/(\d+)/) ??
    found('Safari', /Version\/(\d+(?:\.\d+)?).*Safari\//) ??
    'Unknown browser'
  );
}

/** The system, from a user agent. */
export function platformOf(userAgent: string): string {
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'iOS';
  if (/Android/.test(userAgent)) return 'Android';
  if (/Mac OS X|Macintosh/.test(userAgent)) return 'macOS';
  if (/Windows/.test(userAgent)) return 'Windows';
  if (/CrOS/.test(userAgent)) return 'ChromeOS';
  if (/Linux|X11/.test(userAgent)) return 'Linux';
  return 'Unknown system';
}

const SYSTEMS: Record<string, string> = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' };

/** What About says, from the build, the desktop app's bridge (null in a browser), and the user agent. */
export function aboutInfo(input: {
  build: BuildInfo;
  bridge:
    | (Pick<DesktopBridge, 'version' | 'platform'> & {
        runtime?: Partial<NonNullable<DesktopBridge['runtime']>>;
      })
    | null;
  userAgent: string;
}): AboutInfo {
  const { build, bridge, userAgent } = input;
  const commit = {
    ...(build.commit && { commit: build.commit }),
    ...(build.date && { date: build.date }),
  };
  if (!bridge) {
    return {
      version: build.version,
      app: 'web',
      platform: platformOf(userAgent),
      browser: browserOf(userAgent),
      ...commit,
    };
  }
  const runtime = bridge.runtime ?? {};
  const system = SYSTEMS[bridge.platform] ?? bridge.platform;
  return {
    // Electron's own app version: the one the updater compares.
    version: bridge.version || build.version,
    app: 'desktop',
    platform: runtime.arch ? `${system} ${runtime.arch}` : system,
    ...(runtime.electron && { electron: runtime.electron }),
    ...(runtime.chrome && { chrome: runtime.chrome }),
    ...commit,
  };
}

/** The version as About shows it: `v0.13.1`. */
export function versionLine(info: Pick<AboutInfo, 'version'>): string {
  return info.version ? `v${info.version}` : 'Version unknown';
}

/** Which app this is, in words. */
export function appLine(info: Pick<AboutInfo, 'app'>): string {
  return info.app === 'desktop' ? 'desktop app' : 'web app (drafter.dev)';
}

/** The build's commit, `abc1234 (2026-10-29)`, or '' without one. */
export function buildLine(info: Pick<AboutInfo, 'commit' | 'date'>): string {
  if (!info.commit) return '';
  return info.date ? `${info.commit} (${info.date})` : info.commit;
}

/** Electron and Chromium, `Electron 39.1.0, Chromium 142.0.7444.52`, or ''. */
export function runtimeLine(info: Pick<AboutInfo, 'electron' | 'chrome'>): string {
  return [info.electron && `Electron ${info.electron}`, info.chrome && `Chromium ${info.chrome}`]
    .filter(Boolean)
    .join(', ');
}

/** The plain text Copy version info copies: a few lines for a bug report. */
export function versionText(info: AboutInfo): string {
  const build = buildLine(info);
  const runtime = runtimeLine(info);
  return [
    `Drafter ${versionLine(info)}`,
    `App: ${appLine(info)}`,
    ...(build ? [`Build: ${build}`] : []),
    `Platform: ${info.platform}`,
    ...(info.browser ? [`Browser: ${info.browser}`] : []),
    ...(runtime ? [runtime] : []),
  ].join('\n');
}

/** What About says in this page. */
export function currentAbout(): AboutInfo {
  return aboutInfo({
    build: buildInfo(),
    bridge: desktop(),
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
  });
}
