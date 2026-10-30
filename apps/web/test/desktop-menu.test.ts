// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { COMMAND_DATA } from '../app/commands/data';
import { installDesktopMenu, menuCommands } from '../app/commands/desktop-menu';
import {
  type Command,
  clearCommands,
  registerCommands,
  useCommands,
} from '../app/commands/registry';
import type { DesktopBridge, DesktopMenuCommand } from '../app/desktop';
import { exportApplies } from '../app/storage/export';

function command(id: string, extra: Partial<Command> = {}): Command {
  const data = COMMAND_DATA.find((c) => c.id === id);
  return { id, title: id, group: 'File', run: () => {}, ...data, ...extra };
}

/** A bridge whose menu records what the page sends, and lets the test choose an item. */
function bridge() {
  const sent: DesktopMenuCommand[][] = [];
  let choose: ((id: string) => void) | undefined;
  let stops = 0;
  window.drafterDesktop = {
    version: '0',
    platform: 'linux',
    files: {} as never,
    onOpenFile: () => () => {},
    onCloseRequest: () => () => {},
    menu: {
      setCommands: (list) => void sent.push(JSON.parse(JSON.stringify(list))),
      onCommand(onRun) {
        choose = onRun;
        return () => {
          stops += 1;
          choose = undefined;
        };
      },
    },
  } satisfies DesktopBridge;
  return {
    sent,
    choose: (id: string) => choose?.(id),
    listening: () => choose !== undefined,
    stops: () => stops,
  };
}

beforeEach(() => {
  clearCommands();
  vi.useFakeTimers();
  vi.stubGlobal('__DRAFTER_DESKTOP__', true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete window.drafterDesktop;
});

describe('menuCommands', () => {
  test('lists the built-in commands with their keys and whether they apply', () => {
    const list = menuCommands([
      command('save', { keys: 'Mod-s' }),
      command('revert-to-saved', { enabled: () => false }),
      command('open', { enabled: () => true }),
    ]);
    expect(list).toEqual([
      { id: 'save', title: 'Save', group: 'File', keys: ['Mod-s'], enabled: true },
      { id: 'revert-to-saved', title: 'Revert to Saved', group: 'File', enabled: false },
      { id: 'open', title: 'Open…', group: 'File', keys: ['Mod-o'], enabled: true },
    ]);
  });

  test('leaves a script module’s commands to the palette', () => {
    const list = menuCommands([
      command('save'),
      { id: 'mod-thing', title: 'Do a thing', group: 'My module', run: () => {} },
      // Even one that calls its group by a menu's name: it isn't one of Drafter's own.
      { id: 'mod-file', title: 'Do another', group: 'File', run: () => {} },
    ]);
    expect(list.map((c) => c.id)).toEqual(['save']);
  });

  test('says a command is off when asking whether it applies throws', () => {
    const list = menuCommands([
      command('save', {
        enabled: () => {
          throw new Error('no editor');
        },
      }),
    ]);
    expect(list[0]?.enabled).toBe(false);
  });
});

describe('installDesktopMenu', () => {
  test('does nothing in a browser', () => {
    vi.unstubAllGlobals();
    const t = bridge();
    const stop = installDesktopMenu();
    registerCommands([command('save')]);
    vi.advanceTimersByTime(2000);
    expect(t.sent).toEqual([]);
    expect(t.listening()).toBe(false);
    stop();
  });

  test('sends the list at the start, and again when a command starts to apply (debounced)', async () => {
    const t = bridge();
    let on = false;
    registerCommands([command('save'), command('revert-to-saved', { enabled: () => on })]);
    const stop = installDesktopMenu();
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]?.map((c) => [c.id, c.enabled])).toEqual([
      ['save', true],
      ['revert-to-saved', false],
    ]);
    // Nothing changed: nothing sent, however long it is left.
    vi.advanceTimersByTime(3000);
    expect(t.sent).toHaveLength(1);
    // It changes (in a way no Vue ref shows, as the editor's state doesn't): sent once, after ~100 ms.
    on = true;
    vi.advanceTimersByTime(1000);
    expect(t.sent).toHaveLength(2);
    expect(t.sent[1]?.find((c) => c.id === 'revert-to-saved')?.enabled).toBe(true);
    stop();
  });

  test('sends one list for a burst of changes', async () => {
    const t = bridge();
    registerCommands([command('save')]);
    const stop = installDesktopMenu();
    registerCommands([command('open')]);
    registerCommands([command('settings')]);
    await vi.advanceTimersByTimeAsync(99);
    expect(t.sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10);
    expect(t.sent).toHaveLength(2);
    expect(t.sent[1]?.map((c) => c.id)).toEqual(['save', 'open', 'settings']);
    stop();
  });

  test('runs the registered command when the menu chooses it, once', () => {
    const t = bridge();
    const run = vi.fn();
    registerCommands([command('save', { run })]);
    const stop = installDesktopMenu();
    t.choose('save');
    expect(run).toHaveBeenCalledTimes(1);
    stop();
  });

  test('does not run a command that is off, or one it doesn’t have', () => {
    const t = bridge();
    const run = vi.fn();
    registerCommands([command('save', { run, enabled: () => false })]);
    const stop = installDesktopMenu();
    t.choose('save');
    t.choose('no-such-command');
    expect(run).not.toHaveBeenCalled();
    stop();
  });

  test('keeps going when a command fails', async () => {
    const t = bridge();
    registerCommands([
      command('save', {
        run: () => Promise.reject(new Error('disk')),
      }),
    ]);
    const stop = installDesktopMenu();
    expect(() => t.choose('save')).not.toThrow();
    await Promise.resolve();
    stop();
  });

  test('stops listening and sending when it is removed', () => {
    const t = bridge();
    let on = false;
    registerCommands([command('save', { enabled: () => on })]);
    const stop = installDesktopMenu();
    stop();
    expect(t.stops()).toBe(1);
    on = true;
    vi.advanceTimersByTime(3000);
    expect(t.sent).toHaveLength(1);
  });
});

