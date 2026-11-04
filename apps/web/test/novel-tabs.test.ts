import { describe, expect, test } from 'vitest';
import { nextTick, type Ref, ref, shallowRef } from 'vue';
import type { DocumentKind } from '../app/markdown/kind';
import { keepNovelTabs } from '../app/novel/tabs';
import type { PaneTabs, TabId } from '../app/utils/panes';

// A novel keeps its Outline and Cards tabs (Novel plan, Task 5), and a moment of being plain
// Markdown (text typed below its comment, the comment edited by hand) doesn't lose them.

function panes(right: TabId = 'outline', phone: TabId = 'cards') {
  const kind = shallowRef<DocumentKind>('markdown');
  const novel = shallowRef(true);
  const loaded = shallowRef(1);
  const tabs = ref<PaneTabs>({ left: 'source', right }) as Ref<PaneTabs>;
  const phoneTab = ref<TabId>(phone);
  keepNovelTabs({ kind, novel, loaded, tabs, phoneTab });
  return { kind, novel, loaded, tabs, phoneTab };
}

describe('keepNovelTabs', () => {
  test('a novel keeps the Outline and Cards', () => {
    const p = panes();
    expect(p.tabs.value.right).toBe('outline');
    expect(p.phoneTab.value).toBe('cards');
  });

  test('a flicker to plain Markdown drops them, and they come back with the novel', async () => {
    const p = panes();
    p.novel.value = false;
    await nextTick();
    expect(p.tabs.value.right).not.toBe('outline');
    expect(p.phoneTab.value).toBe('source');
    p.novel.value = true;
    await nextTick();
    expect(p.tabs.value).toEqual({ left: 'source', right: 'outline' });
    expect(p.phoneTab.value).toBe('cards');
  });

  test('a tab the writer chose meanwhile stays', async () => {
    const p = panes();
    p.novel.value = false;
    await nextTick();
    p.tabs.value = { left: 'source', right: 'stats' };
    p.novel.value = true;
    await nextTick();
    expect(p.tabs.value.right).toBe('stats');
  });

  test('another document loaded forgets them', async () => {
    const p = panes();
    p.novel.value = false;
    await nextTick();
    const fallback = p.tabs.value.right;
    p.loaded.value++;
    await nextTick();
    p.novel.value = true;
    await nextTick();
    expect(p.tabs.value.right).toBe(fallback);
  });

  test('a plain Markdown document loaded drops them, and they never come back', async () => {
    const p = panes();
    p.novel.value = false;
    p.loaded.value++;
    await nextTick();
    expect(p.tabs.value.right).not.toBe('outline');
    p.novel.value = true;
    await nextTick();
    expect(p.tabs.value.right).not.toBe('outline');
  });

  test('a script has them all; plain Markdown never has Notes or Scaffold', async () => {
    const p = panes('notes', 'scaffold');
    // A novel has no Notes or Scaffold either.
    expect(p.tabs.value.right).not.toBe('notes');
    expect(p.phoneTab.value).toBe('source');
    p.kind.value = 'fountain';
    p.tabs.value = { left: 'source', right: 'scaffold' };
    await nextTick();
    expect(p.tabs.value.right).toBe('scaffold');
  });
});
