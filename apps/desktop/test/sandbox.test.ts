import { describe, expect, test } from 'vitest';
import {
  ALLOW_NO_SANDBOX,
  CONTINUE,
  markerFor,
  QUIT,
  sandboxNotice,
  sandboxOffReason,
} from '../src/sandbox';

const none = { hasSwitch: () => false, argv: ['/opt/Drafter/drafterdev'], env: {} };

describe('sandboxOffReason', () => {
  test('sees --no-sandbox on the command line', () => {
    expect(sandboxOffReason({ ...none, hasSwitch: (name) => name === 'no-sandbox' })).toBe(
      'no-sandbox-switch',
    );
  });

  test('sees --no-sandbox in argv even when app.commandLine does not (enableSandbox hides it)', () => {
    for (const flag of ['--no-sandbox', '--no-sandbox=1']) {
      expect(sandboxOffReason({ ...none, argv: ['/opt/Drafter/drafterdev', flag] })).toBe(
        'no-sandbox-switch',
      );
    }
    // The program's own name is not an argument, and a file named like the switch is not one.
    expect(sandboxOffReason({ ...none, argv: ['--no-sandbox'] })).toBeNull();
    expect(
      sandboxOffReason({ ...none, argv: ['drafterdev', '/home/me/--no-sandboxed.fountain'] }),
    ).toBeNull();
  });

  test('sees ELECTRON_DISABLE_SANDBOX in the environment, set to anything, even empty', () => {
    for (const value of ['1', 'true', '0', 'yes', '']) {
      expect(sandboxOffReason({ ...none, env: { ELECTRON_DISABLE_SANDBOX: value } })).toBe(
        'disable-sandbox-env',
      );
    }
  });

  test('is null when nothing turned the sandbox off', () => {
    expect(sandboxOffReason(none)).toBeNull();
    expect(sandboxOffReason({ ...none, env: { ELECTRON_DISABLE_SANDBOX: undefined } })).toBeNull();
  });

  test('the switch is the reason when both are present', () => {
    expect(
      sandboxOffReason({
        ...none,
        argv: ['x', '--no-sandbox'],
        env: { ELECTRON_DISABLE_SANDBOX: '1' },
      }),
    ).toBe('no-sandbox-switch');
  });
});

describe('sandboxNotice', () => {
  const off = { ...none, packaged: true, argv: ['/opt/Drafter/drafterdev', '--no-sandbox'] };

  test('asks about a packaged app that has no sandbox', () => {
    const notice = sandboxNotice(off);
    expect(notice?.reason).toBe('no-sandbox-switch');
    expect(notice?.message).toMatch(/sandbox/i);
  });

  test('recommends the .deb, says why, and points at the doc and the opt-out', () => {
    const detail = sandboxNotice(off)?.detail ?? '';
    expect(detail).toContain('Ubuntu 24.04');
    expect(detail).toContain('.deb');
    expect(detail).toContain('AppArmor');
    expect(detail).toContain('docs/desktop-install-linux.md');
    expect(detail).toContain(ALLOW_NO_SANDBOX);
  });

  test('keeps the answer in a file named for the reason', () => {
    expect(sandboxNotice(off)?.marker).toBe(markerFor('no-sandbox-switch'));
    expect(
      sandboxNotice({ ...off, argv: ['x'], env: { ELECTRON_DISABLE_SANDBOX: '1' } })?.marker,
    ).toBe(markerFor('disable-sandbox-env'));
    expect(markerFor('no-sandbox-switch')).not.toBe(markerFor('disable-sandbox-env'));
  });

  test('skips the question when the writer opts out by name, and only for exactly 1', () => {
    expect(sandboxNotice({ ...off, env: { [ALLOW_NO_SANDBOX]: '1' } })).toBeNull();
    expect(sandboxNotice({ ...off, env: { [ALLOW_NO_SANDBOX]: 'yes' } })).not.toBeNull();
  });

  test('leaves an unpackaged app alone, and a sandboxed one', () => {
    expect(sandboxNotice({ ...off, packaged: false })).toBeNull();
    expect(sandboxNotice({ ...none, packaged: true })).toBeNull();
  });

  test('has two buttons', () => {
    expect([CONTINUE, QUIT]).toEqual(['Continue without the sandbox', 'Quit']);
  });
});
