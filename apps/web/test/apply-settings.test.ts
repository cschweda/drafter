// @vitest-environment jsdom
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { builtins } from '@drafter/templates';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { applyEditorSettings } from '../app/editor/apply-settings';
import { editorExtensions, typewriter } from '../app/editor/extensions';
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
    applyEditorSettings(view, { ...DEFAULT_SETTINGS, typewriter: true });
    const scrolling = typewriter.get(view.state);
    // Rebuilding the plugin takes the room above and below the text away, and with it the
    // writer's place in a long script.
    const removed = vi.spyOn(view.contentDOM.style, 'removeProperty');

    applyEditorSettings(view, { ...DEFAULT_SETTINGS, typewriter: true, lineNumbers: true });
    applyEditorSettings(view, { ...DEFAULT_SETTINGS, typewriter: true, spellcheck: false });
    applyEditorSettings(view, { ...DEFAULT_SETTINGS, typewriter: true, textSize: 1.3 });

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
    applyEditorSettings(view, DEFAULT_SETTINGS);
    expect(reconfigured()).toBe(0); // already as the defaults say
    applyEditorSettings(view, { ...DEFAULT_SETTINGS, lineNumbers: true });
    expect(reconfigured()).toBe(1);
    expect(view.dom.querySelector('.cm-lineNumbers')).not.toBeNull();
    applyEditorSettings(view, { ...DEFAULT_SETTINGS, lineNumbers: true });
    expect(reconfigured()).toBe(1);
    applyEditorSettings(view, DEFAULT_SETTINGS);
    expect(view.dom.querySelector('.cm-lineNumbers')).toBeNull();
  });

  test('turns typewriter scrolling off and on again', () => {
    const view = make();
    applyEditorSettings(view, { ...DEFAULT_SETTINGS, typewriter: true });
    const on = typewriter.get(view.state);
    applyEditorSettings(view, DEFAULT_SETTINGS);
    expect(typewriter.get(view.state)).not.toBe(on);
    applyEditorSettings(view, { ...DEFAULT_SETTINGS, typewriter: true });
    expect(typewriter.get(view.state)).toBe(on);
  });

  test('puts every setting back after a fresh state is loaded', () => {
    const view = make();
    applyEditorSettings(view, { ...DEFAULT_SETTINGS, typewriter: true, lineNumbers: true });
    view.setState(EditorState.create({ doc: 'Another.\n', extensions: extensions() }));
    expect(view.dom.querySelector('.cm-lineNumbers')).toBeNull();
    applyEditorSettings(view, { ...DEFAULT_SETTINGS, typewriter: true, lineNumbers: true });
    expect(view.dom.querySelector('.cm-lineNumbers')).not.toBeNull();
    expect(typewriter.get(view.state)).not.toEqual([]);
  });
});
