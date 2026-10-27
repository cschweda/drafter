// menu.ts is pure (it imports only Electron's types), so it is tested with no Electron.
import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, test, vi } from 'vitest';
import {
  accelerator,
  type MenuCommand,
  menuTemplate,
  parseCommands,
  RELEASES_URL,
} from '../src/menu';

const cmd = (
  id: string,
  group: string,
  title = id,
  extra: Partial<MenuCommand> = {},
): MenuCommand => ({ id, title, group, enabled: true, ...extra });

/** A cut of Drafter's own command list: one or more of each kind the menu lays out. */
const COMMANDS: MenuCommand[] = [
  cmd('palette', 'Go', 'Go to scene or command', { keys: ['Mod-k'] }),
  cmd('new-screenplay', 'File', 'New screenplay', { keys: ['Mod-Alt-n'] }),
  cmd('new-stage-play', 'File', 'New stage play'),
  cmd('template-screenplay', 'File', 'Template: Screenplay'),
  cmd('document-markdown', 'File', 'Document: Markdown'),
  cmd('open', 'File', 'Open…', { keys: ['Mod-o'] }),
  cmd('save', 'File', 'Save', { keys: ['Mod-s'] }),
  cmd('save-as', 'File', 'Save As…', { keys: ['Mod-Shift-s'] }),
  cmd('open-sample-screenplay', 'File', 'Open sample: Screenplay'),
  cmd('reset-sample', 'File', 'Reset sample'),
  cmd('export-pdf', 'File', 'Export as PDF'),
  cmd('settings', 'File', 'Settings…', { keys: ['Mod-,'] }),
  cmd('take-the-tour', 'Help', 'Take the tour'),
  cmd('help-shortcuts', 'Help', 'Open the page: Keyboard shortcuts'),
  cmd('help-saving', 'Help', 'Open the page: Saving and your browser'),
  cmd('help-privacy', 'Help', 'Open the page: Privacy'),
  cmd('go-to-scene', 'Go', 'Go to scene…'),
  cmd('next-problem', 'Go', 'Next problem', { keys: ['F8'] }),
  cmd('previous-problem', 'Go', 'Previous problem', { keys: ['Shift-F8'] }),
  cmd('show-source', 'View', 'Show Source'),
  cmd('sprint-15', 'View', 'Start a 15-minute sprint'),
  cmd('focus-mode', 'View', 'Toggle focus mode', { keys: ['Mod-Shift-Enter'] }),
  cmd('undo', 'Edit', 'Undo', { keys: ['Mod-z'] }),
  cmd('make-action', 'Edit', 'Make action', { keys: ['Mod-Alt-2'] }),
  cmd('find', 'Edit', 'Find', { keys: ['Mod-f'] }),
];

const labelOf = (item: MenuItemConstructorOptions) => (item.label ?? '').replace(/&(?!&)/g, '');
const menus = (template: MenuItemConstructorOptions[]) =>
  Object.fromEntries(template.map((m) => [labelOf(m), m]));
const submenu = (item: MenuItemConstructorOptions | undefined) =>
  (item?.submenu ?? []) as MenuItemConstructorOptions[];
/** Every item at any depth. */
function walk(items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return items.flatMap((item) => [item, ...walk(submenu(item))]);
}
const named = (template: MenuItemConstructorOptions[], id: string) =>
  walk(template).find((item) => item.id === id);

/** Chooses the item as a click would. */
function choose(template: MenuItemConstructorOptions[], id: string) {
  const click = named(template, id)?.click;
  if (typeof click !== 'function') throw new Error(`No item ${id} to click`);
  (click as () => void)();
}

