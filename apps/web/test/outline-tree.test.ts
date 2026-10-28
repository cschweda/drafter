import { describe, expect, test } from 'vitest';
import { type TreeRow, treeKey, typeAhead } from '../app/outline/tree';

// Act One (open) > A, B; Act Two (closed) > C; D at the top.
const rows: TreeRow[] = [
  { id: 'act1', level: 1, parent: null, expandable: true, open: true, label: 'Act One' },
  { id: 'a', level: 2, parent: 'act1', expandable: false, open: false, label: 'INT. A - DAY' },
  { id: 'b', level: 2, parent: 'act1', expandable: false, open: false, label: 'INT. B - DAY' },
  { id: 'act2', level: 1, parent: null, expandable: true, open: false, label: 'Act Two' },
  { id: 'd', level: 1, parent: null, expandable: false, open: false, label: 'EXT. D - NIGHT' },
];

describe('the outline tree keys', () => {
  test('moves down and up through visible rows', () => {
    expect(treeKey(rows, 'act1', 'ArrowDown')).toEqual({ focus: 'a' });
    expect(treeKey(rows, 'b', 'ArrowDown')).toEqual({ focus: 'act2' });
    expect(treeKey(rows, 'd', 'ArrowDown')).toBeNull();
    expect(treeKey(rows, 'act2', 'ArrowUp')).toEqual({ focus: 'b' });
    expect(treeKey(rows, 'act1', 'ArrowUp')).toBeNull();
  });

  test('Right opens a closed section, then goes to its first child', () => {
    expect(treeKey(rows, 'act2', 'ArrowRight')).toEqual({ toggle: 'act2' });
    expect(treeKey(rows, 'act1', 'ArrowRight')).toEqual({ focus: 'a' });
    expect(treeKey(rows, 'a', 'ArrowRight')).toBeNull();
  });

  test('Left closes an open section, then goes to the parent', () => {
    expect(treeKey(rows, 'act1', 'ArrowLeft')).toEqual({ toggle: 'act1' });
    expect(treeKey(rows, 'b', 'ArrowLeft')).toEqual({ focus: 'act1' });
    expect(treeKey(rows, 'act2', 'ArrowLeft')).toBeNull();
  });

  test('Home and End', () => {
    expect(treeKey(rows, 'b', 'Home')).toEqual({ focus: 'act1' });
    expect(treeKey(rows, 'b', 'End')).toEqual({ focus: 'd' });
  });

  test('type-ahead finds the next row by its start', () => {
    expect(typeAhead(rows, 'act1', 'int')).toBe('a');
    expect(typeAhead(rows, 'a', 'int')).toBe('b');
    expect(typeAhead(rows, 'b', 'int')).toBe('a');
    expect(typeAhead(rows, 'a', 'e')).toBe('d');
    expect(typeAhead(rows, 'a', 'zz')).toBeNull();
  });
});
