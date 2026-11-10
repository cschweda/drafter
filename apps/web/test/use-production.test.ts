import { type Doc, parse, type TextChange } from '@drafter/fountain';
import { lock, scriptText } from '@drafter/production';
import { builtins, type Template } from '@drafter/templates';
import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick, type ShallowRef, shallowRef } from 'vue';

// The web app's production state (production design §6.3a): the block is read, and its baseline
// decoded, on the main thread once per block, never per keystroke; an unlocked script has none,
// and a damaged block has none and says so.

const env = vi.hoisted(() => ({
  doc: null as unknown as ShallowRef<Doc>,
  decode: vi.fn(),
}));
vi.mock('../app/editor/session', () => ({ useEditor: () => ({ doc: env.doc }) }));
vi.mock('@drafter/production', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@drafter/production')>();
  env.decode.mockImplementation(actual.decodeBaseline);
  return { ...actual, decodeBaseline: env.decode };
});

const template = builtins['us-screenplay'] as Template;
const UNLOCKED = 'INT. HALL - DAY\n\nShe waits by the door.\n\nThe phone rings.\n';

function apply(text: string, changes: readonly TextChange[]): string {
  let out = text;
  for (const c of [...changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  }
  return out;
}

const lockText = async (text: string) =>
  apply(text, await lock(text, template, { today: '2026-11-09', draftId: 'd1', firstScene: 1 }));

let LOCKED = '';
let OTHER = '';
beforeAll(async () => {
  LOCKED = await lockText(UNLOCKED);
  OTHER = await lockText(`${UNLOCKED}\nA dog barks.\n`);
});

/** Lets the decode, and the watcher after it, finish. */
async function settle() {
  await vi.waitFor(async () => {
    await nextTick();
    expect(env.decode.mock.results.every((r) => r.type !== 'incomplete')).toBe(true);
  });
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

async function fresh() {
  vi.resetModules();
  return import('../app/production/use-production');
}

beforeEach(() => {
  env.doc = shallowRef(parse(UNLOCKED));
  env.decode.mockClear();
});

describe('useProduction', () => {
  test('an unlocked script has no production', async () => {
    const { useProduction } = await fresh();
    const p = useProduction();
    await settle();
    expect(p.state.value).toBeNull();
    expect(p.locked.value).toBe(false);
    expect(p.openSet.value).toBeNull();
    expect(p.damaged.value).toBe(false);
    expect(env.decode).not.toHaveBeenCalled();
  });

  test('decodes once per block', async () => {
    const { useProduction } = await fresh();
    const p = useProduction();
    env.doc.value = parse(LOCKED);
    await settle();
    expect(env.decode).toHaveBeenCalledTimes(1);
    expect(p.locked.value).toBe(true);
    // The script as locked, without its block.
    expect(p.state.value?.baselineText).toBe(scriptText(LOCKED));
    expect(p.state.value?.baselineText.startsWith('INT. HALL - DAY #1#\n')).toBe(true);
    expect(p.openSet.value?.name).toBe('Blue');

    // Typing changes the text, not the block: nothing is decoded again, and the state is the same.
    const state = p.state.value;
    for (const word of ['softly', 'again', 'still']) {
      env.doc.value = parse(LOCKED.replace('waits', `waits ${word}`));
      await settle();
    }
    expect(env.decode).toHaveBeenCalledTimes(1);
    expect(p.state.value).toBe(state);

    // A changed block is read again, but its baseline, the same string, isn't decoded again.
    env.doc.value = parse(LOCKED.replace('"Blue"', '"Azure"'));
    await settle();
    expect(env.decode).toHaveBeenCalledTimes(1);
    expect(p.openSet.value?.name).toBe('Azure');
    expect(p.state.value?.baselineText).toBe(state?.baselineText);

    // Another baseline is.
    env.doc.value = parse(OTHER);
    await settle();
    expect(env.decode).toHaveBeenCalledTimes(2);
    expect(p.state.value?.baselineText).toContain('A dog barks.');

    // Unlocked: no production, at once.
    env.doc.value = parse(UNLOCKED);
    await settle();
    expect(p.state.value).toBeNull();
    expect(p.damaged.value).toBe(false);
  });

  test('a damaged block has no production, and says so', async () => {
    const { useProduction, DAMAGED_MESSAGE } = await fresh();
    expect(DAMAGED_MESSAGE).toBe("Revision marks can't be shown: the block is damaged");
    const p = useProduction();
    // A baseline that isn't gzip.
    env.doc.value = parse(LOCKED.replace(/"baseline":"[^"]+"/, '"baseline":"bm90IGd6aXA="'));
    await settle();
    expect(p.state.value).toBeNull();
    expect(p.damaged.value).toBe(true);
    expect(p.problem.value).toBe(DAMAGED_MESSAGE);

    // A production key that can't be read at all.
    env.doc.value = parse(LOCKED.replace('"lockedAt":', '"lockedAt":7,"x":'));
    await settle();
    expect(p.state.value).toBeNull();
    expect(p.damaged.value).toBe(true);

    // A good block again.
    env.doc.value = parse(LOCKED);
    await settle();
    expect(p.damaged.value).toBe(false);
    expect(p.problem.value).toBe('');
    expect(p.locked.value).toBe(true);
  });
});
