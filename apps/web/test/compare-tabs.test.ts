import { describe, expect, test } from 'vitest';
import { orderVersions } from '../app/compare/use-compare';
import {
  COMPARE_TAB,
  comparePane,
  dropTab,
  openCompare,
  TABS,
  tabRow,
  viewTabs,
} from '../app/utils/panes';

// Compare (Phase 2 design §5.8, §11.2, Call 16): a tab that exists only while a comparison is
// open, first among the other tabs, in the pane that isn't showing Source.

const ids = (tabs: Array<{ id: string }>) => tabs.map((t) => t.id);

describe('the Compare tab', () => {
  test('Compare opens in the pane not showing Source', () => {
    expect(COMPARE_TAB).toEqual({ id: 'compare', label: 'Compare' });
    expect(comparePane({ left: 'source', right: 'script' })).toBe('right');
    expect(comparePane({ left: 'outline', right: 'source' })).toBe('left');
    expect(openCompare({ left: 'outline', right: 'source' })).toEqual({
      left: 'compare',
      right: 'source',
    });
  });

  test('in the right pane when neither shows Source', () => {
    expect(comparePane({ left: 'script', right: 'problems' })).toBe('right');
    expect(openCompare({ left: 'script', right: 'problems' })).toEqual({
      left: 'script',
      right: 'compare',
    });
    // Already showing: nothing moves.
    const showing = { left: 'compare', right: 'source' };
    expect(openCompare(showing)).toBe(showing);
  });

  test('Compare takes the slot while open and is gone when closed', () => {
    const open = [COMPARE_TAB, ...viewTabs('fountain')];
    // The pane showing it has it in its slot, and More has the rest.
    const showing = tabRow(TABS, open, 'compare', 'cards');
    expect(ids(showing.row).at(-1)).toBe('compare');
    expect(ids(showing.more)).toEqual(['cards', 'notes']);
    // Closed: it is in no row and no More, and the pane that showed it shows a core tab.
    const closed = tabRow(TABS, viewTabs('fountain'), 'source', 'compare');
    expect(ids(closed.row)).not.toContain('compare');
    expect(ids(closed.more)).not.toContain('compare');
    expect(dropTab({ left: 'source', right: 'compare' }, 'compare')).toEqual({
      left: 'source',
      right: 'script',
    });
  });

  test('orders the two versions by time, with now the newest', () => {
    const now = { label: 'now (10:58)', at: null, text: 'c' };
    const early = { label: '9:00', at: 1, text: 'a' };
    const late = { label: '10:42', at: 2, text: 'b' };
    expect(orderVersions(now, early)).toEqual({ older: early, newer: now });
    expect(orderVersions(early, now)).toEqual({ older: early, newer: now });
    expect(orderVersions(late, early)).toEqual({ older: early, newer: late });
    expect(orderVersions(early, late)).toEqual({ older: early, newer: late });
  });
});
