import { type Doc, type DrafterMeta, setMeta, type TextChange } from '@drafter/fountain';
import { SCENE_COLORS, type SceneColor } from './colors';
import { normalizeLabel } from './keyed';
import { hasStrayBoneyard } from './text';

// A script's threads (Threads design §7.2): each thread's name and color live in the metadata
// block as `"threads": { "a": { "name": "The heist", "color": "yellow" } }`, keyed by the
// label's `normalizeLabel`. Which scenes are in a thread is the scenes' own Thread notes.

/** What the writer has given a thread. A thread with neither has no entry. */
export interface ThreadMeta {
  name?: string;
  color?: SceneColor;
}

/** The longest a label, a name, and a scene's labels may be (design §7.2, plan constraints). */
export const THREAD_LIMITS = { label: 40, name: 80, perUnit: 12 } as const;

const isColor = (value: unknown): value is SceneColor =>
  typeof value === 'string' && (SCENE_COLORS as readonly string[]).includes(value);

const BREAK = /[\r\n\u2028\u2029]/u;

/** A label stays out of what splits a note's labels or closes the note, and out of line breaks. */
const clean = (label: string) =>
  !label.includes(',') && !label.includes('[[') && !label.includes(']]') && !BREAK.test(label);

/** Whether `label`, trimmed, can be a thread's label: 1 to 40 units, no `,` `[[` `]]` or line break. */
export function isThreadLabel(label: string): boolean {
  const text = label.trim();
  return text.length > 0 && text.length <= THREAD_LIMITS.label && clean(text);
}

/** `name` cut to the name limit without splitting a surrogate pair. */
function cutName(name: string): string {
  if (name.length <= THREAD_LIMITS.name) return name;
  const end = name.charCodeAt(THREAD_LIMITS.name - 1);
  return name.slice(
    0,
    end >= 0xd800 && end <= 0xdbff ? THREAD_LIMITS.name - 1 : THREAD_LIMITS.name,
  );
}

function entryOf(value: unknown): ThreadMeta | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { name, color } = value as Record<string, unknown>;
  const out: ThreadMeta = {};
  const text = typeof name === 'string' ? cutName(name.replace(BREAK, ' ').trim()) : '';
  if (text !== '') out.name = text;
  // A color word typed by hand in any case is the color it names.
  const word = typeof color === 'string' ? color.trim().toLowerCase() : color;
  if (isColor(word)) out.color = word;
  return out.name === undefined && out.color === undefined ? null : out;
}

/**
 * The threads' names and colors in a raw `threads` map (as read from a file), by normalized label,
 * in its order. Junk is ignored, a name is cut to 80 units, and the object has no prototype, so a
 * thread called `__proto__` is ordinary.
 */
export function readThreadMetaMap(threads: unknown): Record<string, ThreadMeta> {
  const out: Record<string, ThreadMeta> = Object.create(null);
  if (typeof threads !== 'object' || threads === null || Array.isArray(threads)) return out;
  for (const [raw, value] of Object.entries(threads)) {
    const key = normalizeLabel(raw);
    if (key === '' || !clean(key) || Object.hasOwn(out, key)) continue;
    const entry = entryOf(value);
    if (entry)
      Object.defineProperty(out, key, {
        value: entry,
        enumerable: true,
        writable: true,
        configurable: true,
      });
  }
  return out;
}

/** The script's threads' names and colors, by normalized label, in the block's order. */
export function threadMeta(doc: Doc): Record<string, ThreadMeta> {
  return readThreadMetaMap(doc.meta?.threads);
}

/**
 * The block with its `threads` entry made `entries` (the key dropped when there are none), through
 * `setMeta`: one change, or [] when nothing changes or a `/*` is stray. The block's other keys stay.
 */
export function replaceThreadMeta(
  doc: Doc,
  entries: Iterable<readonly [string, ThreadMeta]>,
): TextChange[] {
  if (hasStrayBoneyard(doc)) return [];
  const threads: Record<string, ThreadMeta> = Object.create(null);
  let count = 0;
  for (const [key, value] of entries) {
    Object.defineProperty(threads, key, {
      value,
      enumerable: true,
      writable: true,
      configurable: true,
    });
    count++;
  }
  const rest: DrafterMeta = { ...doc.meta };
  delete rest.threads;
  const meta: DrafterMeta = count > 0 ? { ...rest, threads } : rest;
  return setMeta(doc, meta);
}

/**
 * Give thread `label` this name and color (`meta` is the whole entry), or take both away (null,
 * or neither given), in one change; [] when it is already so or a `/*` is stray. The block's other
 * entries are kept. A label that isn't one, a name over 80 units or with a line break, or a color
 * that isn't one of the nine throws a RangeError.
 */
export function setThreadMeta(doc: Doc, label: string, meta: ThreadMeta | null): TextChange[] {
  if (!isThreadLabel(label)) throw new RangeError(`“${label}” can't be a thread.`);
  const name = meta?.name?.trim() ?? '';
  if (name.length > THREAD_LIMITS.name || BREAK.test(name)) {
    throw new RangeError('A thread’s name is one line of 80 characters at most.');
  }
  if (meta?.color !== undefined && !isColor(meta.color)) {
    throw new RangeError(`“${meta.color}” isn't a color.`);
  }
  const entry: ThreadMeta = {};
  if (name !== '') entry.name = name;
  if (meta?.color !== undefined) entry.color = meta.color;
  const key = normalizeLabel(label);
  const map = new Map(Object.entries(threadMeta(doc)));
  if (entry.name === undefined && entry.color === undefined) map.delete(key);
  else map.set(key, entry);
  return replaceThreadMeta(doc, map);
}
