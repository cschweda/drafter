import { type PastSnapshot, type ScenePrint, scenePrints } from '../src';

/** Past versions, newest first, made from texts given oldest first, an hour apart. */
export function versions(texts: readonly string[]): {
  snapshots: PastSnapshot[];
  prints: Map<string, ScenePrint>;
} {
  const prints = new Map<string, ScenePrint>();
  const snapshots = texts.map((text, i) => {
    const scenes = scenePrints(text, (hash) => prints.has(hash));
    for (const print of scenes.prints) prints.set(print.hash, print);
    return { id: `s${i}`, at: (i + 1) * 3_600_000, slots: scenes.slots };
  });
  return { snapshots: snapshots.reverse(), prints };
}

/** The prints of the scenes in `text` now, in order. */
export function now(text: string): ScenePrint[] {
  const { slots, prints } = scenePrints(text);
  const byHash = new Map(prints.map((p) => [p.hash, p]));
  return slots.map((slot) => byHash.get(slot.hash) as ScenePrint);
}

/** The scenes in `text` now, with their spans, as Put back takes them. */
export function nowScenes(text: string): { print: ScenePrint; from: number; to: number }[] {
  const { slots, prints } = scenePrints(text);
  const byHash = new Map(prints.map((p) => [p.hash, p]));
  return slots.map((slot) => ({
    print: byHash.get(slot.hash) as ScenePrint,
    from: slot.from,
    to: slot.to,
  }));
}

/** The one print in `text`'s scenes whose heading is `heading`. */
export function printOf(text: string, heading: string): ScenePrint {
  const found = now(text).filter((p) => p.heading === heading);
  if (found.length !== 1) throw new Error(`${found.length} scenes headed ${heading}`);
  return found[0] as ScenePrint;
}

/** `source` with `changes` made, in its offsets. */
export function apply(
  source: string,
  changes: readonly { from: number; to: number; insert: string }[],
): string {
  let out = source;
  for (const { from, to, insert } of [...changes].sort((a, b) => b.from - a.from)) {
    out = out.slice(0, from) + insert + out.slice(to);
  }
  return out;
}
