import type { DropdownMenuItem } from '@nuxt/ui';
import type { Ref } from 'vue';
import { formatKeys, isApple } from '~/commands/keys';
import { type Command, useCommands } from '~/commands/registry';
import { useEditor } from '~/editor/session';

/**
 * A top-bar menu whose items run registered commands (`commands/builtin.ts`): the Drafter menu and
 * the Help menu. So a menu, the palette, and the keys never disagree, and an item whose command is
 * off shows disabled, with the reason. `trigger` is the menu's button.
 *
 * Choosing an item runs a command that may move focus itself (a dialog, a new script). The menu
 * holds focus until it has closed, so a command's own focus is lost to it; then the menu doesn't
 * hand focus back to the button, and if nothing else has it, a command that shows a script puts it
 * in the editor and any other gives it to the button. Escape, or leaving the menu, returns it to the
 * button as usual.
 */
export function useCommandMenu(trigger: Ref<HTMLElement | null>) {
  const commands = useCommands();
  const editor = useEditor();
  const apple = isApple();

  let chosen = false;
  let toEditor = false;
  /**
   * Where the chosen command put focus (Show stats, a section's heading), before the menu, which
   * can take it back when the pointer leaves its item, closed: it gets it back then.
   */
  let placed: HTMLElement | null = null;
  function onFocusWhileChosen(event: FocusEvent) {
    const target = event.target as HTMLElement | null;
    if (!target || target === trigger.value || target.closest('[data-reka-menu-content]')) return;
    placed = target;
  }

  /** Notes that an item was chosen; `shows` is for a command that shows a script. */
  function choose(shows: boolean) {
    chosen = true;
    toEditor = shows;
    placed = null;
    document.addEventListener('focusin', onFocusWhileChosen, true);
  }

  /**
   * The item for a command. A missing command leaves no item (a hot reload may not have it yet).
   * `shows` is for the commands that show a script: the editor gets focus afterward, not the button.
   */
  function entry(id: string, icon: string, shows = false): DropdownMenuItem[] {
    const command: Command | undefined = commands.value.find((c) => c.id === id);
    if (!command) return [];
    const off = command.enabled ? !command.enabled() : false;
    const why = off ? command.why?.() : undefined;
    return [
      {
        label: command.title,
        icon,
        ...(why && { description: why }),
        ...(command.keys && { kbds: [formatKeys(command.keys, apple)] }),
        disabled: off,
        onSelect: () => {
          choose(shows);
          command.run();
        },
      },
    ];
  }

  function onCloseAutoFocus(event: Event) {
    if (!chosen) return;
    chosen = false;
    event.preventDefault();
    requestAnimationFrame(() => {
      document.removeEventListener('focusin', onFocusWhileChosen, true);
      const active = document.activeElement;
      const lost =
        !active ||
        active === document.body ||
        active === trigger.value ||
        !!active.closest('[data-reka-menu-content]');
      const target = placed;
      placed = null;
      if (target?.isConnected && lost) {
        target.focus();
        return;
      }
      if (active && active !== document.body) return;
      if (toEditor) editor.goto(editor.view.state.selection.main.head);
      else trigger.value?.focus();
    });
  }

  onBeforeUnmount(() => document.removeEventListener('focusin', onFocusWhileChosen, true));

  return { entry, choose, onCloseAutoFocus };
}
