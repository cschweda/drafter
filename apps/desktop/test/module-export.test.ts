import { describe, expect, test } from 'vitest';
import { readExport } from '../src/module-export';

// What a folder module's index.js must default-export, as its frame's runtime checks it
// (docs/plans/2026-10-27-desktop-modules-folder.md §1).

const run = async () => {};
const mount = () => {};

describe('readExport', () => {
  test('takes a module with any of a button, commands, a tab, and settings', () => {
    const module = {
      id: 'tidy',
      action: { label: 'Tidy', run },
      commands: [{ id: 'trim', title: 'Tidy: remove spaces', run }],
      tab: { id: 'tidy', label: 'Tidy', mount },
      settings: { mount },
    };
    const read = readExport({ default: module }, 'tidy');
    expect(read).toEqual({
      module,
      parts: {
        action: { label: 'Tidy' },
        commands: [{ id: 'trim', title: 'Tidy: remove spaces' }],
        tab: { id: 'tidy', label: 'Tidy' },
        settings: true,
      },
    });
    expect(readExport({ default: { id: 'tidy' } }, 'tidy')).toMatchObject({
      parts: { commands: [], settings: false },
    });
  });

  test('says what is wrong with an export that isn’t a module', () => {
    const cases: [unknown, RegExp][] = [
      [{}, /no default export/],
      [{ default: 3 }, /not an object/],
      [{ default: { id: 'other' } }, /says its id is “other”, but its module.json says “tidy”/],
      [
        { default: { id: 'tidy', action: { label: 'Tidy' } } },
        /action needs a label and a run function/,
      ],
      [
        { default: { id: 'tidy', commands: [{ id: 'a', title: 'A' }] } },
        /each command needs .* a run function/,
      ],
      [{ default: { id: 'tidy', commands: {} } }, /commands must be a list/],
      [
        { default: { id: 'tidy', tab: { id: 'tidy', label: 'Tidy' } } },
        /tab needs .* a mount function/,
      ],
      [{ default: { id: 'tidy', settings: {} } }, /settings need a mount function/],
      [{ default: { id: 'tidy', tab: { id: 'Bad', label: 'T', mount } } }, /tab needs an id/],
    ];
    for (const [value, why] of cases) {
      expect(readExport(value, 'tidy'), JSON.stringify(value)).toMatch(why);
    }
  });
});
