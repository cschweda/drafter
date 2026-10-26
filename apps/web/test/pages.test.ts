import { parse } from '@drafter/fountain';
import type { Layout } from '@drafter/layout';
import { describe, expect, test } from 'vitest';
import { blockIndexAt, pageLabel, pageOf } from '../app/editor/pages';

// Only the page numbers and the index matter here.
const layout = (numbers: number[], index: number[]) =>
  ({
    pages: numbers.map((number) => ({ number })),
    index: index.map((page) => ({ page, line: 0 })),
    diagnostics: [],
  }) as unknown as Layout;

describe('pageOf', () => {
  test('is null before the first layout, and for a layout with no pages', () => {
    expect(pageOf(null, 0)).toBeNull();
    expect(pageOf(layout([], []), 0)).toBeNull();
  });

  test('looks the page up by number, not by position, when there is a title page', () => {
    const l = layout([0, 1, 2], [0, 1, 1, 2]);
    expect(pageOf(l, 0)).toEqual({ current: 0, last: 2 });
    expect(pageOf(l, 1)).toEqual({ current: 1, last: 2 });
    expect(pageOf(l, 3)).toEqual({ current: 2, last: 2 });
  });

  test('puts the title page and an unknown cursor on the first page', () => {
    expect(pageOf(layout([0, 1], [1]), -1)).toEqual({ current: 0, last: 1 });
    expect(pageOf(layout([1, 2], [1, 2]), null)).toEqual({ current: 1, last: 2 });
  });

  test('puts a block past the end of a lagging layout on the last block’s page', () => {
    expect(pageOf(layout([1, 2], [1, 2]), 9)).toEqual({ current: 2, last: 2 });
    expect(pageOf(layout([1], []), 3)).toEqual({ current: 1, last: 1 });
  });
});

describe('pageLabel', () => {
  test('reads Page N of M, or Title page', () => {
    expect(pageLabel({ current: 2, last: 5 })).toBe('Page 2 of 5');
    expect(pageLabel({ current: 0, last: 5 })).toBe('Title page');
  });
  test('is empty before the first layout', () => {
    expect(pageLabel(null)).toBe('');
  });
});

describe('blockIndexAt', () => {
  const source = 'Title: T\n\nINT. A - DAY\n\nAction.\n\n\nINT. B - DAY\n';
  const doc = parse(source);
  const at = (text: string, delta = 0) => blockIndexAt(doc, source.indexOf(text) + delta);

  test('is -1 on the title page and before the first block', () => {
    expect(at('Title')).toBe(-1);
    expect(at('Title', 8)).toBe(-1);
    expect(blockIndexAt(parse('\n\nINT. A - DAY\n'), 0)).toBe(-1);
  });

  test('is the block the offset is in', () => {
    expect(at('INT. A')).toBe(0);
    expect(at('Action.', 3)).toBe(1);
    expect(at('INT. B')).toBe(2);
  });

  test('is the last block before a blank line', () => {
    expect(at('Action.', 8)).toBe(1);
    expect(at('INT. B', -1)).toBe(1);
    expect(blockIndexAt(doc, source.length)).toBe(2);
  });
});
