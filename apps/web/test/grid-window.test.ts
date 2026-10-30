import { describe, expect, test } from 'vitest';
import { visibleColumns, WINDOW_EXTRA } from '../app/stats/grid-window';

// Only the columns in view are drawn, with WINDOW_EXTRA on each side (seeing-the-script design
// §4.4, Call 21), so a 300-scene grid draws as quickly as a short one.
describe('the grid’s drawn columns', () => {
  test('draws the columns in view and ten each side', () => {
    expect(WINDOW_EXTRA).toBe(10);
    // 40 px columns, scrolled 1,000 px, 200 px of them in view: columns 25 to 29.
    expect(visibleColumns(1000, 200, 40, 300)).toEqual({ from: 15, to: 40 });
    // A column partly in view is drawn.
    expect(visibleColumns(1010, 200, 40, 300)).toEqual({ from: 15, to: 41 });
  });

  test('clamps at both ends', () => {
    expect(visibleColumns(0, 200, 40, 300)).toEqual({ from: 0, to: 15 });
    expect(visibleColumns(40 * 300 - 200, 200, 40, 300)).toEqual({ from: 285, to: 300 });
    // An overscroll past either end, a grid narrower than its view, and no scenes at all.
    expect(visibleColumns(-30, 200, 40, 300)).toEqual({ from: 0, to: 15 });
    expect(visibleColumns(99_999, 200, 40, 300)).toEqual({ from: 285, to: 300 });
    expect(visibleColumns(0, 2000, 40, 12)).toEqual({ from: 0, to: 12 });
    expect(visibleColumns(0, 200, 40, 0)).toEqual({ from: 0, to: 0 });
  });
});
