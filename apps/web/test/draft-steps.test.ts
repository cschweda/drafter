import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  type DraftStep,
  draftSteps,
  forgetSteps,
  stepCounts,
  stepLine,
  stepTitle,
} from '../app/drafts/steps';
import type { DraftRow } from '../app/drafts/store';
import { wordsIn } from '../app/markdown/words';

// Draft by draft (drafts-and-cuts design §2.4): the drafts in order, Draft 01 → 02 → 03 … up to
// now, each step with what changed in numbers: words, scenes or sections added, cut and changed,
// and the share of the text that is new.

const HALL =
  'INT. HALL - DAY\n\nMarra waits by the door, turning the brass key over in her hands while the clock ticks.\n';
const HALL_LONGER =
  'INT. HALL - DAY\n\nMarra waits by the door, turning the brass key over in her hands while the clock ticks.\n\nShe sighs.\n';
const CELLAR =
  'INT. CELLAR - NIGHT\n\nA lamp swings from a hook and the shelves of jars tilt with it, one by one.\n';
const YARD =
  'EXT. COAL YARD - DAWN\n\nTwo carts wait under a tarpaulin, their wheels chocked against the frost.\n';
const ROOF =
  'EXT. ROOF - NIGHT\n\nWind drags the washing lines across the wet slates and the gutters overflow.\n';
/** As many words as CELLAR, heading and all. */
const ATTIC =
  'INT. ATTIC - NIGHT\n\nWind drags the washing lines across the wet slates and the old gutters fill one by one.\n';
const script = (...scenes: string[]) => `Title: The Weir\n\n${scenes.join('\n')}`;

let made = 0;
function draft(n: number, extra: Partial<DraftRow> = {}): DraftRow {
  made++;
  return {
    key: `p:${n}`,
    projectId: 'p',
    n,
    id: `${String(n).padStart(2, '0')}${String(made).padStart(6, '0')}`.padEnd(64, 'a'),
    frozenAt: new Date(2026, 10, n, 10, 0).getTime(),
    note: '',
    words: 0,
    ...extra,
  };
}

beforeEach(() => forgetSteps());

