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

export type ManuscriptFont = 'times' | 'courier';

/** What the manuscript's title page and running header need, as the writer typed them. */
export interface ManuscriptDetails {
  title?: string;
  byline?: string;
  legalName?: string;
  contact?: string[];
  surname?: string;
  shortTitle?: string;
  font?: ManuscriptFont;
}

export interface NovelFacts {
  bookTarget?: number;
  manuscript?: ManuscriptDetails;
  /** Keyed by node id; made with `Object.create(null)`, so no key is special. */
  nodes: Record<string, Facts>;
}

/** The longest synopsis kept, in UTF-16 code units: a longer one is cut there when read or written. */
export const MAX_SYNOPSIS = 2000;
/** The longest manuscript field or contact line kept, in UTF-16 code units. */
export const MAX_DETAIL = 300;
/** The most contact lines kept. */
export const MAX_CONTACT_LINES = 10;
const MAX_TARGET = 10_000_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function target(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_TARGET
    ? value
    : undefined;
}

/** The text cut to `max` code units, never leaving half of a surrogate pair at the cut. */
function cut(value: string, max: number): string {
  let s = value.slice(0, max);
  const last = s.charCodeAt(s.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) s = s.slice(0, -1);
  return s;
}

const DETAIL_KEYS = ['title', 'byline', 'legalName', 'surname', 'shortTitle'] as const;

function manuscript(value: unknown): ManuscriptDetails | undefined {
  if (!isRecord(value)) return undefined;
  const out: ManuscriptDetails = {};
  for (const key of DETAIL_KEYS) {
    const v = value[key];
    if (typeof v === 'string' && v.trim() !== '') out[key] = cut(v, MAX_DETAIL);
  }
  if (Array.isArray(value.contact)) {
    const lines: string[] = [];
    for (const item of value.contact) {
      if (typeof item !== 'string') continue;
      for (const line of item.split(/\r\n|\r|\n/)) {
        const t = cut(line.trim(), MAX_DETAIL);
        if (t !== '') lines.push(t);
      }
    }
    if (lines.length > 0) out.contact = lines.slice(0, MAX_CONTACT_LINES);
  }
  if (value.font === 'times' || value.font === 'courier') out.font = value.font;
  return Object.keys(out).length > 0 ? out : undefined;
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
    facts.synopsis = cut(raw.synopsis, MAX_SYNOPSIS);
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
  const details = manuscript(novel.manuscript);
  if (details) out.manuscript = details;
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
  let meta: Record<string, unknown> | null = null;
  try {
    meta = readMarkdownMeta(text).meta;
  } catch {
    meta = null;
  }
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
  const details = manuscript(facts.manuscript);
  if (book === undefined && details === undefined && Object.keys(nodes).length === 0) {
    delete next.novel;
    if (meta === null) return text;
  } else {
    const novel: Record<string, unknown> = {};
    if (book !== undefined) novel.bookTarget = book;
    novel.nodes = nodes;
    if (details) novel.manuscript = details;
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
  mapPos: (pos: number, assoc?: number) => number,
): NovelFacts {
  const byPos = new Map<number, string>();
  walk(after.nodes, (n) => byPos.set(n.heading.from, n.id));
  const out: NovelFacts = { nodes: newNodes() };
  if (facts.bookTarget !== undefined) out.bookTarget = facts.bookTarget;
  if (facts.manuscript) out.manuscript = facts.manuscript;
  const orphans: string[] = [];
  for (const id of Object.keys(facts.nodes)) {
    const node = findNode(before, id);
    if (!node) {
      orphans.push(id);
      continue;
    }
    // assoc 1: text typed at the heading's start goes before it, and the heading keeps its facts.
    const at = mapPos(node.heading.from, 1);
    // A deleted heading collapses to a point, which the next heading may stand on: its end maps no further.
    if (mapPos(node.heading.to) <= at) continue;
    const newId = byPos.get(at);
    if (newId !== undefined) out.nodes[newId] = { ...facts.nodes[id] };
  }
  // A carried fact wins over an orphan that happens to share its id.
  for (const id of orphans) if (!(id in out.nodes)) out.nodes[id] = { ...facts.nodes[id] };
  return out;
}

/** The ids that have facts but no node: a heading renamed outside the app. */
export function orphanedFacts(facts: NovelFacts, tree: NovelTree): string[] {
  const ids = new Set<string>();
  walk(tree.nodes, (n) => ids.add(n.id));
  return Object.keys(facts.nodes).filter((id) => !ids.has(id));
}
