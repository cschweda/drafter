import { type Ref, shallowRef } from 'vue';
import { isApple, matchesKey } from './keys';

export type CommandGroup = 'File' | 'Edit' | 'View' | 'Go' | 'Help';

export interface Command {
  id: string;
  title: string;
  group: CommandGroup;
  /** In CodeMirror's notation, such as `Mod-k` or `Mod-Alt-1`; the palette and the shortcuts page format it. */
  keys?: string;
  run(): void;
  /** Commands that don't apply yet are hidden from the palette. */
  enabled?(): boolean;
  /**
   * The registry binds `keys` on the whole page (File commands, the palette), in the capture
   * phase, so the browser's own action never happens. Without it the keys belong to the editor's
   * keymap, which already has them; the registry only lists them.
   */
  global?: boolean;
}

const commands = shallowRef<readonly Command[]>([]);

/** Adds commands. A list with an id that is already taken, or twice, adds none. */
export function registerCommands(list: readonly Command[]): void {
  const taken = new Set(commands.value.map((c) => c.id));
  for (const { id } of list) {
    if (taken.has(id)) throw new Error(`There is already a command with the id “${id}”.`);
    taken.add(id);
  }
  commands.value = [...commands.value, ...list];
}

/** Every registered command, in the order they were registered. */
export function useCommands(): Readonly<Ref<readonly Command[]>> {
  return commands;
}

/** Forgets every command. For tests, and for a hot reload that registers them again. */
export function clearCommands(): void {
  commands.value = [];
}

/**
 * Binds the `global` commands' keys on the window, in the capture phase: it sees a key before
 * anything in the page does, and stops it there, so each key has one handler and nothing runs
 * twice. The key is the command's even while the command is off (the browser's Save Page never
 * opens), and a held key runs it once. Returns the function that removes it.
 */
export function installGlobalKeys(apple: boolean = isApple()): () => void {
  const onKeydown = (event: KeyboardEvent) => {
    const found = commands.value.find(
      (c) => c.global && c.keys && matchesKey(event, c.keys, apple),
    );
    if (!found) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    if (found.enabled && !found.enabled()) return;
    found.run();
  };
  window.addEventListener('keydown', onKeydown, true);
  return () => window.removeEventListener('keydown', onKeydown, true);
}
