import type { NovelFacts, NovelNode, NovelTree } from '@drafter/novel';
import type { LaneUnit } from '@drafter/outline';

// A novel's passages as lane units, measured in words: the leaves of the structure (a chapter with
// no sections, a section), plus a chapter's own words before its first section when it has any.
// A part is no unit. A section with no threads of its own takes its chapter's, marked inherited.

/** The units of `tree`, in order, with the threads `facts` gives each passage. */
export function novelUnits(tree: NovelTree, facts: NovelFacts): LaneUnit[] {
  const units: LaneUnit[] = [];
  let at = 0;
  const threadsOf = (node: NovelNode): string[] => facts.nodes[node.id]?.threads ?? [];
  const push = (node: NovelNode, length: number, threads: string[], inherited: boolean) => {
    const title = node.title || 'Scene break';
    const unit: LaneUnit = { id: node.id, label: title, heading: title, from: at, length, threads };
    if (inherited) unit.inherited = true;
    units.push(unit);
    at += length;
  };
  const walk = (node: NovelNode, parent: NovelNode | null) => {
    if (node.kind === 'part') {
      for (const child of node.children) walk(child, node);
      return;
    }
    if (node.kind === 'chapter' && node.children.length > 0) {
      if (node.ownWords > 0) push(node, node.ownWords, threadsOf(node), false);
      for (const child of node.children) walk(child, node);
      return;
    }
    const own = threadsOf(node);
    const up = parent && parent.kind === 'chapter' ? threadsOf(parent) : [];
    const inherit = own.length === 0 && up.length > 0;
    push(node, node.words, inherit ? up : own, inherit);
  };
  for (const node of tree.nodes) walk(node, null);
  return units;
}
