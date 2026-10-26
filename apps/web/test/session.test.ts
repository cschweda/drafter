// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { undo } from '@codemirror/commands';
import type { ChangeSet } from '@codemirror/state';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { useProblems } from '../app/editor/problems';
import { useEditor } from '../app/editor/session';
import { useSettings } from '../app/settings/settings';

// The editor session itself, with the real editor and its extensions (undo history included).
// Only the panes, which are Nuxt state, are stood in for.
vi.mock('~/composables/usePanes', async () => {
  const { ref } = await import('vue');
  const tabs = ref({ left: 'source', right: 'script' });
  const phoneTab = ref('script');
  return { usePanes: () => ({ tabs, phoneTab }) };
});

// jsdom has no layout; CodeMirror's measuring asks a range for its rectangles.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();

const forget: Array<() => void> = [];
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  for (const f of forget.splice(0)) f();
  vi.restoreAllMocks();
});

describe("the editor session's listeners", () => {
  test('one that throws stops neither the others nor the recovery copy', () => {
    const editor = useEditor();
    editor.load('INT. HALL - DAY\n\nShe waits.\n');
    const heard: string[] = [];
    forget.push(
      editor.onChange(() => {
        throw new RangeError('A module problem was mapped past the end.');
      }),
      editor.onChange(() => void heard.push('change')),
      // The recovery copy is written from an `onState` listener (storage/script.ts).
      editor.onState(() => void heard.push('state')),
      editor.onUpdate(() => void heard.push('update')),
    );

    editor.view.dispatch({ changes: { from: 0, insert: 'x' } });
    expect(heard).toEqual(['change', 'state', 'update']);
    // And again on the next keystroke: nothing was left half done.
    editor.view.dispatch({ changes: { from: 1, insert: 'y' } });
    expect(heard).toEqual(['change', 'state', 'update', 'change', 'state', 'update']);
    expect(editor.view.state.doc.toString()).toBe('xyINT. HALL - DAY\n\nShe waits.\n');
    // The failure is reported, not swallowed.
    expect(console.error).toHaveBeenCalled();

    // A new script is announced to every listener as well.
    heard.length = 0;
    editor.load('INT. YARD - NIGHT\n');
    // (Its settings and scroll are effects, which `onUpdate` hears of too.)
    expect(heard.filter((h) => h !== 'update')).toEqual(['change', 'state']);
    expect(heard).toContain('update');
  });
});

describe('Fix all', () => {
  const STRICT = 'INT. HALL - DAY\nShe waits.\n\nMARGARET\n(quietly,\nthen louder)\nHi.\n';
  const FIXED = 'INT. HALL - DAY\n\nShe waits.\n\nMARGARET\n(quietly, then louder)\nHi.\n';

  test('is an undo step of its own, never joined to the typing right after it', async () => {
    await useSettings().set('strict', true);
    const editor = useEditor();
    editor.load(STRICT);
    const { fixAll } = useProblems();
    let fixed: ChangeSet | undefined;
    forget.push(
      editor.onChange((changes) => {
        if (changes && !fixed) fixed = changes;
      }),
    );

    fixAll();
    expect(editor.view.state.doc.toString()).toBe(FIXED);
    // A key typed at once, touching the text the fix wrote (the space that joined the lines).
    let at = -1;
    fixed?.iterChanges((_fromA, _toA, _fromB, toB) => {
      at = toB;
    });
    expect(FIXED.slice(at - 1, at)).toBe(' ');
    editor.view.dispatch({ changes: { from: at, insert: 'z' }, userEvent: 'input.type' });
    expect(editor.view.state.doc.toString()).toBe(`${FIXED.slice(0, at)}z${FIXED.slice(at)}`);

    // One undo takes back the typing only; the next, the fix.
    undo(editor.view);
    expect(editor.view.state.doc.toString()).toBe(FIXED);
    undo(editor.view);
    expect(editor.view.state.doc.toString()).toBe(STRICT);
  });
});
