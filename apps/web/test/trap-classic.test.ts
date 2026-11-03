// @vitest-environment jsdom
// The trap documents (fixtures/trap) in Classic Mode (Classic Mode design §15.2). Every trap that
// opens as Fountain is made text by the app's own Open (`openFile`, as trap-open.test.ts runs it),
// then put in a real `EditorView` with `classic()`: the left pane drawn, the cursor walked through
// every line by `state.update` (no view) and through at most 2,000 evenly spaced lines by
// `view.dispatch`, and the mode switched both ways. The text must come out byte for byte as it
// went in, nothing may throw, and the walk must end in the trap's time.
import { webcrypto } from 'node:crypto';
import { startCompletion } from '@codemirror/autocomplete';
import { Compartment, EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { classic, classicEnter, elementAt, fountain, onlyClearedBlock } from '@drafter/cm-fountain';
import { parse } from '@drafter/fountain';
import { builtins, type Template } from '@drafter/templates';
import 'fake-indexeddb/auto';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { measured } from '../../../fixtures/trap/check';
import { LIMIT_MS, LIST_BREAKER_LABEL, type Trap, trapsFor } from '../../../fixtures/trap/traps';
import { choosePending, offerAt } from '../../../packages/cm-fountain/src/classic';
import { type App, app, dropped, happened } from './trap-app';

vi.mock('../app/snapshots/use-snapshots', async () =>
  (await import('./trap-app')).snapshotsModule(),
);
vi.mock('../app/editor/samples', async () => (await import('./trap-app')).samplesModule());
vi.mock('../app/editor/session', async () => (await import('./trap-app')).sessionModule());

// jsdom has no layout: a measure asks for rectangles, and gets none.
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const fetched: unknown[] = [];
beforeAll(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('fetch', async (input: unknown) => {
    fetched.push(input);
    throw new TypeError('The trap documents never fetch.');
  });
});
afterAll(() => vi.unstubAllGlobals());

const SCREENPLAY = builtins['us-screenplay'] as Template;

/** What a script's text must never become in the editor: CodeMirror's own spacer images aside. */
const LIVE = 'img:not(.cm-widgetBuffer), script, iframe, object, embed';

/** The template a script names in its metadata block, as the app reads it, or a screenplay's. */
function templateOf(text: string): Template {
  const id = parse(text).meta?.template;
  return (typeof id === 'string' && (builtins[id] as Template | undefined)) || SCREENPLAY;
}

/** The text a trap opens to, through the app's Open. */
async function openedText(t: App, trap: Trap): Promise<string> {
  t.exportNotice.value = '';
  const was = t.script.project.value?.id;
  const picked = await t.files.browserFiles.fromDrop(
    dropped(trap.name, trap.bytes?.() as Uint8Array),
  );
  if (picked) await t.open.openFile(picked);
  const result = happened(t, was);
  expect(result.kind, `${trap.id}: should open`).toBe('opened');
  // The mapping in traps.ts sends only what opens as Fountain here.
  expect(t.editor.kind.value, `${trap.id}: opens as Fountain`).toBe('fountain');
  return result.kind === 'opened' ? result.text : '';
}

/** A writer's editor in Classic Mode, as the app builds it: the mode's compartment ahead of the language. */
function classicView(text: string): { view: EditorView; mode: Compartment; on: Extension } {
  const template = templateOf(text);
  const mode = new Compartment();
  const on = classic();
  const state = EditorState.create({
    doc: text,
    extensions: [mode.of(on), fountain({ template: () => template })],
  });
  const parent = document.createElement('div');
  document.body.append(parent);
  return { view: new EditorView({ state, parent }), mode, on };
}

/** The cursor sent to the start of every line, by transactions alone, as `goto` sends it. */
function walkState(start: EditorState): EditorState {
  let state = start;
  for (let n = 1; n <= state.doc.lines; n++) {
    state = state.update({
      selection: { anchor: state.doc.line(n).from },
      userEvent: 'select',
    }).state;
  }
  return state;
}

/** The cursor sent to at most 2,000 evenly spaced lines, through the view, its end of each one too. */
function walkView(view: EditorView) {
  const { lines } = view.state.doc;
  const step = Math.max(1, Math.ceil(lines / 2_000));
  for (let n = 1; n <= lines; n += step) {
    const line = view.state.doc.line(Math.min(n, view.state.doc.lines));
    view.dispatch({ selection: { anchor: line.from }, userEvent: 'select.pointer' });
    view.dispatch({ selection: { anchor: line.to }, userEvent: 'select' });
  }
}

