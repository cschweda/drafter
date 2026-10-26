import { describe, expect, test, vi } from 'vitest';

// The pure parts only: the session and the script are the app's, and the browser tests drive them.
vi.mock('../app/editor/session', () => ({ useEditor: () => ({}) }));
vi.mock('../app/storage/script', () => ({ useScript: () => ({}) }));

import { compareVersions, retitle } from '../app/storage/check';

describe('compareVersions', () => {
  test('compares the saved, file, and browser versions', () => {
    // Neither changed.
    expect(compareVersions({ saved: 'a', file: 'a', browser: 'a' })).toBe('same');
    // Only the file differs from the text as last saved.
    expect(compareVersions({ saved: 'a', file: 'b', browser: 'a' })).toBe('file-changed');
    // Only this browser's text differs.
    expect(compareVersions({ saved: 'a', file: 'a', browser: 'c' })).toBe('browser-changed');
    // Both differ, in different ways.
    expect(compareVersions({ saved: 'a', file: 'b', browser: 'c' })).toBe('both-changed');
  });

  test('counts both changed to the same text as the same', () => {
    expect(compareVersions({ saved: 'a', file: 'b', browser: 'b' })).toBe('same');
  });
});

describe('retitle', () => {
  test('replaces the title, whatever lines it takes', () => {
    expect(retitle('Title: The Call\nAuthor: Sam\n\nINT. HALL - DAY\n', 'The Call (x)')).toBe(
      'Title: The Call (x)\nAuthor: Sam\n\nINT. HALL - DAY\n',
    );
    expect(retitle('Title:\n    _The Call_\n    Part 2\nAuthor: Sam\n\nHi.\n', 'T2')).toBe(
      'Title: T2\nAuthor: Sam\n\nHi.\n',
    );
  });

  test('adds a title to a title page without one, or makes a title page', () => {
    expect(retitle('Author: Sam\n\nHi.\n', 'T2')).toBe('Title: T2\nAuthor: Sam\n\nHi.\n');
    expect(retitle('INT. HALL - DAY\n\nHi.\n', 'T2')).toBe('Title: T2\n\nINT. HALL - DAY\n\nHi.\n');
    expect(retitle('', 'T2')).toBe('Title: T2\n');
  });
});
