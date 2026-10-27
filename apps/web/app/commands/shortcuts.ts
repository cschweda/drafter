import type { CommandData } from './data';
import { formatKeys } from './keys';
import type { CommandGroup } from './registry';

/** The groups, in the order the Keyboard shortcuts page lists them. */
export const GROUP_ORDER: readonly CommandGroup[] = ['File', 'Edit', 'View', 'Go', 'Help'];

export interface ShortcutRow {
  title: string;
  /** The keys on a Mac, such as `⌘⇧S`. */
  mac: string;
  /** The keys on Windows, Linux, and ChromeOS, such as `Ctrl+Shift+S`. */
  other: string;
}

export interface ShortcutGroup {
  group: CommandGroup;
  /** The commands that have a shortcut. */
  keyed: ShortcutRow[];
  /** The titles of the commands that have none: the palette is how to run them. */
  unkeyed: string[];
}

/**
 * The commands, grouped for the Keyboard shortcuts page. Each key is shown in both notations, so
 * the prerendered page doesn't depend on the reader's keyboard. A group keeps its commands in the
 * order given.
 */
export function shortcutGroups(commands: readonly CommandData[]): ShortcutGroup[] {
  return GROUP_ORDER.map((group) => {
    const own = commands.filter((c) => c.group === group);
    return {
      group,
      keyed: own.flatMap((c) =>
        c.keys
          ? [{ title: c.title, mac: formatKeys(c.keys, true), other: formatKeys(c.keys, false) }]
          : [],
      ),
      unkeyed: own.filter((c) => !c.keys).map((c) => c.title),
    };
  }).filter((g) => g.keyed.length > 0 || g.unkeyed.length > 0);
}
