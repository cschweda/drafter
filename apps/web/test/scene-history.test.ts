// @vitest-environment jsdom
import { history, undo } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { SceneVersion } from '@drafter/history';
import { afterEach, describe, expect, test } from 'vitest';
import { applyTextChanges } from '../app/editor/apply-changes';
import {
  createUseThisVersion,
  gapRowLabel,
  rowAgain,
  type SceneHistoryTarget,
  type UseThisVersionDeps,
  versionKey,
  versionRowLabel,
} from '../app/history/scene-history';

// History of this scene (version-history design §6.1): the versions list's keys, as History's;
// and Use this version, which takes a "Before restoring a scene" snapshot first and then replaces
// the scene now with the version's text as one change Undo takes back; off, with the reason, in a
// read-only tab and for a deleted scene (whose action is Put back).

const HALL = 'INT. HALL - DAY\n\nMarra waits by the door.';
const OLD_HALL = 'INT. HALL - DAY\n\nMarra paces, then waits by the door.';
const ROOF = 'EXT. ROOF - NIGHT\n\nWind.';
const NOW = `${HALL}\n\n${ROOF}\n`;

/** Tuesday 27 October 2026, 10:42 local time. */
const AT = new Date(2026, 9, 27, 10, 42).getTime();

function version(more: Partial<SceneVersion> = {}): SceneVersion {
  return {
    hash: 'h-old',
    snapshots: ['s2', 's1'],
    newestAt: AT,
    oldestAt: AT - 60_000,
    slot: { hash: 'h-old', ordinal: 1, from: 0, to: OLD_HALL.length, section: false },
    heading: 'INT. HALL - DAY',
    words: 7,
    ...more,
  };
}

const sceneNow: SceneHistoryTarget = {
  id: 'scene-1',
  from: 0,
  to: HALL.length,
  heading: 'INT. HALL - DAY',
};

function setup(
  options: {
    readOnly?: string;
    text?: string | null;
    target?: SceneHistoryTarget | null;
    /** The heading of the scene found now by the target's id, when it isn't the target's. */
    nowHeading?: string;
  } = {},
) {
  const view = new EditorView({
    state: EditorState.create({ doc: NOW, extensions: [history()] }),
    parent: document.body,
  });
  views.push(view);
  const said: string[] = [];
  const steps: string[] = [];
  const deps: UseThisVersionDeps = {
    target: () => (options.target === undefined ? sceneNow : options.target),
    readOnly: () => options.readOnly ?? null,
    text: () => view.state.doc.toString(),
    sceneText: async (snapshot) => {
      steps.push(`read ${snapshot}`);
      return options.text === undefined ? OLD_HALL : options.text;
    },
    sceneNow: (target) =>
      'from' in target
        ? { from: target.from, to: target.to, heading: options.nowHeading ?? target.heading }
        : null,
    before: () => {
      steps.push(`before ${view.state.doc.toString() === NOW ? 'now' : 'changed'}`);
    },
    apply: (changes, applyOptions) => {
      steps.push('apply');
      return applyTextChanges(view, changes, applyOptions);
    },
    say: (message) => said.push(message),
  };
  return { view, said, steps, use: createUseThisVersion(deps) };
}

// Each view is destroyed after its test: a live view left in the page measures itself on a later
// frame, and jsdom has no getClientRects for that.
const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.replaceChildren();
});

