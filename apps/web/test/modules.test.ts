// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { history, undo } from '@codemirror/commands';
import { ChangeSet, EditorState, type Extension, Text } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { applyTextChanges } from '../app/editor/apply-changes';
import {
  clearAllModuleProblems,
  clearModuleProblems,
  mapModuleProblems,
  moduleProblems,
  setModuleProblems,
} from '../app/modules/problems';
import {
  buttonsInMenu,
  collectModules,
  consentedIds,
  consentMessage,
  isScriptModule,
  loadEnabled,
  MODULES,
  moduleError,
  moduleTabId,
  runModuleAction,
  setEnabled,
  useModules,
} from '../app/modules/registry';
import { runScope } from '../app/modules/scope';
import { moduleStorage } from '../app/modules/storage';
import type { ModuleContext, ScriptModule } from '../app/modules/types';
import { db } from '../app/storage/db';
import { dropTab } from '../app/utils/panes';
import { findDuplicateIds, moduleFolders, moduleIconNames } from '../scripts/modules.mjs';

const PATH = (folder: string) => `../../../../modules/${folder}/index.ts`;

function module(id: string, extra: Partial<ScriptModule> = {}): ScriptModule {
  return {
    id,
    name: id,
    description: `The ${id} module.`,
    icon: 'i-lucide-puzzle',
    permissions: {},
    ...extra,
  };
}

// jsdom has no layout; CodeMirror's measuring asks a range for its rectangles.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

beforeEach(async () => {
  await Promise.all(db.tables.map((table) => table.clear()));
  clearAllModuleProblems();
});

