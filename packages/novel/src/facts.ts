import { readMarkdownMeta, setMarkdownMeta } from '@drafter/markdown';
import { findNode, type NovelNode, type NovelTree } from './structure';

// What a novelist keeps beside each passage: a status, a synopsis, and a word target. They live in
// the document's trailing metadata comment under `novel`, next to the keys other features keep
// there. Reading never throws: the comment is just text a person may have edited.

export const STATUSES = ['todo', 'draft', 'revised', 'done'] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  todo: 'To do',
  draft: 'Draft',
  revised: 'Revised',
  done: 'Done',
};

export interface Facts {
  status?: Status;
  synopsis?: string;
  target?: number;
}

export interface NovelFacts {
  bookTarget?: number;
  /** Keyed by node id; made with `Object.create(null)`, so no key is special. */
  nodes: Record<string, Facts>;
}

const MAX_SYNOPSIS = 2000;
const MAX_TARGET = 10_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function target(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_TARGET
    ? value
    : undefined;
}

function newNodes(): Record<string, Facts> {
  return Object.create(null) as Record<string, Facts>;
}

function readOne(raw: unknown): Facts | null {
  if (!isRecord(raw)) return null;
  const facts: Facts = {};
  const status = raw.status;
  if (typeof status === 'string' && (STATUSES as readonly string[]).includes(status)) {
    facts.status = status as Status;
  }
  if (typeof raw.synopsis === 'string' && raw.synopsis !== '') {
    let s = raw.synopsis.slice(0, MAX_SYNOPSIS);
    // Do not leave half of a surrogate pair at the cut.
    const last = s.charCodeAt(s.length - 1);
    if (last >= 0xd800 && last <= 0xdbff) s = s.slice(0, -1);
    facts.synopsis = s;
  }
  const t = target(raw.target);
  if (t !== undefined) facts.target = t;
  return Object.keys(facts).length > 0 ? facts : null;
}

/** The facts kept in a document's metadata comment; empty when there are none or they are unreadable. */
export function readFacts(text: string): NovelFacts {
  const out: NovelFacts = { nodes: newNodes() };
  let novel: unknown;
  try {
    novel = readMarkdownMeta(text).meta?.novel;
  } catch {
    return out;
  }
  if (!isRecord(novel)) return out;
  const bookTarget = target(novel.bookTarget);
  if (bookTarget !== undefined) out.bookTarget = bookTarget;
  if (isRecord(novel.nodes)) {
    for (const id of Object.keys(novel.nodes)) {
      const facts = readOne(novel.nodes[id]);
      if (facts) out.nodes[id] = facts;
    }
  }
  return out;
}

/** The text with these facts as `novel` in its metadata comment; every other key stays. */
export function writeFacts(text: string, facts: NovelFacts): string {
  const { meta } = readMarkdownMeta(text);
  const next: Record<string, unknown> = { ...(meta ?? {}) };
  const nodes: Record<string, Facts> = {};
  for (const id of Object.keys(facts.nodes)) {
    const one = readOne(facts.nodes[id]);
    // Own, enumerable data property even for `__proto__`.
    if (one)
      Object.defineProperty(nodes, id, {
        value: one,
        enumerable: true,
        writable: true,
        configurable: true,
      });
  }
  const book = target(facts.bookTarget);
  if (book === undefined && Object.keys(nodes).length === 0) {
    delete next.novel;
    if (meta === null) return text;
  } else {
    const novel: Record<string, unknown> = {};
    if (book !== undefined) novel.bookTarget = book;
    novel.nodes = nodes;
    next.novel = novel;
  }
  return setMarkdownMeta(text, next);
}

function walk(list: NovelNode[], visit: (node: NovelNode) => void): void {
  for (const node of list) {
    visit(node);
    walk(node.children, visit);
  }
}

/**
 * Facts after an edit. Ids can renumber on a move or an insert, so each fact follows its heading:
 * the old heading's start, mapped through the edit, is the new node's start. A fact whose heading
 * is gone is dropped; one whose id was already absent from `before` (an orphan) is kept as it is.
 */
export function carryFacts(
  facts: NovelFacts,
  before: NovelTree,
  after: NovelTree,
  mapPos: (pos: number) => number,
): NovelFacts {
  const byPos = new Map<number, string>();
  walk(after.nodes, (n) => byPos.set(n.heading.from, n.id));
  const out: NovelFacts = { nodes: newNodes() };
  if (facts.bookTarget !== undefined) out.bookTarget = facts.bookTarget;
  for (const id of Object.keys(facts.nodes)) {
    const node = findNode(before, id);
    if (!node) {
      out.nodes[id] = facts.nodes[id];
      continue;
    }
    const at = mapPos(node.heading.from);
    // A deleted heading collapses to a point, which the next heading may stand on: its end maps no further.
    if (mapPos(node.heading.to) <= at) continue;
    const newId = byPos.get(at);
    if (newId !== undefined) out.nodes[newId] = facts.nodes[id];
  }
  return out;
}

/** The ids that have facts but no node: a heading renamed outside the app. */
export function orphanedFacts(facts: NovelFacts, tree: NovelTree): string[] {
  const ids = new Set<string>();
  walk(tree.nodes, (n) => ids.add(n.id));
  return Object.keys(facts.nodes).filter((id) => !ids.has(id));
}
