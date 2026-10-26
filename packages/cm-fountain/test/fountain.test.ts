import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { completionStatus, currentCompletions } from '@codemirror/autocomplete';
import { foldable } from '@codemirror/language';
import { diagnosticCount, forceLinting } from '@codemirror/lint';
import { EditorState } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import { type CursorElement, cursorElement, fountain, parsedDoc } from '@drafter/cm-fountain';
import { builtins, type Template } from '@drafter/templates';
import { afterEach, describe, expect, it, vi } from 'vitest';

// jsdom has no layout, and CodeMirror measures ranges of text to scroll the cursor into view, as
// a command that moves it asks. These give every range an empty box, which is all it needs.
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) {
    view.dom.parentElement?.remove();
    view.destroy();
  }
});

function mount(doc: string, extension = fountain(), anchor = doc.length) {
  const parent = document.createElement('div');
  document.body.append(parent);
  const view = new EditorView({
    state: EditorState.create({ doc, selection: { anchor }, extensions: [extension] }),
    parent,
  });
  views.push(view);
  return view;
}

const key = (view: EditorView, name: string) =>
  runScopeHandlers(view, new KeyboardEvent('keydown', { key: name, bubbles: true }), 'editor');

const template = builtins['us-screenplay'] as Template;
const sample = readFileSync(
  join(import.meta.dirname, '../../../samples/screenplay.fountain'),
  'utf8',
);

describe('fountain()', () => {
  it('runs the sample screenplay in an EditorView without errors', async () => {
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => errors.push(event.error);
    window.addEventListener('error', onError);
    const seen: Array<CursorElement | null> = [];
    const lintTemplate = vi.fn(() => template);
    const view = mount(
      sample,
      fountain({
        template: lintTemplate,
        onCursorElement: (element) => seen.push(element),
      }),
      0,
    );
    const doc = view.state.field(parsedDoc);
    expect(doc.source).toBe(sample);
    expect(doc.titlePage?.fields[0]?.key).toBe('Title');
    expect(doc.blocks.length).toBeGreaterThan(20);
    expect(cursorElement(view.state)).toEqual({ blockIndex: -1, lineIndex: 0, kind: 'title_page' });
    // The highlighting is in the DOM.
    expect(view.contentDOM.querySelector('.cm-f-scene_heading')).not.toBeNull();
    expect(view.contentDOM.querySelector('.cm-f-title-key')?.textContent).toBe('Title:');
    // A click on a line moves the cursor to its element, and reports it.
    const pos = sample.indexOf('INT. KITCHEN');
    view.dispatch({ selection: { anchor: pos + 2 }, userEvent: 'select.pointer' });
    const element = cursorElement(view.state);
    expect(element).toMatchObject({ lineIndex: 0, kind: 'scene_heading' });
    expect(doc.blocks[element?.blockIndex as number]?.kind).toBe('scene_heading');
    expect(seen.at(-1)).toEqual(element);
    // Folding reads the same parse.
    const heading = view.state.doc.lineAt(pos);
    expect(foldable(view.state, heading.from, heading.to)).not.toBeNull();
    // The linter runs on it, and the sample has nothing to report.
    forceLinting(view);
    await vi.waitFor(() => expect(lintTemplate).toHaveBeenCalled());
    expect(diagnosticCount(view.state)).toBe(0);
    window.removeEventListener('error', onError);
    expect(errors).toEqual([]);
  });

  it('works with no options, and adds no lint or callback', () => {
    const view = mount('INT. A - DAY\n\nOne.\n', fountain(), 15);
    expect(view.dom.querySelector('.cm-gutter-lint')).toBeNull();
    expect(cursorElement(view.state)).toMatchObject({ kind: 'action' });
    // Enter at the end of a heading is the keymap's: two breaks, and not the default's one.
    view.dispatch({ selection: { anchor: 12 } });
    expect(key(view, 'Enter')).toBe(true);
    expect(view.state.doc.toString()).toBe('INT. A - DAY\n\n\n\nOne.\n');
  });

  it('adds the lint gutter when it has a template', () => {
    const view = mount('INT. A - DAY\n', fountain({ template: () => template }));
    expect(view.dom.querySelector('.cm-gutter-lint')).not.toBeNull();
  });

  it('opens the name list after Tab starts a cue', async () => {
    const view = mount('MARGARET\nHi.\n\nBRICK\nHo.\n\nMARGARET\nHa.\n\n');
    expect(key(view, 'Tab')).toBe(true);
    expect(view.state.doc.toString().endsWith('\n\n@')).toBe(true);
    await vi.waitFor(() => expect(currentCompletions(view.state).length).toBeGreaterThan(0), {
      timeout: 3000,
    });
    expect(currentCompletions(view.state).map((c) => c.label)).toEqual(['MARGARET', 'BRICK']);
  });

  it('does not open a list when Tab does something else', async () => {
    const view = mount('MARGARET\nHi.\n', fountain(), 3);
    // Tab on a cue cycles its extension.
    expect(key(view, 'Tab')).toBe(true);
    expect(view.state.doc.toString()).toBe('MARGARET (V.O.)\nHi.\n');
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(completionStatus(view.state)).toBeNull();
  });
});
