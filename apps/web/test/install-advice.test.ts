import { describe, expect, test } from 'vitest';
import { installAdvice, installKindOf } from '../app/storage/install-advice';

// What the storage warning says about installing depends on what the browser can do, found by
// asking for the feature and not by reading its name (see the function's notes).
describe('installKindOf', () => {
  test('is Chromium when the browser can offer its own install prompt', () => {
    expect(installKindOf({ onbeforeinstallprompt: null })).toBe('chromium');
    expect(installKindOf({ BeforeInstallPromptEvent: class {} })).toBe('chromium');
  });

  test('is Safari on WebKit, which has gesture events and no install prompt', () => {
    expect(installKindOf({ GestureEvent: class {} })).toBe('safari');
  });

  test('is Safari on an iPhone or iPad whatever its gestures', () => {
    expect(installKindOf({}, { standalone: false })).toBe('safari');
  });

  test('is other for a browser with neither', () => {
    expect(installKindOf({})).toBe('other');
  });

  test('is installed when the page runs as an app, whatever else it can do', () => {
    const standalone = { matches: true };
    expect(installKindOf({ matchMedia: () => standalone, onbeforeinstallprompt: null })).toBe(
      'installed',
    );
    expect(installKindOf({ GestureEvent: class {} }, { standalone: true })).toBe('installed');
  });

  test('is not installed in a tab', () => {
    expect(installKindOf({ matchMedia: () => ({ matches: false }) })).toBe('other');
    expect(installKindOf({ GestureEvent: class {} }, { standalone: false })).toBe('safari');
    // A matchMedia that throws, or is missing, is a tab too.
    expect(
      installKindOf({
        matchMedia: () => {
          throw new Error('no');
        },
      }),
    ).toBe('other');
  });

  test('prefers the install prompt where both are there', () => {
    expect(installKindOf({ onbeforeinstallprompt: null, GestureEvent: class {} })).toBe('chromium');
  });
});

describe('installAdvice', () => {
  test('tells Chrome and Edge to use Install', () => {
    const advice = installAdvice('chromium');
    expect(advice).toMatch(/Install in the address bar/);
    expect(advice).toMatch(/Install Drafter/);
    expect(advice).not.toMatch(/Safari/);
  });

  test('tells Safari its steps', () => {
    const advice = installAdvice('safari');
    // Safari is named only where it is the browser that has the Dock item: Chrome on an iPhone has
    // the same engine and cannot be told apart, and it has Share → Add to Home Screen too.
    expect(advice).toMatch(/on a Mac, in Safari, choose File → Add to Dock/);
    expect(advice).toMatch(/on an iPhone or iPad, choose Share → Add to Home Screen/);
    expect(advice).not.toMatch(/Safari[^;]*iPhone/);
  });

  test('tells an installed app only to save to a file', () => {
    const advice = installAdvice('installed');
    expect(advice).toBe(
      'This browser may clear your recovery copy. Save the script to a file to keep it safe.',
    );
    expect(advice).not.toMatch(/install|Safari|Dock|Home Screen|address bar/i);
  });

  test('tells any other browser to install if it offers that', () => {
    const advice = installAdvice('other');
    expect(advice).toMatch(/install Drafter as an app/);
    expect(advice).not.toMatch(/Safari|Dock|address bar/);
  });

  test('always leads with saving to a file', () => {
    for (const kind of ['chromium', 'safari', 'other', 'installed'] as const) {
      expect(installAdvice(kind)).toMatch(
        /^This browser may clear your recovery copy\. Save the script to a file/,
      );
    }
  });
});
