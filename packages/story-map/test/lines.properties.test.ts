import { parse } from '@drafter/fountain';
import { sceneIndex } from '@drafter/outline';
import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import { pickQuotes, type QuoteCandidate, quoteCandidates } from '../src';
import { quoteKey } from '../src/lines';
import { screenplay } from './scripts';

// The spread's rules hold for any candidates (story-map design §3.1, Call 5).

const SPEAKERS = ['ADA', 'BEN', 'CY', 'DEE', 'EVE'];
const LINES = [
  'The kettle is still warm.',
  'Somebody has moved the ladder again.',
  'Is that the ferry or the wind?',
  'We could leave the nets until the weather turns and nobody would mind.',
  'Well, that is that.',
  'Go.',
];

/** A screenplay of `scenes`, each with its speeches: who, which line, and a mark. */
const scripts = fc
  .array(
    fc.array(
      fc.record({
        who: fc.constantFrom(...SPEAKERS),
        line: fc.constantFrom(...LINES),
        mark: fc.constantFrom('', ' [[Quote]]', ' [[No quote]]', '', ''),
        dual: fc.boolean(),
      }),
      { maxLength: 3 },
    ),
    { minLength: 1, maxLength: 60 },
  )
  .map((scenes) =>
    scenes
      .map((speeches, s) =>
        [
          `${s % 9 === 0 ? `# Act ${s / 9 + 1}\n\n` : ''}INT. ROOM ${s + 1} - DAY`,
          '',
          ...speeches.map(
            (sp, i) => `${sp.who}${sp.dual && i > 0 ? ' ^' : ''}\n${sp.line}${sp.mark}\n`,
          ),
        ].join('\n'),
      )
      .join('\n'),
  );

function check(
  list: readonly QuoteCandidate[],
  scenes: number,
  actOf: (s: number) => number | null,
) {
  const picks = pickQuotes(list, scenes, actOf);
  // Deterministic.
  expect(pickQuotes(list, scenes, actOf)).toEqual(picks);
  expect(picks.length).toBeLessThanOrEqual(12);
  // Never a line marked No quote; one a scene.
  expect(picks.every((p) => p.marked !== 'no-quote')).toBe(true);
  expect(new Set(picks.map((p) => p.scene)).size).toBe(picks.length);
  // In script order.
  expect(picks.map((p) => p.scene)).toEqual([...picks.map((p) => p.scene)].sort((a, b) => a - b));
  // No words twice: a refrain is picked once.
  expect(new Set(picks.map((p) => quoteKey(p.text))).size).toBe(picks.length);
  // Every first wanted line in a scene is in, when there are twelve or fewer (a repeat of words
  // already wanted aside).
  const wanted = new Map<number, QuoteCandidate>();
  const words = new Set<string>();
  for (const c of list) {
    if (c.marked !== 'quote' || wanted.has(c.scene) || words.has(quoteKey(c.text))) continue;
    wanted.set(c.scene, c);
    words.add(quoteKey(c.text));
  }
  if (wanted.size <= 12) for (const c of wanted.values()) expect(picks).toContain(c);
  // The rest keep three scenes from every other pick, and three a speaker.
  const free = picks.filter((p) => p.marked !== 'quote');
  for (const p of free) {
    for (const q of picks)
      if (q !== p) expect(Math.abs(p.scene - q.scene)).toBeGreaterThanOrEqual(3);
  }
  const marked = (who: string) => picks.filter((p) => p.marked === 'quote' && p.character === who);
  for (const who of new Set(picks.map((p) => p.character))) {
    const count = picks.filter((p) => p.character === who).length;
    expect(count).toBeLessThanOrEqual(Math.max(3, marked(who).length));
  }
}

describe('the spread, for any script', () => {
  test('picks are deterministic and keep every rule', () => {
    fc.assert(
      fc.property(scripts, (source) => {
        const doc = parse(source);
        const index = sceneIndex(doc, screenplay);
        const list = quoteCandidates(doc, index);
        for (const c of list) {
          const words = c.text.split(/\s+/).length;
          expect(words).toBeGreaterThanOrEqual(3);
          expect(words).toBeLessThanOrEqual(18);
          expect(c.text.length).toBeLessThanOrEqual(c.marked === 'quote' ? 160 : 110);
        }
        check(list, index.scenes.length, (s) => Math.floor(s / 9) + 1);
      }),
      { numRuns: 150 },
    );
  });

  test('the rules hold for made-up candidates too', () => {
    const lists = fc
      .array(
        fc.record({
          scene: fc.integer({ min: 0, max: 99 }),
          character: fc.constantFrom(...SPEAKERS),
          marked: fc.constantFrom<QuoteCandidate['marked']>(null, null, null, 'quote', 'no-quote'),
          score: fc.constantFrom(1, 3, 5),
        }),
        { maxLength: 120 },
      )
      .map((raw) =>
        raw
          .sort((a, b) => a.scene - b.scene)
          .map((r, i) => ({ ...r, cue: i, text: `Line ${i} is here.` })),
      );
    fc.assert(
      fc.property(lists, fc.integer({ min: 1, max: 4 }), (list, acts) => {
        check(list, 100, (s) => Math.min(acts, Math.floor(s / (100 / acts)) + 1));
      }),
      { numRuns: 300 },
    );
  });
});
