// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import type { DesktopFolderModule, DesktopModulesBridge } from '../app/desktop';
import {
  FOLDER_ICON,
  folderModuleOf,
  folderModules,
  folderNetworkReady,
  loadFolderModules,
  registerRunner,
  setFolderInfos,
  setFolderParts,
  syncFolderNetwork,
} from '../app/modules/folder';
import type { FrameChannel } from '../app/modules/folder-channel';
import {
  allModules,
  BUILT_IN_IDS,
  folderConsentToKeep,
  folderModuleProblems,
  isFolderModule,
  isScriptModule,
  loadEnabled,
  MODULES,
  modulesToChange,
  reconcileFolderConsent,
  setEnabled,
  useModules,
} from '../app/modules/registry';
import type { ModuleContext } from '../app/modules/types';
import { db } from '../app/storage/db';

/** A context that only knows its text: enough to tell one run's context from another's. */
const fakeContext = (options: { source?: string } = {}) =>
  ({ source: () => options.source ?? '' }) as unknown as ModuleContext;

// A folder module as the rest of the app sees it: an ordinary ScriptModule whose parts run in its
// frame (docs/plans/2026-10-27-desktop-modules-folder.md).

const TIDY: DesktopFolderModule = {
  id: 'tidy',
  name: 'Tidy',
  description: 'Finds spaces at the ends of lines.',
  permissions: { network: [] },
  folder: 'tidy',
  fingerprint: 'tidyfp0000000000',
};
const PARTS = {
  action: { label: 'Tidy' },
  tab: { id: 'tidy', label: 'Tidy' },
  commands: [{ id: 'trim', title: 'Tidy: remove spaces at line ends' }],
  settings: true,
};

function fakeRunner() {
  const runs: Array<{ what: string; command?: string; source: string }> = [];
  const channel: FrameChannel = {
    receive() {},
    start() {},
    changed() {},
    dispose() {},
    async run(what, context, command) {
      runs.push({ what, ...(command !== undefined && { command }), source: context.source() });
    },
  };
  return { channel, runs };
}

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  setFolderInfos([], []);
});
afterEach(() => vi.restoreAllMocks());

describe('folderModuleOf', () => {
  test('is who the module is, with the puzzle for its icon, before it has loaded', () => {
    const module = folderModuleOf(
      { ...TIDY, permissions: { network: ['https://api.example.com'] } },
      undefined,
    );
    // Its id in the app is its own under `folder.`, which no built-in module's id can be (they have
    // no dot), so it never shares a built-in's switch, consent, storage, tab, or commands.
    expect(isScriptModule({ ...module, id: 'tidy' })).toBe(true);
    expect(module).toMatchObject({
      id: 'folder.tidy',
      name: 'Tidy',
      icon: FOLDER_ICON,
      permissions: { network: ['https://api.example.com'] },
    });
    expect(module.action ?? module.tab ?? module.commands ?? module.settings).toBeUndefined();
  });

  test('has the button, tab, commands, and settings the module offered', () => {
    const module = folderModuleOf(TIDY, PARTS);
    expect(isScriptModule({ ...module, id: 'tidy' })).toBe(true);
    expect(module.action?.label).toBe('Tidy');
    expect(module.tab).toMatchObject({ id: 'tidy', label: 'Tidy' });
    expect(module.settings).toBeDefined();
    const commands = module.commands?.(fakeContext()) ?? [];
    expect(commands.map((c) => [c.id, c.title, c.group])).toEqual([
      ['trim', 'Tidy: remove spaces at line ends', 'Tidy'],
    ]);
  });

  test('runs its button and commands in its frame, each with the run’s context', async () => {
    const module = folderModuleOf(TIDY, PARTS);
    await expect(module.action?.run(fakeContext())).rejects.toThrow('it hasn’t started yet');
    const { channel, runs } = fakeRunner();
    const stop = registerRunner('tidy', channel);
    await module.action?.run(fakeContext({ source: 'button' }));
    await module.commands?.(fakeContext({ source: 'command' }))[0]?.run();
    expect(runs).toEqual([
      { what: 'action', source: 'button' },
      { what: 'command', command: 'trim', source: 'command' },
    ]);
    stop();
    await expect(module.action?.run(fakeContext())).rejects.toThrow('it hasn’t started yet');
  });
});

