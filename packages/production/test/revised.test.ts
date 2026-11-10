import { parse, type TextChange } from '@drafter/fountain';
import type { Layout, LayoutLine, Page } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import { lock, setHeader } from '../src/actions';
import { readProduction } from '../src/block';
import { productionLayout } from '../src/layout';
import { labelRange, noRevisedPages, revisedPages } from '../src/revised';

const template = builtins['us-screenplay'] as Template;

const line = (set?: string): LayoutLine => ({
  col: 0,
  runs: [{ text: 'x' }] as LayoutLine['runs'],
  role: 'action',
  blockIndex: 0,
  span: { from: 0, to: 1 },
  ...(set ? { mark: { set } } : {}),
});

const page = (number: number, label: string, marks: Array<string | undefined> = []): Page => ({
  number,
  label,
  lines: [line(), ...marks.map((m) => line(m))],
  sceneNumbersLeft: [],
  sceneNumbersRight: [],
});

/** A title page, then 11, 12, 12A, 12B, 13-14, 15: Blue marks on 12A and 15, Pink on 12. */
const LAYOUT: Layout = {
  pages: [
    page(0, '', ['Blue']),
    page(1, '11'),
    page(2, '12', ['Pink']),
    page(3, '12A', [undefined, 'Blue']),
    page(4, '12B'),
    page(5, '13-14'),
    page(6, '15', ['Blue']),
  ],
  index: [{ page: 1, line: 0 }],
  diagnostics: [],
};

const labels = (layout: Layout) => layout.pages.map((p) => p.label);

describe('revisedPages', () => {
  it('current keeps only pages with the open set’s marks, in order, with their labels', () => {
    // The layout the current revision is chosen from carries the open set's marks only.
    const open: Layout = {
      ...LAYOUT,
      pages: LAYOUT.pages.map((p) => ({
        ...p,
        lines: p.lines.map((l) => (l.mark?.set === 'Blue' ? l : { ...l, mark: undefined })),
      })),
    };
    expect(labels(revisedPages(open, { kind: 'current' }))).toEqual(['12A', '15']);
  });

  it('all keeps every page with a mark, never the title page', () => {
    expect(labels(revisedPages(LAYOUT, { kind: 'all' }))).toEqual(['12', '12A', '15']);
  });

  it('chooses by one layout and prints another', () => {
    const open: Layout = {
      ...LAYOUT,
      pages: LAYOUT.pages.map((p) => (p.label === '12' ? page(2, '12') : p)),
    };
    const out = revisedPages(LAYOUT, { kind: 'current' }, open);
    expect(labels(out)).toEqual(['12A', '15']);
    expect(out.pages[0]).toBe(LAYOUT.pages[3]);
  });

  it('a page with a mark only in its right column counts', () => {
    const right = page(1, '7');
    right.lines = [{ ...line(), right: line('Blue') }];
    const layout: Layout = { pages: [right, page(2, '8')], index: [], diagnostics: [] };
    expect(labels(revisedPages(layout, { kind: 'all' }))).toEqual(['7']);
  });

  it('range 12–13 keeps 12, 12A, 12B, 13-14', () => {
    expect(labels(revisedPages(LAYOUT, { kind: 'range', from: '12', to: '13' }))).toEqual([
      '12',
      '12A',
      '12B',
      '13-14',
    ]);
    // Either end of a range label matches; case and spaces don't matter; reversed ends swap.
    expect(labels(revisedPages(LAYOUT, { kind: 'range', from: ' 14 ', to: '12a' }))).toEqual([
      '12A',
      '12B',
      '13-14',
    ]);
    expect(labels(revisedPages(LAYOUT, { kind: 'range', from: '15', to: '15' }))).toEqual(['15']);
  });

  it('a range whose end isn’t a page keeps nothing', () => {
    expect(revisedPages(LAYOUT, { kind: 'range', from: '12', to: '99' }).pages).toEqual([]);
    expect(revisedPages(LAYOUT, { kind: 'range', from: '', to: '12' }).pages).toEqual([]);
  });

  it('refuses an empty revised-pages export with a message', () => {
    expect(noRevisedPages({ kind: 'current' }, 'Blue')).toBe('There are no Blue changes to print.');
    expect(noRevisedPages({ kind: 'all' }, 'Blue')).toBe('There are no revised pages to print.');
    expect(noRevisedPages({ kind: 'range', from: '1', to: '2' }, 'Blue')).toBe(
      'There are no revised pages to print.',
    );
  });
});

