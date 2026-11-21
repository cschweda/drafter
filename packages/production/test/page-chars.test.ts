import { readFileSync } from 'node:fs';
import type { DrafterMeta } from '@drafter/fountain';
import { parse } from '@drafter/fountain';
import { type Layout, paginate } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import { productionMeta, readProduction } from '../src';
import { rebaseAnchors, resolveAnchors } from '../src/anchors';
import { lockedPagesOf } from '../src/layout';
import { pageMapOf } from '../src/pages';
import type { LockedPage, Production } from '../src/types';

// Locked pages by character (docs/plans/2026-11-21-sentence-page-breaks.md, §5): a page may start
// inside a printed line now, where a sentence does, so a lock records the character its page
// starts at, beside the count of printed lines that v0.27.1 and earlier read.
const read = (name: string) =>
  readFileSync(new URL(`fixtures/v0271/${name}`, import.meta.url), 'utf8');
const prose = read('prose.fountain');
const body = (layout: Layout) => layout.pages.filter((p) => p.number > 0);
const first = (layout: Layout, label: string) =>
  body(layout)
    .find((p) => p.label === label)
    ?.lines.find((l) => l.blockIndex >= 0)
    ?.runs.map((r) => r.text)
    .join('');
const lineStarts = (text: string) => {
  const out = [0];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) out.push(i + 1);
  return out;
};

for (const id of ['us-screenplay', 'stage-play-standard']) {
  const template = builtins[id] as Template;
  describe(`a lock made now: ${id}`, () => {
    const free = paginate(parse(prose), template);
    const pages = pageMapOf(free, prose);

    it('records the character each page starts at', () => {
      const starts = lineStarts(prose);
      for (const page of pages) {
        const at = (starts[page.line] as number) + (page.char as number);
        const text = (first(free, page.label) as string).slice(0, 12);
        expect(prose.slice(at, at + text.length), `page ${page.label}`).toBe(text);
      }
    });

    it('has pages that start inside a printed line, where a sentence does', () => {
      // The line before such a page is short: the page's first word would have fitted on it.
      const pagesOf = body(free);
      let inside = 0;
      for (let n = 1; n < pagesOf.length; n++) {
        const top = pagesOf[n]?.lines.find((l) => l.blockIndex >= 0);
        const foot = pagesOf[n - 1]?.lines.findLast((l) => l.blockIndex >= 0);
        if (!top || !foot || top.blockIndex !== foot.blockIndex) continue;
        const width = template.roles[foot.role]?.width as number;
        const text = (l: typeof top) => l.runs.map((r) => r.text).join('');
        const word = text(top).split(' ')[0] as string;
        if (text(foot).length + 1 + word.length <= width) inside++;
      }
      expect(inside).toBeGreaterThan(2);
    });

    it('keeps the pages it was made on, line for line', () => {
      const locked = paginate(parse(prose), template, {
        locked: lockedPagesOf(pages, prose, prose),
      });
      expect(body(locked).map((p) => p.label)).toEqual(body(free).map((p) => String(p.number)));
      expect(body(locked).map((p) => p.lines)).toEqual(body(free).map((p) => p.lines));
    });

    it('starts each page at the same word when its paragraph is edited before that word', () => {
      const starts = lineStarts(prose);
      const lines = prose.split('\n');
      for (const page of pages.filter((p) => (p.char as number) > 30).slice(0, 4)) {
        // A few words added near the start of the page's own source line.
        const edited = [...lines];
        const line = edited[page.line] as string;
        const space = line.indexOf(' ', 8);
        edited[page.line] = `${line.slice(0, space)} at long last${line.slice(space)}`;
        const current = edited.join('\n');
        const locked = paginate(parse(current), template, {
          locked: lockedPagesOf(pages, prose, current),
        });
        const at = (starts[page.line] as number) + (page.char as number);
        expect(first(locked, page.label)?.slice(0, 12), `page ${page.label}`).toBe(
          prose.slice(at, at + 12),
        );
      }
    });

    it('starts each page at the same word when its paragraph is edited after that word', () => {
      const starts = lineStarts(prose);
      const lines = prose.split('\n');
      const page = pages.find((p) => (p.char as number) > 30) as LockedPage;
      const edited = [...lines];
      edited[page.line] = `${edited[page.line]} And one thing more happens.`;
      const current = edited.join('\n');
      const locked = paginate(parse(current), template, {
        locked: lockedPagesOf(pages, prose, current),
      });
      const at = (starts[page.line] as number) + (page.char as number);
      expect(first(locked, page.label)?.slice(0, 12)).toBe(prose.slice(at, at + 12));
    });
  });
}

