import { type Doc, parse } from '@drafter/fountain';
import { type Layout, paginate } from '@drafter/layout';
import type { SceneIndex } from '@drafter/outline';
import { builtins, type Template } from '@drafter/templates';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { type ComputedRef, computed, type Ref, ref, type ShallowRef, shallowRef } from 'vue';

// The cast session (seeing-the-script design §3.7, Call 48): worked out on the main thread only
// while a view holds it, CAST_PAUSE_MS after the parse, the layout, or the dictionary's answers
// change, keeping the last cast meanwhile, and the last pages-based one while the layout lags.
// The editor, the layout, the Outline's index, and the answers are stand-ins over real parses.
const env = vi.hoisted(() => ({
  doc: null as unknown as ShallowRef<Doc>,
  template: null as unknown as ShallowRef<Template>,
  kind: null as unknown as ShallowRef<'fountain' | 'markdown'>,
  layout: null as unknown as ShallowRef<Layout | null>,
  failed: null as unknown as Ref<boolean>,
  updating: null as unknown as Ref<boolean>,
  index: null as unknown as ComputedRef<SceneIndex>,
  listeners: new Set<(changes: unknown) => void>(),
  words: new Map<string, boolean>(),
  version: null as unknown as Ref<number>,
  ask: vi.fn(),
  castOf: vi.fn(),
}));
vi.mock('../app/editor/session', () => ({
  useEditor: () => ({
    doc: env.doc,
    template: env.template,
    kind: env.kind,
    onChange: (listener: (changes: unknown) => void) => {
      env.listeners.add(listener);
      return () => env.listeners.delete(listener);
    },
  }),
}));
vi.mock('../app/editor/layout', () => ({
  useLayout: () => ({ layout: env.layout, failed: env.failed, updating: env.updating }),
}));
vi.mock('../app/outline/use-outline', () => ({ useOutline: () => ({ index: env.index }) }));
vi.mock('../app/cast/words', () => ({
  useWordAnswers: () => ({
    isWord: (name: string) => env.words.get(name.toUpperCase()),
    ask: env.ask,
    version: env.version,
  }),
}));
vi.mock('@drafter/cast', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@drafter/cast')>();
  env.castOf.mockImplementation(actual.castOf);
  return { ...actual, castOf: env.castOf };
});

const screenplay = builtins['us-screenplay'] as Template;

/** Original text for these tests. */
const DOCK = `INT. DOCK OFFICE - NIGHT

WILL sorts the manifests. Will you look at this, he thinks.

WILL
Late again.

EXT. DOCK - NIGHT

ODA
Here.

Will waits at the rail.
`;

async function session() {
  const { sceneIndex } = await import('@drafter/outline');
  env.index = computed(() => sceneIndex(env.doc.value, env.template.value, env.layout.value));
  const { CAST_PAUSE_MS, useCast } = await import('../app/cast/use-cast');
  return { CAST_PAUSE_MS, cast: useCast() };
}

/** A new parse, as the editor makes after an edit; the layout is left as it was. */
function type(text: string) {
  env.doc.value = parse(text);
}
/** The idle callbacks asked for and not yet run or cancelled. */
const idle = new Map<number, () => void>();
let handles = 0;

/** Lets `ms` pass, then an idle moment, when the cast is worked out. */
async function wait(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  const due = [...idle.values()];
  idle.clear();
  for (const callback of due) callback();
}
const layOut = () => {
  env.layout.value = paginate(env.doc.value, screenplay);
  env.updating.value = false;
};

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  env.doc = shallowRef(parse(DOCK));
  env.template = shallowRef(screenplay);
  env.kind = shallowRef('fountain');
  env.layout = shallowRef(null);
  env.failed = ref(false);
  env.updating = ref(false);
  env.listeners = new Set();
  env.words = new Map([['WILL', true]]);
  env.version = ref(0);
  env.ask.mockClear();
  env.castOf.mockClear();
  idle.clear();
  vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
    idle.set(++handles, callback);
    return handles;
  });
  vi.stubGlobal('cancelIdleCallback', (handle: number) => idle.delete(handle));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const scenesOf = (
  cast: { figures: Map<string, { scenes: readonly { scene: number }[] }> },
  key: string,
) => cast.figures.get(key)?.scenes.map((p) => p.scene);

