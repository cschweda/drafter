import {
  type Component,
  computed,
  defineComponent,
  h,
  markRaw,
  type Ref,
  shallowRef,
  watch,
} from 'vue';
import FolderModuleFrame from '../components/FolderModuleFrame.vue';
import type { DesktopFolderModule, DesktopModulesBridge } from '../desktop';
import type { FrameChannel } from './folder-channel';
import type { Parts, Surface } from './folder-protocol';
import { reconcileFolderConsent } from './registry';
import type { ModuleContext, ScriptModule } from './types';

// The desktop app's modules folder (docs/plans/2026-10-27-desktop-modules-folder.md): each module
// there becomes an ordinary `ScriptModule`, so the host, the toolbar, the panes, and Settings treat
// it as they treat a compiled-in one. Its parts are stand-ins: its button and commands run in its
// hidden frame (the "runner"), and its tab and settings are frames of their own. Nothing here runs
// in drafter.dev, which has no desktop bridge and so no folder modules.

/** A folder module can't bring an icon (icons are bundled when the app is built): each has this. */
export const FOLDER_ICON = 'i-lucide-puzzle';

/**
 * A folder module's id in the app: its own id under `folder.`. A built-in module's id has no dot,
 * so the two can never meet: a folder module never shares a built-in's switch, its consent to the
 * network, its storage rows (`module:folder.<id>:…`), its tab, or its commands.
 */
export const FOLDER_PREFIX = 'folder.';
export const appIdOf = (id: string) => `${FOLDER_PREFIX}${id}`;
/** The module's own id (its origin's host) from its id in the app. */
export const folderIdOf = (appId: string) =>
  appId.startsWith(FOLDER_PREFIX) ? appId.slice(FOLDER_PREFIX.length) : appId;

/** The fingerprint of the loaded folder module with this app id (`folder.<id>`), or undefined. */
export function folderFingerprint(appId: string): string | undefined {
  return infos.value.find((info) => appIdOf(info.id) === appId)?.fingerprint;
}

const infos = shallowRef<readonly DesktopFolderModule[]>([]);
/** What the desktop app skipped when it read the folder, one sentence each. */
export const folderProblems = shallowRef<readonly string[]>([]);
const partsById = shallowRef<ReadonlyMap<string, Parts>>(new Map());
/** Why a module that is on couldn't start, by id: shown in Settings. */
export const folderFailures = shallowRef<ReadonlyMap<string, string>>(new Map());
/** The modules whose network origins the desktop app has been told: their frames may load. */
export const folderNetworkReady = shallowRef<ReadonlySet<string>>(new Set());
/** The hidden frame of each module that is on and loaded. */
const runners = new Map<string, FrameChannel>();

/**
 * Sets the folder's modules and what was skipped (once, from the desktop app; tests set their own).
 * One that takes a built-in module's id (`builtIn`) is skipped here, the one place the list comes
 * in, so nothing (its frames, the network, Settings) ever sees it; the desktop app refuses such a
 * module too.
 */
export function setFolderInfos(
  modules: readonly DesktopFolderModule[],
  problems: readonly string[],
  builtIn: readonly string[] = [],
): void {
  infos.value = modules.filter((m) => !builtIn.includes(m.id));
  folderProblems.value = [
    ...problems,
    ...modules
      .filter((m) => builtIn.includes(m.id))
      .map(
        (m) =>
          `Drafter skipped the folder “${m.folder.replace(/\p{Cc}/gu, '?')}”: it uses the id “${m.id}”, which a module built into Drafter has.`,
      ),
  ];
  partsById.value = new Map();
  folderFailures.value = new Map();
}

/** The module has loaded in its frame and offers these parts. */
export function setFolderParts(id: string, parts: Parts): void {
  partsById.value = new Map(partsById.value).set(id, parts);
  setFolderFailure(id, undefined);
}

/** The module couldn't start (`why`), or (undefined) it did. */
export function setFolderFailure(id: string, why: string | undefined): void {
  const next = new Map(folderFailures.value);
  if (why === undefined) next.delete(id);
  else next.set(id, why);
  folderFailures.value = next;
}

/** The module's hidden frame, which runs its button and commands. Returns the function that forgets it. */
export function registerRunner(id: string, channel: FrameChannel): () => void {
  runners.set(id, channel);
  return () => {
    if (runners.get(id) === channel) runners.delete(id);
  };
}

function runInFrame(
  id: string,
  what: 'action' | 'command',
  context: ModuleContext,
  command?: string,
): Promise<void> {
  const runner = runners.get(id);
  if (!runner) return Promise.reject(new Error('it hasn’t started yet'));
  return runner.run(what, context, command);
}

