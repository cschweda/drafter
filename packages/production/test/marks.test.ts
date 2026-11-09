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
});
