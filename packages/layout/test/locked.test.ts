import { readFileSync } from 'node:fs';
import { parse } from '@drafter/fountain';
import { type Layout, type Page, paginate } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';
import { filler, text } from './helpers';

const screenplay = builtins['us-screenplay'] as Template;
const fixture = (name: string) =>
  readFileSync(new URL(`fixtures/locked/${name}.fountain`, import.meta.url), 'utf8');
const base = fixture('base');

interface Anchor {
  label: string;
  at: number;
  printed: number;
}

/**
 * Where each body page of `layout` starts, the way a lock records it: the start of the source line
 * of the page's first printed line, and how many printed lines from that source line came before.
 */
function anchorsOf(layout: Layout, source: string, label = (n: number) => String(n)): Anchor[] {
  const out: Anchor[] = [];
  const seen: Array<{ blockIndex: number; from: number }> = [];
  for (const page of layout.pages) {
    if (page.number === 0) continue;
    const first = page.lines.find((line) => line.blockIndex >= 0);
    if (first) {
      const at = source.lastIndexOf('\n', first.span.from - 1) + 1;
      const printed = seen.filter(
        (s) => s.blockIndex === first.blockIndex && s.from >= at && s.from < first.span.from,
      ).length;
      out.push({ label: label(page.number), at, printed });
    }
    for (const line of page.lines)
      if (line.blockIndex >= 0) seen.push({ blockIndex: line.blockIndex, from: line.span.from });
  }
  return out;
}

const body = (layout: Layout) => layout.pages.filter((page) => page.number > 0);
const labels = (layout: Layout) => body(layout).map((page) => page.label);
const texts = (page: Page | undefined) => (page?.lines ?? []).map(text);
const byLabel = (layout: Layout, label: string) => layout.pages.find((p) => p.label === label);

/** The base fixture laid out unlocked, with its pages labelled 11, 12, 13, …. */
const unlocked = paginate(parse(base), screenplay);
const baseAnchors = anchorsOf(unlocked, base, (n) => String(n + 10));
const anchorOf = (label: string) => baseAnchors.find((a) => a.label === label) as Anchor;

/** Anchors after inserting `length` characters at `at` (removing when negative). */
const shifted = (anchors: Anchor[], at: number, length: number) =>
  anchors.map((a) => (a.at >= at ? { ...a, at: a.at + length } : a));

