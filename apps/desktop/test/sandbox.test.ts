import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  ALLOW_NO_SANDBOX,
  CONTINUE,
  markerFor,
  QUIT,
  rememberAnswer,
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

const DATA = '/home/me/.config/Drafter';

describe('sandboxNotice', () => {
  const off = {
    ...none,
    platform: 'linux',
    packaged: true,
    argv: ['/opt/Drafter/drafterdev', '--no-sandbox'],
  };

  test('asks about a packaged app that has no sandbox', () => {
    const notice = sandboxNotice(off, DATA);
    expect(notice?.reason).toBe('no-sandbox-switch');
    expect(notice?.message).toMatch(/sandbox/i);
  });

  test('recommends the .deb, says why, and points at the doc and the opt-out', () => {
    const detail = sandboxNotice(off, DATA)?.detail ?? '';
    expect(detail).toContain('Ubuntu 24.04');
    expect(detail).toContain('.deb');
    expect(detail).toContain('AppArmor');
    // No advice that changes the whole system (the doc has the choices, with their cost stated).
    expect(detail).not.toContain('sysctl');
    expect(detail).not.toContain('apparmor_restrict_unprivileged_userns');
    expect(detail).toContain('docs/desktop-install-linux.md');
    expect(detail).toContain(ALLOW_NO_SANDBOX);
  });

  test('keeps the answer in a file named for the reason, and says where', () => {
    const notice = sandboxNotice(off, DATA);
    expect(notice?.marker).toBe(`${DATA}/${markerFor('no-sandbox-switch')}`);
    expect(notice?.detail).toContain('remembered');
    expect(notice?.detail).toContain(notice?.marker);
    expect(
      sandboxNotice({ ...off, argv: ['x'], env: { ELECTRON_DISABLE_SANDBOX: '1' } }, DATA)?.marker,
    ).toBe(`${DATA}/${markerFor('disable-sandbox-env')}`);
    expect(markerFor('no-sandbox-switch')).not.toBe(markerFor('disable-sandbox-env'));
  });

  test('skips the question when the writer opts out by name, and only for exactly 1', () => {
    expect(sandboxNotice({ ...off, env: { [ALLOW_NO_SANDBOX]: '1' } }, DATA)).toBeNull();
    expect(sandboxNotice({ ...off, env: { [ALLOW_NO_SANDBOX]: 'yes' } }, DATA)).not.toBeNull();
  });

  test('leaves an unpackaged app alone, and a sandboxed one', () => {
    expect(sandboxNotice({ ...off, packaged: false }, DATA)).toBeNull();
    expect(sandboxNotice({ ...none, platform: 'linux', packaged: true }, DATA)).toBeNull();
  });

  test('on a Mac asks too, without the Linux advice (no AppImage, .deb, or AppArmor there)', () => {
    const mac = {
      ...off,
      platform: 'darwin',
      argv: ['/Applications/Drafter.app/Contents/MacOS/Drafter', '--no-sandbox'],
    };
    const DATA_MAC = '/Users/me/Library/Application Support/Drafter';
    const notice = sandboxNotice(mac, DATA_MAC);
    expect(notice?.reason).toBe('no-sandbox-switch');
    expect(notice?.message).toBe(sandboxNotice(off, DATA)?.message);
    const detail = notice?.detail ?? '';
    for (const linuxOnly of ['AppImage', '.deb', 'AppArmor', 'Ubuntu', 'desktop-install-linux']) {
      expect(detail).not.toContain(linuxOnly);
    }
    expect(detail).toContain('--no-sandbox');
    expect(detail).toContain('ELECTRON_DISABLE_SANDBOX');
    expect(detail).toContain(ALLOW_NO_SANDBOX);
    expect(detail).toContain(`${DATA_MAC}/${markerFor('no-sandbox-switch')}`);
    // Nothing to ask when the sandbox is on, as on Linux.
    expect(
      sandboxNotice(
        { ...mac, argv: ['/Applications/Drafter.app/Contents/MacOS/Drafter'] },
        DATA_MAC,
      ),
    ).toBeNull();
  });

  test('names no Mac or Linux places on another system (Windows, when it comes)', () => {
    const detail =
      sandboxNotice({ ...off, platform: 'win32', argv: ['C:\\Drafter.exe', '--no-sandbox'] }, DATA)
        ?.detail ?? '';
    for (const elsewhere of ['Finder', 'Dock', 'Applications', 'AppImage', '.deb', 'AppArmor']) {
      expect(detail).not.toContain(elsewhere);
    }
    expect(detail).toContain('--no-sandbox');
    expect(detail).toContain(ALLOW_NO_SANDBOX);
  });

  test('has two buttons', () => {
    expect([CONTINUE, QUIT]).toEqual(['Continue without the sandbox', 'Quit']);
  });
});

describe('rememberAnswer', () => {
  test('writes the answer, making the folder if it is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'drafter-answer-'));
    try {
      const marker = join(root, 'new', 'Drafter', markerFor('no-sandbox-switch'));
      expect(rememberAnswer(marker)).toBe(true);
      expect(await readFile(marker, 'utf8')).toMatch(/^\d{4}-/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('returns false instead of throwing when it can’t write (the app carries on)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'drafter-answer-'));
    try {
      // A file where the folder should be.
      await writeFile(join(root, 'Drafter'), 'in the way');
      expect(rememberAnswer(join(root, 'Drafter', markerFor('no-sandbox-switch')))).toBe(false);
      // A folder that can't be written to (not for root, which writes anywhere).
      if (process.getuid?.() !== 0) {
        await chmod(root, 0o500);
        expect(rememberAnswer(join(root, 'other', markerFor('no-sandbox-switch')))).toBe(false);
        await chmod(root, 0o700);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
