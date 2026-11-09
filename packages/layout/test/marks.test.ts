import { parse } from '@drafter/fountain';
import { applyMarks, paginate } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import { describe, expect, it } from 'vitest';

const screenplay = builtins['us-screenplay'] as Template;
const source =
  'INT. ROOM - DAY\n\nOne two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two twenty-three twenty-four twenty-five twenty-six twenty-seven twenty-eight.\n\nBob leaves.\n';
const layout = paginate(parse(source), screenplay);
const rows = () => layout.pages.flatMap((p) => p.lines);
const none = { spans: [], gaps: [] };

describe('applyMarks', () => {
  it('marks only the printed lines a span meets', () => {
    const lines = rows().filter((l) => l.role === 'action' && l.span.to > l.span.from);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    const at = lines[1].span.from + 2;
    const out = applyMarks(layout, { spans: [{ from: at, to: at + 3, set: 'blue' }], gaps: [] });
    const marked = out.pages.flatMap((p) => p.lines).filter((l) => l.mark);
    expect(marked).toHaveLength(1);
    expect(marked[0].mark).toEqual({ set: 'blue' });
    expect(marked[0].span).toEqual(lines[1].span);
    expect(rows().some((l) => l.mark)).toBe(false);
  });

  it('does not mark a line a span only abuts', () => {
    const l = rows().find((x) => x.role === 'action' && x.span.to > x.span.from)!;
    const out = applyMarks(layout, {
      spans: [{ from: l.span.to, to: l.span.to + 1, set: 'x' }],
      gaps: [],
    });
    const first = out.pages
      .flatMap((p) => p.lines)
      .find((x) => x.span.from === l.span.from && x.span.to === l.span.to);
    expect(first?.mark).toBeUndefined();
  });

  it('a gap marks the next printed line', () => {
    const bob = source.indexOf('Bob');
    const out = applyMarks(layout, { spans: [], gaps: [{ at: bob - 1, set: 'pink' }] });
    const marked = out.pages.flatMap((p) => p.lines).filter((l) => l.mark);
    expect(marked).toHaveLength(1);
    expect(marked[0].span.from).toBe(bob);
  });

  it('a gap past the end marks the last printed line', () => {
    const out = applyMarks(layout, { spans: [], gaps: [{ at: source.length + 50, set: 'pink' }] });
    const marked = out.pages.flatMap((p) => p.lines).filter((l) => l.mark);
    expect(marked).toHaveLength(1);
    expect(marked[0].span.from).toBe(source.indexOf('Bob'));
  });

  it('does not mutate and shares unchanged pages', () => {
    const before = JSON.stringify(layout);
    const out = applyMarks(layout, none);
    expect(JSON.stringify(layout)).toBe(before);
    expect(out.pages[0]).toBe(layout.pages[0]);
  });
});
