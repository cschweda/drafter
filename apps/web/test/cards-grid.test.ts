import { describe, expect, test } from 'vitest';
import { cardsKey, gridKey } from '../app/cards/grid';

// Cards flow into rows of `columns` (measured from the drawn cards); the arrow keys move by where
// a card is drawn (Phase 2 design §7).

describe('gridKey', () => {
  // Seven cards in rows of three:  0 1 2 / 3 4 5 / 6
  test('Right and Left step through the cards', () => {
    expect(gridKey(7, 3, 0, 'ArrowRight')).toBe(1);
    expect(gridKey(7, 3, 2, 'ArrowRight')).toBe(3);
    expect(gridKey(7, 3, 6, 'ArrowRight')).toBeNull();
    expect(gridKey(7, 3, 3, 'ArrowLeft')).toBe(2);
    expect(gridKey(7, 3, 0, 'ArrowLeft')).toBeNull();
  });

  test('Down and Up go a row by the column count', () => {
    expect(gridKey(7, 3, 1, 'ArrowDown')).toBe(4);
    expect(gridKey(7, 3, 4, 'ArrowUp')).toBe(1);
    expect(gridKey(7, 3, 1, 'ArrowUp')).toBeNull();
    // A short last row: Down from above its end goes to its last card.
    expect(gridKey(7, 3, 5, 'ArrowDown')).toBe(6);
    // One column (a phone): Down and Up are one card.
    expect(gridKey(4, 1, 1, 'ArrowDown')).toBe(2);
    expect(gridKey(4, 1, 1, 'ArrowUp')).toBe(0);
  });

  test('Down on the last row stays', () => {
    expect(gridKey(7, 3, 6, 'ArrowDown')).toBeNull();
    expect(gridKey(6, 3, 4, 'ArrowDown')).toBeNull();
    expect(gridKey(1, 3, 0, 'ArrowDown')).toBeNull();
  });

  test('Home and End', () => {
    expect(gridKey(7, 3, 4, 'Home')).toBe(0);
    expect(gridKey(7, 3, 4, 'End')).toBe(6);
    expect(gridKey(7, 3, 0, 'Home')).toBeNull();
    expect(gridKey(7, 3, 6, 'End')).toBeNull();
    expect(gridKey(7, 3, 4, 'a')).toBeNull();
  });
});

describe('cardsKey', () => {
  // Two sections: five cards (0 1 2 / 3 4) and two (5 6), in rows of three.
  const groups = [5, 2];

  test('Left, Right, Home, and End go through every card in script order', () => {
    expect(cardsKey(groups, 3, 4, 'ArrowRight')).toBe(5);
    expect(cardsKey(groups, 3, 5, 'ArrowLeft')).toBe(4);
    expect(cardsKey(groups, 3, 2, 'End')).toBe(6);
    expect(cardsKey(groups, 3, 6, 'Home')).toBe(0);
  });

  test('Down from a section’s last row goes to the next section’s first row, same column', () => {
    expect(cardsKey(groups, 3, 0, 'ArrowDown')).toBe(3);
    expect(cardsKey(groups, 3, 3, 'ArrowDown')).toBe(5);
    expect(cardsKey(groups, 3, 4, 'ArrowDown')).toBe(6);
    // Column three has no card in a section of two: its last card.
    expect(cardsKey(groups, 3, 2, 'ArrowDown')).toBe(4);
    expect(cardsKey([3, 2], 3, 2, 'ArrowDown')).toBe(4);
    expect(cardsKey(groups, 3, 6, 'ArrowDown')).toBeNull();
  });

  test('Up from a section’s first row goes to the last row above, same column', () => {
    expect(cardsKey(groups, 3, 5, 'ArrowUp')).toBe(3);
    expect(cardsKey(groups, 3, 6, 'ArrowUp')).toBe(4);
    expect(cardsKey([3, 2], 3, 4, 'ArrowUp')).toBe(1);
    expect(cardsKey(groups, 3, 1, 'ArrowUp')).toBeNull();
  });
});
