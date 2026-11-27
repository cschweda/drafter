import {
  isThreadLabel,
  normalizeLabel,
  readThreadMetaMap,
  THREAD_LIMITS,
  type ThreadMeta,
} from '@drafter/notes';
import { type Facts, type NovelFacts, newNodes, readOne } from './facts';

// A novel's threads (Threads design §7.2): which passages are in which threads, and each thread's
// name and color, kept in the facts as a script keeps them in its settings. Every edit returns new
// objects. Labels are identified by `normalizeLabel` and shown as first typed.

const BREAK = /[\r\n\u2028\u2029]/u;

function define<T>(target: Record<string, T>, key: string, value: T): void {
  // Own, enumerable data property even for `__proto__`.
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/** `facts` with node `id`'s facts made `node` (the node dropped when nothing is left). */
function withNode(facts: NovelFacts, id: string, node: Facts): NovelFacts {
  const nodes = newNodes();
  for (const key of Object.keys(facts.nodes)) {
    if (key === id) continue;
    define(nodes, key, facts.nodes[key] as Facts);
  }
  const one = readOne(node);
  if (one) define(nodes, id, one);
  return { ...facts, nodes };
}

/** `facts` with its thread map made `entries` (the map left out when there are none). */
function withMeta(facts: NovelFacts, entries: Iterable<readonly [string, ThreadMeta]>): NovelFacts {
  const map: Record<string, ThreadMeta> = Object.create(null);
  let count = 0;
  for (const [key, value] of entries) {
    define(map, key, value);
    count++;
  }
  const { threads: _old, ...rest } = facts;
  return count > 0 ? { ...rest, threads: map } : rest;
}

/** The labels, trimmed and checked, once each by `normalizeLabel` as first typed; at most 12. */
function checked(labels: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of labels) {
    if (!isThreadLabel(raw)) throw new RangeError(`“${raw}” can't be a thread.`);
    const label = raw.trim();
    const key = normalizeLabel(label);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  if (out.length > THREAD_LIMITS.perUnit) {
    throw new RangeError(`A passage can be in ${THREAD_LIMITS.perUnit} threads at most.`);
  }
  return out;
}

/**
 * Put passage `id` in exactly these threads (none removes them). A label that isn't one, or more
 * than 12, throws a RangeError; duplicates by case keep the first form.
 */
export function setPassageThreads(facts: NovelFacts, id: string, labels: string[]): NovelFacts {
  const threads = checked(labels);
  const { threads: _old, ...rest } = (
    Object.hasOwn(facts.nodes, id) ? facts.nodes[id] : {}
  ) as Facts;
  return withNode(facts, id, threads.length > 0 ? { ...rest, threads } : rest);
}

/** Every id: the facts' own passages, when no book says which are still in it. */
const everyId = () => true;

/**
 * Apply `edit` to the labels of every passage holding thread `key` that is in the book
 * (`inBook`); the count changed. Facts left behind by a heading that is gone stay as they are.
 */
function retag(
  facts: NovelFacts,
  key: string,
  edit: (labels: string[]) => string[],
  inBook: (id: string) => boolean,
): { facts: NovelFacts; passages: number } {
  let passages = 0;
  let out = facts;
  for (const id of Object.keys(facts.nodes)) {
    if (!inBook(id)) continue;
    const node = facts.nodes[id] as Facts;
    if (!node.threads?.some((l) => normalizeLabel(l) === key)) continue;
    passages++;
    const labels = edit(node.threads);
    const { threads: _old, ...rest } = node;
    out = withNode(out, id, labels.length > 0 ? { ...rest, threads: labels } : rest);
  }
  return { facts: out, passages };
}

/**
 * Rename thread `from` to `to` everywhere, with its name and color. `to` as typed becomes the
 * label. Onto another existing thread it merges (`merged`): each passage has it once, the target's
 * name and color stay and the source's go. A different case of the same label is a rename. A `to`
 * that isn't a label throws a RangeError. Only passages `inBook` says are still in the book are
 * changed and counted (every one the facts have, without it).
 */
export function renameNovelThread(
  facts: NovelFacts,
  from: string,
  to: string,
  inBook: (id: string) => boolean = everyId,
): { facts: NovelFacts; passages: number; merged: boolean } {
  if (!isThreadLabel(to)) throw new RangeError(`“${to}” can't be a thread.`);
  const label = to.trim();
  const fromKey = normalizeLabel(from);
  const toKey = normalizeLabel(label);
  const meta = readThreadMetaMap(facts.threads);
  const inUse = Object.keys(facts.nodes).some(
    (id) => inBook(id) && facts.nodes[id]?.threads?.some((l) => normalizeLabel(l) === toKey),
  );
  const merged = fromKey !== toKey && (inUse || toKey in meta);
  const done = retag(
    facts,
    fromKey,
    (labels) => {
      const seen = new Set<string>();
      return labels
        .map((l) => (normalizeLabel(l) === fromKey ? label : l))
        .filter((l) => {
          const k = normalizeLabel(l);
          return !seen.has(k) && seen.add(k);
        });
    },
    inBook,
  );
  let out = done.facts;
  if (fromKey !== toKey && fromKey in meta) {
    const entries = new Map<string, ThreadMeta>();
    for (const [key, value] of Object.entries(meta)) {
      if (key === fromKey) {
        if (!merged) entries.set(toKey, value);
      } else entries.set(key, value);
    }
    out = withMeta(out, entries);
  }
  return { facts: out, passages: done.passages, merged };
}

/**
 * Take thread `label` out of every passage `inBook` says is still in the book (every one the facts
 * have, without it) and out of the thread names and colors.
 */
export function removeNovelThread(
  facts: NovelFacts,
  label: string,
  inBook: (id: string) => boolean = everyId,
): { facts: NovelFacts; passages: number } {
  const key = normalizeLabel(label);
  const done = retag(
    facts,
    key,
    (labels) => labels.filter((l) => normalizeLabel(l) !== key),
    inBook,
  );
  const meta = readThreadMetaMap(done.facts.threads);
  if (!(key in meta)) return done;
  // An orphaned passage (not in the book) may still list the label: keep its name and color.
  const orphaned = Object.keys(done.facts.nodes).some(
    (id) => !inBook(id) && done.facts.nodes[id]?.threads?.some((l) => normalizeLabel(l) === key),
  );
  if (orphaned) return done;
  return {
    facts: withMeta(
      done.facts,
      Object.entries(meta).filter(([k]) => k !== key),
    ),
    passages: done.passages,
  };
}

/**
 * Give thread `label` this name and color (`meta` is the whole entry), or take both away (null,
 * or neither given). A label that isn't one, a name over 80 units or with a line break, or a color
 * that isn't one of the nine throws a RangeError.
 */
export function setNovelThreadMeta(
  facts: NovelFacts,
  label: string,
  meta: ThreadMeta | null,
): NovelFacts {
  if (!isThreadLabel(label)) throw new RangeError(`“${label}” can't be a thread.`);
  const name = meta?.name?.trim() ?? '';
  if (name.length > THREAD_LIMITS.name || BREAK.test(name)) {
    throw new RangeError('A thread’s name is one line of 80 characters at most.');
  }
  const key = normalizeLabel(label);
  const entries = new Map(Object.entries(readThreadMetaMap(facts.threads)));
  let entry: ThreadMeta | undefined;
  if (meta !== null) {
    // The notes reader is the one judge of a color; an unknown one reads as none.
    const read = readThreadMetaMap({
      [key]: { name: name === '' ? undefined : name, color: meta.color },
    })[key];
    if (meta.color !== undefined && read?.color !== meta.color) {
      throw new RangeError(`“${meta.color}” isn't a color.`);
    }
    entry = read;
  }
  if (entry) entries.set(key, entry);
  else entries.delete(key);
  return withMeta(facts, entries);
}
