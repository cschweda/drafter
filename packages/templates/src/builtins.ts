import stagePlayStandard from './builtins/stage-play-standard.json';
import usScreenplay from './builtins/us-screenplay.json';
import { load } from './load';
import type { Template } from './types';

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const loaded = [usScreenplay, stagePlayStandard].map((json) => deepFreeze(load(json, new Map())));

/** The built-in templates by id. Frozen: extend one rather than changing it. */
export const builtins: Readonly<Record<string, Template>> = Object.freeze(
  Object.fromEntries(loaded.map((template) => [template.id, template])),
);

export const builtinRegistry: ReadonlyMap<string, Template> = new Map(Object.entries(builtins));
