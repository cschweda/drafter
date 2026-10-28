import { readFileSync } from 'node:fs';
import { type Doc, parse, type TextChange } from '@drafter/fountain';
import { paginate } from '@drafter/layout';
import { builtins, type Template } from '@drafter/templates';
import { type SceneIndex, sceneIndex } from '../src';

export const screenplay = builtins['us-screenplay'] as Template;
export const stagePlay = builtins['stage-play-standard'] as Template;

const sample = (name: string) =>
  readFileSync(new URL(`../../../samples/${name}`, import.meta.url), 'utf8');
export const SAMPLE_SCREENPLAY = sample('screenplay.fountain');
export const SAMPLE_STAGE_PLAY = sample('stage-play.fountain');

/** The parse, the template the script names, and its scene index (with pages when `pages`). */
export function indexOf(
  source: string,
  options: { template?: Template; pages?: boolean } = {},
): { doc: Doc; index: SceneIndex; template: Template } {
  const doc = parse(source);
  const template =
    options.template ?? (doc.meta?.template === 'stage-play-standard' ? stagePlay : screenplay);
  const layout = options.pages ? paginate(doc, template) : null;
  return { doc, template, index: sceneIndex(doc, template, layout) };
}

/** `source` with `changes` made; the changes are in its offsets, as an editor takes them. */
export function apply(source: string, changes: readonly TextChange[]): string {
  let out = source;
  for (const { from, to, insert } of [...changes].sort((a, b) => b.from - a.from || b.to - a.to)) {
    out = out.slice(0, from) + insert + out.slice(to);
  }
  return out;
}

/** The scenes' headings, in order. */
export const headings = (index: SceneIndex) => index.scenes.map((s) => s.heading);
