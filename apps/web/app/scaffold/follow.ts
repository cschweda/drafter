import { effectScope, type ShallowRef, shallowRef, type WatchSource, watch } from 'vue';
import { useCast } from '../cast/use-cast';
import { useLayout } from '../editor/layout';
import { useOutline } from '../outline/use-outline';
import { currentBlocks } from '../strip/use-strip';

// Scaffold's scene page follows the cursor's scene (seeing-the-script design §5.2, Call 25): it
// reads the cursor's scene again FOLLOW_REST_MS after the cursor last moved to another block or
// the cast was last worked out, and then only looks it up. It moves no focus and says nothing, so
// the heading changes quietly while the writer types; a screen-reader user reads it on turning to it.

/** How long the cursor rests before the scene page follows it. */
export const FOLLOW_REST_MS = 150;

/** The mark a follow leaves in the page's performance timeline, which the e2e budget reads. */
export const FOLLOW_MARK = 'drafter-scaffold-follow';

export interface Resting<T> {
  /** `read()` as of the last rest. */
  value: Readonly<ShallowRef<T>>;
  /** Stops watching; the value stays as it is. */
  stop(): void;
}

/**
 * `read()` now, and again `ms` after `source` last changed: each change starts the wait again, so
 * a run of changes reads once, at its end.
 */
export function restingValue<T>(
  source: WatchSource<unknown>,
  read: () => T,
  ms = FOLLOW_REST_MS,
): Resting<T> {
  const value = shallowRef(read());
  let timer: ReturnType<typeof setTimeout> | undefined;
  const scope = effectScope(true);
  scope.run(() => {
    watch(source, () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        // One mark at a time, so a long visit doesn't keep a mark for every rest.
        performance.clearMarks?.(FOLLOW_MARK);
        performance.mark?.(FOLLOW_MARK);
        value.value = read();
      }, ms);
    });
  });
  return {
    value,
    stop() {
      clearTimeout(timer);
      scope.stop();
    },
  };
}

export interface HeldResting<T> {
  /** `read()` as of the last rest while held; as it was when let go, after. */
  value: Readonly<ShallowRef<T>>;
  /** A view needs it: it is read at once and follows; the returned function lets go (once). */
  hold(): () => void;
}

/**
 * `restingValue` only while something holds it: with no holder nothing is watched or timed, and
 * the first hold reads it again at once.
 */
export function heldResting<T>(
  source: WatchSource<unknown>,
  read: () => T,
  ms = FOLLOW_REST_MS,
): HeldResting<T> {
  const value = shallowRef(read());
  let holders = 0;
  let live: { resting: Resting<T>; scope: ReturnType<typeof effectScope> } | undefined;
  return {
    value,
    hold() {
      holders++;
      if (holders === 1) {
        const scope = effectScope(true);
        const resting = scope.run(() => {
          const made = restingValue(source, read, ms);
          value.value = made.value.value;
          watch(
            made.value,
            (next) => {
              value.value = next;
            },
            { flush: 'sync' },
          );
          return made;
        }) as Resting<T>;
        live = { resting, scope };
      }
      let held = true;
      return () => {
        if (!held) return;
        held = false;
        holders--;
        if (holders === 0) {
          live?.resting.stop();
          live?.scope.stop();
          live = undefined;
        }
      };
    },
  };
}

let followed: HeldResting<string | null> | undefined;

/** The followed scene, made on first use in the browser and kept for the visit. */
function follower(): HeldResting<string | null> {
  if (!followed) {
    const { cursorBlock } = useLayout();
    const { basis } = useCast();
    const outline = useOutline();
    followed = heldResting(
      () => [cursorBlock.value, basis.value],
      () => {
        const index = outline.index.value;
        const block = currentBlocks(index, cursorBlock.value)[0];
        const scene = block === undefined ? undefined : index.scenes.find((s) => s.block === block);
        return scene ? outline.idOf(scene) : null;
      },
    );
  }
  return followed;
}

/**
 * The id of the cursor's scene, as of the cursor's last rest (null before the first scene): the
 * last scene starting at or before the cursor's block, from the Outline's index. It follows only
 * while a Scaffold view holds it (`holdFollow`), so a closed Scaffold costs nothing as you type.
 */
export function useFollowedScene(): Readonly<ShallowRef<string | null>> {
  return follower().value;
}

/** A Scaffold view is shown: the scene follows the cursor until the returned function lets go. */
export function holdFollow(): () => void {
  return follower().hold();
}
