import { describe, expect, test } from 'vitest';
import type { AboutInfo } from '../app/about/info';
import { addressOf, setupLines, technicalDetails } from '../app/about/setup';

// The technical details a bug report or an idea carries: About's version info, then the setup.

const WEB: AboutInfo = { version: '0.25.0', app: 'web', platform: 'macOS', browser: 'Chrome 142' };
const DESKTOP: AboutInfo = {
  version: '0.25.0',
  app: 'desktop',
  platform: 'Windows x64',
  electron: '39.1.0',
  chrome: '142.0.7444.52',
};

describe('the address, in words', () => {
  test('names drafter.dev, this computer, a preview, or a server of your own', () => {
    expect(addressOf('drafter.dev')).toBe('drafter.dev');
    expect(addressOf('www.drafter.dev')).toBe('drafter.dev');
    expect(addressOf('localhost')).toBe('this computer (localhost)');
    expect(addressOf('127.0.0.1')).toBe('this computer (localhost)');
    expect(addressOf('[::1]')).toBe('this computer (localhost)');
    expect(addressOf('drafter.localhost')).toBe('this computer (localhost)');
    expect(addressOf('deploy-preview-16--my-drafter.netlify.app')).toBe('a preview on Netlify');
    expect(addressOf('scripts.example.org')).toBe('another address (self-hosted)');
  });

  test('never carries the name of a server of your own', () => {
    expect(setupLines('web', { host: 'writers.my-studio.example' }).join('\n')).not.toContain(
      'my-studio',
    );
  });
});

describe('the setup', () => {
  test('on the web: every line, in order', () => {
    expect(
      setupLines('web', {
        host: 'drafter.dev',
        language: 'en-US',
        screen: { width: 1512, height: 982 },
        window: { width: 1440.4, height: 900 },
        pixelRatio: 2,
        touch: false,
        installed: true,
        offline: true,
        saveInPlace: true,
        storageKept: false,
        online: true,
        document: 'Screenplay',
        writingMode: 'classic',
        theme: 'dark',
        textSize: 1.15,
        reducedMotion: true,
        spellcheck: true,
      }),
    ).toEqual([
      'Address: drafter.dev',
      'Language: en-US',
      'Screen: 1512×982 (window 1440×900, 2× pixels)',
      'Input: mouse or trackpad',
      'Installed as an app: yes',
      'Works offline: yes',
      'Saves in place: yes',
      'Storage: the browser may clear it',
      'Online: yes',
      'Document: Screenplay',
      'Writing mode: Classic',
      'Look: dark, text 115%, reduced motion',
      'Spellcheck: on',
    ]);
  });

  test('in the desktop app: no address, install, offline, or storage lines', () => {
    const lines = setupLines('desktop', {
      host: 'drafter',
      installed: false,
      offline: false,
      storageKept: true,
      saveInPlace: true,
      touch: true,
      theme: 'light',
      textSize: 1,
    });
    expect(lines).toEqual(['Input: touch', 'Saves in place: yes', 'Look: light']);
  });

  test('says what it can’t tell by leaving it out', () => {
    expect(setupLines('web', { storageKept: null, screen: { width: 390, height: 844 } })).toEqual([
      'Screen: 390×844',
    ]);
    expect(setupLines('web', {})).toEqual([]);
  });

  test('a phone that saves as downloads, with no offline copy yet', () => {
    expect(
      setupLines('web', { touch: true, offline: false, saveInPlace: false, online: false }),
    ).toEqual([
      'Input: touch',
      'Works offline: not yet (no offline copy)',
      'Saves in place: no (saves as downloads)',
      'Online: no',
    ]);
  });
});

describe('the technical details', () => {
  test('start with About’s version info, then the setup', () => {
    expect(technicalDetails(WEB, { host: 'localhost', writingMode: 'fountain' })).toBe(
      [
        'Drafter v0.25.0',
        'App: web app (drafter.dev)',
        'Platform: macOS',
        'Browser: Chrome 142',
        'Address: this computer (localhost)',
        'Writing mode: Fountain',
      ].join('\n'),
    );
    expect(technicalDetails(DESKTOP, { document: 'Stage play' })).toBe(
      [
        'Drafter v0.25.0',
        'App: desktop app',
        'Platform: Windows x64',
        'Electron 39.1.0, Chromium 142.0.7444.52',
        'Document: Stage play',
      ].join('\n'),
    );
  });
});
