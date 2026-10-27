import { describe, expect, test } from 'vitest';
import { ALLOW_NO_SANDBOX, sandboxOff, sandboxRefusal } from '../src/sandbox';

describe('sandboxOff', () => {
  test('sees --no-sandbox on the command line', () => {
    expect(sandboxOff({ hasSwitch: (name) => name === 'no-sandbox', argv: [], env: {} })).toBe(
      true,
    );
  });

  test('sees ELECTRON_DISABLE_SANDBOX in the environment, set to anything', () => {
    for (const value of ['1', 'true', '0', 'yes']) {
      expect(
        sandboxOff({ hasSwitch: () => false, argv: [], env: { ELECTRON_DISABLE_SANDBOX: value } }),
      ).toBe(true);
    }
  });

  test('sees --no-sandbox in argv even when app.commandLine does not (enableSandbox hides it)', () => {
    const base = { hasSwitch: () => false, env: {} };
    expect(sandboxOff({ ...base, argv: ['/opt/Drafter/drafterdev', '--no-sandbox'] })).toBe(true);
    expect(sandboxOff({ ...base, argv: ['/opt/Drafter/drafterdev', '--no-sandbox=1'] })).toBe(true);
    // The program's own name is not an argument, and a file named like the switch is not one.
    expect(sandboxOff({ ...base, argv: ['--no-sandbox'] })).toBe(false);
    expect(sandboxOff({ ...base, argv: ['drafterdev', '/home/me/--no-sandboxed.fountain'] })).toBe(
      false,
    );
  });

  test('is false when nothing turned the sandbox off', () => {
    expect(sandboxOff({ hasSwitch: () => false, argv: ['drafterdev'], env: {} })).toBe(false);
    expect(
      sandboxOff({ hasSwitch: () => false, argv: [], env: { ELECTRON_DISABLE_SANDBOX: '' } }),
    ).toBe(false);
  });
});

describe('sandboxRefusal', () => {
  const off = { hasSwitch: () => true, argv: [], env: {} };

  test('refuses a packaged app that has no sandbox', () => {
    expect(sandboxRefusal({ ...off, packaged: true })).toMatch(/sandbox/i);
  });

  test('says what to do: the .deb, user namespaces, and the explicit opt-out', () => {
    const message = sandboxRefusal({ ...off, packaged: true }) ?? '';
    expect(message).toContain('.deb');
    expect(message).toContain('apparmor_restrict_unprivileged_userns');
    expect(message).toContain(ALLOW_NO_SANDBOX);
  });

  test('lets it run when the writer opts out by name, and only for exactly 1', () => {
    expect(sandboxRefusal({ ...off, packaged: true, env: { [ALLOW_NO_SANDBOX]: '1' } })).toBeNull();
    expect(
      sandboxRefusal({ ...off, packaged: true, env: { [ALLOW_NO_SANDBOX]: 'yes' } }),
    ).not.toBeNull();
  });

  test('leaves an unpackaged app alone, and a sandboxed one', () => {
    expect(sandboxRefusal({ ...off, packaged: false })).toBeNull();
    expect(
      sandboxRefusal({ packaged: true, hasSwitch: () => false, argv: [], env: {} }),
    ).toBeNull();
  });
});
