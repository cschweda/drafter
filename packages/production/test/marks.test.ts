import { describe, expect, it } from 'vitest';
import { closeSet, productionMarks } from '../src/marks';
import type { ProductionSet } from '../src/types';

const blue: ProductionSet = { name: 'Blue', color: '#8fb4e8', date: '2026-11-12', draft: 'x' };

describe('productionMarks', () => {
  it('marks only the changed words', async () => {
    const current = 'Margaret waits by the window.';
    const m = await productionMarks({
      current,
      baseline: 'Margaret waits by the door.',
      open: 'Blue',
      closed: [],
    });
    expect(m.gaps).toEqual([]);
    expect(m.spans).toHaveLength(1);
    expect(current.slice(m.spans[0].from, m.spans[0].to)).toBe('window');
    expect(m.spans[0].set).toBe('Blue');
  });

  it('marks an added line whole', async () => {
    const current = 'One.\nTwo is new.\nThree.';
    const m = await productionMarks({
      current,
      baseline: 'One.\nThree.',
      open: 'Blue',
      closed: [],
    });
    expect(m.spans).toEqual([{ from: 5, to: 16, set: 'Blue' }]);
  });

  it('marks a removal on the next line', async () => {
    const current = 'One.\nThree.';
    const m = await productionMarks({
      current,
      baseline: 'One.\nTwo.\nThree.',
      open: 'Blue',
      closed: [],
    });
    expect(m.spans).toEqual([]);
    expect(m.gaps).toEqual([{ at: 5, set: 'Blue' }]);
  });

  it("a closed set's marks survive with no baseline draft", async () => {
    const baseline = 'One.\nThree.';
    const current = 'One.\nTwo is new.\nThree.';
    const closed = await closeSet(baseline, current, blue);
    expect(closed.lines).toHaveLength(1);
    const m = await productionMarks({
      current,
      baseline: current,
      open: 'Pink',
      closed: [closed],
    });
    expect(m.spans).toEqual([{ from: 5, to: 16, set: 'Blue' }]);
  });

  it('records a removal as a gap fingerprint', async () => {
    const closed = await closeSet('One.\nTwo.\nThree.', 'One.\nThree.', blue);
    expect(closed.gaps).toHaveLength(1);
    const m = await productionMarks({
      current: 'One.\nThree.',
      baseline: 'One.\nThree.',
      open: 'Pink',
      closed: [closed],
    });
    expect(m.gaps).toEqual([{ at: 5, set: 'Blue' }]);
  });

  it('the open set wins over a closed one', async () => {
    const baseline = 'One.\nThree.';
    const mid = 'One.\nTwo is new.\nThree.';
    const closed = await closeSet(baseline, mid, blue);
    const current = 'One.\nTwo is newer.\nThree.';
    const m = await productionMarks({ current, baseline: mid, open: 'Pink', closed: [closed] });
    expect(m.spans).toHaveLength(1);
    expect(m.spans[0].set).toBe('Pink');
    expect(current.slice(m.spans[0].from, m.spans[0].to)).toBe('newer');
  });

  it('marks a changed line whose edit only removed words', async () => {
    const baseline = 'INT. ROOM - DAY\n\nShe quietly closes the door.\n\nHe waits.';
    const current = 'INT. ROOM - DAY\n\nShe closes the door.\n\nHe waits.';
    const m = await productionMarks({ current, baseline, open: 'Blue', closed: [] });
    expect(m.spans.map((x) => current.slice(x.from, x.to))).toEqual(['She closes the door.']);
    const closed = await closeSet(baseline, current, blue);
    expect(closed.lines).toHaveLength(1);
    const later = await productionMarks({
      current,
      baseline: current,
      open: 'Pink',
      closed: [closed],
    });
    expect(later.spans.map((x) => [current.slice(x.from, x.to), x.set])).toEqual([
      ['She closes the door.', 'Blue'],
    ]);
  });

  it('reads CRLF text, with offsets into it', async () => {
    const baseline = 'One.\r\nThree.\r\n';
    const current = 'One.\r\nTwo is new.\r\nThree.\r\n';
    const m = await productionMarks({ current, baseline, open: 'Blue', closed: [] });
    expect(m.spans.map((x) => current.slice(x.from, x.to))).toEqual(['Two is new.']);
    const closed = await closeSet(baseline, current, blue);
    const later = await productionMarks({
      current,
      baseline: current,
      open: 'Pink',
      closed: [closed],
    });
    expect(later.spans.map((x) => current.slice(x.from, x.to))).toEqual(['Two is new.']);
  });

  it('tells repeated lines apart by their fingerprints across a close', async () => {
    // The second "CUT TO:" is the new one; only it is marked, before and after the close.
    const baseline = 'A.\n\nCUT TO:\n\nB.';
    const current = 'A.\n\nCUT TO:\n\nB.\n\nCUT TO:';
    const m = await productionMarks({ current, baseline, open: 'Blue', closed: [] });
    const second = current.lastIndexOf('CUT TO:');
    expect(m.spans.map((x) => x.from)).toContain(second);
    expect(m.spans.map((x) => x.from)).not.toContain(current.indexOf('CUT TO:'));
    const closed = await closeSet(baseline, current, blue);
    const later = await productionMarks({
      current,
      baseline: current,
      open: 'Pink',
      closed: [closed],
    });
    const marked = later.spans.filter((x) => current.slice(x.from, x.to) === 'CUT TO:');
    expect(marked.map((x) => x.from)).toEqual([second]);
  });

  it('pairs each line of a multi-line change with its own old line', async () => {
    const baseline = 'Keep.\nThe cat sat.\nThe dog ran.\nKeep too.';
    const current = 'Keep.\nThe cat stood.\nThe dog walked.\nKeep too.';
    const m = await productionMarks({ current, baseline, open: 'Blue', closed: [] });
    expect(m.spans.map((x) => current.slice(x.from, x.to))).toEqual(['stood', 'walked']);
    const closed = await closeSet(baseline, current, blue);
    expect(closed.lines).toHaveLength(2);
  });

  it('marks a removal at the end of the text, and leaves it out when closing', async () => {
    const baseline = 'One.\nTwo.\nThree.';
    const current = 'One.\nTwo.';
    const m = await productionMarks({ current, baseline, open: 'Blue', closed: [] });
    expect(m.gaps).toHaveLength(1);
    expect(m.gaps[0]?.set).toBe('Blue');
    expect(m.gaps[0]?.at).toBeGreaterThanOrEqual(current.indexOf('Two.'));
    const closed = await closeSet(baseline, current, blue);
    expect(closed.gaps).toEqual([]);
  });

  it('the newest of two closed sets wins a line both marked', async () => {
    const white = 'One.\nThree.';
    const first = 'One.\nTwo is new.\nThree.';
    const blueSet = await closeSet(white, first, blue);
    // Pink marks the same line again (it changed, then changed back) and adds one of its own.
    const second = 'One.\nTwo is new.\nThree.\nFour.';
    const pink = await closeSet(white, second, { ...blue, name: 'Pink', color: '#f4a6c0' });
    const m = await productionMarks({
      current: second,
      baseline: second,
      open: 'Yellow',
      closed: [blueSet, pink],
    });
    expect(m.spans.map((x) => [second.slice(x.from, x.to), x.set])).toEqual([
      ['Two is new.', 'Pink'],
      ['Four.', 'Pink'],
    ]);
    const reversed = await productionMarks({
      current: second,
      baseline: second,
      open: 'Yellow',
      closed: [pink, blueSet],
    });
    expect(reversed.spans.map((x) => x.set)).toEqual(['Blue', 'Pink']);
  });
});
