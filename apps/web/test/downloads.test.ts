import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { downloadUrl, PLATFORMS, platformFor, withVersion } from '../app/about/downloads';
import { COMMAND_DATA, commandsFor, DOWNLOAD_PAGE, helpHref } from '../app/commands/data';

// The Download page's links are made from the build's version and the release files' names, which
// the desktop release workflow gives them (electron-builder's artifact names).

const version = (
  JSON.parse(readFileSync(new URL('../../desktop/package.json', import.meta.url), 'utf8')) as {
    version: string;
  }
).version;

describe('the downloads', () => {
  test('has Windows, Linux, and Mac, with the Mac not yet available', () => {
    expect(PLATFORMS.map((p) => [p.id, p.available])).toEqual([
      ['windows', true],
      ['linux', true],
      ['mac', false],
    ]);
    expect(PLATFORMS.find((p) => p.id === 'mac')?.files).toEqual([]);
  });

  test('links each file at the release named for the version', () => {
    const urls = PLATFORMS.flatMap((p) => p.files.map((f) => downloadUrl(f, version)));
    const base = `https://github.com/cschweda/drafter/releases/download/v${version}`;
    expect(urls).toEqual([
      `${base}/Drafter-${version}-windows-x64-setup.exe`,
      `${base}/Drafter-${version}-linux-amd64.deb`,
      `${base}/Drafter-x86_64.AppImage`,
    ]);
    expect(withVersion('a-{version}-b-{version}', '1.2.3')).toBe('a-1.2.3-b-1.2.3');
  });

  test('names the release files as the desktop build does', () => {
    const config = readFileSync(
      new URL('../../desktop/electron-builder.config.cjs', import.meta.url),
      'utf8',
    );
    // electron-builder's own macros, not a template.
    // biome-ignore lint/suspicious/noTemplateCurlyInString: electron-builder's macros.
    expect(config).toContain("'Drafter-${version}-windows-${arch}-setup.${ext}'");
    // biome-ignore lint/suspicious/noTemplateCurlyInString: electron-builder's macros.
    expect(config).toContain("'Drafter-${version}-linux-${arch}.${ext}'");
    expect(config).toContain('Drafter-x86_64.AppImage');
  });

  test('finds the visitor’s system, and none for a phone', () => {
    const ua = {
      windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0',
      mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
      linux: 'Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/144.0',
      android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/142.0 Mobile',
      iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148',
    };
    expect(platformFor({ userAgent: ua.windows })).toBe('windows');
    expect(platformFor({ userAgent: ua.mac })).toBe('mac');
    expect(platformFor({ userAgent: ua.linux })).toBe('linux');
    expect(platformFor({ userAgent: ua.android })).toBeNull();
    expect(platformFor({ userAgent: ua.iphone })).toBeNull();
    // The client hint, where there is one, wins over a frozen user agent.
    expect(platformFor({ hint: 'macOS', userAgent: ua.windows })).toBe('mac');
    expect(platformFor({ hint: 'Linux', userAgent: ua.linux })).toBe('linux');
  });
});

describe('Download the desktop app', () => {
  test('is a Help command that opens the Download page', () => {
    expect(COMMAND_DATA.find((c) => c.id === DOWNLOAD_PAGE.id)).toEqual({
      id: 'download-desktop',
      title: 'Download the desktop app',
      group: 'Help',
      webOnly: true,
    });
    expect(helpHref(DOWNLOAD_PAGE)).toBe('/docs/download/');
  });

  test('is registered on the web and left out of the desktop app', () => {
    expect(commandsFor('web').map((c) => c.id)).toContain('download-desktop');
    expect(commandsFor('desktop').map((c) => c.id)).not.toContain('download-desktop');
    // Nothing else is left out.
    expect(commandsFor('desktop')).toHaveLength(COMMAND_DATA.length - 1);
  });
});