describe('the list of modules', () => {
  test('has the folder’s modules after the built-in ones, and keeps one module object until it loads', () => {
    setFolderInfos([TIDY], []);
    const ids = allModules.value.map((m) => m.id);
    expect(ids).toEqual([...MODULES.map((m) => m.id), 'folder.tidy']);
    expect(isFolderModule('folder.tidy')).toBe(true);
    expect(isFolderModule('tidy')).toBe(false);
    expect(isFolderModule(MODULES[0]?.id ?? '')).toBe(false);
    const before = allModules.value.at(-1);
    expect(allModules.value.at(-1)).toBe(before);
    setFolderParts('tidy', PARTS);
    expect(allModules.value.at(-1)).not.toBe(before);
    expect(allModules.value.at(-1)?.action?.label).toBe('Tidy');
  });

  test('skips a folder module with a built-in module’s id, naming its folder: no frame, no network', async () => {
    const builtIn = MODULES[0];
    if (!builtIn) throw new Error('no built-in module');
    setFolderInfos(
      [
        {
          ...TIDY,
          id: builtIn.id,
          folder: 'copycat',
          permissions: { network: ['https://evil.example'] },
        },
      ],
      ['Drafter skipped the folder “x”: it has no index.js.'],
      BUILT_IN_IDS,
    );
    expect(allModules.value.map((m) => m.id)).toEqual(MODULES.map((m) => m.id));
    expect(folderModules.value).toEqual([]);
    expect(folderModuleProblems.value).toEqual([
      'Drafter skipped the folder “x”: it has no index.js.',
      `Drafter skipped the folder “copycat”: it uses the id “${builtIn.id}”, which a module built into Drafter has.`,
    ]);
    // On, by the built-in's id or by its own: the desktop app is never told to let it reach anything.
    const calls: unknown[] = [];
    const stop = syncFolderNetwork(ref([builtIn.id, `folder.${builtIn.id}`]), {
      list: async () => ({ modules: [], problems: [] }),
      setNetwork: async (...args) => void calls.push(args),
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(calls).toEqual([]);
    expect(folderNetworkReady.value.size).toBe(0);
    stop();
  });

  test('turns a folder module off when it asks for more of the network than was agreed to', async () => {
    const helper = {
      ...TIDY,
      id: 'helper',
      folder: 'helper',
      permissions: { network: ['https://a.example'] },
    };
    setFolderInfos([helper], []);
    await setEnabled('folder.helper', true);
    expect(useModules().enabled.value).toContain('folder.helper');
    // The folder now holds a version that declares more (another module under the same id, or an update).
    setFolderInfos(
      [{ ...helper, permissions: { network: ['https://a.example', 'https://b.example'] } }],
      [],
    );
    expect(useModules().enabled.value).not.toContain('folder.helper');
    expect(useModules().lapsed.value).toContain('folder.helper');
  });
});

describe('folder names in messages', () => {
  test('are shown without control characters', () => {
    const builtIn = MODULES[0];
    if (!builtIn) throw new Error('no built-in module');
    setFolderInfos(
      [{ ...TIDY, id: builtIn.id, folder: 'fake\nDrafter: all good' }],
      [],
      BUILT_IN_IDS,
    );
    expect(folderModuleProblems.value).toEqual([
      `Drafter skipped the folder “fake?Drafter: all good”: it uses the id “${builtIn.id}”, which a module built into Drafter has.`,
    ]);
  });
});

describe('loadFolderModules', () => {
  test('reads the list the desktop app made at start', async () => {
    const bridge: DesktopModulesBridge = {
      list: async () => ({
        modules: [TIDY],
        problems: ['Drafter skipped the folder “x”: it has no module.json.'],
      }),
      setNetwork: async () => {},
    };
    await loadFolderModules(bridge, BUILT_IN_IDS);
    expect(allModules.value.at(-1)?.id).toBe('folder.tidy');
    expect(folderModuleProblems.value).toEqual([
      'Drafter skipped the folder “x”: it has no module.json.',
    ]);
  });

  test('has none without the desktop app, or when the list can’t be read', async () => {
    await loadFolderModules(null);
    expect(allModules.value.map((m) => m.id)).toEqual(MODULES.map((m) => m.id));
    await loadFolderModules({
      list: async () => {
        throw new Error('not-allowed');
      },
      setNetwork: async () => {},
    });
    expect(allModules.value.map((m) => m.id)).toEqual(MODULES.map((m) => m.id));
  });
});

describe('syncFolderNetwork', () => {
  test('tells the desktop app the origins a module may reach while it is on, and none once it is off', async () => {
    const helper = {
      ...TIDY,
      id: 'helper',
      folder: 'helper',
      permissions: { network: ['https://api.example.com'] },
    };
    setFolderInfos([TIDY, helper], []);
    const calls: Array<[string, readonly string[]]> = [];
    const bridge: DesktopModulesBridge = {
      list: async () => ({ modules: [], problems: [] }),
      setNetwork: async (id, origins) => {
        calls.push([id, origins]);
      },
    };
    const enabled = ref<string[]>([]);
    const stop = syncFolderNetwork(enabled, bridge);
    await nextTick();
    expect(calls).toEqual([]);
    enabled.value = ['folder.helper', 'folder.tidy', 'cast', 'helper'];
    await vi.waitFor(() => expect(folderNetworkReady.value.has('tidy')).toBe(true));
    expect(folderNetworkReady.value.has('helper')).toBe(true);
    expect(calls).toEqual([
      ['tidy', []],
      ['helper', ['https://api.example.com']],
    ]);
    enabled.value = ['folder.tidy'];
    await vi.waitFor(() => expect(folderNetworkReady.value.has('helper')).toBe(false));
    expect(calls.at(-1)).toEqual(['helper', []]);
    stop();
  });
});

describe('modulesToChange', () => {
  test('turns on, turns off, and refreshes a module that is on whose parts have arrived', () => {
    const a = folderModuleOf({ ...TIDY, id: 'a' }, undefined);
    const b = folderModuleOf({ ...TIDY, id: 'b' }, undefined);
    const c = folderModuleOf({ ...TIDY, id: 'c' }, undefined);
    const cLoaded = folderModuleOf({ ...TIDY, id: 'c' }, PARTS);
    const on = new Map([
      [b.id, b],
      [c.id, c],
    ]);
    expect(modulesToChange([a, b, cLoaded], [a.id, c.id], on)).toEqual({
      turnOn: [a],
      turnOff: [b],
      refresh: [cLoaded],
    });
    expect(modulesToChange([a, b, c], [b.id, c.id], on)).toEqual({
      turnOn: [],
      turnOff: [],
      refresh: [],
    });
  });
});

describe('folderConsentToKeep (I1)', () => {
  test('keeps a folder module’s consent only while the same module is loaded', () => {
    const loaded = [
      { id: 'folder.tidy', fingerprint: 'tidyfp0000000000' },
      { id: 'folder.helper', fingerprint: 'newfp00000000000' },
    ];
    const stored = [
      { id: 'cast', origins: [] }, // a built-in: always kept
      { id: 'folder.tidy', origins: [], fingerprint: 'tidyfp0000000000' }, // same module: kept
      { id: 'folder.helper', origins: [], fingerprint: 'oldfp00000000000' }, // changed: dropped
      { id: 'folder.ghost', origins: [], fingerprint: 'x' }, // not loaded this start: dropped
    ];
    expect(folderConsentToKeep(stored, loaded).map((e) => e.id)).toEqual(['cast', 'folder.tidy']);
  });
});

describe('reconcileFolderConsent (I1)', () => {
  test('drops a reused or changed folder module’s stored consent before it can run', async () => {
    await db.settings.put({
      key: 'modules:enabled',
      value: [
        { id: 'cast', origins: [] },
        { id: 'folder.tidy', origins: [], fingerprint: 'OLD-DIFFERENT-ONE' },
      ],
    });
    await loadEnabled(true);
    // A *different* module is now in the folder under the id tidy (a new fingerprint).
    setFolderInfos([TIDY], []);
    await reconcileFolderConsent();
    expect(useModules().enabled.value).toContain('cast');
    expect(useModules().enabled.value).not.toContain('folder.tidy');
    const saved = (await db.settings.get('modules:enabled'))?.value as Array<{ id: string }>;
    expect(saved.map((e) => e.id)).toEqual(['cast']);
  });

  test('keeps a folder module on across a restart when it is the same module', async () => {
    setFolderInfos([TIDY], []);
    await db.settings.clear();
    await setEnabled('folder.tidy', true);
    await loadEnabled(true);
    await reconcileFolderConsent();
    expect(useModules().enabled.value).toContain('folder.tidy');
  });
});

describe('module storage quota (minor 4)', () => {
  test('refuses a module more than its share of this browser’s storage', async () => {
    const { moduleStorage, STORAGE_QUOTA } = await import('../app/modules/storage');
    const store = moduleStorage('folder.hog');
    await store.set('a', 'x'.repeat(STORAGE_QUOTA.bytes - 100));
    await expect(store.set('b', 'y'.repeat(1000))).rejects.toThrow(/storage/i);
    // Removing frees it again.
    await store.remove('a');
    await expect(store.set('b', 'y'.repeat(1000))).resolves.toBeUndefined();
  });

  test('refuses more than its share of keys', async () => {
    const { moduleStorage, STORAGE_QUOTA } = await import('../app/modules/storage');
    const store = moduleStorage('folder.many');
    for (let i = 0; i < STORAGE_QUOTA.keys; i++) await store.set(`k${i}`, i);
    await expect(store.set('one-too-many', 1)).rejects.toThrow(/storage/i);
    // Overwriting an existing key is fine.
    await expect(store.set('k0', 2)).resolves.toBeUndefined();
  });

  test('holds the quota even when sets race (minor 2 / review)', async () => {
    const { moduleStorage, STORAGE_QUOTA } = await import('../app/modules/storage');
    const store = moduleStorage('folder.race');
    const big = 'x'.repeat(Math.floor(STORAGE_QUOTA.bytes * 0.6));
    // Each alone fits; together they exceed the quota. The check must be atomic, so one is refused.
    const results = await Promise.allSettled([store.set('a', big), store.set('b', big)]);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const rows = await db.settings.where('key').startsWith('module:folder.race:').toArray();
    const bytes = rows.reduce((n, row) => n + row.key.length + JSON.stringify(row.value).length, 0);
    expect(bytes).toBeLessThanOrEqual(STORAGE_QUOTA.bytes);
  });
});
