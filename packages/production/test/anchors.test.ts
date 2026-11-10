import { describe, expect, it } from 'vitest';
import { rebaseAnchors, resolveAnchors } from '../src/anchors';
import type { LockedPage } from '../src/types';

const base = ['a', 'b', 'c', 'd', 'e', 'f'].join('\n');
const pages: LockedPage[] = [
  { label: '1', line: 0, printed: 0 },
  { label: '2', line: 2, printed: 3 },
  { label: '3', line: 4, printed: 0 },
];
const starts = (text: string) => {
  const out = [0];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) out.push(i + 1);
  return out;
};
const ats = (r: { anchors: { at: number }[] }) => r.anchors.map((a) => a.at);

describe('page anchors', () => {
  it('maps unchanged anchors exactly', () => {
    const r = resolveAnchors(pages, base, base);
    expect(ats(r)).toEqual([0, 4, 8]);
    expect(r.anchors[1]).toEqual({ label: '2', at: 4, printed: 3 });
    expect(r.dropped).toEqual([]);
  });

  it('follows an edited anchor and a removed one', () => {
    const cur = ['new', 'a', 'b', 'C!', 'd', 'f'].join('\n');
    const r = resolveAnchors(pages, base, cur);
    // page 1 stays pinned to the start (Ruling 27); c edited -> line 3 (offset 8, printed kept);
    // e removed -> next survivor f (line 5, offset 13), printed 0
    expect(r.anchors).toEqual([
      { label: '1', at: 0, printed: 0 },
      { label: '2', at: 8, printed: 3 },
      { label: '3', at: 13, printed: 0 },
    ]);
  });

  it('drops anchors whose whole page was removed', () => {
    const cur = ['a', 'b', 'e', 'f'].join('\n');
    const r = resolveAnchors(pages, base, cur);
    expect(r.anchors.map((a) => a.label)).toEqual(['1', '2']);
    expect(r.anchors[1].at).toBe(4);
    expect(r.dropped).toEqual(['3']);
  });

  it('drops anchors that land at the end of the text', () => {
    const r = resolveAnchors(pages, base, 'a\nb');
    expect(ats(r)).toEqual([0]);
    expect(r.dropped).toEqual(['2', '3']);
  });

  it('keeps a fold across a rebase', () => {
    const p = [
      { label: '13', line: 0, printed: 0 },
      { label: '14', line: 2, printed: 0 },
      { label: '15', line: 4, printed: 0 },
    ];
    const cur = ['c', 'd', 'e', 'f'].join('\n');
    const rebased = rebaseAnchors(p, base, cur);
    expect(rebased.map((x) => x.label)).toEqual(['13', '14', '15']);
    expect(rebased[1]).toEqual({ label: '14', line: 0, printed: 0 });
    const r = resolveAnchors(rebased, cur, cur);
    expect(r.dropped).toEqual(['14']);
    expect(r.anchors[0]).toEqual({ label: '13', at: 0, printed: 0 });
    expect(r.anchors.map((a) => a.label)).toEqual(['13', '15']);
  });

  it('carries printed unclamped when an edited anchor line got shorter', () => {
    const r = resolveAnchors(
      [
        { label: '1', line: 0, printed: 0 },
        { label: '2', line: 1, printed: 5 },
      ],
      'a\nlong long line\nc',
      'a\nx\nc',
    );
    expect(r.anchors[1]).toEqual({ label: '2', at: 2, printed: 5 });
  });

  it('keeps pages that start further into the same line', () => {
    const long: LockedPage[] = [
      { label: '1', line: 0, printed: 0 },
      { label: '2', line: 1, printed: 0 },
      { label: '3', line: 1, printed: 40 },
      { label: '4', line: 1, printed: 40 },
    ];
    const r = resolveAnchors(long, base, base);
    expect(r.anchors.map((a) => [a.label, a.at, a.printed])).toEqual([
      ['1', 0, 0],
      ['2', 2, 0],
      ['3', 2, 40],
    ]);
    expect(r.dropped).toEqual(['4']);
  });

  it('pins page 1 to the start when text is added before it', () => {
    const p: LockedPage[] = [
      { label: '1', line: 2, printed: 1 },
      { label: '2', line: 4, printed: 0 },
    ];
    const cur = ['cold', 'open', 'a', 'b', 'c', 'd', 'e', 'f'].join('\n');
    const r = resolveAnchors(p, base, cur);
    expect(r.anchors).toEqual([
      { label: '1', at: 0, printed: 0 },
      { label: '2', at: starts(cur)[6], printed: 0 },
    ]);
    expect(r.dropped).toEqual([]);
    expect(rebaseAnchors(p, base, cur)[0]).toEqual({ label: '1', line: 4, printed: 1 });
  });

  it("folds page 2 into page 1 when page 1's text is all cut", () => {
    // A title page (lines 0-1), then page 1's body (lines 2-3), then page 2 from line 4.
    const old = ['Title: T', '', 'p1 a', 'p1 b', 'p2 a', 'p2 b', 'p3 a'].join('\n');
    const p: LockedPage[] = [
      { label: '1', line: 2, printed: 0 },
      { label: '2', line: 4, printed: 0 },
      { label: '3', line: 6, printed: 0 },
    ];
    const cur = ['Title: T', '', 'p2 a', 'p2 b', 'p3 a'].join('\n');
    const r = resolveAnchors(p, old, cur);
    expect(r.anchors.map((a) => a.label)).toEqual(['1', '3']);
    expect(r.anchors[0]).toEqual({ label: '1', at: 0, printed: 0 });
    expect(r.dropped).toEqual(['2']);
  });

  it('keeps page 2 when page 1 still has text before it', () => {
    const old = ['Title: T', '', 'p1 a', 'p1 b', 'p2 a', 'p3 a'].join('\n');
    const p: LockedPage[] = [
      { label: '1', line: 2, printed: 0 },
      { label: '2', line: 4, printed: 0 },
    ];
    const cur = ['Title: T', '', 'p1 b', 'p2 a', 'p3 a'].join('\n');
    expect(resolveAnchors(p, old, cur).dropped).toEqual([]);
  });

  it('rebase keeps labels', () => {
    const cur = ['new', 'a', 'b', 'C!', 'd', 'f'].join('\n');
    const direct = resolveAnchors(pages, base, cur);
    const rebased = rebaseAnchors(pages, base, cur);
    expect(rebased.map((p) => p.label)).toEqual(['1', '2', '3']);
    const again = resolveAnchors(rebased, cur, cur);
    expect(again.anchors).toEqual(direct.anchors);
  });
});
