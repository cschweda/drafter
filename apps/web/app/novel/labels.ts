import { type Facts, type NovelNode, type NovelTree, STATUS_LABELS } from '@drafter/novel';

// What the novel's Outline says: words, targets, and each row's name. Words, chapters, and
// sections only: a novel's views never speak of scenes' headings or pages.

export const KIND_WORD = { part: 'part', chapter: 'chapter', section: 'section' } as const;

export const fmt = (n: number) => n.toLocaleString('en-US');

/** "1 word", "1,204 words". */
export const wordsLabel = (n: number) => `${fmt(n)} ${n === 1 ? 'word' : 'words'}`;

/** A heading's title, or "Scene break" for the untitled section a break starts. */
export const titleOf = (node: NovelNode) => node.title || 'Scene break';

/** How far `words` is toward `target`, as a whole percentage no more than 100. */
export const percent = (words: number, target: number) =>
  Math.min(100, Math.round((words / target) * 100));

/** "45% of 1,200", for a row with a target. */
export const targetLine = (words: number, target: number) =>
  `${percent(words, target)}% of ${fmt(target)}`;

/** A row's name, one line of words: "The Salt Road, chapter, 512 words, 43% of a 1,200-word target, Revised". */
export function nodeName(node: NovelNode, facts: Facts): string {
  const parts = [titleOf(node), KIND_WORD[node.kind], wordsLabel(node.words)];
  if (facts.target) {
    parts.push(`${percent(node.words, facts.target)}% of a ${fmt(facts.target)}-word target`);
  }
  if (facts.status) parts.push(STATUS_LABELS[facts.status]);
  return parts.join(', ');
}

const count = (n: number, one: string) => `${fmt(n)} ${one}${n === 1 ? '' : 's'}`;

/** The Outline's slim bar: "3 chapters · 7 sections · 2,345 words · 4% of 60,000". */
export function novelSummary(tree: NovelTree | null, bookTarget: number | null): string {
  if (!tree) return '';
  let chapters = 0;
  let sections = 0;
  const walk = (list: NovelNode[]) => {
    for (const node of list) {
      if (node.kind === 'chapter') chapters++;
      if (node.kind === 'section') sections++;
      walk(node.children);
    }
  };
  walk(tree.nodes);
  const out = [count(chapters, 'chapter'), count(sections, 'section'), wordsLabel(tree.words)];
  if (bookTarget) out.push(targetLine(tree.words, bookTarget));
  return out.join(' · ');
}
