import { type Ref, readonly, ref, shallowRef } from 'vue';
import { db } from '../storage/db';
import { say } from '../storage/say';
import { fixture } from './fixture';
import type { ScriptModule } from './types';

// The modules this build has, which are on, and what a module's failure looks like. Nothing here
// touches the editor, so the unit tests can load it (`host.ts` and `context.ts` hold what does).

/** Set by the build (`DRAFTER_TEST_MODULES=1`, through Vite's `define`); undefined when run without it. */
declare const __DRAFTER_TEST_MODULES__: boolean | undefined;

/** Lowercase letters and digits, joined by single hyphens: safe in a storage key, an element id, and a tab id. */
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';
const isComponent = (value: unknown) =>
  (typeof value === 'object' && value !== null) || typeof value === 'function';

/** Why `value` is not a script module, or undefined when it is one. */
export function shapeProblem(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return 'it is not an object';
  const m = value as Record<string, unknown>;
  if (typeof m.id !== 'string' || !NAME.test(m.id)) {
    return 'its id must be lowercase letters and digits, joined by single hyphens';
  }
  if (!isText(m.name)) return 'its name must be text';
  if (!isText(m.description)) return 'its description must be text';
  if (!isText(m.icon)) return 'its icon must be an i-lucide-* name';
  const permissions = m.permissions as Record<string, unknown> | null | undefined;
  if (typeof permissions !== 'object' || permissions === null)
    return 'it has no permissions object';
  const network = permissions.network;
  if (network !== undefined && !(Array.isArray(network) && network.every(isText))) {
    return 'permissions.network must be a list of origins';
  }
  const action = m.action as Record<string, unknown> | undefined;
  if (action !== undefined) {
    if (typeof action !== 'object' || action === null) return 'its action is not an object';
    if (!isText(action.label) || typeof action.run !== 'function') {
      return 'its action needs a label and a run function';
    }
  }
  const tab = m.tab as Record<string, unknown> | undefined;
  if (tab !== undefined) {
    if (typeof tab !== 'object' || tab === null) return 'its tab is not an object';
    if (
      typeof tab.id !== 'string' ||
      !NAME.test(tab.id) ||
      !isText(tab.label) ||
      !isComponent(tab.component)
    ) {
      return 'its tab needs an id, a label, and a component';
    }
  }
  if (m.commands !== undefined && typeof m.commands !== 'function') {
    return 'its commands must be a function';
  }
  if (m.settings !== undefined && !isComponent(m.settings))
    return 'its settings must be a component';
  return undefined;
}

export function isScriptModule(value: unknown): value is ScriptModule {
  return shapeProblem(value) === undefined;
}

/** `modules/<folder>` for a glob key such as `../../../../modules/<folder>/index.ts`; any other key as it is. */
function placeOf(path: string): string {
  const folder = /(?:^|\/)modules\/([^/]+)\/index\.ts$/.exec(path)?.[1];
  return folder ? `modules/${folder}` : path;
}

/**
 * The modules in `found`, a map from each module's path to what importing it gave (`{ default }`).
 * One without a default export of the right shape is skipped with a warning naming its folder.
 * Two with the same id throw, naming both folders: which one a toggle meant could not be told.
 */
export function collectModules(
  found: Record<string, unknown>,
  warn: (message: string) => void = (message) => console.warn(message),
): ScriptModule[] {
  const modules: ScriptModule[] = [];
  const places = new Map<string, string>();
  for (const [path, imported] of Object.entries(found)) {
    const place = placeOf(path);
    const value = (imported as { default?: unknown } | null)?.default;
    const problem = value === undefined ? 'it has no default export' : shapeProblem(value);
    if (problem) {
      warn(`Drafter skipped ${place}: ${problem}. See modules/README.md.`);
      continue;
    }
    const module = value as ScriptModule;
    const first = places.get(module.id);
    if (first) {
      throw new Error(`Two modules have the id “${module.id}”: ${first} and ${place}. Change one.`);
    }
    places.set(module.id, place);
    modules.push(module);
  }
  return modules;
}

/**
 * Every module in the repository's `modules/` folder when the app was built, and the fixture when
 * the build was made with `DRAFTER_TEST_MODULES=1`. The flag is a constant the build replaces, so
 * without it the fixture is dead code and is left out of the bundle.
 */
export const MODULES: readonly ScriptModule[] = collectModules({
  ...import.meta.glob('../../../../modules/*/index.ts', { eager: true }),
  ...(typeof __DRAFTER_TEST_MODULES__ !== 'undefined' && __DRAFTER_TEST_MODULES__
    ? { 'apps/web/app/modules/fixture.ts': { default: fixture } }
    : {}),
});

