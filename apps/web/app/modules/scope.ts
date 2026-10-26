import type { Text } from '@codemirror/state';

/** What a module's run asks about the world it is running in. */
export interface World {
  /** Bumped when another script is opened. */
  generation(): number;
  /** Bumped when the module is turned off. */
  epoch(): number;
  /** Whether the module is on now. */
  on(): boolean;
  /** The script's text now (immutable: a different value after any edit). */
  doc(): Text;
}

/**
 * The world a run started in, to be asked later whether it still may act. A run can outlive its
 * script (the writer opened another) and its switch (the module was turned off), and can wait while
 * the writer types; what it then does would land in the wrong place.
 * - `live()`: the same script, and the module has been on throughout. Reporting problems needs it.
 * - `mayChange()`: `live()`, and with `checkText` the text is as the run last saw it (at its start,
 *   or after its own last change, which it tells with `changed()`). A tab's or settings' view of
 *   the script has no start to compare with, so it doesn't check the text.
 */
export function runScope(world: World, options: { checkText: boolean }) {
  const generation = world.generation();
  const epoch = world.epoch();
  let seen: Text | undefined = options.checkText ? world.doc() : undefined;
  const live = () => world.generation() === generation && world.epoch() === epoch && world.on();
  return {
    live,
    mayChange: () => live() && (seen === undefined || world.doc().eq(seen)),
    /** The run made its own change: the text it saw is now this. */
    changed: () => {
      if (seen !== undefined) seen = world.doc();
    },
  };
}
