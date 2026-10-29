import 'fake-indexeddb/auto';
import { EditorState, type Transaction } from '@codemirror/state';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// The snapshot session as the app wires it (`useSnapshots`), over an editor that is only its state
// and a script session that is only its open project and its record of saves and opens.
const mock = vi.hoisted(() => ({
  state: null as unknown as EditorState,
  edits: new Set<(transactions: readonly Transaction[]) => void>(),
  recorded: new Set<(event: unknown) => void>(),
}));
vi.mock('../app/editor/session', () => ({
  useEditor: () => ({
    view: {
      get state() {
        return mock.state;
      },
    },
    onEdit: (listener: (transactions: readonly Transaction[]) => void) => {
      mock.edits.add(listener);
      return () => mock.edits.delete(listener);
    },
  }),
}));
vi.mock('../app/storage/script', async () => {
  const { shallowRef } = await import('vue');
  const project = shallowRef<{ id: string; sample?: string } | null>(null);
  return {
    useScript: () => ({
      project,
      onRecorded: (listener: (event: unknown) => void) => {
        mock.recorded.add(listener);
        return () => mock.recorded.delete(listener);
      },
    }),
  };
});
vi.mock('../app/storage/guard', async () => {
  const { ref } = await import('vue');
  const readOnly = ref(false);
  return { useGuard: () => ({ readOnly }) };
});

const SEC = 1000;
const MIN = 60 * SEC;
const T0 = new Date(2026, 9, 29, 9).getTime();

