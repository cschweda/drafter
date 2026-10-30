// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { type PaneTabs, STATS_TAB_ID, viewTabs } from '../app/utils/panes';

// The Stats tab (seeing-the-script design §4.1): a view tab after Cards and Notes, which Show
// stats and the Counts panel's Stats… open beside the Source, with focus on a section's heading.

const env = vi.hoisted(() => ({
  tabs: null as unknown as { value: PaneTabs },
  phoneTab: null as unknown as { value: string },
  wide: true,
  left: 0,
}));
vi.mock('~/composables/usePanes', () => ({
  usePanes: () => ({ tabs: env.tabs, phoneTab: env.phoneTab }),
}));
vi.mock('~/composables/useFocusMode', () => ({
  useFocusMode: () => ({
    leave: () => {
      env.left++;
    },
  }),
}));

/** The tab's section headings, as StatsPane draws them. */
function drawPane() {
  document.body.innerHTML = `
    <div id="panel-stats" tabindex="0">
      <h2 id="stats-overview" tabindex="-1">Overview</h2>
      <h2 id="stats-characters" tabindex="-1">Characters</h2>
    </div>`;
}

beforeEach(() => {
  env.tabs = ref<PaneTabs>({ left: 'source', right: 'script' });
  env.phoneTab = ref('script');
  env.wide = true;
  env.left = 0;
  vi.stubGlobal('matchMedia', () => ({ matches: env.wide }));
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the Stats tab', () => {
  test('a Markdown document’s view tabs are Stats alone', () => {
    expect(STATS_TAB_ID).toBe('stats');
    expect(viewTabs('markdown')).toEqual([{ id: 'stats', label: 'Stats' }]);
    expect(viewTabs('fountain').map((t) => t.id)).toEqual(['cards', 'notes', 'stats', 'scaffold']);
  });

  test('showStats opens the tab beside the Source', async () => {
    const { showStats } = await import('../app/stats/tab');
    showStats();
    expect(env.tabs.value).toEqual({ left: 'source', right: 'stats' });
    expect(env.left).toBe(1);
    drawPane();
    await nextTick();
    // Focus goes to its first section's heading.
    expect(document.activeElement?.id).toBe('stats-overview');

    // With the Source on the right, it opens on the left; where it shows already, nothing moves.
    env.tabs.value = { left: 'outline', right: 'source' };
    showStats('characters');
    expect(env.tabs.value).toEqual({ left: 'stats', right: 'source' });
    await nextTick();
    expect(document.activeElement?.id).toBe('stats-characters');
    showStats();
    expect(env.tabs.value).toEqual({ left: 'stats', right: 'source' });

    // A section the tab doesn't draw: the panel has focus.
    showStats('grid');
    await nextTick();
    expect(document.activeElement?.id).toBe('panel-stats');

    // On a phone it is the one pane's tab.
    env.wide = false;
    env.tabs.value = { left: 'source', right: 'script' };
    showStats();
    expect(env.phoneTab.value).toBe('stats');
    expect(env.tabs.value).toEqual({ left: 'source', right: 'script' });
  });
});