/** The text is the same, or the one change §3.4 allows: two breaks above a blank script's block. */
function expectSame(trap: Trap, before: EditorState['doc'], after: EditorState['doc']) {
  if (after.eq(before)) return;
  expect(onlyClearedBlock(before, after), `${trap.id}: Classic Mode wrote something`).toBe(true);
}

describe('classic: every trap that opens as Fountain, in Classic Mode', () => {
  let t: App;
  beforeAll(async () => {
    t = await app();
  });

  test.each(trapsFor('classic').map((one) => [one.id, one] as const))(
    '%s',
    async (_id, trap) => {
      const text = await openedText(t, trap);
      const cost = await measured(async () => {
        const { view, mode, on } = classicView(text);
        try {
          const original = view.state.doc;
          // The left pane is drawn: lines, and nothing of the script's but text.
          expect(view.contentDOM.querySelector('.cm-line'), trap.id).not.toBeNull();
          expect(view.dom.querySelector(LIVE), trap.id).toBeNull();
          expectSame(trap, original, walkState(view.state).doc);
          walkView(view);
          expectSame(trap, original, view.state.doc);
          view.dispatch({ effects: mode.reconfigure([]) });
          view.dispatch({ effects: mode.reconfigure(on) });
          // A start of Classic Mode clears a blank script's block in a microtask (§3.4).
          await Promise.resolve();
          expectSame(trap, original, view.state.doc);
        } finally {
          view.destroy();
        }
        return null;
      });
      expect(fetched, `${trap.id}: fetched something`).toEqual([]);
      expect((window as { __trapped?: unknown }).__trapped, trap.id).toBeUndefined();
      const limit = trap.limitMs ?? LIMIT_MS;
      expect(cost.ms, `${trap.id} took ${Math.round(cost.ms)} ms`).toBeLessThan(limit);
      // Vitest's own timeout is no judge: the trap's limit is, past the time its Open takes.
    },
    120_000,
  );
});

describe('the list-breaker in the autofill list', () => {
  const trap = trapsFor('classic').find((one) => one.id === 'classic-list-breaker') as Trap;

  /** The list on a new line at the end, for `kind`, with `typed` typed: its options and what's drawn. */
  async function listFor(text: string, kind: 'character' | 'scene_heading', typed: string) {
    const { view } = classicView(text);
    try {
      view.focus();
      // Enter at the end of the last line, as a writer goes on from it.
      const last = view.state.doc.line(view.state.doc.lines - (text.endsWith('\n') ? 1 : 0));
      view.dispatch({ selection: { anchor: last.to }, userEvent: 'select' });
      classicEnter(view);
      expect(elementAt(view.state)?.pending).toBe(true);
      choosePending(kind)(view);
      for (const ch of typed) {
        const at = view.state.selection.main.head;
        view.dispatch({
          changes: { from: at, insert: ch },
          selection: { anchor: at + 1 },
          userEvent: 'input.type',
        });
      }
      const labels =
        offerAt(view.state, view.state.selection.main.head, true)?.options.map(
          ({ label }) => label,
        ) ?? [];
      startCompletion(view);
      await vi.waitFor(() =>
        expect(view.dom.querySelector('.cm-tooltip-autocomplete')).not.toBeNull(),
      );
      const list = view.dom.querySelector('.cm-tooltip-autocomplete') as HTMLElement;
      return { labels, text: list.textContent ?? '', live: list.querySelectorAll(LIVE).length };
    } finally {
      view.destroy();
    }
  }

  test('a name made to break the list is offered, and drawn as text', async () => {
    const t = await app();
    const text = await openedText(t, trap);
    const list = await listFor(text, 'character', '<');
    expect(list.labels).toContain(LIST_BREAKER_LABEL);
    expect(list.text).toContain(LIST_BREAKER_LABEL);
    expect(list.live).toBe(0);
  });

  test('a place made to break the list is offered, and drawn as text', async () => {
    const t = await app();
    const text = await openedText(t, trap);
    const list = await listFor(text, 'scene_heading', 'INT. <');
    expect(list.labels).toContain(LIST_BREAKER_LABEL);
    expect(list.text).toContain(LIST_BREAKER_LABEL);
    expect(list.live).toBe(0);
    expect((window as { __trapped?: unknown }).__trapped).toBeUndefined();
  });
});
