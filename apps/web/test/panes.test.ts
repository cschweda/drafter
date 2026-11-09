import { describe, expect, test } from 'vitest';
import {
  clampSplit,
  coreTabs,
  DEFAULT_TABS,
  dropTab,
  INSPECTOR_TOOLS_ID,
  inspectorTabs,
  PHONE_DEFAULT_TAB,
  PHONE_LABELS,
  phoneTabs,
  SPLIT,
  showInInspector,
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

  // Fresh-look design §6 (Task 9): a phone opens on Write, which fixes "the phone opened on the
  // Script tab"; the tab isn't stored.
  test('opens on Write (the Source) on a phone', () => {
    expect(PHONE_DEFAULT_TAB).toBe('source');
    expect(PHONE_LABELS.source).toBe('Write');
  });

  describe('the bottom tab bar (fresh-look design §6)', () => {
    test("a script's bar is Write, Script, Outline; More holds Cards, Stats, Scaffold, Notes, Production, Problems, then History", () => {
      expect(phoneTabs('fountain')).toEqual({
        row: ['source', 'script', 'outline'],
        more: ['cards', 'stats', 'scaffold', 'notes', 'production', 'problems', 'history'],
      });
    });
    test("a Markdown document's bar is Write and Preview; More holds Stats, Problems, History", () => {
      expect(phoneTabs('markdown')).toEqual({
        row: ['source', 'script'],
        more: ['stats', 'problems', 'history'],
      });
    });
    test("a novel's bar is Write, Preview, and its Outline; More leads with its Cards", () => {
      expect(phoneTabs('novel')).toEqual({
        row: ['source', 'script', 'outline'],
        more: ['cards', 'stats', 'problems', 'history'],
      });
    });
    test('Drafts and the draft being read lead More after Compare while open', () => {
      expect(phoneTabs('markdown', [], { compare: true, drafts: true, draft: true }).more).toEqual([
        'compare',
        'drafts',
        'draft',
        'stats',
        'problems',
        'history',
      ]);
    });
    test('Draft by draft leads More while open, after the Drafts list', () => {
      expect(phoneTabs('markdown', [], { drafts: true, steps: true }).more.slice(0, 2)).toEqual([
        'drafts',
        'draft-steps',
      ]);
    });
    test("the modules' tabs follow Problems, and Compare and Cuts lead while open", () => {
      expect(phoneTabs('fountain', ['module-a--t'], { compare: true, cuts: true }).more).toEqual([
        'compare',
        'cuts',
        'cards',
        'stats',
        'scaffold',
        'notes',
        'production',
        'problems',
        'module-a--t',
        'history',
      ]);
    });
  });

  describe('the Inspector (fresh-look design §3.3, Call 14)', () => {
    test("a script's Inspector row is Script, Outline, Cards, Stats, Scaffold; More holds Notes, Production, Problems, Compare, Cuts, and module tabs", () => {
      expect(inspectorTabs('fountain')).toEqual({
        row: ['script', 'outline', 'cards', 'stats', 'scaffold'],
        more: [
          'notes',
          'production',
          'problems',
          'compare',
          'cuts',
          'drafts',
          'draft-steps',
          'draft',
        ],
      });
      expect(inspectorTabs('fountain', ['module-a--x', 'module-b--y']).more).toEqual([
        'notes',
        'production',
        'problems',
        'compare',
        'cuts',
        'drafts',
        'draft-steps',
        'draft',
        'module-a--x',
        'module-b--y',
      ]);
    });

    test("a novel's row is Preview, Outline, Cards, and Stats; More as a Markdown document's", () => {
      expect(inspectorTabs('novel')).toEqual({
        row: ['script', 'outline', 'cards', 'stats'],
        more: ['problems', 'compare', 'cuts', 'drafts', 'draft-steps', 'draft'],
      });
    });

    test("a Markdown document's row is Preview and Stats; More holds Problems, Compare, and Cuts", () => {
      // The Preview is the Script tab's id in a Markdown document (its panel is #panel-script).
      expect(inspectorTabs('markdown')).toEqual({
        row: ['script', 'stats'],
        more: ['problems', 'compare', 'cuts', 'drafts', 'draft-steps', 'draft'],
      });
      // A module's tab, which a module may draw for any document, goes after them.
      expect(inspectorTabs('markdown', ['module-a--x']).more).toEqual([
        'problems',
        'compare',
        'cuts',
        'drafts',
        'draft-steps',
        'draft',
        'module-a--x',
      ]);
    });

    test('showInInspector never touches the editor pane', () => {
      for (const tab of [
        'script',
        'outline',
        'cards',
        'stats',
        'scaffold',
        'notes',
        'problems',
        'compare',
        'cuts',
        'module-a--x',
      ] as const) {
        expect(showInInspector(DEFAULT_TABS, tab)).toEqual({ left: 'source', right: tab });
      }
      // Already showing: nothing moves.
      const showing = { left: 'source', right: 'outline' };
      expect(showInInspector(showing, 'outline')).toBe(showing);
      // An old layout with something else on the left is put right: the editor is on the left.
      expect(showInInspector({ left: 'script', right: 'source' }, 'stats')).toEqual({
        left: 'source',
        right: 'stats',
      });
    });

    test('the header owns one place for the view’s tools', () => {
      expect(INSPECTOR_TOOLS_ID).toBe('inspector-tools');
    });
  });

  test('keeps the split between a quarter and three quarters', () => {
    expect(SPLIT).toEqual({ min: 0.25, max: 0.75, step: 0.05, initial: 0.5 });
    expect([clampSplit(0.1), clampSplit(0.9), clampSplit(0.5), clampSplit(Number.NaN)]).toEqual([
      0.25, 0.75, 0.5, 0.5,
    ]);
  });

  describe('tabRow', () => {
    const others = [
      { id: 'module:a', label: 'Scenes' },
      { id: 'module:b', label: 'Cast' },
      { id: 'module:c', label: 'Notes' },
    ];
    const ids = (tabs: Array<{ id: string }>) => tabs.map((t) => t.id);

    test('leaves the slot empty until another tab is chosen, with every other tab under More', () => {
      const { row, more } = tabRow(TABS, others, 'source', null);
      expect(ids(row)).toEqual(['source', 'script', 'problems', 'outline']);
      expect(ids(more)).toEqual(['module:a', 'module:b', 'module:c']);
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

    test('puts Cards, Notes, Stats, Scaffold, and Production in the slot and More, before module tabs', () => {
      expect(VIEW_TABS).toEqual([
        { id: 'cards', label: 'Cards' },
        { id: 'notes', label: 'Notes' },
        { id: 'stats', label: 'Stats' },
        { id: 'scaffold', label: 'Scaffold' },
        { id: 'production', label: 'Production' },
      ]);
      const { row, more } = tabRow(TABS, [...viewTabs('fountain'), ...others], 'source', null);
      expect(ids(row)).toEqual(['source', 'script', 'problems', 'outline']);
      expect(ids(more)).toEqual([
        'cards',
        'notes',
        'stats',
        'scaffold',
        'production',
        'module:a',
        'module:b',
        'module:c',
      ]);
      // Chosen, Cards takes the slot.
      const chosen = tabRow(TABS, [...viewTabs('fountain'), ...others], 'cards', 'cards');
      expect(ids(chosen.row).at(-1)).toBe('cards');
      expect(ids(chosen.more)).toEqual([
        'notes',
        'stats',
        'scaffold',
        'production',
        'module:a',
        'module:b',
        'module:c',
      ]);
      // A module's tab chosen last takes the slot, and Cards goes first in More.
      const later = tabRow(TABS, [...viewTabs('fountain'), ...others], 'source', 'module:b');
      expect(ids(later.row).at(-1)).toBe('module:b');
      expect(ids(later.more)).toEqual([
        'cards',
        'notes',
        'stats',
        'scaffold',
        'production',
        'module:a',
        'module:c',
      ]);
    });

    test('has no Cards, Notes, or Scaffold for a Markdown document, only Stats', () => {
      const { row, more } = tabRow(coreTabs('markdown'), viewTabs('markdown'), 'source', null);
      expect(ids(row)).toEqual(['source', 'script', 'problems']);
      expect(ids(more)).toEqual(['stats']);
    });

    test('has no More when the one other tab is in the slot, and no slot with none', () => {
      // One other tab, not chosen: it waits under More.
      expect(ids(tabRow(TABS, others.slice(0, 1), 'source', null).more)).toEqual(['module:a']);
      expect(tabRow(TABS, others.slice(0, 1), 'source', 'module:a').more).toEqual([]);
      expect(tabRow(TABS, [], 'source', 'module:a')).toEqual({ row: TABS, more: [] });
    });
  });
});