describe('menuTemplate', () => {
  test('groups commands into File, Edit, View, Go, and Help', () => {
    const template = menuTemplate(COMMANDS, () => {}, { platform: 'linux' });
    expect(template.map(labelOf)).toEqual(['File', 'Edit', 'View', 'Go', 'Help']);
    const m = menus(template);
    const top = (menu: string) => walk(submenu(m[menu])).map((i) => i.id);
    expect(top('File')).toEqual(
      expect.arrayContaining(['new-screenplay', 'open', 'save', 'export-pdf']),
    );
    expect(top('Edit')).toEqual(expect.arrayContaining(['undo', 'make-action', 'find']));
    expect(top('View')).toEqual(expect.arrayContaining(['show-source', 'sprint-15', 'focus-mode']));
    expect(top('Go')).toEqual(expect.arrayContaining(['palette', 'go-to-scene', 'next-problem']));
    expect(top('Help')).toEqual(
      expect.arrayContaining(['take-the-tour', 'help-shortcuts', 'help-saving', 'help-privacy']),
    );
    // Each command is in its own menu only, once.
    const ids = walk(template)
      .map((i) => i.id)
      .filter((id): id is string => !!id && COMMANDS.some((c) => c.id === id));
    expect(ids.sort()).toEqual(COMMANDS.map((c) => c.id).sort());
  });

  test('puts Quit (CmdOrCtrl+Q, the platform’s own) last in File, and About and Releases in Help', () => {
    const m = menus(menuTemplate(COMMANDS, () => {}, { platform: 'linux' }));
    const file = submenu(m.File);
    expect(file.at(-1)).toMatchObject({ id: 'quit', label: 'Quit', accelerator: 'CmdOrCtrl+Q' });
    expect(file.at(-2)).toMatchObject({ type: 'separator' });
    const help = submenu(m.Help);
    expect(help.map((i) => i.id).filter(Boolean)).toEqual([
      'help-shortcuts',
      'help-saving',
      'help-privacy',
      'take-the-tour',
      'releases',
      'about',
    ]);
    expect(help.find((i) => i.id === 'about')?.label).toBe('About Drafter');
    expect(help.find((i) => i.id === 'releases')?.label).toBe('Open the Releases Page');
  });

  test('labels the help pages for a desktop, not a browser', () => {
    const t = menuTemplate(COMMANDS, () => {}, { platform: 'linux' });
    expect(named(t, 'help-shortcuts')?.label).toBe('Keyboard Shortcuts');
    expect(named(t, 'help-saving')?.label).toBe('Saving');
    expect(named(t, 'help-privacy')?.label).toBe('Privacy');
  });

  test('sends the command’s id when an item is chosen', () => {
    const run = vi.fn();
    const t = menuTemplate(COMMANDS, run, { platform: 'linux' });
    choose(t, 'save');
    choose(t, 'help-privacy');
    expect(run.mock.calls).toEqual([['save'], ['help-privacy']]);
  });

  test('turns keys into accelerators', () => {
    expect(accelerator('Mod-s')).toBe('CmdOrCtrl+S');
    expect(accelerator('Mod-Shift-s')).toBe('CmdOrCtrl+Shift+S');
    expect(accelerator('Mod-Alt-n')).toBe('CmdOrCtrl+Alt+N');
    expect(accelerator('Mod-Alt-1')).toBe('CmdOrCtrl+Alt+1');
    expect(accelerator('F8')).toBe('F8');
    expect(accelerator('Shift-F8')).toBe('Shift+F8');
    expect(accelerator('Mod-,')).toBe('CmdOrCtrl+,');
    expect(accelerator('Mod-/')).toBe('CmdOrCtrl+/');
    expect(accelerator('Mod-Shift-/')).toBe('CmdOrCtrl+Shift+/');
    expect(accelerator('Mod-Shift-Enter')).toBe('CmdOrCtrl+Shift+Enter');
    expect(accelerator('Ctrl-Alt-[')).toBe('Ctrl+Alt+[');
    expect(accelerator('Mod--')).toBe('CmdOrCtrl+-');
    expect(accelerator('Mod-+')).toBe('CmdOrCtrl+Plus');
    expect(accelerator('Mod-ArrowUp')).toBe('CmdOrCtrl+Up');
    // Nothing Electron could not take.
    expect(accelerator('')).toBe('');
    expect(accelerator('Mod-Banana')).toBe('');
  });

  test('shows a command’s keys without registering them, so the page’s own handlers keep them', () => {
    const t = menuTemplate(COMMANDS, () => {}, { platform: 'linux' });
    expect(named(t, 'save')).toMatchObject({
      accelerator: 'CmdOrCtrl+S',
      registerAccelerator: false,
    });
    expect(named(t, 'next-problem')).toMatchObject({
      accelerator: 'F8',
      registerAccelerator: false,
    });
    // A command with no keys has no accelerator.
    expect(named(t, 'save-as')).toMatchObject({ accelerator: 'CmdOrCtrl+Shift+S' });
    expect(named(t, 'show-source')).not.toHaveProperty('accelerator');
    // Quit is the menu's own: nothing in the page handles Ctrl+Q.
    const quit = submenu(menus(t).File).at(-1);
    expect(quit).toMatchObject({ id: 'quit', accelerator: 'CmdOrCtrl+Q' });
    expect(quit?.registerAccelerator).not.toBe(false);
  });

  test('disables items whose command is off', () => {
    const off = COMMANDS.map((c) =>
      c.id === 'save' || c.id === 'undo' ? { ...c, enabled: false } : c,
    );
    const t = menuTemplate(off, () => {}, { platform: 'linux' });
    expect(named(t, 'save')?.enabled).toBe(false);
    expect(named(t, 'undo')?.enabled).toBe(false);
    expect(named(t, 'open')?.enabled).toBe(true);
    expect(named(t, 'find')?.enabled).toBe(true);
  });

  test('keeps About and Releases on even when no command has arrived yet', () => {
    const t = menuTemplate([], () => {}, { platform: 'linux' });
    expect(t.map(labelOf)).toEqual(['File', 'Edit', 'View', 'Go', 'Help']);
    expect(named(t, 'about')?.enabled).not.toBe(false);
    expect(named(t, 'releases')?.enabled).not.toBe(false);
    expect(submenu(menus(t).File).at(-1)).toMatchObject({ id: 'quit' });
  });

  test('puts a command the layout doesn’t know at the end of its menu, before Quit', () => {
    const t = menuTemplate([...COMMANDS, cmd('brand-new', 'File', 'Brand new')], () => {}, {
      platform: 'linux',
    });
    const file = submenu(menus(t).File);
    expect(file.at(-1)).toMatchObject({ id: 'quit' });
    const index = file.findIndex((i) => i.id === 'brand-new');
    expect(index).toBeGreaterThan(-1);
    expect(index).toBeLessThan(file.length - 2);
  });

  test('ignores a command in a group the menu doesn’t have', () => {
    const t = menuTemplate([...COMMANDS, cmd('mod-x', 'My module', 'Do it')], () => {}, {
      platform: 'linux',
    });
    expect(named(t, 'mod-x')).toBeUndefined();
  });

  test('doubles an ampersand in a title, which would otherwise set a mnemonic', () => {
    const t = menuTemplate([cmd('save', 'File', 'Save & Close')], () => {}, { platform: 'linux' });
    expect(named(t, 'save')?.label).toBe('Save && Close');
  });

  test('has no separators at the ends or side by side', () => {
    const all = menuTemplate(COMMANDS, () => {}, { platform: 'linux' });
    for (const menu of [...all, ...all.flatMap((m) => submenu(m).filter((i) => i.submenu))]) {
      const items = submenu(menu);
      expect(items[0]?.type).not.toBe('separator');
      expect(items.at(-1)?.type).not.toBe('separator');
      items.forEach((item, i) => {
        if (item.type === 'separator') expect(items[i + 1]?.type).not.toBe('separator');
      });
    }
  });

  test('on a Mac adds the app menu, which holds About and Quit', () => {
    const t = menuTemplate(COMMANDS, () => {}, { platform: 'darwin' });
    expect(t.map(labelOf)).toEqual(['Drafter', 'File', 'Edit', 'View', 'Go', 'Help']);
    const app = submenu(t[0]);
    expect(app.some((i) => i.id === 'about')).toBe(true);
    expect(app.some((i) => i.id === 'quit')).toBe(true);
    expect(submenu(menus(t).File).some((i) => i.id === 'quit')).toBe(false);
    expect(submenu(menus(t).Help).some((i) => i.id === 'about')).toBe(false);
  });

  test('runs About, Releases, and Quit through the actions it is given', () => {
    const about = vi.fn();
    const releases = vi.fn();
    const quit = vi.fn();
    const t = menuTemplate(COMMANDS, () => {}, { platform: 'linux', about, releases, quit });
    choose(t, 'about');
    choose(t, 'releases');
    choose(t, 'quit');
    expect([about.mock.calls.length, releases.mock.calls.length, quit.mock.calls.length]).toEqual([
      1, 1, 1,
    ]);
    expect(RELEASES_URL).toBe('https://github.com/cschweda/drafter/releases');
  });
});