describe('the Outline in the desktop menus', () => {
  test('puts the outline commands in the File, Edit, and View menus', () => {
    const ids = [
      'show-outline',
      'condense',
      'expand-all',
      'move-scene-up',
      'move-scene-down',
      'expand-outline',
      'export-treatment',
      'screenplay-from-outline',
    ];
    registerCommands(ids.map((id) => command(id)));
    const groups = Object.fromEntries(
      menuCommands(useCommands().value).map((c) => [c.id, c.group]),
    );
    expect(groups).toEqual({
      'show-outline': 'View',
      condense: 'View',
      'expand-all': 'View',
      'move-scene-up': 'Edit',
      'move-scene-down': 'Edit',
      'expand-outline': 'Edit',
      'export-treatment': 'File',
      'screenplay-from-outline': 'File',
    });
  });
});

describe('Cards and notes in the desktop menus', () => {
  test('puts Show Cards and Show Notes in View, and Scene details, New note, Setup, and Payoff in Edit', () => {
    const ids = [
      'show-cards',
      'show-notes',
      'scene-details',
      'new-note',
      'mark-setup',
      'mark-payoff',
    ];
    registerCommands(ids.map((id) => command(id)));
    const groups = Object.fromEntries(
      menuCommands(useCommands().value).map((c) => [c.id, c.group]),
    );
    expect(groups).toEqual({
      'show-cards': 'View',
      'show-notes': 'View',
      'scene-details': 'Edit',
      'new-note': 'Edit',
      'mark-setup': 'Edit',
      'mark-payoff': 'Edit',
    });
  });
});

describe('The guided starters in the desktop menus', () => {
  test('puts New guided screenplay and New guided stage play in File', () => {
    const ids = ['new-guided-screenplay', 'new-guided-stage-play'];
    registerCommands(ids.map((id) => command(id)));
    const sent = menuCommands(useCommands().value).map((c) => [c.id, c.title, c.group]);
    expect(sent).toEqual([
      ['new-guided-screenplay', 'New guided screenplay', 'File'],
      ['new-guided-stage-play', 'New guided stage play', 'File'],
    ]);
  });
});

describe('Open as screenplay in the desktop menus', () => {
  test('hands the menu Open as screenplay… in File, after Open, with no key', () => {
    registerCommands(['open', 'open-as-screenplay'].map((id) => command(id)));
    expect(menuCommands(useCommands().value)).toEqual([
      { id: 'open', title: 'Open…', group: 'File', keys: ['Mod-o'], enabled: true },
      { id: 'open-as-screenplay', title: 'Open as screenplay…', group: 'File', enabled: true },
    ]);
  });
});

describe('Snapshots and Compare in the desktop menus', () => {
  test('puts History… and Take snapshot… in File, and Next change, Previous change, and Close comparison in View', () => {
    const ids = ['history', 'take-snapshot', 'next-change', 'previous-change', 'close-compare'];
    registerCommands(ids.map((id) => command(id)));
    const groups = Object.fromEntries(
      menuCommands(useCommands().value).map((c) => [c.id, c.group]),
    );
    expect(groups).toEqual({
      history: 'File',
      'take-snapshot': 'File',
      'next-change': 'View',
      'previous-change': 'View',
      'close-compare': 'View',
    });
  });
});

