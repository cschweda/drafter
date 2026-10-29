import { describe, expect, test } from 'vitest';
import {
  chooseTab,
  clampSplit,
  coreTabs,
  DEFAULT_TABS,
  dropTab,
  otherPane,
  PHONE_DEFAULT_TAB,
  revealTab,
  SPLIT,
  TABS,
  tabRow,
  VIEW_TABS,
  viewTabs,
} from '../app/utils/panes';

describe('panes', () => {
  test('starts with Source on the left and Script on the right', () => {
    expect(DEFAULT_TABS).toEqual({ left: 'source', right: 'script' });
  });

  test('puts the four core tabs first: Source, Script, Problems, and Outline', () => {
    expect(TABS).toEqual([
      { id: 'source', label: 'Source' },
      { id: 'script', label: 'Script' },
      { id: 'problems', label: 'Problems' },
      { id: 'outline', label: 'Outline' },
    ]);
  });

  test('has no Outline for a Markdown document', () => {
    expect(coreTabs('fountain').map((t) => t.id)).toEqual([
      'source',
      'script',
      'problems',
      'outline',
    ]);
    expect(coreTabs('markdown').map((t) => t.id)).toEqual(['source', 'script', 'problems']);
    // A pane showing it shows another core tab instead.
    expect(dropTab({ left: 'source', right: 'outline' }, 'outline')).toEqual({
      left: 'source',
      right: 'script',
    });
  });

  test('drops Cards and Notes from a pane when the document turns Markdown', () => {
    let tabs = { left: 'cards', right: 'notes' };
    for (const tab of ['outline', 'cards', 'notes']) tabs = dropTab(tabs, tab);
    expect(tabs).toEqual({ left: 'source', right: 'script' });
    expect(dropTab({ left: 'script', right: 'cards' }, 'cards')).toEqual({
      left: 'script',
      right: 'source',
    });
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

  test('revealTab leaves the tabs alone when the tab is showing', () => {
    expect(revealTab(DEFAULT_TABS, 'source')).toBe(DEFAULT_TABS);
    expect(revealTab(DEFAULT_TABS, 'script', 'left')).toBe(DEFAULT_TABS);
  });

  test('revealTab opens the tab in the pane other than the one asking', () => {
    // Problems is hidden. Asked from the left, it opens on the right; from the right, on the left.
    expect(revealTab(DEFAULT_TABS, 'problems', 'left')).toEqual({
      left: 'source',
      right: 'problems',
    });
    expect(revealTab(DEFAULT_TABS, 'problems', 'right')).toEqual({
      left: 'problems',
      right: 'script',
    });
  });

  test('revealTab opens it on the left when no pane is asking', () => {
    expect(revealTab(DEFAULT_TABS, 'problems')).toEqual({ left: 'problems', right: 'script' });
  });

  describe('tabRow', () => {
    const others = [
      { id: 'module:a', label: 'Scenes' },
      { id: 'module:b', label: 'Cast' },
      { id: 'module:c', label: 'Notes' },
    ];
    const ids = (tabs: Array<{ id: string }>) => tabs.map((t) => t.id);

    test('shows the first other tab in the slot and the rest under More', () => {
      const { row, more } = tabRow(TABS, others, 'source', null);
      expect(ids(row)).toEqual(['source', 'script', 'problems', 'outline', 'module:a']);
      expect(ids(more)).toEqual(['module:b', 'module:c']);
    });

    test('shows the last other tab chosen in the slot', () => {
      const { row, more } = tabRow(TABS, others, 'source', 'module:c');
      expect(ids(row).at(-1)).toBe('module:c');
      expect(ids(more)).toEqual(['module:a', 'module:b']);
    });

    test("shows the pane's own tab in the slot", () => {
      const { row, more } = tabRow(TABS, others, 'module:b', 'module:c');
      expect(ids(row).at(-1)).toBe('module:b');
      expect(ids(more)).toEqual(['module:a', 'module:c']);
    });

    test('puts Cards and Notes in the slot and More, before module tabs', () => {
      expect(VIEW_TABS).toEqual([
        { id: 'cards', label: 'Cards' },
        { id: 'notes', label: 'Notes' },
      ]);
      const { row, more } = tabRow(TABS, [...viewTabs('fountain'), ...others], 'source', null);
      expect(ids(row)).toEqual(['source', 'script', 'problems', 'outline', 'cards']);
      expect(ids(more)).toEqual(['notes', 'module:a', 'module:b', 'module:c']);
      // A module's tab chosen last takes the slot, and Cards goes first in More.
      const later = tabRow(TABS, [...viewTabs('fountain'), ...others], 'source', 'module:b');
      expect(ids(later.row).at(-1)).toBe('module:b');
      expect(ids(later.more)).toEqual(['cards', 'notes', 'module:a', 'module:c']);
    });

    test('has no Cards or Notes for a Markdown document', () => {
      expect(viewTabs('markdown')).toEqual([]);
      const { row, more } = tabRow(coreTabs('markdown'), viewTabs('markdown'), 'source', null);
      expect(ids(row)).toEqual(['source', 'script', 'problems']);
      expect(more).toEqual([]);
    });

    test('has no More with one other tab, and no slot with none', () => {
      expect(tabRow(TABS, others.slice(0, 1), 'source', null).more).toEqual([]);
      expect(tabRow(TABS, [], 'source', 'module:a')).toEqual({ row: TABS, more: [] });
    });
  });
});
