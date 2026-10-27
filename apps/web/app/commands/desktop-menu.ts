// The desktop app's menu bar (docs/drafter-desktop-design.md §4), seen from the page. The main
// process builds the menu from the commands sent here, so the menu, the palette, and the Keyboard
// shortcuts page are one list; choosing a menu item sends back a command id, and the registered
// command runs (the same `run` the palette and the keys call). Nothing is decided in the menu.
//
// Script modules' commands (`commands/registry.ts`, registered while a module is on) are not in the
// menu for now: their group is the module's name, not one of the five menus. The palette has them.
import { watch } from 'vue';
import { type DesktopMenuCommand, desktop } from '~/desktop';
import { COMMAND_DATA } from './data';
import { type Command, commandById, useCommands } from './registry';

/** The menus the desktop app has. */
const MENUS: readonly string[] = ['File', 'Edit', 'View', 'Go', 'Help'];
/** The commands that are Drafter's own, which the menu lists. */
const BUILT_IN: ReadonlySet<string> = new Set(COMMAND_DATA.map((c) => c.id));

/** How long the page waits after a change before telling the menu (one message for a burst). */
const DEBOUNCE_MS = 100;
/**
 * How often it looks for a change that nothing reactive shows: whether a command applies can
 * depend on the editor's state or an open dialog, which Vue doesn't watch.
 */
const LOOK_MS = 500;

/** Whether a command applies now; one that can't say counts as off. */
function applies(command: Command): boolean {
  try {
    return command.enabled ? command.enabled() : true;
  } catch {
    return false;
  }
}

/** The built-in commands, as the menu needs them, each with whether it applies right now. */
export function menuCommands(commands: readonly Command[]): DesktopMenuCommand[] {
  return commands
    .filter((c) => BUILT_IN.has(c.id) && MENUS.includes(c.group))
    .map((c) => ({
      id: c.id,
      title: c.title,
      group: c.group,
      ...(c.keys && { keys: [c.keys] }),
      enabled: applies(c),
    }));
}

/** Runs the command a menu item stands for, if it is there and applies. */
function runFromMenu(id: string): void {
  const command = commandById(id);
  if (!command || !applies(command)) return;
  try {
    // A command that fails has nowhere to say so here; the palette and the keys are the same.
    void Promise.resolve(command.run()).catch(() => {});
  } catch {
    // The same.
  }
}

/**
 * Tells the desktop app's menu bar the commands, and again when what applies changes; runs the
 * command it chooses. Does nothing in a browser. Returns the function that stops it.
 */
export function installDesktopMenu(): () => void {
  const bridge = desktop();
  if (!bridge) return () => {};
  const commands = useCommands();
  let sentKey = '';
  let timer: ReturnType<typeof setTimeout> | undefined;

  const key = () => JSON.stringify(menuCommands(commands.value));
  const send = () => {
    timer = undefined;
    const list = menuCommands(commands.value);
    sentKey = JSON.stringify(list);
    bridge.menu.setCommands(list);
  };
  const schedule = () => {
    if (timer === undefined) timer = setTimeout(send, DEBOUNCE_MS);
  };

  send();
  // What Vue can see: commands added or removed, and any ref a command's `enabled` reads.
  const stopWatching = watch(key, schedule);
  // What it can't see.
  const looking = setInterval(() => {
    if (timer === undefined && key() !== sentKey) schedule();
  }, LOOK_MS);
  const stopListening = bridge.menu.onCommand(runFromMenu);

  return () => {
    stopWatching();
    clearInterval(looking);
    if (timer !== undefined) clearTimeout(timer);
    stopListening();
  };
}
