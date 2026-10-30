import type { Strip, StripBlock } from '@drafter/outline';
import { describe, expect, test } from 'vitest';
import { opensMenu, stripKey } from '../app/strip/keys';

// The strip's arrow keys (structure strip design §4, Call 12), as a pure function of the strip.

const block = (from: number, to: number, kind: StripBlock['kind'] = 'scene'): StripBlock => ({
  kind,
  block: from * 10,
  from,
  to,
  label: `${from}`,
  color: null,
});

/**
 * Acts over 0–4 and 4–10; a sequence over 0–2, a tick at 6, and one over 7–10; scenes over 0–1,
 * 1–2, 2–4, 4–7, and 7–10.
 */
const STRIP: Strip = {
  unit: 'pages',
  start: 0,
  length: 10,
  rows: [
    { kind: 'section', depth: 1, blocks: [block(0, 4, 'section'), block(4, 10, 'section')] },
    {
      kind: 'section',
      depth: 2,
      blocks: [block(0, 2, 'section'), block(6, 6, 'section'), block(7, 10, 'section')],
    },
    {
      kind: 'scenes',
      depth: null,
      blocks: [block(0, 1), block(1, 2), block(2, 4), block(4, 7), block(7, 10)],
    },
  ],
};

describe('the strip keys', () => {
  test('Left and Right move along a row and stop at its ends', () => {
    expect(stripKey(STRIP, { row: 2, index: 1 }, 'ArrowRight')).toEqual({ row: 2, index: 2 });
    expect(stripKey(STRIP, { row: 2, index: 1 }, 'ArrowLeft')).toEqual({ row: 2, index: 0 });
    expect(stripKey(STRIP, { row: 2, index: 0 }, 'ArrowLeft')).toBeNull();
    expect(stripKey(STRIP, { row: 2, index: 4 }, 'ArrowRight')).toBeNull();
  });

  test("Up and Down go to the block covering the focused block's middle", () => {
    // A block covers from its start up to its end; a point where one block ends and the next
    // starts belongs to the next, as on the axis.
    expect(stripKey(STRIP, { row: 2, index: 4 }, 'ArrowUp')).toEqual({ row: 1, index: 2 });
    expect(stripKey(STRIP, { row: 1, index: 2 }, 'ArrowDown')).toEqual({ row: 2, index: 4 });
    expect(stripKey(STRIP, { row: 1, index: 0 }, 'ArrowUp')).toEqual({ row: 0, index: 0 });
    // The second act's middle is 7, where the last sequence starts.
    expect(stripKey(STRIP, { row: 0, index: 1 }, 'ArrowDown')).toEqual({ row: 1, index: 2 });
    // The first sequence's middle is 1, where the second scene starts.
    expect(stripKey(STRIP, { row: 1, index: 0 }, 'ArrowDown')).toEqual({ row: 2, index: 1 });
    // A tick's middle is its place: the scene and the act it falls in.
    expect(stripKey(STRIP, { row: 1, index: 1 }, 'ArrowDown')).toEqual({ row: 2, index: 3 });
    expect(stripKey(STRIP, { row: 1, index: 1 }, 'ArrowUp')).toEqual({ row: 0, index: 1 });
  });

  test('Up and Down go to the nearest block when none covers it', () => {
    // The scene over 2–4 (middle 3): the sequence ending at 2 is a page off, the tick at 6 three.
    expect(stripKey(STRIP, { row: 2, index: 2 }, 'ArrowUp')).toEqual({ row: 1, index: 0 });
    // The scene over 4–7 (middle 5.5): the tick at 6 is half a page off, 7–10 one and a half.
    expect(stripKey(STRIP, { row: 2, index: 3 }, 'ArrowUp')).toEqual({ row: 1, index: 1 });
    // The first act's middle is 2, where the first sequence ends: nothing covers it, and that
    // sequence is nearest.
    expect(stripKey(STRIP, { row: 0, index: 0 }, 'ArrowDown')).toEqual({ row: 1, index: 0 });
  });

  test('Up from the top row and Down from the scenes row do nothing', () => {
    expect(stripKey(STRIP, { row: 0, index: 1 }, 'ArrowUp')).toBeNull();
    expect(stripKey(STRIP, { row: 2, index: 2 }, 'ArrowDown')).toBeNull();
  });

  test("Home and End go to the row's ends", () => {
    expect(stripKey(STRIP, { row: 2, index: 2 }, 'Home')).toEqual({ row: 2, index: 0 });
    expect(stripKey(STRIP, { row: 2, index: 2 }, 'End')).toEqual({ row: 2, index: 4 });
    expect(stripKey(STRIP, { row: 1, index: 0 }, 'Home')).toBeNull();
    expect(stripKey(STRIP, { row: 1, index: 2 }, 'End')).toBeNull();
  });

  test('other keys do nothing', () => {
    for (const key of ['Enter', ' ', 'a', 'Tab', 'PageDown', 'Escape']) {
      expect(stripKey(STRIP, { row: 1, index: 1 }, key)).toBeNull();
    }
    // A place that isn't in the strip goes nowhere.
    expect(stripKey(STRIP, { row: 5, index: 0 }, 'ArrowRight')).toBeNull();
  });
});

describe("the block menu's keys", () => {
  const key = (k: string, more: Partial<KeyboardEvent> = {}) => ({
    key: k,
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    ...more,
  });
  test('the context-menu key and Shift+F10 open it, and nothing else', () => {
    expect(opensMenu(key('ContextMenu'))).toBe(true);
    expect(opensMenu(key('F10', { shiftKey: true }))).toBe(true);
    expect(opensMenu(key('F10'))).toBe(false);
    expect(opensMenu(key('F10', { shiftKey: true, ctrlKey: true }))).toBe(false);
    expect(opensMenu(key('Enter'))).toBe(false);
  });
});
