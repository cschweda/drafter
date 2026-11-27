import { normalizeLabel } from '@drafter/notes';
import type { SceneIndex } from './types';

// The common shape every thread view draws (threads design §7.2): a script's scenes or a novel's
// passages as units end to end along one axis, each with the threads it is in. Pure, one pass.

export interface LaneUnit {
  id: string;
  /** The scene number (written or counted) or the passage's short title. */
  label: string;
  /** The full heading, as the strip shows it. */
  heading: string;
  /** Where it starts on the axis, in the lanes' unit. */
  from: number;
  /** Eighths of a page, or words. */
  length: number;
  /** Labels as first typed. */
  threads: string[];
  /** The threads came from the chapter above, not from the passage itself. */
  inherited?: boolean;
}

export interface Lanes {
  units: LaneUnit[];
  /** By first appearance; `key` is the label through `normalizeLabel`. */
  threads: { key: string; label: string }[];
  total: number;
  unit: 'pages' | 'words';
}

/** The lanes of `units`: its threads in order of first appearance, and the axis' total length. */
export function lanesOf(units: LaneUnit[], unit: Lanes['unit']): Lanes {
  const seen = new Set<string>();
  const threads: Lanes['threads'] = [];
  let total = 0;
  for (const u of units) {
    total += u.length;
    for (const label of u.threads) {
      const key = normalizeLabel(label);
      if (seen.has(key)) continue;
      seen.add(key);
      threads.push({ key, label });
    }
  }
  return { units, threads, total, unit };
}

/**
 * A script's scenes as units: measured in eighths of a page when `perPage` is a positive number and
 * every scene has pages, else in printed words (as `structureStrip` does), at least one each.
 */
export function scriptUnits(
  index: SceneIndex,
  perPage: number | null,
): { units: LaneUnit[]; unit: 'pages' | 'words' } {
  const { scenes } = index;
  const unit =
    perPage !== null && perPage > 0 && scenes.every((s) => s.pages !== null) ? 'pages' : 'words';
  let at = 0;
  const units = scenes.map((scene): LaneUnit => {
    const length = unit === 'pages' ? (scene.pages?.eighths ?? 0) : Math.max(1, scene.words);
    const from = at;
    at += length;
    const heading = `${scene.number ?? scene.ordinal} ${scene.heading || 'Untitled scene'}`;
    return {
      id: `scene:${scene.block}`,
      label: String(scene.number ?? scene.ordinal),
      heading,
      from,
      length,
      threads: scene.threads,
    };
  });
  return { units, unit };
}
