import { type Doc, type DrafterMeta, setMeta, type TextChange } from '@drafter/fountain';
import { SCENE_COLORS, type SceneColor } from './colors';
import { isTagWord } from './keyed';
import { hasStrayBoneyard } from './text';

// Note categories' colors (Phase 2 design §5.5, §8), kept in the metadata block as
// `"categories": { "continuity": "teal" }`. A category has a name before it has a color.

const isColor = (value: unknown): value is SceneColor =>
  typeof value === 'string' && (SCENE_COLORS as readonly string[]).includes(value);

/** The colors the writer has given categories, by lowercased name; anything else there is ignored. */
export function categoryColors(doc: Doc): Record<string, SceneColor> {
  const categories = doc.meta?.categories;
  const out: Record<string, SceneColor> = {};
  if (typeof categories !== 'object' || categories === null || Array.isArray(categories)) {
    return out;
  }
  for (const [name, color] of Object.entries(categories)) {
    if (isColor(color)) out[name.toLowerCase()] = color;
  }
  return out;
}

/**
 * Give category `name` a color, or take its color away (null), through `setMeta`: one change, or
 * [] when it is already so or a `/*` is stray. The block's other entries are kept. A name that
 * isn't a tag word throws a RangeError.
 */
export function setCategoryColor(doc: Doc, name: string, color: SceneColor | null): TextChange[] {
  const key = name.trim().toLowerCase();
  if (!isTagWord(key) || key === 'resolved') {
    throw new RangeError(`“${name}” can't be a category.`);
  }
  if (color !== null && !isColor(color)) throw new RangeError(`“${color}” isn't a color.`);
  if (hasStrayBoneyard(doc)) return [];
  const categories: Record<string, SceneColor> = { ...categoryColors(doc) };
  if (color === null) delete categories[key];
  else categories[key] = color;
  const { categories: _, ...rest } = doc.meta ?? {};
  const meta: DrafterMeta = Object.keys(categories).length > 0 ? { ...rest, categories } : rest;
  return setMeta(doc, meta);
}
