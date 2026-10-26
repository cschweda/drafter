// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from 'vitest';
import { formatKeys, isApple, matchesKey } from '../app/commands/keys';

describe('formatKeys', () => {
  test('formats keys for Apple platforms', () => {
    expect(formatKeys('Mod-Shift-s', true)).toBe('⌘⇧S');
    expect(formatKeys('Mod-Alt-1', true)).toBe('⌘⌥1');
    expect(formatKeys('Ctrl-Alt-[', true)).toBe('⌃⌥[');
    expect(formatKeys('Shift-F8', true)).toBe('⇧F8');
  });

  test('formats keys elsewhere', () => {
    expect(formatKeys('Mod-Shift-s', false)).toBe('Ctrl+Shift+S');
    expect(formatKeys('Mod-Alt-1', false)).toBe('Ctrl+Alt+1');
    expect(formatKeys('Ctrl-Alt-]', false)).toBe('Ctrl+Alt+]');
    expect(formatKeys('F8', false)).toBe('F8');
  });

  test('formats a key that is the minus sign', () => {
    expect(formatKeys('Mod--', false)).toBe('Ctrl+-');
  });
});

function press(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', init);
}

describe('matchesKey', () => {
  test('matches Mod as Command on Apple platforms and Control elsewhere', () => {
    expect(matchesKey(press({ key: 's', metaKey: true }), 'Mod-s', true)).toBe(true);
    expect(matchesKey(press({ key: 's', ctrlKey: true }), 'Mod-s', true)).toBe(false);
    expect(matchesKey(press({ key: 's', ctrlKey: true }), 'Mod-s', false)).toBe(true);
    expect(matchesKey(press({ key: 's', metaKey: true }), 'Mod-s', false)).toBe(false);
  });

  test('wants exactly the modifiers named', () => {
    expect(matchesKey(press({ key: 'S', ctrlKey: true, shiftKey: true }), 'Mod-s', false)).toBe(
      false,
    );
    expect(
      matchesKey(press({ key: 'S', ctrlKey: true, shiftKey: true }), 'Mod-Shift-s', false),
    ).toBe(true);
    expect(matchesKey(press({ key: 's', ctrlKey: true, altKey: true }), 'Mod-s', false)).toBe(
      false,
    );
    expect(matchesKey(press({ key: 's' }), 'Mod-s', false)).toBe(false);
  });

  test('reads a letter pressed with Alt by its physical key', () => {
    // Option+N on a Mac types a dead key, so `key` is not "n".
    const event = press({ key: 'Dead', code: 'KeyN', metaKey: true, altKey: true });
    expect(matchesKey(event, 'Mod-Alt-n', true)).toBe(true);
    expect(
      matchesKey(
        press({ key: '1', code: 'Digit1', metaKey: true, altKey: true }),
        'Mod-Alt-1',
        true,
      ),
    ).toBe(true);
  });

  test('matches a key with no modifier', () => {
    expect(matchesKey(press({ key: 'F8' }), 'F8', false)).toBe(true);
    expect(matchesKey(press({ key: 'F8', shiftKey: true }), 'F8', false)).toBe(false);
    expect(matchesKey(press({ key: 'F8', shiftKey: true }), 'Shift-F8', false)).toBe(true);
  });
});

describe('isApple', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('knows a Mac from either name the browser gives its platform', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    expect(isApple()).toBe(true);
    vi.stubGlobal('navigator', { platform: '', userAgentData: { platform: 'macOS' } });
    expect(isApple()).toBe(true);
    vi.stubGlobal('navigator', { platform: 'iPhone' });
    expect(isApple()).toBe(true);
  });

  test('knows other platforms', () => {
    vi.stubGlobal('navigator', { platform: 'Win32' });
    expect(isApple()).toBe(false);
    vi.stubGlobal('navigator', { platform: 'Linux x86_64', userAgentData: { platform: 'Linux' } });
    expect(isApple()).toBe(false);
  });
});
