import { type Ref, watch } from 'vue';
import type { DocumentKind } from '../markdown/kind';
import { dropTab, type PaneTabs, PHONE_DEFAULT_TAB, type TabId } from '../utils/panes';

// A Markdown document has no scenes or notes, so no Outline, Cards, Notes, Scaffold, or Production tab (Phase 2
// design §5.7; seeing-the-script design §10): the pane showing one shows another. A novel keeps the
// Outline and Cards, its own (Novel plan, Task 5).
//
// A novel can stop being one for a moment while it is open: text typed below its comment, or the
// comment edited by hand, and it is plain Markdown until the comment is last and whole again. The
// Outline and Cards go then, and come back when it is a novel again, as long as the writer hasn't
// chosen another tab meanwhile and the same document is open. Another document loaded forgets them.

const NOT_FOR_MARKDOWN: readonly TabId[] = ['outline', 'cards', 'notes', 'scaffold', 'production'];
const NOVEL_TABS: readonly TabId[] = ['outline', 'cards'];

export interface NovelTabsOptions {
  kind: Readonly<Ref<DocumentKind>>;
  novel: Readonly<Ref<boolean>>;
  /** Counts the documents loaded (`useEditor().loaded`). */
  loaded: Readonly<Ref<number>>;
  tabs: Ref<PaneTabs>;
  phoneTab: Ref<TabId>;
}

const sameTabs = (a: PaneTabs, b: PaneTabs) => a.left === b.left && a.right === b.right;

export function keepNovelTabs({ kind, novel, loaded, tabs, phoneTab }: NovelTabsOptions): void {
  /** The novel's tabs, put away while the same document was plain Markdown for a moment. */
  let parked: {
    tabs: PaneTabs;
    phone: TabId;
    /** What the panes showed once they were put away: a change since is the writer's choice. */
    left: PaneTabs;
    phoneLeft: TabId;
  } | null = null;
  let seen = loaded.value;
  watch(
    [kind, novel, loaded],
    ([now, isNovel, doc]) => {
      const same = doc === seen;
      seen = doc;
      if (!same || now !== 'markdown') parked = null;
      if (now !== 'markdown') return;
      if (isNovel && parked) {
        if (sameTabs(tabs.value, parked.left) && phoneTab.value === parked.phoneLeft) {
          tabs.value = parked.tabs;
          phoneTab.value = parked.phone;
        }
        parked = null;
      }
      const gone = NOT_FOR_MARKDOWN.filter((tab) => !(isNovel && NOVEL_TABS.includes(tab)));
      const before = { tabs: tabs.value, phone: phoneTab.value };
      for (const tab of gone) tabs.value = dropTab(tabs.value, tab);
      if (gone.includes(phoneTab.value)) phoneTab.value = PHONE_DEFAULT_TAB;
      const dropped = !sameTabs(before.tabs, tabs.value) || before.phone !== phoneTab.value;
      const novelTab = (tab: TabId) => NOVEL_TABS.includes(tab);
      const hadNovelTab =
        novelTab(before.tabs.left) || novelTab(before.tabs.right) || novelTab(before.phone);
      // Only a novel that stopped being one, in place: never a document just loaded.
      if (!isNovel && same && dropped && hadNovelTab) {
        parked = {
          tabs: before.tabs,
          phone: before.phone,
          left: tabs.value,
          phoneLeft: phoneTab.value,
        };
      }
    },
    { immediate: true },
  );
}
