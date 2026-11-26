import { type Doc, parse, type TextChange } from '@drafter/fountain';
import {
  hasStrayBoneyard,
  isThreadLabel,
  normalizeLabel,
  replaceThreadMeta,
  SCENE_COLORS,
  type SceneColor,
  THREAD_LIMITS,
  type ThreadMeta,
  threadMeta,
} from '@drafter/notes';
import { setSceneThreadNotes } from './header';
import type { Scene, SceneIndex } from './types';

// A script's threads (Threads design §7.2, §7.4): which are in use, their names and colors, and
// tagging, renaming, and removing them. Every function returns one set of changes in the text's
// own offsets that never overlap, so the editor takes them as one transaction (one undo).

/** One thread: `label` as first typed, its name, the color shown, and the scenes it is in. */
export interface ThreadInfo {
  key: string;
  label: string;
  name: string | null;
  color: SceneColor;
  /** Whether the writer chose the color (it is in the file); otherwise it is only shown. */
  chosen: boolean;
  /** The scenes it is tagged on. */
  units: number;
}

/**
 * Every thread in use, by first appearance, then those that are only named or colored. A chosen
 * color is the thread's own; the rest are handed out in order from the colors nobody chose, so
 * nothing is written until the writer picks one.
 */
export function threadInfo(doc: Doc, index: SceneIndex): ThreadInfo[] {
  const meta = threadMeta(doc);
  const found = new Map<string, { label: string; units: number }>();
  for (const scene of index.scenes) {
    for (const label of scene.threads) {
      const key = normalizeLabel(label);
      const seen = found.get(key);
      if (seen) seen.units++;
      else found.set(key, { label, units: 1 });
    }
  }
  for (const key of Object.keys(meta)) {
    if (!found.has(key)) found.set(key, { label: key, units: 0 });
  }
  const taken = new Set<SceneColor>();
  for (const entry of Object.values(meta)) if (entry.color) taken.add(entry.color);
  const free = SCENE_COLORS.filter((c) => !taken.has(c));
  const palette = free.length > 0 ? free : SCENE_COLORS;
  let next = 0;
  const out: ThreadInfo[] = [];
  for (const [key, { label, units }] of found) {
    const entry = meta[key];
    const chosen = entry?.color !== undefined;
    const color = entry?.color ?? (palette[next++ % palette.length] as SceneColor);
    out.push({ key, label, name: entry?.name ?? null, color, chosen, units });
  }
  return out;
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
    throw new RangeError(`A scene can be in ${THREAD_LIMITS.perUnit} threads at most.`);
  }
  return out;
}

/**
 * Put the scene in exactly these threads: its Thread and Storyline notes in the header become one
 * `[[Thread: …]]` note, or none when `labels` is empty. A label that isn't one, or more than 12,
 * throws a RangeError. [] when nothing changes or a `/*` is stray.
 */
export function setSceneThreads(doc: Doc, scene: Scene, labels: readonly string[]): TextChange[] {
  return setSceneThreadNotes(doc, scene, checked(labels).join(', '));
}

/**
 * The same changes as `setSceneThreads`, worked out on the scene's own text so that many scenes
 * cost the size of the script once, not once each. The scene starts at its heading.
 */
function inScene(doc: Doc, scene: Scene, labels: readonly string[]): TextChange[] {
  const text = doc.source.slice(scene.span.from, scene.span.to);
  const local: Scene = { ...scene, block: 0, span: { from: 0, to: text.length } };
  return setSceneThreadNotes(parse(text), local, labels.join(', ')).map((c) => ({
    from: c.from + scene.span.from,
    to: c.to + scene.span.from,
    insert: c.insert,
  }));
}

/** The labels once each by `normalizeLabel`, as first typed; no checking of the labels. */
function distinct(labels: readonly string[]): string[] {
  const seen = new Set<string>();
  return labels.filter((l) => {
    const key = normalizeLabel(l);
    return !seen.has(key) && seen.add(key);
  });
}

/**
 * The scenes holding thread `key`, with their labels changed by `edit`, and the changes. Null when
 * a scene that has to change can't be written (a note it can't remove safely): nothing is half done.
 */
function retag(
  doc: Doc,
  index: SceneIndex,
  key: string,
  edit: (labels: readonly string[]) => string[],
): { changes: TextChange[]; scenes: number } | null {
  const changes: TextChange[] = [];
  let scenes = 0;
  for (const scene of index.scenes) {
    if (!scene.threads.some((l) => normalizeLabel(l) === key)) continue;
    scenes++;
    const labels = edit(scene.threads);
    const made = inScene(doc, scene, labels);
    const same =
      labels.length === scene.threads.length && labels.every((l, i) => l === scene.threads[i]);
    if (made.length === 0 && !same) return null;
    changes.push(...made);
  }
  return { changes, scenes };
}

/**
 * Rename thread `from` to `to` everywhere: every scene's note, and the name and color with it, as
 * one set of changes. `to` as typed becomes the label. Renaming onto another existing thread
 * merges them (`merged`): each scene has it once, and the target's name and color stay while the
 * source's go. A different case of the same label is a rename, not a merge. A `to` that isn't a
 * label throws a RangeError; a `/*` stray gives no changes.
 */
export function renameThread(
  doc: Doc,
  index: SceneIndex,
  from: string,
  to: string,
): { changes: TextChange[]; scenes: number; merged: boolean } {
  if (!isThreadLabel(to)) throw new RangeError(`“${to}” can't be a thread.`);
  const label = to.trim();
  const fromKey = normalizeLabel(from);
  const toKey = normalizeLabel(label);
  if (hasStrayBoneyard(doc)) return { changes: [], scenes: 0, merged: false };
  const meta = threadMeta(doc);
  const inUse = index.scenes.some((s) => s.threads.some((l) => normalizeLabel(l) === toKey));
  const merged = fromKey !== toKey && (inUse || toKey in meta);
  const done = retag(doc, index, fromKey, (labels) =>
    distinct(labels.map((l) => (normalizeLabel(l) === fromKey ? label : l))),
  );
  if (!done) return { changes: [], scenes: 0, merged: false };
  const { changes, scenes } = done;
  if (fromKey !== toKey && fromKey in meta) {
    const entries = new Map<string, ThreadMeta>();
    for (const [key, value] of Object.entries(meta)) {
      if (key === fromKey) {
        if (!merged) entries.set(toKey, value);
      } else entries.set(key, value);
    }
    changes.push(...replaceThreadMeta(doc, entries));
  }
  return { changes, scenes, merged };
}

/** Take thread `label` out of every scene and out of the settings: one set of changes. */
export function removeThread(
  doc: Doc,
  index: SceneIndex,
  label: string,
): { changes: TextChange[]; scenes: number } {
  const key = normalizeLabel(label);
  if (hasStrayBoneyard(doc)) return { changes: [], scenes: 0 };
  const done = retag(doc, index, key, (labels) => labels.filter((l) => normalizeLabel(l) !== key));
  if (!done) return { changes: [], scenes: 0 };
  const { changes, scenes } = done;
  const meta = threadMeta(doc);
  if (key in meta) {
    const entries = Object.entries(meta).filter(([k]) => k !== key);
    changes.push(...replaceThreadMeta(doc, entries));
  }
  return { changes, scenes };
}
