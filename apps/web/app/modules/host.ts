import { type ComputedRef, computed, watch } from 'vue';
import { usePanes } from '~/composables/usePanes';
import { type Command, registerCommands, unregisterCommands } from '../commands/registry';
import { desktop } from '../desktop';
import { useEditor } from '../editor/session';
import { dropTab, PHONE_DEFAULT_TAB } from '../utils/panes';
import { contextFor, moduleTurnedOff, runContextFor, scriptChanged } from './context';
import { loadFolderModules, syncFolderNetwork } from './folder';
import { clearAllModuleProblems, clearModuleProblems, mapModuleProblems } from './problems';
import {
  allModules,
  BUILT_IN_IDS,
  loadEnabled,
  modulesToChange,
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
    // Each run is made afresh, with a context of its own that knows which script and text it began with.
    run: () =>
      void runModuleAction(module.name, () => {
        const fresh = module.commands?.(runContextFor(module)).find((c) => c.id === command.id);
        return (fresh ?? command).run();
      }),
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
  /** The module object each module on was turned on as (a folder module's changes when it loads). */
  const objects = new Map<string, ScriptModule>();

  function turnOn(module: ScriptModule) {
    objects.set(module.id, module);
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
    objects.delete(module.id);
    moduleTurnedOff(module.id);
    clearModuleProblems(module.id);
    if (module.tab) {
      const tab = moduleTabId(module.id, module.tab.id);
      panes.tabs.value = dropTab(panes.tabs.value, tab);
      if (panes.phoneTab.value === tab) panes.phoneTab.value = PHONE_DEFAULT_TAB;
    }
  }

  const stop = watch(
    [enabled, allModules],
    ([ids, modules]) => {
      const { turnOn: up, turnOff: down, refresh } = modulesToChange(modules, ids, objects);
      for (const module of down) turnOff(module);
      for (const module of up) turnOn(module);
      // Its commands again, from the parts it now has; its problems and tab stay.
      for (const module of refresh) {
        unregisterCommands(on.get(module.id) ?? []);
        turnOn(module);
      }
    },
    { immediate: true },
  );
  // The desktop app's modules folder: read once, and kept told what each module may reach.
  const bridge = desktop()?.modules;
  void loadFolderModules(bridge, BUILT_IN_IDS);
  const stopNetwork = bridge ? syncFolderNetwork(enabled, bridge) : () => {};
  const forget = editor.onChange((changes) => {
    if (changes) mapModuleProblems(changes);
    else {
      scriptChanged();
      clearAllModuleProblems();
    }
  });
  void loadEnabled();
  return () => {
    stop();
    stopNetwork();
    forget();
    for (const ids of on.values()) unregisterCommands(ids);
    on.clear();
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
    allModules.value.flatMap((module) =>
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
  return computed(() => allModules.value.filter((m) => m.action && enabled.value.includes(m.id)));
}