describe('draftSteps', () => {
  test('a draft from another computer is no step: 01 → 02 → now only', async () => {
    const theirs = draft(2, { key: 'p:2:abcdef0123456789', outside: 'another-computer' });
    const rows = [draft(1), draft(2), theirs];
    const texts: Record<number, string> = { 1: script(HALL), 2: script(HALL, CELLAR) };
    const steps = await draftSteps(
      rows,
      async (n) => texts[n] as string,
      'fountain',
      script(HALL, CELLAR, YARD),
    );
    expect(steps.map(stepTitle)).toEqual(['Draft 01 → Draft 02', 'Draft 02 → now']);
    expect(steps.some((s) => s.from === theirs || s.to === theirs)).toBe(false);
  });

  test('steps are consecutive drafts then the last to now', async () => {
    const rows = [draft(3), draft(1), draft(2)];
    const texts: Record<number, string> = {
      1: script(HALL),
      2: script(HALL, CELLAR),
      3: script(HALL, CELLAR, YARD),
    };
    const steps = await draftSteps(
      rows,
      async (n) => texts[n] as string,
      'fountain',
      script(HALL, CELLAR, YARD, ROOF),
    );
    expect(steps.map((s) => [s.from.n, s.to === 'now' ? 'now' : s.to.n])).toEqual([
      [1, 2],
      [2, 3],
      [3, 'now'],
    ]);
    expect(steps.map((s) => s.added)).toEqual([1, 1, 1]);
  });

  test('no drafts, no steps; one draft, one step to now', async () => {
    expect(await draftSteps([], async () => '', 'fountain', script(HALL))).toEqual([]);
    const one = await draftSteps([draft(1)], async () => script(HALL), 'fountain', script(HALL));
    expect(one).toHaveLength(1);
    expect(one[0]?.to).toBe('now');
    expect(one[0]).toMatchObject({ words: 0, added: 0, cut: 0, changed: 0, newShare: 0 });
  });

  test('counts added, cut, and changed scenes', () => {
    const before = script(HALL, CELLAR, YARD);
    const after = script(HALL_LONGER, YARD, ROOF);
    const counts = stepCounts(before, after, 'fountain');
    expect(counts).toMatchObject({ added: 1, cut: 1, changed: 1, pages: null });
    expect(counts.words).toBe(wordsIn(after) - wordsIn(before));
  });

  test('a passage cut from a scene still there changes it, and is not a scene cut', () => {
    const counts = stepCounts(script(HALL_LONGER, YARD), script(HALL, YARD), 'fountain');
    expect(counts).toMatchObject({ added: 0, cut: 0, changed: 1 });
  });

  test('counts sections for a Markdown document', () => {
    const before = [
      '# The Weir',
      '',
      'An opening paragraph about the town and its river.',
      '',
      '## The flood',
      '',
      'The water came over the weir at night and nobody heard it until the bells rang.',
      '',
      '## The mill',
      '',
      'The mill stood empty for a year after the flood, its wheel locked with rust.',
      '',
      '### Notes',
      '',
      'Remember the miller’s daughter and the ledger she kept under the floor.',
      '',
    ].join('\n');
    const after = [
      '# The Weir',
      '',
      'An opening paragraph about the town and its river.',
      '',
      '## The flood',
      '',
      'The water came over the weir at night and nobody heard it until the bells rang out twice.',
      '',
      '## The bridge',
      '',
      'They built a new bridge downstream, wider, with iron rails painted green.',
      '',
      '### Notes',
      '',
      'Remember the miller’s daughter and the ledger she kept under the floor.',
      '',
    ].join('\n');
    expect(stepCounts(before, after, 'markdown')).toMatchObject({
      added: 1,
      cut: 1,
      changed: 1,
      pages: null,
    });
  });

  test('the share of new words', () => {
    // ATTIC and CELLAR have the same number of words, heading and all: half the text is new.
    expect(wordsIn(ATTIC)).toBe(wordsIn(CELLAR));
    expect(stepCounts(script(CELLAR), script(CELLAR, ATTIC), 'fountain').newShare).toBeCloseTo(
      0.5,
      5,
    );
    expect(stepCounts(script(CELLAR), script(CELLAR), 'fountain').newShare).toBe(0);
    expect(stepCounts(script(CELLAR), script(ATTIC), 'fountain').newShare).toBe(1);
    // A changed scene's words are new: none of it is in a unit kept as it was.
    const grown = stepCounts(script(HALL, CELLAR), script(HALL_LONGER, CELLAR), 'fountain');
    expect(grown.newShare).toBeGreaterThan(0.4);
    expect(grown.newShare).toBeLessThan(0.7);
  });

  test('cached by the pair of IDs', async () => {
    const one = draft(1);
    const two = draft(2);
    const texts: Record<number, string> = { 1: script(HALL), 2: script(HALL, CELLAR) };
    const read = vi.fn(async (n: number) => texts[n] as string);
    const count = vi.fn(async (b: string, a: string, k: 'fountain' | 'markdown') =>
      stepCounts(b, a, k),
    );
    const now = script(HALL, CELLAR, YARD);
    const first = await draftSteps([two, one], read, 'fountain', now, count);
    expect(count).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenCalledTimes(2);
    count.mockClear();
    read.mockClear();
    const again = await draftSteps([two, one], read, 'fountain', now, count);
    expect(count).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(again.map(numbers)).toEqual(first.map(numbers));
    // A new draft: only its pairs are counted.
    const three = draft(3);
    texts[3] = now;
    await draftSteps([three, two, one], read, 'fountain', script(HALL, CELLAR, YARD, ROOF), count);
    expect(count).toHaveBeenCalledTimes(2);
    // The text now changed: only the last step again.
    count.mockClear();
    await draftSteps([three, two, one], read, 'fountain', script(HALL, YARD, ROOF), count);
    expect(count).toHaveBeenCalledTimes(1);
  });
});

const numbers = (s: DraftStep) => [s.words, s.added, s.cut, s.changed, s.newShare];

describe('the words of a step', () => {
  const step = (extra: Partial<DraftStep>): DraftStep => ({
    from: draft(2),
    to: draft(3),
    words: 1240,
    pages: null,
    added: 3,
    cut: 2,
    changed: 5,
    newShare: 0.18,
    ...extra,
  });

  test('says the numbers in words', () => {
    expect(stepLine(step({}), 'fountain')).toBe(
      '+1,240 words · 3 scenes added · 2 scenes cut · 5 changed · 18% new',
    );
    expect(stepLine(step({ words: -35, added: 1, cut: 0, changed: 1 }), 'markdown')).toBe(
      '−35 words · 1 section added · 0 sections cut · 1 changed · 18% new',
    );
    expect(stepLine(step({ cut: 1 }), 'fountain')).toContain(' · 1 scene cut · ');
    expect(stepLine(step({ newShare: 0.001 }), 'fountain')).toContain('under 1% new');
    expect(
      stepLine(step({ words: 0, added: 0, cut: 0, changed: 0, newShare: 0 }), 'fountain'),
    ).toBe('No changes');
  });

  test('names the step', () => {
    expect(stepTitle(step({}))).toBe('Draft 02 → Draft 03');
    expect(stepTitle(step({ to: 'now' }))).toBe('Draft 02 → now');
  });
});
