import { describe, expect, it } from 'vitest';
import { rebaseAnchors, resolveAnchors } from '../src/anchors';
import type { LockedPage } from '../src/types';

const base = ['a', 'b', 'c', 'd', 'e', 'f'].join('\n');
const pages: LockedPage[] = [
  { label: '1', line: 0, printed: 0 },
  { label: '2', line: 2, printed: 3 },
  { label: '3', line: 4, printed: 0 },
];
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
    // a -> line 1 (offset 4); c edited -> line 3 (offset 8, printed kept); e removed -> next survivor f (line 5, offset 13), printed 0
    expect(r.anchors).toEqual([
      { label: '1', at: 4, printed: 0 },
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
      [{ label: '2', line: 1, printed: 5 }],
      'a\nlong long line\nc',
      'a\nx\nc',
    );
    expect(r.anchors).toEqual([{ label: '2', at: 2, printed: 5 }]);
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
