import { describe, expect, test } from 'vitest';
import { gridModel } from '../src';
import { build, filler, HARBOR } from './scripts';

describe('the grid', () => {
  const { cast, index } = build(HARBOR);
  const grid = gridModel(cast, index);
  const row = (key: string) => grid.rows.indexOf(key);

  test("rows in the Characters table's order", () => {
    expect(grid.rows).toEqual(cast.characters.map((c) => c.key));
    expect(grid.rows[0]).toBe('HOPE');
    expect(grid.columns).toBe(14);
  });

  test('a silent cell', () => {
    expect(grid.cell(row('TOM'), 1)).toEqual({ speeches: 0, silent: true });
    expect(grid.cell(row('TOM'), 3)).toEqual({ speeches: 1, silent: false });
    expect(grid.cell(row('TOM'), 0)).toBeNull();
    expect(grid.cell(row('HOPE'), 0)).toEqual({ speeches: 1, silent: false });
    // Outside the grid.
    expect(grid.cell(-1, 0)).toBeNull();
    expect(grid.cell(0, 14)).toBeNull();
    expect(grid.cell(grid.rows.length, 0)).toBeNull();
  });

  test('four shades by speeches', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 30].map((n) => grid.shade(n))).toEqual([
      0, 1, 2, 2, 3, 3, 3, 4, 4,
    ]);
  });

  test('gaps span the empty cells between two appearances', () => {
    expect(grid.gaps).toEqual([]);
    const bodies = Array.from({ length: 26 }, (_, n) =>
      n === 0 || n === 24 ? 'TOM\nHere.' : n === 25 ? 'ANN\nThere.' : filler(50),
    );
    const text = bodies.map((b, n) => `INT. ROOM ${n + 1} - DAY\n\n${b}\n`).join('\n');
    const paged = build(text, { pages: true });
    const long = gridModel(paged.cast, paged.index);
    const absence = paged.cast.figures.get('TOM')?.absences?.[0];
    expect(absence).toBeDefined();
    expect(long.gaps).toEqual([{ row: long.rows.indexOf('TOM'), from: 1, to: 23, absence }]);
  });
});
