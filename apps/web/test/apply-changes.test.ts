// @vitest-environment jsdom
import { history, redo, undo } from '@codemirror/commands';
import { EditorState, type Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { parsedDoc, sceneIdAt, sceneIds, sceneMoved, sceneMovedEffect } from '@drafter/cm-fountain';
import { describe, expect, test } from 'vitest';
import { applyTextChanges } from '../app/editor/apply-changes';
import { editorExtensions, sceneMoveHistory } from '../app/editor/extensions';

describe('applyTextChanges, for a view', () => {
  test('carries annotations and a selection in its one transaction', () => {
    const seen: Transaction[] = [];
    const view = new EditorView({
      state: EditorState.create({
        doc: 'INT. A - DAY\n\nOne.\n\nINT. B - DAY\n\nTwo.\n',
        extensions: [
          parsedDoc,
          sceneIds,
          history(),
          EditorView.updateListener.of((u) => seen.push(...u.transactions)),
        ],
      }),
    });
    const a = sceneIdAt(view.state, 0);
    const text = 'INT. A - DAY\n\nOne.';
    expect(
      applyTextChanges(
        view,
        [
          { from: 0, to: 20, insert: '' },
          { from: 38, to: 38, insert: `\n\n${text}` },
        ],
        { annotations: [sceneMoved.of([{ from: 0, to: 20 }])], selection: { anchor: 22 } },
      ),
    ).toBe(true);
    expect(view.state.doc.toString()).toBe('INT. B - DAY\n\nTwo.\n\nINT. A - DAY\n\nOne.\n');
    expect(seen).toHaveLength(1);
    expect(sceneIdAt(view.state, 20)).toBe(a);
    expect(view.state.selection.main.head).toBe(22);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe('INT. A - DAY\n\nOne.\n\nINT. B - DAY\n\nTwo.\n');
  });

  test('the editor keeps scene ids', () => {
    const state = EditorState.create({
      doc: 'INT. A - DAY\n\nOne.\n',
      extensions: editorExtensions({
        template: () => {
          throw new Error('unused');
        },
        lintOptions: () => ({}),
        onCursorElement: () => {},
        onHint: () => {},
      }),
    });
    expect(sceneIdAt(state, 0)).toBeDefined();
  });
});

describe('scene ids through undo', () => {
  test('undoing a move gives the scene back its id, and redoing takes it along again', () => {
    const view = new EditorView({
      state: EditorState.create({
        doc: 'INT. A - DAY\n\nOne.\n\nINT. B - DAY\n\nTwo.\n',
        extensions: [parsedDoc, sceneIds, history(), sceneMoveHistory],
      }),
    });
    const a = sceneIdAt(view.state, 0);
    applyTextChanges(
      view,
      [
        { from: 0, to: 20, insert: '' },
        { from: 38, to: 38, insert: '\n\nINT. A - DAY\n\nOne.' },
      ],
      { effects: [sceneMovedEffect.of([{ from: 0, to: 20 }])] },
    );
    expect(sceneIdAt(view.state, 20)).toBe(a);
    undo(view);
    expect(view.state.doc.toString()).toBe('INT. A - DAY\n\nOne.\n\nINT. B - DAY\n\nTwo.\n');
    expect(sceneIdAt(view.state, 0)).toBe(a);
    redo(view);
    expect(sceneIdAt(view.state, 20)).toBe(a);
  });
});
