// @vitest-environment jsdom
import { acceptCompletion } from '@codemirror/autocomplete';
import { redo, undo, undoDepth } from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import {
  classicEnter,
  classicLine,
  classicTab,
  setSpellMarks,
  spellMarksOf,
} from '@drafter/cm-fountain';
import { builtins } from '@drafter/templates';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { applyEditorSettings } from '../app/editor/apply-settings';
import {
  classicIsOn,
  editorExtensions,
  typewriter,
  writingMode,
  writingModeExtension,
} from '../app/editor/extensions';
import { DEFAULT_SETTINGS } from '../app/settings/settings';

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
});

const extensions = () =>
  editorExtensions({
    template: () => builtins['us-screenplay'] as never,
    onCursorElement: () => {},
  });

function make() {
  const view = new EditorView({ parent: document.body, doc: 'One.\n', extensions: extensions() });
  views.push(view);
  return view;
}

describe('applyEditorSettings', () => {
  test('keeps typewriter scrolling when another setting changes', () => {
    const view = make();
    applyEditorSettings(view, { ...DEFAULT_SETTINGS, typewriter: true }, 'fountain');
    const scrolling = typewriter.get(view.state);
    // Rebuilding the plugin takes the room above and below the text away, and with it the
    // writer's place in a long script.
    const removed = vi.spyOn(view.contentDOM.style, 'removeProperty');

    applyEditorSettings(
      view,
      { ...DEFAULT_SETTINGS, typewriter: true, lineNumbers: true },
      'fountain',
    );
    applyEditorSettings(
      view,
      { ...DEFAULT_SETTINGS, typewriter: true, spellcheck: false },
      'fountain',
    );
    applyEditorSettings(view, { ...DEFAULT_SETTINGS, typewriter: true, textSize: 1.3 }, 'fountain');

    expect(typewriter.get(view.state)).toBe(scrolling);
    expect(removed).not.toHaveBeenCalled();
  });

  test('changes what changed, and nothing else', () => {
    const view = make();
    const dispatch = vi.spyOn(view, 'dispatch');
    // The settings are one dispatch of several reconfigurations (the lint's own is a single effect).
    const reconfigured = () =>
      dispatch.mock.calls.filter(([spec]) => Array.isArray((spec as { effects?: unknown }).effects))
        .length;
    applyEditorSettings(view, DEFAULT_SETTINGS, 'fountain');
    expect(reconfigured()).toBe(0); // already as the defaults say
    applyEditorSettings(view, { ...DEFAULT_SETTINGS, lineNumbers: true }, 'fountain');
    expect(reconfigured()).toBe(1);
    expect(view.dom.querySelector('.cm-lineNumbers')).not.toBeNull();
    applyEditorSettings(view, { ...DEFAULT_SETTINGS, lineNumbers: true }, 'fountain');
    expect(reconfigured()).toBe(1);
    applyEditorSettings(view, DEFAULT_SETTINGS, 'fountain');
    expect(view.dom.querySelector('.cm-lineNumbers')).toBeNull();
  });

  test('turns typewriter scrolling off and on again', () => {
    const view = make();
    applyEditorSettings(view, { ...DEFAULT_SETTINGS, typewriter: true }, 'fountain');
    const on = typewriter.get(view.state);
    applyEditorSettings(view, DEFAULT_SETTINGS, 'fountain');
    expect(typewriter.get(view.state)).not.toBe(on);
    applyEditorSettings(view, { ...DEFAULT_SETTINGS, typewriter: true }, 'fountain');
    expect(typewriter.get(view.state)).toBe(on);
  });

  test('the Source pane’s browser spellcheck is off with the setting on and off', () => {
    const view = make();
    // Drafter's own marks are there with the setting on, and gone with it off; the browser's
    // spellcheck is off either way (Plan D, Call 18).
    expect(view.contentDOM.getAttribute('spellcheck')).toBe('false');
    applyEditorSettings(view, { ...DEFAULT_SETTINGS, spellcheck: false }, 'fountain');
    expect(view.contentDOM.getAttribute('spellcheck')).toBe('false');
    expect(spellMarksOf(view.state)).toEqual([]);
    view.dispatch({ effects: setSpellMarks.of([{ from: 0, to: 3, word: 'One' }]) });
    expect(spellMarksOf(view.state)).toEqual([]);
    applyEditorSettings(view, { ...DEFAULT_SETTINGS, spellcheck: true }, 'fountain');
    expect(view.contentDOM.getAttribute('spellcheck')).toBe('false');
    view.dispatch({ effects: setSpellMarks.of([{ from: 0, to: 3, word: 'One' }]) });
    expect(spellMarksOf(view.state)).toEqual([{ from: 0, to: 3, word: 'One' }]);
    expect(view.contentDOM.querySelector('.cm-misspelled')?.textContent).toBe('One');
  });

  test('puts every setting back after a fresh state is loaded', () => {
    const view = make();
    applyEditorSettings(
      view,
      { ...DEFAULT_SETTINGS, typewriter: true, lineNumbers: true },
      'fountain',
    );
    view.setState(EditorState.create({ doc: 'Another.\n', extensions: extensions() }));
    expect(view.dom.querySelector('.cm-lineNumbers')).toBeNull();
    applyEditorSettings(
      view,
      { ...DEFAULT_SETTINGS, typewriter: true, lineNumbers: true },
      'fountain',
    );
    expect(view.dom.querySelector('.cm-lineNumbers')).not.toBeNull();
    expect(typewriter.get(view.state)).not.toEqual([]);
  });
});

