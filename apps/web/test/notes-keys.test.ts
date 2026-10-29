import { describe, expect, test } from 'vitest';
import { notesKey } from '../app/notes/list-keys';

// The keys on a focused row of the Notes list (Phase 2 design §8, Call 13): one tab stop, Up and
// Down move, and the row's actions have a key each.

describe('notesKey', () => {
  test('Up and Down move', () => {
    expect(notesKey(3, 0, 'ArrowDown')).toEqual({ focus: 1 });
    expect(notesKey(3, 1, 'ArrowUp')).toEqual({ focus: 0 });
    expect(notesKey(3, 2, 'ArrowDown')).toBeNull();
    expect(notesKey(3, 0, 'ArrowUp')).toBeNull();
    expect(notesKey(3, 1, 'Home')).toEqual({ focus: 0 });
    expect(notesKey(3, 1, 'End')).toEqual({ focus: 2 });
    expect(notesKey(0, 0, 'ArrowDown')).toBeNull();
  });

  test('Enter goes, E edits, R resolves, C sets a category, Delete deletes', () => {
    expect(notesKey(3, 1, 'Enter')).toEqual({ action: 'go' });
    expect(notesKey(3, 1, 'e')).toEqual({ action: 'edit' });
    expect(notesKey(3, 1, 'E')).toEqual({ action: 'edit' });
    expect(notesKey(3, 1, 'r')).toEqual({ action: 'resolve' });
    expect(notesKey(3, 1, 'c')).toEqual({ action: 'category' });
    expect(notesKey(3, 1, 'Delete')).toEqual({ action: 'delete' });
    // A Mac's delete key is Backspace.
    expect(notesKey(3, 1, 'Backspace')).toEqual({ action: 'delete' });
    expect(notesKey(3, 1, 'ContextMenu')).toEqual({ action: 'menu' });
    expect(notesKey(3, 1, 'x')).toBeNull();
    expect(notesKey(0, 0, 'Enter')).toBeNull();
  });
});
