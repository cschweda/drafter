import { parse, type TextChange } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import { lock, startNextSet } from '../src/actions';
import { productionLayout } from '../src/layout';

const template = builtins['us-screenplay'] as Template;
const draftId = 'a'.repeat(64);

function apply(text: string, changes: readonly TextChange[]): string {
  let out = text;
  for (const c of [...changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  }
  return out;
}

const body = (from: number, count: number, tag = 'Line') =>
  Array.from({ length: count }, (_, i) => `${tag} ${from + i} of the hall.\n`).join('\n');
const UNLOCKED = `INT. HALL - DAY\n\n${body(1, 120)}`;

const marksOf = (layout: ReturnType<typeof paginate>) => {
  const sets = new Set<string>();
  for (const page of layout.pages) for (const l of page.lines) if (l.mark) sets.add(l.mark.set);
  return [...sets];
};

/** A locked script; a change, Start next set (closing Blue with its mark), and another change. */
async function twoSets() {
  const locked = apply(
    UNLOCKED,
    await lock(UNLOCKED, template, { today: '2026-11-09', draftId, firstScene: 1 }),
  );
  // A change in the first set (Blue), then Start next set closes it (its mark is kept), then another change.
  const first = locked.replace('Line 5 of the hall.', 'Line 5 was rewritten.');
  const next = apply(first, await startNextSet(first, '2026-11-10', draftId, template));
  const second = next.replace('Line 90 of the hall.', 'Line 90 was changed again.');
  return { locked, second };
}

describe('productionLayout', () => {
  it('an unlocked script lays out exactly as paginate does', async () => {
    const result = await productionLayout(UNLOCKED, template, {
      sceneNumbers: 'all',
      marks: 'open',
    });
    expect(result.locked).toBe(false);
    expect(result.open).toBeNull();
    expect(result.sets).toEqual([]);
    expect(result.layout).toEqual(paginate(parse(UNLOCKED), template, { sceneNumbers: 'all' }));
  });

  it('a locked script gets labels and the open set marks', async () => {
    const { locked } = await twoSets();
    const edited = locked.replace('Line 5 of the hall.', 'Line 5 was rewritten.');
    const result = await productionLayout(edited, template, { sceneNumbers: 'all', marks: 'open' });
    expect(result.locked).toBe(true);
    expect(result.open?.name).toBe('Blue');
    expect(result.layout.pages.some((p) => p.number > 0 && p.label !== '')).toBe(true);
    expect(marksOf(result.layout)).toEqual(['Blue']);
  });

  it('marks: none applies no marks but keeps labels', async () => {
    const { locked } = await twoSets();
    const edited = locked.replace('Line 5 of the hall.', 'Line 5 was rewritten.');
    const none = await productionLayout(edited, template, { sceneNumbers: 'all', marks: 'none' });
    const open = await productionLayout(edited, template, { sceneNumbers: 'all', marks: 'open' });
    expect(marksOf(none.layout)).toEqual([]);
    expect(none.layout.pages.map((p) => p.label)).toEqual(open.layout.pages.map((p) => p.label));
  });

  it('marks: all keeps closed sets marks, open only does not', async () => {
    const { second } = await twoSets();
    const open = await productionLayout(second, template, { sceneNumbers: 'all', marks: 'open' });
    const all = await productionLayout(second, template, { sceneNumbers: 'all', marks: 'all' });
    expect(open.sets).toHaveLength(3);
    expect(marksOf(open.layout)).toEqual([open.open?.name]);
    // White, the locked draft's set, has no marks; Blue closed with one; the open set has one.
    expect(marksOf(all.layout).sort()).toEqual(['Blue', open.open?.name as string].sort());
  });

  it('a damaged block lays out unlocked', async () => {
    const { locked } = await twoSets();
    const damaged = locked.replace(/"baseline":\s*"[^"]*"/, '"baseline": ""');
    expect(damaged).not.toBe(locked);
    const result = await productionLayout(damaged, template, {
      sceneNumbers: 'all',
      marks: 'open',
    });
    expect(result.locked).toBe(false);
    expect(result.layout).toEqual(paginate(parse(damaged), template, { sceneNumbers: 'all' }));
  });

  it('a baseline that will not decode lays out unlocked', async () => {
    const { locked } = await twoSets();
    const production = /"baseline":\s*"([^"]*)"/.exec(locked);
    expect(production).not.toBeNull();
    const damaged = locked.replace(/"baseline":\s*"[^"]*"/, '"baseline": "bm90IGd6aXA="');
    const result = await productionLayout(damaged, template, {
      sceneNumbers: 'all',
      marks: 'open',
    });
    expect(result.locked).toBe(false);
  });
});