describe('parseCommands', () => {
  const good = [{ id: 'save', title: 'Save', group: 'File', keys: ['Mod-s'], enabled: true }];

  test('takes a list of commands', () => {
    expect(parseCommands(good)).toEqual(good);
    expect(parseCommands([{ id: 'a', title: 'A', group: 'Go', enabled: false }])).toEqual([
      { id: 'a', title: 'A', group: 'Go', enabled: false },
    ]);
    expect(parseCommands([])).toEqual([]);
  });

  test('keeps only the fields it knows', () => {
    const parsed = parseCommands([{ ...good[0], run: 'x', __proto__: { y: 1 } }]);
    expect(parsed).toEqual(good);
  });

  test('refuses anything that is not a list of well-formed commands', () => {
    const bad: unknown[] = [
      null,
      undefined,
      'save',
      {},
      { 0: good[0], length: 1 },
      [null],
      [{}],
      [{ ...good[0], id: '' }],
      [{ ...good[0], id: 5 }],
      [{ ...good[0], title: 5 }],
      [{ ...good[0], group: 'Modules' }],
      [{ ...good[0], enabled: 'yes' }],
      [{ ...good[0], keys: 'Mod-s' }],
      [{ ...good[0], keys: [5] }],
      [{ ...good[0], keys: ['a', 'b', 'c', 'd', 'e'] }],
      [{ ...good[0], keys: ['x'.repeat(41)] }],
      [{ ...good[0], id: 'x'.repeat(81) }],
      [{ ...good[0], title: 'x'.repeat(201) }],
      // Twice the same id.
      [good[0], good[0]],
    ];
    for (const payload of bad) expect(parseCommands(payload), JSON.stringify(payload)).toBeNull();
  });

  test('refuses a list that is too long', () => {
    const many = Array.from({ length: 401 }, (_, i) => ({ ...good[0], id: `c${i}` }));
    expect(parseCommands(many)).toBeNull();
    expect(parseCommands(many.slice(0, 400))).toHaveLength(400);
  });
});
