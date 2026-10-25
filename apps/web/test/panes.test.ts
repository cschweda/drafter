import { describe, expect, test } from 'vitest';
import {
  chooseTab,
  clampSplit,
  DEFAULT_TABS,
  otherPane,
  PHONE_DEFAULT_TAB,
  SPLIT,
  TABS,
} from '../app/utils/panes';

describe('panes', () => {
  test('starts with Source on the left and Script on the right', () => {
    expect(DEFAULT_TABS).toEqual({ left: 'source', right: 'script' });
  });

  test('lists Source, Script, and Problems, in that order', () => {
    expect(TABS).toEqual([
      { id: 'source', label: 'Source' },
      { id: 'script', label: 'Script' },
      { id: 'problems', label: 'Problems' },
    ]);
  });

  test('opens on the Script pane on a phone', () => {
    expect(PHONE_DEFAULT_TAB).toBe('script');
  });

  test('shows a tab in the chosen pane', () => {
    expect(chooseTab(DEFAULT_TABS, 'right', 'problems')).toEqual({
      left: 'source',
      right: 'problems',
    });
  });

  test('swaps when the tab is open in the other pane', () => {
    expect(chooseTab(DEFAULT_TABS, 'right', 'source')).toEqual({ left: 'script', right: 'source' });
    expect(chooseTab(DEFAULT_TABS, 'left', 'script')).toEqual({ left: 'script', right: 'source' });
  });

  test('changes nothing when the tab is already in that pane', () => {
    expect(chooseTab(DEFAULT_TABS, 'left', 'source')).toEqual(DEFAULT_TABS);
  });

  test('names the other pane', () => {
    expect([otherPane('left'), otherPane('right')]).toEqual(['right', 'left']);
  });

  test('keeps the split between a quarter and three quarters', () => {
    expect(SPLIT).toEqual({ min: 0.25, max: 0.75, step: 0.05, initial: 0.5 });
    expect([clampSplit(0.1), clampSplit(0.9), clampSplit(0.5), clampSplit(Number.NaN)]).toEqual([
      0.25, 0.75, 0.5, 0.5,
    ]);
  });
});
