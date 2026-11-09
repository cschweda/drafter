// @vitest-environment jsdom
import { Blob as NodeBlob } from 'node:buffer';
import { history, undo } from '@codemirror/commands';
import { EditorState, StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { parsedDoc } from '@drafter/cm-fountain';
import { parse } from '@drafter/fountain';
import { REVISION_COLORS, readProduction } from '@drafter/production';
import { builtins, type Template } from '@drafter/templates';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import type { DocumentKind } from '../app/markdown/kind';
import {
  ALL_NUMBERED,
  BUSY,
  CHANGED_MEANWHILE,
  createProductionActions,
  localDate,
  type ProductionDeps,
  productionAsking,
  productionMessage,
  READ_ONLY,
  sceneGone,
} from '../app/production/commands';
import { longDate, swatchOf } from '../app/production/labels';

const screenplay = builtins['us-screenplay'] as Template;
const stagePlay = builtins['stage-play-standard'] as Template;

const SCRIPT = [
  'INT. KITCHEN - NIGHT',
  '',
  'She waits by the phone.',
  '',
  'EXT. PORCH - LATER',
  '',
  'Rain.',
  '',
].join('\n');

const COMMANDS = [
  'production-lock',
  'production-next-set',
  'production-write-numbers',
  'production-omit-scene',
  'production-clear-marks',
  'production-unlock',
];

function setup(options: { kind?: DocumentKind; template?: Template; text?: string } = {}): {
  view: EditorView;
  deps: ProductionDeps;
  actions: ReturnType<typeof createProductionActions>;
} {
  const view = new EditorView({
    state: EditorState.create({
      doc: options.text ?? SCRIPT,
      extensions: [parsedDoc, history()],
    }),
  });
  const kind = options.kind ?? 'fountain';
  const deps: ProductionDeps = {
    view,
    kind: () => kind,
    template: vi.fn(() => options.template ?? screenplay),
    firstScene: () => 1,
    today: () => '2026-11-09',
    draftId: vi.fn(async () => 'a'.repeat(64)),
    freeze: vi.fn(async () => {}),
    snapshot: vi.fn(),
    say: vi.fn(),
    show: vi.fn(),
  };
  const actions = createProductionActions(deps);
  return { view, deps, actions };
}

const enabled = (actions: ReturnType<typeof createProductionActions>) =>
  Object.fromEntries(
    COMMANDS.map((id) => [id, actions.behaviors[id]?.enabled?.() ?? true]),
  ) as Record<string, boolean>;

const productionOf = (view: EditorView) => readProduction(parse(view.state.doc.toString()).meta);

// jsdom's Blob has no stream(), which the baseline's compression reads through.
beforeAll(() => {
  // And no layout, which a selection's scroll asks for.
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  globalThis.Blob = NodeBlob as unknown as typeof Blob;
});

afterEach(() => {
  productionAsking.value = null;
  productionMessage.value = '';
});

describe('the Production commands', () => {
  test('commands are off for Markdown and novels, and number commands off for stage plays', async () => {
    // A Markdown document (a novel is one): nothing of Production applies.
    const markdown = setup({ kind: 'markdown' });
    expect(Object.values(enabled(markdown.actions)).some(Boolean)).toBe(false);

    // A screenplay, not locked: only Lock.
    const { view, actions } = setup();
    expect(enabled(actions)).toEqual({
      'production-lock': true,
      'production-next-set': false,
      'production-write-numbers': false,
      'production-omit-scene': false,
      'production-clear-marks': false,
      'production-unlock': false,
    });
    expect(await actions.lock()).toBe(true);
    expect(productionOf(view)).not.toBeNull();
    // Locked, with the cursor in the first (numbered) scene: everything but Lock.
    view.dispatch({ selection: { anchor: 3 } });
    expect(enabled(actions)).toEqual({
      'production-lock': false,
      'production-next-set': true,
      'production-write-numbers': true,
      'production-omit-scene': true,
      'production-clear-marks': true,
      'production-unlock': true,
    });

    // A stage play, locked: its scenes aren't numbered, so neither number command applies.
    const play = setup({ template: stagePlay, text: 'ACT ONE\n\nThe room.\n' });
    expect(await play.actions.lock()).toBe(true);
    const onPlay = enabled(play.actions);
    expect(onPlay['production-next-set']).toBe(true);
    expect(onPlay['production-write-numbers']).toBe(false);
    expect(onPlay['production-omit-scene']).toBe(false);
  });

  test('Unlock asks first, and takes a snapshot before it changes anything', async () => {
    const { view, deps, actions } = setup();
    await actions.lock();
    const lockedText = view.state.doc.toString();

    // The command only asks.
    await actions.behaviors['production-unlock']?.run();
    expect(productionAsking.value).toBe('unlock');
    expect(view.state.doc.toString()).toBe(lockedText);
    expect(deps.snapshot).not.toHaveBeenCalled();

    // Confirmed: the snapshot is taken of the locked text, then the block goes.
    let seen = '';
    vi.mocked(deps.snapshot).mockImplementation(() => {
      seen = view.state.doc.toString();
    });
    expect(await actions.unlock()).toBe(true);
    expect(deps.snapshot).toHaveBeenCalledWith('before-unlock');
    expect(seen).toBe(lockedText);
    expect(productionOf(view)).toBeNull();
    // The scene numbers written by the lock stay.
    expect(view.state.doc.toString()).toContain('INT. KITCHEN - NIGHT #1#');
    // One undo brings the lock back.
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(lockedText);
  });

  test('Clear marks asks first too, and keeps the lock', async () => {
    const { view, deps, actions } = setup();
    await actions.lock();
    await actions.nextSet();
    await actions.behaviors['production-clear-marks']?.run();
    expect(productionAsking.value).toBe('clear-marks');
    expect(deps.snapshot).not.toHaveBeenCalled();
    expect(await actions.clearMarks()).toBe(true);
    expect(deps.snapshot).toHaveBeenCalledWith('before-clear-marks');
    expect(productionOf(view)?.sets.map((s) => s.name)).toEqual(['White', 'Blue']);
  });

  test('locking is one undo step, and freezes the Locked draft', async () => {
    const { view, deps, actions } = setup();
    await actions.lock();
    expect(deps.freeze).toHaveBeenCalledWith(SCRIPT, 'Locked');
    expect(view.state.doc.toString()).toContain('EXT. PORCH - LATER #2#');
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(SCRIPT);
  });

  test('an action whose text changed while it worked runs again, once, and freezes that text', async () => {
    const { view, deps, actions } = setup();
    let calls = 0;
    vi.mocked(deps.draftId).mockImplementation(async () => {
      calls++;
      // The writer types while the first try works.
      if (calls === 1) view.dispatch({ changes: { from: view.state.doc.length, insert: 'X' } });
      return 'b'.repeat(64);
    });
    expect(await actions.lock()).toBe(true);
    expect(view.state.doc.toString()).toContain('Rain.\nX');
    expect(productionOf(view)).not.toBeNull();
    // The draft is the text of the try that went in, frozen once.
    expect(deps.freeze).toHaveBeenCalledTimes(1);
    expect(deps.freeze).toHaveBeenCalledWith(`${SCRIPT}X`, 'Locked');
  });

  test('an action whose text kept changing says so, visibly, and leaves no draft behind', async () => {
    const { view, deps, actions } = setup();
    vi.mocked(deps.draftId).mockImplementation(async () => {
      view.dispatch({ changes: { from: view.state.doc.length, insert: 'X' } });
      return 'b'.repeat(64);
    });
    expect(await actions.lock()).toBe(false);
    expect(productionOf(view)).toBeNull();
    expect(deps.freeze).not.toHaveBeenCalled();
    expect(productionMessage.value).toBe(CHANGED_MEANWHILE);
    expect(deps.say).toHaveBeenCalledWith(CHANGED_MEANWHILE);
  });

  test('nothing is frozen, snapshotted, or changed in a script that can’t be changed', async () => {
    const { view, deps, actions } = setup();
    await actions.lock();
    vi.mocked(deps.freeze).mockClear();
    const lockedText = view.state.doc.toString();
    // A draft opened to read: the editor is read-only, and the app says why.
    const why = 'This is a draft, opened to read.';
    deps.readOnlyWhy = () => why;
    expect(enabled(actions)['production-next-set']).toBe(false);
    expect(actions.behaviors['production-unlock']?.why?.()).toBe(why);
    expect(await actions.nextSet()).toBe(false);
    expect(await actions.unlock()).toBe(false);
    expect(await actions.clearMarks()).toBe(false);
    expect(deps.freeze).not.toHaveBeenCalled();
    expect(deps.snapshot).not.toHaveBeenCalled();
    expect(view.state.doc.toString()).toBe(lockedText);
    expect(productionMessage.value).toBe(why);
    // Without the app's reason, the editor's read-only state says it.
    deps.readOnlyWhy = undefined;
    view.dispatch({ effects: StateEffect.appendConfig.of(EditorState.readOnly.of(true)) });
    expect(await actions.unlock()).toBe(false);
    expect(deps.snapshot).not.toHaveBeenCalled();
    expect(productionMessage.value).toBe(READ_ONLY);
  });

  test('one action at a time', async () => {
    const { deps, actions } = setup();
    const first = actions.lock();
    expect(await actions.lock()).toBe(false);
    expect(productionMessage.value).toBe(BUSY);
    expect(await first).toBe(true);
    expect(deps.freeze).toHaveBeenCalledTimes(1);
  });

  test('Write new scene numbers says so, visibly, when every scene has its number', async () => {
    const { actions } = setup();
    await actions.lock();
    expect(await actions.writeNumbers()).toBe(false);
    expect(productionMessage.value).toBe(ALL_NUMBERED);
  });

  test('Start the next revision names the next set, and freezes the end of the open one', async () => {
    const { view, deps, actions } = setup();
    await actions.lock();
    expect(actions.behaviors['production-next-set']?.liveTitle?.()).toBe(
      'Start the next revision (Pink)',
    );
    expect(await actions.nextSet()).toBe(true);
    expect(deps.freeze).toHaveBeenLastCalledWith(expect.any(String), 'End of the Blue revision');
    expect(productionOf(view)?.sets.map((s) => s.name)).toEqual(['White', 'Blue', 'Pink']);
  });

  test('Omit scene replaces the scene at the cursor with OMITTED, as one undo step', async () => {
    const { view, deps, actions } = setup();
    await actions.lock();
    const lockedText = view.state.doc.toString();
    view.dispatch({ selection: { anchor: 3 } });
    let seen = '';
    vi.mocked(deps.snapshot).mockImplementation(() => {
      seen = view.state.doc.toString();
    });
    expect(await actions.omit(0)).toBe(true);
    // A snapshot of the scene first, so the recorder finds it as a cut.
    expect(deps.snapshot).toHaveBeenCalledWith('before-omit', '1');
    expect(seen).toBe(lockedText);
    expect(view.state.doc.toString().startsWith('.OMITTED #1#\n\nEXT. PORCH')).toBe(true);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(lockedText);
  });
});

describe('Omit scene, when the text changes while it works', () => {
  /** Makes the next omit's first try see the text change under it, by `change`. */
  function changeDuringOmit(
    view: EditorView,
    deps: ProductionDeps,
    change: (text: string) => { from: number; to: number; insert: string },
  ) {
    let armed = false;
    vi.mocked(deps.snapshot).mockImplementation(() => {
      armed = true;
    });
    // The template is read inside the try, after the text was read.
    vi.mocked(deps.template).mockImplementation(() => {
      if (armed) {
        armed = false;
        view.dispatch({ changes: change(view.state.doc.toString()) });
      }
      return screenplay;
    });
  }

  test('finds the scene again by its number', async () => {
    const { view, deps, actions } = setup();
    await actions.lock();
    changeDuringOmit(view, deps, () => ({ from: 0, to: 0, insert: 'INT. NEW - DAY\n\nNew.\n\n' }));
    expect(await actions.omit(1)).toBe(true);
    const text = view.state.doc.toString();
    expect(text).toContain('INT. KITCHEN - NIGHT #1#');
    expect(text).toContain('.OMITTED #2#');
    expect(text).not.toContain('Rain.');
  });

  test('says so when the scene is gone', async () => {
    const { view, deps, actions } = setup();
    await actions.lock();
    changeDuringOmit(view, deps, (text) => {
      const from = text.indexOf('EXT. PORCH');
      return { from, to: text.indexOf('Rain.') + 'Rain.'.length, insert: '' };
    });
    expect(await actions.omit(1)).toBe(false);
    expect(productionMessage.value).toBe(sceneGone('2'));
  });
});

describe('the Production labels', () => {
  test('a swatch is the set’s own #rrggbb, else its name’s, else none', () => {
    expect(swatchOf({ name: 'Blue', color: '#123abc' })).toBe('#123abc');
    expect(swatchOf({ name: 'Blue', color: 'red;background:url(x)' })).toBe(REVISION_COLORS.Blue);
    expect(swatchOf({ name: 'Double Pink', color: '' })).toBe(REVISION_COLORS.Pink);
    expect(swatchOf({ name: 'Tan', color: 'tan' })).toBeNull();
  });

  test('dates read as a writer writes them, and today is the local date', () => {
    expect(longDate('2026-11-09')).toBe('9 November 2026');
    expect(longDate('nonsense')).toBe('nonsense');
    expect(localDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });
});
