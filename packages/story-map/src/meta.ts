// The script's own story-map choices in its metadata block (design §4.2, §6.1.4): `storyMap.hooks`
// (edited hooks, by character key) and `storyMap.plannedPages`. The file can be edited anywhere,
// so each value is read strictly and anything else is left out.

/** The longest edited hook kept, in UTF-16 units. */
const MOST_HOOK = 200;
/** The planned length's bounds, in pages. */
const FEWEST_PAGES = 1;
const MOST_PAGES = 999;

export interface StoryMapMeta {
  /** A number from 1 to 999, else null. */
  plannedPages: number | null;
  /** Each key's string of at most 200 characters; an object with no prototype. */
  hooks: Record<string, string>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The `storyMap` part of a parsed metadata block (`doc.meta`), read strictly. */
export function storyMapMeta(meta: unknown): StoryMapMeta {
  const hooks: Record<string, string> = Object.create(null);
  const part = isRecord(meta) ? meta.storyMap : undefined;
  if (!isRecord(part)) return { plannedPages: null, hooks };
  const pages = part.plannedPages;
  const plannedPages =
    typeof pages === 'number' && pages >= FEWEST_PAGES && pages <= MOST_PAGES ? pages : null;
  if (isRecord(part.hooks)) {
    for (const [key, hook] of Object.entries(part.hooks)) {
      if (typeof hook === 'string' && hook.length <= MOST_HOOK) hooks[key] = hook;
    }
  }
  return { plannedPages, hooks };
}
