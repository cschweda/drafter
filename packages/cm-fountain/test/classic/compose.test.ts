import { history, undo } from '@codemirror/commands';
import type { Transaction } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { parsedDoc } from '@drafter/cm-fountain';
import { builtins, type Template } from '@drafter/templates';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { COMPOSITION_CHECK_MS, classicNext, whenComposed } from '../../src/classic/compose';
import { classicLine, setStored } from '../../src/classic/line';
import { render } from '../helpers';
import { classicEditor } from './harness';

// An input method's composition (design §10): Android keyboards and the input methods for Chinese,
// Japanese, and Korean. The editor mustn't change the text while one runs, so the capitals and the
// mark come a task after it ends, in one step. jsdom has no input method, so the view's
// `composing` is the test's to set, as relint.test.ts in the app does.

const STAGE = builtins['stage-play-standard'] as Template;
const BLOCK = '/* drafter\n{"v":1,"template":"stage-play-standard"}\n*/';

const views: EditorView[] = [];
afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  vi.useRealTimers();
});

/** A view in Classic Mode whose composition the test runs, and every transaction it saw. */
function composer(
  marked: string,
  { template, kind }: { template?: Template; kind?: 'character' | 'scene_heading' } = {},
) {
  const seen: Transaction[] = [];
  let state = classicEditor(marked, {
    ...(template ? { template } : {}),
    with: [
      history(),
      EditorView.updateListener.of((update) => void seen.push(...update.transactions)),
    ],
  });
  if (kind) state = state.update({ effects: setStored.of({ kind, chosen: true }) }).state;
  const view = new EditorView({ state, parent: document.body });
  views.push(view);
  const ime = { on: false };
  Object.defineProperty(view, 'composing', { get: () => ime.on });
  Object.defineProperty(view, 'compositionStarted', { get: () => ime.on });
  /** Composes `text` at the cursor, a piece at a time, as an input method shows it. */
  const compose = (text: string) => {
    ime.on = true;
    const from = view.state.selection.main.head;
    for (let i = 1; i <= text.length; i++) {
      view.dispatch({
        changes: { from, to: from + i - 1, insert: text.slice(0, i) },
        selection: { anchor: from + i },
        userEvent: 'input.type.compose',
      });
    }
  };
  const end = () => {
    ime.on = false;
    view.contentDOM.dispatchEvent(new Event('compositionend'));
  };
  seen.length = 0;
  return { view, seen, compose, end, ime };
}

/** A task, and the one after it. */
const tasks = () => vi.advanceTimersByTimeAsync(1);

