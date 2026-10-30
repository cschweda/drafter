import type { Scene } from '@drafter/outline';
import {
  type ComputedRef,
  computed,
  effectScope,
  type Ref,
  ref,
  type ShallowRef,
  shallowRef,
  watch,
} from 'vue';
import { useOutline } from '../outline/use-outline';
import { useFollowedScene } from './follow';

// Scaffold's session (seeing-the-script design §5.1, §5.2): one tab with four kinds of page, a
// Back list inside the tab, and Follow the cursor. The scene page shows the cursor's scene while
// following; opening a scene's page from elsewhere pins it and turns following off, and turning
// following off keeps the scene shown. Following is on at every visit and kept nowhere (Call 26).

export type ScaffoldPage =
  | { kind: 'scene'; pinned: string | null }
  | { kind: 'character'; key: string }
  | { kind: 'location'; key: string }
  | { kind: 'cast' }
  | { kind: 'places' };

export interface ScaffoldSession {
  page: Ref<ScaffoldPage>;
  /** Follow the cursor: on, the scene page is the cursor's scene; off, it keeps its own. */
  follow: Ref<boolean>;
  /** Shows `page`, the one before it going on the Back list. */
  open(page: ScaffoldPage): void;
  /** The page before; false when there is none. */
  back(): boolean;
  canGoBack: ComputedRef<boolean>;
  /** The scene page's scene, from the Outline's index; null on another page or before the first scene. */
  sceneShown: ComputedRef<Scene | null>;
}

export interface ScaffoldSources {
  /** The id of the cursor's scene, as of its last rest; null before the first scene. */
  followed: Readonly<Ref<string | null>>;
  /** A scene by its id, now; null when it is gone. */
  sceneById(id: string): Scene | null;
}

/** The most pages Back keeps; the oldest goes first. */
export const BACK_LIMIT = 50;

const samePage = (a: ScaffoldPage, b: ScaffoldPage) => JSON.stringify(a) === JSON.stringify(b);

/** A session over `sources`: `useScaffold` gives the app's, and tests give their own. */
export function createScaffold(sources: ScaffoldSources): ScaffoldSession {
  const page: ShallowRef<ScaffoldPage> = shallowRef({ kind: 'scene', pinned: null });
  const follow = ref(true);
  const history = shallowRef<ScaffoldPage[]>([]);
  return effectScope(true).run(() => {
    // Off, the scene page keeps the scene it shows; on, it shows the cursor's again. Before the
    // first scene there is nothing to keep, so following stays on (off, the page would be stuck
    // with no scene).
    watch(
      follow,
      (on) => {
        const now = page.value;
        if (now.kind !== 'scene') return;
        if (on && now.pinned !== null) page.value = { kind: 'scene', pinned: null };
        if (!on && now.pinned === null) {
          const shown = sources.followed.value;
          if (shown === null) follow.value = true;
          else page.value = { kind: 'scene', pinned: shown };
        }
      },
      { flush: 'sync' },
    );
    const open = (next: ScaffoldPage) => {
      if (samePage(next, page.value)) {
        // Show Scaffold on the scene page it already shows: following, whatever it was.
        if (next.kind === 'scene') follow.value = next.pinned === null;
        return;
      }
      // The first page opened (Show Scaffold's return to following, a pinned scene) goes on the
      // list too, so Back returns to the page shown before it.
      history.value = [...history.value, page.value].slice(-BACK_LIMIT);
      page.value = next;
      // A scene opened from the Outline, the Cards, the strip, or the grid stays put.
      if (next.kind === 'scene') follow.value = next.pinned === null;
    };
    const back = () => {
      const previous = history.value.at(-1);
      if (!previous) return false;
      history.value = history.value.slice(0, -1);
      page.value = previous;
      if (previous.kind === 'scene') follow.value = previous.pinned === null;
      return true;
    };
    const sceneShown = computed(() => {
      const now = page.value;
      if (now.kind !== 'scene') return null;
      const id = follow.value ? sources.followed.value : now.pinned;
      return id === null ? null : sources.sceneById(id);
    });
    return {
      page,
      follow,
      open,
      back,
      canGoBack: computed(() => history.value.length > 0),
      sceneShown,
    } satisfies ScaffoldSession;
  }) as ScaffoldSession;
}

let session: ScaffoldSession | undefined;

/** Scaffold's session: made on first use in the browser, kept for the visit, following at first. */
export function useScaffold(): ScaffoldSession {
  if (!session) {
    const outline = useOutline();
    session = createScaffold({
      followed: useFollowedScene(),
      sceneById: (id) => {
        const item = outline.itemById(id);
        return item?.kind === 'scene' ? item : null;
      },
    });
  }
  return session;
}
