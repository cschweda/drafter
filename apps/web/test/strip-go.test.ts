import { parse } from '@drafter/fountain';
import { type OutlineItem, type SceneIndex, sceneIndex } from '@drafter/outline';
import { builtins, type Template } from '@drafter/templates';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { GONE } from '../app/strip/labels';

// Going to a block from the strip (structure strip design §4, Call 9), over a session whose
// neighbors are mocked as count-budget.test.ts mocks its own: the Outline's index and ids, the
// editor's goto, and the Outline's live region.

const mocks = vi.hoisted(() => ({
  goto: vi.fn(),
  say: vi.fn(),
  strip: vi.fn(),
}));

vi.mock('../app/editor/session', () => ({
  useEditor: () => ({ goto: mocks.goto, onChange: () => () => {} }),
}));
vi.mock('../app/editor/layout', async () => {
  const { shallowRef } = await import('vue');
  const state = { layout: shallowRef(null), failed: shallowRef(false), cursorBlock: shallowRef(0) };
  return { useLayout: () => state };
});
vi.mock('../app/outline/notice', () => ({ sayOutline: mocks.say }));
vi.mock('../app/settings/settings', async () => {
  const { ref } = await import('vue');
  const settings = ref({ structureStrip: true });
  return { useSettings: () => ({ settings }) };
});
vi.mock('../app/outline/use-outline', async () => {
  const { shallowRef, computed } = await import('vue');
  const index = shallowRef<SceneIndex>({
    preamble: null,
    items: [],
    scenes: [],
    sections: [],
    tree: [],
  });
  const idOf = (item: OutlineItem) => `id-${item.block}`;
  const session = {
    index: computed(() => index.value),
    idOf,
    itemById: (id: string) => index.value.items.find((item) => idOf(item) === id),
  };
  return { useOutline: () => session, __index: index };
});
vi.mock('@drafter/outline', async (original) => {
  const real = await original<typeof import('@drafter/outline')>();
  mocks.strip.mockImplementation(real.structureStrip);
  return { ...real, structureStrip: mocks.strip };
});

const screenplay = builtins['us-screenplay'] as Template;
const SCRIPT = 'INT. HALL - DAY\n\nAnn waits.\n\n# Act One\n\nEXT. YARD - NIGHT\n\nRain.\n';

async function withScript(source: string) {
  const outline = (await import('../app/outline/use-outline')) as unknown as {
    __index: { value: SceneIndex };
  };
  outline.__index.value = sceneIndex(parse(source), screenplay, null);
  return outline.__index.value;
}

beforeEach(() => {
  mocks.goto.mockClear();
  mocks.say.mockClear();
});

describe('going from the strip', () => {
  test("go moves the cursor to the item's start", async () => {
    const index = await withScript(SCRIPT);
    const { useStrip } = await import('../app/strip/use-strip');
    const yard = index.scenes.find((scene) => scene.heading === 'EXT. YARD - NIGHT');
    const act = index.sections[0];
    expect(useStrip().go(`id-${yard?.block}`)).toBe(true);
    expect(mocks.goto).toHaveBeenLastCalledWith(yard?.span.from);
    expect(useStrip().go(`id-${act?.block}`)).toBe(true);
    expect(mocks.goto).toHaveBeenLastCalledWith(act?.span.from);
    expect(mocks.say).not.toHaveBeenCalled();
  });

  test('go says so when the scene is gone', async () => {
    await withScript(SCRIPT);
    const { useStrip } = await import('../app/strip/use-strip');
    expect(useStrip().go('id-999')).toBe(false);
    expect(mocks.say).toHaveBeenCalledWith(GONE);
    expect(mocks.goto).not.toHaveBeenCalled();
  });

  test('makes no strip while it is turned off', async () => {
    const { useSettings } = await import('../app/settings/settings');
    const { settings } = useSettings() as unknown as {
      settings: { value: { structureStrip: boolean } };
    };
    const { useStrip } = await import('../app/strip/use-strip');
    const { view } = useStrip();
    await withScript(SCRIPT);
    expect(view.value?.strip.rows.length).toBe(2);
    settings.value.structureStrip = false;
    mocks.strip.mockClear();
    await withScript(`${SCRIPT}\nINT. SHED - DAY\n\nDark.\n`);
    await Promise.resolve();
    expect(mocks.strip).not.toHaveBeenCalled();
    expect(view.value).toBeNull();
    // On again, it is drawn from the script as it is now.
    settings.value.structureStrip = true;
    await Promise.resolve();
    expect(view.value?.strip.rows.at(-1)?.blocks).toHaveLength(3);
  });
});
