// @vitest-environment jsdom
import { history, undo } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { DeletedScene, Place, ScenePrint } from '@drafter/history';
import { afterEach, describe, expect, test } from 'vitest';
import { applyTextChanges } from '../app/editor/apply-changes';
import { createPutBack, type PutBackDeps } from '../app/history/put-back';

// Put back from the Deleted scenes tab (version-history design §3.5, Calls 11 and 12): the scene's
// text from its snapshot, where the worker says it goes, as one change Undo takes out; refused with
// the Outline's reason in a read-only tab; it says where it went, and moves the editor's cursor to
// the scene's heading while focus stays in the list.

const NOW = 'INT. HALL - DAY\n\nMarra waits.\n\nEXT. ROOF - NIGHT\n\nWind.\n';
const CELLAR = 'INT. CELLAR - NIGHT\n\nA lamp swings.\n';

function entry(heading = 'INT. CELLAR - NIGHT'): DeletedScene {
  const print = { heading, hash: 'h', headingKey: heading } as ScenePrint;
  return {
    key: 'h',
    newest: {
      snapshot: 's1',
      at: 0,
      slot: { hash: 'h', ordinal: 2, from: 40, to: 80, section: false },
      print,
    },
    versions: 1,
    oldestAt: 0,
  };
}

function setup(place: Place | null, options: { readOnly?: string; text?: string | null } = {}) {
  const view = new EditorView({
    state: EditorState.create({ doc: NOW, extensions: [history()] }),
    parent: document.body,
  });
  const said: string[] = [];
  const asked: Array<{ snapshot: string; slot: number; now: string }> = [];
  const deps: PutBackDeps = {
    readOnly: () => options.readOnly ?? null,
    projectId: () => 'p1',
    text: () => view.state.doc.toString(),
    sceneText: async () => (options.text === undefined ? CELLAR : options.text),
    place: async (_project, now, snapshot, slot) => {
      asked.push({ snapshot, slot, now });
      return place;
    },
    apply: (changes, applyOptions) => applyTextChanges(view, changes, applyOptions),
    say: (message) => said.push(message),
  };
  return { view, said, asked, putBack: createPutBack(deps) };
}

const afterHall: Place = {
  at: NOW.indexOf('Marra waits.') + 12,
  side: 'after',
  anchor: 'INT. HALL - DAY',
};

afterEach(() => {
  document.body.replaceChildren();
});

describe('Put back in the app', () => {
  test('put back is one undo', async () => {
    const { view, putBack, asked } = setup(afterHall);
    expect(await putBack(entry())).toBe(true);
    expect(asked).toEqual([{ snapshot: 's1', slot: 1, now: NOW }]);
    expect(view.state.doc.toString()).toBe(
      'INT. HALL - DAY\n\nMarra waits.\n\nINT. CELLAR - NIGHT\n\nA lamp swings.\n\nEXT. ROOF - NIGHT\n\nWind.\n',
    );
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(NOW);
  });

  test("refused with the Outline's reason in a read-only tab", async () => {
    const why = 'This script is open for editing in another tab.';
    const { view, putBack, said, asked } = setup(afterHall, { readOnly: why });
    expect(await putBack(entry())).toBe(false);
    expect(said).toEqual([why]);
    expect(asked).toEqual([]);
    expect(view.state.doc.toString()).toBe(NOW);
  });

  test('says after, before, or at the end', async () => {
    const one = setup(afterHall);
    await one.putBack(entry());
    expect(one.said).toEqual([
      'Put back INT. CELLAR - NIGHT after INT. HALL - DAY. Undo takes it out.',
    ]);
    document.body.replaceChildren();
    const two = setup({
      at: NOW.indexOf('EXT. ROOF'),
      side: 'before',
      anchor: 'EXT. ROOF - NIGHT',
    });
    await two.putBack(entry());
    expect(two.said).toEqual([
      'Put back INT. CELLAR - NIGHT before EXT. ROOF - NIGHT. Undo takes it out.',
    ]);
    document.body.replaceChildren();
    const three = setup({ at: NOW.length, side: 'end', anchor: null });
    await three.putBack(entry());
    expect(three.said).toEqual([
      'Put back INT. CELLAR - NIGHT at the end of the script. Undo takes it out.',
    ]);
    expect(three.view.state.doc.toString()).toBe(`${NOW}\n${CELLAR}`);
    // A version that can't be read, or no place: nothing changes, and it says so.
    document.body.replaceChildren();
    const four = setup(afterHall, { text: null });
    expect(await four.putBack(entry())).toBe(false);
    expect(four.said).toEqual(['That version of INT. CELLAR - NIGHT can’t be read.']);
    expect(four.view.state.doc.toString()).toBe(NOW);
  });

  test('moves the cursor to the scene and keeps focus in the list', async () => {
    const { view, putBack } = setup(afterHall);
    const row = document.createElement('div');
    row.tabIndex = 0;
    document.body.append(row);
    row.focus();
    await putBack(entry());
    const head = view.state.selection.main.head;
    expect(view.state.doc.toString().slice(head, head + 19)).toBe('INT. CELLAR - NIGHT');
    expect(document.activeElement).toBe(row);
  });
});
