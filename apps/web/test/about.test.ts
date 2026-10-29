import { describe, expect, test } from 'vitest';
import {
  ABOUT_LINKS,
  aboutInfo,
  browserOf,
  platformOf,
  versionLine,
  versionText,
} from '../app/about/info';

// About Drafter: what it says, and the plain text Copy version info puts on the clipboard.

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1';
const EDGE_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0';

describe('the browser and system, from the user agent', () => {
  test('names the common browsers by their major version', () => {
    expect(browserOf(CHROME_MAC)).toBe('Chrome 142');
    expect(browserOf(FIREFOX_LINUX)).toBe('Firefox 140');
    expect(browserOf(SAFARI_IPHONE)).toBe('Safari 18.2');
    expect(browserOf(EDGE_WINDOWS)).toBe('Edge 142');
    expect(browserOf('something else')).toBe('Unknown browser');
  });

  test('names the system', () => {
    expect(platformOf(CHROME_MAC)).toBe('macOS');
    expect(platformOf(FIREFOX_LINUX)).toBe('Linux');
    expect(platformOf(SAFARI_IPHONE)).toBe('iOS');
    expect(platformOf(EDGE_WINDOWS)).toBe('Windows');
    expect(platformOf('Mozilla/5.0 (Linux; Android 15; Pixel 7)')).toBe('Android');
  });
});

describe('About Drafter', () => {
  test('on the web: the build’s version, the browser, and the commit', () => {
    const info = aboutInfo({
      build: { version: '0.13.1', commit: 'abc1234', date: '2026-10-29' },
      bridge: null,
      userAgent: CHROME_MAC,
    });
    expect(info).toEqual({
      version: '0.13.1',
      app: 'web',
      platform: 'macOS',
      browser: 'Chrome 142',
      commit: 'abc1234',
      date: '2026-10-29',
    });
    expect(versionLine(info)).toBe('v0.13.1');
    expect(versionText(info)).toBe(
      [
        'Drafter v0.13.1',
        'App: web app (drafter.dev)',
        'Build: abc1234 (2026-10-29)',
        'Platform: macOS',
        'Browser: Chrome 142',
      ].join('\n'),
    );
  });

  test('on the desktop: Electron’s version, the platform and processor, Electron and Chromium', () => {
    const info = aboutInfo({
      build: { version: '0.13.1' },
      bridge: {
        version: '0.13.1',
        platform: 'linux',
        runtime: { arch: 'x64', electron: '39.1.0', chrome: '142.0.7444.52' },
      },
      userAgent: CHROME_MAC,
    });
    expect(info).toEqual({
      version: '0.13.1',
      app: 'desktop',
      platform: 'Linux x64',
      electron: '39.1.0',
      chrome: '142.0.7444.52',
    });
    expect(versionText(info)).toBe(
      [
        'Drafter v0.13.1',
        'App: desktop app',
        'Platform: Linux x64',
        'Electron 39.1.0, Chromium 142.0.7444.52',
      ].join('\n'),
    );
  });

  test('on the desktop, the version is the one Electron reports', () => {
    const info = aboutInfo({
      build: { version: '0.0.0' },
      bridge: { version: '0.13.2', platform: 'darwin' },
      userAgent: '',
    });
    expect(info.version).toBe('0.13.2');
    expect(info.platform).toBe('macOS');
  });

  test('with no version at all (a unit test, a build without one), says so', () => {
    const info = aboutInfo({ build: { version: '' }, bridge: null, userAgent: '' });
    expect(versionLine(info)).toBe('Version unknown');
  });

  test('links to the repository, the releases, the changelog, and drafter.dev, over https', () => {
    expect(ABOUT_LINKS.map((l) => l.href)).toEqual([
      'https://github.com/cschweda/drafter',
      'https://github.com/cschweda/drafter/releases',
      'https://github.com/cschweda/drafter/blob/main/CHANGELOG.md',
      'https://drafter.dev/',
    ]);
  });
});
