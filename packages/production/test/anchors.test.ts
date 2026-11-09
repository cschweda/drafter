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

  it('maps to the end of the text when everything after was removed', () => {
    const r = resolveAnchors(pages, base, 'a\nb');
    expect(ats(r)).toEqual([0, 3]);
    expect(r.dropped).toEqual(['3']);
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
