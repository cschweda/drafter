import type { Lanes } from '@drafter/outline';
import { type ComputedRef, computed, onBeforeUnmount, onMounted } from 'vue';
import { useLayout } from '../editor/layout';
import { useEditor } from '../editor/session';
import { passageAt } from '../novel/focus';
import { useNovel } from '../novel/use-novel';
import { useOutline } from '../outline/use-outline';
import { currentBlocks } from '../strip/use-strip';
import { type LaneRowView, laneRowViews, type Noun } from './lane-labels';
import { useThreads } from './use-threads';

// What the three thread views share (threads design §7.3): the session, held while one is shown;
// the rows with their words; and the unit holding the cursor, outlined in every row it is in.

export interface LaneView {
  lanes: ComputedRef<Lanes | null>;
  rows: ComputedRef<LaneRowView[]>;
  noun: ComputedRef<Noun>;
  /** The id of the unit holding the cursor, or null. */
  current: ComputedRef<string | null>;
}

/** The lanes for a component: held from its mount until it goes. */
export function useLaneView(): LaneView {
  const threads = useThreads();
  const editor = useEditor();
  const outline = useOutline();
  const novel = useNovel();
  const { cursorBlock } = useLayout();
  let release: (() => void) | null = null;
  onMounted(() => {
    release = threads.hold();
  });
  onBeforeUnmount(() => {
    release?.();
    release = null;
  });

  const lanes = computed(() => threads.lanes.value);
  const noun = computed(() => threads.noun.value);
  const rows = computed(() => {
    const now = lanes.value;
    return now ? laneRowViews(now, threads.info.value, noun.value) : [];
  });

  // The cursor's block moves as the cursor does from line to line, never on each letter typed.
  const current = computed(() => {
    const block = cursorBlock.value;
    const now = lanes.value;
    if (!now) return null;
    if (noun.value === 'scene') {
      const scene = currentBlocks(outline.index.value, block)[0];
      return scene === undefined ? null : `scene:${scene}`;
    }
    const tree = novel.tree.value;
    if (!tree) return null;
    const head = editor.view.state.selection.main.head;
    const ids = new Set(now.units.map((u) => u.id));
    const section = passageAt(tree, head, 'section');
    if (section && ids.has(section.id)) return section.id;
    const chapter = passageAt(tree, head, 'chapter');
    return chapter && ids.has(chapter.id) ? chapter.id : null;
  });

  return { lanes, rows, noun, current };
}
