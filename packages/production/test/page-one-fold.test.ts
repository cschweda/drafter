import { parse } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import { rebaseAnchors, resolveAnchors } from '../src/anchors';
import { lockedPagesOf } from '../src/layout';
import { pageMapOf } from '../src/pages';

const screenplay = builtins['us-screenplay'] as Template;
const TITLE = 'Title: Fold\nAuthor: Test\n\n';
const paras = (n: number, tag = 'P') =>
  Array.from(
    { length: n },
    (_, i) =>
      `${tag}${i + 1} ${'goes on and on and on and on and on and on and on and on and on and on and on and on. '.repeat(2)}`,
  ).join('\n\n');
const script = (title: boolean, tag = 'P') =>
  `${title ? TITLE : ''}INT. ROOM - DAY\n\n${paras(60, tag)}\n`;

const linesOf = (text: string) => text.split('\n');
/** Remove source lines [from, to). */
const cut = (text: string, from: number, to: number) => {
  const l = linesOf(text);
  l.splice(from, to - from);
  return l.join('\n');
};
const bodyLabels = (layout: ReturnType<typeof paginate>) =>
  layout.pages.filter((p) => p.number > 0).map((p) => p.label);

function lockAndCut(title: boolean) {
  const base = script(title);
  const pages = pageMapOf(paginate(parse(base), screenplay), base);
  const cur = cut(base, (pages[0] as { line: number }).line, (pages[1] as { line: number }).line);
  return { base, pages, cur };
}

function laidOut(pages: ReturnType<typeof pageMapOf>, base: string, cur: string) {
  const { dropped } = resolveAnchors(pages, base, cur);
  return {
    dropped,
    layout: paginate(parse(cur), screenplay, { locked: lockedPagesOf(pages, base, cur) }),
  };
}

describe('page 1 with all its text cut', () => {
  for (const title of [true, false]) {
    it(`folds page 2 into page 1 ${title ? 'with' : 'without'} a title page`, () => {
      const { base, pages, cur } = lockAndCut(title);
      expect(pages.length).toBeGreaterThan(3);
      const { dropped, layout } = laidOut(pages, base, cur);
      expect(dropped).toEqual(['2']);
      const got = bodyLabels(layout);
      expect(got.slice(0, 2)).toEqual(['1-2', '3']);
    });
  }

  it('still folds in the next revision, and a cold open still flows 1, 1A', () => {
    const base = script(true);
    const pages = pageMapOf(paginate(parse(base), screenplay), base);
    // Revision 2 starts from a slightly edited script: rebase, then cut page 1's body.
    const rev2 = base.replace('P30 ', 'P30 edited ');
    const rebased = rebaseAnchors(pages, base, rev2);
    const rp = pageMapOf(paginate(parse(rev2), screenplay), rev2);
    expect(rebased.length).toBe(pages.length);
    const cur = cut(rev2, (rp[0] as { line: number }).line, (rp[1] as { line: number }).line);
    const r = resolveAnchors(rebased, rev2, cur);
    expect(r.dropped).toEqual(['2']);
    expect(rp.length).toBeGreaterThan(3);
    // A cold open added after the title page, before page 1's old start.
    const cold = rev2.replace(
      'INT. ROOM - DAY',
      `EXT. ROOF - NIGHT\n\n${paras(60, 'C')}\n\nINT. ROOM - DAY`,
    );
    const { layout } = laidOut(rebased, rev2, cold);
    expect(bodyLabels(layout).slice(0, 3)).toEqual(['1', '1A', '1B']);
  });
});