describe('useCast', () => {
  test('computes nothing while no view needs it', async () => {
    const { cast } = await session();
    type(`${DOCK}\nMore.\n`);
    await wait(2000);
    expect(env.castOf).not.toHaveBeenCalled();
    expect(cast.cast.value).toBeNull();

    // A view opens: the cast is worked out at once (in an idle moment), with no pause to wait.
    const release = cast.need();
    await wait(0);
    expect(env.castOf).toHaveBeenCalledOnce();
    expect(cast.cast.value?.characters.map((c) => c.key)).toEqual(['WILL', 'ODA']);
    // Its names go to the dictionary.
    expect(env.ask).toHaveBeenLastCalledWith(['WILL', 'ODA']);

    // Closed: typing costs nothing again, and the last cast stays for the next view.
    release();
    release(); // twice is once
    type(`${DOCK}\nMore still.\n`);
    await wait(2000);
    expect(env.castOf).toHaveBeenCalledOnce();
    expect(cast.cast.value).not.toBeNull();

    // Two views: closing one keeps it working.
    const a = cast.need();
    const b = cast.need();
    await wait(0);
    expect(env.castOf).toHaveBeenCalledTimes(2);
    a();
    type(DOCK);
    await wait(1000);
    expect(env.castOf).toHaveBeenCalledTimes(3);
    b();
  });

  test('recomputes once after a 300 ms pause', async () => {
    const { CAST_PAUSE_MS, cast } = await session();
    expect(CAST_PAUSE_MS).toBe(300);
    cast.need();
    await wait(0);
    expect(env.castOf).toHaveBeenCalledTimes(1);
    for (const extra of ['A', 'AB', 'ABC']) {
      type(`${DOCK}\n${extra}\n`);
      await wait(100);
    }
    expect(env.castOf).toHaveBeenCalledTimes(1);
    await wait(CAST_PAUSE_MS - 101);
    expect(env.castOf).toHaveBeenCalledTimes(1);
    await wait(1);
    expect(env.castOf).toHaveBeenCalledTimes(2);
    await wait(2000);
    expect(env.castOf).toHaveBeenCalledTimes(2);
    // The layout arriving is a change too.
    layOut();
    await wait(CAST_PAUSE_MS);
    expect(env.castOf).toHaveBeenCalledTimes(3);
  });

  test('keeps the last cast while typing', async () => {
    const { CAST_PAUSE_MS, cast } = await session();
    cast.need();
    await wait(0);
    const first = cast.cast.value;
    expect(first).not.toBeNull();
    const before = cast.basis.value;
    expect(before?.index).toBe(env.index.value);
    expect(before?.doc).toBe(env.doc.value);
    type(`${DOCK}\nEXT. ROAD - DAY\n\nPIK\nOff we go.\n`);
    await wait(CAST_PAUSE_MS - 1);
    // Never empty in between: the last cast until the new one, with the scenes it was made from.
    expect(cast.cast.value).toBe(first);
    expect(cast.basis.value).toBe(before);
    expect(cast.basis.value?.index.scenes).toHaveLength(2);
    await wait(1);
    expect(cast.cast.value?.characters.map((c) => c.key)).toContain('PIK');
    expect(cast.basis.value?.index).toBe(env.index.value);
    expect(cast.basis.value?.index.scenes).toHaveLength(3);
    // Another script: nothing of the last one's cast is kept.
    for (const listener of env.listeners) listener(null);
    expect(cast.cast.value).toBeNull();
    expect(cast.basis.value).toBeNull();
  });

  test('keeps pages-based figures while the layout lags', async () => {
    layOut();
    const { CAST_PAUSE_MS, cast } = await session();
    cast.need();
    await wait(0);
    const paged = cast.cast.value;
    expect(paged?.figures.get('WILL')?.screenEighths).not.toBeNull();

    // A new scene: the layout hasn't caught up, so the index has no pages.
    env.updating.value = true;
    type(`${DOCK}\nEXT. ROAD - DAY\n\nPIK\nOff we go.\n`);
    await wait(CAST_PAUSE_MS);
    expect(env.index.value.scenes.every((s) => s.pages === null)).toBe(true);
    expect(cast.cast.value).toBe(paged);

    // The layout comes: the new cast, with its pages.
    layOut();
    await wait(CAST_PAUSE_MS);
    expect(cast.cast.value).not.toBe(paged);
    expect(cast.cast.value?.figures.get('PIK')?.screenEighths).not.toBeNull();

    // A failed layout isn't waited for: the cast goes on without pages.
    env.failed.value = true;
    type(`${DOCK}\nEXT. ROAD - DAY\n\nPIK\nOff we go.\n\nINT. VAN - DAY\n\nPIK\nIn.\n`);
    await wait(CAST_PAUSE_MS);
    expect(cast.cast.value?.figures.get('PIK')?.screenEighths).toBeNull();
    expect(scenesOf(cast.cast.value as never, 'PIK')).toEqual([2, 3]);
  });

  test('a scene whose pages stay null while the layout is current still gets a fresh cast', async () => {
    layOut();
    const { CAST_PAUSE_MS, cast } = await session();
    cast.need();
    await wait(0);
    const paged = cast.cast.value;
    // The index has no pages, but the layout isn't working on anything: nothing is coming to
    // wait for, so the cast is worked out now, without pages.
    type(`${DOCK}\nEXT. ROAD - DAY\n\nPIK\nOff we go.\n`);
    await wait(CAST_PAUSE_MS);
    expect(env.index.value.scenes.some((s) => s.pages === null)).toBe(true);
    expect(cast.cast.value).not.toBe(paged);
    expect(cast.cast.value?.characters.map((c) => c.key)).toContain('PIK');
    expect(cast.cast.value?.figures.get('PIK')?.screenEighths).toBeNull();
    // The layout catching up ends its work (updating falls) with a new layout: paged again.
    env.updating.value = true;
    await wait(CAST_PAUSE_MS);
    layOut();
    await wait(CAST_PAUSE_MS);
    expect(cast.cast.value?.figures.get('PIK')?.screenEighths).not.toBeNull();
  });

  test('the word answers recompute it', async () => {
    const { CAST_PAUSE_MS, cast } = await session();
    cast.need();
    await wait(0);
    // Will is a word: only WILL in capitals puts him in a scene.
    expect(scenesOf(cast.cast.value as never, 'WILL')).toEqual([0]);
    // The answer changes (say, the language did).
    env.words.set('WILL', false);
    env.version.value++;
    await wait(CAST_PAUSE_MS);
    expect(env.castOf).toHaveBeenCalledTimes(2);
    expect(scenesOf(cast.cast.value as never, 'WILL')).toEqual([0, 1]);
  });
});
