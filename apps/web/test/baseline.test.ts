import type { ChangeStop } from '@drafter/compare';
import { describe, expect, test } from 'vitest';
import { nextTick, ref } from 'vue';
import {
  createShowChanges,
  FALLBACK_SAVED,
  MARKDOWN_WHY,
  NOTHING_WHY,
  type ShowChangesDeps,
} from '../app/compare/baseline';
import type { DocumentKind } from '../app/markdown/kind';
import { DEFAULT_SETTINGS } from '../app/settings/settings';
import type { SnapshotInfo } from '../app/storage/snapshots';

// Show changes' baseline (version-history design §4.1, Calls 14 to 16): the last save by default,
// else the first version; off with a reason with neither, and for a Markdown document; a baseline
// snapshot that is gone falls back to the last save once; and it is never remembered.

const T0 = new Date(2026, 9, 30, 9, 0).getTime();

function info(id: string, at: number, label?: string, readable = true): SnapshotInfo {
  return { id, createdAt: at, reason: label ? 'manual' : 'timed', label, words: 3, readable };
}

/** Fake storage and a recorder of what the layout is asked to compare with. */
function setup(
  options: {
    saved?: string | null;
    snapshots?: Array<[SnapshotInfo, string | null]>;
    kind?: DocumentKind;
  } = {},
) {
  const store = new Map(options.snapshots?.map(([row, text]) => [row.id, { row, text }]));
  const sent: Array<{ id: number; text: string } | null> = [];
  const said: string[] = [];
  const stops = ref<ChangeStop[]>([]);
  const deps: ShowChangesDeps = {
    kind: ref(options.kind ?? 'fountain'),
    projectId: ref<string | null>('p1'),
    savedText: ref(options.saved === undefined ? 'SAVED' : options.saved),
    snapshotsVersion: ref(0),
    list: async () => [...store.values()].map((s) => s.row),
    read: async (id) => store.get(id)?.text ?? null,
    setBaseline: (b) => sent.push(b),
    say: (message) => said.push(message),
    stops: () => stops.value,
  };
  const changes = createShowChanges(deps);
  return { changes, deps, store, sent, said, stops };
}

