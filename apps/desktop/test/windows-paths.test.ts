import { describe, expect, test } from 'vitest';
import { windowsNameProblem, windowsPathProblem } from '../src/windows-paths';

describe('windowsPathProblem', () => {
  test('passes the paths Explorer, the dialogs, and a command line give', () => {
    for (const path of [
      'C:\\Users\\Ada\\Documents\\The Lamp.fountain',
      'c:\\users\\ada\\notes.MD',
      'D:/Scripts/draft (2).markdown',
      '\\\\server\\share\\Scripts\\Pilot.fountain',
      '\\\\server.local\\share$\\x.txt',
      'C:\\',
      `C:\\${'long folder name\\'.repeat(30)}deep.fountain`,
      'C:\\Users\\Ada\\.config\\x.md',
      'C:\\Users\\Ada\\connect.fountain',
      'C:\\Users\\Ada\\console.md',
    ]) {
      expect(windowsPathProblem(path), path).toBeUndefined();
    }
  });

  test('refuses a trailing dot or space, which Windows drops (index.html. opens index.html)', () => {
    expect(windowsPathProblem('C:\\Scripts\\notes.md.')).toMatch(/dot or a space/);
    expect(windowsPathProblem('C:\\Scripts\\notes.md ')).toMatch(/dot or a space/);
    expect(windowsPathProblem('C:\\Scripts.\\notes.md')).toMatch(/dot or a space/);
    expect(windowsPathProblem('C:\\Scripts \\notes.md')).toMatch(/dot or a space/);
  });

  test('refuses a stream inside a file (an alternate data stream)', () => {
    expect(windowsPathProblem('C:\\Scripts\\program.exe:notes.md')).toMatch(/stream/);
    expect(windowsPathProblem('C:\\Scripts\\notes.md:$DATA')).toMatch(/stream/);
    expect(windowsPathProblem('C:\\Scripts\\notes.md::$DATA')).toMatch(/stream/);
  });

  test('refuses device names, with or without an extension, in any case', () => {
    for (const name of ['nul.md', 'NUL', 'con.fountain', 'Aux.txt', 'COM1.md', 'lpt9.markdown']) {
      expect(windowsPathProblem(`C:\\Scripts\\${name}`), name).toMatch(/device/);
    }
    expect(windowsPathProblem('C:\\CON\\x.md')).toMatch(/device/);
    expect(windowsPathProblem('C:\\Scripts\\COM¹.md')).toMatch(/device/);
  });

  test('refuses device paths: pipes, raw volumes, and the \\\\?\\ namespace', () => {
    for (const path of [
      '\\\\.\\pipe\\drafter.md',
      '\\\\.\\C:\\x.md',
      '\\\\?\\C:\\Scripts\\x.md',
      '\\\\?\\UNC\\server\\share\\x.md',
      '//./pipe/x.md',
    ]) {
      expect(windowsPathProblem(path), path).toMatch(/device path/);
    }
  });

  test('refuses characters no Windows name may hold', () => {
    expect(windowsPathProblem('C:\\Scripts\\a*b.md')).toMatch(/character/);
    expect(windowsPathProblem('C:\\Scripts\\a?b.md')).toMatch(/character/);
    expect(windowsPathProblem('C:\\Scripts\\a"b.md')).toMatch(/character/);
    expect(windowsPathProblem('C:\\Scripts\\a\u0001b.md')).toMatch(/character/);
  });
});

describe('windowsNameProblem', () => {
  test('passes ordinary names, and the empty, `.`, and `..` parts a path splits into', () => {
    for (const name of ['', '.', '..', 'index.html', '.drafter-tmp-abc', 'a b.md', 'nullable.md']) {
      expect(windowsNameProblem(name), name).toBeUndefined();
    }
  });
});
