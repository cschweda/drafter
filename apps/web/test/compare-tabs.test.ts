import { describe, expect, test } from 'vitest';
import { orderVersions } from '../app/compare/use-compare';
import {
  COMPARE_TAB,
  dropTab,
  inspectorTabs,
  showInInspector,
  TABS,
  tabRow,
  viewTabs,
} from '../app/utils/panes';

// Compare (Phase 2 design §5.8, §11.2, Call 16): a tab that exists only while a comparison is
// open, first among the other tabs on a phone; on a wide screen it opens in the Inspector, beside
// the editor (fresh-look design §3.3).

const ids = (tabs: Array<{ id: string }>) => tabs.map((t) => t.id);

describe('the Compare tab', () => {
  test('Compare opens in the Inspector, beside the editor', () => {
    expect(COMPARE_TAB).toEqual({ id: 'compare', label: 'Compare' });
    expect(showInInspector({ left: 'source', right: 'script' }, COMPARE_TAB.id)).toEqual({
      left: 'source',
      right: 'compare',
    });
    expect(showInInspector({ left: 'source', right: 'problems' }, COMPARE_TAB.id)).toEqual({
      left: 'source',
      right: 'compare',
    });
    // Already showing: nothing moves.
    const showing = { left: 'source', right: 'compare' };
    expect(showInInspector(showing, COMPARE_TAB.id)).toBe(showing);
    // It waits under the Inspector's More, in a script and in a Markdown document.
    expect(inspectorTabs('fountain').more).toContain('compare');
    expect(inspectorTabs('markdown').more).toContain('compare');
  });

  test('Compare takes the slot while open and is gone when closed', () => {
    const open = [COMPARE_TAB, ...viewTabs('fountain')];
    // The pane showing it has it in its slot, and More has the rest.
    const showing = tabRow(TABS, open, 'compare', 'cards');
    expect(ids(showing.row).at(-1)).toBe('compare');
    expect(ids(showing.more)).toEqual(['cards', 'notes', 'stats', 'scaffold', 'production']);
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

describe('the Cuts tab', () => {
  test('opens, as Compare does, in the Inspector beside the editor, and goes as Compare does', () => {
    expect(showInInspector({ left: 'source', right: 'script' }, 'cuts')).toEqual({
      left: 'source',
      right: 'cuts',
    });
    const showing = { left: 'source', right: 'cuts' };
    expect(showInInspector(showing, 'cuts')).toBe(showing);
    expect(dropTab(showing, 'cuts')).toEqual({ left: 'source', right: 'script' });
    // Scripts and Markdown documents alike (drafts-and-cuts design §3.2).
    expect(inspectorTabs('fountain').more).toContain('cuts');
    expect(inspectorTabs('markdown').more).toContain('cuts');
    expect(inspectorTabs('fountain').more).not.toContain('deleted');
  });
});
