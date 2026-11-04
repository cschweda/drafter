import { type Facts, type NovelNode, type NovelTree, STATUS_LABELS } from '@drafter/novel';

// What the novel's Outline says: words, targets, and each row's name. Words, chapters, and
// sections only: a novel's views never speak of scenes' headings or pages.

export const KIND_WORD = { part: 'part', chapter: 'chapter', section: 'section' } as const;

export const fmt = (n: number) => n.toLocaleString('en-US');

/** "1 word", "1,204 words". */
export const wordsLabel = (n: number) => `${fmt(n)} ${n === 1 ? 'word' : 'words'}`;

/** A heading's title, or "Scene break" for the untitled section a break starts. */
export const titleOf = (node: NovelNode) => node.title || 'Scene break';

/**
 * How far `words` is toward `target`, as a whole percentage rounded down, so it never says 100
 * before the target is reached. A writer past the target sees the real figure (104).
 */
export const percent = (words: number, target: number) => {
  const whole = Math.floor((words * 100) / target);
  return words < target ? Math.min(99, whole) : whole;
};

/** The width of a progress bar's fill, 0 to 100: it stops at full when the target is passed. */
export const fillPercent = (words: number, target: number) => Math.min(100, percent(words, target));

/** "62,140 of 90,000 words (69%)": the book's progress toward its target. */
export const bookLine = (words: number, target: number) =>
  `${fmt(words)} of ${fmt(target)} words (${percent(words, target)}%)`;

/** The most a target can be, as the package keeps it. */
export const MAX_TARGET = 10_000_000;

/**
 * A target as typed: a whole number of words from 1 to 10,000,000, or blank or 0 to take it away
 * (null). Anything else is a problem, said in words.
 */
export function parseTarget(text: string): { target: number | null } | { problem: string } {
  const typed = text.trim();
  if (typed === '') return { target: null };
  // Plain digits, or digits grouped in threes ("90,000"); nothing else.
  if (/^\d{1,3}(,\d{3})+$|^\d+$/.test(typed)) {
    const n = Number(typed.replaceAll(',', ''));
    if (n === 0) return { target: null };
    if (n <= MAX_TARGET) return { target: n };
  }
  return {
    problem: `Enter a whole number of words, from 1 to ${fmt(MAX_TARGET)}, or leave it empty to clear it.`,
  };
}

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
