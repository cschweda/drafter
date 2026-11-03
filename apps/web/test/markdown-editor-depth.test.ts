// @vitest-environment jsdom

import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { expect, test } from 'vitest';
import { MAX_NESTING } from '../app/markdown/depth';
import { markdownMode } from '../app/markdown/editor';

// A quote nested thousands deep gave the Source pane a mark inside a mark for every level, and
// CodeMirror's view walks its marks by recursion: past a few thousand the walk ran out of stack in
// the middle of an update, and the update that drew the next text never reached the app (the flake
// in e2e/markdown.spec.ts, "nested too deeply to preview"). Marks stop nesting at the depth the
// Preview reads, MAX_NESTING.

/** The deepest run of marks inside marks in `root`. */
function deepest(root: Element): number {
  let most = 0;
  const walk = (el: Element, depth: number) => {
    const marked = el.classList.contains('cm-md-quote') || el.classList.contains('cm-md-marker');
    const here = depth + (marked ? 1 : 0);
    most = Math.max(most, here);
    for (const child of el.children) walk(child, here);
  };
  walk(root, 0);
  return most;
}

test('a quote nested thousands deep is marked no deeper than the Preview reads', () => {
  const doc = `${'>'.repeat(5_000)} x`;
  const state = EditorState.create({ doc, extensions: markdownMode() });
  ensureSyntaxTree(state, doc.length, 5_000);
  const parent = document.createElement('div');
  document.body.append(parent);
  const view = new EditorView({ state, parent });
  try {
    expect(deepest(view.contentDOM)).toBeLessThanOrEqual(MAX_NESTING + 1);
    // The marks it has are still there, to the depth that counts.
    expect(view.contentDOM.querySelector('.cm-md-quote')).not.toBeNull();
  } finally {
    view.destroy();
    parent.remove();
  }
});

test('a quote of a few levels is marked at every level', () => {
  const doc = '> > > three deep';
  const parent = document.createElement('div');
  document.body.append(parent);
  const state = EditorState.create({ doc, extensions: markdownMode() });
  ensureSyntaxTree(state, doc.length, 5_000);
  const view = new EditorView({ state, parent });
  try {
    expect(
      view.contentDOM.querySelectorAll('.cm-md-quote .cm-md-quote .cm-md-quote').length,
    ).toBeGreaterThan(0);
  } finally {
    view.destroy();
    parent.remove();
  }
});
