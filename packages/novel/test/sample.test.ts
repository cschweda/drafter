import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { findNode, novelStructure, orphanedFacts, readFacts } from '../src';

// The sample novel (samples/novel.md) keeps facts by node id; the ids must be the ones the
// structure makes, or the sample would open with its facts left over.
const sample = readFileSync(new URL('../../../samples/novel.md', import.meta.url), 'utf8');

test('the sample novel has a part, three chapters, and facts that belong to them', () => {
  const tree = novelStructure(sample);
  expect(tree.parts).toBe(true);
  expect(tree.nodes[0]?.children.map((c) => c.kind)).toEqual(['chapter', 'chapter', 'chapter']);
  const facts = readFacts(sample);
  const ids = Object.keys(facts.nodes);
  expect(ids).toHaveLength(3);
  for (const id of ids) expect(findNode(tree, id)).toBeDefined();
  expect(orphanedFacts(facts, tree)).toEqual([]);
});