describe('locked pagination', () => {
  it('needs a few pages to test against', () => {
    expect(body(unlocked).length).toBeGreaterThanOrEqual(6);
  });

  it('keeps every label when nothing changed', () => {
    const anchors = anchorsOf(unlocked, base);
    // Some page starts partway into a block, so `printed` is exercised.
    expect(
      anchors.some((a) => a.printed > 0) ||
        body(unlocked).some((p) => p.lines[0]?.synthetic === 'contd'),
    ).toBe(true);
    const locked = paginate(parse(base), screenplay, { locked: { anchors, folded: [] } });
    expect(locked).toEqual(unlocked);
    const relabelled = paginate(parse(base), screenplay, {
      locked: { anchors: baseAnchors, folded: [] },
    });
    expect(labels(relabelled)).toEqual(body(unlocked).map((p) => String(p.number + 10)));
    expect(body(relabelled).map((p) => p.lines)).toEqual(body(unlocked).map((p) => p.lines));
    expect(byLabel(relabelled, '13')?.pageNumber?.text).toBe('13.');
  });

  it('grows one page into 12A and 12B and leaves 13 where it was', () => {
    const at = anchorOf('13').at;
    const added = `${Array.from({ length: 40 }, (_, i) => `Added paragraph ${i + 1}.`).join('\n\n')}\n\n`;
    const source = base.slice(0, at) + added + base.slice(at);
    const anchors = shifted(baseAnchors, at, added.length);
    const layout = paginate(parse(source), screenplay, { locked: { anchors, folded: [] } });
    const expected = labels(unlocked).map((n) => String(Number(n) + 10));
    expected.splice(expected.indexOf('13'), 0, '12A', '12B');
    expect(labels(layout)).toEqual(expected);
    expect(texts(byLabel(layout, '12'))[0]).toBe(texts(byLabel(unlocked, '2'))[0]);
    expect(texts(byLabel(layout, '12B')).some((t) => t.includes('Added paragraph 40.'))).toBe(true);
    for (const label of ['13', '14', '15', '16'])
      expect(texts(byLabel(layout, label))).toEqual(
        texts(byLabel(unlocked, String(Number(label) - 10))),
      );
    expect(byLabel(layout, '12A')?.pageNumber?.text).toBe('12A.');
    expect(byLabel(layout, '12B')?.number).toBe((byLabel(layout, '12')?.number ?? 0) + 2);
  });

  it('a shrunk page ends short', () => {
    // Remove everything on page 12 after its first block.
    const start = anchorOf('12').at;
    const from = base.indexOf('\n\n', start) + 2;
    const to = anchorOf('13').at;
    const source = base.slice(0, from) + base.slice(to);
    const anchors = shifted(baseAnchors, to, from - to);
    const layout = paginate(parse(source), screenplay, { locked: { anchors, folded: [] } });
    expect(labels(layout)).toEqual(labels(unlocked).map((n) => String(Number(n) + 10)));
    const twelve = texts(byLabel(layout, '12'));
    expect(twelve.length).toBe(texts(byLabel(unlocked, '2')).length);
    expect(twelve.filter((t) => t !== '').length).toBeLessThan(
      texts(byLabel(unlocked, '2')).filter((t) => t !== '').length,
    );
    expect(twelve.slice(-10).every((t) => t === '')).toBe(true);
    // The cut speech was between two of BEN's, so his next cue gains a (CONT'D); the lines are the same.
    const plain = (page: Page | undefined) => texts(page).map((t) => t.replace(" (CONT'D)", ''));
    for (const label of ['13', '14', '15'])
      expect(plain(byLabel(layout, label))).toEqual(
        plain(byLabel(unlocked, String(Number(label) - 10))),
      );
  });

  it('folds pages whose anchors all vanished', () => {
    // Page 13's text is cut: its anchor lands where 14's was, so 13 is kept there and 14 drops.
    const from = anchorOf('13').at;
    const to = anchorOf('14').at;
    const source = base.slice(0, from) + base.slice(to);
    const anchors = shifted(
      baseAnchors.filter((a) => a.label !== '14'),
      to,
      from - to,
    ).map((a) => (a.label === '13' ? { ...a, at: from, printed: anchorOf('14').printed } : a));
    const layout = paginate(parse(source), screenplay, {
      locked: { anchors, folded: [{ into: '13', label: '14' }] },
    });
    const expected = labels(unlocked)
      .map((n) => String(Number(n) + 10))
      .filter((l) => l !== '14')
      .map((l) => (l === '13' ? '13-14' : l));
    expect(labels(layout)).toEqual(expected);
    expect(texts(byLabel(layout, '13-14'))).toEqual(texts(byLabel(unlocked, '4')));
    expect(texts(byLabel(layout, '15'))).toEqual(texts(byLabel(unlocked, '5')));
    expect(byLabel(layout, '13-14')?.pageNumber?.text).toBe('13-14.');
  });

  it('folds several labels into a range in label order', () => {
    const anchors = baseAnchors.filter((a) => a.label !== '15' && a.label !== '16');
    const layout = paginate(parse(base), screenplay, {
      locked: {
        anchors,
        folded: [
          { into: '14', label: '16' },
          { into: '14', label: '15' },
        ],
      },
    });
    expect(labels(layout)).toContain('14-16');
  });

  it('starts a locked page partway into a speech', () => {
    const source = fixture('speech');
    const dialogue = source.indexOf('I waited');
    const layout = paginate(parse(source), screenplay, {
      locked: {
        anchors: [
          { label: '1', at: 0, printed: 0 },
          { label: '2', at: dialogue, printed: 2 },
        ],
        folded: [],
      },
    });
    expect(labels(layout)).toEqual(['1', '2']);
    const [one, two] = body(layout).map(texts);
    const printed = (one ?? []).filter((t) => t !== '');
    expect(printed.at(-1)?.trim()).toBe('(MORE)');
    expect(printed.at(-2)?.trim().startsWith('I waited')).toBe(false);
    expect(printed.filter((t) => t.trim() === '(quietly)')).toHaveLength(1);
    // Two printed lines of the dialogue stay on page 1.
    const cue = printed.findIndex((t) => t.trim() === 'MARA');
    expect(printed.length - cue - 3).toBe(2);
    expect(two?.[0]?.trim()).toBe("MARA (CONT'D)");
    // `printed` past the block's lines is clamped to its last line.
    const clamped = paginate(parse(source), screenplay, {
      locked: { anchors: [{ label: '2', at: dialogue, printed: 99 }], folded: [] },
    });
    expect(body(clamped).map((p) => texts(p).filter((t) => t !== '').length)).toEqual([
      expect.any(Number),
      2,
    ]);
  });

  it('A-pages count on past Z', () => {
    const source = `INT. HALL - DAY\n\n${filler(54 * 28)}\n`;
    const layout = paginate(parse(source), screenplay, {
      locked: { anchors: [{ label: '7', at: 0, printed: 0 }], folded: [] },
    });
    const got = labels(layout);
    expect(got.slice(0, 3)).toEqual(['7', '7A', '7B']);
    expect(got).toContain('7Z');
    expect(got[got.indexOf('7Z') + 1]).toBe('7AA');
    expect(body(layout).map((p) => p.number)).toEqual(got.map((_, i) => i + 1));
  });
});
