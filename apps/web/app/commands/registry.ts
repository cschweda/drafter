import { type Ref, shallowRef } from 'vue';
import { isApple, matchesKey } from './keys';

export type CommandGroup = 'File' | 'Edit' | 'View' | 'Go' | 'Help';

export interface Command {
  id: string;
  title: string;
  /** One of the five groups, or (for a script module's command) the module's name. */
  group: CommandGroup | string;
  /** An `i-lucide-*` name the palette draws instead of its group's icon. */
  icon?: string;
  /** In CodeMirror's notation, such as `Mod-k` or `Mod-Alt-1`; the palette and the shortcuts page format it. */
  keys?: string;
  run(): void | Promise<void>;
  /** Commands that don't apply yet are hidden from the palette. */
  enabled?(): boolean;
  /** Why the command is off, when that isn't obvious. Menus that list a disabled command show it; the palette hides the command. */
  why?(): string | undefined;
  /**
   * The registry binds `keys` on the whole page (File commands, the palette), in the capture
   * phase, so the browser's own action never happens. Without it the keys belong to the editor's
   * keymap, which already has them; the registry only lists them.
   */
  global?: boolean;
  /** More words the palette's search finds it by, beside its title. */
  keywords?: readonly string[];
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

/** Takes commands away by id (a module turned off); an id that isn't registered is ignored. */
export function unregisterCommands(ids: readonly string[]): void {
  const gone = new Set(ids);
  commands.value = commands.value.filter((c) => !gone.has(c.id));
}

/** Every registered command, in the order they were registered. */
export function useCommands(): Readonly<Ref<readonly Command[]>> {
  return commands;
}

/** The command with this id, if one is registered. */
export function commandById(id: string): Command | undefined {
  return commands.value.find((c) => c.id === id);
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
