import { type ComputedRef, computed, watch } from 'vue';
import { usePanes } from '~/composables/usePanes';
import { type Command, registerCommands, unregisterCommands } from '../commands/registry';
import { useEditor } from '../editor/session';
import { dropTab, PHONE_DEFAULT_TAB } from '../utils/panes';
import { contextFor } from './context';
import { clearAllModuleProblems, clearModuleProblems, mapModuleProblems } from './problems';
import {
  loadEnabled,
  MODULES,
  moduleTabId,
  reportModuleFailure,
  runModuleAction,
  useModules,
} from './registry';
import type { ModuleContext, ScriptModule } from './types';

// What turning a module on and off does to the rest of the app: the commands and the problems come
// and go here; the button and the tab are computed from which modules are on.

/** A module's command as the palette lists it: under the module's name, with its icon and no keys of its own. */
function commandOf(module: ScriptModule, command: Command): Command {
  const enabled = command.enabled;
  return {
    id: `module:${module.id}:${command.id}`,
    title: command.title,
    group: module.name,
    icon: module.icon,
    // A module can't bind keys: the registry would bind them for the whole page.
    run: () => void runModuleAction(module.name, () => command.run()),
    ...(enabled && {
      enabled: () => {
        try {
          return enabled();
        } catch {
          return false;
        }
      },
    }),
  };
}

/**
 * Keeps the app in step with which modules are on: a module's commands are in the palette while it
 * is on; turning it off takes them out, clears its problems, and closes its tab where it was open.
 * Module problems follow the text through edits and go when another script opens. Returns a
 * function that stops it.
 */
export function startModules(): () => void {
  const { enabled } = useModules();
  const editor = useEditor();
  const panes = usePanes();
  /** The ids of the commands each module on has registered. */
  const on = new Map<string, string[]>();

  function turnOn(module: ScriptModule) {
    let ids: string[] = [];
    try {
      const commands = (module.commands?.(contextFor(module)) ?? []).map((c) =>
        commandOf(module, c),
      );
      registerCommands(commands);
      ids = commands.map((c) => c.id);
    } catch (error) {
      // A module whose commands throw, or repeat an id, still has its button and tab.
      reportModuleFailure(module.name, error);
    }
    on.set(module.id, ids);
  }

  function turnOff(module: ScriptModule) {
    unregisterCommands(on.get(module.id) ?? []);
    on.delete(module.id);
    clearModuleProblems(module.id);
    if (module.tab) {
      const tab = moduleTabId(module.id, module.tab.id);
      panes.tabs.value = dropTab(panes.tabs.value, tab);
      if (panes.phoneTab.value === tab) panes.phoneTab.value = PHONE_DEFAULT_TAB;
    }
  }

  const stop = watch(
    enabled,
    (ids) => {
      for (const module of MODULES) {
        const wanted = ids.includes(module.id);
        if (wanted && !on.has(module.id)) turnOn(module);
        else if (!wanted && on.has(module.id)) turnOff(module);
      }
    },
    { immediate: true },
  );
  const forget = editor.onChange((changes) => {
    if (changes) mapModuleProblems(changes);
    else clearAllModuleProblems();
  });
  void loadEnabled();
  return () => {
    stop();
    forget();
  };
}

export interface ModuleTab {
  /** The tab's id among all the tabs (`moduleTabId`). */
  id: string;
  label: string;
  module: ScriptModule;
  context: ModuleContext;
}

/** The tabs of the modules that are on, in module order. */
export function useModuleTabs(): ComputedRef<ModuleTab[]> {
  const { enabled } = useModules();
  return computed(() =>
    MODULES.flatMap((module) =>
      module.tab && enabled.value.includes(module.id)
        ? [
            {
              id: moduleTabId(module.id, module.tab.id),
              label: module.tab.label,
              module,
              context: contextFor(module),
            },
          ]
        : [],
    ),
  );
}

/** The modules that are on and have a button, in module order. */
export function useModuleButtons(): ComputedRef<ScriptModule[]> {
  const { enabled } = useModules();
  return computed(() => MODULES.filter((m) => m.action && enabled.value.includes(m.id)));
}