describe('Spellcheck in the desktop menus', () => {
  test('puts Check spelling, Spelling suggestions, Next misspelling, and Previous misspelling in the menus', () => {
    const ids = [
      'check-spelling',
      'spelling-suggestions',
      'add-to-script-dictionary',
      'add-to-my-dictionary',
      'ignore-misspelling',
      'next-misspelling',
      'previous-misspelling',
    ];
    registerCommands(ids.map((id) => command(id)));
    const list = menuCommands(useCommands().value);
    const groups = Object.fromEntries(list.map((c) => [c.id, c.group]));
    // Next and Previous misspelling go with Next and Previous problem, in Go.
    expect(groups).toEqual({
      'check-spelling': 'Edit',
      'spelling-suggestions': 'Edit',
      'add-to-script-dictionary': 'Edit',
      'add-to-my-dictionary': 'Edit',
      'ignore-misspelling': 'Edit',
      'next-misspelling': 'Go',
      'previous-misspelling': 'Go',
    });
    expect(list.find((c) => c.id === 'spelling-suggestions')?.keys).toEqual(['Mod-.']);
  });
});

describe('The structure strip in the desktop menus', () => {
  test('puts Toggle the structure strip in View, with Mod+Alt+O', () => {
    registerCommands([command('toggle-structure-strip')]);
    expect(menuCommands(useCommands().value)).toEqual([
      {
        id: 'toggle-structure-strip',
        title: 'Toggle the structure strip',
        group: 'View',
        keys: ['Mod-Alt-o'],
        enabled: true,
      },
    ]);
  });
});

describe('Export in the desktop menus', () => {
  test('the menu carries each export’s enabled from exportApplies: PDF on for both kinds', () => {
    // The commands are registered here with `enabled` from `exportApplies`, as builtin.ts does
    // (the real builtins need Nuxt's auto-imports). The desktop e2e chooses File → Export → PDF
    // for a Markdown document against the real ones.
    const ids = ['export-pdf', 'export-md', 'export-txt', 'export-fdx'] as const;
    const menuFor = (kind: 'fountain' | 'markdown') => {
      clearCommands();
      registerCommands(
        ids.map((id) =>
          command(id, { enabled: () => exportApplies(id.slice('export-'.length) as never, kind) }),
        ),
      );
      return menuCommands(useCommands().value);
    };
    expect(menuFor('markdown')).toEqual([
      { id: 'export-pdf', title: 'Export as PDF', group: 'File', enabled: true },
      expect.objectContaining({ id: 'export-md', group: 'File', enabled: true }),
      expect.objectContaining({ id: 'export-txt', group: 'File', enabled: true }),
      expect.objectContaining({ id: 'export-fdx', group: 'File', enabled: false }),
    ]);
    expect(menuFor('fountain').map((c) => [c.id, c.enabled])).toEqual([
      ['export-pdf', true],
      ['export-md', true],
      ['export-txt', true],
      ['export-fdx', true],
    ]);
  });

  test('File › Export lists Markdown file for a script', () => {
    // A screenplay's or a stage play's Markdown export is the same command as a Markdown
    // document's: the desktop app's File › Export submenu shows it, on, as "Markdown file".
    registerCommands([command('export-md', { enabled: () => exportApplies('md', 'fountain') })]);
    expect(menuCommands(useCommands().value)).toEqual([
      { id: 'export-md', title: 'Export as Markdown file', group: 'File', enabled: true },
    ]);
  });
});

describe('Export options in the desktop menus', () => {
  test('puts Export options… in File → Export, last', () => {
    // Every export command, in the order the registry has them: the desktop app's File → Export
    // submenu picks them by their `export-` prefix, in this order.
    const ids = COMMAND_DATA.filter((c) => c.id.startsWith('export-')).map((c) => c.id);
    registerCommands(ids.map((id) => command(id)));
    const sent = menuCommands(useCommands().value).filter((c) => c.id.startsWith('export-'));
    expect(sent.map((c) => c.id)).toEqual([
      'export-pdf',
      'export-md',
      'export-txt',
      'export-fdx',
      'export-treatment',
      'export-options',
    ]);
    expect(sent.at(-1)).toMatchObject({ title: 'Export options…', group: 'File' });
  });
});