describe('page characters through edits', () => {
  const base = ['one', 'The door gives. Marlow steps through. He waits.', 'three'].join('\n');
  const pages: LockedPage[] = [
    { label: '1', line: 0, printed: 0, char: 0 },
    { label: '2', line: 1, printed: 1, char: 16 },
  ];

  it('gives the character with the anchor', () => {
    expect(resolveAnchors(pages, base, base).anchors[1]).toEqual({
      label: '2',
      at: 4,
      printed: 1,
      char: 16,
    });
  });

  it('moves it with text added before it in its line', () => {
    const cur = base.replace('The door gives.', 'The old door gives at last.');
    expect(resolveAnchors(pages, base, cur).anchors[1]?.char).toBe(28);
  });

  it('leaves it where it is when text is added after it', () => {
    const cur = base.replace('He waits.', 'He waits a long time.');
    expect(resolveAnchors(pages, base, cur).anchors[1]?.char).toBe(16);
  });

  it('puts it where the change starts when its own words are rewritten', () => {
    const cur = base.replace('gives. Marlow steps', 'opens and he steps');
    expect(resolveAnchors(pages, base, cur).anchors[1]?.char).toBe(9);
  });

  it('carries it into a new baseline', () => {
    const cur = `zero\n${base.replace('The door gives.', 'The old door gives.')}`;
    expect(rebaseAnchors(pages, base, cur)[1]).toEqual({
      label: '2',
      line: 2,
      printed: 1,
      char: 20,
    });
  });

  it('gives none for a page locked by an earlier version', () => {
    const old: LockedPage[] = pages.map(({ label, line, printed }) => ({ label, line, printed }));
    expect(resolveAnchors(old, base, base).anchors[1]).toEqual({ label: '2', at: 4, printed: 1 });
    expect(rebaseAnchors(old, base, base)[1]).toEqual({ label: '2', line: 1, printed: 1 });
  });
});

describe('page characters in the file', () => {
  const production: Production = {
    lockedAt: '2026-11-21',
    firstScene: 1,
    numbers: ['1'],
    pages: [
      { label: '1', line: 3, printed: 0, char: 0 },
      { label: '2', line: 40, printed: 2, char: 131 },
    ],
    sets: [{ name: 'Blue', color: '#8fb4e8', date: '2026-11-21', draft: 'a'.repeat(64) }],
    baseline: 'H4sIAAAAAAAA',
  };
  const stored = (p: Production) =>
    (productionMeta(null, p) as unknown as { production: Record<string, unknown> }).production;
  const meta = (block: unknown) => ({ v: 1, production: block }) as unknown as DrafterMeta;

  it('writes them beside the pages, whose tuples stay as an earlier version reads them', () => {
    const block = stored(production);
    expect(block.pages).toEqual([
      ['1', 3, 0],
      ['2', 40, 2],
    ]);
    expect(block.chars).toEqual([0, 131]);
  });

  it('reads them back', () => {
    expect(readProduction(meta(stored(production)))?.pages).toEqual(production.pages);
  });

  it('writes none for a lock that has none', () => {
    const old = {
      ...production,
      pages: production.pages.map(({ label, line, printed }) => ({ label, line, printed })),
    };
    expect('chars' in stored(old)).toBe(false);
    expect(readProduction(meta(stored(old)))?.pages).toEqual(old.pages);
  });

  it('keeps a page with none beside pages that have one', () => {
    const mixed = {
      ...production,
      pages: [{ label: '1', line: 3, printed: 0 }, production.pages[1] as LockedPage],
    };
    expect(stored(mixed).chars).toEqual([null, 131]);
    expect(readProduction(meta(stored(mixed)))?.pages).toEqual(mixed.pages);
  });

  it('ignores characters that are wrong, and keeps the lock', () => {
    for (const chars of [[0], [0, -1], [0, 1.5], 'no', [0, 131, 4], [0, '131']]) {
      const read = readProduction(meta({ ...stored(production), chars }));
      expect(read?.pages, JSON.stringify(chars)).toEqual([
        { label: '1', line: 3, printed: 0 },
        { label: '2', line: 40, printed: 2 },
      ]);
    }
  });
});
