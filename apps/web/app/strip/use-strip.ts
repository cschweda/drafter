import {
  linesPerPage,
  type Scene,
  type SceneIndex,
  type Strip,
  structureStrip,
} from '@drafter/outline';
import { type ComputedRef, computed, effectScope, type ShallowRef, shallowRef, watch } from 'vue';
import { useLayout } from '../editor/layout';
import { useEditor } from '../editor/session';
import { sayOutline } from '../outline/notice';
import { useOutline } from '../outline/use-outline';
import { GONE } from './labels';

// The Structure strip's session (structure strip design §3.2, §4): the strip of the Outline's
// scene index, kept while the layout catches up, each block's session id, the blocks holding the
// cursor, and going to a block. Shared by the strip and, later, its keys.

export interface StripView {
  strip: Strip;
  /** Block → session id, taken with the strip, so a kept strip still finds its scenes. */
  ids: ReadonlyMap<number, string>;
}

/**
 * The view to draw: `next`, unless it is by words while `last` is by pages and the layout hasn't
 * failed, which is the moment between an edit and its layout: then `last`, so the strip neither
 * empties nor jumps (Call 6).
 */
export function nextView(
  last: StripView | null,
  next: StripView,
  layoutFailed: boolean,
): StripView {
  if (last && last.strip.unit === 'pages' && next.strip.unit === 'words' && !layoutFailed) {
    return last;
  }
  return next;
}

/**
 * The cursor's scene (the last one starting at or before `cursorBlock`) and the sections it sits
 * in, outermost first, as block indexes; [] before the first scene.
 */
export function currentBlocks(index: SceneIndex, cursorBlock: number): number[] {
  let lo = 0;
  let hi = index.scenes.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((index.scenes[mid] as Scene).block <= cursorBlock) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  const scene = index.scenes[found];
  return scene ? [scene.block, ...scene.sections] : [];
}

export interface StripSession {
  /** Null after a load until the next index. */
  view: Readonly<ShallowRef<StripView | null>>;
  /** The ids of `currentBlocks`, from the live index. */
  current: Readonly<ComputedRef<ReadonlySet<string>>>;
  /** Goes to the item as the Outline does; says so and returns false when it is gone. */
  go(id: string): boolean;
}

let session: StripSession | undefined;

function create(): StripSession {
  const editor = useEditor();
  const { layout, failed, cursorBlock } = useLayout();
  const outline = useOutline();
  return effectScope(true).run(() => {
    const view = shallowRef<StripView | null>(null);
    const built = computed<StripView>(() => {
      const index = outline.index.value;
      return {
        strip: structureStrip(index, linesPerPage(layout.value)),
        ids: new Map(index.items.map((item) => [item.block, outline.idOf(item)])),
      };
    });
    watch(
      [built, failed],
      ([next, layoutFailed]) => {
        view.value = nextView(view.value, next, layoutFailed);
      },
      { immediate: true },
    );
    // A load is another script: nothing of the last one's strip is kept.
    editor.onChange((changes) => {
      if (changes === null) view.value = null;
    });

    const current = computed<ReadonlySet<string>>(() => {
      const index = outline.index.value;
      const ids = new Set<string>();
      for (const block of currentBlocks(index, cursorBlock.value)) {
        const item = index.items.find((it) => it.block === block);
        if (item) ids.add(outline.idOf(item));
      }
      return ids;
    });

    const go = (id: string): boolean => {
      const item = outline.itemById(id);
      if (!item) {
        void sayOutline(GONE);
        return false;
      }
      editor.goto(item.span.from);
      return true;
    };

    return { view, current, go } satisfies StripSession;
  }) as StripSession;
}

/** The strip's session, made on first use in the browser and kept for the visit. */
export function useStrip(): StripSession {
  session ??= create();
  return session;
}
