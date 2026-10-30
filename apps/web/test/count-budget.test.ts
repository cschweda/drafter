import 'fake-indexeddb/auto';
import type { ChangeSet } from '@codemirror/state';
import { EditorState } from '@codemirror/state';
import { parsedDoc } from '@drafter/cm-fountain';
import type { Doc } from '@drafter/fountain';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// The goal and the counts as the app wires them (`useGoal`, `useCounts`), over an editor that is
// only its state: the reparse CodeMirror does on each key, and what the session does after it.
const editor = vi.hoisted(() => ({
  state: null as unknown as EditorState,
  listeners: new Set<(changes: ChangeSet | null) => void>(),
}));
vi.mock('../app/editor/session', async () => {
  const { shallowRef } = await import('vue');
  const doc = shallowRef<Doc>(undefined as unknown as Doc);
  const kind = shallowRef<'fountain' | 'markdown'>('fountain');
  const { builtins } = await import('@drafter/templates');
  const template = shallowRef(builtins['us-screenplay']);
  return {
    useEditor: () => ({
      doc,
      kind,
      template,
      onChange: (listener: (changes: ChangeSet | null) => void) => {
        editor.listeners.add(listener);
        return () => editor.listeners.delete(listener);
      },
    }),
  };
});
vi.mock('../app/editor/layout', async () => {
  const { shallowRef } = await import('vue');
  const layout = shallowRef(null);
  const shownSeq = shallowRef(0);
  return { useLayout: () => ({ layout, shownSeq, requestedSeq: () => 0 }) };
});
vi.mock('../app/markdown/use-markdown', async () => {
  const { shallowRef, ref } = await import('vue');
  return {
    useMarkdown: () => ({ tree: shallowRef(null), words: shallowRef(0), updating: ref(false) }),
  };
});
vi.mock('../app/storage/script', async () => {
  const { shallowRef } = await import('vue');
  const project = shallowRef({ id: 'budget', sample: false });
  return { useScript: () => ({ project }) };
});
vi.mock('../app/storage/guard', async () => {
  const { ref } = await import('vue');
  return { useGuard: () => ({ readOnly: ref(false) }) };
});

/** Well over 120 pages: 800 scenes of a heading, action, and a speech, some 200,000 characters. */
function longScript(): string {
  const scene = (n: number) =>
    `INT. ROOM ${n} - DAY\n\nMara crosses to the window and looks down at the street, where the rain has not stopped since morning.\n\nMARA\nIf he comes back, tell him I waited. Tell him I waited all night, and that I am not waiting again.\n\nShe picks up her coat.\n\n`;
  let text = 'Title: Budget\n\n';
  for (let n = 1; n <= 800; n++) text += scene(n);
  return text;
}

beforeEach(() => {
  vi.resetModules();
  editor.listeners.clear();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date(2026, 9, 26, 12));
});
afterEach(() => {
  vi.useRealTimers();
});

/** Puts `text` in the editor as the session would: a load (null) or an edit (its changes). */
async function put(text: string, load: boolean) {
  const { useEditor } = await import('../app/editor/session');
  const session = useEditor() as unknown as { doc: { value: Doc } };
  let changes: ChangeSet | null = null;
  if (load) {
    editor.state = EditorState.create({ doc: text, extensions: [parsedDoc] });
  } else {
    const tr = editor.state.update({
      changes: { from: 0, to: editor.state.doc.length, insert: text },
    });
    editor.state = tr.state;
    changes = tr.changes;
  }
  session.doc.value = editor.state.field(parsedDoc);
  for (const listener of editor.listeners) listener(changes);
}

describe('counting while typing', () => {
  test('the steady counts wait for the pause, but a load is counted at once', async () => {
    const { useCounts, STEADY_MS } = await import('../app/stats/counts');
    await put('INT. HALL - DAY\n\nOne two three.\n', true);
    const counts = useCounts();
    expect(counts.steady.value.words).toBe(7);

    // An edit: nothing until the pause.
    await put('INT. HALL - DAY\n\nOne two three four.\n', false);
    const before = counts.steady.value;
    vi.advanceTimersByTime(STEADY_MS - 1);
    expect(counts.steady.value).toBe(before);
    vi.advanceTimersByTime(1);
    expect(counts.steady.value.words).toBe(8);

    // An edit that changes no count leaves the same object, so nothing that watches it runs.
    const after = counts.steady.value;
    const known = counts.known.value;
    await put('INT. HALL - DAY\n\nOne two three fours.\n', false);
    expect(counts.known.value).toBe(known);
    vi.advanceTimersByTime(STEADY_MS);
    expect(counts.steady.value).toBe(after);

    // Another script: its counts at once, never the last one's, even mid-pause.
    await put('INT. HALL - DAY\n\nOne two three four five six.\n', false);
    await put('EXT. YARD - NIGHT\n\nRain.\n', true);
    expect(counts.steady.value.words).toBe(5);
    vi.advanceTimersByTime(STEADY_MS);
    expect(counts.steady.value.words).toBe(5);
  });

  test('a key costs a fraction of its reparse, with a daily goal set and shown', async () => {
    const { useEditor } = await import('../app/editor/session');
    const { useGoal } = await import('../app/stats/goal');
    const session = useEditor() as unknown as { doc: { value: Doc } };
    const text = longScript();
    expect(text.length).toBeGreaterThan(190_000);
    editor.state = EditorState.create({ doc: text, extensions: [parsedDoc] });
    session.doc.value = editor.state.field(parsedDoc);
    for (const listener of editor.listeners) listener(null);

    const goal = useGoal();
    await goal.setGoal({ unit: 'words', target: 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    await goal.settled();
    expect(goal.progress.value).toEqual({ done: 0, target: 1000, unit: 'words' });

    let reparse = 0;
    let counting = 0;
    // Typed into the middle of the script, one character at a time, as the session follows it:
    // the parse goes to `doc`, the change to the listeners, and the status bar reads the progress.
    // Inside a word ("crosses"), so what is typed makes that word longer and no new one.
    const at = text.indexOf('crosses', text.length / 2) + 2;
    for (let i = 0; i < 100; i++) {
      const t0 = performance.now();
      const tr = editor.state.update({ changes: { from: at + i, insert: 'x' } });
      editor.state = tr.state;
      const parsed = editor.state.field(parsedDoc);
      const t1 = performance.now();
      session.doc.value = parsed;
      for (const listener of editor.listeners) listener(tr.changes);
      void goal.progress.value;
      const t2 = performance.now();
      reparse += t1 - t0;
      counting += t2 - t1;
    }
    // Before, the words of the whole script were counted on every key: about twice the reparse.
    expect(counting).toBeLessThan(reparse * 0.2);

    // After the pause, the progress shows what was typed: the 100 characters made one word longer.
    await vi.advanceTimersByTimeAsync(1000);
    expect(goal.progress.value).toEqual({ done: 0, target: 1000, unit: 'words' });
    // A space splits that word: one more word.
    const split = editor.state.update({ changes: { from: at + 50, insert: ' ' } });
    editor.state = split.state;
    session.doc.value = editor.state.field(parsedDoc);
    for (const listener of editor.listeners) listener(split.changes);
    await vi.advanceTimersByTimeAsync(1000);
    expect(goal.progress.value).toEqual({ done: 1, target: 1000, unit: 'words' });
  });
});