describe('History of this scene', () => {
  test("versionKey moves and acts as History's", () => {
    expect(versionKey(3, 0, 'ArrowDown')).toEqual({ focus: 1 });
    expect(versionKey(3, 1, 'ArrowUp')).toEqual({ focus: 0 });
    expect(versionKey(3, 0, 'ArrowUp')).toBe(null);
    expect(versionKey(3, 2, 'ArrowDown')).toBe(null);
    expect(versionKey(3, 1, 'Home')).toEqual({ focus: 0 });
    expect(versionKey(3, 1, 'End')).toEqual({ focus: 2 });
    expect(versionKey(3, 1, 'Enter')).toEqual({ action: 'compare' });
    expect(versionKey(3, 1, 'u')).toEqual({ action: 'use' });
    expect(versionKey(3, 1, 'U')).toEqual({ action: 'use' });
    expect(versionKey(3, 1, 'ContextMenu')).toEqual({ action: 'menu' });
    expect(versionKey(3, 1, 'x')).toBe(null);
    expect(versionKey(0, 0, 'ArrowDown')).toBe(null);
    // A held key repeats moves, never an action: U held down uses the version once.
    expect(versionKey(3, 1, 'u', true)).toBe(null);
    expect(versionKey(3, 1, 'ContextMenu', true)).toBe(null);
    expect(versionKey(3, 1, 'ArrowDown', true)).toEqual({ focus: 2 });
  });

  test('use this version takes a snapshot first and is one undo', async () => {
    const { view, said, steps, use } = setup();
    expect(await use(version())).toBe(true);
    // The text it replaces is kept first, then one change.
    expect(steps).toEqual(['read s2', 'before now', 'apply']);
    expect(view.state.doc.toString()).toBe(`${OLD_HALL}\n\n${ROOF}\n`);
    expect(said).toEqual([
      'INT. HALL - DAY is as it was on Tuesday, 27 October at 10:42 AM. Undo brings back what it replaced.',
    ]);
    // The cursor is on the scene's heading.
    expect(view.state.selection.main.head).toBe(0);
    expect(undo(view)).toBe(true);
    expect(view.state.doc.toString()).toBe(NOW);
  });

  test('says so and changes nothing when the scene is already as it was', async () => {
    const { view, said, steps, use } = setup({ text: HALL });
    expect(await use(version())).toBe(false);
    expect(steps).toEqual(['read s2']);
    expect(said[0]).toMatch(/^INT\. HALL - DAY is already as it was on Tuesday/);
    expect(view.state.doc.toString()).toBe(NOW);
  });

  test('refused for a deleted scene and in a read-only tab', async () => {
    const why = 'This script is open for editing in another tab.';
    const readOnly = setup({ readOnly: why });
    expect(await readOnly.use(version())).toBe(false);
    expect(readOnly.said).toEqual([why]);
    expect(readOnly.steps).toEqual([]);
    expect(readOnly.view.state.doc.toString()).toBe(NOW);

    const gone = setup({ target: { snapshot: 's1', slot: 0, heading: 'INT. CELLAR - NIGHT' } });
    expect(await gone.use(version())).toBe(false);
    expect(gone.said).toEqual([
      'That scene isn’t in the script now. Put it back from Deleted scenes.',
    ]);
    expect(gone.steps).toEqual([]);

    const unreadable = setup({ text: null });
    expect(await unreadable.use(version())).toBe(false);
    expect(unreadable.said).toEqual(['That version of INT. HALL - DAY can’t be read.']);
    expect(unreadable.view.state.doc.toString()).toBe(NOW);
  });

  test('refused when the scene found now has another heading than the one it opened on', async () => {
    const { view, said, steps, use } = setup({ nowHeading: 'INT. CELLAR - NIGHT' });
    expect(await use(version())).toBe(false);
    expect(said).toEqual([
      'That scene changed after History of this scene opened. Open it again to use a version.',
    ]);
    expect(steps).toEqual(['read s2']);
    expect(view.state.doc.toString()).toBe(NOW);
  });

  test('a listing read again finds the selected row where it is now', () => {
    const newest = version({ hash: 'h-3', snapshots: ['s5'] });
    const older = version({ hash: 'h-2', snapshots: ['s3', 's2'] });
    const gap = { gap: true as const, snapshots: ['s4'] };
    // A snapshot taken while the dialog is open adds a row on top: the selection moves with its row.
    const taken = version({ hash: 'h-4', snapshots: ['s6'] });
    expect(rowAgain(older, [taken, newest, gap, older])).toBe(3);
    expect(rowAgain(gap, [taken, newest, gap, older])).toBe(2);
    // Its version now holds one more snapshot: the same row, by its text.
    expect(rowAgain(older, [newest, version({ hash: 'h-2', snapshots: ['s7', 's3', 's2'] })])).toBe(
      1,
    );
    // Gone (its snapshot was deleted), or nothing was selected: null.
    expect(rowAgain(older, [taken, newest])).toBe(null);
    expect(rowAgain(null, [taken])).toBe(null);
  });

  test('a row says its time, why it was taken, its change in words, and how long it held', () => {
    const one = versionRowLabel(version({ snapshots: ['s1'] }), 'Saved', 5, AT + 3_600_000);
    expect(one).toEqual({ when: 'Today, 10:42 AM', said: 'Saved', change: '+2 words', held: null });
    const held = versionRowLabel(version(), 'Taken by you', null, AT + 2 * 86_400_000);
    expect(held.when).toBe('Tuesday, 27 October, 10:42 AM');
    expect(held.change).toBe('7 words');
    expect(held.held).toBe('Unchanged in 2 versions, Tuesday 10:41 AM to Tuesday 10:42 AM');
    // Both ends in the same minute: no range.
    const sameMinute = versionRowLabel(
      version({ oldestAt: AT, newestAt: AT + 30_000 }),
      'Saved',
      null,
      AT + 2 * 86_400_000,
    );
    expect(sameMinute.held).toBe('Unchanged in 2 versions');
    expect(gapRowLabel(['s3', 's2', 's1'])).toBe('Not in 3 versions');
    expect(gapRowLabel(['s3'])).toBe('Not in this version');
  });
});