beforeEach(async () => {
  vi.resetModules();
  mock.edits.clear();
  mock.recorded.clear();
  mock.state = EditorState.create({ doc: 'INT. HALL - DAY\n\nShe waits.\n' });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
  const { db } = await import('../app/storage/db');
  await Promise.all(db.tables.map((table) => table.clear()));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A fresh visit: the session, the modules it reads, and a script of the writer's own open. */
async function visit(options: { sample?: boolean } = {}) {
  const { db } = await import('../app/storage/db');
  const { createProject } = await import('../app/storage/projects');
  const store = await import('../app/storage/snapshots');
  const { useScript } = await import('../app/storage/script');
  const { useGuard } = await import('../app/storage/guard');
  const snapshots = await import('../app/snapshots/use-snapshots');
  const p = await createProject({
    source: mock.state.doc.toString(),
    ...(options.sample ? { sample: 'screenplay' } : {}),
  });
  const script = useScript() as unknown as { project: { value: unknown } };
  script.project.value = p;
  const session = snapshots.useSnapshots();
  /** The history snapshots taken, oldest first. */
  const taken = async () => [...(await store.listSnapshots(p.id))].reverse();
  return {
    db,
    p,
    store,
    session,
    taken,
    snapshotProblem: snapshots.snapshotProblem,
    script,
    createProject,
    readOnly: (useGuard() as unknown as { readOnly: { value: boolean } }).readOnly,
  };
}

/** The writer types `text` at the end, at the clock's time. */
function type(text: string) {
  const tr = mock.state.update({
    changes: { from: mock.state.doc.length, insert: text },
    userEvent: 'input.type',
  });
  mock.state = tr.state;
  for (const listener of mock.edits) listener([tr]);
}

/** A key every 30 seconds from `from` to `to` (after T0), both ends included. */
function writeFor(from: number, to: number) {
  for (let at = from; at <= to; at += 30 * SEC) {
    vi.setSystemTime(T0 + at);
    type('x');
  }
}

function record(event: { kind: 'saved' | 'opened'; id: string; text: string; fileName: string }) {
  for (const listener of mock.recorded) listener(event);
}

/** Lets the takes that were started land. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe('the snapshot session', () => {
  test('takes a timed snapshot after 10 minutes of edits', async () => {
    const { taken, store, p } = await visit();
    writeFor(0, 9 * MIN + 30 * SEC);
    await settle();
    expect(await taken()).toEqual([]);
    vi.setSystemTime(T0 + 10 * MIN);
    type('y');
    const text = mock.state.doc.toString();
    await vi.waitFor(async () => expect(await taken()).toHaveLength(1));
    const [first] = await taken();
    expect(first?.reason).toBe('timed');
    expect(await store.snapshotText(first?.id ?? '')).toBe(text);
    // The count starts again: the next key is no new snapshot.
    vi.setSystemTime(T0 + 10 * MIN + 30 * SEC);
    type('z');
    await settle();
    expect(await taken()).toHaveLength(1);
    expect((await store.listSnapshots(p.id)).length).toBe(1);
  });

  test('takes a saved snapshot on save, and an opened one on open', async () => {
    const { taken, store, p, db } = await visit();
    const { hashText } = await import('../app/storage/hash');
    type(' Then she leaves.');
    const saved = mock.state.doc.toString();
    record({ kind: 'saved', id: p.id, text: saved, fileName: 'hall.fountain' });
    await vi.waitFor(async () => expect(await taken()).toHaveLength(1));
    const [first] = await taken();
    expect(first?.reason).toBe('saved');
    expect(await store.snapshotText(first?.id ?? '')).toBe(saved);
    expect((await db.snapshots.get(first?.id ?? ''))?.hash).toBe(await hashText(saved));

    // A file opened as a new script: its first snapshot is the file as it opened.
    const { createProject } = await import('../app/storage/projects');
    const opened = await createProject({ source: 'EXT. YARD - NIGHT\n\nRain.\n' });
    record({
      kind: 'opened',
      id: opened.id,
      text: 'EXT. YARD - NIGHT\n\nRain.\n',
      fileName: 'The Call.fountain',
    });
    await vi.waitFor(async () => expect(await store.listSnapshots(opened.id)).toHaveLength(1));
    expect((await store.listSnapshots(opened.id))[0]).toMatchObject({
      reason: 'opened',
      detail: 'The Call.fountain',
    });

    // A save right on the 10 minutes is one snapshot, not two. The count started again at the
    // save, after the first key's 30 seconds, so the 10 minutes are up at 10:30.
    writeFor(30 * SEC, 10 * MIN + 30 * SEC);
    record({ kind: 'saved', id: p.id, text: mock.state.doc.toString(), fileName: 'hall.fountain' });
    await settle();
    expect((await taken()).map((s) => s.reason)).toEqual(['saved', 'timed']);
  });

  test('takes none for a sample or in a read-only tab', async () => {
    const sample = await visit({ sample: true });
    expect(sample.session.notKept.value).toMatch(/sample/);
    writeFor(0, 12 * MIN);
    sample.session.before('before-expand');
    expect(await sample.session.take('Mine')).toBe('failed');
    await settle();
    expect(await sample.taken()).toEqual([]);

    vi.resetModules();
    mock.edits.clear();
    mock.recorded.clear();
    vi.setSystemTime(T0);
    const mine = await visit();
    mine.readOnly.value = true;
    expect(mine.session.notKept.value).toMatch(/another tab/);
    writeFor(0, 12 * MIN);
    mine.session.before('before-fix-all');
    record({ kind: 'saved', id: mine.p.id, text: 'saved', fileName: 'a.fountain' });
    expect(await mine.session.take()).toBe('failed');
    await settle();
    expect(await mine.taken()).toEqual([]);

    // The editing tab again.
    mine.readOnly.value = false;
    expect(mine.session.notKept.value).toBeNull();
    expect(await mine.session.take('Mine')).toBe('taken');
    expect((await mine.taken())[0]).toMatchObject({ reason: 'manual', label: 'Mine' });
  });

  test('before captures the text as it is when called', async () => {
    const { session, taken, store } = await visit();
    const before = mock.state.doc.toString();
    const version = session.version.value;
    session.before('before-expand');
    // The bulk operation runs at once, without waiting.
    type('\n\nINT. EXPANDED - DAY\n');
    await vi.waitFor(async () => expect(await taken()).toHaveLength(1));
    const [first] = await taken();
    expect(first?.reason).toBe('before-expand');
    expect(await store.snapshotText(first?.id ?? '')).toBe(before);
    await vi.waitFor(() => expect(session.version.value).toBeGreaterThan(version));
  });

  test('afterImport keeps the imported text with the file name, and none for a sample', async () => {
    const { session, taken, store } = await visit();
    session.afterImport('Title: Came in\n\nHello.\n', 'lamp.fdx');
    await vi.waitFor(async () => expect(await taken()).toHaveLength(1));
    const [first] = await taken();
    expect(first).toMatchObject({ reason: 'imported', detail: 'lamp.fdx' });
    expect(await store.snapshotText(first?.id ?? '')).toBe('Title: Came in\n\nHello.\n');

    vi.resetModules();
    mock.edits.clear();
    mock.recorded.clear();
    const sample = await visit({ sample: true });
    sample.session.afterImport('Title: Came in\n', 'lamp.fdx');
    await settle();
    expect(await sample.taken()).toEqual([]);
  });

  test('says a failed snapshot once per visit', async () => {
    const { session, db, snapshotProblem } = await visit();
    const full = () => Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    const put = vi
      .spyOn(db.snapshots, 'put')
      .mockImplementation(() => Promise.reject(full()) as never);
    expect(snapshotProblem.value).toBe('');
    expect(await session.take()).toBe('failed');
    expect(snapshotProblem.value).toBe(
      'Couldn’t keep a snapshot: this browser’s storage is full. Your script is safe, and saving still works.',
    );
    // It works again: the line goes.
    put.mockRestore();
    type('a');
    expect(await session.take()).toBe('taken');
    expect(snapshotProblem.value).toBe('');
    // Failing again in the same visit says nothing more.
    vi.spyOn(db.snapshots, 'put').mockRejectedValue(new Error('IndexedDB is down'));
    type('b');
    expect(await session.take()).toBe('failed');
    expect(snapshotProblem.value).toBe('');
  });

  test('says storage is full only when it is', async () => {
    const { session, db, snapshotProblem } = await visit();
    vi.spyOn(db.snapshots, 'put').mockRejectedValue(new Error('IndexedDB is down'));
    expect(await session.take()).toBe('failed');
    expect(snapshotProblem.value).toBe(
      'Couldn’t keep a snapshot in this browser. Your script is safe, and saving still works.',
    );
  });

  test('a script’s minutes of writing carry over when the writer switches away and back', async () => {
    const { script, createProject, p, store } = await visit();
    const b = await createProject({ source: 'EXT. YARD - NIGHT\n' });
    // Six minutes on A, six on B, then four more on A: A's ten minutes are up, and B's aren't.
    writeFor(0, 6 * MIN);
    script.project.value = b;
    writeFor(7 * MIN, 13 * MIN);
    script.project.value = p;
    writeFor(14 * MIN, 17 * MIN + 30 * SEC);
    await settle();
    expect(await store.listSnapshots(p.id)).toEqual([]);
    vi.setSystemTime(T0 + 18 * MIN);
    type('x');
    await vi.waitFor(async () =>
      expect((await store.listSnapshots(p.id)).map((s) => s.reason)).toEqual(['timed']),
    );
    expect(await store.listSnapshots(b.id)).toEqual([]);
  });

  test('a failed snapshot never throws into the save', async () => {
    const { db, p, snapshotProblem } = await visit();
    vi.spyOn(db.snapshots, 'put').mockRejectedValue(new Error('IndexedDB is down'));
    vi.spyOn(db, 'transaction').mockImplementation(() => {
      throw new Error('IndexedDB is gone');
    });
    expect(() =>
      record({ kind: 'saved', id: p.id, text: 'saved text', fileName: 'a.fountain' }),
    ).not.toThrow();
    await vi.waitFor(() =>
      expect(snapshotProblem.value).toBe(
        'Couldn’t keep a snapshot in this browser. Your script is safe, and saving still works.',
      ),
    );
  });
});