/** Lets the baseline's reads and watchers settle. */
async function settle() {
  for (let i = 0; i < 6; i++) {
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
const texts = (sent: Array<{ id: number; text: string } | null>) =>
  sent.map((b) => b?.text ?? null);

describe('Show changes', () => {
  test('defaults to the last save', async () => {
    const { changes, sent, deps } = setup({ snapshots: [[info('s1', T0), 'FIRST']] });
    await settle();
    expect(changes.on.value).toBe(false);
    expect(changes.baseline.value).toEqual({ kind: 'saved' });
    changes.toggle();
    await settle();
    expect(changes.on.value).toBe(true);
    expect(texts(sent).at(-1)).toBe('SAVED');
    // A save is the new baseline, so its marks go.
    deps.savedText.value = 'SAVED AGAIN';
    await settle();
    expect(texts(sent).at(-1)).toBe('SAVED AGAIN');
    expect(sent.at(-1)?.id).not.toBe(sent.at(-2)?.id);
    changes.toggle();
    await settle();
    expect(sent.at(-1)).toBeNull();
  });

  test('falls back to the first version without a save', async () => {
    const { changes, sent } = setup({
      saved: null,
      snapshots: [
        [info('s2', T0 + 60_000), 'SECOND'],
        [info('s1', T0), 'FIRST'],
      ],
    });
    await settle();
    expect(changes.baseline.value).toEqual({ kind: 'first' });
    expect(changes.why.value).toBeNull();
    changes.toggle();
    await settle();
    expect(texts(sent).at(-1)).toBe('FIRST');
    expect(changes.choices.value.map((c) => c.label)).toEqual(['First version']);
  });

  test('is off with a reason with neither', async () => {
    const { changes, sent, said } = setup({ saved: null });
    await settle();
    expect(changes.why.value).toBe(NOTHING_WHY);
    expect(NOTHING_WHY).toBe('Nothing to compare with yet: save, or take a snapshot.');
    changes.toggle();
    await settle();
    expect(changes.on.value).toBe(false);
    expect(said).toEqual([NOTHING_WHY]);
    expect(sent.filter(Boolean)).toEqual([]);
  });

  test('a deleted baseline falls back to Last save and says so once', async () => {
    const { changes, sent, said, store, deps } = setup({
      snapshots: [
        [info('s2', T0 + 60_000, 'Draft two'), 'TWO'],
        [info('s1', T0, 'Draft one'), 'ONE'],
      ],
    });
    await settle();
    expect(changes.choices.value.map((c) => c.label)).toEqual([
      'Last save',
      'Draft two',
      'Draft one',
    ]);
    changes.since({ kind: 'snapshot', id: 's1', label: 'Draft one' });
    await settle();
    expect(changes.on.value).toBe(true);
    expect(texts(sent).at(-1)).toBe('ONE');
    store.delete('s1');
    deps.snapshotsVersion.value++;
    await settle();
    expect(changes.baseline.value).toEqual({ kind: 'saved' });
    expect(texts(sent).at(-1)).toBe('SAVED');
    expect(said).toEqual([FALLBACK_SAVED]);
    // Said once: later changes don't say it again.
    deps.snapshotsVersion.value++;
    await settle();
    expect(said).toEqual([FALLBACK_SAVED]);
  });

  test('is off for Markdown with its reason', async () => {
    const { changes, deps, said, sent } = setup();
    await settle();
    changes.toggle();
    await settle();
    expect(changes.on.value).toBe(true);
    deps.kind.value = 'markdown';
    await settle();
    expect(changes.on.value).toBe(false);
    expect(sent.at(-1)).toBeNull();
    expect(changes.why.value).toBe(MARKDOWN_WHY);
    expect(MARKDOWN_WHY).toBe('A Markdown document’s changes are in Compare.');
    changes.toggle();
    expect(changes.on.value).toBe(false);
    expect(said).toEqual([MARKDOWN_WHY]);
  });

  test('is not remembered', async () => {
    const first = setup();
    await settle();
    first.changes.since({ kind: 'snapshot', id: 's9', label: 'Kept' });
    // Another visit starts off, since the last save; nothing of it is a setting.
    const next = setup();
    await settle();
    expect(next.changes.on.value).toBe(false);
    expect(next.changes.baseline.value).toEqual({ kind: 'saved' });
    expect(Object.keys(DEFAULT_SETTINGS).filter((k) => /change|baseline/i.test(k))).toEqual([]);
    // Another script starts off too.
    first.deps.projectId.value = 'p2';
    await settle();
    expect(first.changes.on.value).toBe(false);
    expect(first.changes.baseline.value).toEqual({ kind: 'saved' });
  });

  test('a version picked from History is among the choices', async () => {
    const { changes } = setup({ snapshots: [[info('s1', T0), 'ONE']] });
    await settle();
    changes.since({ kind: 'snapshot', id: 's1', label: '9:00' });
    await settle();
    expect(changes.choices.value.map((c) => c.label)).toEqual(['Last save', '9:00']);
  });

  test('N steps through the marks, wrapping', async () => {
    const { changes, stops } = setup();
    await settle();
    changes.toggle();
    stops.value = [0, 1, 2].map((change) => ({
      change,
      kind: 'added',
      page: 1,
      block: 0,
      lines: 1,
    }));
    changes.step(1);
    expect([changes.at.value, changes.pendingFocus.value]).toEqual([0, true]);
    changes.step(-1);
    expect(changes.at.value).toBe(2);
  });

  test("a script's listing that comes late never replaces the next script's", async () => {
    const { changes, deps } = setup({ saved: null });
    await settle();
    let finishFirst: (rows: SnapshotInfo[]) => void = () => {};
    deps.list = (id) =>
      id === 'p1'
        ? new Promise<SnapshotInfo[]>((resolve) => {
            finishFirst = resolve;
          })
        : Promise.resolve([info('b1', T0, 'Second script')]);
    deps.snapshotsVersion.value++;
    await settle();
    deps.projectId.value = 'p2';
    await settle();
    expect(changes.choices.value.map((c) => c.label)).toEqual(['First version', 'Second script']);
    finishFirst([info('a1', T0, 'First script')]);
    await settle();
    expect(changes.choices.value.map((c) => c.label)).toEqual(['First version', 'Second script']);
  });
});
