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
    expect(advice).toMatch(/in Safari, choose File → Add to Dock on a Mac/);
    expect(advice).toMatch(/Share → Add to Home Screen on an iPhone or iPad/);
  });

  test('tells any other browser to install if it offers that', () => {
    const advice = installAdvice('other');
    expect(advice).toMatch(/install Drafter as an app/);
    expect(advice).not.toMatch(/Safari|Dock|address bar/);
  });

  test('always leads with saving to a file', () => {
    for (const kind of ['chromium', 'safari', 'other'] as const) {
      expect(installAdvice(kind)).toMatch(
        /^This browser may clear your recovery copy\. Save the script to a file/,
      );
    }
  });
});
