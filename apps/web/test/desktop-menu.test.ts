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
