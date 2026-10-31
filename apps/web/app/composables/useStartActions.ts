import { type Command, useCommands } from '~/commands/registry';
import { DOCUMENT_TYPES } from '~/editor/template';

export interface StartAction {
  id: string;
  label: string;
  command: Command | undefined;
}

/**
 * The ways to start one's own script from a sample (Phase 1 design §4.2): the document types' New
 * commands, in order, then Open (its command is "Open…"; this says what it does). The top bar's
 * sample chip and a phone's sample bar both offer them. Each runs the command of the same name
 * (`commands/builtin.ts`), so it agrees with the menus, the palette, and the keys, and it is off
 * whenever that command is (a tab that only shows a script, a switch under way).
 */
export function useStartActions() {
  const commands = useCommands();
  const actions = computed<StartAction[]>(() => {
    const find = (id: string) => commands.value.find((c) => c.id === id);
    return [
      ...DOCUMENT_TYPES.map((type) => ({
        id: `new-${type.newKind}`,
        label: type.newTitle,
        command: find(`new-${type.newKind}`),
      })),
      { id: 'open', label: 'Open a file…', command: find('open') },
    ];
  });
  const off = (action: StartAction) => !action.command || action.command.enabled?.() === false;
  return { actions, off };
}
