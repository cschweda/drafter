import { type NovelFacts, novelStructure } from '@drafter/novel';
import { describe, expect, test } from 'vitest';
import { novelUnits } from '../app/threads/novel-units';
import { MAX_GROWTH, SCALING_TIMEOUT, scaling } from './scaling';

const facts = (nodes: Record<string, string[]>): NovelFacts => {
  const out: NovelFacts = { nodes: Object.create(null) };
  for (const id of Object.keys(nodes)) out.nodes[id] = { threads: nodes[id] };
  return out;
};

const BOOK = `# Part One

# One

Some opening words here.

## A

Alpha words.

## B

Beta words.

# Two

Lonely chapter.
`;

describe('novelUnits', () => {
  test('leaf passages; a chapter with sections passes its threads down as inherited', () => {
    const tree = novelStructure(BOOK);
    const units = novelUnits(tree, facts({ 'chapter:one:0': ['Maya'], 'section:b:0': ['Sam'] }));
    expect(units.map((x) => [x.heading, x.threads, !!x.inherited])).toEqual([
      ['One', ['Maya'], false],
      ['A', ['Maya'], true],
      ['B', ['Sam'], false],
      ['Two', [], false],
    ]);
    expect(units.map((x) => x.heading)).not.toContain('Part One');
  });
  test('units run end to end in words', () => {
    const units = novelUnits(novelStructure(BOOK), facts({}));
    let at = 0;
    for (const x of units) {
      expect(x.from).toBe(at);
      at += x.length;
    }
  });
  test('a chapter with no words of its own before its first section has no opening unit', () => {
    const units = novelUnits(novelStructure('#\n\n## A\n\nWords.\n'), facts({}));
    expect(units.map((x) => x.heading)).toEqual(['A']);
  });
});

describe('novelUnits scale', () => {
  test(
    'novelUnits grows linearly',
    () => {
      const make = (words: number) => {
        let text = '';
        for (let c = 0; c < words / 1000; c++) {
          text += `# Chapter ${c}\n\n${'word '.repeat(100)}\n\n`;
          for (let s = 0; s < 9; s++) text += `## Sec ${s}\n\n${'word '.repeat(100)}\n\n`;
        }
        return novelStructure(text);
      };
      const { growth } = scaling(make, (tree) => novelUnits(tree, facts({})), 120_000);
      expect(growth).toBeLessThan(MAX_GROWTH);
    },
    SCALING_TIMEOUT,
  );
});