describe('the writing mode', () => {
  const CLASSIC = { ...DEFAULT_SETTINGS, writingMode: 'classic' } as const;
  const SCRIPT = 'INT. DINER - DAY\n\nThe lights hum.\n\nJUNE\nStill open?\n';
  const BLOCK = '/* drafter\n{"v":1,"template":"stage-play"}\n*/';

  function script(doc = SCRIPT, selection?: EditorSelection) {
    const view = new EditorView({
      parent: document.body,
      state: EditorState.create({ doc, selection, extensions: extensions() }),
    });
    views.push(view);
    return view;
  }

  test('Classic Mode goes in and comes out with no change to the text', () => {
    const view = script();
    const dispatch = vi.spyOn(view, 'dispatch');
    applyEditorSettings(view, CLASSIC, 'fountain');
    expect(classicIsOn(view.state)).toBe(true);
    expect(view.state.doc.toString()).toBe(SCRIPT);
    applyEditorSettings(view, DEFAULT_SETTINGS, 'fountain');
    expect(classicIsOn(view.state)).toBe(false);
    expect(view.state.doc.toString()).toBe(SCRIPT);
    expect(dispatch.mock.calls.some(([spec]) => 'changes' in (spec as object))).toBe(false);
  });

  test('a switch keeps the undo depth and the selection', () => {
    const view = script();
    view.dispatch({ changes: { from: 0, insert: 'x' }, selection: { anchor: 1, head: 6 } });
    const depth = undoDepth(view.state);
    applyEditorSettings(view, CLASSIC, 'fountain');
    expect(undoDepth(view.state)).toBe(depth);
    expect(view.state.selection.main).toMatchObject({ anchor: 1, head: 6 });
    applyEditorSettings(view, DEFAULT_SETTINGS, 'fountain');
    expect(view.state.selection.main).toMatchObject({ anchor: 1, head: 6 });
    // Undo works across a switch.
    undo(view);
    expect(view.state.doc.toString()).toBe(SCRIPT);
    applyEditorSettings(view, CLASSIC, 'fountain');
    redo(view);
    expect(view.state.doc.toString()).toBe(`x${SCRIPT}`);
  });

  test('changing another setting doesn’t rebuild it', () => {
    const view = script();
    applyEditorSettings(view, CLASSIC, 'fountain');
    const held = writingMode.get(view.state);
    applyEditorSettings(view, { ...CLASSIC, lineNumbers: true }, 'fountain');
    applyEditorSettings(view, { ...CLASSIC, textSize: 1.3 }, 'fountain');
    expect(writingMode.get(view.state)).toBe(held);
    expect(writingModeExtension('classic', 'fountain')).toBe(held);
  });

  test('a load sets it again', () => {
    const view = script();
    applyEditorSettings(view, CLASSIC, 'fountain');
    view.setState(EditorState.create({ doc: 'Another.\n', extensions: extensions() }));
    expect(classicIsOn(view.state)).toBe(false);
    applyEditorSettings(view, CLASSIC, 'fountain');
    expect(classicIsOn(view.state)).toBe(true);
  });

  test('a Markdown document gets nothing, and the next script is Classic again', () => {
    const view = script();
    applyEditorSettings(view, CLASSIC, 'markdown');
    expect(classicIsOn(view.state)).toBe(false);
    expect(writingModeExtension('classic', 'markdown')).toBe(
      writingModeExtension('fountain', 'fountain'),
    );
    applyEditorSettings(view, CLASSIC, 'fountain');
    expect(classicIsOn(view.state)).toBe(true);
  });

  test('the compartment comes before language: Classic’s Enter is ahead of the list’s', () => {
    // Both sit at Prec.highest, so only the order of the two compartments settles it.
    const view = script('JUNE\nOne.\n\nTwo.\n', EditorSelection.single(9));
    applyEditorSettings(view, CLASSIC, 'fountain');
    const enters = view.state
      .facet(keymap)
      .flat()
      .filter((binding) => binding.key === 'Enter');
    const list = enters.findIndex((binding) => binding.run === acceptCompletion);
    expect(list).toBeGreaterThan(0);
    // The first Enter is Classic's own: it runs here, and writes what Classic writes after a speech.
    expect(enters[0]?.run?.(view)).toBe(true);
    expect(view.state.field(classicLine)?.kind).toBe('character');
  });

  test('a selection in the block is stopped above it, as the block is about to go', () => {
    const doc = `One.\n\n${BLOCK}\n`;
    const view = script(doc, EditorSelection.single(doc.length - 4));
    applyEditorSettings(view, CLASSIC, 'fountain');
    expect(view.state.selection.main.head).toBe(4);
    expect(view.state.doc.toString()).toBe(doc);
  });

  test('a line Enter made in a speech doesn’t stay to cut it in two', () => {
    const doc = 'JUNE\nOne.\nTwo.\n';
    const view = script(doc, EditorSelection.single(9));
    applyEditorSettings(view, CLASSIC, 'fountain');
    view.dispatch({ selection: { anchor: 8 } });
    view.dispatch({ selection: { anchor: 9 } });
    classicEnter(view);
    expect(view.state.field(classicLine)?.made).toBeTruthy();
    expect(view.state.doc.toString()).toBe('JUNE\nOne.\n\nTwo.\n');
    applyEditorSettings(view, DEFAULT_SETTINGS, 'fountain');
    expect(view.state.doc.toString()).toBe(doc);
    expect(view.state.selection.main.head).toBe(9);
  });

  test('a made () goes with its line, and Undo brings it back', () => {
    const doc = 'JUNE\nOne.\nTwo.\n';
    const view = script(doc, EditorSelection.single(9));
    applyEditorSettings(view, CLASSIC, 'fountain');
    view.dispatch({ selection: { anchor: 8 } });
    view.dispatch({ selection: { anchor: 9 } });
    classicTab(view);
    expect(view.state.doc.toString()).toBe('JUNE\nOne.\n()\nTwo.\n');
    applyEditorSettings(view, DEFAULT_SETTINGS, 'fountain');
    expect(view.state.doc.toString()).toBe(doc);
    undo(view);
    expect(view.state.doc.toString()).toBe('JUNE\nOne.\n()\nTwo.\n');
  });
});