describe('§10, a composition', () => {
  test('a composition is never rewritten while it runs', async () => {
    vi.useFakeTimers();
    const { view, seen, compose } = composer('She waits.\n\n|', { kind: 'character' });
    compose('june');
    await vi.advanceTimersByTimeAsync(COMPOSITION_CHECK_MS * 3);
    expect(render(view.state)).toBe('She waits.\n\njune|');
    // Only the input method's own changes: nothing of Classic Mode's came between them.
    expect(seen.every((tr) => tr.isUserEvent('input.type.compose'))).toBe(true);
  });

  test('it’s capitalised after it ends, with its mark, in one step', async () => {
    vi.useFakeTimers();
    const { view, seen, compose, end } = composer('She waits.\n\n|', { kind: 'character' });
    compose('june');
    seen.length = 0;
    end();
    expect(view.state.sliceDoc()).toBe('She waits.\n\njune');
    await tasks();
    expect(render(view.state)).toBe('She waits.\n\nJUNE|');
    expect(seen.filter((tr) => tr.docChanged)).toHaveLength(1);
    // A name the parser would read as Action has its `@`, in that same step.
    const marked = composer('She waits.\n\n|', { kind: 'character' });
    marked.compose('李明');
    marked.end();
    await tasks();
    expect(render(marked.view.state)).toBe('She waits.\n\n@李明|');
    expect(marked.view.state.field(classicLine)?.added).toEqual([{ from: 12, to: 13 }]);
    // One undo takes the composed word and what settling it wrote.
    undo(marked.view);
    expect(marked.view.state.sliceDoc()).toBe('She waits.\n\n');
  });

  test('a heading composed on a fresh line is a heading, its prefix in capitals', async () => {
    vi.useFakeTimers();
    const { view, compose, end } = composer('She waits.\n\n|');
    compose('int. diner');
    end();
    await tasks();
    expect(render(view.state)).toBe('She waits.\n\nINT. DINER|');
    expect(view.state.field(classicLine)?.kind).toBe('scene_heading');
  });

  test('an abandoned composition is settled', async () => {
    vi.useFakeTimers();
    const { view, compose, ime } = composer('She waits.\n\n|', { kind: 'character' });
    compose('june');
    // The input method is switched off mid-word: no end, no blur.
    ime.on = false;
    await vi.advanceTimersByTimeAsync(COMPOSITION_CHECK_MS + 1);
    expect(render(view.state)).toBe('She waits.\n\nJUNE|');
  });

  test('Enter waits for it', async () => {
    vi.useFakeTimers();
    const { view, compose, end } = composer('She waits.\n\n|', { kind: 'character' });
    compose('ju');
    const enter = view.state
      .facet(keymap)
      .flat()
      .find((binding) => binding.key === 'Enter' && binding.run);
    expect(enter?.run?.(view)).toBe(true);
    expect(render(view.state)).toBe('She waits.\n\nju|');
    end();
    await tasks();
    // Settled first, then Enter, from the name to its speech.
    expect(render(view.state)).toBe('She waits.\n\nJU\n|');
  });

  test('the Next button waits for it, and does what Tab does', async () => {
    vi.useFakeTimers();
    const { view, compose, end } = composer('She waits.|');
    expect(classicNext(view)).toBe(true);
    expect(render(view.state)).toBe('She waits.\n\n|');
    expect(view.state.field(classicLine)?.kind).toBe('character');
    compose('dale');
    expect(classicNext(view)).toBe(true);
    expect(render(view.state)).toBe('She waits.\n\ndale|');
    end();
    await tasks();
    expect(render(view.state)).toBe('She waits.\n\nDALE\n|');
  });

  test('whenComposed runs at once with no composition', () => {
    const { view } = composer('One.|');
    const then = vi.fn();
    whenComposed(view, then);
    expect(then).toHaveBeenCalledTimes(1);
  });

  test('capitals by CSS only while composing', async () => {
    vi.useFakeTimers();
    const { view, compose, end } = composer('She waits.\n\n|', { kind: 'character' });
    const composing = () => [...view.contentDOM.querySelectorAll('.cm-c-composing')];
    expect(composing()).toHaveLength(0);
    compose('mcgraw');
    expect(composing().map((line) => line.textContent)).toEqual(['mcgraw']);
    end();
    await tasks();
    expect(composing()).toHaveLength(0);
    // An Action line isn't shown in capitals, composing or not.
    const action = composer('She waits.\n\nThe lights hum.|');
    action.compose(' again');
    expect([...action.view.contentDOM.querySelectorAll('.cm-c-composing')]).toHaveLength(0);
  });

  test('a two-space blank speech line gives its spaces to the composed words', async () => {
    vi.useFakeTimers();
    const { view, compose, end } = composer('JUNE\nStill open?\n  |');
    compose('yes');
    end();
    await tasks();
    expect(render(view.state)).toBe('JUNE\nStill open?\nyes|');
  });

  test('composed on a page break, it goes on to the Action line, as typing does', async () => {
    vi.useFakeTimers();
    const { view, compose, end } = composer('She waits.\n\n===|\n\nThe lights hum.');
    compose('x');
    end();
    await tasks();
    expect(render(view.state)).toBe('She waits.\n\n===\n\nx|\n\nThe lights hum.');
  });

  test('a composed first letter on a blank stage play keeps the template', async () => {
    vi.useFakeTimers();
    const { view, compose, end } = composer(`|${BLOCK}\n`, { template: STAGE });
    await tasks();
    expect(render(view.state)).toBe(`|\n\n${BLOCK}\n`);
    compose('m');
    end();
    await tasks();
    expect(render(view.state)).toBe(`m|\n\n${BLOCK}\n`);
    expect(view.state.field(parsedDoc).meta?.template).toBe('stage-play-standard');
  });

  test('a read-only editor is left as it is', async () => {
    vi.useFakeTimers();
    const { view, compose, end } = composer('She waits.\n\n|', { kind: 'character' });
    compose('june');
    view.dispatch({ effects: [] });
    Object.defineProperty(view.state, 'readOnly', { get: () => true });
    end();
    await tasks();
    expect(view.state.sliceDoc()).toBe('She waits.\n\njune');
  });
});