// ---- Toasts -------------------------------------------------------------------------------

/** What a module said with `notify`: a toast, and a live region. Empty after a few seconds. */
export const moduleNotice = ref('');
/** Why a module couldn't finish: a toast, and an alert. Empty after a few seconds. */
export const moduleError = ref('');

const TOAST_MS = 8000;

function toast(target: Ref<string>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return async (message: string) => {
    clearTimeout(timer);
    await say(target, message);
    timer = setTimeout(() => {
      target.value = '';
    }, TOAST_MS);
  };
}
export const announceNotice = toast(moduleNotice);
const announceError = toast(moduleError);

/**
 * Runs something of a module's: a button's `run`, a command, a menu item. A throw or a rejection is
 * caught and shown as a toast naming the module, so a module can't break the editor. Resolves
 * when the thing has finished, whether it worked or not; never rejects.
 */
export async function runModuleAction(name: string, act: () => unknown): Promise<void> {
  try {
    await act();
  } catch (error) {
    reportModuleFailure(name, error);
  }
}

/** Shows a toast naming the module and why, and logs the error. */
export function reportModuleFailure(name: string, error: unknown): void {
  const reason = error instanceof Error ? error.message : String(error);
  void announceError(`${name} couldn’t finish: ${reason}`);
  console.error(`${name} failed`, error);
}

// ---- Which modules are on -----------------------------------------------------------------

/** The settings row that holds the ids of the modules that are on. (A module's own rows are `module:<id>:<key>`.) */
const ENABLED_KEY = 'modules:enabled';

const enabledIds = shallowRef<readonly string[]>([]);
let loading: Promise<void> | undefined;

/** Reads which modules are on, once (or again, with `force`). Settles when done, whether or not the table could be read. */
export function loadEnabled(force = false): Promise<void> {
  if (!loading || force) {
    loading = (async () => {
      try {
        const value = (await db.settings.get(ENABLED_KEY))?.value;
        enabledIds.value = Array.isArray(value) ? value.filter(isText) : [];
      } catch {
        // Every module stays off for this visit.
      }
    })();
  }
  return loading;
}

/** Turns a module on or off and keeps the choice. If the table can't be written, it holds for this visit. */
export async function setEnabled(id: string, on: boolean): Promise<void> {
  await loadEnabled();
  const without = enabledIds.value.filter((other) => other !== id);
  enabledIds.value = on ? [...without, id] : without;
  try {
    await db.settings.put({ key: ENABLED_KEY, value: enabledIds.value });
  } catch {
    // Held for this visit.
  }
}

export function useModules(): {
  modules: readonly ScriptModule[];
  enabled: Readonly<Ref<readonly string[]>>;
  setEnabled(id: string, on: boolean): Promise<void>;
  /** Settles when the choices have been read. */
  ready: Promise<void>;
} {
  return { modules: MODULES, enabled: readonly(enabledIds), setEnabled, ready: loadEnabled() };
}

// ---- Words ----------------------------------------------------------------------------------

/** What a module that uses the network does with the script, in plain words; undefined when it asks for no network. */
export function networkNotice(module: ScriptModule): string | undefined {
  const origins = module.permissions.network ?? [];
  if (origins.length === 0) return undefined;
  const hosts = origins.map((origin) => {
    try {
      return new URL(origin).host;
    } catch {
      return origin;
    }
  });
  const list =
    hosts.length === 1
      ? hosts[0]
      : hosts.length === 2
        ? `${hosts[0]} and ${hosts[1]}`
        : `${hosts.slice(0, -1).join(', ')}, and ${hosts[hosts.length - 1]}`;
  return `${module.name} sends your script to ${list} when you ask it to.`;
}

/** The question asked before a module that uses the network is turned on; undefined when it asks for none. */
export function consentMessage(module: ScriptModule): string | undefined {
  const notice = networkNotice(module);
  return notice && `${notice} Turn it on?`;
}

/** The id of a module's tab among all the tabs. Ids hold no double hyphen, so two modules' tabs can't meet. */
export function moduleTabId(moduleId: string, tabId: string): string {
  return `module-${moduleId}--${tabId}`;
}

/** How many module buttons fit in the toolbar at 320px, beside the others. */
export const PHONE_BUTTONS = 2;

/** Whether the module buttons go into one Modules menu: on a phone, past two. A wide screen has the room for them all. */
export function buttonsInMenu(count: number, wide: boolean): boolean {
  return !wide && count > PHONE_BUTTONS;
}