/** A tab or settings: a frame on the module's origin, drawn with the context it is given. */
const surfaces = new Map<string, Component>();
function surfaceOf(info: DesktopFolderModule, surface: Surface): Component {
  const key = `${info.id}:${surface}`;
  let made = surfaces.get(key);
  if (!made) {
    made = markRaw(
      defineComponent({
        name: 'FolderModuleSurface',
        props: { context: { type: Object, required: true } },
        setup: (props) => () =>
          h(FolderModuleFrame, {
            moduleId: info.id,
            name: info.name,
            surface,
            context: props.context as ModuleContext,
          }),
      }),
    );
    surfaces.set(key, made);
  }
  return made;
}

/** The `ScriptModule` that stands for a folder module: who it is, and (once loaded) its parts. */
export function folderModuleOf(info: DesktopFolderModule, parts: Parts | undefined): ScriptModule {
  const module: ScriptModule = {
    id: appIdOf(info.id),
    name: info.name,
    description: info.description,
    icon: FOLDER_ICON,
    permissions: { network: [...info.permissions.network] },
  };
  if (!parts) return module;
  if (parts.action) {
    module.action = { label: parts.action.label, run: (ctx) => runInFrame(info.id, 'action', ctx) };
  }
  if (parts.tab) {
    module.tab = { id: parts.tab.id, label: parts.tab.label, component: surfaceOf(info, 'tab') };
  }
  if (parts.commands.length > 0) {
    const list = parts.commands;
    // Called afresh for each run, with that run's context (host.ts).
    module.commands = (ctx) =>
      list.map((command) => ({
        id: command.id,
        title: command.title,
        group: info.name,
        run: () => runInFrame(info.id, 'command', ctx, command.id),
      }));
  }
  if (parts.settings) module.settings = surfaceOf(info, 'settings');
  return module;
}

/** One object per module and parts, so what watches the list sees a change only when there is one. */
const made = new Map<
  string,
  { info: DesktopFolderModule; parts: Parts | undefined; module: ScriptModule }
>();

/** The folder's modules, as `ScriptModule`s. Empty in a browser. */
export const folderModules = computed<readonly ScriptModule[]>(() =>
  infos.value.map((info) => {
    const parts = partsById.value.get(info.id);
    const known = made.get(info.id);
    if (known && known.info === info && known.parts === parts) return known.module;
    const module = folderModuleOf(info, parts);
    made.set(info.id, { info, parts, module });
    return module;
  }),
);

const loaded = new WeakSet<DesktopModulesBridge>();

/**
 * The modules in the desktop app's folder (`bridge`: its modules bridge; null in a browser), read
 * once: the desktop app reads the folder only when it starts.
 */
export async function loadFolderModules(
  bridge: DesktopModulesBridge | null | undefined,
  builtIn: readonly string[] = [],
): Promise<void> {
  if (!bridge || loaded.has(bridge)) return;
  loaded.add(bridge);
  try {
    const { modules, problems } = await bridge.list();
    const list = Array.isArray(modules) ? modules : [];
    // Before any folder module can turn on: drop the stored consent of one that isn't here now, or
    // that a different module has replaced (I1). Uses the kept list, built-in clashes removed.
    const kept = list.filter((m) => !builtIn.includes(m.id));
    await reconcileFolderConsent(
      kept.map((m) => ({ id: appIdOf(m.id), fingerprint: m.fingerprint })),
    );
    setFolderInfos(list, Array.isArray(problems) ? problems : [], builtIn);
  } catch {
    // No folder modules this time; the built-in ones are unaffected.
  }
}

/**
 * Keeps the desktop app told which network origins each folder module may reach: those it declares
 * while it is on (turning it on is agreeing to them), none while it is off. A module's frames load
 * only once the desktop app has been told (`folderNetworkReady`), so a frame's policy is right from
 * its first request. Returns the function that stops it.
 */
export function syncFolderNetwork(
  enabled: Readonly<Ref<readonly string[]>>,
  bridge: DesktopModulesBridge,
): () => void {
  const told = new Map<string, boolean>();
  let queue = Promise.resolve();
  const setReady = (id: string, on: boolean) => {
    const next = new Set(folderNetworkReady.value);
    if (on) next.add(id);
    else next.delete(id);
    folderNetworkReady.value = next;
  };
  return watch(
    [enabled, infos],
    ([ids, list]) => {
      for (const info of list) {
        const on = ids.includes(appIdOf(info.id));
        if ((told.get(info.id) ?? false) === on) continue;
        told.set(info.id, on);
        if (!on) setReady(info.id, false);
        // In order, so a quick off-and-on reaches the desktop app as it happened.
        queue = queue.then(async () => {
          try {
            await bridge.setNetwork(info.id, on ? info.permissions.network : []);
          } catch {
            // Its frames would be refused the network anyway: the desktop app keeps it to none.
          }
          if (on && told.get(info.id) === true) setReady(info.id, true);
        });
      }
    },
    { immediate: true },
  );
}