describe('finding the modules', () => {
  test('finds every module folder, and skips a malformed one with a warning', () => {
    const warn = vi.fn();
    const found = collectModules(
      {
        [PATH('alpha')]: { default: module('alpha') },
        [PATH('beta')]: { default: module('beta') },
        // A default export without the shape, one with no default, and one that is a string.
        [PATH('broken')]: { default: { id: 'broken' } },
        [PATH('nothing')]: {},
        [PATH('text')]: { default: 'a module' },
        // An id that couldn't be a storage key or an element id.
        [PATH('shouting')]: { default: module('Not Allowed') },
      },
      warn,
    );
    expect(found.map((m) => m.id)).toEqual(['alpha', 'beta']);
    const warned = warn.mock.calls.map(([message]) => String(message));
    expect(warned).toHaveLength(4);
    for (const folder of ['broken', 'nothing', 'text', 'shouting']) {
      expect(warned.some((message) => message.includes(`modules/${folder}`))).toBe(true);
    }
  });

  test('finds nothing in an empty modules folder', () => {
    const warn = vi.fn();
    expect(collectModules({}, warn)).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  test('checks the shape of a module', () => {
    expect(isScriptModule(module('ok'))).toBe(true);
    expect(isScriptModule(module('ok', { action: { label: 'Go', run() {} } }))).toBe(true);
    expect(
      isScriptModule(module('ok', { permissions: { network: ['https://example.invalid'] } })),
    ).toBe(true);
    expect(isScriptModule(null)).toBe(false);
    expect(isScriptModule({ ...module('ok'), name: 3 })).toBe(false);
    expect(isScriptModule({ ...module('ok'), permissions: undefined })).toBe(false);
    expect(isScriptModule({ ...module('ok'), permissions: { network: 'https://x.invalid' } })).toBe(
      false,
    );
    expect(isScriptModule({ ...module('ok'), action: { label: 'Go' } })).toBe(false);
    expect(isScriptModule({ ...module('ok'), tab: { id: 'x', label: 'X' } })).toBe(false);
    expect(isScriptModule({ ...module('ok'), commands: 'none' })).toBe(false);
  });

  test('refuses two modules with the same id', () => {
    // It never throws (that would blank the app): the second is skipped, and the error names both folders.
    const warn = vi.fn();
    const error = vi.fn();
    const found = collectModules(
      {
        [PATH('one')]: { default: module('same', { name: 'First' }) },
        [PATH('two')]: { default: module('same', { name: 'Second' }) },
        [PATH('three')]: { default: module('other') },
      },
      warn,
      error,
    );
    expect(found.map((m) => m.name)).toEqual(['First', 'other']);
    const said = String(error.mock.calls[0]?.[0]);
    expect(error).toHaveBeenCalledOnce();
    expect(said).toMatch(/same/);
    expect(said).toMatch(/modules\/one/);
    expect(said).toMatch(/modules\/two/);
  });

  test('refuses two modules with the same id at build time, naming both folders', async () => {
    const root = await mkdtemp(join(tmpdir(), 'drafter-modules-'));
    for (const [folder, id] of [
      ['one', 'same'],
      ['two', 'same'],
      ['three', 'other'],
    ] as const) {
      await mkdir(join(root, folder));
      // Two ways to write a module: the object as the default export, or a const that is exported.
      const body =
        folder === 'two'
          ? `const module = {\n  id: '${id}',\n  tab: { id: 'tab' },\n};\nexport default module;\n`
          : `import type { ScriptModule } from '~/modules/types';\nexport default {\n  id: '${id}',\n  icon: 'i-lucide-${folder === 'three' ? 'bug' : 'puzzle'}',\n} satisfies Partial<ScriptModule>;\n`;
      await writeFile(join(root, folder, 'index.ts'), body);
    }
    // A folder without an index.ts is not a module.
    await mkdir(join(root, 'empty'));
    expect(await moduleFolders(root)).toEqual(['one', 'three', 'two']);
    const duplicates = findDuplicateIds(await moduleFolders(root), root);
    await expect(duplicates).rejects.toThrow(/same.*modules\/one.*modules\/two/s);
    expect(await moduleIconNames(root)).toEqual(['lucide:bug', 'lucide:puzzle']);
  });

  test('has no module in a test run, and so no fixture', () => {
    expect(Array.isArray(MODULES)).toBe(true);
    expect(MODULES.some((m) => m.id === 'fixture')).toBe(false);
  });

  test('ships no fixture in a production build', async () => {
    // The flag is the build's constant. Off (the default) leaves the fixture out of the list; on
    // puts it in, so the two builds differ in this and nothing else.
    vi.resetModules();
    const off = await import('../app/modules/registry');
    expect(off.MODULES.map((m) => m.id)).not.toContain('fixture');

    vi.resetModules();
    vi.stubGlobal('__DRAFTER_TEST_MODULES__', true);
    try {
      const on = await import('../app/modules/registry');
      expect(on.MODULES.map((m) => m.id)).toContain('fixture');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("a module's storage", () => {
  test("keeps each module's storage separate", async () => {
    const a = moduleStorage('alpha');
    const b = moduleStorage('beta');
    await a.set('key', { n: 1 });
    await b.set('key', 'two');
    expect(await a.get('key')).toEqual({ n: 1 });
    expect(await b.get('key')).toBe('two');
    expect(await a.get('missing')).toBeUndefined();

    // In the settings table, under the module's own prefix, and nowhere else.
    expect((await db.settings.toArray()).map((row) => row.key).sort()).toEqual([
      'module:alpha:key',
      'module:beta:key',
    ]);

    await a.remove('key');
    expect(await a.get('key')).toBeUndefined();
    expect(await b.get('key')).toBe('two');
  });

  test("can't reach another module's keys or the app's settings", async () => {
    await db.settings.put({ key: 'strict', value: true });
    await db.settings.put({ key: 'modules:enabled', value: ['alpha'] });
    const a = moduleStorage('alpha');
    expect(await a.get('strict')).toBeUndefined();
    expect(await a.get('modules:enabled')).toBeUndefined();
    await a.remove('strict');
    expect((await db.settings.get('strict'))?.value).toBe(true);
  });
});

describe('running a module', () => {
  const context = {} as ModuleContext;

  test('catches a module that throws', async () => {
    await expect(
      runModuleAction('Script Doctor', () => {
        throw new Error('no key');
      }),
    ).resolves.toBeUndefined();
    expect(moduleError.value).toBe('Script Doctor couldn’t finish: no key');

    moduleError.value = '';
    await expect(
      runModuleAction('Script Doctor', async () => {
        throw new Error('rejected');
      }),
    ).resolves.toBeUndefined();
    expect(moduleError.value).toContain('rejected');

    moduleError.value = '';
    // Something that isn't an Error is still shown.
    await runModuleAction('Script Doctor', () => Promise.reject('plain'));
    expect(moduleError.value).toContain('plain');
  });

  test('runs a module that works', async () => {
    moduleError.value = '';
    const run = vi.fn();
    await runModuleAction('Script Doctor', () => run(context));
    expect(run).toHaveBeenCalledOnce();
    expect(moduleError.value).toBe('');
  });
});

describe('turning modules on', () => {
  test('is off to begin with, and remembers the choice', async () => {
    await loadEnabled();
    expect(useModules().enabled.value).toEqual([]);
    await setEnabled('alpha', true);
    await setEnabled('beta', true);
    await setEnabled('alpha', false);
    expect(useModules().enabled.value).toEqual(['beta']);
    expect((await db.settings.get('modules:enabled'))?.value).toEqual([
      { id: 'beta', origins: [] },
    ]);

    // A new visit reads it back.
    useModules().enabled.value;
    await loadEnabled(true);
    expect(useModules().enabled.value).toEqual(['beta']);
  });

  test('ignores damaged rows', async () => {
    await db.settings.put({ key: 'modules:enabled', value: 'alpha' });
    await loadEnabled(true);
    expect(useModules().enabled.value).toEqual([]);
    await db.settings.put({
      key: 'modules:enabled',
      value: [
        { id: 'alpha', origins: [] },
        3,
        null,
        { id: 7 },
        { id: 'beta', origins: 'x' },
        { id: 'gamma', origins: [] },
      ],
    });
    await loadEnabled(true);
    expect(useModules().enabled.value).toEqual(['alpha', 'gamma']);
  });

  test('keeps the origins a writer agreed to with the choice', async () => {
    await loadEnabled(true);
    await setEnabled('alpha', true);
    expect((await db.settings.get('modules:enabled'))?.value).toEqual([
      { id: 'alpha', origins: [] },
    ]);
  });

  test('treats a module whose network origins grew as off until the writer agrees again', () => {
    const declared = (id: string) =>
      ({ doctor: ['https://api.example', 'https://more.example'], quiet: [] })[id];
    const stored = [
      { id: 'doctor', origins: ['https://api.example'] },
      { id: 'quiet', origins: [] },
      { id: 'removed', origins: ['https://old.example'] },
    ];
    // Agreed to fewer than it declares now: off. Fewer declared than agreed to: still on.
    expect(consentedIds(stored, declared)).toEqual(['quiet', 'removed']);
    expect(
      consentedIds(
        [{ id: 'doctor', origins: ['https://more.example', 'https://api.example'] }],
        declared,
      ),
    ).toEqual(['doctor']);
    expect(consentedIds([{ id: 'doctor', origins: [] }], () => ['https://a.example'])).toEqual([]);
    expect(
      consentedIds([{ id: 'doctor', origins: ['https://a.example', 'https://b.example'] }], () => [
        'https://a.example',
      ]),
    ).toEqual(['doctor']);
    // A module that had no network and now has some is off too.
    expect(consentedIds([{ id: 'quiet', origins: [] }], () => ['https://new.example'])).toEqual([]);
  });

  test('asks in plain words before a module that uses the network', () => {
    const doctor = module('script-doctor', {
      name: 'Script Doctor',
      permissions: { network: ['https://api.anthropic.com'] },
    });
    expect(consentMessage(doctor)).toBe(
      'Script Doctor sends your script to api.anthropic.com when you ask it to. Turn it on?',
    );
    expect(
      consentMessage(
        module('x', {
          name: 'X',
          permissions: { network: ['https://a.example', 'https://b.example'] },
        }),
      ),
    ).toBe('X sends your script to a.example and b.example when you ask it to. Turn it on?');
    expect(
      consentMessage(
        module('x', {
          name: 'X',
          permissions: {
            network: ['https://a.example', 'https://b.example', 'http://localhost:8080'],
          },
        }),
      ),
    ).toBe(
      'X sends your script to a.example, b.example, and localhost:8080 when you ask it to. Turn it on?',
    );
    expect(consentMessage(module('quiet'))).toBeUndefined();
    expect(consentMessage(module('quiet', { permissions: { network: [] } }))).toBeUndefined();
  });

  test('keeps two buttons in the toolbar on a phone, and puts more in a menu', () => {
    expect([0, 1, 2, 3, 5].map((n) => buttonsInMenu(n, false))).toEqual([
      false,
      false,
      false,
      true,
      true,
    ]);
    expect([0, 1, 3, 8].map((n) => buttonsInMenu(n, true))).toEqual([false, false, false, false]);
  });

  test('names a tab by its module', () => {
    expect(moduleTabId('script-doctor', 'notes')).toBe('module-script-doctor--notes');
    expect(moduleTabId('a-b', 'c')).not.toBe(moduleTabId('a', 'b-c'));
  });

  test('drops a tab that is showing, keeping the three others distinct', () => {
    const gone = 'module-x--tab';
    expect(dropTab({ left: 'source', right: 'script' }, gone)).toEqual({
      left: 'source',
      right: 'script',
    });
    expect(dropTab({ left: 'source', right: gone }, gone)).toEqual({
      left: 'source',
      right: 'script',
    });
    expect(dropTab({ left: gone, right: 'script' }, gone)).toEqual({
      left: 'source',
      right: 'script',
    });
    expect(dropTab({ left: gone, right: 'source' }, gone)).toEqual({
      left: 'script',
      right: 'source',
    });
    expect(dropTab({ left: 'script', right: gone }, gone)).toEqual({
      left: 'script',
      right: 'source',
    });
  });
});

describe("a module's problems", () => {
  test('replaces only that module’s items, labelled with its name', () => {
    setModuleProblems('alpha', 'Alpha', [{ message: 'one', from: 0, to: 3, severity: 'info' }], 20);
    setModuleProblems(
      'beta',
      'Beta',
      [{ message: 'two', from: 4, to: 6, severity: 'warning' }],
      20,
    );
    expect(moduleProblems.value.map((p) => [p.moduleName, p.message])).toEqual([
      ['Alpha', 'one'],
      ['Beta', 'two'],
    ]);
    setModuleProblems(
      'alpha',
      'Alpha',
      [{ message: 'three', from: 1, to: 2, severity: 'info' }],
      20,
    );
    expect(moduleProblems.value.map((p) => p.message)).toEqual(['three', 'two']);
    clearModuleProblems('beta');
    expect(moduleProblems.value.map((p) => p.message)).toEqual(['three']);
  });

  test('keeps positions inside the text, and drops what is not a problem', () => {
    setModuleProblems(
      'alpha',
      'Alpha',
      [
        { message: 'past the end', from: 18, to: 99, severity: 'info' },
        { message: 'backwards', from: 9, to: 4, severity: 'info' },
        { message: 'negative', from: -5, to: 2, severity: 'info' },
        { message: 'odd severity', from: 0, to: 1, severity: 'catastrophe' as 'info' },
        { message: 'not a number', from: Number.NaN, to: 1, severity: 'info' },
        { message: '', from: 0, to: 1, severity: 'info' },
        null as never,
      ],
      20,
    );
    expect(moduleProblems.value.map((p) => [p.message, p.from, p.to, p.severity])).toEqual([
      ['past the end', 18, 20, 'info'],
      ['backwards', 4, 9, 'info'],
      ['negative', 0, 2, 'info'],
      ['odd severity', 0, 1, 'info'],
    ]);
  });

  test('follows the text through an edit, and loses a fix whose text changed', () => {
    setModuleProblems(
      'alpha',
      'Alpha',
      [
        {
          message: 'shout',
          from: 10,
          to: 15,
          severity: 'warning',
          fix: { title: 'Lowercase', changes: [{ from: 10, to: 15, insert: 'hello' }] },
        },
        { message: 'later', from: 20, to: 24, severity: 'info' },
      ],
      30,
    );
    // Five characters typed at the start move everything along.
    mapModuleProblems(ChangeSet.of({ from: 0, insert: 'abcde' }, 30));
    expect(moduleProblems.value.map((p) => [p.from, p.to])).toEqual([
      [15, 20],
      [25, 29],
    ]);
    expect(moduleProblems.value[0]?.fix?.changes).toEqual([{ from: 15, to: 20, insert: 'hello' }]);

    // An edit inside the first problem's text keeps the problem but not its fix.
    mapModuleProblems(ChangeSet.of({ from: 17, to: 18, insert: 'XY' }, 35));
    expect(moduleProblems.value).toHaveLength(2);
    expect(moduleProblems.value[0]?.fix).toBeUndefined();

    // A change that replaces the whole of a problem's text ends the problem.
    mapModuleProblems(ChangeSet.of({ from: 24, to: 33, insert: 'new' }, 36));
    expect(moduleProblems.value.map((p) => p.message)).toEqual(['shout']);
  });

  test('leaves the list alone when there is nothing to move', () => {
    const before = moduleProblems.value;
    mapModuleProblems(ChangeSet.of({ from: 0, insert: 'x' }, 5));
    expect(moduleProblems.value).toBe(before);
    clearAllModuleProblems();
    expect(moduleProblems.value).toBe(before);
  });

  test('is emptied by a new script', () => {
    setModuleProblems('alpha', 'Alpha', [{ message: 'one', from: 0, to: 1, severity: 'info' }], 5);
    clearAllModuleProblems();
    expect(moduleProblems.value).toEqual([]);
  });
});

describe('changing the script for a module', () => {
  const make = (doc: string, extensions: Extension[] = []) =>
    new EditorView({ state: EditorState.create({ doc, extensions }) });

  test('applies the changes as one transaction, which one undo reverses', () => {
    const transactions: number[] = [];
    const view = make('Hello world', [
      history(),
      EditorView.updateListener.of((u) => transactions.push(u.transactions.length)),
    ]);
    expect(
      applyTextChanges(view, [
        { from: 0, to: 0, insert: '> ' },
        { from: 6, to: 11, insert: 'there' },
      ]),
    ).toBe(true);
    expect(view.state.doc.toString()).toBe('> Hello there');
    expect(transactions).toEqual([1]);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('Hello world');
  });

  test('uses the editor’s own line breaks', () => {
    const view = make('a\r\nb', [EditorState.lineSeparator.of('\r\n')]);
    applyTextChanges(view, [{ from: 1, to: 1, insert: '\nx' }]);
    expect(view.state.doc.lines).toBe(3);
    expect(view.state.doc.toString()).toBe('a\nx\nb');
  });

  test('refuses changes outside the text, or overlapping, and changes nothing', () => {
    const view = make('Hello');
    expect(() => applyTextChanges(view, [{ from: 2, to: 99, insert: '' }])).toThrow(/outside/i);
    expect(() => applyTextChanges(view, [{ from: 4, to: 2, insert: '' }])).toThrow(/backwards/i);
    expect(() =>
      applyTextChanges(view, [
        { from: 0, to: 3, insert: 'x' },
        { from: 2, to: 4, insert: 'y' },
      ]),
    ).toThrow(/overlap/i);
    expect(view.state.doc.toString()).toBe('Hello');
  });

  test('changes nothing in a read-only editor', () => {
    const view = new EditorView({
      state: EditorState.create({ doc: 'Hello', extensions: [EditorState.readOnly.of(true)] }),
    });
    expect(applyTextChanges(view, [{ from: 0, to: 0, insert: 'x' }])).toBe(false);
    expect(view.state.doc.toString()).toBe('Hello');
  });
});

describe("a module's run", () => {
  const text = (value: string) => Text.of(value.split('\n'));
  function world() {
    const state = { generation: 0, epoch: 0, on: true, doc: text('Hello') };
    return {
      state,
      world: {
        generation: () => state.generation,
        epoch: () => state.epoch,
        on: () => state.on,
        doc: () => state.doc,
      },
    };
  }

  test('may change the script it started in while the module stays on', () => {
    const { world: w } = world();
    const scope = runScope(w, { checkText: true });
    expect(scope.mayChange()).toBe(true);
    expect(scope.live()).toBe(true);
  });

  test('may not change or report on another script', () => {
    const { world: w, state } = world();
    const scope = runScope(w, { checkText: true });
    state.generation++;
    expect(scope.live()).toBe(false);
    expect(scope.mayChange()).toBe(false);
  });

  test('may not act once the module was turned off, even if it is turned on again', () => {
    const { world: w, state } = world();
    const off = runScope(w, { checkText: false });
    state.on = false;
    expect(off.live()).toBe(false);
    const again = runScope(w, { checkText: false });
    state.on = true;
    state.epoch++;
    expect(off.live()).toBe(false);
    expect(again.live()).toBe(false);
    expect(runScope(w, { checkText: false }).live()).toBe(true);
  });

  test('may not change text that was edited since it started, but may go on after its own change', () => {
    const { world: w, state } = world();
    const scope = runScope(w, { checkText: true });
    state.doc = text('Hello!');
    expect(scope.mayChange()).toBe(false);
    // Reporting problems doesn't depend on the text; a change does.
    expect(scope.live()).toBe(true);

    const again = runScope(w, { checkText: true });
    state.doc = text('Hello there');
    again.changed();
    expect(again.mayChange()).toBe(true);
    state.doc = text('Hello there!');
    expect(again.mayChange()).toBe(false);
  });

  test('a view of the script for a tab or settings is checked for the module and script only', () => {
    const { world: w, state } = world();
    const scope = runScope(w, { checkText: false });
    state.doc = text('Typed since');
    expect(scope.mayChange()).toBe(true);
  });
});
