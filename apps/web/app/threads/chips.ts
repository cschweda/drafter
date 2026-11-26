import { normalizeLabel, SCENE_SWATCH } from '@drafter/notes';
import type { ThreadInfo } from '@drafter/outline';

// A thread chip's facts (threads design §7.6): what an outline row or a card shows for one thread.

export interface Chip {
  key: string;
  /** As the scene or passage has it. */
  label: string;
  name: string | null;
  /** The bar's color, or null before the thread's color is known. */
  swatch: string | null;
  /** "thread A, The heist", or "thread A" with no name. */
  accessibleName: string;
}

export const chipName = (label: string, name: string | null): string =>
  name ? `thread ${label}, ${name}` : `thread ${label}`;

/** A chip for each of `labels`, in order, named and colored from `info`. */
export function chipsOf(
  labels: readonly string[] | undefined,
  info: readonly ThreadInfo[],
): Chip[] {
  if (!labels || labels.length === 0) return [];
  const byKey = new Map(info.map((t) => [t.key, t]));
  return labels.map((label) => {
    const key = normalizeLabel(label);
    const found = byKey.get(key);
    const name = found?.name ?? null;
    return {
      key,
      label,
      name,
      swatch: found ? SCENE_SWATCH[found.color] : null,
      accessibleName: chipName(label, name),
    };
  });
}
