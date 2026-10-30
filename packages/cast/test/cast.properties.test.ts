import fc from 'fast-check';
import { describe, expect, test } from 'vitest';
import type { Cast, IsWord } from '../src';
import { anyScript } from './arbitraries';
import { type Built, build } from './scripts';

// The cast of generated scripts against what the scene index says, and against a slow count of
// its own: every speech in every unit, and every name found by a pattern of its own in the
// printed action of each scene.

/** "quorra" is the one word among the invented names. */
const pretend: IsWord = (name) => name.toLowerCase() === 'quorra';
const dictionary = fc.constantFrom<IsWord>(
  pretend,
  () => undefined,
  () => false,
);

const LETTER = "[\\p{L}\\p{M}\\p{N}'’-]";
const literal = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The spellings `name` counts in: capitals, or also capitalised and as typed when it isn't a word. */
function spellingsOf(name: string, word: boolean | undefined): string[] {
  const caps = name.toUpperCase();
  if (word !== false) return [caps];
  const capitalised = name
    .toLowerCase()
    .replace(/(^|[\s'’-])(\p{L})/gu, (_, before: string, l: string) => before + l.toUpperCase());
  return [...new Set([caps, capitalised, name])];
}

interface Reference {
  speeches: number;
  words: number;
  scenes: number[];
  speaksIn: number;
}

/** Each character's figures, counted slowly and separately from `castOf`. */
function reference({ doc, index }: Built, isWord: IsWord): Map<string, Reference> {
  const units = [
    ...(index.opening?.speeches ?? []),
    ...index.sections.flatMap((s) => s.speeches),
    ...index.scenes.flatMap((s) => s.speeches),
  ];
  const names = new Map<string, string>();
  for (const speech of [...units].sort((a, b) => a.block - b.block)) {
    if (!names.has(speech.name.toUpperCase())) names.set(speech.name.toUpperCase(), speech.name);
  }
  const all = [...names.values()];
  const out = new Map<string, Reference>();
  for (const [key, name] of names) {
    const mine = units.filter((s) => s.name.toUpperCase() === key);
    // A longer name that starts with this one, in the same spelling, takes the match.
    const longer = all.filter((other) => other.toUpperCase().startsWith(`${key} `));
    const patterns = spellingsOf(name, isWord(name)).map((spelling) => {
      const blocked = longer.flatMap((other) =>
        spellingsOf(other, isWord(other))
          .filter((s) => s.startsWith(`${spelling} `))
          .map((s) => `${literal(s.slice(spelling.length))}(?:['’][sS])?`),
      );
      const not = blocked.length ? `(?!(?:${blocked.join('|')})(?!${LETTER}))` : '';
      return new RegExp(`(?<!${LETTER})${literal(spelling)}(?:['’][sS])?(?!${LETTER})${not}`, 'u');
    });
    const scenes: number[] = [];
    let speaksIn = 0;
    index.scenes.forEach((scene, n) => {
      const speaks = scene.speeches.some((s) => s.name.toUpperCase() === key);
      if (speaks) speaksIn++;
      const next = index.items.find((item) => item.block > scene.block)?.block ?? doc.blocks.length;
      let named = false;
      for (let b = scene.block + 1; b < next && !named; b++) {
        const block = doc.blocks[b];
        if (block?.kind !== 'action') continue;
        const text = block.lines
          .filter((line) => !line.transparent)
          .map((line) => line.inline.map((r) => r.text).join(''))
          .join('\n');
        named = patterns.some((p) => p.test(text));
      }
      if (speaks || named) scenes.push(n);
    });
    out.set(key, {
      speeches: mine.length,
      words: mine.reduce((sum, s) => sum + s.words, 0),
      scenes,
      speaksIn,
    });
  }
  return out;
}

const totalWords = (cast: Cast) => [...cast.figures.values()].reduce((n, f) => n + f.words, 0);

describe('the cast of generated scripts', () => {
  test('shares add up to 100% when anyone speaks', () => {
    fc.assert(
      fc.property(anyScript, dictionary, (text, isWord) => {
        const { cast } = build(text, { isWord });
        const shares = [...cast.figures.values()].reduce((n, f) => n + f.share, 0);
        if (totalWords(cast) > 0) expect(shares).toBeCloseTo(1, 9);
        else expect(shares).toBe(0);
      }),
    );
  });

  test('a speaker is always present where they speak', () => {
    fc.assert(
      fc.property(anyScript, dictionary, (text, isWord) => {
        const { cast, index } = build(text, { isWord });
        index.scenes.forEach((scene, n) => {
          for (const speech of scene.speeches) {
            const at = cast.characters.findIndex((c) => c.key === speech.name.toUpperCase());
            const presence = cast.byScene[at]?.find((p) => p.scene === n);
            expect(presence?.speaking).toBe(true);
          }
        });
      }),
    );
  });

  test("screen time is never more than the script's length", () => {
    fc.assert(
      fc.property(anyScript, (text) => {
        const { cast, index } = build(text, { pages: true });
        const length = index.scenes.reduce((n, s) => n + (s.pages?.eighths ?? 0), 0);
        for (const f of cast.figures.values()) {
          if (f.screenEighths === null) continue;
          expect(f.screenEighths).toBeLessThanOrEqual(length);
          expect(f.screenEighths).toBeGreaterThanOrEqual(0);
        }
      }),
      { numRuns: 50 },
    );
  });

  test('figures equal a slow reference count', () => {
    fc.assert(
      fc.property(anyScript, dictionary, (text, isWord) => {
        const built = build(text, { isWord });
        const { cast } = built;
        const slow = reference(built, isWord);
        expect(cast.characters.map((c) => c.key).sort()).toEqual([...slow.keys()].sort());
        for (const [key, want] of slow) {
          const f = cast.figures.get(key);
          expect(f?.speeches, key).toBe(want.speeches);
          expect(f?.words, key).toBe(want.words);
          expect(f?.speaksIn, key).toBe(want.speaksIn);
          expect(
            f?.scenes.map((p) => p.scene),
            key,
          ).toEqual(want.scenes);
          // Shared scenes, from the slow scenes of each pair.
          for (const other of f?.sharedWith ?? []) {
            const theirs = new Set(slow.get(other.key)?.scenes);
            expect(other.scenes).toBe(want.scenes.filter((s) => theirs.has(s)).length);
          }
          const sharing = [...slow].filter(
            ([k, r]) => k !== key && r.scenes.some((s) => want.scenes.includes(s)),
          );
          expect(f?.sharedWith.length, key).toBe(sharing.length);
        }
      }),
    );
  });
});
