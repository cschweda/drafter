// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  type Command,
  clearCommands,
  installGlobalKeys,
  registerCommands,
  unregisterCommands,
  useCommands,
} from '../app/commands/registry';

function command(id: string, extra: Partial<Command> = {}): Command {
  return { id, title: id, group: 'File', run: () => {}, ...extra };
}

beforeEach(() => clearCommands());

describe('the command registry', () => {
  test('lists every command once, by id', () => {
    registerCommands([command('a'), command('b')]);
    registerCommands([command('c')]);
    expect(useCommands().value.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  test('rejects two commands with the same id', () => {
    registerCommands([command('a')]);
    expect(() => registerCommands([command('a')])).toThrow(/a/);
    expect(() => registerCommands([command('x'), command('x')])).toThrow(/x/);
    // A rejected list adds none of its commands.
    expect(useCommands().value.map((c) => c.id)).toEqual(['a']);
  });

  test('takes commands away by id, so a module can leave and come back', () => {
    registerCommands([command('a'), command('b'), command('c')]);
    unregisterCommands(['b', 'nothing']);
    expect(useCommands().value.map((c) => c.id)).toEqual(['a', 'c']);
    registerCommands([command('b', { group: 'Fixture' })]);
    expect(useCommands().value.map((c) => [c.id, c.group])).toEqual([
      ['a', 'File'],
      ['c', 'File'],
      ['b', 'Fixture'],
    ]);
  });
});

describe('the keys that belong to the app', () => {
  function setup(extra: Partial<Command> = {}) {
    const run = vi.fn();
    registerCommands([
      command('save', { keys: 'Mod-s', global: true, run, ...extra }),
      command('editor', { keys: 'Mod-f', run: vi.fn() }),
    ]);
    const stop = installGlobalKeys(false);
    const press = (init: KeyboardEventInit) => {
      const event = new KeyboardEvent('keydown', { cancelable: true, bubbles: true, ...init });
      window.dispatchEvent(event);
      return event;
    };
    return { run, stop, press };
  }

  test('runs a command from its key, and keeps the browser from acting on it', () => {
    const { run, stop, press } = setup();
    const event = press({ key: 's', ctrlKey: true });
    expect(run).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
    stop();
  });

  test('runs a command once however long the key is held', () => {
    const { run, stop, press } = setup();
    press({ key: 's', ctrlKey: true });
    const repeat = press({ key: 's', ctrlKey: true, repeat: true });
    expect(run).toHaveBeenCalledOnce();
    expect(repeat.defaultPrevented).toBe(true);
    stop();
  });

  test('leaves a key whose command is the editor’s to the editor', () => {
    const { stop, press } = setup();
    const event = press({ key: 'f', ctrlKey: true });
    expect(event.defaultPrevented).toBe(false);
    stop();
  });

  test('keeps the key from the browser, and does nothing, while the command is off', () => {
    const { run, stop, press } = setup({ enabled: () => false });
    const event = press({ key: 's', ctrlKey: true });
    expect(run).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    stop();
  });

  test('stops listening when removed', () => {
    const { run, stop, press } = setup();
    stop();
    press({ key: 's', ctrlKey: true });
    expect(run).not.toHaveBeenCalled();
  });

  test('stops the key reaching anything else on the page', () => {
    const { run, stop } = setup();
    const elsewhere = vi.fn();
    document.addEventListener('keydown', elsewhere);
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }),
    );
    expect(run).toHaveBeenCalledOnce();
    expect(elsewhere).not.toHaveBeenCalled();
    document.removeEventListener('keydown', elsewhere);
    stop();
  });
});