function apply(text: string, changes: readonly TextChange[]): string {
  let out = text;
  for (const c of [...changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, c.from) + c.insert + out.slice(c.to);
  }
  return out;
}

const body = (from: number, count: number) =>
  Array.from({ length: count }, (_, i) => `Line ${from + i} of the hall.\n`).join('\n');
const UNLOCKED = `INT. HALL - DAY\n\n${body(1, 120)}`;

async function locked(): Promise<string> {
  return apply(
    UNLOCKED,
    await lock(UNLOCKED, template, { today: '2026-11-09', draftId: 'd', firstScene: 1 }),
  );
}

describe('revised pages of a real locked script', () => {
  it('keeps the edited page with its locked label', async () => {
    const text = (await locked()).replace('Line 70 of the hall.', 'Line 70 of the great hall.');
    const { layout } = await productionLayout(text, template, {
      sceneNumbers: 'none',
      marks: 'open',
    });
    const out = revisedPages(layout, { kind: 'current' });
    expect(out.pages).toHaveLength(1);
    expect(out.pages[0]?.lines.some((l) => l.mark?.set === 'Blue')).toBe(true);
    expect(out.pages[0]?.label).toBe(layout.pages.find((p) => p.lines.some((l) => l.mark))?.label);
  });

  it('an untouched locked script has nothing to print', async () => {
    const { layout } = await productionLayout(await locked(), template, {
      sceneNumbers: 'none',
      marks: 'all',
    });
    expect(revisedPages(layout, { kind: 'all' }).pages).toEqual([]);
  });
});

describe('the header', () => {
  it('setHeader keeps a header in the block, and null removes it', async () => {
    const text = await locked();
    const withHeader = apply(text, await setHeader(text, 'Blue Pages — Shooting Draft'));
    expect(readProduction(parse(withHeader).meta)?.header).toBe('Blue Pages — Shooting Draft');
    // The script text is untouched.
    expect(withHeader.slice(0, 200)).toBe(text.slice(0, 200));
    const without = apply(withHeader, await setHeader(withHeader, null));
    expect(readProduction(parse(without).meta)?.header).toBeUndefined();
    expect(readProduction(parse(without).meta)).not.toBeNull();
  });

  it('setHeader trims, treats blank as removal, and does nothing to an unlocked script', async () => {
    const text = await locked();
    const trimmed = apply(text, await setHeader(text, '  Blue Pages  '));
    expect(readProduction(parse(trimmed).meta)?.header).toBe('Blue Pages');
    expect(await setHeader(trimmed, '   ')).not.toEqual([]);
    const blank = apply(trimmed, await setHeader(trimmed, '   '));
    expect(readProduction(parse(blank).meta)?.header).toBeUndefined();
    expect(await setHeader(UNLOCKED, 'Blue')).toEqual([]);
    // No change when it is already so.
    expect(await setHeader(trimmed, 'Blue Pages')).toEqual([]);
    expect(await setHeader(text, null)).toEqual([]);
  });

  it('setHeader refuses a header the block wouldn’t read back', async () => {
    const text = await locked();
    await expect(setHeader(text, 'x'.repeat(201))).rejects.toThrow();
    await expect(setHeader(text, 'Blue\u0007')).rejects.toThrow();
  });
});

describe('productionLayout’s header', () => {
  it('is the block’s own header, or null', async () => {
    const text = await locked();
    const opts = { sceneNumbers: 'none', marks: 'none' } as const;
    expect((await productionLayout(text, template, opts)).header).toBeNull();
    const kept = apply(text, await setHeader(text, 'Blue Pages'));
    expect((await productionLayout(kept, template, opts)).header).toBe('Blue Pages');
    expect((await productionLayout(UNLOCKED, template, opts)).header).toBeNull();
  });
});

describe('labelRange', () => {
  it('names pages by label, either end of a range label, either way round', () => {
    const labels = ['11', '12', '12A', '12B', '13-14', '15'];
    expect(labelRange(labels, '12', '13')).toEqual([1, 2, 3, 4]);
    expect(labelRange(labels, '15', '12b')).toEqual([3, 4, 5]);
    expect(labelRange(labels, '12', 'nope')).toEqual([]);
    expect(labelRange([], '1', '1')).toEqual([]);
  });
});
